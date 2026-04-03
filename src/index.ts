import "dotenv/config";
import express from "express";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./router";
import { createContext } from "./context";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : "*", // fallback to open only if ALLOWED_ORIGINS not set
}));
app.use(express.json({ limit: "20mb" })); // allow large base64 images

// Simple per-user rate limiter for AI endpoints
const aiCallCounts = new Map<string, { count: number; resetAt: number }>();
const AI_RATE_LIMIT = 20; // max AI calls per minute per user
const AI_WINDOW_MS = 60_000;

app.use("/trpc", (req, res, next) => {
  // Only rate limit mutation endpoints (AI calls)
  if (req.method !== "POST") return next();
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();
  const key = authHeader.slice(-20); // last 20 chars of token as key
  const now = Date.now();
  const entry = aiCallCounts.get(key);
  if (!entry || now > entry.resetAt) {
    aiCallCounts.set(key, { count: 1, resetAt: now + AI_WINDOW_MS });
    return next();
  }
  if (entry.count >= AI_RATE_LIMIT) {
    return res.status(429).json({ error: { message: "Too many requests. Please wait a minute." } });
  }
  entry.count++;
  next();
});

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

app.listen(PORT, () => {
  console.log(`GlucoLens API running on port ${PORT}`);
});

export type AppRouter = typeof appRouter;
