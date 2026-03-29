import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const mealPlanRouter = router({
  getCurrent: protectedProcedure
    .input(z.object({ weekStart: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data } = await supabase
        .from("meal_plans")
        .select("*")
        .eq("user_id", ctx.userId)
        .eq("week_start_date", input.weekStart)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!data) return null;
      // Map snake_case DB columns to camelCase for the frontend
      return {
        id: data.id,
        userId: data.user_id,
        weekStartDate: data.week_start_date,
        planJson: data.plan_json,
        dietaryRestrictions: data.dietary_restrictions,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }),

  generate: protectedProcedure
    .input(z.object({
      weekStart: z.string(),
      dietaryRestrictions: z.string().optional(),
      country: z.string().optional(),
      diabetesType: z.string().optional(),
      dailyCalorieGoal: z.number().optional(),
      maxDailyCarbs: z.number().optional(),
      maxDailySugar: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const prompt = `Create a 7-day diabetes-friendly meal plan for a person with ${input.diabetesType ?? "type2"} diabetes from ${input.country ?? "South Africa"}.
Daily targets: ~${input.dailyCalorieGoal ?? 1800} calories, max ${input.maxDailyCarbs ?? 130}g carbs, max ${input.maxDailySugar ?? 25}g sugar.
Dietary restrictions: ${input.dietaryRestrictions || "none"}.

Respond ONLY with valid JSON (no markdown):
{
  "days": [
    {
      "day": "Monday",
      "meals": {
        "breakfast": { "name": "string", "calories": number, "carbs_g": number, "description": "string" },
        "lunch": { "name": "string", "calories": number, "carbs_g": number, "description": "string" },
        "dinner": { "name": "string", "calories": number, "carbs_g": number, "description": "string" },
        "snack": { "name": "string", "calories": number, "carbs_g": number, "description": "string" }
      }
    }
  ],
  "weeklyTip": "string"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      // Strip markdown fencing, leading/trailing text, and any BOM
      let clean = content
        .replace(/^\uFEFF/, "")
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // If AI returned text before/after the JSON, extract only the JSON object
      const firstBrace = clean.indexOf("{");
      const lastBrace = clean.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1);
      }
      let planData: any;
      try {
        planData = JSON.parse(clean);
      } catch (parseErr: any) {
        throw new Error("AI returned an invalid meal plan. Please try again.");
      }

      // Only include columns guaranteed to exist in the table.
      // country, diabetes_type, and dietary_restrictions may not exist
      // if the migration hasn't been applied yet.
      const row: Record<string, any> = {
        user_id: ctx.userId,
        week_start_date: input.weekStart,
        plan_json: JSON.stringify(planData),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("meal_plans")
        .upsert(row, { onConflict: "user_id,week_start_date" })
        .select()
        .single();

      if (error) throw new Error(error.message);
      // Map snake_case DB columns to camelCase for the frontend
      return {
        id: data.id,
        userId: data.user_id,
        weekStartDate: data.week_start_date,
        planJson: data.plan_json,
        dietaryRestrictions: data.dietary_restrictions,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }),
});
