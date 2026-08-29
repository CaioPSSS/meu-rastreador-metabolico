import { NextRequest, NextResponse } from 'next/server';
import { extractNutritionFromImage } from '@/lib/ai/nutritionOcr';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Imagem em base64 não fornecida.' },
        { status: 400 }
      );
    }

    const extracted = await extractNutritionFromImage(image);
    return NextResponse.json({ success: true, data: extracted });
  } catch (err: any) {
    console.error('[api/ai/nutrition-ocr] Erro:', err);
    return NextResponse.json(
      { error: err.message || 'Falha ao processar tabela nutricional.' },
      { status: 500 }
    );
  }
}
