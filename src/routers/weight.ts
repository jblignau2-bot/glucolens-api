import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";

export const weightRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", ctx.userId)
        .order("logged_at", { ascending: false })
        .limit(input.limit);
      if (error) throw new Error(error.message);
      return (data || []).map((r: any) => ({
        id: r.id,
        valueKg: r.value_kg,
        weightKg: r.value_kg,
        loggedAt: r.logged_at,
      }));
    }),

  add: protectedProcedure
    .input(z.object({
      valueKg: z.number().optional(),
      weightKg: z.number().optional(),
      notes: z.string().optional(),
      loggedAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const valueKg = input.valueKg ?? input.weightKg;
      if (valueKg == null) throw new Error("Weight value is required");
      const { data, error } = await supabase
        .from("weight_entries")
        .insert({
          user_id: ctx.userId,
          value_kg: valueKg,
          logged_at: input.loggedAt ?? new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { id: data.id };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().or(z.number()).transform(String) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabase
        .from("weight_entries")
        .delete()
        .eq("id", input.id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),
});
