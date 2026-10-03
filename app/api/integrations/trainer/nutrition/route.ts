import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.ECOSYSTEM_SYNC_SECRET || process.env.CRON_SECRET || 'dev_sync_secret_metabolic';

    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const settings = await prisma.userSettings.findFirst({ where: { id: 'singleton' } });

    // Consulta de uma data específica
    if (date) {
      const log = await prisma.dailyLog.findUnique({ where: { date } });
      return NextResponse.json({
        success: true,
        nutrition: {
          date,
          caloriesConsumed: log?.caloriesConsumed ?? null,
          proteinConsumed: log?.proteinConsumed ?? null,
          currentCalorieTarget: settings?.currentCalorieTarget ?? null,
          dietGoal: settings?.goal ?? null,
          weight: log?.weight ?? null,
        },
      });
    }

    // Consulta de um intervalo de datas
    if (startDate && endDate) {
      const logs = await prisma.dailyLog.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: 'asc' },
      });

      return NextResponse.json({
        success: true,
        items: logs.map((l) => ({
          date: l.date,
          caloriesConsumed: l.caloriesConsumed,
          proteinConsumed: l.proteinConsumed,
          currentCalorieTarget: settings?.currentCalorieTarget ?? null,
          dietGoal: settings?.goal ?? null,
          weight: l.weight,
        })),
      });
    }

    return NextResponse.json({ error: 'Parâmetro date ou startDate/endDate obrigatório' }, { status: 400 });
  } catch (error) {
    console.error('[API Trainer Nutrition] Falha ao consultar nutrição:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
