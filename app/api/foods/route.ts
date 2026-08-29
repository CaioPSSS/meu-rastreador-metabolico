import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { searchTacoFoods, CatalogFoodItem } from '@/lib/foodCatalog/search';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const limit = parseInt(searchParams.get('limit') || '30', 10);

  try {
    // 1. Buscar alimentos customizados no banco
    const customFoods = await prisma.foodItem.findMany({
      where: query.trim()
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { brand: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const mappedCustom: CatalogFoodItem[] = customFoods.map((f) => ({
      id: f.id,
      name: f.name,
      brand: f.brand,
      barcode: f.barcode,
      servingSize: f.servingSize,
      servingUnit: f.servingUnit,
      calories: f.calories,
      protein: f.protein,
      carbs: f.carbs,
      fat: f.fat,
      fiber: f.fiber,
      sodium: f.sodium,
      isCustom: f.isCustom,
    }));

    // 2. Buscar na base TACO embutida
    const tacoResults = searchTacoFoods(query, limit);

    // 3. Mesclar (customizados do usuário primeiro)
    const combined = [...mappedCustom, ...tacoResults].slice(0, limit);

    return NextResponse.json({ foods: combined });
  } catch (err) {
    console.error('[api/foods] Erro na busca:', err);
    return NextResponse.json({ error: 'Erro ao buscar alimentos.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      brand,
      barcode,
      servingSize,
      servingUnit,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      sodium,
    } = body;

    if (!name || calories === undefined || protein === undefined) {
      return NextResponse.json(
        { error: 'Nome, calorias e proteína são obrigatórios.' },
        { status: 400 }
      );
    }

    const food = await prisma.foodItem.create({
      data: {
        name: name.trim(),
        brand: brand ? brand.trim() : 'Personalizado',
        barcode: barcode ? barcode.trim() : null,
        servingSize: Number(servingSize) || 100,
        servingUnit: servingUnit || 'g',
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
        fiber: fiber !== undefined && fiber !== '' ? Number(fiber) : null,
        sodium: sodium !== undefined && sodium !== '' ? Number(sodium) : null,
        isCustom: true,
      },
    });

    return NextResponse.json({ food });
  } catch (err: unknown) {
    console.error('[api/foods] Erro ao cadastrar alimento:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao cadastrar alimento.' },
      { status: 500 }
    );
  }
}
