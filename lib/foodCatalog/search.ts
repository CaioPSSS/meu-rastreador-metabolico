import tacoDataRaw from './tacoData.json';

export interface CatalogFoodItem {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  barcode?: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sodium?: number | null;
  isCustom?: boolean;
}

const TACO_ITEMS: CatalogFoodItem[] = tacoDataRaw as CatalogFoodItem[];

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Busca rápida com ordenação por relevância (prefixo > palavra exata > substring)
 */
export function searchTacoFoods(query: string, limit = 25): CatalogFoodItem[] {
  if (!query || query.trim().length === 0) {
    return TACO_ITEMS.slice(0, limit);
  }

  const q = normalize(query);
  const terms = q.split(/\s+/).filter(Boolean);

  const scored = TACO_ITEMS.map((item) => {
    const nameNorm = normalize(item.name);
    const brandNorm = item.brand ? normalize(item.brand) : '';
    const catNorm = item.category ? normalize(item.category) : '';
    const combined = `${nameNorm} ${brandNorm} ${catNorm}`;

    let score = 0;

    // Match exato no início do nome
    if (nameNorm.startsWith(q)) {
      score += 100;
    } else if (nameNorm.includes(q)) {
      score += 50;
    }

    // Match de cada termo individual
    for (const term of terms) {
      if (combined.includes(term)) {
        score += 15;
      }
    }

    return { item, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.item);
}

export function getAllTacoFoods(): CatalogFoodItem[] {
  return TACO_ITEMS;
}
