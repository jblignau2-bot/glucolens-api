import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await supabase
      .from("profiles").select("*").eq("user_id", ctx.userId).single();
    return data;
  }),

  goals: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await supabase
      .from("profiles")
      .select("daily_calorie_goal, max_daily_sugar, max_daily_carbs")
      .eq("user_id", ctx.userId).single();
    if (!data) return { dailyCalorieGoal: 1800, maxDailySugar: 50, maxDailyCarbs: 200 };
    return { dailyCalorieGoal: data.daily_calorie_goal, maxDailySugar: data.max_daily_sugar, maxDailyCarbs: data.max_daily_carbs };
  }),

  upsert: protectedProcedure
    .input(z.object({
      firstName: z.string().optional(), lastName: z.string().optional(),
      country: z.string().optional(), countryCode: z.string().optional(), countryFlag: z.string().optional(),
      heightCm: z.number().optional(), weightKg: z.number().optional(), age: z.number().optional(),
      gender: z.enum(["male","female","other"]).optional(),
      activityLevel: z.enum(["sedentary","light","moderate","active"]).optional(),
      diabetesType: z.enum(["type1","type2","unsure"]).optional(),
      dailyCalorieGoal: z.number().optional(), maxDailySugar: z.number().optional(), maxDailyCarbs: z.number().optional(),
      dietaryRestrictions: z.string().optional(), onboardingComplete: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabase.from("profiles").upsert({
        user_id: ctx.userId,
        first_name: input.firstName, last_name: input.lastName,
        country: input.country, country_code: input.countryCode, country_flag: input.countryFlag,
        height_cm: input.heightCm, weight_kg: input.weightKg, age: input.age,
        gender: input.gender, activity_level: input.activityLevel, diabetes_type: input.diabetesType,
        daily_calorie_goal: input.dailyCalorieGoal, max_daily_sugar: input.maxDailySugar,
        max_daily_carbs: input.maxDailyCarbs, dietary_restrictions: input.dietaryRestrictions,
        onboarding_complete: input.onboardingComplete, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" }).select().single();
      if (error) throw new Error(error.message);
      return data;
    }),
});
