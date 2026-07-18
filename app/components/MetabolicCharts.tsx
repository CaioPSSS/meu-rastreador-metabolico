'use client';

import { useState } from 'react';
import {
  LineChart, Line, ComposedChart, Area, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, RadarChart, ReferenceLine
} from 'recharts';
import { Flame, TrendingDown, TrendingUp, Droplets, Heart, Calendar } from 'lucide-react';
import { Log, Settings } from '@/app/hooks/useMetabolicData';
import {
  average, calcEWMASlopeForChart, calculateEMAForChart, clampScore,
  formatDateShort, ENERGY_PER_KG_MIXED, PROTEIN_MIN_PER_KG, SLEEP_TARGET_H, WATER_TARGET_ML
} from '@/lib/chartUtils';

interface MetabolicChartsProps {
  logs: Log[];
  settings: Settings;
}

export default function MetabolicCharts({ logs, settings }: MetabolicChartsProps) {
  const [timeWindow, setTimeWindow] = useState<7 | 14 | 30>(14);

  // ── Pre-processamento ──────────────────────────────────────────────────────
  const orderedLogs = [...logs].reverse(); // cronológico: antigo -> recente
  const recentLogs = orderedLogs.slice(-timeWindow);

  // ── 1. Tendência Preditiva de Peso (EWMA) ──────────────────────────────────
  const weightValues = orderedLogs.map((log) => (typeof log.weight === 'number' ? log.weight : null));
  const emaSeries = calculateEMAForChart(weightValues, 7);

  const weightPoints = orderedLogs
    .filter((log): log is Log & { weight: number } => typeof log.weight === 'number')
    .slice(-timeWindow)
    .map((log) => ({ date: log.date, value: log.weight }));

  // Projeção usando EWMA local
  const slopeKgPerDay = calcEWMASlopeForChart(weightPoints);
  const lastLogWithWeight = weightPoints[weightPoints.length - 1];

  const predictiveData: Array<{
    data: string;
    'Peso Real': number | null;
    'Peso EWMA': number | null;
    'Projeção de Peso': number | null;
  }> = recentLogs.map((log) => {
    const origIndex = orderedLogs.findIndex((l) => l.date === log.date);
    return {
      data: formatDateShort(log.date),
      'Peso Real': log.weight,
      'Peso EWMA': emaSeries[origIndex],
      'Projeção de Peso': null,
    };
  });

  if (lastLogWithWeight && slopeKgPerDay !== 0) {
    const projectionDays = 14;
    const lastRealIndex = orderedLogs.findIndex((l) => l.date === lastLogWithWeight.date);
    let lastProjected = emaSeries[lastRealIndex] ?? lastLogWithWeight.value;

    for (let day = 1; day <= projectionDays; day++) {
      lastProjected = parseFloat((lastProjected + slopeKgPerDay).toFixed(2));
      predictiveData.push({
        data: `+${day}d`,
        'Peso Real': null,
        'Peso EWMA': null,
        'Projeção de Peso': lastProjected,
      });
    }
  }

  // ── 2. Balanço Energético Acumulado ────────────────────────────────────────
  let cumulativeDeficit = 0;
  const deficitData = recentLogs.map((log) => {
    const deficit = log.caloriesConsumed !== null ? settings.currentCalorieTarget - log.caloriesConsumed : 0;
    cumulativeDeficit += deficit;
    return {
      date: formatDateShort(log.date),
      'Déficit Diário': deficit,
      'Acúmulo Termodinâmico': parseFloat(cumulativeDeficit.toFixed(0)),
    };
  });
  // Gordura estimada usa 6200 kcal/kg (tecido misto) em vez de 7700
  const estimatedFatLossKg = parseFloat((cumulativeDeficit / ENERGY_PER_KG_MIXED).toFixed(2));

  // ── 3. Radar de Recuperação (Últimos 7 dias sempre) ────────────────────────
  const recoveryWindow = orderedLogs.slice(-7);
  const sleepValues = recoveryWindow.map((l) => l.sleepHours).filter((v): v is number => v !== null);
  const waterValues = recoveryWindow.map((l) => l.waterIntake).filter((v): v is number => v !== null);
  const stressValues = recoveryWindow.map((l) => l.stressLevel).filter((v): v is number => v !== null);
  const calValues = recoveryWindow.map((l) => l.caloriesConsumed).filter((v): v is number => v !== null);

  const sleepScore = clampScore((average(sleepValues) / SLEEP_TARGET_H) * 100);
  const waterScore = clampScore((average(waterValues) / WATER_TARGET_ML) * 100);
  const stressScore = stressValues.length ? clampScore(100 - (average(stressValues) - 1) * 20) : 50;
  const adherenceScore = calValues.length
    ? clampScore(100 - (Math.abs(average(calValues) - settings.currentCalorieTarget) / settings.currentCalorieTarget) * 100)
    : 50;

  const recoveryScore = Math.round((sleepScore + waterScore + stressScore + adherenceScore) / 4);

  const radarData = [
    { subject: 'Sono', score: sleepScore },
    { subject: 'Hidratação', score: waterScore },
    { subject: 'Estresse', score: stressScore },
    { subject: 'Aderência', score: adherenceScore },
  ];

  // ── 4. Macros Semanal (Calorias vs Proteína) ───────────────────────────────
  const latestWeight = lastLogWithWeight?.value ?? 70;
  const targetProtein = Math.round(latestWeight * PROTEIN_MIN_PER_KG);

  const macrosData = recentLogs.map(log => ({
    date: formatDateShort(log.date),
    'Kcal Consumida': log.caloriesConsumed ?? 0,
    'Proteína (g)': log.proteinConsumed ?? 0,
  }));

  // ── 5. Tendência de Cintura ────────────────────────────────────────────────
  const waistValues = orderedLogs.map(l => typeof l.waistCircumference === 'number' ? l.waistCircumference : null);
  const waistEma = calculateEMAForChart(waistValues, 5); // EMA mais rápida para cintura
  const waistData = recentLogs.map((log) => {
    const origIndex = orderedLogs.findIndex(l => l.date === log.date);
    return {
      date: formatDateShort(log.date),
      'Cintura Real': log.waistCircumference,
      'Cintura Tendência': waistEma[origIndex],
    };
  });
  const hasWaistData = waistValues.filter(v => v !== null).length >= 3;

  // ── Variação de Peso KPI (7 dias) ──────────────────────────────────────────
  const validWeights = orderedLogs.filter((l): l is Log & { weight: number } => typeof l.weight === 'number');
  let weightChange7d = null;
  if (validWeights.length >= 2) {
    // Array está em ordem crescente (antigo->recente), variação = último - um de 7 dias atrás
    const lastW = validWeights[validWeights.length - 1];
    // Pega o peso mais próximo de 7 logs atrás, ou o primeiro se não tiver 7
    const prevW = validWeights[Math.max(0, validWeights.length - 8)];
    weightChange7d = parseFloat((lastW.weight - prevW.weight).toFixed(1));
  }

  // ── Custom Tooltip ─────────────────────────────────────────────────────────
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900/90 border border-slate-700 p-3 rounded-xl shadow-xl backdrop-blur-md">
          <p className="text-slate-300 font-semibold mb-2 text-sm">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-slate-400">{entry.name}:</span>
              <span className="font-medium text-white">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">

      {/* ── KPI Cards (Glassmorphism) ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Meta */}
        <div className="glass-card p-5 group hover:border-emerald-500/40">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] uppercase text-slate-400 tracking-widest font-semibold">TDEE Empírico</p>
              <p className="mt-2 text-3xl font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
                {settings.currentCalorieTarget}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
              <Flame className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 font-medium">Motor adaptativo ativo</p>
        </div>

        {/* Card 2: Peso 7d */}
        <div className={`glass-card p-5 group ${weightChange7d !== null && weightChange7d <= 0 ? 'hover:border-sky-500/40' : 'hover:border-rose-500/40'}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] uppercase text-slate-400 tracking-widest font-semibold">Peso (Últ. 7 dias)</p>
              <p className={`mt-2 text-3xl font-black drop-shadow-[0_0_8px_rgba(56,189,248,0.3)] ${weightChange7d !== null && weightChange7d <= 0 ? 'text-sky-400' : 'text-rose-400'}`}>
                {weightChange7d !== null ? `${weightChange7d > 0 ? '+' : ''}${weightChange7d} kg` : '—'}
              </p>
            </div>
            <div className={`p-2.5 rounded-xl group-hover:scale-110 transition-transform ${weightChange7d !== null && weightChange7d <= 0 ? 'bg-sky-500/10 text-sky-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {weightChange7d !== null && weightChange7d > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 font-medium">
            Meta: {settings.weeklyRate > 0 ? '+' : ''}{settings.weeklyRate} kg/sem
          </p>
        </div>

        {/* Card 3: Gordura */}
        <div className="glass-card p-5 group hover:border-violet-500/40">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] uppercase text-slate-400 tracking-widest font-semibold">Gordura Oxidada</p>
              <p className="mt-2 text-3xl font-black text-violet-400 drop-shadow-[0_0_8px_rgba(167,139,250,0.3)]">
                {estimatedFatLossKg > 0 ? `-${estimatedFatLossKg}` : `+${Math.abs(estimatedFatLossKg)}`} kg
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-400 group-hover:scale-110 transition-transform">
              <Droplets className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 font-medium">Est. via balanço ({timeWindow}d)</p>
        </div>

        {/* Card 4: Recovery */}
        <div className="glass-card p-5 group hover:border-cyan-500/40">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] uppercase text-slate-400 tracking-widest font-semibold">Recovery Score</p>
              <p className="mt-2 text-3xl font-black text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">
                {recoveryScore}%
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
              <Heart className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 font-medium">Sono / Água / Estresse / Dieta</p>
        </div>
      </div>

      {/* ── Toolbar de Gráficos ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-2 mb-4 px-2">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-400" />
          Análise Visual
        </h3>
        <div className="flex bg-slate-900/80 rounded-lg p-1 border border-slate-700/50">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setTimeWindow(d as any)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                timeWindow === d
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {/* ── Gráfico 1: Peso EWMA + Projeção ─────────────────────────────────── */}
      <div className="glass-card p-5 pt-6 pb-2">
        <h4 className="text-xs font-bold text-slate-500 mb-6 tracking-widest uppercase ml-2">Tendência Preditiva de Peso (EWMA)</h4>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={predictiveData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="data" stroke="#64748b" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
            <YAxis stroke="#64748b" domain={['dataMin - 1.5', 'dataMax + 1.5']} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
            <Line type="monotone" dataKey="Peso Real" stroke="#94a3b8" strokeWidth={1.5} dot={{ r: 3, fill: '#0f172a' }} connectNulls opacity={0.6} />
            <Line type="monotone" dataKey="Peso EWMA" stroke="#38bdf8" strokeWidth={3} dot={false} connectNulls />
            <Line type="monotone" dataKey="Projeção de Peso" stroke="#7dd3fc" strokeWidth={2.5} dot={false} strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Gráficos 2 e 3: Balanço Energético e Macros ─────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-card p-5 pt-6 pb-2">
          <h4 className="text-xs font-bold text-slate-500 mb-6 tracking-widest uppercase ml-2">Balanço Energético Acumulado</h4>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={deficitData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="thermoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
              <YAxis stroke="#64748b" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
              <Bar dataKey="Déficit Diário" barSize={16} fill="#64748b" radius={[4, 4, 0, 0]} opacity={0.5} />
              <Area type="monotone" dataKey="Acúmulo Termodinâmico" fill="url(#thermoGrad)" stroke="#22c55e" strokeWidth={2.5} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5 pt-6 pb-2">
          <h4 className="text-xs font-bold text-slate-500 mb-6 tracking-widest uppercase ml-2">Macronutrientes Primários (Kcal vs Prot)</h4>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={macrosData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dx={10} domain={[0, 'dataMax + 50']} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
              <ReferenceLine y={settings.currentCalorieTarget} yAxisId="left" stroke="#22c55e" strokeDasharray="3 3" opacity={0.5} label={{ value: 'Meta Kcal', fill: '#22c55e', fontSize: 10, position: 'insideTopLeft' }} />
              <ReferenceLine y={targetProtein} yAxisId="right" stroke="#60a5fa" strokeDasharray="3 3" opacity={0.5} label={{ value: `Meta Prot (${targetProtein}g)`, fill: '#60a5fa', fontSize: 10, position: 'insideTopRight' }} />
              <Bar yAxisId="left" dataKey="Kcal Consumida" barSize={16} fill="#475569" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="Proteína (g)" stroke="#60a5fa" strokeWidth={2.5} dot={{ r: 4, fill: '#0f172a' }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Gráficos 4 e 5: Cintura e Radar ─────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-card p-5 pt-6 pb-2">
          <h4 className="text-xs font-bold text-slate-500 mb-6 tracking-widest uppercase ml-2">Tendência de Cintura (EMA 5d)</h4>
          {hasWaistData ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={waistData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
                <YAxis stroke="#64748b" domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                <Line type="monotone" dataKey="Cintura Real" stroke="#cbd5e1" strokeWidth={1.5} dot={{ r: 3, fill: '#0f172a' }} connectNulls opacity={0.6} />
                <Line type="monotone" dataKey="Cintura Tendência" stroke="#a78bfa" strokeWidth={3} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-500 text-sm">
              Registre a circunferência da cintura em pelo menos 3 dias para visualizar a tendência.
            </div>
          )}
        </div>

        <div className="glass-card p-5 pt-6 pb-2 flex flex-col items-center justify-center">
          <h4 className="text-xs font-bold text-slate-500 mb-2 tracking-widest uppercase self-start ml-2 w-full">Radar de Recuperação (7d)</h4>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData} outerRadius="75%" margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <PolarGrid stroke="var(--border-subtle)" />
              <PolarAngleAxis dataKey="subject" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="score" name="Score" stroke="#22d3ee" strokeWidth={2} fill="#22d3ee" fillOpacity={0.25} />
              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
