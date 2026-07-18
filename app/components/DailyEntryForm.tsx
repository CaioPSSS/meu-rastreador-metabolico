'use client';

import { FormEvent, useState } from 'react';
import { ChevronDown, CheckCircle2, Circle } from 'lucide-react';
import { LogFormState, Log } from '@/app/hooks/useMetabolicData';

interface DailyEntryFormProps {
  logForm: LogFormState;
  setLogForm: (value: LogFormState) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  isEditing: boolean;
  clientMessage: { type: string; text: string };
  alerts: string[];
  logs: Log[];
}

const TRAINING_OPTIONS = [
  { value: 'Descanso',   label: '😴 Descanso',  color: 'slate' },
  { value: 'Musculação', label: '🏋️ Força',      color: 'blue'  },
  { value: 'Corrida',    label: '🏃 Cardio',     color: 'amber' },
  { value: 'Híbrido',    label: '⚡ Híbrido',    color: 'indigo' },
  { value: 'Livre',      label: '🎉 Livre',      color: 'purple' },
] as const;

const PILL_COLORS: Record<string, string> = {
  slate:  'bg-slate-700/60  border-slate-500/40  text-slate-300  hover:border-slate-400/60',
  blue:   'bg-blue-500/10   border-blue-500/30   text-blue-300   hover:border-blue-400/60',
  amber:  'bg-amber-500/10  border-amber-500/30  text-amber-300  hover:border-amber-400/60',
  indigo: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:border-indigo-400/60',
  purple: 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:border-purple-400/60',
};

const PILL_ACTIVE: Record<string, string> = {
  slate:  'bg-slate-600/70  border-slate-300/70  text-white scale-[1.03]',
  blue:   'bg-blue-500/25   border-blue-400/70   text-white scale-[1.03]',
  amber:  'bg-amber-500/25  border-amber-400/70  text-white scale-[1.03]',
  indigo: 'bg-indigo-500/25 border-indigo-400/70 text-white scale-[1.03]',
  purple: 'bg-purple-500/25 border-purple-400/70 text-white scale-[1.03]',
};

const INPUT_CLASS =
  'w-full bg-[#080d1a] border border-slate-700/70 rounded-xl px-3 py-2.5 text-white placeholder-slate-600 text-sm transition focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30';

const LABEL_CLASS = 'block text-xs uppercase text-slate-500 tracking-wider mb-1';

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-700/50 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-700/40 transition-colors text-sm font-medium text-slate-300"
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div className={`collapse-section ${open ? 'open' : 'closed'}`}>
        <div className="px-4 py-3 space-y-4 bg-slate-900/30">{children}</div>
      </div>
    </div>
  );
}

