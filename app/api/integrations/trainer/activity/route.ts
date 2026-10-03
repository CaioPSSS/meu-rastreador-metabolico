import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncDailyLogFromMeals } from '@/lib/mealSync';

export const dynamic = 'force-dynamic';

interface ActivitySyncPayload {
  date: string; // "YYYY-MM-DD"
  caloriesBurned: number;
  trainingType: 'Musculação' | 'Corrida' | 'Híbrido' | 'Cross-Training' | 'Descanso' | string;
  workoutTitle?: string;
  durationMinutes?: number;
  sessionRpe?: number;
  sleepHours?: number | null;
  bodyWeightKg?: number | null;
  stressLevel?: number | null;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Validação de segurança via Bearer Token
    const authHeader = request.headers.get('authorization');
    const allowedTokens = [
      'dev_sync_secret_metabolic',
      process.env.ECOSYSTEM_SYNC_SECRET,
      process.env.CRON_SECRET,
    ].filter(Boolean);

    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token || !allowedTokens.includes(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ActivitySyncPayload = await request.json();
    let { date, caloriesBurned, trainingType, sleepHours, bodyWeightKg, stressLevel } = body;

    if (!date) {
      return NextResponse.json({ error: 'Campo date é obrigatório (YYYY-MM-DD)' }, { status: 400 });
    }

    if (trainingType === 'Cross-Training') {
      trainingType = 'Híbrido';
    }

    // 2. Upsert atômico no DailyLog preservando registros existentes
    await prisma.dailyLog.upsert({
      where: { date },
      update: {
        caloriesBurned: caloriesBurned !== undefined ? (caloriesBurned != null ? Math.round(Number(caloriesBurned)) : null) : undefined,
        trainingType: trainingType !== undefined ? trainingType : undefined,
        sleepHours: sleepHours !== undefined ? (sleepHours != null ? Number(sleepHours) : null) : undefined,
        weight: bodyWeightKg !== undefined ? (bodyWeightKg != null ? Number(bodyWeightKg) : null) : undefined,
        stressLevel: stressLevel !== undefined ? (stressLevel != null ? Number(stressLevel) : null) : undefined,
      },
      create: {
        date,
        caloriesBurned: caloriesBurned != null ? Math.round(Number(caloriesBurned)) : null,
        trainingType: trainingType || 'Descanso',
        sleepHours: sleepHours != null ? Number(sleepHours) : null,
        weight: bodyWeightKg != null ? Number(bodyWeightKg) : null,
        stressLevel: stressLevel != null ? Number(stressLevel) : null,
      },
    });

    // 3. Garante recálculo e integridade com as refeições do dia
    await syncDailyLogFromMeals(date);

    // 4. Busca o estado nutricional e de recuperação consolidado do dia para retornar ao Personal-Trainer
    const [log, settings] = await Promise.all([
      prisma.dailyLog.findUnique({ where: { date } }),
      prisma.userSettings.findFirst({ where: { id: 'singleton' } }),
    ]);

    return NextResponse.json({
      success: true,
      date,
      nutrition: {
        date,
        caloriesConsumed: log?.caloriesConsumed ?? null,
        proteinConsumed: log?.proteinConsumed ?? null,
        currentCalorieTarget: settings?.currentCalorieTarget ?? null,
        dietGoal: settings?.goal ?? null,
        weight: log?.weight ?? null,
        sleepHours: log?.sleepHours ?? null,
        stressLevel: log?.stressLevel ?? null,
        trainingType: log?.trainingType ?? null,
        caloriesBurned: log?.caloriesBurned ?? null,
      },
    });
  } catch (error) {
    console.error('[API Trainer Activity] Falha ao processar atividade física recebida:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
