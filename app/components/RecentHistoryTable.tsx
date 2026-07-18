'use client';

import { Log } from '@/app/hooks/useMetabolicData';
import { formatDateBR } from '@/lib/chartUtils';
import { CheckCircle2, AlertTriangle, Edit2 } from 'lucide-react';

interface RecentHistoryTableProps {
  logs: Log[];
  onEditLog: (log: Log) => void;
}

const PILL_COLORS: Record<string, string> = {
  'Descanso':   'bg-slate-700/60 text-slate-300 border-slate-500/40',
  'Musculação': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'Corrida':    'bg-amber-500/15 text-amber-300 border-amber-500/30',
  'Híbrido':    'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  'Livre':      'bg-purple-500/15 text-purple-300 border-purple-500/30',
};

export default function RecentHistoryTable({ logs, onEditLog }: RecentHistoryTableProps) {
  // logs já vêm em ordem desc (mais recente -> mais antigo)
  return (
    <section className="glass-card p-0 overflow-hidden">
      <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Histórico Recente (Últimos Registros)</h3>
        <span className="text-xs text-slate-500">Scroll horizontal habilitado →</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300 min-w-[900px]">
          <thead className="text-xs uppercase bg-slate-900/40 text-slate-400 border-b border-slate-700/50">
            <tr>
              <th className="p-4 font-semibold tracking-wider sticky left-0 bg-[#0c1322] z-10 w-[140px] shadow-[4px_0_10px_rgba(0,0,0,0.2)]">Data</th>
              <th className="p-4 font-semibold tracking-wider">Peso & Delta</th>
              <th className="p-4 font-semibold tracking-wider">Kcal / Prot</th>
              <th className="p-4 font-semibold tracking-wider">Sono / Água</th>
              <th className="p-4 font-semibold tracking-wider">Natureza</th>
              <th className="p-4 font-semibold tracking-wider w-[80px]">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {logs.map((log, index) => {
              // Verifica completude: peso + kcal + prot (opcional mas bom)
              const isComplete = log.weight !== null && log.caloriesConsumed !== null;

              // Calcula delta de peso em relação ao log anterior na série (que é o log[index + 1])
              const prevLog = logs[index + 1];
              let weightDelta: number | null = null;
              if (log.weight !== null && prevLog?.weight !== null) {
                weightDelta = parseFloat((log.weight - prevLog.weight).toFixed(1));
              }

              return (
                <tr key={log.date} className="hover:bg-slate-700/20 transition-colors group">
                  {/* Coluna 1: Data (Sticky) */}
                  <td className="p-4 font-medium text-slate-300 sticky left-0 bg-[#0d1527] group-hover:bg-[#121c32] z-10 transition-colors shadow-[4px_0_10px_rgba(0,0,0,0.1)]">
                    <div className="flex items-center gap-2.5">
                      {isComplete ? (
                        <span title="Registro completo"><CheckCircle2 className="h-4 w-4 text-emerald-500/80" /></span>
                      ) : (
                        <span title="Registro parcial"><AlertTriangle className="h-4 w-4 text-amber-500/80" /></span>
                      )}
                      <span>{formatDateBR(log.date)}</span>
                    </div>
                  </td>

                  {/* Coluna 2: Peso & Delta */}
                  <td className="p-4">
                    {log.weight !== null ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-white font-medium">{log.weight} kg</span>
                        {weightDelta !== null && (
                          <span className={`text-xs font-semibold ${weightDelta > 0 ? 'text-rose-400' : weightDelta < 0 ? 'text-sky-400' : 'text-slate-500'}`}>
                            {weightDelta > 0 ? '+' : ''}{weightDelta}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>

                  {/* Coluna 3: Kcal / Prot */}
                  <td className="p-4">
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="text-emerald-200">
                        {log.caloriesConsumed !== null ? `${log.caloriesConsumed} kcal` : <span className="text-slate-600">— kcal</span>}
                      </span>
                      <span className="text-blue-200">
                        {log.proteinConsumed !== null ? `${log.proteinConsumed}g prot` : <span className="text-slate-600">— prot</span>}
                      </span>
                    </div>
                  </td>

                  {/* Coluna 4: Sono / Água */}
                  <td className="p-4">
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="text-violet-200">
                        {log.sleepHours !== null ? `${log.sleepHours}h sono` : <span className="text-slate-600">— sono</span>}
                      </span>
                      <span className="text-cyan-200">
                        {log.waterIntake !== null ? `${log.waterIntake}ml água` : <span className="text-slate-600">— água</span>}
                      </span>
                    </div>
                  </td>

                  {/* Coluna 5: Natureza (Pill) */}
                  <td className="p-4">
                    <span className={`px-3 py-1 text-xs font-medium rounded-full border ${PILL_COLORS[log.trainingType] || PILL_COLORS['Descanso']}`}>
                      {log.trainingType}
                    </span>
                  </td>

                  {/* Coluna 6: Ações */}
                  <td className="p-4">
                    <button
                      type="button"
                      onClick={() => onEditLog(log)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                      title="Editar registro"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
