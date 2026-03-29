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

// Temporary verify — REMOVE after confirming migration
app.get("/debug/verify", async (_req, res) => {
  try {
    const { supabase } = await import("./supabase");
    const cols = ["image_url","identified_foods_json","why_risky_json","healthier_alternatives_json","foods_to_avoid_json","item_breakdown_json"];
    const mealCols = ["week_start_date","dietary_restrictions"];
    const result: Record<string, any> = {};
    for (const col of cols) {
      const { error } = await supabase.from("food_logs").select(col).limit(0);
      result[`food_logs.${col}`] = error ? "MISSING" : "OK";
    }
    for (const col of mealCols) {
      const { error } = await supabase.from("meal_plans").select(col).limit(0);
      result[`meal_plans.${col}`] = error ? "MISSING" : "OK";
    }
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`GlucoLens API running on port ${PORT}`);
});

export type AppRouter = typeof appRouter;
