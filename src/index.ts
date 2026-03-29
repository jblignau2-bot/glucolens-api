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

// Temp: verify meal_plans schema
app.get("/debug/meal-schema", async (_req, res) => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    // Try inserting/selecting to see column info
    const { data, error } = await sb.from("meal_plans").select("*").limit(1);
    const cols = data && data.length > 0 ? Object.keys(data[0]) : [];
    res.json({ ok: !error, cols, error: error?.message ?? null, sampleKeys: cols });
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});


app.listen(PORT, () => {
  console.log(`GlucoLens API running on port ${PORT}`);
});

export type AppRouter = typeof appRouter;
