import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const shoppingListRouter = router({
  getCurrent: protectedProcedure
    .input(z.object({ mealPlanId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      let query = supabase.from("shopping_lists").select("*")
        .eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(1);
      if (input.mealPlanId) query = query.eq("meal_plan_id", input.mealPlanId);
      const { data } = await query.single();
      return data ?? null;
    }),

  generate: protectedProcedure
    .input(z.object({ mealPlanId: z.string(), planJson: z.string(), country: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const currency = input.country === "ZA" ? "ZAR" : "USD";
      const prompt = `Based on this meal plan, generate a categorised shopping list in JSON (no markdown):\n${input.planJson}\n\n{"categories":[{"name":"string","items":[{"name":"string","quantity":"string","checked":false}]}],"totalItems":0,"diabetesTip":"string","estimatedTotalCost":"string","currency":"${currency}"}`;
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });
      const raw = response.choices[0]?.message?.content ?? "{}";
      const listData = JSON.parse(raw.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim());
      const { data, error } = await supabase.from("shopping_lists").upsert({
        user_id: ctx.userId, meal_plan_id: input.mealPlanId,
        list_json: JSON.stringify(listData), country: input.country, updated_at: new Date().toISOString(),
      }, { onConflict: "meal_plan_id" }).select().single();
      if (error) throw new Error(error.message);
      return data;
    }),
});
