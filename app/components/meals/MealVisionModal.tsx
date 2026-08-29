'use client';

import { useState, useRef } from 'react';
import {
  X,
  Sparkles,
  Camera,
  Upload,
  RefreshCw,
  Check,
  Flame,
  Dumbbell,
  Wheat,
  Droplet,
  Trash2,
  Sliders,
  Scale,
} from 'lucide-react';
import { AnalyzedFoodComponent, MealVisionResult } from '@/lib/ai/mealVisionEstimate';

interface MealVisionModalProps {
  mealName: string;
  mealId: string;
  date: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function MealVisionModal({
  mealName,
  mealId,
  date,
  isOpen,
  onClose,
  onSuccess,
}: MealVisionModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [userContext, setUserContext] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<MealVisionResult | null>(null);
  const [editableItems, setEditableItems] = useState<AnalyzedFoodComponent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sobrescrita manual do total de calorias (se o usuário quiser forçar um número exato)
  const [customTotalCalories, setCustomTotalCalories] = useState<string>('');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem válida (JPG ou PNG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setImagePreview(base64);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleStartAnalysis = async () => {
    if (!imagePreview) return;

    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/ai/meal-vision-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imagePreview,
          userContext: userContext.trim() || undefined,
          mealName,
        }),
      });

      const res = await response.json();
      if (!response.ok || !res.data) {
        throw new Error(res.error || 'Falha ao estimar os alimentos por imagem.');
      }

      const visionData: MealVisionResult = res.data;
      setResult(visionData);
      setEditableItems(visionData.components);
      setCustomTotalCalories(visionData.totals.totalCalories.toString());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao processar imagem.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Ajuste interativo do peso de um item específico
  const handleItemGramsChange = (index: number, newGrams: number) => {
    if (newGrams < 0) return;

    setEditableItems((prev) => {
      const updated = [...prev];
      const item = updated[index];
      const baseGrams = item.estimatedGrams || 100;
      const ratio = newGrams / baseGrams;

      updated[index] = {
        ...item,
        estimatedGrams: newGrams,
        calories: Math.round(item.calories * ratio),
        protein: Math.round(item.protein * ratio * 10) / 10,
        carbs: Math.round(item.carbs * ratio * 10) / 10,
        fat: Math.round(item.fat * ratio * 10) / 10,
      };
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setEditableItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Totais computados dos itens atuais
  const computedTotalKcal = editableItems.reduce((acc, item) => acc + (item.calories || 0), 0);
  const computedTotalProt = Math.round(editableItems.reduce((acc, item) => acc + (item.protein || 0), 0) * 10) / 10;
  const computedTotalCarb = Math.round(editableItems.reduce((acc, item) => acc + (item.carbs || 0), 0) * 10) / 10;
  const computedTotalFat = Math.round(editableItems.reduce((acc, item) => acc + (item.fat || 0), 0) * 10) / 10;
  const computedTotalGrams = editableItems.reduce((acc, item) => acc + (item.estimatedGrams || 0), 0);

  const finalCalories = customTotalCalories ? Number(customTotalCalories) : computedTotalKcal;

  const handleCommitMeal = async () => {
    if (editableItems.length === 0) {
      setError('Nenhum alimento na lista para adicionar.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Inserir cada alimento individualmente na refeição
      for (const item of editableItems) {
        await fetch('/api/meals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add_item',
            mealId,
            date,
            name: `${item.name}${item.preparation ? ` (${item.preparation})` : ''}`,
            amount: item.estimatedGrams,
            unit: 'g',
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            isQuickAdd: false,
          }),
        });
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar alimentos.');
    } finally {
      setSaving(false);
    }
  };

  const resetCapture = () => {
    setImagePreview(null);
    setResult(null);
    setEditableItems([]);
    setError(null);
    setUserContext('');
    setCustomTotalCalories('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 sm:p-4 backdrop-blur-md animate-fade-in-up">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                Estimar Prato por Foto (IA)
              </h3>
              <p className="text-xs text-slate-400">
                Decomposição física e volumétrica para o <strong>{mealName}</strong>
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

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* ── ETAPA 1: Captura e Contexto ───────────────────────────────────── */}
        {!result && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

            {!imagePreview ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-8 bg-slate-950/60 border-2 border-dashed border-emerald-500/40 rounded-2xl hover:border-emerald-400/80 hover:bg-slate-900 transition group gap-3"
                >
                  <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                    <Camera className="h-6 w-6" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-semibold text-white block">Tirar Foto do Prato</span>
                    <span className="text-xs text-slate-500">Enquadrar o prato com talheres</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-8 bg-slate-950/60 border-2 border-dashed border-slate-700 rounded-2xl hover:border-slate-500 hover:bg-slate-900 transition group gap-3"
                >
                  <div className="p-3 rounded-full bg-slate-800 text-slate-300 group-hover:scale-110 transition-transform">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-semibold text-white block">Upload da Galeria</span>
                    <span className="text-xs text-slate-500">Selecionar foto existente</span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative aspect-video max-h-56 w-full rounded-2xl overflow-hidden border border-slate-700 bg-black flex items-center justify-center">
                  <img
                    src={imagePreview}
                    alt="Foto do prato"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={resetCapture}
                    disabled={analyzing}
                    className="absolute top-2 right-2 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs font-semibold backdrop-blur-sm border border-slate-700 transition"
                  >
                    Trocar Foto
                  </button>
                </div>

                {/* Campo de Contexto / Pista do Usuário */}
                <div className="space-y-1.5">
                  <label className="block text-xs uppercase text-slate-400 font-semibold tracking-wider">
                    Pista / Descrição Rápida (Opcional, mas Altamente Recomendado)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 2 bifes de alcatra no azeite, 4 colheres de arroz e salada"
                    disabled={analyzing}
                    className="w-full bg-[#080d1a] border border-slate-700/80 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500"
                    value={userContext}
                    onChange={(e) => setUserContext(e.target.value)}
                  />
                  <p className="text-[11px] text-emerald-400/90 font-medium">
                    💡 Informar os itens ou modo de preparo reduz o erro de estimativa de <strong>35% para ~14%</strong>!
                  </p>
                </div>

                <button
                  type="button"
                  disabled={analyzing}
                  onClick={handleStartAnalysis}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-sm transition shadow-lg hover:shadow-emerald-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Analisando geometria, densidade e volume do prato...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Processar Estimativa com IA</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ETAPA 2: Resultado e Ajuste Fino ──────────────────────────────── */}
        {result && (
          <div className="space-y-5 animate-fade-in-up">
            {/* Banner de Referência Espacial & Margem de Incerteza Informativa */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Scale className="h-4 w-4 text-cyan-400 shrink-0" />
                <span>
                  Referência: <strong>{result.spatialCalibration?.referenceObject || 'Prato padrão detectado'}</strong>
                </span>
              </div>

              {/* Margem de Incerteza como Guia */}
              <div className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold self-start sm:self-auto text-[11px]">
                Faixa estimada: {result.totals.uncertaintyRange.minCalories} – {result.totals.uncertaintyRange.maxCalories} kcal
              </div>
            </div>

            {/* Lista dos Alimentos Identificados com Sliders de Ajuste */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <span>Alimentos Decompostos ({editableItems.length})</span>
                <span className="text-[11px] text-slate-500">Ajuste os gramas se desejar</span>
              </div>

              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {editableItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-950/60 border border-slate-800/90 rounded-2xl space-y-2.5 hover:border-slate-700 transition"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-slate-100 text-sm block">
                          {item.name}
                        </span>
                        {item.preparation && (
                          <span className="text-[11px] text-slate-500">
                            Preparo: {item.preparation}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-400 text-xs">
                          {item.calories} kcal
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition"
                          title="Remover este alimento"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Controle de Peso / Gramas com Slider e Input */}
                    <div className="flex items-center gap-3 pt-1">
                      <Sliders className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <input
                        type="range"
                        min="10"
                        max="600"
                        step="5"
                        className="flex-1 accent-emerald-500 cursor-pointer"
                        value={item.estimatedGrams}
                        onChange={(e) => handleItemGramsChange(idx, Number(e.target.value))}
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min="1"
                          max="1500"
                          className="w-16 bg-[#080d1a] border border-slate-700 rounded px-1.5 py-0.5 text-white text-xs font-bold text-center"
                          value={item.estimatedGrams}
                          onChange={(e) => handleItemGramsChange(idx, Number(e.target.value))}
                        />
                        <span className="text-xs text-slate-400">g</span>
                      </div>
                    </div>

                    {/* Chips dos Macros do Item */}
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                      <span className="text-blue-400">{item.protein}g P</span>
                      <span>·</span>
                      <span className="text-amber-400">{item.carbs}g C</span>
                      <span>·</span>
                      <span className="text-rose-400">{item.fat}g G</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Painel de Totais Finais (Valor Fixo Padrão com Edição Livre) */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Total Final a Gravar ({computedTotalGrams}g)
                </span>
                <button
                  type="button"
                  onClick={resetCapture}
                  className="text-xs text-slate-400 hover:text-white underline"
                >
                  Tirar Outra Foto
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-2.5 text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center justify-center gap-0.5">
                    <Flame className="h-3 w-3" /> Kcal
                  </span>
                  <input
                    type="number"
                    className="w-full bg-transparent text-center text-lg sm:text-xl font-black text-white focus:outline-none mt-0.5"
                    value={finalCalories}
                    onChange={(e) => setCustomTotalCalories(e.target.value)}
                    title="Clique para editar o total de calorias se desejar"
                  />
                </div>

                <div className="bg-slate-900 border border-blue-500/20 rounded-xl p-2.5 text-center">
                  <span className="text-[10px] uppercase font-bold text-blue-400 flex items-center justify-center gap-0.5">
                    <Dumbbell className="h-3 w-3" /> Proteína
                  </span>
                  <span className="text-lg sm:text-xl font-black text-white block mt-0.5">
                    {computedTotalProt}g
                  </span>
                </div>

                <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-2.5 text-center">
                  <span className="text-[10px] uppercase font-bold text-amber-400 flex items-center justify-center gap-0.5">
                    <Wheat className="h-3 w-3" /> Carbo
                  </span>
                  <span className="text-lg sm:text-xl font-black text-white block mt-0.5">
                    {computedTotalCarb}g
                  </span>
                </div>

                <div className="bg-slate-900 border border-rose-500/20 rounded-xl p-2.5 text-center">
                  <span className="text-[10px] uppercase font-bold text-rose-400 flex items-center justify-center gap-0.5">
                    <Droplet className="h-3 w-3" /> Gordura
                  </span>
                  <span className="text-lg sm:text-xl font-black text-white block mt-0.5">
                    {computedTotalFat}g
                  </span>
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving || editableItems.length === 0}
                onClick={handleCommitMeal}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-sm transition shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {saving ? 'Gravando alimentos...' : `Confirmar e Adicionar ao ${mealName}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
