import { prisma } from './prisma';
import { computeMotorSignals, buildWeekSummary, MotorSignals, WeekSummary } from './motorSignals';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface RecalibrationResult {
  confidence: 'high' | 'medium' | 'low';
  previousTarget: number;
  newTarget: number;
  delta: number;
  reasoning: string;
  shouldAdjust: boolean;
  applied: boolean;
  appliedAt: string | null;
}

interface AiArbitrationResponse {
  shouldAdjust: boolean;
  newTarget: number;
  delta: number;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Prompt do sistema — IA Árbitro de Meta
// ---------------------------------------------------------------------------

const ARBITER_SYSTEM_PROMPT = `Você é um sistema de controle metabólico de precisão.
Sua ÚNICA tarefa é decidir se a meta calórica do usuário deve ser ajustada neste ciclo semanal.
Os sinais que você receberá foram calculados deterministicamente por um motor matemático — não questione os números.

REGRAS OBRIGATÓRIAS:
1. Só ajuste a meta se a tendência de peso for significativamente diferente do objetivo declarado.
2. O ajuste máximo permitido é ±200 kcal por ciclo. Não proponha delta fora desse intervalo.
3. Se o compliance calórico for < 70%, a causa provável é aderência comportamental, não meta errada. Nesse caso, NÃO ajuste — informe o diagnóstico.
4. Se a tendência de peso já estiver dentro de 50% da taxa desejada, mantenha a meta.
5. Justifique em exatamente 2 frases, citando os números específicos que motivaram a decisão.
6. Retorne APENAS JSON válido, sem markdown, sem texto adicional fora do JSON.`;

// ---------------------------------------------------------------------------
// Construção do prompt de arbitragem
// ---------------------------------------------------------------------------

function buildArbiterPrompt(
  signals: MotorSignals,
  settings: { currentCalorieTarget: number; goal: string; weeklyRate: number },
  recentSummaries: WeekSummary[],
): string {
  const summaryContext = recentSummaries.length > 0
    ? JSON.stringify(recentSummaries, null, 2)
    : 'Sem histórico anterior disponível.';

  return `SINAIS DO MOTOR (calculados deterministicamente — não questione os valores):
- TDEE empírico (EWMA): ${signals.tdeeEmpirical ?? 'insuficiente'} kcal
- Tendência de peso (últimos 7d): ${signals.weightTrendKgPerWeek ?? 'insuficiente'} kg/semana (positivo = ganho, negativo = perda)
- Calorias médias consumidas: ${signals.avgCaloriesIn ?? 'insuficiente'} kcal/dia
- Compliance calórico: ${signals.calorieCompliance}% (dias com consumo dentro de ±150 kcal da meta)
- Compliance proteico: ${signals.avgProteinPerKg ?? 'insuficiente'} g/kg (referência: ≥1.6 g/kg)
- Qualidade dos dados: ${signals.confidence.toUpperCase()} (${signals.calorieEntriesCount} registros calóricos, ${signals.weightEntriesCount} pesagens nos últimos 14 dias)
- Meta calórica atual: ${settings.currentCalorieTarget} kcal/dia
- Objetivo: ${settings.goal} | Taxa semanal desejada: ${settings.weeklyRate} kg/semana

CONTEXTO HISTÓRICO (semanas anteriores):
${summaryContext}

INSTRUÇÃO:
Decida se a meta deve mudar esta semana. Justifique em exatamente 2 frases citando os números.
Retorne APENAS este JSON válido:
{"shouldAdjust": boolean, "newTarget": number, "delta": number, "reasoning": "string"}`;
}

// ---------------------------------------------------------------------------
// callOpenRouter — chamada à API com fallback
// ---------------------------------------------------------------------------

async function callOpenRouter(
  apiKey: string,
  userPrompt: string,
): Promise<string> {
  const primaryResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://meu-rastreador-metabolico.vercel.app',
      'X-Title': 'Metabolic Tracker Recalibration',
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      messages: [
        { role: 'system', content: ARBITER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (primaryResponse.ok) {
    const result = await primaryResponse.json();
    const content: string | undefined = result.choices?.[0]?.message?.content;
    if (content && !result.error) return content;
  }

  console.warn('[recalibrationService] Modelo primário falhou. Tentando fallback...');

  const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://meu-rastreador-metabolico.vercel.app',
      'X-Title': 'Metabolic Tracker Recalibration (Fallback)',
    },
    body: JSON.stringify({
      model: 'google/gemma-4-31b-it:free',
      messages: [
        { role: 'system', content: ARBITER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!fallbackResponse.ok) {
    throw new Error('[recalibrationService] Ambos os modelos falharam.');
  }

  const fallbackResult = await fallbackResponse.json();
  return fallbackResult.choices?.[0]?.message?.content ?? '';
}

// ---------------------------------------------------------------------------
// parseArbiterResponse — extrai e valida o JSON da resposta da IA
// ---------------------------------------------------------------------------

function parseArbiterResponse(rawContent: string): AiArbitrationResponse | null {
  try {
    // Extrai o bloco JSON mesmo se a IA envolver em markdown ou texto extra
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (
      typeof parsed.shouldAdjust !== 'boolean' ||
      typeof parsed.newTarget !== 'number' ||
      typeof parsed.delta !== 'number' ||
      typeof parsed.reasoning !== 'string'
    ) {
      return null;
    }
    return parsed as AiArbitrationResponse;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// runRecalibration — função principal exportada
//
// Fluxo:
//   1. Busca logs e settings
//   2. Calcula sinais do motor (confidence determinística)
//   3. Se confidence === 'low', retorna sem chamar a IA (economiza API)
//   4. Busca últimas 3 weekSummary do histórico
//   5. Chama a IA árbitro
//   6. Valida resposta aritmeticamente (server-side)
//   7. Se válido e shouldAdjust: atualiza UserSettings (coordena com o gate semanal)
//   8. Retorna RecalibrationResult completo
// ---------------------------------------------------------------------------

export async function runRecalibration(apiKey: string): Promise<{
  result: RecalibrationResult;
  signals: MotorSignals;
  weekSummary: WeekSummary;
}> {
  // 1. Buscar dados
  const [logs, settings, recentReports] = await Promise.all([
    prisma.dailyLog.findMany({ orderBy: { date: 'desc' }, take: 21 }),
    prisma.userSettings.findUnique({ where: { id: 'singleton' } }),
    (prisma as any).aiReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { weekSummary: true, createdAt: true },
    }),
  ]);

  if (!settings) throw new Error('[recalibrationService] UserSettings não encontrado.');

  // 2. Calcular sinais determinísticos
  const signals = computeMotorSignals(logs, settings);
  const weekSummary = buildWeekSummary(logs, signals);

  const baseResult: RecalibrationResult = {
    confidence: signals.confidence,
    previousTarget: settings.currentCalorieTarget,
    newTarget: settings.currentCalorieTarget,
    delta: 0,
    reasoning: '',
    shouldAdjust: false,
    applied: false,
    appliedAt: null,
  };

  // 3. Dados insuficientes → não chamar IA
  if (signals.confidence === 'low') {
    baseResult.reasoning =
      `Dados insuficientes para recalibração: ${signals.calorieEntriesCount} registros calóricos` +
      ` e ${signals.weightEntriesCount} pesagens nos últimos 14 dias.` +
      ` Mínimo necessário: 7 registros e 4 pesagens. Meta mantida em ${settings.currentCalorieTarget} kcal.`;
    return { result: baseResult, signals, weekSummary };
  }

  // 4. Contexto histórico (weekSummaries das últimas 3 semanas)
  const recentSummaries: WeekSummary[] = recentReports
    .filter((r: any) => r.weekSummary !== null)
    .map((r: any) => r.weekSummary as WeekSummary);

  // 5. Prompt e chamada à IA
  const userPrompt = buildArbiterPrompt(signals, settings, recentSummaries);
  let rawContent = '';
  try {
    rawContent = await callOpenRouter(apiKey, userPrompt);
  } catch (err) {
    baseResult.reasoning = `Falha na chamada à IA árbitro: ${String(err).slice(0, 200)}. Meta mantida.`;
    return { result: baseResult, signals, weekSummary };
  }

  // 6. Parsear e validar resposta
  const parsed = parseArbiterResponse(rawContent);

  if (!parsed) {
    baseResult.reasoning = `IA não retornou JSON válido. Resposta bruta: ${rawContent.slice(0, 200)}. Meta mantida.`;
    return { result: baseResult, signals, weekSummary };
  }

  const result = { ...baseResult };
  result.shouldAdjust = parsed.shouldAdjust;
  result.reasoning = parsed.reasoning;

  // Validação aritmética server-side
  const proposedTarget = Math.round(parsed.newTarget);
  const isValidRange = proposedTarget >= 1200 && proposedTarget <= 5000;
  const actualDelta = proposedTarget - settings.currentCalorieTarget;
  const isWithinMaxShift = Math.abs(actualDelta) <= 200;
  // Tolerância de 50 kcal para arredondamentos da IA
  const isDeltaConsistent = Math.abs(actualDelta - parsed.delta) <= 50;

  if (!isValidRange || !isWithinMaxShift || !isDeltaConsistent) {
    console.warn('[recalibrationService] Validação aritmética falhou:', {
      proposedTarget,
      proposedDelta: parsed.delta,
      actualDelta,
      isValidRange,
      isWithinMaxShift,
      isDeltaConsistent,
    });
    result.shouldAdjust = false;
    result.reasoning =
      `Proposta da IA (${proposedTarget} kcal, delta ${parsed.delta}) não passou na validação` +
      ` aritmética do servidor. Meta mantida em ${settings.currentCalorieTarget} kcal.`;
    return { result, signals, weekSummary };
  }

  result.newTarget = proposedTarget;
  result.delta = actualDelta; // Delta autoritativo (calculado server-side)

  // 7. Aplicar se shouldAdjust === true e passou na validação
  if (result.shouldAdjust) {
    await prisma.userSettings.update({
      where: { id: 'singleton' },
      data: {
        currentCalorieTarget: result.newTarget,
        lastRecalcAt: new Date(),
        recalcReason: 'ai_decision',
      },
    });
    result.applied = true;
    result.appliedAt = new Date().toISOString();
    console.log(
      `[recalibrationService] Meta ajustada pela IA: ${settings.currentCalorieTarget} → ${result.newTarget} kcal` +
      ` (${result.delta > 0 ? '+' : ''}${result.delta} kcal)`,
    );
  }

  return { result, signals, weekSummary };
}
