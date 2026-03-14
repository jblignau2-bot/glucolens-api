import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";

export const reportsRouter = router({
  monthly: protectedProcedure
    .input(z.object({ month: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const month = input.month ?? new Date().toISOString().slice(0, 7);
      const from = `${month}-01`;
      const to = `${month}-31`;
      const { data: logs } = await supabase
        .from("food_logs").select("*").eq("user_id", ctx.userId)
        .gte("logged_at", from).lte("logged_at", to);
      const rows = logs ?? [];
      const total = rows.length;
      const safe = rows.filter((r: any) => r.rating_type2 === "safe").length;
      const moderate = rows.filter((r: any) => r.rating_type2 === "moderate").length;
      const risky = rows.filter((r: any) => r.rating_type2 === "risky").length;
      const avgCalories = total ? Math.round(rows.reduce((s: number, r: any) => s + (r.calories ?? 0), 0) / total) : 0;
      const avgCarbs = total ? Math.round(rows.reduce((s: number, r: any) => s + (r.total_carbs ?? 0), 0) / total * 10) / 10 : 0;
      const avgSugar = total ? Math.round(rows.reduce((s: number, r: any) => s + (r.total_sugar ?? 0), 0) / total * 10) / 10 : 0;
      return { month, totalMeals: total, safeCount: safe, moderateCount: moderate, riskyCount: risky,
        safePercent: total ? Math.round((safe / total) * 100) : 0, avgCaloriesPerMeal: avgCalories,
        avgCarbsPerMeal: avgCarbs, avgSugarPerMeal: avgSugar };
    }),
});
