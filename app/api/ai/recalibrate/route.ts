import { NextRequest, NextResponse } from 'next/server';
import { runRecalibration } from '@/lib/recalibrationService';

export const maxDuration = 60;

/**
 * POST /api/ai/recalibrate
 *
 * Gatilho manual para a recalibração da IA árbitro.
 * Executa os Steps 1+2 do pipeline (sinais do motor + decisão da IA)
 * sem gerar o relatório narrativo completo.
 *
 * Autenticado via Bearer token (mesmo CRON_SECRET do cron semanal).
 *
 * Uso via curl:
 *   curl -X POST https://meu-rastreador-metabolico.vercel.app/api/ai/recalibrate \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: NextRequest) {
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

    const { result, signals } = await runRecalibration(apiKey);

    return NextResponse.json({
      success: true,
      confidence: result.confidence,
      dataQuality: {
        calorieEntries: signals.calorieEntriesCount,
        weightEntries: signals.weightEntriesCount,
      },
      recalibration: result,
    });
  } catch (error) {
    console.error('[POST /api/ai/recalibrate] Falha na recalibração manual.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
