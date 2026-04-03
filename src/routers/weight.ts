import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";

export const weightRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("weight_logs")
        .select("*")
        .eq("user_id", ctx.userId)
        .order("recorded_at", { ascending: false })
        .limit(input.limit);
      if (error) throw new Error(error.message);
      return (data || []).map((r: any) => ({
        id: r.id,
        valueKg: r.weight_kg,
        loggedAt: r.recorded_at,
      }));
    }),

  add: protectedProcedure
    .input(z.object({
      valueKg: z.number(),
      loggedAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("weight_logs")
        .insert({
          user_id: ctx.userId,
          weight_kg: input.valueKg,
          recorded_at: input.loggedAt ?? new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { id: data.id };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabase
        .from("weight_logs")
        .delete()
        .eq("id", input.id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),
});
