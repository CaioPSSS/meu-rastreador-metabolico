'use client';

import { useState, useRef } from 'react';
import { X, Sparkles, Upload, Camera, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { CatalogFoodItem } from '@/lib/foodCatalog/search';
import { ExtractedNutritionLabel } from '@/lib/ai/nutritionOcr';
import { compressImageFile } from '@/lib/utils/imageCompressor';
import ModalPortal from '../ModalPortal';

interface NutritionOcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFoodExtracted: (food: CatalogFoodItem) => void;
}

const INPUT_CLASS =
  'w-full bg-[#080d1a] border border-slate-700/70 rounded-xl px-3 py-2 text-white placeholder-slate-600 text-sm transition focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30';
const LABEL_CLASS = 'block text-xs uppercase text-slate-400 font-semibold tracking-wider mb-1';

export default function NutritionOcrModal({
  isOpen,
  onClose,
  onFoodExtracted,
}: NutritionOcrModalProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedNutritionLabel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem válido (JPG ou PNG).');
      return;
    }

    try {
      setAnalyzing(true);
      setError(null);
      // Comprime no cliente para evitar payload gigante na Vercel e acelerar upload
      const compressedBase64 = await compressImageFile(file);
      setImagePreview(compressedBase64);
      await processImageOcr(compressedBase64);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao processar imagem.');
      setAnalyzing(false);
    }
  };

  const processImageOcr = async (base64Image: string) => {
    setAnalyzing(true);
    setError(null);
    setExtractedData(null);

    try {
      const response = await fetch('/api/ai/nutrition-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image }),
      });

      const res = await response.json();
      if (!response.ok || !res.data) {
        throw new Error(res.error || 'Não foi possível reconhecer a tabela nutricional.');
      }

      setExtractedData(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao processar imagem.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveAndAdd = async () => {
    if (!extractedData) return;
    setSaving(true);
    setError(null);

    try {
      // Salva no banco de dados local
      const res = await fetch('/api/foods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: extractedData.productName,
          brand: extractedData.brand || 'Rótulo Escaneado',
          servingSize: extractedData.servingSize,
          servingUnit: extractedData.servingUnit,
          calories: extractedData.calories,
          protein: extractedData.protein,
          carbs: extractedData.carbs,
          fat: extractedData.fat,
          fiber: extractedData.fiber,
          sodium: extractedData.sodium,
        }),
      });

      const data = await responseToJson(res);
      const foodItem: CatalogFoodItem = {
        id: data.food.id,
        name: data.food.name,
        brand: data.food.brand,
        servingSize: data.food.servingSize,
        servingUnit: data.food.servingUnit,
        calories: data.food.calories,
        protein: data.food.protein,
        carbs: data.food.carbs,
        fat: data.food.fat,
        fiber: data.food.fiber,
        sodium: data.food.sodium,
        isCustom: true,
      };

      onFoodExtracted(foodItem);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar alimento.');
    } finally {
      setSaving(false);
    }
  };

  const resetCapture = () => {
    setImagePreview(null);
    setExtractedData(null);
    setError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
        <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto my-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-400">
              <Sparkles className="h-5 w-5" />
              <h3 className="text-base font-bold text-white">OCR de Tabela Nutricional por IA</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Etapa 1: Captura / Upload da Imagem */}
          {!imagePreview && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Tire uma foto nítida ou faça upload da tabela nutricional impressa na embalagem do produto. Nossa IA extrairá os macros automaticamente.
              </p>

              {/* Input específico para CÂMERA (com capture) */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Input específico para GALERIA / ARQUIVOS (sem capture) */}
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-8 bg-slate-950/60 border-2 border-dashed border-indigo-500/40 rounded-2xl hover:border-indigo-400/80 hover:bg-slate-900 transition group gap-3"
                >
                  <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-400 group-hover:scale-110 transition-transform">
                    <Camera className="h-6 w-6" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-semibold text-white block">Tirar Foto com a Câmera</span>
                    <span className="text-xs text-slate-500">Apontar para a tabela nutricional</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-8 bg-slate-950/60 border-2 border-dashed border-slate-700 rounded-2xl hover:border-slate-500 hover:bg-slate-900 transition group gap-3"
                >
                  <div className="p-3 rounded-full bg-slate-800 text-slate-300 group-hover:scale-110 transition-transform">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-semibold text-white block">Upload da Galeria</span>
                    <span className="text-xs text-slate-500">Selecionar arquivo JPG ou PNG</span>
                  </div>
                </button>
              </div>
            </div>
          )}

        {/* Etapa 2: Processamento e Conferência dos Dados Extraídos */}
        {imagePreview && (
          <div className="space-y-4">
            <div className="flex gap-4 items-center bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
              <img
                src={imagePreview}
                alt="Rótulo nutricional"
                className="w-20 h-20 object-cover rounded-xl border border-slate-700 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-400 block">Imagem capturada</span>
                {analyzing ? (
                  <div className="flex items-center gap-2 text-indigo-400 text-xs font-medium mt-1">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Lendo valores nutricionais com IA...</span>
                  </div>
                ) : extractedData ? (
                  <span className="text-xs text-emerald-400 font-medium mt-1 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Leitura concluída!
                  </span>
                ) : (
                  <span className="text-xs text-rose-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> Falha na leitura
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!analyzing && !extractedData && imagePreview && (
                  <button
                    type="button"
                    onClick={() => processImageOcr(imagePreview)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw className="h-3 w-3" /> Tentar Novamente
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetCapture}
                  disabled={analyzing}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
                >
                  Nova Foto
                </button>
              </div>
            </div>

            {/* Formulário de Revisão Editável */}
            {extractedData && (
              <div className="space-y-4 border-t border-slate-800/80 pt-4 animate-fade-in-up">
                <p className="text-xs text-slate-400 font-medium">
                  Confira e ajuste os valores extraídos antes de salvar:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className={LABEL_CLASS}>Nome do Produto</label>
                    <input
                      type="text"
                      className={INPUT_CLASS}
                      value={extractedData.productName}
                      onChange={(e) =>
                        setExtractedData({ ...extractedData, productName: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className={LABEL_CLASS}>Marca</label>
                    <input
                      type="text"
                      className={INPUT_CLASS}
                      value={extractedData.brand || ''}
                      onChange={(e) =>
                        setExtractedData({ ...extractedData, brand: e.target.value })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={LABEL_CLASS}>Porção</label>
                      <input
                        type="number"
                        className={INPUT_CLASS}
                        value={extractedData.servingSize}
                        onChange={(e) =>
                          setExtractedData({
                            ...extractedData,
                            servingSize: Number(e.target.value) || 100,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Unidade</label>
                      <input
                        type="text"
                        className={INPUT_CLASS}
                        value={extractedData.servingUnit}
                        onChange={(e) =>
                          setExtractedData({ ...extractedData, servingUnit: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className={LABEL_CLASS}>Calorias (kcal)</label>
                    <input
                      type="number"
                      step="0.1"
                      className={`${INPUT_CLASS} text-emerald-400 font-bold`}
                      value={extractedData.calories}
                      onChange={(e) =>
                        setExtractedData({
                          ...extractedData,
                          calories: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className={LABEL_CLASS}>Proteína (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      className={`${INPUT_CLASS} text-blue-400 font-bold`}
                      value={extractedData.protein}
                      onChange={(e) =>
                        setExtractedData({
                          ...extractedData,
                          protein: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className={LABEL_CLASS}>Carboidratos (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      className={`${INPUT_CLASS} text-amber-400 font-bold`}
                      value={extractedData.carbs}
                      onChange={(e) =>
                        setExtractedData({
                          ...extractedData,
                          carbs: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className={LABEL_CLASS}>Gordura (g)</label>
                    <input
                      type="number"
                      step="0.1"
                      className={`${INPUT_CLASS} text-rose-400 font-bold`}
                      value={extractedData.fat}
                      onChange={(e) =>
                        setExtractedData({
                          ...extractedData,
                          fat: Number(e.target.value) || 0,
                        })
                      }
                    />
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
                    type="button"
                    disabled={saving}
                    onClick={handleSaveAndAdd}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold rounded-xl text-sm transition shadow-lg hover:shadow-indigo-500/20 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {saving ? 'Salvando...' : 'Salvar e Selecionar Porção'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </ModalPortal>
  );
}

async function responseToJson(res: Response) {
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Erro na requisição.');
  }
  return res.json();
}
