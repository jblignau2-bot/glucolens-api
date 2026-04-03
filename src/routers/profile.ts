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
      maxDailySugar: data.max_daily_sugar ?? 25,
      maxDailyCarbs: data.max_daily_carbs ?? 130,
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
    if (!data) return { dailyCalorieGoal: 1800, maxDailySugar: 25, maxDailyCarbs: 130 };
    return {
      dailyCalorieGoal: data.daily_calorie_goal ?? 1800,
      maxDailySugar: data.max_daily_sugar ?? 25,
      maxDailyCarbs: data.max_daily_carbs ?? 130,
    };
  }),

  upsert: protectedProcedure
    .input(z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      country: z.string().optional(),
      countryCode: z.string().optional(),
      countryFlag: z.string().optional(),
      heightCm: z.number().optional(),
      weightKg: z.number().optional(),
      age: z.number().optional(),
      gender: z.enum(["male", "female", "other"]).optional(),
      activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).optional(),
      diabetesType: z.enum(["type1", "type2", "prediabetes", "unsure", "none"]).optional(),
      dailyCalorieGoal: z.number().optional(),
      maxDailySugar: z.number().optional(),
      maxDailyCarbs: z.number().optional(),
      dietaryRestrictions: z.string().optional(),
      dietaryPrefs: z.string().optional(),
      onboardingComplete: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Build row with only provided fields to avoid nulling existing data
      const row: Record<string, any> = {
        user_id: ctx.userId,
        updated_at: new Date().toISOString(),
      };
      if (input.firstName !== undefined) row.first_name = input.firstName;
      if (input.lastName !== undefined) row.last_name = input.lastName;
      if (input.country !== undefined) row.country = input.country;
      if (input.countryCode !== undefined) row.country_code = input.countryCode;
      if (input.countryFlag !== undefined) row.country_flag = input.countryFlag;
      if (input.heightCm !== undefined) row.height_cm = input.heightCm;
      if (input.weightKg !== undefined) row.weight_kg = input.weightKg;
      if (input.age !== undefined) row.age = input.age;
      if (input.gender !== undefined) row.gender = input.gender;
      if (input.activityLevel !== undefined) row.activity_level = input.activityLevel;
      if (input.diabetesType !== undefined) row.diabetes_type = input.diabetesType;
      if (input.dailyCalorieGoal !== undefined) row.daily_calorie_goal = input.dailyCalorieGoal;
      if (input.maxDailySugar !== undefined) row.max_daily_sugar = input.maxDailySugar;
      if (input.maxDailyCarbs !== undefined) row.max_daily_carbs = input.maxDailyCarbs;
      if (input.dietaryRestrictions !== undefined) row.dietary_restrictions = input.dietaryRestrictions;
      if (input.dietaryPrefs !== undefined) row.dietary_restrictions = input.dietaryPrefs;
      if (input.onboardingComplete !== undefined) row.onboarding_complete = input.onboardingComplete;

      const { data, error } = await supabase
        .from("profiles")
        .upsert(row, { onConflict: "user_id" })
        .select()
        .single();

      if (error) throw new Error(error.message);
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
        maxDailySugar: data.max_daily_sugar ?? 25,
        maxDailyCarbs: data.max_daily_carbs ?? 130,
        dietaryRestrictions: data.dietary_restrictions,
        onboarding_complete: data.onboarding_complete,
        onboardingComplete: data.onboarding_complete === 1,
      };
    }),
});
