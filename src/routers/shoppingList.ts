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
      };
    }),

  generate: protectedProcedure
    .input(
      z.object({
        mealPlanId: z.string(),
        planJson: z.string(),
        country: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const country = input.country || "South Africa";

      let listData: any;
      try {
        const prompt = `You are a grocery shopping assistant for someone with diabetes in ${country}.

Based on this 7-day meal plan, create a DETAILED shopping list with estimated prices from the 3 biggest grocery stores in ${country}.

MEAL PLAN:
${input.planJson}

Respond ONLY with valid JSON (no markdown, no backticks). Use this EXACT structure:

{
  "currency": "ZAR",
  "stores": ["Store1", "Store2", "Store3"],
  "categories": [
    {
      "name": "Category Name",
      "items": [
        {
          "name": "Item description with size/weight",
          "quantity": "2",
          "unit": "packs",
          "prices": {
            "Store1": 29.99,
            "Store2": 27.99,
            "Store3": 34.99
          }
        }
      ]
    }
  ],
  "byDay": [
    {
      "day": "Monday",
      "items": ["Eggs", "Spinach", "Chicken breast", "Brown rice"]
    },
    {
      "day": "Tuesday",
      "items": ["Oats", "Salmon", "Sweet potato", "Broccoli"]
    }
  ],
  "totalByStore": {
    "Store1": 850.00,
    "Store2": 790.00,
    "Store3": 1050.00
  },
  "totalItems": 35,
  "diabetesTip": "A helpful tip about grocery shopping with diabetes.",
  "cheapestStore": "Store2"
}

IMPORTANT:
- Use the 3 most popular grocery stores in ${country} (e.g. for South Africa: Pick n Pay, Checkers, Woolworths)
- Prices must be realistic estimates in local currency for ${country}
- Consolidate duplicate items across the week (e.g. if eggs appear in 5 days, list "Eggs (2 dozen)" once)
- Include the day-by-day breakdown showing which ingredients are needed each day
- Group items into logical categories (Produce, Proteins, Dairy & Eggs, Grains & Cereals, Oils & Condiments, etc.)
- Calculate accurate totals per store`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 5000,
          temperature: 0.5,
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
        listData = JSON.parse(clean);
      } catch (err: any) {
        console.error("Shopping list AI/parse error:", err?.message ?? err);
        throw new Error(
          "Failed to generate shopping list. Please try again."
        );
      }

      const { data, error } = await supabase
        .from("shopping_lists")
        .upsert(
          {
            user_id: ctx.userId,
            meal_plan_id: input.mealPlanId,
            list_json: JSON.stringify(listData),
          },
          { onConflict: "meal_plan_id" }
        )
        .select()
        .single();

      if (error) {
        console.error("Shopping list Supabase error:", error.message);
        throw new Error(error.message);
      }

      return {
        id: data.id,
        mealPlanId: data.meal_plan_id,
        listJson: data.list_json,
        createdAt: data.created_at,
      };
    }),
});
