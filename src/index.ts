import "dotenv/config";
import express from "express";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./router";
import { createContext } from "./context";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "20mb" })); // allow large base64 images

// tRPC
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Health check
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Temporary schema check — REMOVE after audit
app.get("/debug/schema", async (_req, res) => {
  try {
    const { supabase } = await import("./supabase");
    // Columns each router tries to use
    const checks: Record<string, string[]> = {
      food_logs: ["id","user_id","meal_name","image_url","identified_foods_json","calories","total_sugar","total_carbs","glycemic_index","glycemic_load","protein","fat","fiber","rating_type1","rating_type2","reason_type1","reason_type2","why_risky_json","healthier_alternatives_json","foods_to_avoid_json","item_breakdown_json","logged_at","country","created_at","updated_at"],
      meal_plans: ["id","user_id","week_start_date","plan_json","dietary_restrictions","country","diabetes_type","created_at","updated_at"],
      shopping_lists: ["id","user_id","meal_plan_id","list_json","country","created_at","updated_at"],
      glucose_readings: ["id","user_id","value","unit","logged_at","created_at"],
      weight_entries: ["id","user_id","value_kg","logged_at","created_at"],
    };
    const result: Record<string, any> = {};
    // profiles and reminders have data — get them directly
    for (const table of ["profiles", "reminders"]) {
      const { data } = await supabase.from(table).select("*").limit(1);
      result[table] = { columns: data?.[0] ? Object.keys(data[0]) : [] };
    }
    // For empty tables, probe each column
    for (const [table, cols] of Object.entries(checks)) {
      const exists: string[] = [];
      const missing: string[] = [];
      for (const col of cols) {
        const { error } = await supabase.from(table).select(col).limit(0);
        if (error) missing.push(col);
        else exists.push(col);
      }
      result[table] = { exists, missing };
    }
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`GlucoLens API running on port ${PORT}`);
});

export type AppRouter = typeof appRouter;
