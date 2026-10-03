import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { runRecalibration } from '@/lib/recalibrationService';
import { buildWeekSummary, computeMotorSignals } from '@/lib/motorSignals';

export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Prompt do sistema — Fisiologista Narrativo
// Mantém o formato clínico e otimizado para WhatsApp.
// ---------------------------------------------------------------------------
const DEFAULT_SYSTEM_PROMPT = `Você é um fisiologista esportivo de elite e cientista de dados. Sua análise deve ser fria, realista e estritamente baseada em termodinâmica e fisiologia do exercício. Zero condescendência ou motivação vazia. Vá direto aos números e fatos.

CONTEXTO: Indivíduo com foco em perda de gordura, mantendo massa magra, praticando treino híbrido (musculação + cardio) e monitorando métricas diárias (peso, calorias ingeridas, calorias gastas em treinos, proteína, sono e estresse). O ecossistema sincroniza treinos automaticamente registrando caloriesBurned e trainingType.

INTEGRAÇÃO DE EXERCÍCIO:
- O sistema aplica um eat-back moderado de 65% das calorias de treino ao orçamento diário do usuário. Portanto, consumir mais calorias em dias de treino intenso é termodinamicamente compensado e esperado.
- Treinos intensos de membros inferiores ou corrida prolongada causam microlesões e inflamação aguda benéfica, resultando em retenção hídrica temporária de 0.5 a 1.5kg por 24-48h. Diferencie retenção inflamatória de ganho de gordura.

DIRETRIZES DE FORMATAÇÃO (Otimizado para WhatsApp):
- Seja ultra direto. Sem introduções polidas, saudações ou encerramentos longos.
- Use parágrafos curtos e objetivos.
- Use *negrito* exclusivamente para destacar números, métricas e metas.
- Use emojis APENAS como ícones estruturais para organizar os tópicos (ex: 📊, 🥩, ⚠️, ⚙️, 🎯).
- Se houver diretrizes prescritas no ciclo anterior, conecte o diagnóstico avaliando objetivamente a adesão antes de emitir novas diretrizes.

ESTRUTURA OBRIGATÓRIA DA RESPOSTA:
📊 *Termodinâmica:* Avalie a reta de tendência real de peso vs. déficit acumulado (filtre o ruído de retenção de fluidos pós-treino e glicogênio), integrando o gasto real de treinos (caloriesBurned), focando no desempenho da semana e depois no acumulado.
🥩 *Composição:* Julgue o aporte proteico e o risco de catabolismo frente ao volume/intensidade dos treinos realizados (correlacione dias de treino vs descanso).
⚠️ *Sinal Clínico:* Correlacione estresse/sono com recuperação muscular e possíveis estagnações na balança (retenção hídrica por cortisol ou inflamação pós-treino).
⚙️ *Decisão de Meta:* Informe a decisão do motor de recalibração e o raciocínio em 1-2 frases diretas. Se a meta foi ajustada, indique o novo valor.
🎯 *Plano de Ação:* Se houver plano anterior, avalie em 1 frase se as diretrizes anteriores foram cumpridas. Em seguida, forneça exatamente 3 novas diretrizes táticas, milimétricas e de alta eficiência para a próxima semana (abrangendo treino, nutrição ou recuperação).`;

const SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;

