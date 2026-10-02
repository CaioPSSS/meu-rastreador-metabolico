'use client';

import { EXERCISE_EATBACK_FACTOR } from '@/lib/metabolicAlgo';
import { Flame, Dumbbell, Wheat, Droplet, Activity } from 'lucide-react';
interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

interface MacroSummaryBarProps {
  totals: MacroTotals;
  calorieTarget: number;
  userWeight?: number | null;
  caloriesBurned?: number | null;
}

export default function MacroSummaryBar({
  totals,
  calorieTarget,
  userWeight,
  caloriesBurned,
}: MacroSummaryBarProps) {
  const exerciseBonus = Math.round((caloriesBurned ?? 0) * EXERCISE_EATBACK_FACTOR);
  const adjustedTarget = calorieTarget + exerciseBonus;
  
  const calPct = Math.min(Math.round((totals.calories / Math.max(adjustedTarget, 1)) * 100), 150);
  const remainingCal = adjustedTarget - totals.calories;

  // Meta proteica estimada: 2.0g/kg ou padrão de 150g
  const estimatedProteinTarget = userWeight ? Math.round(userWeight * 2.0) : 150;
  const protPct = Math.min(Math.round((totals.protein / Math.max(estimatedProteinTarget, 1)) * 100), 150);

  // Distribuição percentual dos 3 macronutrientes (base calorias dos macros: P=4, C=4, G=9)
  const calFromProt = totals.protein * 4;
  const calFromCarb = totals.carbs * 4;
  const calFromFat = totals.fat * 9;
  const totalMacroCal = calFromProt + calFromCarb + calFromFat;

  const protDist = totalMacroCal > 0 ? Math.round((calFromProt / totalMacroCal) * 100) : 33;
  const carbDist = totalMacroCal > 0 ? Math.round((calFromCarb / totalMacroCal) * 100) : 33;
  const fatDist = totalMacroCal > 0 ? Math.round((calFromFat / totalMacroCal) * 100) : 34;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
      {/* ── Topo: Calorias e Balanço ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Flame className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
              Calorias Consumidas
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">
                {totals.calories.toLocaleString('pt-BR')}
              </span>
              <span className="text-sm font-medium text-slate-500">
                / {adjustedTarget.toLocaleString('pt-BR')} kcal
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:self-center">
          <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs font-medium text-slate-300">
            {remainingCal >= 0 ? (
              <span>
                Restam <strong className="text-emerald-400">{remainingCal} kcal</strong>
              </span>
            ) : (
              <span>
                Excedeu <strong className="text-rose-400">{Math.abs(remainingCal)} kcal</strong>
              </span>
            )}
          </div>
          {exerciseBonus > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs font-medium text-orange-300 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              <span>+{exerciseBonus} kcal exercício</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Barra de Progresso Calórico ─────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="h-2.5 w-full bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-slate-700/40">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              totals.calories > calorieTarget * 1.05
                ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'
                : totals.calories > calorieTarget * 0.9
                ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]'
                : 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
            }`}
            style={{ width: `${Math.min(calPct, 100)}%` }}
          />
        </div>
      </div>

      {/* ── Cards dos 3 Macros ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-1">
        {/* Proteína */}
        <div className="bg-slate-950/60 border border-blue-500/20 rounded-xl p-2.5 sm:p-3">
          <div className="flex items-center justify-between text-xs text-blue-400 mb-1">
            <span className="flex items-center gap-1 font-semibold">
              <Dumbbell className="h-3.5 w-3.5" /> Proteína
            </span>
            <span className="text-[10px] text-slate-500">{protPct}%</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-xl font-bold text-white">
              {totals.protein}
            </span>
            <span className="text-xs text-slate-500">g</span>
          </div>
          {userWeight && (
            <p className="text-[10px] text-slate-500 mt-0.5">
              {(totals.protein / userWeight).toFixed(1)} g/kg
            </p>
          )}
        </div>

        {/* Carboidratos */}
        <div className="bg-slate-950/60 border border-amber-500/20 rounded-xl p-2.5 sm:p-3">
          <div className="flex items-center justify-between text-xs text-amber-400 mb-1">
            <span className="flex items-center gap-1 font-semibold">
              <Wheat className="h-3.5 w-3.5" /> Carbo
            </span>
            <span className="text-[10px] text-slate-500">{carbDist}%</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-xl font-bold text-white">
              {totals.carbs}
            </span>
            <span className="text-xs text-slate-500">g</span>
          </div>
          {totals.fiber !== undefined && totals.fiber > 0 && (
            <p className="text-[10px] text-slate-500 mt-0.5">
              {totals.fiber}g fibra
            </p>
          )}
        </div>

        {/* Gorduras */}
        <div className="bg-slate-950/60 border border-rose-500/20 rounded-xl p-2.5 sm:p-3">
          <div className="flex items-center justify-between text-xs text-rose-400 mb-1">
            <span className="flex items-center gap-1 font-semibold">
              <Droplet className="h-3.5 w-3.5" /> Gordura
            </span>
            <span className="text-[10px] text-slate-500">{fatDist}%</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-xl font-bold text-white">
              {totals.fat}
            </span>
            <span className="text-xs text-slate-500">g</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {calFromFat} kcal
          </p>
        </div>
      </div>

      {/* ── Barra de Distribuição de Macros ─────────────────────────────────── */}
      {totalMacroCal > 0 && (
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-[11px] text-slate-400 font-medium">
            <span>Distribuição de Macros</span>
            <span className="text-slate-500">
              <strong className="text-blue-400">{protDist}%</strong> P ·{' '}
              <strong className="text-amber-400">{carbDist}%</strong> C ·{' '}
              <strong className="text-rose-400">{fatDist}%</strong> G
            </span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
            <div
              className="bg-blue-500 transition-all duration-500"
              style={{ width: `${protDist}%` }}
              title={`Proteína: ${protDist}%`}
            />
            <div
              className="bg-amber-400 transition-all duration-500"
              style={{ width: `${carbDist}%` }}
              title={`Carboidrato: ${carbDist}%`}
            />
            <div
              className="bg-rose-500 transition-all duration-500"
              style={{ width: `${fatDist}%` }}
              title={`Gordura: ${fatDist}%`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