export default function DailyEntryForm({
  logForm,
  setLogForm,
  onSubmit,
  onReset,
  isEditing,
  clientMessage,
  alerts,
  logs,
}: DailyEntryFormProps) {
  const [showHealth, setShowHealth] = useState(false);
  const [showMental, setShowMental] = useState(false);

  // Completude dos campos primários
  const primaryFields = [
    logForm.weight,
    logForm.caloriesConsumed,
    logForm.proteinConsumed,
    logForm.trainingType !== 'Descanso' ? 'ok' : logForm.trainingType,
    logForm.date,
  ];
  const filledCount = primaryFields.filter(Boolean).length;
  const totalPrimary = primaryFields.length;

  // Aviso de Dia Livre em tempo real
  const freeDaysThisWeek = logForm.trainingType === 'Livre'
    ? logs.slice(0, 7).filter((l) => l.trainingType === 'Livre' && l.date !== logForm.date).length
    : 0;

  const training = TRAINING_OPTIONS.find((t) => t.value === logForm.trainingType);
  const trainingColor = training?.color ?? 'slate';

  return (
    <section className="glass-card p-5 space-y-5 h-fit">

      {/* Cabeçalho do formulário */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
          📝 Log Diário
          {isEditing && (
            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
              Editando
            </span>
          )}
        </h2>
        {/* Indicador de completude */}
        <div className="flex items-center gap-1" title={`${filledCount}/${totalPrimary} campos primários`}>
          {Array.from({ length: totalPrimary }).map((_, i) => (
            i < filledCount
              ? <CheckCircle2 key={i} className="h-3.5 w-3.5 text-emerald-400" />
              : <Circle key={i} className="h-3.5 w-3.5 text-slate-600" />
          ))}
        </div>
      </div>

      {/* Feedback de submissão */}
      {clientMessage.text && (
        <div
          className={`px-4 py-3 rounded-xl text-sm font-medium border animate-fade-in-up ${
            clientMessage.type === 'error'
              ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
          }`}
        >
          {clientMessage.text}
        </div>
      )}

      {/* Alertas clínicos */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
          <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider mb-1.5">Alertas ativos</p>
          <ul className="space-y-1 text-sm text-amber-100/85">
            {alerts.map((alert, i) => (
              <li key={i}>• {alert}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">

        {/* ── Grupo 1: Métricas Primárias (sempre visível) ──────────────────── */}
        <div className="space-y-4">
          <p className="text-xs uppercase text-slate-500 tracking-wider font-semibold">Métricas Primárias</p>

          <div>
            <label className={LABEL_CLASS}>Data de Referência</label>
            <input
              type="date"
              className={INPUT_CLASS}
              value={logForm.date}
              onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>
                Peso <span className="text-slate-600 normal-case">(kg)</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="20"
                max="300"
                placeholder="ex: 82.5"
                className={INPUT_CLASS}
                value={logForm.weight}
                onChange={(e) => setLogForm({ ...logForm, weight: e.target.value })}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>
                Proteína <span className="text-slate-600 normal-case">(g)</span>
              </label>
              <input
                type="number"
                min="0"
                max="600"
                placeholder="ex: 150"
                className={INPUT_CLASS}
                value={logForm.proteinConsumed}
                onChange={(e) => setLogForm({ ...logForm, proteinConsumed: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>
              Calorias <span className="text-slate-600 normal-case">(kcal)</span>
            </label>
            <input
              type="number"
              min="0"
              max="10000"
              placeholder="ex: 2100"
              className={INPUT_CLASS}
              value={logForm.caloriesConsumed}
              onChange={(e) => setLogForm({ ...logForm, caloriesConsumed: e.target.value })}
            />
          </div>

          {/* Tipo de treino como pill buttons */}
          <div>
            <label className={LABEL_CLASS}>Natureza do Dia</label>
            <div className="flex flex-wrap gap-2">
              {TRAINING_OPTIONS.map((opt) => {
                const isActive = logForm.trainingType === opt.value;
                const color = opt.color;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLogForm({ ...logForm, trainingType: opt.value })}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 ${
                      isActive ? PILL_ACTIVE[color] : PILL_COLORS[color]
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Aviso de Dia Livre em tempo real */}
            {logForm.trainingType === 'Livre' && (
              <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg border ${
                freeDaysThisWeek >= 1
                  ? 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                  : 'bg-purple-500/10 border-purple-500/25 text-purple-300'
              }`}>
                {freeDaysThisWeek >= 1
                  ? `⚠️ Dia Livre já usado esta semana (${freeDaysThisWeek}/1). Submissão bloqueada.`
                  : '🎉 Dia Livre disponível — 0/1 usados esta semana.'}
              </div>
            )}
          </div>
        </div>

        {/* ── Grupo 2: Saúde & Recuperação (colapsável) ────────────────────── */}
        <CollapsibleSection
          title="💧 Saúde & Recuperação"
          open={showHealth}
          onToggle={() => setShowHealth((v) => !v)}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Sono (h)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="24"
                placeholder="ex: 7.5"
                className={INPUT_CLASS}
                value={logForm.sleepHours}
                onChange={(e) => setLogForm({ ...logForm, sleepHours: e.target.value })}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Água (ml)</label>
              <input
                type="number"
                min="0"
                max="10000"
                step="100"
                placeholder="ex: 2500"
                className={INPUT_CLASS}
                value={logForm.waterIntake}
                onChange={(e) => setLogForm({ ...logForm, waterIntake: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Cintura (cm)</label>
              <input
                type="number"
                step="0.5"
                min="40"
                max="200"
                placeholder="ex: 88.0"
                className={INPUT_CLASS}
                value={logForm.waistCircumference}
                onChange={(e) => setLogForm({ ...logForm, waistCircumference: e.target.value })}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>
                Gasto Exercício <span className="text-slate-600 normal-case">(kcal)</span>
              </label>
              <input
                type="number"
                min="0"
                max="3000"
                placeholder="ex: 350"
                className={INPUT_CLASS}
                value={logForm.caloriesBurned}
                onChange={(e) => setLogForm({ ...logForm, caloriesBurned: e.target.value })}
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* ── Grupo 3: Estado Mental (colapsável) ───────────────────────────── */}
        <CollapsibleSection
          title="🧠 Estado Mental"
          open={showMental}
          onToggle={() => setShowMental((v) => !v)}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Estresse (1–5)</label>
              <select
                className={INPUT_CLASS}
                value={logForm.stressLevel}
                onChange={(e) => setLogForm({ ...logForm, stressLevel: e.target.value })}
              >
                <option value="1">1 — Muito baixo</option>
                <option value="2">2 — Baixo</option>
                <option value="3">3 — Moderado</option>
                <option value="4">4 — Alto</option>
                <option value="5">5 — Muito alto</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Humor</label>
              <select
                className={INPUT_CLASS}
                value={logForm.mood}
                onChange={(e) => setLogForm({ ...logForm, mood: e.target.value })}
              >
                <option value="Ótimo">Ótimo</option>
                <option value="Bom">Bom</option>
                <option value="Regular">Regular</option>
                <option value="Ruim">Ruim</option>
              </select>
            </div>
          </div>
        </CollapsibleSection>

        {/* ── Botões de ação ─────────────────────────────────────────────────── */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-emerald-500/20 hover:scale-[1.01] active:scale-[0.99] text-sm"
          >
            {isEditing ? '✏️ Atualizar Registro' : '💾 Salvar Dados'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-4 bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 font-semibold rounded-xl transition-colors text-sm border border-slate-600/40"
          >
            Novo
          </button>
        </div>
      </form>
    </section>
  );
}
