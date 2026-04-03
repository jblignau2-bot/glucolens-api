import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";
import { openai } from "../openai";

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
    .input(
      z.object({
        weekStart: z.string(),
        dietaryRestrictions: z.string().optional(),
        country: z.string().optional(),
        diabetesType: z.string().optional(),
        dailyCalorieGoal: z.number().optional(),
        maxDailyCarbs: z.number().optional(),
        maxDailySugar: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const country = input.country ?? "South Africa";
      const diabetesType = input.diabetesType ?? "type2";
      const calorieGoal = input.dailyCalorieGoal ?? 1800;
      const maxCarbs = input.maxDailyCarbs ?? 130;
      const maxSugar = input.maxDailySugar ?? 25;
      const restrictions = input.dietaryRestrictions || "none";

      // --- 1. Call OpenAI -----------------------------------------------
      let planData: any;
      try {
        const prompt = `You are a certified diabetes nutritionist. Create a detailed 7-day meal plan for a person with ${diabetesType} diabetes living in ${country}.

DAILY TARGETS:
- Calories: ~${calorieGoal} kcal
- Max carbs: ${maxCarbs}g
- Max sugar: ${maxSugar}g
- Dietary restrictions: ${restrictions}

IMPORTANT:
- Use meals and ingredients commonly available in ${country}
- Include realistic cooking instructions
- List every ingredient with exact gram amounts
- Each meal must have full macro breakdown
- Calculate accurate daily totals
- Keep daily totals within the targets above

Respond ONLY with valid JSON (no markdown, no backticks). Use this EXACT structure:

{
  "days": [
    {
      "day": "Monday",
      "meals": {
        "breakfast": {
          "name": "Meal name",
          "description": "One-line summary",
          "calories": 350,
          "carbs_g": 25,
          "protein_g": 20,
          "fat_g": 15,
          "sugar_g": 5,
          "fiber_g": 4,
          "ingredients": [
            { "name": "Ingredient", "amount": "2 large", "grams": 120 }
          ],
          "cookingInstructions": "Step 1. Do this. Step 2. Do that. Step 3. Serve."
        },
        "lunch": { ... same structure ... },
        "dinner": { ... same structure ... },
        "snack": { ... same structure ... }
      },
      "dailyTotals": {
        "calories": 1750,
        "carbs_g": 120,
        "protein_g": 90,
        "fat_g": 65,
        "sugar_g": 20,
        "fiber_g": 28
      }
    }
  ],
  "weeklyTip": "A helpful diabetes management tip for the week."
}

Generate ALL 7 days (Monday through Sunday). Each day MUST have breakfast, lunch, dinner, and snack.`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 10000,
          temperature: 0.7,
          messages: [{ role: "user", content: prompt }],
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("AI returned no meal plan. Please try again.");
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
        if (!planData?.days || !Array.isArray(planData.days) || planData.days.length < 7) {
          throw new Error("AI returned an incomplete meal plan. Please try again.");
        }
      } catch (err: any) {
        console.error("OpenAI / parse error:", err?.message ?? err);
        throw new Error(
          "AI returned an invalid meal plan. Please try again."
        );
      }

      // Inject user limits into the plan so the frontend can display them
      planData.userLimits = {
        dailyCalories: calorieGoal,
        maxCarbs,
        maxSugar,
      };

      // --- 2. Upsert into Supabase -------------------------------------
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
