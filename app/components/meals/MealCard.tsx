'use client';

import { useState } from 'react';
import {
  ChevronDown,
  Plus,
  Zap,
  Camera,
  Trash2,
  Edit2,
  Flame,
} from 'lucide-react';

export interface MealItemData {
  id: string;
  mealId: string;
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  isQuickAdd: boolean;
}

export interface MealData {
  id: string;
  date: string;
  name: string;
  order: number;
  items: MealItemData[];
}

interface MealCardProps {
  meal: MealData;
  date: string;
  isDuplicate?: boolean;
  onOpenAddFood: (meal: MealData) => void;
  onOpenQuickAdd: (meal: MealData) => void;
  onOpenVision: (meal: MealData) => void;
  onItemDeleted: () => void;
  onMealDeleted: (mealId: string) => void;
}

export default function MealCard({
  meal,
  isDuplicate,
  onOpenAddFood,
  onOpenQuickAdd,
  onOpenVision,
  onItemDeleted,
  onMealDeleted,
}: MealCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Totais da refeição
  const mealCalories = Math.round(meal.items.reduce((sum, item) => sum + (item.calories || 0), 0));
  const mealProtein = Math.round(meal.items.reduce((sum, item) => sum + (item.protein || 0), 0) * 10) / 10;
  const mealCarbs = Math.round(meal.items.reduce((sum, item) => sum + (item.carbs || 0), 0) * 10) / 10;
  const mealFat = Math.round(meal.items.reduce((sum, item) => sum + (item.fat || 0), 0) * 10) / 10;

  const handleDeleteItem = async (itemId: string) => {
    setDeletingItemId(itemId);
    try {
      const res = await fetch(`/api/meals/items/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        onItemDeleted();
      }
    } catch (err) {
      console.error('Erro ao excluir item:', err);
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleStartEditItem = (item: MealItemData) => {
    setEditingItemId(item.id);
    setEditAmount(item.amount.toString());
  };

  const handleSaveEditAmount = async (item: MealItemData) => {
    const newAmount = Number(editAmount);
    if (!newAmount || newAmount <= 0) {
      setEditingItemId(null);
      return;
    }

    const scale = newAmount / (item.amount || 1);
    try {
      const res = await fetch(`/api/meals/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: newAmount,
          calories: Math.round(item.calories * scale * 10) / 10,
          protein: Math.round(item.protein * scale * 10) / 10,
          carbs: Math.round(item.carbs * scale * 10) / 10,
          fat: Math.round(item.fat * scale * 10) / 10,
        }),
      });

      if (res.ok) {
        onItemDeleted(); // Atualiza refeições
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEditingItemId(null);
    }
  };

  const handleDeleteMeal = async () => {
    if (confirm(`Tem certeza que deseja excluir a refeição "${meal.name}"?`)) {
      try {
        await fetch(`/api/meals/${meal.id}`, { method: 'DELETE' });
        onMealDeleted(meal.id);
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden transition-all shadow-md hover:border-slate-700/80">
      {/* ── Header da Refeição ──────────────────────────────────────────────── */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
            />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-100 text-sm sm:text-base">{meal.name}</h3>
              {meal.items.length > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-medium">
                  {meal.items.length} {meal.items.length === 1 ? 'item' : 'itens'}
                </span>
              )}
            </div>
            {/* Totais do Card */}
            <div className="flex items-center gap-2 text-xs mt-0.5">
              <span className="font-bold text-emerald-400 flex items-center gap-0.5">
                <Flame className="h-3 w-3" /> {mealCalories} kcal
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-blue-400 font-medium">{mealProtein}g P</span>
              <span className="text-slate-600">·</span>
              <span className="text-amber-400 font-medium">{mealCarbs}g C</span>
              <span className="text-slate-600">·</span>
              <span className="text-rose-400 font-medium">{mealFat}g G</span>
            </div>
          </div>
        </div>

        {/* Botões de Ação da Refeição */}
        <div className="flex items-center gap-1.5 self-end sm:self-center">
          <button
            type="button"
            onClick={() => onOpenVision(meal)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 text-xs font-semibold transition"
            title="Estimar Prato por Foto (IA Visão)"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Foto</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenQuickAdd(meal)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 text-xs font-semibold transition"
            title="Adição Rápida de Calorias/Macros"
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rápido</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenAddFood(meal)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Alimento</span>
          </button>

          {/* Opção de excluir refeição se for personalizada e vazia ou duplicada */}
          {meal.items.length === 0 && (meal.order >= 4 || isDuplicate) && (
            <button
              type="button"
              onClick={handleDeleteMeal}
              className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition"
              title="Excluir refeição vazia"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Lista de Alimentos da Refeição ─────────────────────────────────── */}
      {isOpen && (
        <div className="divide-y divide-slate-800/40">
          {meal.items.length > 0 ? (
            meal.items.map((item) => (
              <div
                key={item.id}
                className="p-3 sm:px-4 sm:py-2.5 flex items-center justify-between hover:bg-slate-800/20 transition text-xs"
              >
                <div className="min-w-0 pr-3 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-200 truncate">
                      {item.name}
                    </span>
                    {item.isQuickAdd && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/15 text-amber-300 font-medium">
                        Rápido
                      </span>
                    )}
                  </div>

                  {/* Edição inline da quantidade */}
                  {editingItemId === item.id ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        min="1"
                        autoFocus
                        className="w-16 bg-[#080d1a] border border-indigo-500 rounded px-1.5 py-0.5 text-white text-xs"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEditAmount(item);
                          if (e.key === 'Escape') setEditingItemId(null);
                        }}
                      />
                      <span className="text-slate-400">{item.unit}</span>
                      <button
                        type="button"
                        onClick={() => handleSaveEditAmount(item)}
                        className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingItemId(null)}
                        className="px-1.5 py-0.5 text-slate-400 hover:text-white text-[10px]"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-0.5 text-slate-400">
                      <button
                        type="button"
                        onClick={() => handleStartEditItem(item)}
                        className="hover:text-indigo-300 hover:underline flex items-center gap-0.5"
                      >
                        <span>
                          {item.amount} {item.unit}
                        </span>
                        <Edit2 className="h-2.5 w-2.5 opacity-60" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Macros do Item */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="font-bold text-slate-200 block">
                      {Math.round(item.calories)} kcal
                    </span>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5 justify-end">
                      <span className="text-blue-400">{item.protein}g P</span>
                      <span className="text-amber-400">{item.carbs}g C</span>
                      <span className="text-rose-400">{item.fat}g G</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={deletingItemId === item.id}
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition"
                    title="Remover item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-slate-500 text-xs">
              Nenhum alimento cadastrado nesta refeição.{' '}
              <button
                type="button"
                onClick={() => onOpenAddFood(meal)}
                className="text-indigo-400 hover:underline font-medium"
              >
                Adicionar primeiro item
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
