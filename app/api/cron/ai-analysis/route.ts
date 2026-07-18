import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runRecalibration } from '@/lib/recalibrationService';
import { buildWeekSummary, computeMotorSignals } from '@/lib/motorSignals';

export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Prompt do sistema — Fisiologista Narrativo
// Mantém o formato clínico e otimizado para WhatsApp.
// ---------------------------------------------------------------------------
const DEFAULT_SYSTEM_PROMPT = `Você é um fisiologista esportivo de elite e cientista de dados. Sua análise deve ser fria, realista e estritamente baseada em termodinâmica e fisiologia do exercício. Zero condescendência ou motivação vazia. Vá direto aos números e fatos.

CONTEXTO: Indivíduo com foco em perda de gordura, mantendo massa magra, praticando treino híbrido (musculação + cardio) e monitorando métricas metabólicas diárias (peso, ingestão calórica, ingestão proteica, sono e estresse).

DIRETRIZES DE FORMATAÇÃO (Otimizado para WhatsApp):
- Seja ultra direto. Sem introduções polidas, saudações ou encerramentos longos.
- Use parágrafos curtos e objetivos.
- Use *negrito* exclusivamente para destacar números, métricas e metas.
- Use emojis APENAS como ícones estruturais para organizar os tópicos (ex: 📊, 🥩, ⚠️, 🎯, ⚙️).

ESTRUTURA OBRIGATÓRIA DA RESPOSTA:
📊 *Termodinâmica:* Avalie a reta de tendência real de peso vs. déficit acumulado (filtre o ruído de retenção de fluidos e glicogênio), focando no desempenho da semana e depois no desempenho acumulado.
🥩 *Composição:* Julgue o aporte proteico e o risco de catabolismo frente ao desgaste do treino apresentado.
⚠️ *Sinal Clínico:* Correlacione o estresse/sono com possíveis estagnações (retenção hídrica por cortisol).
⚙️ *Decisão de Meta:* Informe a decisão do motor de recalibração e o raciocínio em 1-2 frases diretas. Se a meta foi ajustada, indique o novo valor.
🎯 *Plano de Ação:* Forneça exatamente 3 diretrizes táticas, milimétricas e de alta eficiência para corrigir a rota na próxima semana.`;

const SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function splitReportParagraphs(reportText: string): string[] {
  return reportText
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Extrai as diretrizes táticas da seção 🎯 do relatório narrativo.
 * Armazenadas em AiReport.recommendations para alimentar prompts futuros.
 */
function extractRecommendations(reportText: string): string[] {
  const idx = reportText.indexOf('🎯');
  if (idx === -1) return [];
  return reportText
    .slice(idx)
    .split('\n')
    .slice(1) // pula a linha do cabeçalho 🎯
    .map((l) => l.replace(/^\s*[\d\-*•·]+\.?\s*/, '').trim())
    .filter((l) => l.length > 20)
    .slice(0, 5);
}

/**
 * Chama a API do OpenRouter com fallback automático.
 */
async function callOpenRouterNarrative(
  apiKey: string,
  userPrompt: string,
): Promise<string> {
  const primaryResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://meu-rastreador-metabolico.vercel.app',
      'X-Title': 'Metabolic Tracker AI Cron',
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (primaryResponse.ok) {
    const result = await primaryResponse.json();
    console.log('[cron/ai-analysis] Resposta primária:', JSON.stringify({
      model: result.model,
      hasChoices: Array.isArray(result.choices),
      contentLength: result.choices?.[0]?.message?.content?.length ?? 0,
      error: result.error ?? null,
    }));
    const content: string | undefined = result.choices?.[0]?.message?.content;
    if (content && !result.error) return content;
  }

  console.warn('[cron/ai-analysis] Modelo primário falhou. Tentando fallback...');

  const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://meu-rastreador-metabolico.vercel.app',
      'X-Title': 'Metabolic Tracker AI Cron (Fallback)',
    },
    body: JSON.stringify({
      model: 'google/gemma-4-31b-it:free',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!fallbackResponse.ok) {
    const err = await fallbackResponse.text();
    throw new Error(`Ambos os modelos falharam. Fallback: ${err.slice(0, 300)}`);
  }

  const fallbackResult = await fallbackResponse.json();
  console.log('[cron/ai-analysis] Resposta fallback:', JSON.stringify({
    model: fallbackResult.model,
    contentLength: fallbackResult.choices?.[0]?.message?.content?.length ?? 0,
    error: fallbackResult.error ?? null,
  }));

  if (fallbackResult.error) {
    throw new Error(`Fallback retornou erro: ${JSON.stringify(fallbackResult.error)}`);
  }

  const fallbackContent: string | undefined = fallbackResult.choices?.[0]?.message?.content;
  if (!fallbackContent) throw new Error('Fallback não retornou conteúdo.');
  return fallbackContent;
}

// ---------------------------------------------------------------------------
// GET /api/cron/ai-analysis
//
// Pipeline completo semanal:
//   Step 1 — Motor determinístico: sinais + confidence + weekSummary
//   Step 2 — IA Árbitro: decide e aplica (ou não) ajuste de meta
//   Step 3 — IA Narrativo: relatório clínico semanal (com decisão de meta incluída)
//   Step 4 — Persistência: AiReport com weekSummary + recalibration + recommendations
//   Step 5 — WhatsApp: envia o relatório
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    // ── Step 1: Buscar dados e calcular sinais do motor ─────────────────────
    const [logs, settings] = await Promise.all([
      prisma.dailyLog.findMany({ orderBy: { date: 'desc' }, take: 21 }),
      prisma.userSettings.findUnique({ where: { id: 'singleton' } }),
    ]);

    const motorSignals = settings
      ? computeMotorSignals(logs, settings)
      : null;
    const weekSummary = motorSignals && settings
      ? buildWeekSummary(logs, motorSignals)
      : null;

    // ── Step 2: IA Árbitro — recalibração de meta ────────────────────────────
    let recalibrationResult = null;
    try {
      const { result } = await runRecalibration(apiKey);
      recalibrationResult = result;
      console.log('[cron/ai-analysis] Recalibração concluída:', {
        confidence: result.confidence,
        applied: result.applied,
        delta: result.delta,
      });
    } catch (recalibrationError) {
      console.error('[cron/ai-analysis] Falha na recalibração (continuando com narrativa):', recalibrationError);
    }

    // ── Step 3: Construir prompt narrativo ───────────────────────────────────
    // Busca os últimos 14 logs para o payload narrativo (separado dos 21 do motor)
    const narrativeLogs = await prisma.dailyLog.findMany({
      orderBy: { date: 'desc' },
      take: 14,
    });

    const settingsForPayload = settings ?? await prisma.userSettings.findUnique({ where: { id: 'singleton' } });

    const leanPayload = narrativeLogs
      .slice()
      .reverse()
      .map((log) => ({
        date: typeof log.date === 'string' ? log.date.slice(0, 10) : new Date(log.date).toISOString().slice(0, 10),
        weight: log.weight ?? null,
        caloriesConsumed: log.caloriesConsumed ?? null,
        caloriesBurned: log.caloriesBurned ?? null,
        trainingType: log.trainingType ?? null,
        sleepHours: log.sleepHours ?? null,
        waterIntake: log.waterIntake ?? null,
        stressLevel: log.stressLevel ?? null,
        mood: log.mood ?? null,
        proteinConsumed: log.proteinConsumed ?? null,
        waistCircumference: log.waistCircumference ?? null,
      }));

    const settingsPayload = settingsForPayload
      ? {
        age: settingsForPayload.age,
        height: settingsForPayload.height,
        gender: settingsForPayload.gender,
        activityLevel: settingsForPayload.activityLevel,
        goal: settingsForPayload.goal,
        weeklyRate: settingsForPayload.weeklyRate,
        currentCalorieTarget: settingsForPayload.currentCalorieTarget,
      }
      : null;

    // Contexto da decisão de meta para o prompt narrativo
    const recalibrationContext = recalibrationResult
      ? `\n\nDECISÃO DO MOTOR DE RECALIBRAÇÃO (para incluir na seção ⚙️):
- Confiança dos dados: ${recalibrationResult.confidence.toUpperCase()}
- Reasoning: ${recalibrationResult.reasoning}
- Meta: ${recalibrationResult.applied
    ? `AJUSTADA de ${recalibrationResult.previousTarget} para ${recalibrationResult.newTarget} kcal (${recalibrationResult.delta > 0 ? '+' : ''}${recalibrationResult.delta} kcal)`
    : `MANTIDA em ${recalibrationResult.previousTarget} kcal`}`
      : '';

    const narrativePrompt =
      `Analise a seguinte janela metabólica das últimas 2 semanas. Trate dados ausentes como lacunas — não invente valores.` +
      `\n\nHistórico das últimas 2 semanas:\n${JSON.stringify(leanPayload, null, 2)}` +
      `\n\nConfiguração e meta do usuário:\n${JSON.stringify(settingsPayload, null, 2)}` +
      recalibrationContext;

    // ── Step 3 (cont.): Gerar relatório narrativo ────────────────────────────
    const reportText = await callOpenRouterNarrative(apiKey, narrativePrompt);

    const recommendations = extractRecommendations(reportText);

    // ── Step 4: Persistir AiReport com memória acumulativa ───────────────────
    await (prisma as any).aiReport.create({
      data: {
        content: reportText,
        isRead: false,
        weekSummary: weekSummary ?? undefined,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
        recalibration: recalibrationResult ?? undefined,
      },
    });

    // ── Step 5: WhatsApp ─────────────────────────────────────────────────────
    const whatsappNumber = process.env.WHATSAPP_NUMBER;
    const callMeBotKey = process.env.CALLMEBOT_API_KEY;

    if (whatsappNumber && callMeBotKey) {
      const paragraphs = splitReportParagraphs(reportText);
      for (const paragraph of paragraphs) {
        const url = `https://api.callmebot.com/whatsapp.php?phone=${whatsappNumber}&text=${encodeURIComponent(paragraph)}&apikey=${callMeBotKey}`;
        try {
          await fetch(url);
        } catch (notificationError) {
          console.error('[cron/ai-analysis] Falha ao enviar WhatsApp.', notificationError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      recalibration: recalibrationResult,
      reportLength: reportText.length,
      recommendationsExtracted: recommendations.length,
    });
  } catch (error) {
    console.error('[cron/ai-analysis] Falha na análise semanal de IA.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}