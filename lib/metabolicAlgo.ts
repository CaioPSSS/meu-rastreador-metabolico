import { DailyLog, UserSettings } from '@prisma/client';

type SetupData = {
  age: number;
  height: number;
  weight: number;
  gender: string;
  activityLevel: number;
  goal: string;
  weeklyRate: number;
};

// 1. Cálculo Inicial Baseado em Fórmulas Clínicas
export function calculateInitialTarget(data: SetupData): number {
  const bmr = 10 * data.weight + 6.25 * data.height - 5 * data.age + (data.gender === 'M' ? 5 : -161);
  const tdee = bmr * data.activityLevel;
  const dailyDeficitOrSurplus = (data.weeklyRate * 7700) / 7;
  return Math.round(tdee + dailyDeficitOrSurplus);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function medianMood(logs: DailyLog[]) {
  const moodMap: Record<string, number> = {};
  logs.forEach((log) => {
    if (log.mood) moodMap[log.mood] = (moodMap[log.mood] || 0) + 1;
  });
  const sorted = Object.entries(moodMap).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'Regular';
}

export function recalculateAdaptiveTarget(logs: DailyLog[], settings: UserSettings[]): number {
  if (logs.length < 14 || settings.length === 0) {
    return settings[0]?.currentCalorieTarget || 2000;
  }

  const config = settings[0];
  const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const last14Days = sortedLogs.slice(-14);

  const week1 = last14Days.slice(0, 7);
  const week2 = last14Days.slice(7, 14);

  const w1Weights = week1.map((l) => l.weight).filter((w): w is number => w !== null);
  const w2Weights = week2.map((l) => l.weight).filter((w): w is number => w !== null);

  const calories = last14Days.map((l) => l.caloriesConsumed).filter((c): c is number => c !== null);
  const exercise = last14Days.map((l) => l.caloriesBurned).filter((e): e is number => e !== null);

  if (w1Weights.length < 3 || w2Weights.length < 3 || calories.length < 10) {
    return config.currentCalorieTarget;
  }

  const avgWeightWeek1 = average(w1Weights);
  const avgWeightWeek2 = average(w2Weights);
  const weightChange = avgWeightWeek2 - avgWeightWeek1;

  const avgCaloriesIn = average(calories);
  const avgCaloriesBurned = exercise.length > 0 ? average(exercise) : 0;

  const realDailyEnergyDelta = (weightChange * 7700) / 7;
  const empiricalTDEE = avgCaloriesIn - realDailyEnergyDelta + avgCaloriesBurned;

  const targetedChangeDelta = (config.weeklyRate * 7700) / 7;
  const rawTarget = empiricalTDEE + targetedChangeDelta;

  const smoothedTarget = Math.round(config.currentCalorieTarget * 0.45 + rawTarget * 0.55);
  const maxShift = 150;
  const adjustedTarget = clamp(smoothedTarget, config.currentCalorieTarget - maxShift, config.currentCalorieTarget + maxShift);

  if (Math.abs(weightChange) < 0.15 && Math.abs(avgCaloriesIn - config.currentCalorieTarget) < 100) {
    return config.currentCalorieTarget;
  }

  return clamp(adjustedTarget, 1200, 5000);
}

export function generateInsights(logs: DailyLog[], settings: UserSettings[]): string[] {
  if (!logs.length || settings.length === 0) {
    return ['Cadastre seus primeiros registros para receber recomendações automáticas.'];
  }

  const currentTarget = settings[0].currentCalorieTarget;
  const recent = [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  const weekCalories = recent.map((l) => l.caloriesConsumed).filter((c): c is number => c !== null);
  const weekExercise = recent.map((l) => l.caloriesBurned).filter((e): e is number => e !== null);
  const weekSleep = recent.map((l) => l.sleepHours).filter((s): s is number => s !== null);
  const weekWater = recent.map((l) => l.waterIntake).filter((w): w is number => w !== null);
  const weekStress = recent.map((l) => l.stressLevel).filter((s): s is number => s !== null);

  const insights: string[] = [];

  if (weekCalories.length >= 4) {
    const avgCalories = average(weekCalories);
    if (avgCalories > currentTarget + 150) {
      insights.push('A média de ingestão está acima da meta. Ajuste refeições para reduzir o excesso calórico.');
    } else if (avgCalories < currentTarget - 150) {
      insights.push('A ingestão média está abaixo da meta. Atenção para não reduzir demais se houver desconforto.');
    } else {
      insights.push('A ingestão calórica média está alinhada com a meta atual.');
    }
  }

  if (weekSleep.length >= 3) {
    const avgSleep = average(weekSleep);
    if (avgSleep < 7) {
      insights.push('O sono está abaixo de 7 horas na última semana. Sono ruim pode afetar o metabolismo.');
    } else {
      insights.push('O sono está satisfatório. Boa recuperação ajuda na adaptação metabólica.');
    }
  }

  if (weekWater.length >= 3) {
    const avgWater = average(weekWater);
    if (avgWater < 2000) {
      insights.push('A hidratação média está baixa. Beba mais água para apoiar o metabolismo e a recuperação.');
    } else {
      insights.push('A hidratação está boa. Continuar assim ajuda nos processos metabólicos.');
    }
  }

  if (weekStress.length >= 3) {
    const avgStress = average(weekStress);
    if (avgStress >= 4) {
      insights.push('O estresse está alto. Considere estratégias de relaxamento para melhorar o controle metabólico.');
    } else {
      insights.push('O nível de estresse está sob controle. Isso favorece a qualidade do progresso.');
    }
  }

  const mood = medianMood(recent);
  insights.push(`Humor predominante da semana: ${mood}.`);

  return insights;
}
                                                                                                                