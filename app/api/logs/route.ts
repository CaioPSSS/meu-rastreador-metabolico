import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recalculateAdaptiveTarget } from '@/lib/metabolicAlgo';

export async function GET() {
  const logs = await prisma.dailyLog.findMany({
      orderBy: { date: 'desc' },
          take: 30
            });
              return NextResponse.json(logs);
              }

              export async function POST(request: Request) {
                const body = await request.json();
                  const { date, weight, caloriesConsumed, caloriesBurned, trainingType } = body;

                    // 1. Salvar ou atualizar o log do dia selecionado
                      await prisma.dailyLog.upsert({
                          where: { date },
                              update: {
                                    weight: weight ? Number(weight) : null,
                                          caloriesConsumed: caloriesConsumed ? Number(caloriesConsumed) : null,
                                                caloriesBurned: caloriesBurned ? Number(caloriesBurned) : null,
                                                      trainingType
                                                          },
                                                              create: {
                                                                    date,
                                                                          weight: weight ? Number(weight) : null,
                                                                                caloriesConsumed: caloriesConsumed ? Number(caloriesConsumed) : null,
                                                                                      caloriesBurned: caloriesBurned ? Number(caloriesBurned) : null,
                                                                                            trainingType
                                                                                                }
                                                                                                  });

                                                                                                    // 2. Algoritmo Adaptativo Dinâmico
                                                                                                      // Puxar os últimos 14 logs estruturados para verificar a mudança metabólica
                                                                                                        const allLogsForCalculation = await prisma.dailyLog.findMany({
                                                                                                            orderBy: { date: 'desc' },
                                                                                                                take: 14
                                                                                                                  });

                                                                                                                    const settings = await prisma.userSettings.findMany();

                                                                                                                      if (allLogsForCalculation.length === 14 && settings.length > 0) {
                                                                                                                          const newTarget = recalculateAdaptiveTarget(allLogsForCalculation, settings);
                                                                                                                              
                                                                                                                                  await prisma.userSettings.update({
                                                                                                                                        where: { id: 'singleton' },
                                                                                                                                              data: { currentCalorieTarget: newTarget }
                                                                                                                                                  });
                                                                                                                                                    }

                                                                                                                                                      return NextResponse.json({ success: true });
                                                                                                                                                      }
                                                                                                                                                      