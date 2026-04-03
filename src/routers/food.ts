import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Shared analysis prompt ──────────────────────────────────────────────────
function buildAnalysisPrompt(country: string, diabetesType: string) {
  return `You are a diabetes nutrition expert. Analyse this meal and respond ONLY with valid JSON matching this exact structure (no markdown, no explanation):
{
  "mealName": "string",
  "identifiedFoods": ["string"],
  "nutrition": {
    "calories": number,
    "totalSugar_g": number,
    "totalCarbs_g": number,
    "glycemicIndex": number,
    "glycemicLoad": number,
    "protein_g": number,
    "fat_g": number,
    "fiber_g": number
  },
  "diabetesRating": {
    "type1": { "rating": "safe"|"moderate"|"risky", "reason": "string" },
    "type2": { "rating": "safe"|"moderate"|"risky", "reason": "string" }
  },
  "whyRisky": ["string"],
  "healthierAlternatives": [{ "name": "string", "benefit": "string" }],
  "foodsToAvoid": ["string"],
  "itemBreakdown": [{
    "name": "string",
    "portion": "string",
    "calories": number,
    "sugar_g": number,
    "carbs_g": number,
    "protein_g": number,
    "fat_g": number,
    "fiber_g": number,
    "glycemicIndex": number,
    "note": "string"
  }]
}
Country context: ${country || "unknown"}. Primary diabetes concern: ${diabetesType || "type2"}.
Rate items based on glycemic impact, sugar content, and portion size. Be specific.`;
}

