import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";

const measurementSchema = z.object({
  week: z.number().int().min(1).max(52),
  armsCm: z.number().optional().nullable(),
  chestCm: z.number().optional().nullable(),
  stomachCm: z.number().optional().nullable(),
  hipsCm: z.number().optional().nullable(),
  thighsCm: z.number().optional().nullable(),
  calvesCm: z.number().optional().nullable(),
});

function mapRow(r: any) {
  return {
    id: r.id,
    userId: r.user_id,
    week: r.week,
    armsCm: r.arms_cm,
    chestCm: r.chest_cm,
    stomachCm: r.stomach_cm,
    hipsCm: r.hips_cm,
    thighsCm: r.thighs_cm,
    calvesCm: r.calves_cm,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const bodyMeasurementsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("body_measurements")
      .select("*")
      .eq("user_id", ctx.userId)
      .order("week", { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(mapRow);
  }),

  getWeek: protectedProcedure
    .input(z.object({ week: z.number().int().min(1).max(52) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("body_measurements")
        .select("*")
        .eq("user_id", ctx.userId)
        .eq("week", input.week)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapRow(data) : null;
    }),

  upsertWeek: protectedProcedure
    .input(measurementSchema)
    .mutation(async ({ ctx, input }) => {
      const row: Record<string, any> = {
        user_id: ctx.userId,
        week: input.week,
        updated_at: new Date().toISOString(),
      };
      if (input.armsCm !== undefined) row.arms_cm = input.armsCm;
      if (input.chestCm !== undefined) row.chest_cm = input.chestCm;
      if (input.stomachCm !== undefined) row.stomach_cm = input.stomachCm;
      if (input.hipsCm !== undefined) row.hips_cm = input.hipsCm;
      if (input.thighsCm !== undefined) row.thighs_cm = input.thighsCm;
      if (input.calvesCm !== undefined) row.calves_cm = input.calvesCm;

      const { data, error } = await supabase
        .from("body_measurements")
        .upsert(row, { onConflict: "user_id,week" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return mapRow(data);
    }),

  delete: protectedProcedure
    .input(z.object({ week: z.number().int().min(1).max(52) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabase
        .from("body_measurements")
        .delete()
        .eq("user_id", ctx.userId)
        .eq("week", input.week);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),
});
