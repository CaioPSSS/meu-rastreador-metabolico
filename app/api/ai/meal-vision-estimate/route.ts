import { NextRequest, NextResponse } from 'next/server';
import { estimateMealFromVision } from '@/lib/ai/mealVisionEstimate';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, userContext, mealName } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Imagem em base64 não fornecida.' },
        { status: 400 }
      );
    }

    const estimation = await estimateMealFromVision(
      image,
      userContext ? String(userContext).trim() : undefined,
      mealName ? String(mealName).trim() : undefined
    );

    return NextResponse.json({ success: true, data: estimation });
  } catch (err: unknown) {
    console.error('[api/ai/meal-vision-estimate] Erro:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha ao estimar refeição por foto.' },
      { status: 500 }
    );
  }
}
