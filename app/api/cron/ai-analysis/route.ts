import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const maxDuration = 30;

const aiPrisma = prisma as typeof prisma & { aiReport: any };

const DEFAULT_SYSTEM_PROMPT = `Você é um fisiologista esportivo de elite e cientista de dados. Sua análise deve ser fria, realista e estritamente baseada em termodinâmica e fisiologia do exercício. Zero condescendência ou motivação vazia. Vá direto aos números e fatos.

CONTEXTO: Indivíduo sob alto estresse crônico (internato médico, plantões, privação de sono, horas em pé) conciliando treino híbrido pesado (musculação periodizada + corrida de longa distância).

DIRETRIZES DE FORMATAÇÃO (Otimizado para WhatsApp):
- Seja ultra direto. Sem introduções polidas, saudações ou encerramentos longos.
- Use parágrafos curtos e objetivos.
- Use *negrito* exclusivamente para destacar números, métricas e metas.
- Use emojis APENAS como ícones estruturais para organizar os tópicos (ex: 📊, 🥩, ⚠️, 🎯).

ESTRUTURA OBRIGATÓRIA DA RESPOSTA:
📊 *Termodinâmica:* Avalie a reta de tendência real de peso vs. déficit acumulado (filtre o ruído de retenção de fluidos e glicogênio).
🥩 *Composição:* Julgue o aporte proteico e o risco de catabolismo frente ao desgaste do treino híbrido.
⚠️ *Sinal Clínico:* Correlacione o estresse/sono do hospital com possíveis estagnações (retenção hídrica por cortisol).
🎯 *Plano de Ação:* Forneça exatamente 3 diretrizes táticas, milimétricas e de alta eficiência para corrigir a rota na próxima semana.`;

// Captura a variável de ambiente, ou usa o padrão se estiver vazia
const SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Alterado para buscar a chave do OpenRouter
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    const logs = await prisma.dailyLog.findMany({
      orderBy: { date: 'desc' },
      take: 14,
    });

    const leanPayload = logs
      .slice()
      .reverse()
      .map((log) => ({
        date: typeof log.date === 'string' ? log.date.slice(0, 10) : new Date(log.date).toISOString().slice(0, 10),
        weight: log.weight ?? null,
        caloriesConsumed: log.caloriesConsumed ?? null,
        proteinConsumed: log.proteinConsumed ?? null,
        sleepHours: log.sleepHours ?? null,
        stressLevel: log.stressLevel ?? null,
      }));

    const prompt = `Analise a seguinte janela metabólica dos últimos 14 dias. Se algum dado estiver ausente, trate como lacuna e não invente valores.\n\n${JSON.stringify(leanPayload, null, 2)}`;

    // Requisição nativa via fetch utilizando a API compatível da OpenRouter
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Cabeçalhos opcionais de rastreio para os leaderboards do OpenRouter
        'HTTP-Referer': 'https://meu-rastreador-metabolico.vercel.app', 
        'X-Title': 'Metabolic Tracker AI Cron'
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
      })
    });

    if (!openRouterResponse.ok) {
      const errorData = await openRouterResponse.text();
      console.error('Erro na API do OpenRouter:', errorData);
      return NextResponse.json({ error: 'Failed to generate content from OpenRouter' }, { status: 502 });
    }

    const result = await openRouterResponse.json();
    const reportText = result.choices?.[0]?.message?.content;

    if (!reportText) {
      throw new Error('Formato de resposta inesperado retornado pelo OpenRouter.');
    }

    await aiPrisma.aiReport.create({
      data: {
        content: reportText,
        isRead: false,
      },
    });

    const whatsappNumber = process.env.WHATSAPP_NUMBER;
    const callMeBotKey = process.env.CALLMEBOT_API_KEY;

    if (whatsappNumber && callMeBotKey) {
      const whatsappUrl = `https://api.callmebot.com/whatsapp.php?phone=${whatsappNumber}&text=${encodeURIComponent(reportText)}&apikey=${callMeBotKey}`;
      try {
        await fetch(whatsappUrl);
      } catch (notificationError) {
        console.error('Falha ao enviar notificação por WhatsApp.', notificationError);
      }
    }

    return NextResponse.json({ success: true, reportText });
  } catch (error) {
    console.error('Falha na análise semanal de IA.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}