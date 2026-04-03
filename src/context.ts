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

  return { userId };
}

export type Context = inferAsyncReturnType<typeof createContext>;
