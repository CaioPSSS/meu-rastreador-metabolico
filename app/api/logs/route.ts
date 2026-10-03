import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateInsights, recalculateAdaptiveTarget, shouldRecalculate } from '@/lib/metabolicAlgo';
import { syncDailyLogFromMeals } from '@/lib/mealSync';

export async function GET() {
  const logs = await prisma.dailyLog.findMany({
    orderBy: { date: 'desc' },
    take: 30,
  });

  const settings = await prisma.userSettings.findMany();
  const insights = generateInsights(logs, settings);

  return NextResponse.json({ logs, insights });
}

export async function POST(request: Request) {
  const body = await request.json();
  const {
    date,
    weight,
    caloriesBurned,
    trainingType,
    sleepHours,
    waterIntake,
    stressLevel,
    mood,
    waistCircumference,
  } = body;

  await prisma.dailyLog.upsert({
    where: { date },
    update: {
      weight: weight !== undefined && weight !== '' ? Number(weight) : undefined,
      caloriesBurned: caloriesBurned !== undefined && caloriesBurned !== '' ? Number(caloriesBurned) : undefined,
      trainingType: trainingType || undefined,
      sleepHours: sleepHours !== undefined && sleepHours !== '' ? Number(sleepHours) : undefined,
      waterIntake: waterIntake !== undefined && waterIntake !== '' ? Number(waterIntake) : undefined,
      stressLevel: stressLevel !== undefined && stressLevel !== '' ? Number(stressLevel) : undefined,
      mood: mood !== undefined && mood !== '' ? mood : undefined,
      waistCircumference: waistCircumference !== undefined && waistCircumference !== '' ? Number(waistCircumference) : undefined,
    },
    create: {
      date,
      weight: weight ? Number(weight) : null,
      caloriesBurned: caloriesBurned ? Number(caloriesBurned) : null,
      trainingType: trainingType || 'Descanso',
      sleepHours: sleepHours ? Number(sleepHours) : null,
      waterIntake: waterIntake ? Number(waterIntake) : null,
      stressLevel: stressLevel ? Number(stressLevel) : null,
      mood: mood || null,
      waistCircumference: waistCircumference ? Number(waistCircumference) : null,
    },
  });

  // Sincroniza calorias e proteínas calculadas a partir das refeições do dia
  await syncDailyLogFromMeals(date);

  const allLogsForCalculation = await prisma.dailyLog.findMany({
    orderBy: { date: 'desc' },
    take: 21,
  });

  const settings = await prisma.userSettings.findMany();

  // Gate semanal: só recalcula a meta se passaram >= 7 dias e há >= 4 pesagens.
  // IMPORTANTE: Só dispara recálculo se o log salvo é de hoje ou ontem.
  // Isso evita recálculo indevido ao editar registros históricos.
  const logDate = new Date(`${date}T00:00:00Z`);
  const now = new Date();
  const daysDiff = Math.floor((now.getTime() - logDate.getTime()) / 86_400_000);
  const isRecentLog = daysDiff <= 1;

  if (isRecentLog && allLogsForCalculation.length >= 14 && settings.length > 0) {
    const gate = shouldRecalculate(settings[0], allLogsForCalculation);

    if (gate.allowed) {
      const newTarget = recalculateAdaptiveTarget(allLogsForCalculation, settings);
      await prisma.userSettings.update({
        where: { id: 'singleton' },
        data: {
          currentCalorieTarget: newTarget,
          previousCalorieTarget: settings[0].currentCalorieTarget,
          lastRecalcAt: new Date(),
          recalcReason: gate.reason,
        },
      });
    }
    // Se gate.allowed === false, a meta permanece inalterada até a próxima janela
  }

  return NextResponse.json({ success: true });
}