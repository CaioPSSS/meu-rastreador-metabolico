'use client';

import { useState } from 'react';
import { X, PlusCircle, Check } from 'lucide-react';
import { CatalogFoodItem } from '@/lib/foodCatalog/search';
import ModalPortal from '../ModalPortal';

interface CustomFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newFood: CatalogFoodItem) => void;
  initialValues?: Partial<CatalogFoodItem>;
}

const INPUT_CLASS =
  'w-full bg-[#080d1a] border border-slate-700/70 rounded-xl px-3 py-2 text-white placeholder-slate-600 text-sm transition focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30';
const LABEL_CLASS = 'block text-xs uppercase text-slate-400 font-semibold tracking-wider mb-1';

export default function CustomFoodModal({
  isOpen,
  onClose,
  onSuccess,
  initialValues,
}: CustomFoodModalProps) {
  const [name, setName] = useState(initialValues?.name || '');
  const [brand, setBrand] = useState(initialValues?.brand || '');
  const [barcode, setBarcode] = useState(initialValues?.barcode || '');
  const [servingSize, setServingSize] = useState(initialValues?.servingSize?.toString() || '100');
  const [servingUnit, setServingUnit] = useState(initialValues?.servingUnit || 'g');
  const [calories, setCalories] = useState(initialValues?.calories?.toString() || '');
  const [protein, setProtein] = useState(initialValues?.protein?.toString() || '');
  const [carbs, setCarbs] = useState(initialValues?.carbs?.toString() || '');
  const [fat, setFat] = useState(initialValues?.fat?.toString() || '');
  const [fiber, setFiber] = useState(initialValues?.fiber?.toString() || '');
  const [sodium, setSodium] = useState(initialValues?.sodium?.toString() || '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !calories || !protein) {
      setError('Nome, calorias e proteínas são obrigatórios.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/foods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          brand: brand.trim() || 'Personalizado',
          barcode: barcode.trim() || null,
          servingSize: Number(servingSize) || 100,
          servingUnit: servingUnit || 'g',
          calories: Number(calories) || 0,
          protein: Number(protein) || 0,
          carbs: Number(carbs) || 0,
          fat: Number(fat) || 0,
          fiber: fiber ? Number(fiber) : null,
          sodium: sodium ? Number(sodium) : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Falha ao cadastrar alimento.');
      }

      const { food } = await response.json();
      onSuccess(food);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto my-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-400">
            <PlusCircle className="h-5 w-5" />
            <h3 className="text-lg font-bold text-white">Cadastrar Alimento</h3>
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
          Informe os valores nutricionais de referência (preferencialmente por <strong>100g</strong> ou pela porção padrão da embalagem).
        </p>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={LABEL_CLASS}>Nome do Alimento *</label>
              <input
                type="text"
                placeholder="Ex: Pão de Queijo Mineiro"
                required
                className={INPUT_CLASS}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Marca / Fabricante</label>
              <input
                type="text"
                placeholder="Ex: Forno de Minas / Caseiro"
                className={INPUT_CLASS}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Código de Barras (Opcional)</label>
              <input
                type="text"
                placeholder="Ex: 7891234567890"
                className={INPUT_CLASS}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Tamanho da Porção Base *</label>
              <input
                type="number"
                min="1"
                required
                className={INPUT_CLASS}
                value={servingSize}
                onChange={(e) => setServingSize(e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Unidade de Medida</label>
              <select
                className={INPUT_CLASS}
                value={servingUnit}
                onChange={(e) => setServingUnit(e.target.value)}
              >
                <option value="g">Gramas (g)</option>
                <option value="ml">Mililitros (ml)</option>
                <option value="un">Unidade (un)</option>
                <option value="fatia">Fatia</option>
                <option value="colher">Colher</option>
              </select>
            </div>
          </div>

          <div className="border-t border-slate-800/80 pt-3">
            <p className="text-xs uppercase text-slate-500 font-semibold tracking-wider mb-2">
              Nutrientes na Porção Base ({servingSize} {servingUnit})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={LABEL_CLASS}>Calorias (kcal) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="Ex: 250"
                  className={`${INPUT_CLASS} text-emerald-400 font-bold`}
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Proteína (g) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="Ex: 8.5"
                  className={`${INPUT_CLASS} text-blue-400 font-bold`}
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Carboidratos (g)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Ex: 30"
                  className={`${INPUT_CLASS} text-amber-400 font-bold`}
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Gordura (g)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Ex: 10"
                  className={`${INPUT_CLASS} text-rose-400 font-bold`}
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Fibras (g)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Ex: 2.0"
                  className={INPUT_CLASS}
                  value={fiber}
                  onChange={(e) => setFiber(e.target.value)}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Sódio (mg)</label>
                <input
                  type="number"
                  placeholder="Ex: 150"
                  className={INPUT_CLASS}
                  value={sodium}
                  onChange={(e) => setSodium(e.target.value)}
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
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition shadow-lg hover:shadow-indigo-500/20 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {submitting ? 'Salvando...' : 'Salvar Alimento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
}
