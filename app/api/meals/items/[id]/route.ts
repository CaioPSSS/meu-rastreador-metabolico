import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncDailyLogFromMeals } from '@/lib/mealSync';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { amount, calories, protein, carbs, fat, fiber } = body;

    const item = await prisma.mealItem.findUnique({
      where: { id },
      include: { meal: true },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 });
    }

    const updatedItem = await prisma.mealItem.update({
      where: { id },
      data: {
        ...(amount !== undefined ? { amount: Number(amount) } : {}),
        ...(calories !== undefined ? { calories: Number(calories) } : {}),
        ...(protein !== undefined ? { protein: Number(protein) } : {}),
        ...(carbs !== undefined ? { carbs: Number(carbs) } : {}),
        ...(fat !== undefined ? { fat: Number(fat) } : {}),
        ...(fiber !== undefined ? { fiber: fiber !== null ? Number(fiber) : null } : {}),
      },
    });

    // Sincronizar DailyLog
    await syncDailyLogFromMeals(item.meal.date);

    return NextResponse.json({ item: updatedItem });
  } catch (err: unknown) {
    console.error('[api/meals/items/[id] PUT] Erro:', err);
    return NextResponse.json({ error: 'Erro ao atualizar item.' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const item = await prisma.mealItem.findUnique({
      where: { id },
      include: { meal: true },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 });
    }

    const mealDate = item.meal.date;

    await prisma.mealItem.delete({
      where: { id },
    });

    // Sincronizar DailyLog
    await syncDailyLogFromMeals(mealDate);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[api/meals/items/[id] DELETE] Erro:', err);
    return NextResponse.json({ error: 'Erro ao excluir item da refeição.' }, { status: 500 });
  }
}
