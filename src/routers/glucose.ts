import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";

export const glucoseRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("glucose_readings").select("*").eq("user_id", ctx.userId)
        .order("logged_at", { ascending: false }).limit(input.limit);
      if (error) throw new Error(error.message);
      return (data || []).map((r: any) => ({ id: r.id, value: r.value, unit: r.unit, loggedAt: r.logged_at }));
    }),

  add: protectedProcedure
    .input(z.object({
      value: z.number(),
      unit: z.enum(["mmol","mgdl"]).default("mmol"),
      loggedAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabase.from("glucose_readings").insert({
        user_id: ctx.userId, value: input.value, unit: input.unit,
        logged_at: input.loggedAt ?? new Date().toISOString(),
      }).select().single();
      if (error) throw new Error(error.message);
      return { id: data.id };
    }),
});
