import { DailyLog, UserSettings } from '@prisma/client';
import { calculateEWMATrend } from './metabolicAlgo';

// ---------------------------------------------------------------------------
// Tipos exportados — usados pelo cron, pelo endpoint manual e pelo dashboard
// ---------------------------------------------------------------------------

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface MotorSignals {
  tdeeEmpirical: number | null;
  weightTrendKgPerWeek: number | null;
  avgCaloriesIn: number | null;
  calorieCompliance: number;   // % de dias com consumo dentro de ±150 kcal da meta
  avgProteinPerKg: number | null;
  weightEntriesCount: number;
  calorieEntriesCount: number;
  confidence: ConfidenceLevel; // Determinístico — baseado em qualidade dos dados
}

export interface WeekSummary {
  weekOf: string;                            // Data inicial da janela (ISO)
  avgCalories: number | null;
  avgProteinG: number | null;
  avgProteinPerKg: number | null;
  avgSleepHours: number | null;
  avgWaterMl: number | null;
  avgStressLevel: number | null;
  weightTrendKgPerWeek: number | null;
  calorieCompliance: number | null;          // % days on target
  trainingDays: Record<string, number>;      // { 'Musculação': 3, 'Descanso': 2, ... }
}

// ---------------------------------------------------------------------------
// Utilitários internos
// ---------------------------------------------------------------------------

function safeAvg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function parseIso(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

// ---------------------------------------------------------------------------
// computeMotorSignals
//
// Calcula os sinais que alimentam a IA árbitro. Toda a confiança é determinada
// AQUI, com base em contagens objetivas de dados — a IA não autoavalia sua
// própria confiança (LLMs são sistematicamente superconfiantes).
//
// Regras de confidence:
//   HIGH:   >= 10 registros calóricos E >= 6 pesagens nos últimos 14 dias
//   MEDIUM: >= 7  registros calóricos E >= 4 pesagens nos últimos 14 dias
//   LOW:    abaixo do mínimo → IA não é chamada, meta mantida sem custo de API
// ---------------------------------------------------------------------------
export function computeMotorSignals(
  logs: DailyLog[],
  settings: UserSettings,
): MotorSignals {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);

  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const last14 = sorted.filter((l) => parseIso(l.date) >= fourteenDaysAgo);
  const last21 = sorted.slice(-21);

  const recentWeights = last14.filter((l) => l.weight !== null);
  const recentCalLogs = last14.filter((l) => l.caloriesConsumed !== null);

  const weightEntriesCount = recentWeights.length;
  const calorieEntriesCount = recentCalLogs.length;

  // Confidence determinística
  let confidence: ConfidenceLevel = 'low';
  if (calorieEntriesCount >= 10 && weightEntriesCount >= 6) {
    confidence = 'high';
  } else if (calorieEntriesCount >= 7 && weightEntriesCount >= 4) {
    confidence = 'medium';
  }

  // Com dados insuficientes, retornar apenas os contadores
  if (confidence === 'low') {
    return {
      tdeeEmpirical: null,
      weightTrendKgPerWeek: null,
      avgCaloriesIn: null,
      calorieCompliance: 0,
      avgProteinPerKg: null,
      weightEntriesCount,
      calorieEntriesCount,
      confidence,
    };
  }

  // Tendência de peso via EWMA (janela de 21 dias para mais estabilidade)
  const { trendKgPerDay } = calculateEWMATrend(last21);
  const weightTrendKgPerWeek = parseFloat((trendKgPerDay * 7).toFixed(3));

  // Média de calorias consumidas
  const calValues = recentCalLogs.map((l) => l.caloriesConsumed as number);
  const avgCaloriesIn = safeAvg(calValues);

  // TDEE empírico: avgCal - (trendKgPerDay × 6200 kcal/kg de tecido misto)
  const ENERGY_PER_KG_MIXED = 6200;
  const tdeeEmpirical = avgCaloriesIn !== null
    ? Math.round(avgCaloriesIn - trendKgPerDay * ENERGY_PER_KG_MIXED)
    : null;

  // Compliance calórico: % de dias dentro de ±150 kcal da meta atual
  const target = settings.currentCalorieTarget;
  const compliantDays = calValues.filter((c) => Math.abs(c - target) <= 150).length;
  const calorieCompliance = calValues.length > 0
    ? Math.round((compliantDays / calValues.length) * 100)
    : 0;

  // Proteína média por kg de peso
  const proteinValues = last14
    .filter((l) => l.proteinConsumed !== null)
    .map((l) => l.proteinConsumed as number);
  const weightValues = last14
    .filter((l) => l.weight !== null)
    .map((l) => l.weight as number);
  const avgProtein = safeAvg(proteinValues);
  const avgWeight = safeAvg(weightValues);
  const avgProteinPerKg =
    avgProtein !== null && avgWeight !== null && avgWeight > 0
      ? parseFloat((avgProtein / avgWeight).toFixed(2))
      : null;

  return {
    tdeeEmpirical,
    weightTrendKgPerWeek,
    avgCaloriesIn: avgCaloriesIn !== null ? Math.round(avgCaloriesIn) : null,
    calorieCompliance,
    avgProteinPerKg,
    weightEntriesCount,
    calorieEntriesCount,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// buildWeekSummary
//
// Cria o snapshot semanal que é armazenado em AiReport.weekSummary
// e passado como contexto histórico para o próximo ciclo de IA.
// ---------------------------------------------------------------------------
export function buildWeekSummary(
  logs: DailyLog[],
  signals: MotorSignals,
): WeekSummary {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);

  const sleepValues = last7.filter((l) => l.sleepHours !== null).map((l) => l.sleepHours as number);
  const waterValues = last7.filter((l) => l.waterIntake !== null).map((l) => l.waterIntake as number);
  const stressValues = last7.filter((l) => l.stressLevel !== null).map((l) => l.stressLevel as number);
  const calValues = last7.filter((l) => l.caloriesConsumed !== null).map((l) => l.caloriesConsumed as number);
  const proteinValues = last7.filter((l) => l.proteinConsumed !== null).map((l) => l.proteinConsumed as number);
  const weightValues = last7.filter((l) => l.weight !== null).map((l) => l.weight as number);

  const avgProtein = safeAvg(proteinValues);
  const avgWeight = safeAvg(weightValues);
  const avgProteinPerKg =
    avgProtein !== null && avgWeight !== null && avgWeight > 0
      ? parseFloat((avgProtein / avgWeight).toFixed(2))
      : null;

  const trainingDays: Record<string, number> = {};
  for (const log of last7) {
    trainingDays[log.trainingType] = (trainingDays[log.trainingType] ?? 0) + 1;
  }

  const fmt = (v: number | null, decimals = 1) =>
    v !== null ? parseFloat(v.toFixed(decimals)) : null;

  return {
    weekOf: last7[0]?.date ?? new Date().toISOString().slice(0, 10),
    avgCalories: fmt(safeAvg(calValues), 0),
    avgProteinG: fmt(avgProtein, 1),
    avgProteinPerKg,
    avgSleepHours: fmt(safeAvg(sleepValues), 1),
    avgWaterMl: fmt(safeAvg(waterValues), 0),
    avgStressLevel: fmt(safeAvg(stressValues), 1),
    weightTrendKgPerWeek: signals.weightTrendKgPerWeek,
    calorieCompliance: signals.calorieCompliance,
    trainingDays,
  };
}
