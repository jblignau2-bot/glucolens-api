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
        .eq("week_start", input.weekStart)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!data) return null;
      return {
        id: data.id,
        userId: data.user_id,
        weekStart: data.week_start,
        planJson: data.plan_json,
        createdAt: data.created_at ?? null,
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
      // --- 1. Call OpenAI -----------------------------------------------
      let planData: any;
      try {
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
        let clean = content
          .replace(/^\uFEFF/, "")
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        const firstBrace = clean.indexOf("{");
        const lastBrace = clean.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          clean = clean.slice(firstBrace, lastBrace + 1);
        }
        planData = JSON.parse(clean);
      } catch (err: any) {
        console.error("OpenAI / parse error:", err?.message ?? err);
        throw new Error("AI returned an invalid meal plan. Please try again.");
      }

      // --- 2. Upsert into Supabase -------------------------------------
      // Only use columns guaranteed to exist in the original schema:
      // id, user_id, week_start (DATE), plan_json (TEXT), created_at
      const row: Record<string, any> = {
        user_id: ctx.userId,
        week_start: input.weekStart,
        plan_json: JSON.stringify(planData),
      };

      const { data, error } = await supabase
        .from("meal_plans")
        .upsert(row, { onConflict: "user_id,week_start" })
        .select()
        .single();

      if (error) {
        console.error("Supabase upsert error:", error.message);
        throw new Error(error.message);
      }

      return {
        id: data.id,
        userId: data.user_id,
        weekStart: data.week_start,
        planJson: data.plan_json,
        createdAt: data.created_at ?? null,
      };
    }),
});
