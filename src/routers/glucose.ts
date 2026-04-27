import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";

export const glucoseRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("glucose_readings")
        .select("*")
        .eq("user_id", ctx.userId)
        .order("logged_at", { ascending: false })
        .limit(input.limit);
      if (error) throw new Error(error.message);
      return (data || []).map((r: any) => ({
        id: r.id,
        value: r.value,
        valueMmol: r.unit === "mgdl" ? Math.round((r.value / 18) * 10) / 10 : r.value,
        unit: r.unit ?? "mmol",
        loggedAt: r.logged_at,
      }));
    }),

  add: protectedProcedure
    .input(z.object({
      value: z.number().optional(),
      valueMmol: z.number().optional(),
      readingType: z.string().optional(),
      notes: z.string().optional(),
      unit: z.enum(["mmol", "mgdl"]).default("mmol"),
      loggedAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const value = input.value ?? input.valueMmol;
      if (value == null) throw new Error("Glucose value is required");
      const { data, error } = await supabase
        .from("glucose_readings")
        .insert({
          user_id: ctx.userId,
          value,
          unit: input.unit,
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
        .from("glucose_readings")
        .delete()
        .eq("id", input.id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),
});
