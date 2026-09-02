'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Utensils,
  Plus,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import MacroSummaryBar from './MacroSummaryBar';
import MealCard, { MealData } from './MealCard';
import FoodSearchModal from './FoodSearchModal';
import BarcodeScannerModal from './BarcodeScannerModal';
import NutritionOcrModal from './NutritionOcrModal';
import MealVisionModal from './MealVisionModal';
import QuickAddModal from './QuickAddModal';
import CustomFoodModal from './CustomFoodModal';
import { CatalogFoodItem } from '@/lib/foodCatalog/search';

export interface MealTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

interface MealTrackerProps {
  selectedDate: string;
  onDateChange?: (newDate: string) => void;
  calorieTarget: number;
  userWeight?: number | null;
  onMealsUpdated?: () => void;
  onTotalsChange?: (totals: MealTotals) => void;
}

export default function MealTracker({
  selectedDate,
  onDateChange,
  calorieTarget,
  userWeight,
  onMealsUpdated,
  onTotalsChange,
}: MealTrackerProps) {
  const [meals, setMeals] = useState<MealData[]>([]);
  const [totals, setTotals] = useState<MealTotals>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  });
  const [loading, setLoading] = useState(true);

  // Estados dos Modais
  const [activeMealForAdd, setActiveMealForAdd] = useState<MealData | null>(null);
  const [activeMealForQuickAdd, setActiveMealForQuickAdd] = useState<MealData | null>(null);
  const [activeMealForVision, setActiveMealForVision] = useState<MealData | null>(null);
  const [showFoodSearch, setShowFoodSearch] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showNutritionOcr, setShowNutritionOcr] = useState(false);
  const [showMealVision, setShowMealVision] = useState(false);
  const [showCustomFood, setShowCustomFood] = useState(false);
  const [preloadedFood, setPreloadedFood] = useState<CatalogFoodItem | null>(null);

  // Modal para criar nova refeição personalizada
  const [showNewMealDialog, setShowNewMealDialog] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [creatingMeal, setCreatingMeal] = useState(false);

  const loadMeals = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meals?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setMeals(data.meals || []);
        const loadedTotals = data.totals || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
        setTotals(loadedTotals);
        if (onTotalsChange) {
          onTotalsChange(loadedTotals);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar refeições:', err);
    } finally {
      setLoading(false);
    }
  }, [onTotalsChange]);

  useEffect(() => {
    void loadMeals(selectedDate);
  }, [selectedDate, loadMeals]);

  const handleMealsChanged = async () => {
    await loadMeals(selectedDate);
    if (onMealsUpdated) {
      onMealsUpdated();
    }
  };

  // Navegação de Datas
  const handleShiftDate = (days: number) => {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setDate(d.getDate() + days);
    const isoString = d.toISOString().slice(0, 10);
    if (onDateChange) {
      onDateChange(isoString);
    }
  };

  const handleOpenAddFood = (meal: MealData) => {
    setActiveMealForAdd(meal);
    setPreloadedFood(null);
    setShowFoodSearch(true);
  };

  const handleOpenQuickAdd = (meal: MealData) => {
    setActiveMealForQuickAdd(meal);
  };

  const handleFoodFoundViaBarcode = (food: CatalogFoodItem) => {
    setShowBarcodeScanner(false);
    setPreloadedFood(food);
    setShowFoodSearch(true);
  };

  const handleFoodExtractedViaOcr = (food: CatalogFoodItem) => {
    setShowNutritionOcr(false);
    setPreloadedFood(food);
    setShowFoodSearch(true);
  };

  const handleCustomFoodCreated = (food: CatalogFoodItem) => {
    setShowCustomFood(false);
    setPreloadedFood(food);
    setShowFoodSearch(true);
  };

  const handleCreateNewMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMealName.trim()) return;

    setCreatingMeal(true);
    try {
      const res = await fetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_meal',
          date: selectedDate,
          name: newMealName.trim(),
        }),
      });

      if (res.ok) {
        setNewMealName('');
        setShowNewMealDialog(false);
        await handleMealsChanged();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingMeal(false);
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const isToday = selectedDate === todayIso;

  return (
    <section className="space-y-5">
      {/* ── Topo da Seção de Refeições ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-indigo-500/30 text-indigo-300">
            <Utensils className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              Diário de Refeições & Macros
            </h2>
            <p className="text-xs text-slate-400">
              Rastreamento detalhado por alimento com leitor de código de barras e IA
            </p>
          </div>
        </div>

        {/* Seletor de Data */}
        <div className="flex items-center gap-1.5 self-start sm:self-center bg-slate-900/80 border border-slate-800 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => handleShiftDate(-1)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Dia anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-slate-200">
            <Calendar className="h-3.5 w-3.5 text-indigo-400" />
            <span>
              {isToday
                ? 'Hoje'
                : new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                  })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleShiftDate(1)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Próximo dia"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Barra de Resumo de Macros e Calorias ───────────────────────────── */}
      <MacroSummaryBar
        totals={totals}
        calorieTarget={calorieTarget}
        userWeight={userWeight}
      />

      {/* ── Lista de Cards de Refeições ────────────────────────────────────── */}
      <div className="space-y-3.5">
        {loading && meals.length === 0 ? (
          <div className="flex items-center justify-center p-8 text-slate-500 text-xs gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" /> Carregando refeições...
          </div>
        ) : (
          meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              date={selectedDate}
              onOpenAddFood={handleOpenAddFood}
              onOpenQuickAdd={handleOpenQuickAdd}
              onOpenVision={(m) => {
                setActiveMealForVision(m);
                setShowMealVision(true);
              }}
              onItemDeleted={handleMealsChanged}
              onMealDeleted={handleMealsChanged}
            />
          ))
        )}

        {/* Botão de Adicionar Nova Refeição Customizada */}
        <div className="pt-1">
          {!showNewMealDialog ? (
            <button
              type="button"
              onClick={() => setShowNewMealDialog(true)}
              className="w-full py-3 border border-dashed border-slate-700/80 hover:border-indigo-500/60 rounded-2xl text-xs font-semibold text-slate-400 hover:text-indigo-300 hover:bg-slate-900/40 transition flex items-center justify-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Adicionar Outra Refeição (ex: Ceia, Pré-treino)</span>
            </button>
          ) : (
            <form
              onSubmit={handleCreateNewMeal}
              className="p-4 bg-slate-900/80 border border-indigo-500/30 rounded-2xl space-y-3 animate-fade-in-up"
            >
              <label className="block text-xs uppercase text-slate-400 font-semibold tracking-wider">
                Nome da Nova Refeição
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ex: Ceia Noturna / Pré-treino"
                  autoFocus
                  required
                  className="flex-1 bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                  value={newMealName}
                  onChange={(e) => setNewMealName(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={creatingMeal || !newMealName.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition disabled:opacity-50"
                >
                  {creatingMeal ? 'Criando...' : 'Criar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewMealDialog(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ── Modais Conectados ──────────────────────────────────────────────── */}
      {activeMealForAdd && (
        <FoodSearchModal
          mealName={activeMealForAdd.name}
          mealId={activeMealForAdd.id}
          date={selectedDate}
          isOpen={showFoodSearch}
          onClose={() => {
            setShowFoodSearch(false);
            setActiveMealForAdd(null);
            setPreloadedFood(null);
          }}
          onSuccess={handleMealsChanged}
          onOpenBarcode={() => setShowBarcodeScanner(true)}
          onOpenOcr={() => setShowNutritionOcr(true)}
          onOpenVision={() => {
            setActiveMealForVision(activeMealForAdd);
            setShowMealVision(true);
          }}
          onOpenCustomFood={() => setShowCustomFood(true)}
          selectedFoodPreload={preloadedFood}
        />
      )}

      {activeMealForQuickAdd && (
        <QuickAddModal
          mealName={activeMealForQuickAdd.name}
          mealId={activeMealForQuickAdd.id}
          date={selectedDate}
          isOpen={true}
          onClose={() => setActiveMealForQuickAdd(null)}
          onSuccess={handleMealsChanged}
        />
      )}

      {activeMealForVision && (
        <MealVisionModal
          mealName={activeMealForVision.name}
          mealId={activeMealForVision.id}
          date={selectedDate}
          isOpen={showMealVision}
          onClose={() => {
            setShowMealVision(false);
            setActiveMealForVision(null);
          }}
          onSuccess={handleMealsChanged}
        />
      )}

      <BarcodeScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onFoodFound={handleFoodFoundViaBarcode}
        onOpenOcr={() => {
          setShowBarcodeScanner(false);
          setShowNutritionOcr(true);
        }}
      />

      <NutritionOcrModal
        isOpen={showNutritionOcr}
        onClose={() => setShowNutritionOcr(false)}
        onFoodExtracted={handleFoodExtractedViaOcr}
      />

      <CustomFoodModal
        isOpen={showCustomFood}
        onClose={() => setShowCustomFood(false)}
        onSuccess={handleCustomFoodCreated}
      />
    </section>
  );
}
