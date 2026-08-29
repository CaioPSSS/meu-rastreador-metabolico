export interface ExtractedNutritionLabel {
  productName: string;
  brand?: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
  notes?: string;
}

const OCR_SYSTEM_PROMPT = `Você é um leitor de visão computacional especializado em tabelas de informação nutricional de alimentos (padrão ANVISA brasileiro e internacional).
Analise a imagem da tabela nutricional fornecida e extraia os valores nutricionais com máxima precisão.

Instruções:
1. Extraia os dados referentes à PORÇÃO informada (ou 100g se não houver porção explícita).
2. Se houver duas colunas (ex: 100g vs Porção), PREFIRA a porção de consumo (ex: 30g, 50g, 2 colheres) OU normalize para a porção indicada.
3. Extraia:
   - Nome do produto (se visível no rótulo, senão "Alimento Escaneado")
   - Marca (se visível)
   - Tamanho da porção numérica (ex: 30) e unidade ("g", "ml", "un")
   - Valor energético / Calorias (em kcal)
   - Proteínas (em gramas)
   - Carboidratos totais (em gramas)
   - Gorduras totais (em gramas)
   - Fibra alimentar (em gramas, se presente)
   - Sódio (em mg, se presente)
4. Retorne APENAS um objeto JSON válido no seguinte formato estrito:
{
  "productName": "Nome do Alimento",
  "brand": "Marca",
  "servingSize": 30,
  "servingUnit": "g",
  "calories": 140,
  "protein": 6.5,
  "carbs": 18.0,
  "fat": 4.5,
  "fiber": 2.0,
  "sodium": 110,
  "notes": "Valores extraídos da porção de 30g"
}`;

export async function extractNutritionFromImage(base64Image: string): Promise<ExtractedNutritionLabel> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // Garante prefixo data URL se não houver
  const formattedImageUrl = base64Image.startsWith('data:')
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`;

  // Tentativa 1: OpenRouter com modelo multimodal
  if (openRouterKey) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://meu-rastreador-metabolico.vercel.app',
          'X-Title': 'Metabolic Tracker Nutrition OCR',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-001',
          messages: [
            { role: 'system', content: OCR_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Extraia os dados nutricionais desta tabela:' },
                { type: 'image_url', image_url: { url: formattedImageUrl } },
              ],
            },
          ],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const content = result.choices?.[0]?.message?.content;
        if (content) {
          const parsed = parseOcrJson(content);
          if (parsed) return parsed;
        }
      }
    } catch (err) {
      console.warn('[nutritionOcr] OpenRouter falhou, tentando fallback:', err);
    }
  }

  // Tentativa 2: Direct Gemini API se GEMINI_API_KEY configurada
  if (geminiKey) {
    try {
      const rawBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${OCR_SYSTEM_PROMPT}\n\nExtraia os dados da tabela nutricional:` },
                  {
                    inline_data: {
                      mime_type: 'image/jpeg',
                      data: rawBase64,
                    },
                  },
                ],
              },
            ],
          }),
        },
      );

      if (response.ok) {
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = parseOcrJson(text);
          if (parsed) return parsed;
        }
      }
    } catch (err) {
      console.error('[nutritionOcr] Gemini direto falhou:', err);
    }
  }

  throw new Error('Não foi possível extrair a tabela nutricional da imagem. Verifique a iluminação e enquadramento da foto.');
}

function parseOcrJson(rawText: string): ExtractedNutritionLabel | null {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const data = JSON.parse(jsonMatch[0]);

    return {
      productName: String(data.productName || 'Alimento Identificado'),
      brand: data.brand ? String(data.brand) : undefined,
      servingSize: Number(data.servingSize) || 100,
      servingUnit: String(data.servingUnit || 'g'),
      calories: Number(data.calories) || 0,
      protein: Number(data.protein) || 0,
      carbs: Number(data.carbs) || 0,
      fat: Number(data.fat) || 0,
      fiber: data.fiber !== undefined ? Number(data.fiber) : undefined,
      sodium: data.sodium !== undefined ? Number(data.sodium) : undefined,
      notes: data.notes ? String(data.notes) : undefined,
    };
  } catch {
    return null;
  }
}
