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

  for (const meal of meals) {
    for (const item of meal.items) {
      totalCalories += item.calories || 0;
      totalProtein += item.protein || 0;
    }
  }

  const roundedCalories = Math.round(totalCalories);
  const roundedProtein = Math.round(totalProtein);

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
    totalCalories: roundedCalories,
    totalProtein: roundedProtein,
  };
}

