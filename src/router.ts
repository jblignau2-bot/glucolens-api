import { router } from "./trpc";
import { profileRouter } from "./routers/profile";
import { foodRouter } from "./routers/food";
import { glucoseRouter } from "./routers/glucose";
import { weightRouter } from "./routers/weight";
import { mealPlanRouter } from "./routers/mealPlan";
import { shoppingListRouter } from "./routers/shoppingList";
import { remindersRouter } from "./routers/reminders";
import { reportsRouter } from "./routers/reports";
import { goalsRouter } from "./routers/goals";

export const appRouter = router({
  profile: profileRouter,
  food: foodRouter,
  glucose: glucoseRouter,
  weight: weightRouter,
  mealPlan: mealPlanRouter,
  shoppingList: shoppingListRouter,
  reminders: remindersRouter,
  reports: reportsRouter,
  goals: goalsRouter,
});

export type AppRouter = typeof appRouter;
