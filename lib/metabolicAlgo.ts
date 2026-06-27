import { DailyLog, UserSettings } from '@prisma/client';

// 1. Cálculo Inicial Baseado em Fórmulas Clínicas
export function calculateInitialTarget(data: {
  age: number;
    height: number;
      weight: number;
        gender: string;
          activityLevel: number;
            goal: string;
              weeklyRate: number;
              }): number {
                // Equação de Mifflin-St Jeor
                  const bmr = 10 * data.weight + 6.25 * data.height - 5 * data.age + (data.gender === 'M' ? 5 : -161);
                    const tdee = bmr * data.activityLevel;
                      
                        // 1kg de gordura/tecido corporal corporal ~ 7700 kcal
                          const dailyDeficitOrSurplus = (data.weeklyRate * 7700) / 7;
                            return Math.round(tdee + dailyDeficitOrSurplus);
                            }

                            // 2. Algoritmo Adaptativo Semanal (Rastreamento Empírico de Metas)
                            export function recalculateAdaptiveTarget(logs: DailyLog[], settings: UserSettings[]): number {
                              if (logs.length < 14 || settings.length === 0) {
                                  return settings[0]?.currentCalorieTarget || 2000;
                                    }

                                      const config = settings[0];
                                        
                                          // Ordenar logs do mais antigo para o mais recente
                                            const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
                                              
                                                // Separar em duas janelas de 7 dias para avaliar a progressão real
                                                  const week1 = sortedLogs.slice(0, 7);
                                                    const week2 = sortedLogs.slice(7, 14);

                                                      // Calcular pesos médios filtrando dias vazios
                                                        const w1Weights = week1.map(l => l.weight).filter((w): w is number => w !== null);
                                                          const w2Weights = week2.map(l => l.weight).filter((w): w is number => w !== null);

                                                            if (w1Weights.length === 0 || w2Weights.length === 0) {
                                                                return config.currentCalorieTarget; // Dados insuficientes de peso para recalcular
                                                                  }

                                                                    const avgWeightWeek1 = w1Weights.reduce((a, b) => a + b, 0) / w1Weights.length;
                                                                      const avgWeightWeek2 = w2Weights.reduce((a, b) => a + b, 0) / w2Weights.length;
                                                                        
                                                                          const weightChange = avgWeightWeek2 - avgWeightWeek1;

                                                                            // Calcular ingestão calórica real média da segunda semana
                                                                              const week2Calories = week2.map(l => l.caloriesConsumed).filter((c): c is number => c !== null);
                                                                                const week2Exercise = week2.map(l => l.caloriesBurned).filter((e): e is number => e !== null);

                                                                                  if (week2Calories.length < 4) {
                                                                                      return config.currentCalorieTarget; // Exige ao menos 4 dias de tracking calórico na semana para mudar
                                                                                        }

                                                                                          const avgCaloriesIn = week2Calories.reduce((a, b) => a + b, 0) / week2Calories.length;
                                                                                            const avgCaloriesBurned = week2Exercise.reduce((a, b) => a + b, 0) / week2Exercise.length;

                                                                                              // O excedente ou déficit calórico real deduzido pela variação de peso (1kg = 7700kcal)
                                                                                                const realDailyEnergyDelta = (weightChange * 7700) / 7;

                                                                                                  // TDEE Empírico = O que entrou - variação energética na balança + o gasto estimado do treino informado
                                                                                                    // Isso isola o metabolismo basal real adicionando a taxa adaptativa
                                                                                                      const empiricalTDEE = avgCaloriesIn - realDailyEnergyDelta + avgCaloriesBurned;

                                                                                                        // Nova Meta = Metabolismo Empírico + Déficit/Excedente planejado do objetivo
                                                                                                          const targetedChangeDelta = (config.weeklyRate * 7700) / 7;
                                                                                                            const calculatedTarget = Math.round(empiricalTDEE + targetedChangeDelta);

                                                                                                              // Limitadores de segurança biológica (Não cair abaixo de 1200 kcal nem subir além de 5000 kcal de forma automatizada)
                                                                                                                return Math.max(1200, Math.min(5000, calculatedTarget));
                                                                                                                }
                                                                                                                