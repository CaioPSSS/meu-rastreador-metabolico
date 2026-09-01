'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  X,
  Search,
  Camera,
  Sparkles,
  Plus,
  Dumbbell,
  Wheat,
  Droplet,
  Flame,
  Check,
  ChevronLeft,
} from 'lucide-react';
import { CatalogFoodItem } from '@/lib/foodCatalog/search';
import ModalPortal from '../ModalPortal';

interface FoodSearchModalProps {
  mealName: string;
  mealId: string;
  date: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onOpenBarcode: () => void;
  onOpenOcr: () => void;
  onOpenVision: () => void;
  onOpenCustomFood: () => void;
  selectedFoodPreload?: CatalogFoodItem | null;
}

const CATEGORIES = [
  'Todos',
  'Aves',
  'Carnes Bovinas',
  'Peixes & Frutos do Mar',
  'Ovos & Laticínios',
  'Grãos & Cereais',
  'Leguminosas',
  'Pães & Massas',
  'Tubérculos & Raízes',
  'Frutas',
  'Vegetais & Legumes',
  'Suplementos',
  'Gorduras & Oleaginosas',
  'Personalizados',
];

export default function FoodSearchModal({
  mealName,
  mealId,
  date,
  isOpen,
  onClose,
  onSuccess,
  onOpenBarcode,
  onOpenOcr,
  onOpenVision,
  onOpenCustomFood,
  selectedFoodPreload,
}: FoodSearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [foods, setFoods] = useState<CatalogFoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  // Alimento selecionado para pesagem/porção
  const [selectedFood, setSelectedFood] = useState<CatalogFoodItem | null>(null);
  const [portionAmount, setPortionAmount] = useState<number>(100);
  const [addingItem, setAddingItem] = useState(false);

  // Inicializa com alimentos precarregados ou busca inicial
  useEffect(() => {
    if (!isOpen) {
      setSelectedFood(null);
      setQuery('');
      return;
    }

    if (selectedFoodPreload) {
      setSelectedFood(selectedFoodPreload);
      setPortionAmount(selectedFoodPreload.servingSize || 100);
    } else {
      fetchFoods('');
    }
  }, [isOpen, selectedFoodPreload]);

  const fetchFoods = async (searchQuery: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/foods?q=${encodeURIComponent(searchQuery)}&limit=35`);
      const data = await res.json();
      setFoods(data.foods || []);
    } catch (err) {
      console.error('Erro ao buscar alimentos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setQuery(val);
    startTransition(() => {
      fetchFoods(val);
    });
  };

  const filteredFoods = foods.filter((f) => {
    if (selectedCategory === 'Todos') return true;
    if (selectedCategory === 'Personalizados') return f.isCustom;
    return f.category === selectedCategory;
  });

  // Cálculos proporcionais ao peso digitado
  const multiplier = selectedFood
    ? portionAmount / (selectedFood.servingSize || 100)
    : 1;

  const calcKcal = selectedFood ? Math.round(selectedFood.calories * multiplier * 10) / 10 : 0;
  const calcProtein = selectedFood ? Math.round(selectedFood.protein * multiplier * 10) / 10 : 0;
  const calcCarbs = selectedFood ? Math.round(selectedFood.carbs * multiplier * 10) / 10 : 0;
  const calcFat = selectedFood ? Math.round(selectedFood.fat * multiplier * 10) / 10 : 0;
  const calcFiber = selectedFood && selectedFood.fiber ? Math.round(selectedFood.fiber * multiplier * 10) / 10 : null;

  const handleConfirmAdd = async () => {
    if (!selectedFood || portionAmount <= 0) return;

    setAddingItem(true);
    try {
      const res = await fetch('/api/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_item',
          mealId,
          date,
          name: selectedFood.name,
          amount: portionAmount,
          unit: selectedFood.servingUnit || 'g',
          calories: calcKcal,
          protein: calcProtein,
          carbs: calcCarbs,
          fat: calcFat,
          fiber: calcFiber,
          foodItemId: selectedFood.id.startsWith('taco-') || selectedFood.id.startsWith('off-') ? null : selectedFood.id,
          isQuickAdd: false,
        }),
      });

      if (!res.ok) {
        throw new Error('Falha ao adicionar alimento à refeição.');
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setAddingItem(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center bg-slate-950/85 p-3 sm:p-4 backdrop-blur-md">
        <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {selectedFood && (
              <button
                type="button"
                onClick={() => setSelectedFood(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                {selectedFood ? 'Definir Quantidade' : `Adicionar ao ${mealName}`}
              </h3>
              <p className="text-xs text-slate-400">
                {selectedFood ? selectedFood.name : 'Busque na base TACO ou escaneie o produto'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Tela 1: Lista e Busca de Alimentos ───────────────────────────────── */}
        {!selectedFood ? (
          <>
            {/* Ações Visuais Rápidas no Topo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenVision();
                }}
                className="flex items-center justify-center gap-1.5 p-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold transition"
              >
                <Sparkles className="h-4 w-4" />
                <span>Estimar Prato</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBarcode();
                }}
                className="flex items-center justify-center gap-1.5 p-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-xl text-xs font-semibold transition"
              >
                <Camera className="h-4 w-4" />
                <span>Código de Barras</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenOcr();
                }}
                className="flex items-center justify-center gap-1.5 p-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-semibold transition"
              >
                <Camera className="h-4 w-4" />
                <span>Foto Rótulo (IA)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCustomFood();
                }}
                className="flex items-center justify-center gap-1.5 p-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                <Plus className="h-4 w-4" />
                <span>Novo Alimento</span>
              </button>
            </div>

            {/* Campo de Busca */}
            <div className="relative shrink-0">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar arroz, frango, ovos, whey, banana..."
                className="w-full bg-[#080d1a] border border-slate-700/70 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500/60 transition"
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                autoFocus
              />
            </div>

            {/* Filtros de Categoria em Pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 shrink-0 no-scrollbar">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Lista de Alimentos */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[260px]">
              {loading && foods.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-500 text-xs">
                  Carregando alimentos...
                </div>
              ) : filteredFoods.length > 0 ? (
                filteredFoods.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => {
                      setSelectedFood(food);
                      setPortionAmount(food.servingSize || 100);
                    }}
                    className="w-full text-left p-3 rounded-2xl bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800/80 hover:border-slate-700 transition flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-200 group-hover:text-white truncate">
                          {food.name}
                        </span>
                        {food.isCustom && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                            Meu
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {food.brand || 'TACO'} · porção base de {food.servingSize} {food.servingUnit}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-emerald-400 flex items-center justify-end gap-1">
                        <Flame className="h-3.5 w-3.5" />
                        {food.calories} kcal
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 justify-end">
                        <span className="text-blue-400">P: {food.protein}g</span>
                        <span className="text-amber-400">C: {food.carbs}g</span>
                        <span className="text-rose-400">G: {food.fat}g</span>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-12 space-y-2">
                  <p className="text-xs text-slate-400">Nenhum alimento encontrado para &quot;{query}&quot;.</p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCustomFood();
                    }}
                    className="text-xs font-semibold text-indigo-400 hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Cadastrar &quot;{query}&quot; como alimento personalizado
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── Tela 2: Seletor de Porção & Calculadora de Macros ─────────────────── */
          <div className="space-y-5 animate-fade-in-up">
            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-white text-base">{selectedFood.name}</h4>
                  <p className="text-xs text-slate-400">
                    {selectedFood.brand || 'TACO'} · Valores base por {selectedFood.servingSize}{' '}
                    {selectedFood.servingUnit}
                  </p>
                </div>
              </div>

              {/* Input de Quantidade */}
              <div className="space-y-1.5 pt-2">
                <label className="block text-xs uppercase text-slate-400 font-semibold tracking-wider">
                  Quantidade Consumida ({selectedFood.servingUnit})
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="5000"
                    step="1"
                    autoFocus
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-4 py-3 text-2xl font-black text-white focus:outline-none focus:border-indigo-500"
                    value={portionAmount || ''}
                    onChange={(e) => setPortionAmount(Number(e.target.value))}
                  />
                  <span className="text-slate-400 font-bold text-base px-2">
                    {selectedFood.servingUnit}
                  </span>
                </div>

                {/* Pills de Atalhos de Peso */}
                <div className="flex gap-2 pt-1 flex-wrap">
                  {[30, 50, 100, 150, 200, 250, 300].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPortionAmount(preset)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold transition ${
                        portionAmount === preset
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
                      }`}
                    >
                      {preset} {selectedFood.servingUnit}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Resumo Dinâmico dos Macros Calculados */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-slate-950/70 border border-emerald-500/20 rounded-xl p-3 text-center">
                <span className="text-[11px] uppercase font-semibold text-emerald-400 flex items-center justify-center gap-1">
                  <Flame className="h-3 w-3" /> Kcal
                </span>
                <span className="text-xl font-bold text-white mt-0.5 block">{calcKcal}</span>
              </div>

              <div className="bg-slate-950/70 border border-blue-500/20 rounded-xl p-3 text-center">
                <span className="text-[11px] uppercase font-semibold text-blue-400 flex items-center justify-center gap-1">
                  <Dumbbell className="h-3 w-3" /> Proteína
                </span>
                <span className="text-xl font-bold text-white mt-0.5 block">{calcProtein}g</span>
              </div>

              <div className="bg-slate-950/70 border border-amber-500/20 rounded-xl p-3 text-center">
                <span className="text-[11px] uppercase font-semibold text-amber-400 flex items-center justify-center gap-1">
                  <Wheat className="h-3 w-3" /> Carbo
                </span>
                <span className="text-xl font-bold text-white mt-0.5 block">{calcCarbs}g</span>
              </div>

              <div className="bg-slate-950/70 border border-rose-500/20 rounded-xl p-3 text-center">
                <span className="text-[11px] uppercase font-semibold text-rose-400 flex items-center justify-center gap-1">
                  <Droplet className="h-3 w-3" /> Gordura
                </span>
                <span className="text-xl font-bold text-white mt-0.5 block">{calcFat}g</span>
              </div>
            </div>

            {/* Botão de Confirmação */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedFood(null)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={addingItem || portionAmount <= 0}
                onClick={handleConfirmAdd}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-sm transition shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {addingItem ? 'Adicionando...' : `Adicionar ao ${mealName}`}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </ModalPortal>
  );
}
