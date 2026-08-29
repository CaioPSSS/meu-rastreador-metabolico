import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncDailyLogFromMeals } from '@/lib/mealSync';

const DEFAULT_MEAL_NAMES = [
  'Café da Manhã',
  'Almoço',
  'Lanche da Tarde',
  'Jantar',
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'Parâmetro date é obrigatório.' }, { status: 400 });
  }

  try {
    let meals = await prisma.meal.findMany({
      where: { date },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    });

    // Se o dia ainda não tiver refeições inicializadas, criar as 4 padrão
    if (meals.length === 0) {
      const createdMeals = [];
      for (let i = 0; i < DEFAULT_MEAL_NAMES.length; i++) {
        const m = await prisma.meal.create({
          data: {
            date,
            name: DEFAULT_MEAL_NAMES[i],
            order: i,
          },
          include: { items: true },
        });
        createdMeals.push(m);
      }
      meals = createdMeals;
    }

    // Calcular somatórios
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalFiber = 0;

    for (const meal of meals) {
      for (const item of meal.items) {
        totalCalories += item.calories || 0;
        totalProtein += item.protein || 0;
        totalCarbs += item.carbs || 0;
        totalFat += item.fat || 0;
        totalFiber += item.fiber || 0;
      }
    }

    return NextResponse.json({
      meals,
      totals: {
        calories: Math.round(totalCalories),
        protein: Math.round(totalProtein * 10) / 10,
        carbs: Math.round(totalCarbs * 10) / 10,
        fat: Math.round(totalFat * 10) / 10,
        fiber: Math.round(totalFiber * 10) / 10,
      },
    });
  } catch (err) {
    console.error('[api/meals GET] Erro:', err);
    return NextResponse.json({ error: 'Erro ao carregar refeições.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // Ação 1: Criar nova refeição personalizada
    if (action === 'create_meal') {
      const { date, name } = body;
      if (!date || !name) {
        return NextResponse.json({ error: 'Data e nome da refeição são obrigatórios.' }, { status: 400 });
      }

      const count = await prisma.meal.count({ where: { date } });
      const meal = await prisma.meal.create({
        data: {
          date,
          name: name.trim(),
          order: count,
        },
        include: { items: true },
      });

      return NextResponse.json({ meal });
    }

    // Ação 2: Adicionar item à refeição (Alimento ou Quick Add)
    if (action === 'add_item') {
      const {
        mealId,
        date,
        name,
        amount,
        unit,
        calories,
        protein,
        carbs,
        fat,
        fiber,
        foodItemId,
        isQuickAdd,
      } = body;

      if (!mealId || !name || calories === undefined) {
        return NextResponse.json({ error: 'Campos obrigatórios ausentes para adicionar item.' }, { status: 400 });
      }

      const item = await prisma.mealItem.create({
        data: {
          mealId,
          name: name.trim(),
          amount: Number(amount) || 1,
          unit: unit || 'g',
          calories: Number(calories) || 0,
          protein: Number(protein) || 0,
          carbs: Number(carbs) || 0,
          fat: Number(fat) || 0,
          fiber: fiber !== undefined && fiber !== null ? Number(fiber) : null,
          foodItemId: foodItemId || null,
          isQuickAdd: Boolean(isQuickAdd),
        },
      });

      // Sincronizar DailyLog
      if (date) {
        await syncDailyLogFromMeals(date);
      }

      return NextResponse.json({ item });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[api/meals POST] Erro:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao processar refeição.' },
      { status: 500 }
    );
  }
}
