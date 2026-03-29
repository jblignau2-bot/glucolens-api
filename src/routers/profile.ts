import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", ctx.userId)
      .single();
    if (!data) return null;
    // Map snake_case DB columns to camelCase for the frontend
    return {
      id: data.id,
      userId: data.user_id,
      firstName: data.first_name,
      lastName: data.last_name,
      country: data.country,
      countryCode: data.country_code,
      countryFlag: data.country_flag,
      heightCm: data.height_cm,
      weightKg: data.weight_kg,
      age: data.age,
      gender: data.gender,
      activityLevel: data.activity_level ?? "light",
      diabetesType: data.diabetes_type ?? "type2",
      dailyCalorieGoal: data.daily_calorie_goal ?? 1800,
      maxDailySugar: data.max_daily_sugar ?? 50,
      maxDailyCarbs: data.max_daily_carbs ?? 200,
      dietaryRestrictions: data.dietary_restrictions,
      onboarding_complete: data.onboarding_complete,
      onboardingComplete: data.onboarding_complete === 1,
    };
  }),

  goals: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await supabase
      .from("profiles")
      .select("daily_calorie_goal, max_daily_sugar, max_daily_carbs")
      .eq("user_id", ctx.userId)
      .single();
    if (!data) return { dailyCalorieGoal: 1800, maxDailySugar: 50, maxDailyCarbs: 200 };
    return {
      dailyCalorieGoal: data.daily_calorie_goal,
      maxDailySugar: data.max_daily_sugar,
      maxDailyCarbs: data.max_daily_carbs,
    };
  }),

  upsert: protectedProcedure
    .input(z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      country: z.string().optional(),
      countryCode: z.string().optional(),
      countryFlag: z.string().optional(),
      heightCm: z.number().optional(),
      weightKg: z.number().optional(),
      age: z.number().optional(),
      gender: z.enum(["male", "female", "other"]).optional(),
      activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).optional(),
      diabetesType: z.enum(["type1", "type2", "unsure", "none"]).optional(),
      dailyCalorieGoal: z.number().optional(),
      maxDailySugar: z.number().optional(),
      maxDailyCarbs: z.number().optional(),
      dietaryRestrictions: z.string().optional(),
      onboardingComplete: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("profiles")
        .upsert({
          user_id: ctx.userId,
          first_name: input.firstName,
          last_name: input.lastName,
          country: input.country,
          country_code: input.countryCode,
          country_flag: input.countryFlag,
          height_cm: input.heightCm,
          weight_kg: input.weightKg,
          age: input.age,
          gender: input.gender,
          activity_level: input.activityLevel,
          diabetes_type: input.diabetesType,
          daily_calorie_goal: input.dailyCalorieGoal,
          max_daily_sugar: input.maxDailySugar,
          max_daily_carbs: input.maxDailyCarbs,
          dietary_restrictions: input.dietaryRestrictions,
          onboarding_complete: input.onboardingComplete,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" })
        .select()
        .single();

      if (error) throw new Error(error.message);
      // Map snake_case DB columns to camelCase for the frontend
      return {
        id: data.id,
        userId: data.user_id,
        firstName: data.first_name,
        lastName: data.last_name,
        country: data.country,
        countryCode: data.country_code,
        countryFlag: data.country_flag,
        heightCm: data.height_cm,
        weightKg: data.weight_kg,
        age: data.age,
        gender: data.gender,
        activityLevel: data.activity_level ?? "light",
        diabetesType: data.diabetes_type ?? "type2",
        dailyCalorieGoal: data.daily_calorie_goal ?? 1800,
        maxDailySugar: data.max_daily_sugar ?? 50,
        maxDailyCarbs: data.max_daily_carbs ?? 200,
        dietaryRestrictions: data.dietary_restrictions,
        onboarding_complete: data.onboarding_complete,
        onboardingComplete: data.onboarding_complete === 1,
      };
    }),
});
