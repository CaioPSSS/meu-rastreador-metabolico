'use client';

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Log, Settings } from '@/app/hooks/useMetabolicData';

interface MetabolicChartsProps {
  logs: Log[];
  settings: Settings;
}

function calculateEMA(values: Array<number | null>, period = 7): Array<number | null> {
  const alpha = 2 / (period + 1);
  const ema: Array<number | null> = [];
  let previous: number | null = null;

  for (const value of values) {
    if (value === null) {
      ema.push(previous);
      continue;
    }

    previous = previous === null ? value : previous + alpha * (value - previous);
    ema.push(parseFloat(previous.toFixed(2)));
  }

  return ema;
}

export default function MetabolicCharts({ logs, settings }: MetabolicChartsProps) {
  const orderedLogs = [...logs].reverse();
  const weightSeries = orderedLogs.map((log) => (typeof log.weight === 'number' ? log.weight : null));
  const emaSeries = calculateEMA(weightSeries, 7);

  const chartData = orderedLogs.map((log, index) => ({
    data: log.date.substring(5, 10).replace('-', '/'),
    'Peso Real': log.weight,
    'EMA de Peso': emaSeries[index],
    'Consumo Ingerido': log.caloriesConsumed,
    'Meta Diária': settings.currentCalorieTarget,
    'Gasto Exercício': log.caloriesBurned || 0,
  }));

  return (
    <div className="lg:col-span-2 space-y-8">
      <div className="bg-slate-800 border border-slate-700 p-4 sm:p-6 rounded-2xl h-80 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Tendência de Peso Corpóreo (EMA de 7 Dias)</h3>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="data" stroke="#94a3b8" />
            <YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke="#94a3b8" />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }} />
            <Legend />
            <Line type="monotone" dataKey="EMA de Peso" stroke="#60a5fa" strokeWidth={3} dot={false} connectNulls />
            <Line type="linear" dataKey="Peso Real" stroke="#475569" strokeWidth={1} strokeDasharray="4 4" connectNulls dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-800 border border-slate-700 p-4 sm:p-6 rounded-2xl h-80 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Adesão Calórica Diária vs Teto do Modelo Adaptativo</h3>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="data" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }} />
            <Legend />
            <ReferenceLine y={settings.currentCalorieTarget} stroke="#f87171" strokeDasharray="3 3" label="Meta" />
            <Bar dataKey="Consumo Ingerido" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={40} name="Ingerido (kcal)" />
            <Bar dataKey="Gasto Exercício" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={40} name="Gasto Treino (kcal)" />
            <Line type="monotone" dataKey="Meta Diária" stroke="#f87171" strokeWidth={2} dot={false} name="Meta do App" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
