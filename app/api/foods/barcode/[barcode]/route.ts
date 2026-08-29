import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchOpenFoodFactsByBarcode } from '@/lib/foodCatalog/openFoodFacts';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ barcode: string }> }
) {
  const { barcode } = await params;
  const cleanBarcode = barcode.trim().replace(/\D/g, '');

  if (!cleanBarcode) {
    return NextResponse.json({ error: 'Código de barras inválido.' }, { status: 400 });
  }

  try {
    // 1. Verificar se já existe no banco local
    const localFood = await prisma.foodItem.findFirst({
      where: { barcode: cleanBarcode },
    });

    if (localFood) {
      return NextResponse.json({ food: localFood, source: 'local' });
    }

    // 2. Buscar no Open Food Facts
    const offFood = await fetchOpenFoodFactsByBarcode(cleanBarcode);

    if (offFood) {
      // Salvar no banco local para cache persistente
      try {
        const savedFood = await prisma.foodItem.create({
          data: {
            name: offFood.name,
            brand: offFood.brand || 'Industrializado',
            barcode: cleanBarcode,
            servingSize: offFood.servingSize,
            servingUnit: offFood.servingUnit,
            calories: offFood.calories,
            protein: offFood.protein,
            carbs: offFood.carbs,
            fat: offFood.fat,
            fiber: offFood.fiber,
            sodium: offFood.sodium,
            isCustom: false,
          },
        });
        return NextResponse.json({ food: savedFood, source: 'openfoodfacts' });
      } catch {
        // Se falhar o insert por race condition, retorna o objeto OFF
        return NextResponse.json({ food: offFood, source: 'openfoodfacts' });
      }
    }

    return NextResponse.json(
      { error: 'Produto não encontrado na base de dados.', barcode: cleanBarcode },
      { status: 404 }
    );
  } catch (err) {
    console.error('[api/foods/barcode] Erro:', err);
    return NextResponse.json(
      { error: 'Erro ao consultar código de barras.' },
      { status: 500 }
    );
  }
}