async function parseAnalysis(content: string) {
  // Strip markdown fencing, BOM, and any text before/after the JSON
  let clean = content
    .replace(/^\uFEFF/, "")
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  // Extract only the JSON object if AI added extra text
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("AI returned an invalid response. Please try again.");
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const foodRouter = router({

  list: protectedProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().default(50),
      rating: z.enum(["safe", "moderate", "risky"]).optional(),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      let query = supabase
        .from("food_logs")
        .select("*")
        .eq("user_id", ctx.userId)
        .order("logged_at", { ascending: false })
        .limit(input.limit);

      if (input.from) query = query.gte("logged_at", input.from);
      if (input.to) query = query.lte("logged_at", input.to);
      if (input.search) query = query.ilike("meal_name", `%${input.search}%`);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      let results = data || [];
      if (input.rating) {
        results = results.filter(
          (r: any) => r.rating_type2 === input.rating || r.rating_type1 === input.rating
        );
      }
      return results.map((r: any) => ({
        id: r.id,
        mealName: r.meal_name,
        // imageUrl not in original schema
        calories: r.calories,
        totalSugar: r.total_sugar,
        totalCarbs: r.total_carbs,
        glycemicIndex: r.glycemic_index,
        glycemicLoad: r.glycemic_load,
        protein: r.protein,
        fat: r.fat,
        fiber: r.fiber,
        ratingType1: r.rating_type1,
        ratingType2: r.rating_type2,
        reasonType1: r.reason_type1,
        reasonType2: r.reason_type2,
        whyRisky: tryParse(r.why_risky, []),
        healthierAlternatives: tryParse(r.healthier_alternatives, []),
        foodsToAvoid: tryParse(r.foods_to_avoid, []),
        itemBreakdown: tryParse(r.item_breakdown, []),
        identifiedFoods: tryParse(r.identified_foods, []),
        loggedAt: r.logged_at,
      }));
    }),

  log: protectedProcedure
    .input(z.object({
      mealName: z.string(),
      imageUrl: z.string().optional(),
      identifiedFoods: z.array(z.string()),
      nutrition: z.object({
        calories: z.number(),
        totalSugar_g: z.number(),
        totalCarbs_g: z.number(),
        glycemicIndex: z.number(),
        glycemicLoad: z.number(),
        protein_g: z.number(),
        fat_g: z.number(),
        fiber_g: z.number(),
      }),
      diabetesRating: z.object({
        type1: z.object({ rating: z.enum(["safe", "moderate", "risky"]), reason: z.string() }),
        type2: z.object({ rating: z.enum(["safe", "moderate", "risky"]), reason: z.string() }),
      }),
      whyRisky: z.array(z.string()),
      healthierAlternatives: z.array(z.object({ name: z.string(), benefit: z.string() })),
      foodsToAvoid: z.array(z.string()),
      itemBreakdown: z.array(z.any()).optional(),
      country: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabase
        .from("food_logs")
        .insert({
          user_id: ctx.userId,
          meal_name: input.mealName,
          identified_foods: input.identifiedFoods,
          calories: input.nutrition.calories,
          total_sugar: input.nutrition.totalSugar_g,
          total_carbs: input.nutrition.totalCarbs_g,
          glycemic_index: input.nutrition.glycemicIndex,
          glycemic_load: input.nutrition.glycemicLoad,
          protein: input.nutrition.protein_g,
          fat: input.nutrition.fat_g,
          fiber: input.nutrition.fiber_g,
          rating_type1: input.diabetesRating.type1.rating,
          rating_type2: input.diabetesRating.type2.rating,
          reason_type1: input.diabetesRating.type1.reason,
          reason_type2: input.diabetesRating.type2.reason,
          why_risky: input.whyRisky,
          healthier_alternatives: input.healthierAlternatives,
          foods_to_avoid: input.foodsToAvoid,
          item_breakdown: input.itemBreakdown ?? [],
          logged_at: new Date().toISOString(),
          country: input.country,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { id: data.id };
    }),

  analyze: protectedProcedure
    .input(z.object({
      imageBase64: z.string(),
      country: z.string().optional(),
      diabetesType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: buildAnalysisPrompt(input.country ?? "", input.diabetesType ?? "type2") },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${input.imageBase64}`, detail: "low" } },
          ],
        }],
      });
      const content = response.choices[0]?.message?.content ?? "{}";
      return await parseAnalysis(content);
    }),

  analyzeText: protectedProcedure
    .input(z.object({
      description: z.string(),
      country: z.string().optional(),
      diabetesType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `${buildAnalysisPrompt(input.country ?? "", input.diabetesType ?? "type2")}\n\nMeal description: ${input.description}`,
        }],
      });
      const content = response.choices[0]?.message?.content ?? "{}";
      return await parseAnalysis(content);
    }),

  analyzeBarcode: protectedProcedure
    .input(z.object({
      barcode: z.string(),
      country: z.string().optional(),
      diabetesType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Fetch from Open Food Facts (free, no API key)
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${input.barcode}.json`);
      const data = await res.json() as any;

      if (data.status !== 1 || !data.product) {
        throw new Error("Product not found. Try scanning the photo instead.");
      }

      const p = data.product;
      const n = p.nutriments ?? {};
      const per100 = (key: string) => Number(n[key + "_100g"] ?? n[key] ?? 0);
      const servingG = Number(p.serving_quantity ?? 100);
      const scale = servingG / 100;

      const nutrition = {
        calories: Math.round(per100("energy-kcal") * scale),
        totalSugar_g: Math.round(per100("sugars") * scale * 10) / 10,
        totalCarbs_g: Math.round(per100("carbohydrates") * scale * 10) / 10,
        glycemicIndex: 50, // OFF doesn't have GI — use moderate default
        glycemicLoad: Math.round(per100("carbohydrates") * scale * 0.5 * 10) / 10,
        protein_g: Math.round(per100("proteins") * scale * 10) / 10,
        fat_g: Math.round(per100("fat") * scale * 10) / 10,
        fiber_g: Math.round(per100("fiber") * scale * 10) / 10,
      };

      const sugar = nutrition.totalSugar_g;
      const carbs = nutrition.totalCarbs_g;
      const rating = sugar > 15 || carbs > 45 ? "risky" : sugar > 8 || carbs > 25 ? "moderate" : "safe";

      return {
        mealName: p.product_name ?? "Unknown product",
        identifiedFoods: [p.product_name ?? "Unknown"],
        nutrition,
        diabetesRating: {
          type1: { rating, reason: `${carbs}g carbs per serving — plan insulin accordingly.` },
          type2: { rating, reason: sugar > 15 ? `High sugar (${sugar}g) — limit portion size.` : `${sugar}g sugar per serving — ${rating} for blood sugar control.` },
        },
        whyRisky: sugar > 15 ? [`High sugar content: ${sugar}g per serving`] : [],
        healthierAlternatives: [],
        foodsToAvoid: [],
        itemBreakdown: [{
          name: p.product_name ?? "Product",
          portion: `${servingG}g serving`,
          calories: nutrition.calories,
          sugar_g: nutrition.totalSugar_g,
          carbs_g: nutrition.totalCarbs_g,
          protein_g: nutrition.protein_g,
          fat_g: nutrition.fat_g,
          fiber_g: nutrition.fiber_g,
          glycemicIndex: nutrition.glycemicIndex,
          note: p.brands ?? "",
        }],
      };
    }),

  exportCsv: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await supabase
      .from("food_logs")
      .select("*")
      .eq("user_id", ctx.userId)
      .order("logged_at", { ascending: false });

    const rows = (data || []).map((r: any) => [
      r.logged_at,
      `"${r.meal_name}"`,
      r.calories,
      r.total_carbs,
      r.total_sugar,
      r.protein,
      r.fat,
      r.fiber,
      r.glycemic_index,
      r.rating_type2,
    ].join(","));

    const header = "Date,Meal,Calories,Carbs(g),Sugar(g),Protein(g),Fat(g),Fiber(g),GI,Rating";
    return [header, ...rows].join("\n");
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabase
        .from("food_logs")
        .delete()
        .eq("id", input.id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),
});

function tryParse(val: any, fallback: any) {
  if (val == null) return fallback;
  // JSONB columns return as objects already, TEXT columns return as strings
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
}
