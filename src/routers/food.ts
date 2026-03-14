import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { supabase } from "../supabase";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildPrompt(country: string, diabetesType: string) {
  return `You are a diabetes nutrition expert. Analyse this meal and respond ONLY with valid JSON:
{"mealName":"string","identifiedFoods":["string"],"nutrition":{"calories":0,"totalSugar_g":0,"totalCarbs_g":0,"glycemicIndex":0,"glycemicLoad":0,"protein_g":0,"fat_g":0,"fiber_g":0},"diabetesRating":{"type1":{"rating":"safe","reason":"string"},"type2":{"rating":"safe","reason":"string"}},"whyRisky":["string"],"healthierAlternatives":[{"name":"string","benefit":"string"}],"foodsToAvoid":["string"],"itemBreakdown":[{"name":"string","portion":"string","calories":0,"sugar_g":0,"carbs_g":0,"protein_g":0,"fat_g":0,"fiber_g":0,"glycemicIndex":0,"note":"string"}]}
Country: ${country || "unknown"}. Diabetes: ${diabetesType || "type2"}.`;
}

function tryParse(json: string | null, fallback: any) {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

async function parseAI(content: string) {
  return JSON.parse(content.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim());
}

export const foodRouter = router({
  list: protectedProcedure
    .input(z.object({ from: z.string().optional(), to: z.string().optional(), limit: z.number().default(50), rating: z.enum(["safe","moderate","risky"]).optional(), search: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      let q = supabase.from("food_logs").select("*").eq("user_id", ctx.userId)
        .order("logged_at", { ascending: false }).limit(input.limit);
      if (input.from) q = q.gte("logged_at", input.from);
      if (input.to) q = q.lte("logged_at", input.to);
      if (input.search) q = q.ilike("meal_name", `%${input.search}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      let rows = data || [];
      if (input.rating) rows = rows.filter((r: any) => r.rating_type2 === input.rating);
      return rows.map((r: any) => ({ id: r.id, mealName: r.meal_name, imageUrl: r.image_url,
        calories: r.calories, totalSugar: r.total_sugar, totalCarbs: r.total_carbs,
        glycemicIndex: r.glycemic_index, glycemicLoad: r.glycemic_load, protein: r.protein, fat: r.fat, fiber: r.fiber,
        ratingType1: r.rating_type1, ratingType2: r.rating_type2, reasonType1: r.reason_type1, reasonType2: r.reason_type2,
        whyRisky: tryParse(r.why_risky_json, []), healthierAlternatives: tryParse(r.healthier_alternatives_json, []),
        foodsToAvoid: tryParse(r.foods_to_avoid_json, []), itemBreakdown: tryParse(r.item_breakdown_json, []),
        identifiedFoods: tryParse(r.identified_foods_json, []), loggedAt: r.logged_at }));
    }),

  log: protectedProcedure
    .input(z.object({ mealName: z.string(), imageUrl: z.string().optional(), identifiedFoods: z.array(z.string()),
      nutrition: z.object({ calories: z.number(), totalSugar_g: z.number(), totalCarbs_g: z.number(), glycemicIndex: z.number(), glycemicLoad: z.number(), protein_g: z.number(), fat_g: z.number(), fiber_g: z.number() }),
      diabetesRating: z.object({ type1: z.object({ rating: z.enum(["safe","moderate","risky"]), reason: z.string() }), type2: z.object({ rating: z.enum(["safe","moderate","risky"]), reason: z.string() }) }),
      whyRisky: z.array(z.string()), healthierAlternatives: z.array(z.object({ name: z.string(), benefit: z.string() })),
      foodsToAvoid: z.array(z.string()), itemBreakdown: z.array(z.any()).optional(), country: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await supabase.from("food_logs").insert({
        user_id: ctx.userId, meal_name: input.mealName, image_url: input.imageUrl,
        identified_foods_json: JSON.stringify(input.identifiedFoods),
        calories: input.nutrition.calories, total_sugar: input.nutrition.totalSugar_g, total_carbs: input.nutrition.totalCarbs_g,
        glycemic_index: input.nutrition.glycemicIndex, glycemic_load: input.nutrition.glycemicLoad,
        protein: input.nutrition.protein_g, fat: input.nutrition.fat_g, fiber: input.nutrition.fiber_g,
        rating_type1: input.diabetesRating.type1.rating, rating_type2: input.diabetesRating.type2.rating,
        reason_type1: input.diabetesRating.type1.reason, reason_type2: input.diabetesRating.type2.reason,
        why_risky_json: JSON.stringify(input.whyRisky), healthier_alternatives_json: JSON.stringify(input.healthierAlternatives),
        foods_to_avoid_json: JSON.stringify(input.foodsToAvoid), item_breakdown_json: JSON.stringify(input.itemBreakdown ?? []),
        country: input.country, logged_at: new Date().toISOString(),
      }).select().single();
      if (error) throw new Error(error.message);
      return { id: data.id };
    }),

  analyze: protectedProcedure
    .input(z.object({ imageBase64: z.string(), country: z.string().optional(), diabetesType: z.string().optional() }))
    .mutation(async ({ input }) => {
      const res = await openai.chat.completions.create({ model: "gpt-4o", max_tokens: 2000,
        messages: [{ role: "user", content: [{ type: "text", text: buildPrompt(input.country ?? "", input.diabetesType ?? "type2") }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${input.imageBase64}`, detail: "low" } }] }] });
      return await parseAI(res.choices[0]?.message?.content ?? "{}");
    }),

  analyzeText: protectedProcedure
    .input(z.object({ description: z.string(), country: z.string().optional(), diabetesType: z.string().optional() }))
    .mutation(async ({ input }) => {
      const res = await openai.chat.completions.create({ model: "gpt-4o", max_tokens: 2000,
        messages: [{ role: "user", content: `${buildPrompt(input.country ?? "", input.diabetesType ?? "type2")}\n\nMeal: ${input.description}` }] });
      return await parseAI(res.choices[0]?.message?.content ?? "{}");
    }),

  analyzeBarcode: protectedProcedure
    .input(z.object({ barcode: z.string(), country: z.string().optional(), diabetesType: z.string().optional() }))
    .mutation(async ({ input }) => {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${input.barcode}.json`);
      const d = await res.json() as any;
      if (d.status !== 1 || !d.product) throw new Error("Product not found.");
      const p = d.product; const n = p.nutriments ?? {};
      const per100 = (k: string) => Number(n[k+"_100g"] ?? n[k] ?? 0);
      const sg = Number(p.serving_quantity ?? 100); const sc = sg / 100;
      const nutrition = { calories: Math.round(per100("energy-kcal")*sc), totalSugar_g: Math.round(per100("sugars")*sc*10)/10,
        totalCarbs_g: Math.round(per100("carbohydrates")*sc*10)/10, glycemicIndex: 50,
        glycemicLoad: Math.round(per100("carbohydrates")*sc*0.5*10)/10, protein_g: Math.round(per100("proteins")*sc*10)/10,
        fat_g: Math.round(per100("fat")*sc*10)/10, fiber_g: Math.round(per100("fiber")*sc*10)/10 };
      const r = nutrition.totalSugar_g > 15 || nutrition.totalCarbs_g > 45 ? "risky" : nutrition.totalSugar_g > 8 || nutrition.totalCarbs_g > 25 ? "moderate" : "safe";
      return { mealName: p.product_name ?? "Unknown", identifiedFoods: [p.product_name ?? "Unknown"], nutrition,
        diabetesRating: { type1: { rating: r, reason: `${nutrition.totalCarbs_g}g carbs per serving.` }, type2: { rating: r, reason: `${nutrition.totalSugar_g}g sugar per serving.` } },
        whyRisky: nutrition.totalSugar_g > 15 ? [`High sugar: ${nutrition.totalSugar_g}g`] : [], healthierAlternatives: [], foodsToAvoid: [],
        itemBreakdown: [{ name: p.product_name ?? "Product", portion: `${sg}g`, ...nutrition, sugar_g: nutrition.totalSugar_g, carbs_g: nutrition.totalCarbs_g, note: p.brands ?? "" }] };
    }),

  exportCsv: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await supabase.from("food_logs").select("*").eq("user_id", ctx.userId).order("logged_at", { ascending: false });
    const rows = (data || []).map((r: any) => [r.logged_at, `"${r.meal_name}"`, r.calories, r.total_carbs, r.total_sugar, r.protein, r.fat, r.fiber, r.glycemic_index, r.rating_type2].join(","));
    return ["Date,Meal,Calories,Carbs(g),Sugar(g),Protein(g),Fat(g),Fiber(g),GI,Rating", ...rows].join("\n");
  }),
});
