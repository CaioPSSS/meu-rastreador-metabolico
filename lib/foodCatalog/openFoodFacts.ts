import { CatalogFoodItem } from './search';

export async function fetchOpenFoodFactsByBarcode(barcode: string): Promise<CatalogFoodItem | null> {
  const cleanBarcode = barcode.trim().replace(/\D/g, '');
  if (!cleanBarcode || cleanBarcode.length < 6) {
    return null;
  }

  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json?fields=product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity,code`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MeuRastreadorMetabolico - Web/App - Version 1.0',
        'Accept': 'application/json',
      },
      next: { revalidate: 86400 }, // Cache de 24h
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.status !== 1 || !data.product) {
      return null;
    }

    const p = data.product;
    const nutriments = p.nutriments || {};

    const name = p.product_name_pt || p.product_name || `Produto (${cleanBarcode})`;
    const brand = p.brands || 'Industrializado';

    // Priorizar valores por 100g para padronização da base
    const calories100g = Number(
      nutriments['energy-kcal_100g'] ??
      nutriments['energy-kcal_value'] ??
      (nutriments['energy_100g'] ? nutriments['energy_100g'] / 4.184 : 0)
    );

    const protein100g = Number(nutriments['proteins_100g'] ?? nutriments['proteins_value'] ?? 0);
    const carbs100g = Number(nutriments['carbohydrates_100g'] ?? nutriments['carbohydrates_value'] ?? 0);
    const fat100g = Number(nutriments['fat_100g'] ?? nutriments['fat_value'] ?? 0);
    const fiber100g = nutriments['fiber_100g'] !== undefined ? Number(nutriments['fiber_100g']) : null;
    const sodium100g = nutriments['sodium_100g'] !== undefined ? Number(nutriments['sodium_100g']) * 1000 : null; // converter para mg

    // Extrair porção se informada
    let servingUnit = 'g';
    if (p.serving_size) {
      const match = p.serving_size.match(/(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?/);
      if (match && match[2]) {
        servingUnit = match[2].toLowerCase();
      }
    }

    return {
      id: `off-${cleanBarcode}`,
      name: name.slice(0, 100),
      brand: brand.slice(0, 50),
      barcode: cleanBarcode,
      category: 'Industrializados',
      servingSize: 100, // Armazenamos sempre a base 100g no catálogo
      servingUnit,
      calories: Math.round(calories100g * 10) / 10,
      protein: Math.round(protein100g * 10) / 10,
      carbs: Math.round(carbs100g * 10) / 10,
      fat: Math.round(fat100g * 10) / 10,
      fiber: fiber100g !== null ? Math.round(fiber100g * 10) / 10 : null,
      sodium: sodium100g !== null ? Math.round(sodium100g) : null,
      isCustom: false,
    };
  } catch (err) {
    console.error('[openFoodFacts] Erro ao buscar código de barras:', err);
    return null;
  }
}