// ---------------------------------------------------------------------------

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
      model: 'deepseek/deepseek-v4-flash',
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
      model: 'tencent/hy3-preview',
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
    // e o último AiReport para dar continuidade e memória clínica à análise.
    interface StoredRecalibration {
      applied?: boolean;
      newTarget?: number;
      previousTarget?: number;
      delta?: number;
      reasoning?: string;
    }

    const [narrativeLogs, lastReport] = await Promise.all([
      prisma.dailyLog.findMany({
        orderBy: { date: 'desc' },
        take: 14,
      }),
      prisma.aiReport.findFirst({
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          recommendations: true,
          recalibration: true,
          weekSummary: true,
        },
      }),
    ]);

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

    // Memória histórica da análise da semana anterior
    let previousMemoryContext = '';
    if (lastReport) {
      const prevDate = lastReport.createdAt instanceof Date
        ? lastReport.createdAt.toISOString().slice(0, 10)
        : String(lastReport.createdAt).slice(0, 10);
      const prevRecal = lastReport.recalibration as StoredRecalibration | null;
      const prevRecs = (Array.isArray(lastReport.recommendations) ? lastReport.recommendations : []) as string[];

      const memoryLines: string[] = [
        `\n\nMEMÓRIA DA SEMANA ANTERIOR (Relatório gerado em ${prevDate}):`,
      ];

      if (prevRecal) {
        memoryLines.push(
          `- Meta calórica na semana passada: ${prevRecal.applied ? `Ajustada para ${prevRecal.newTarget} kcal (${prevRecal.delta && prevRecal.delta > 0 ? '+' : ''}${prevRecal.delta} kcal)` : `Mantida em ${prevRecal.previousTarget} kcal`}`,
          `- Raciocínio clínico anterior: ${prevRecal.reasoning}`,
        );
      }

      if (prevRecs.length > 0) {
        memoryLines.push(
          `- Diretrizes táticas prescritas na semana passada para cumprimento nesta semana:`,
          ...prevRecs.map((rec, i) => `  ${i + 1}. ${rec}`),
        );
      }

      memoryLines.push(
        `AVALIAÇÃO DE ADESÃO: Compare os dados dos últimos dias com as diretrizes acima e avalie se houve adesão às diretrizes passadas.`
      );

      previousMemoryContext = memoryLines.join('\n');
    }

    const narrativePrompt =
      `Analise a seguinte janela metabólica das últimas 2 semanas. Trate dados ausentes como lacunas — não invente valores.` +
      `\n\nHistórico das últimas 2 semanas:\n${JSON.stringify(leanPayload, null, 2)}` +
      `\n\nConfiguração e meta do usuário:\n${JSON.stringify(settingsPayload, null, 2)}` +
      recalibrationContext +
      previousMemoryContext;

    // ── Step 3 (cont.): Gerar relatório narrativo ────────────────────────────
    const reportText = await callOpenRouterNarrative(apiKey, narrativePrompt);

    const recommendations = extractRecommendations(reportText);

    // ── Step 4: Persistir AiReport com memória acumulativa ───────────────────
    await prisma.aiReport.create({
      data: {
        content: reportText,
        isRead: false,
        weekSummary: (weekSummary as unknown as Prisma.InputJsonValue) ?? undefined,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
        recalibration: (recalibrationResult as unknown as Prisma.InputJsonValue) ?? undefined,
      },
    });

    // ── Step 5: WhatsApp (CallMeBot) ──────────────────────────────────────────
    // Envio como mensagem única para respeitar o rate limit do CallMeBot (1 msg / 2s)
    // e garantir que o relatório chegue de forma coesa e ordenada no WhatsApp.
    const whatsappNumber = process.env.WHATSAPP_NUMBER;
    const callMeBotKey = process.env.CALLMEBOT_API_KEY;

    if (whatsappNumber && callMeBotKey) {
      const cleanPhone = whatsappNumber.replace(/\D/g, '');
      const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodeURIComponent(reportText)}&apikey=${callMeBotKey}`;
      try {
        const response = await fetch(url, { method: 'GET' });
        const responseText = await response.text();
        const lowerResponse = responseText.toLowerCase();

        if (
          !response.ok ||
          lowerResponse.includes('error') ||
          lowerResponse.includes('rate limit') ||
          lowerResponse.includes('invalid apikey')
        ) {
          console.error('[cron/ai-analysis] CallMeBot retornou aviso/erro no envio do WhatsApp:', {
            status: response.status,
            statusText: response.statusText,
            responsePreview: responseText.slice(0, 300),
          });
        } else {
          console.log('[cron/ai-analysis] WhatsApp enviado com sucesso via CallMeBot.');
        }
      } catch (notificationError) {
        console.error('[cron/ai-analysis] Falha de rede ao conectar com CallMeBot.', notificationError);
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