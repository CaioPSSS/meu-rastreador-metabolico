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

// ---------------------------------------------------------------------------
// 1. Cálculo Inicial Baseado em Fórmulas Clínicas (Mifflin-St Jeor)
// ---------------------------------------------------------------------------
export function calculateInitialTarget(data: SetupData): number {
  const bmr = 10 * data.weight + 6.25 * data.height - 5 * data.age + (data.gender === 'M' ? 5 : -161);
  const tdee = bmr * data.activityLevel;
  const dailyDeficitOrSurplus = (data.weeklyRate * 7700) / 7;
  return Math.round(tdee + dailyDeficitOrSurplus);
}

// ---------------------------------------------------------------------------
// 2. Utilitários
// ---------------------------------------------------------------------------
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function differenceInDays(dateA: Date, dateB: Date): number {
  return Math.floor((dateA.getTime() - dateB.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// 3. EWMA — Tendência de Peso via Média Móvel Exponencialmente Ponderada
//
// Substitui a regressão linear simples (OLS), que era sensível a outliers
// de retenção hídrica. A EWMA pondera os dias mais recentes com mais peso,
// filtrando o ruído de curto prazo de forma progressiva.
//
// alpha = 0.2: janela efetiva de ~9 dias (equilíbrio entre resposta e estabilidade)
// ---------------------------------------------------------------------------
export function calculateEWMATrend(logs: DailyLog[], alpha = 0.2): {
  trendKgPerDay: number;
  ewmaValues: Array<{ date: string; ewma: number }>;
} {
  const entries = logs
    .filter((log) => log.weight !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((log) => ({ date: log.date, weight: log.weight as number }));

  if (entries.length < 2) {
    return { trendKgPerDay: 0, ewmaValues: [] };
  }

  // Calcular série EWMA
  const ewmaValues: Array<{ date: string; ewma: number }> = [];
  let ewma = entries[0].weight;
  ewmaValues.push({ date: entries[0].date, ewma });

  for (let i = 1; i < entries.length; i++) {
    ewma = alpha * entries[i].weight + (1 - alpha) * ewma;
    ewmaValues.push({ date: entries[i].date, ewma });
  }

  // Tendência = diferença entre EWMA mais recente e EWMA de 7 dias atrás
  const latestEwma = ewmaValues[ewmaValues.length - 1].ewma;
  const latestDate = parseIsoDate(ewmaValues[ewmaValues.length - 1].date);
  const referenceDate = new Date(latestDate.getTime() - 7 * 86_400_000);

  let referenceEwma = ewmaValues[0].ewma;
  let minDiff = Infinity;
  for (const point of ewmaValues) {
    const pointDate = parseIsoDate(point.date);
    const diff = Math.abs(differenceInDays(pointDate, referenceDate));
    if (diff < minDiff) {
      minDiff = diff;
      referenceEwma = point.ewma;
    }
  }

  const trendKgPerDay = (latestEwma - referenceEwma) / 7;

  return { trendKgPerDay, ewmaValues };
}

// ---------------------------------------------------------------------------
// 4. Gate de Recálculo Semanal
//
// A meta só recalcula quando:
//   a) Passaram >= 7 dias desde o último recálculo (ou nunca foi recalculado)
//   b) Há pelo menos 4 pesagens válidas nos últimos 14 dias
//
// Isso elimina a oscilação diária causada por flutuações de retenção hídrica.
// ---------------------------------------------------------------------------
export function shouldRecalculate(
  settings: UserSettings,
  recentLogs: DailyLog[],
): { allowed: boolean; reason: string } {
  const now = new Date();

  if (settings.lastRecalcAt) {
    const daysSinceLastRecalc = differenceInDays(now, new Date(settings.lastRecalcAt));
    if (daysSinceLastRecalc < 7) {
      return {
        allowed: false,
        reason: `Apenas ${daysSinceLastRecalc} dia(s) desde o ultimo recalculo. Aguardando 7 dias completos.`,
      };
    }
  }

  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);
  const validWeights = recentLogs.filter((log) => {
    if (!log.weight) return false;
    const logDate = parseIsoDate(log.date);
    return logDate >= fourteenDaysAgo;
  });

  if (validWeights.length < 4) {
    return {
      allowed: false,
      reason: `Apenas ${validWeights.length} pesagem(ns) nos ultimos 14 dias. Minimo necessario: 4.`,
    };
  }

  return { allowed: true, reason: 'weekly_cycle' };
}

// ---------------------------------------------------------------------------
// 5. Motor Adaptativo
//
// Melhorias:
//   - EWMA ao inves de regressao OLS (mais estavel contra outliers)
//   - caloriesBurned incorporado como contexto direcional (fator 0.15)
//   - Constante de energia mista 6200 kcal/kg (mais realista que 7700 puro)
//   - Zona de estabilidade com criterio OR (antes era AND duplo muito restrito)
//   - Suavizacao 50/50 (era 45/55) — mais conservador por ciclo
// ---------------------------------------------------------------------------
export function recalculateAdaptiveTarget(logs: DailyLog[], settings: UserSettings[]): number {
  if (logs.length < 14 || settings.length === 0) {
    return settings[0]?.currentCalorieTarget || 2000;
  }

  const config = settings[0];
  const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const last14Days = sortedLogs.slice(-14);
  const last21Days = sortedLogs.slice(-21);

  const calories = last14Days
    .map((l) => l.caloriesConsumed)
    .filter((c): c is number => c !== null);

  const validWeightEntries = last21Days.filter((l) => l.weight !== null);

  if (validWeightEntries.length < 4 || calories.length < 10) {
    return config.currentCalorieTarget;
  }

  // EWMA para tendencia de peso (mais robusta que OLS)
  const { trendKgPerDay } = calculateEWMATrend(last21Days);
  const avgCaloriesIn = average(calories);

  // Constante de tecido misto: 6200 kcal/kg
  // Mais realista para mudancas de peso corporal observadas (gordura + glicogenio + agua)
  const ENERGY_PER_KG_MIXED = 6200;
  const realDailyEnergyDelta = trendKgPerDay * ENERGY_PER_KG_MIXED;

  // caloriesBurned como contexto direcional com fator conservador 0.15
  // (wearables tem erro medio de 25-40%; usamos 15% como sinal direcional apenas)
  const exerciseCalories = last14Days
    .filter((l) => l.caloriesBurned && l.caloriesBurned > 0 && l.trainingType !== 'Descanso')
    .map((l) => l.caloriesBurned as number);
  const avgExerciseBoost = exerciseCalories.length > 0
    ? average(exerciseCalories) * 0.15
    : 0;

  const empiricalTDEE = avgCaloriesIn - realDailyEnergyDelta + avgExerciseBoost;

  const targetedChangeDelta = (config.weeklyRate * 7700) / 7;
  const rawTarget = empiricalTDEE + targetedChangeDelta;

  // Suavizacao 50/50: mais conservador que o anterior 45/55
  const smoothedTarget = Math.round(config.currentCalorieTarget * 0.5 + rawTarget * 0.5);

  // Limite de variacao por ciclo: 200 kcal (era 150; aumentado para correcoes reais)
  const maxShift = 200;
  const adjustedTarget = clamp(
    smoothedTarget,
    config.currentCalorieTarget - maxShift,
    config.currentCalorieTarget + maxShift,
  );

  // Zona de estabilidade: criterio OR (mais permissivo que AND anterior)
  // Se tendencia semanal < 100g OU compliance calorico < 80 kcal -> manter meta
  const weeklyTrendGrams = Math.abs(trendKgPerDay * 7 * 1000);
  const calorieCompliance = Math.abs(avgCaloriesIn - config.currentCalorieTarget);

  if (weeklyTrendGrams < 100 || calorieCompliance < 80) {
    return config.currentCalorieTarget;
  }

  return clamp(adjustedTarget, 1200, 5000);
}

// ---------------------------------------------------------------------------
// 6. Geracao de Insights Semanais
// ---------------------------------------------------------------------------
function medianMood(logs: DailyLog[]) {
  const moodMap: Record<string, number> = {};
  logs.forEach((log) => {
    if (log.mood) moodMap[log.mood] = (moodMap[log.mood] || 0) + 1;
  });
  const sorted = Object.entries(moodMap).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'Regular';
}

export function generateInsights(logs: DailyLog[], settings: UserSettings[]): string[] {
  if (!logs.length || settings.length === 0) {
    return ['Cadastre seus primeiros registros para receber recomendacoes automaticas.'];
  }

  const currentTarget = settings[0].currentCalorieTarget;
  const recent = [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  const weekCalories = recent.map((l) => l.caloriesConsumed).filter((c): c is number => c !== null);
  const weekSleep = recent.map((l) => l.sleepHours).filter((s): s is number => s !== null);
  const weekWater = recent.map((l) => l.waterIntake).filter((w): w is number => w !== null);
  const weekStress = recent.map((l) => l.stressLevel).filter((s): s is number => s !== null);
  const weekProtein = recent.map((l) => l.proteinConsumed).filter((p): p is number => p !== null);
  const weekWeights = recent.map((l) => l.weight).filter((w): w is number => w !== null);

  const insights: string[] = [];

  if (weekCalories.length >= 4) {
    const avgCalories = average(weekCalories);
    if (avgCalories > currentTarget + 150) {
      insights.push('A media de ingestao esta acima da meta. Ajuste refeicoes para reduzir o excesso calorico.');
    } else if (avgCalories < currentTarget - 150) {
      insights.push('A ingestao media esta abaixo da meta. Atencao para nao reduzir demais se houver desconforto.');
    } else {
      insights.push('A ingestao calorica media esta alinhada com a meta atual.');
    }
  }

  if (weekProtein.length >= 3 && weekWeights.length >= 2) {
    const avgProtein = average(weekProtein);
    const avgWeight = average(weekWeights);
    const proteinPerKg = avgProtein / avgWeight;
    if (proteinPerKg < 1.6) {
      insights.push('Sua ingestao de proteina esta abaixo de 1.6g/kg. Risco maior de perda de massa magra em dietas com treino intenso.');
    } else {
      insights.push('A ingestao proteica esta adequada para preservar massa magra.');
    }
  }

  if (weekSleep.length >= 3) {
    const avgSleep = average(weekSleep);
    if (avgSleep < 7) {
      insights.push('O sono esta abaixo de 7 horas na ultima semana. Sono ruim pode afetar o metabolismo.');
    } else {
      insights.push('O sono esta satisfatorio. Boa recuperacao ajuda na adaptacao metabolica.');
    }
  }

  if (weekWater.length >= 3) {
    const avgWater = average(weekWater);
    if (avgWater < 2000) {
      insights.push('A hidratacao media esta baixa. Beba mais agua para apoiar o metabolismo e a recuperacao.');
    } else {
      insights.push('A hidratacao esta boa. Continuar assim ajuda nos processos metabolicos.');
    }
  }

  if (weekStress.length >= 3) {
    const avgStress = average(weekStress);
    if (avgStress >= 4) {
      insights.push('O estresse esta alto. Considere estrategias de relaxamento para melhorar o controle metabolico.');
    } else {
      insights.push('O nivel de estresse esta sob controle. Isso favorece a qualidade do progresso.');
    }
  }

  const mood = medianMood(recent);
  insights.push(`Humor predominante da semana: ${mood}.`);

  return insights;
}