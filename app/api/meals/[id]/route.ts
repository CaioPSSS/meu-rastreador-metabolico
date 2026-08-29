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
    const { name, order } = body;

    const meal = await prisma.meal.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(order !== undefined ? { order: Number(order) } : {}),
      },
    });

    return NextResponse.json({ meal });
  } catch (err: unknown) {
    console.error('[api/meals/[id] PUT] Erro:', err);
    return NextResponse.json({ error: 'Erro ao atualizar refeição.' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const meal = await prisma.meal.findUnique({
      where: { id },
      select: { date: true },
    });

    if (!meal) {
      return NextResponse.json({ error: 'Refeição não encontrada.' }, { status: 404 });
    }

    await prisma.meal.delete({
      where: { id },
    });

    // Sincronizar DailyLog com os itens restantes
    await syncDailyLogFromMeals(meal.date);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[api/meals/[id] DELETE] Erro:', err);
    return NextResponse.json({ error: 'Erro ao excluir refeição.' }, { status: 500 });
  }
}
