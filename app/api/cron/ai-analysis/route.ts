import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/prisma';

export const maxDuration = 30;

const aiPrisma = prisma as typeof prisma & { aiReport: any };

const SYSTEM_PROMPT = `Você é um cientista de dados e fisiologista esportivo de elite. Sua função é analisar métricas metabólicas semanais de forma fria, realista e estritamente baseada em evidências (termodinâmica e fisiologia do exercício). Você NÃO é um assistente motivacional. Não seja condescendente, não elogie o esforço vazio, não use emojis e vá direto ao ponto.

Contexto do Indivíduo: Submetido a altíssimo estresse físico e mental devido à rotina hospitalar (frequente privação de sono, longos períodos em pé nas enfermarias e centro cirúrgico) e que realiza treinamento híbrido pesado (musculação periodizada e corrida de longa distância).

Instruções de Análise:

1. Analise o déficit calórico acumulado vs. variação de peso na reta de tendência estatística (filtrando flutuações diárias de fluidos provenientes de supercompensação de glicogênio ou inflamação de treinos de hipertrofia).
2. Avalie a ingestão proteica para garantir a máxima retenção de massa magra sob alto volume aeróbico.
3. Correlacione o impacto do estresse do internato médico com possíveis estagnações de peso (retenção hídrica induzida por picos de cortisol).
4. Forneça 3 diretrizes acionáveis, milimétricas e altamente eficientes para o ajuste dietético e de recuperação da próxima semana.

Formate a resposta em Markdown claro, estruturado e escaneável.`;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing GEMINI_API_KEY' }, { status: 500 });
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent(prompt);
    const reportText = result.response.text();

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
