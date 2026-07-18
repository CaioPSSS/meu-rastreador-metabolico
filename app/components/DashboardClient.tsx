'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Bell, Flame, TrendingDown, TrendingUp, Heart, Zap } from 'lucide-react';
import OnboardingForm from './OnboardingForm';
import DailyEntryForm from './DailyEntryForm';
import MetabolicCharts from './MetabolicCharts';
import RecentHistoryTable from './RecentHistoryTable';
import { useMetabolicData, Log, Settings, LogFormState, SetupFormState } from '@/app/hooks/useMetabolicData';
import { getYesterdayLocalISODate } from '@/lib/dateUtils';
import { average, calcStreak, clamp, CALORIE_COMPLIANCE_MARGIN } from '@/lib/chartUtils';

interface DashboardClientProps {
  initialSettings: Settings | null;
  initialLogs: Log[];
  initialInsights: string[];
}

const initialSetupForm: SetupFormState = {
  age: '',
  height: '',
  weight: '',
  gender: 'M',
  activityLevel: '1.375',
  goal: 'loss',
  weeklyRate: '-0.5',
};

const initialLogForm: LogFormState = {
  date: getYesterdayLocalISODate(),
  weight: '',
  caloriesConsumed: '',
  caloriesBurned: '',
  trainingType: 'Descanso',
  sleepHours: '',
  waterIntake: '',
  stressLevel: '3',
  mood: 'Regular',
  proteinConsumed: '',
  waistCircumference: '',
};

interface AiReportSummary {
  id: string;
  createdAt: string;
  content: string;
  isRead: boolean;
}

// ── Cálculo do countdown de próximo recálculo ────────────────────────────────
function calcDaysToRecalc(lastRecalcAt: string | null): number | null {
  if (!lastRecalcAt) return null;
  const ms = new Date().getTime() - new Date(lastRecalcAt).getTime();
  const daysSince = Math.floor(ms / 86_400_000);
  const remaining = 7 - daysSince;
  return remaining > 0 ? remaining : 0;
}

// ── Componente de Loading Animado ────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-2 h-8 rounded-full bg-emerald-500/60"
            style={{ animation: `softPulse 1.2s ease-in-out ${i * 0.15}s infinite` }}
          />
        ))}
      </div>
      <p className="text-slate-400 text-sm tracking-widest uppercase">Sincronizando dados metabólicos</p>
    </div>
  );
}

// ── Barra de Progresso Calórica ──────────────────────────────────────────────
function CalorieProgressBar({
  consumed,
  target,
  date,
}: {
  consumed: number | null;
  target: number;
  date: string;
}) {
  if (consumed === null) return null;

  const pct = clamp(Math.round((consumed / target) * 100), 0, 120);
  const isOver = consumed > target * 1.1;
  const isNear = consumed > target * 0.9;

  const barColor = isOver
    ? 'bg-rose-500'
    : isNear
    ? 'bg-amber-400'
    : 'bg-emerald-400';

  const textColor = isOver ? 'text-rose-400' : isNear ? 'text-amber-300' : 'text-emerald-300';

  const dayLabel = date === new Date().toISOString().slice(0, 10) ? 'hoje' : 'ontem';

  return (
    <div className="px-1 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
      <div className="flex items-center justify-between mb-1.5 text-xs text-slate-400">
        <span className="uppercase tracking-wider">Calorias {dayLabel}</span>
        <span className={`font-semibold ${textColor}`}>
          {consumed.toLocaleString('pt-BR')} / {target.toLocaleString('pt-BR')} kcal
          <span className="ml-2 text-slate-500">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── KPI Badge ────────────────────────────────────────────────────────────────
function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null;
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-sm font-semibold">
      <Flame className="h-4 w-4" />
      <span>{streak}d</span>
    </div>
  );
}

