import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const shoppingListRouter = router({
  getCurrent: protectedProcedure
    .input(z.object({ mealPlanId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      let query = supabase
        .from("shopping_lists")
        .select("*")
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (input.mealPlanId) {
        query = query.eq("meal_plan_id", input.mealPlanId);
      }

      const { data } = await query.single();
      if (!data) return null;
      return {
        id: data.id,
        mealPlanId: data.meal_plan_id,
        listJson: data.list_json,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }),

  generate: protectedProcedure
    .input(z.object({
      mealPlanId: z.string(),
      planJson: z.string(),
      country: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const prompt = `Based on this meal plan, generate a categorised shopping list in JSON (no markdown):
${input.planJson}

{
  "categories": [
    { "name": "string", "items": [{ "name": "string", "quantity": "string", "checked": false }] }
  ],
  "totalItems": number,
  "diabetesTip": "string",
  "estimatedTotalCost": "string",
  "currency": "${input.country === "ZA" ? "ZAR" : "USD"}"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      const clean = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const listData = JSON.parse(clean);

      const { data, error } = await supabase
        .from("shopping_lists")
        .upsert({
          user_id: ctx.userId,
          meal_plan_id: input.mealPlanId,
          list_json: JSON.stringify(listData),
          country: input.country,
          updated_at: new Date().toISOString(),
        }, { onConflict: "meal_plan_id" })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }),
});
