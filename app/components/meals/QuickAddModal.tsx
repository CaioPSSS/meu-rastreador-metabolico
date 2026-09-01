'use client';

import { useState } from 'react';
import { X, Zap, Flame, Dumbbell, Wheat, Droplet } from 'lucide-react';
import ModalPortal from '../ModalPortal';

interface QuickAddModalProps {
  mealName: string;
  mealId: string;
  date: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const INPUT_CLASS =
  'w-full bg-[#080d1a] border border-slate-700/70 rounded-xl px-3 py-2 text-white placeholder-slate-600 text-sm transition focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30';
const LABEL_CLASS = 'block text-xs uppercase text-slate-400 font-semibold tracking-wider mb-1';

export default function QuickAddModal({
  mealName,
  mealId,
  date,
  isOpen,
  onClose,
  onSuccess,
}: QuickAddModalProps) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calories) {
      setError('Informe ao menos a quantidade de calorias.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_item',
          mealId,
          date,
          name: name.trim() || 'Adição Rápida',
          amount: 1,
          unit: 'porção',
          calories: Number(calories),
          protein: Number(protein) || 0,
          carbs: Number(carbs) || 0,
          fat: Number(fat) || 0,
          isQuickAdd: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao adicionar item.');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar adição rápida.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl space-y-5 my-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-400">
              <Zap className="h-5 w-5" />
              <h3 className="text-lg font-bold text-white">Adição Rápida</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-xs text-slate-400">
            Adicionando diretamente ao <strong className="text-slate-200">{mealName}</strong> sem detalhar ingredientes.
          </p>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-300 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={LABEL_CLASS}>Descrição (Opcional)</label>
              <input
                type="text"
                placeholder="Ex: Almoço fora de casa / Salgado"
                className={INPUT_CLASS}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>
                Calorias (kcal) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Flame className="absolute left-3.5 top-2.5 h-4 w-4 text-emerald-400" />
                <input
                  type="number"
                  step="1"
                  required
                  placeholder="0"
                  className={`${INPUT_CLASS} pl-10 text-emerald-400 font-bold text-base`}
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={LABEL_CLASS}>Proteína (g)</label>
                <div className="relative">
                  <Dumbbell className="absolute left-3 top-2.5 h-3.5 w-3.5 text-blue-400" />
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0"
                    className={`${INPUT_CLASS} pl-8 text-blue-400 font-semibold`}
                    value={protein}
                    onChange={(e) => setProtein(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Carbo (g)</label>
                <div className="relative">
                  <Wheat className="absolute left-3 top-2.5 h-3.5 w-3.5 text-amber-400" />
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0"
                    className={`${INPUT_CLASS} pl-8 text-amber-400 font-semibold`}
                    value={carbs}
                    onChange={(e) => setCarbs(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Gordura (g)</label>
                <div className="relative">
                  <Droplet className="absolute left-3 top-2.5 h-3.5 w-3.5 text-rose-400" />
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0"
                    className={`${INPUT_CLASS} pl-8 text-rose-400 font-semibold`}
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-bold rounded-xl text-sm transition shadow-lg hover:shadow-amber-500/20 disabled:opacity-50"
              >
                {submitting ? 'Salvando...' : 'Confirmar Adição'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