function RecalcBadge({ daysToRecalc }: { daysToRecalc: number | null }) {
  if (daysToRecalc === null) return null;
  const urgent = daysToRecalc <= 1;
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
        urgent
          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
          : 'bg-slate-700/50 border-slate-600/40 text-slate-400'
      }`}
    >
      <Zap className="h-3.5 w-3.5" />
      {daysToRecalc === 0 ? 'Recálculo pendente' : `Recálculo em ${daysToRecalc}d`}
    </div>
  );
}

// ── Macro do Dia Mais Recente ────────────────────────────────────────────────
function TodayMacroBar({ log }: { log: Log }) {
  const items = [
    log.caloriesConsumed !== null && { label: 'Kcal', value: `${log.caloriesConsumed}`, color: 'text-emerald-400' },
    log.proteinConsumed !== null && { label: 'Proteína', value: `${log.proteinConsumed}g`, color: 'text-blue-400' },
    log.sleepHours !== null && { label: 'Sono', value: `${log.sleepHours}h`, color: 'text-violet-400' },
    log.waterIntake !== null && { label: 'Água', value: `${log.waterIntake}ml`, color: 'text-cyan-400' },
    log.weight !== null && { label: 'Peso', value: `${log.weight}kg`, color: 'text-sky-300' },
  ].filter(Boolean) as { label: string; value: string; color: string }[];

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs px-1">
      <span className="text-slate-500 uppercase tracking-wider">
        {log.date === new Date().toISOString().slice(0, 10) ? 'Hoje' : 'Ontem'} —
      </span>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1">
          <span className="text-slate-500">{item.label}:</span>
          <span className={`font-semibold ${item.color}`}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

// ── Componente Principal ─────────────────────────────────────────────────────
export default function DashboardClient({ initialSettings, initialLogs, initialInsights }: DashboardClientProps) {
  const { settings, logs, insights, loading, error, refresh, addLog } = useMetabolicData(
    initialSettings,
    initialLogs,
    initialInsights,
  );

  const [setupForm, setSetupForm] = useState<SetupFormState>(initialSetupForm);
  const [logForm, setLogForm] = useState(initialLogForm);
  const [clientMessage, setClientMessage] = useState({ type: '', text: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [unreadReport, setUnreadReport] = useState<AiReportSummary | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadUnreadReport = async () => {
      try {
        const response = await fetch('/api/reports/unread');
        if (!response.ok) return;
        const data = await response.json();
        setUnreadReport(data.report ?? null);
      } catch (err) {
        console.error('Falha ao buscar relatório não lido.', err);
      }
    };
    void loadUnreadReport();
  }, []);

  // ── Computações derivadas ─────────────────────────────────────────────────
  const recentLogs = logs.slice(0, 7);
  const recentCalories = recentLogs.map((l) => l.caloriesConsumed).filter((c): c is number => c !== null);
  const recentSleep = recentLogs.map((l) => l.sleepHours).filter((s): s is number => s !== null);
  const recentWater = recentLogs.map((l) => l.waterIntake).filter((w): w is number => w !== null);
  const recentStress = recentLogs.map((l) => l.stressLevel).filter((s): s is number => s !== null);
  const recentWeights = recentLogs.map((l) => l.weight).filter((w): w is number => w !== null);

  const streak = calcStreak(logs);
  const daysToRecalc = settings ? calcDaysToRecalc(settings.lastRecalcAt) : null;

  // Log mais recente para o mini-resumo e barra calórica
  const latestLog = logs[0] ?? null;
  const todayCalories = latestLog?.caloriesConsumed ?? null;

  // ── Alertas clínicos ──────────────────────────────────────────────────────
  const alerts: string[] = [];

  if (settings && recentCalories.length >= 3) {
    const avgCal = average(recentCalories);
    if (avgCal > settings.currentCalorieTarget + CALORIE_COMPLIANCE_MARGIN) {
      alerts.push('A ingestão média está acima da meta. Revisite o planejamento das refeições.');
    } else if (avgCal < settings.currentCalorieTarget - CALORIE_COMPLIANCE_MARGIN) {
      alerts.push('A ingestão média está abaixo do alvo. Revise a consistência e a recuperação.');
    }
  }
  if (recentSleep.length >= 3 && average(recentSleep) < 7) {
    alerts.push('O sono da semana está abaixo de 7 horas. Isso pode prejudicar a recuperação.');
  }
  if (recentWater.length >= 3 && average(recentWater) < 2000) {
    alerts.push('A hidratação média está baixa. Um ajuste de água pode melhorar o desempenho.');
  }
  if (recentStress.length >= 3 && average(recentStress) >= 4) {
    alerts.push('O estresse da semana está alto. Uma rotina mais leve pode ajudar.');
  }
  if (recentWeights.length === 0) {
    alerts.push('Ainda não há pesos recentes para avaliar a tendência.');
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSetupSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientMessage({ type: '', text: '' });
    await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setupForm),
    });
    await refresh();
  };

  const resetLogForm = () => {
    setLogForm({ ...initialLogForm, date: getYesterdayLocalISODate() });
    setIsEditing(false);
    setClientMessage({ type: '', text: '' });
  };

  const handleEditLog = (log: Log) => {
    setLogForm({
      date: log.date,
      weight: log.weight?.toString() || '',
      caloriesConsumed: log.caloriesConsumed?.toString() || '',
      caloriesBurned: log.caloriesBurned?.toString() || '',
      trainingType: log.trainingType,
      sleepHours: log.sleepHours?.toString() || '',
      waterIntake: log.waterIntake?.toString() || '',
      stressLevel: log.stressLevel?.toString() || '3',
      mood: log.mood || 'Regular',
      proteinConsumed: log.proteinConsumed?.toString() || '',
      waistCircumference: log.waistCircumference?.toString() || '',
    });
    setIsEditing(true);
    setClientMessage({ type: 'info', text: `Modo de edição ativado para ${log.date}.` });
  };

  const handleLogSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setClientMessage({ type: '', text: '' });

    if (logForm.trainingType === 'Livre') {
      const freeDaysCount = logs
        .slice(0, 7)
        .filter((l) => l.trainingType === 'Livre' && l.date !== logForm.date).length;
      if (freeDaysCount >= 1) {
        setClientMessage({ type: 'error', text: 'Atenção: Você já utilizou um Dia Livre nos últimos 7 dias. Foque na constância!' });
        return;
      }
    }

    try {
      await addLog(logForm);
      setClientMessage({
        type: 'success',
        text: isEditing ? 'Registro atualizado com sucesso.' : 'Dados computados com sucesso! O algoritmo recalculou seu progresso.',
      });
      resetLogForm();
    } catch {
      setClientMessage({ type: 'error', text: 'Falha ao salvar o registro. Verifique a conexão e tente novamente.' });
    }
  };

  const handleCloseReport = async () => {
    if (!unreadReport || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await fetch(`/api/reports/${unreadReport.id}/read`, { method: 'POST' });
    } catch (err) {
      console.error('Falha ao marcar relatório como lido.', err);
    } finally {
      setShowModal(false);
      setUnreadReport(null);
      setIsSubmitting(false);
    }
  };

  // ── Estados de erro / loading / onboarding ────────────────────────────────
  if (loading) return <LoadingScreen />;

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-xl text-rose-400">
        {error}
      </div>
    );
  }

  if (!settings) {
    return <OnboardingForm setupForm={setupForm} setSetupForm={setSetupForm} onSubmit={handleSetupSubmit} />;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in-up">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="glass-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-emerald-400 to-cyan-400">
              Metabolic Tracker
            </h1>
            <p className="text-slate-500 text-xs mt-0.5 tracking-wide">
              Motor híbrido adaptativo — sincronizado com Vercel
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <StreakBadge streak={streak} />
            <RecalcBadge daysToRecalc={daysToRecalc} />

            {/* Sino de relatório */}
            <button
              type="button"
              onClick={() => unreadReport !== null && setShowModal(true)}
              className="relative rounded-full border border-slate-700/70 bg-slate-900/70 p-2.5 text-slate-200 transition-all hover:border-cyan-400 hover:text-cyan-300 hover:scale-105"
              aria-label="Abrir relatório clínico"
            >
              <Bell className={`h-5 w-5 ${unreadReport ? 'animate-soft-pulse' : ''}`} />
              {unreadReport && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 animate-soft-pulse" />
              )}
            </button>

            {/* Meta calórica */}
            <div className="bg-slate-900/60 border border-emerald-500/20 px-4 py-2.5 rounded-xl text-center shadow-[0_0_15px_rgba(52,211,153,0.07)]">
              <span className="text-xs uppercase text-slate-400 block tracking-wider">Meta Atual</span>
              <span className="text-2xl font-black text-emerald-400">
                {settings.currentCalorieTarget.toLocaleString('pt-BR')} kcal
              </span>
            </div>
          </div>
        </div>

        {/* Barra de progresso calórica + macro do dia */}
        {latestLog && (
          <div className="space-y-2.5 pt-1 border-t border-slate-800/60">
            <CalorieProgressBar
              consumed={todayCalories}
              target={settings.currentCalorieTarget}
              date={latestLog.date}
            />
            <TodayMacroBar log={latestLog} />
          </div>
        )}
      </header>

      {/* ── Modal de Relatório ──────────────────────────────────────────────── */}
      {showModal && unreadReport !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-fade-in-up">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Análise Clínica Semanal</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-100">Relatório de recuperação e performance</h2>
              </div>
              <button
                type="button"
                onClick={handleCloseReport}
                disabled={isSubmitting}
                className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ciente. Fechar e Arquivar.
              </button>
            </div>
            <div className="mt-5 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                {unreadReport.content}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Insights Automáticos ────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <section className="glass-card p-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            Insights Automáticos da Semana
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {insights.map((insight, i) => (
              <p
                key={i}
                className="text-slate-300 text-sm leading-6 pl-3 border-l-2 border-slate-700 animate-fade-in-up"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {insight}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* ── Grid Principal: Formulário + Gráficos ──────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <DailyEntryForm
          logForm={logForm}
          setLogForm={setLogForm}
          onSubmit={handleLogSubmit}
          onReset={resetLogForm}
          isEditing={isEditing}
          clientMessage={clientMessage}
          alerts={alerts}
          logs={logs}
        />

        <MetabolicCharts logs={logs} settings={settings} />
      </div>

      {/* ── Tabela de Histórico ─────────────────────────────────────────────── */}
      <RecentHistoryTable logs={logs} onEditLog={handleEditLog} />
    </main>
  );
}
