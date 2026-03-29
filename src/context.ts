import { inferAsyncReturnType } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { supabase } from "./supabase";

export async function createContext({ req }: CreateExpressContextOptions) {
  const authHeader = req.headers.authorization;
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data } = await supabase.auth.getUser(token);
    userId = data.user?.id ?? null;
  }

  // ── Dev bypass: when DEV_USER_ID is set, skip auth entirely ──
  // Remove this in production!
  if (!userId && process.env.DEV_USER_ID) {
    userId = process.env.DEV_USER_ID;
  }

  return { userId };
}

export type Context = inferAsyncReturnType<typeof createContext>;
