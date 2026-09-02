import { prisma } from './prisma';

/**
 * Recalcula o somatório de calorias e proteínas de todas as refeições de uma data
 * e sincroniza no DailyLog correspondente.
 */
export async function syncDailyLogFromMeals(date: string): Promise<{ totalCalories: number; totalProtein: number }> {
  const meals = await prisma.meal.findMany({
    where: { date },
    include: { items: true },
  });

  let totalCalories = 0;
  let totalProtein = 0;
  let hasItems = false;

  for (const meal of meals) {
    if (meal.items.length > 0) hasItems = true;
    for (const item of meal.items) {
      totalCalories += item.calories || 0;
      totalProtein += item.protein || 0;
    }
  }

  const roundedCalories = hasItems ? Math.round(totalCalories) : null;
  const roundedProtein = hasItems ? Math.round(totalProtein) : null;

  // Upsert no DailyLog preservando outros campos (peso, sono, água, etc.)
  await prisma.dailyLog.upsert({
    where: { date },
    update: {
      caloriesConsumed: roundedCalories,
      proteinConsumed: roundedProtein,
    },
    create: {
      date,
      caloriesConsumed: roundedCalories,
      proteinConsumed: roundedProtein,
      trainingType: 'Descanso',
    },
  });

  return {
    totalCalories: roundedCalories ?? 0,
    totalProtein: roundedProtein ?? 0,
  };
}

