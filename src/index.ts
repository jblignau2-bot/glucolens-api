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
    const tables = ["profiles", "food_logs", "meal_plans", "shopping_lists", "reminders", "glucose_readings", "weight_entries"];
    const result: Record<string, any> = {};
    for (const table of tables) {
      const { data: rows, error: err } = await supabase.from(table).select("*").limit(1);
      if (err) {
        result[table] = { columns: [], error: err.message };
      } else if (rows && rows.length > 0) {
        result[table] = { columns: Object.keys(rows[0]) };
      } else {
        // Empty table — try a HEAD request to get column definitions
        result[table] = { columns: [], note: "table empty" };
      }
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
