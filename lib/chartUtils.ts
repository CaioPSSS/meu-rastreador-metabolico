// ---------------------------------------------------------------------------
// Utilitários e constantes clínicas compartilhados pelos componentes de UI.
// NÃO importar de metabolicAlgo.ts (motor isolado) — manter essa separação.
// ---------------------------------------------------------------------------

// ── Constantes Clínicas ──────────────────────────────────────────────────────

/** Meta de sono saudável em horas */
export const SLEEP_TARGET_H = 8;

/** Meta de hidratação diária em ml */
export const WATER_TARGET_ML = 3000;

/** Ingestão mínima de proteína para preservar massa magra (g/kg) */
export const PROTEIN_MIN_PER_KG = 1.6;

/** kcal por kg de tecido misto (gordura + glicogênio + água) — mais realista que 7700 puro */
export const ENERGY_PER_KG_MIXED = 6200;

/** Margem de compliance calórico (±kcal da meta = "no alvo") */
export const CALORIE_COMPLIANCE_MARGIN = 150;

// ── Funções matemáticas ──────────────────────────────────────────────────────

/** Média de um array de números. Retorna 0 se vazio. */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Limita um valor ao intervalo [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Normaliza um score para [0, 100]. */
export function clampScore(value: number): number {
  return clamp(Math.round(value), 0, 100);
}

// ── Formatação de Datas ──────────────────────────────────────────────────────

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Formata uma data ISO (`'2026-07-15'`) como `'Ter, 15/07'`.
 * Usa UTC para evitar off-by-one de fuso horário.
 */
export function formatDateBR(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = DAY_LABELS[d.getUTCDay()];
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}, ${dd}/${mm}`;
}

/**
 * Formata uma data ISO para exibição curta nos tooltips dos gráficos: `'15/07'`.
 */
export function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

// ── Streak de Registro ───────────────────────────────────────────────────────

/**
 * Calcula quantos dias consecutivos há logs registrados, contando para trás.
 * Aceita tanto hoje quanto ontem como ponto de partida (sem penalizar
 * quem ainda não registrou o dia atual).
 */
export function calcStreak(logs: Array<{ date: string }>): number {
  if (logs.length === 0) return 0;

  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));

  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterdayIso = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // Ponto de partida: mais recente entre hoje e ontem
  const mostRecent = sorted[0].date;
  if (mostRecent !== todayIso && mostRecent !== yesterdayIso) return 0;

  let streak = 0;
  let expected = mostRecent;

  for (const log of sorted) {
    if (log.date === expected) {
      streak++;
      const d = new Date(`${expected}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      expected = d.toISOString().slice(0, 10);
    } else {
      break;
    }
  }

  return streak;
}

// ── EWMA para gráficos (independente do motor) ───────────────────────────────

/**
 * Calcula a série EWMA para um array de valores nulos ou numéricos.
 * Mantém o valor anterior quando encontra null (forward-fill).
 */
export function calculateEMAForChart(
  values: Array<number | null>,
  period = 7,
): Array<number | null> {
  const alpha = 2 / (period + 1);
  const ema: Array<number | null> = [];
  let prev: number | null = null;

  for (const v of values) {
    if (v === null) {
      ema.push(prev);
      continue;
    }
    prev = prev === null ? v : prev + alpha * (v - prev);
    ema.push(parseFloat(prev.toFixed(2)));
  }

  return ema;
}

/**
 * Calcula a inclinação EWMA (kg/dia) para uso na projeção dos gráficos.
 * Consistente com a metodologia do motor metabólico.
 */
export function calcEWMASlopeForChart(
  weightPoints: Array<{ date: string; value: number }>,
  alpha = 0.2,
): number {
  if (weightPoints.length < 2) return 0;

  const sorted = [...weightPoints].sort((a, b) => a.date.localeCompare(b.date));
  let ewma = sorted[0].value;

  for (let i = 1; i < sorted.length; i++) {
    ewma = alpha * sorted[i].value + (1 - alpha) * ewma;
  }

  const latestEwma = ewma;
  const latestDate = new Date(`${sorted[sorted.length - 1].date}T00:00:00Z`);
  const refDate = new Date(latestDate.getTime() - 7 * 86_400_000);

  let refEwma = sorted[0].value;
  let minDiff = Infinity;

  // Recalcula a série completa para encontrar o ponto de referência
  let ewmaTemp = sorted[0].value;
  for (const pt of sorted) {
    ewmaTemp = alpha * pt.value + (1 - alpha) * ewmaTemp;
    const ptDate = new Date(`${pt.date}T00:00:00Z`);
    const diff = Math.abs(ptDate.getTime() - refDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      refEwma = ewmaTemp;
    }
  }

  return (latestEwma - refEwma) / 7;
}
