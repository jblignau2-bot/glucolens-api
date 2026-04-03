import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";

export const glucoseRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("glucose_logs")
        .select("*")
        .eq("user_id", ctx.userId)
        .order("recorded_at", { ascending: false })
        .limit(input.limit);
      if (error) throw new Error(error.message);
      return (data || []).map((r: any) => ({
        id: r.id,
        value: r.value_mmol,
        unit: "mmol",
        readingType: r.reading_type,
        notes: r.notes,
        loggedAt: r.recorded_at,
      }));
    }),

  add: protectedProcedure
    .input(z.object({
      value: z.number(),
      unit: z.enum(["mmol", "mgdl"]).default("mmol"),
      readingType: z.enum(["fasting", "pre-meal", "post-meal", "bedtime", "random"]).default("random"),
      notes: z.string().optional(),
      loggedAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Convert mg/dL to mmol/L if needed
      const mmolValue = input.unit === "mgdl" ? input.value / 18.0 : input.value;

      const { data, error } = await supabase
        .from("glucose_logs")
        .insert({
          user_id: ctx.userId,
          value_mmol: Math.round(mmolValue * 10) / 10,
          reading_type: input.readingType,
          notes: input.notes ?? null,
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
        .from("glucose_logs")
        .delete()
        .eq("id", input.id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),
});
