export interface AnalyzedFoodComponent {
  name: string;
  preparation?: string;
  areaCm2?: number;
  heightCm?: number;
  volumeCm3?: number;
  densityGPerCm3?: number;
  estimatedGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealVisionResult {
  spatialCalibration?: {
    referenceObject?: string;
    estimatedScale?: string;
  };
  components: AnalyzedFoodComponent[];
  totals: {
    totalGrams: number;
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    uncertaintyRange: {
      minCalories: number;
      maxCalories: number;
    };
  };
  notes?: string;
}

const VISION_SYSTEM_PROMPT = `Atue como um sistema especialista em Nutrição Computacional e Visão Computacional de alta precisão. Sua tarefa é analisar a imagem de refeição fornecida e realizar uma estimativa física, volumétrica e nutricional quantitativa.

Siga rigorosamente a seguinte sequência de decomposição analítica passo a passo antes de emitir a resposta final:

1. CALIBRAÇÃO ESPACIAL E ESCALA:
- Identifique objetos de referência conhecidos na imagem (ex.: garfo ~18-20cm, faca, copo, diâmetro do prato padrão ~25-27cm, guardanapo).
- Estime a escala de conversão da imagem (relação de pixels por centímetro real).

2. SEGMENTAÇÃO E IDENTIFICAÇÃO DE COMPONENTES:
- Liste individualmente todos os itens visíveis no prato/recipiente.
- Note métodos de preparação prováveis (ex.: frito, grelhado, cozido, assado) e presença de gorduras de cobertura/molhos visíveis ou brilhantes (azeite, óleos, molhos emulsionados). Se houver pista de texto do usuário, dê alta prioridade às informações fornecidas sobre preparo e ingredientes.

3. ESTIMATIVA VOLUMÉTRICA E DENSIDADE:
Para cada item identificado:
- Estime a área de superfície bidimensional ocupada em centímetros quadrados (cm²).
- Estime a altura/espessura média do alimento em centímetros (cm).
- Calcule o volume aproximado: Volume em cm³ = Área × Altura.
- Atribua uma densidade física específica baseada na literatura nutricional em g/cm³. Exemplos: Arroz cozido ~0,85 g/cm³; Peito de frango ~1,05 g/cm³; Folhosos ~0,15 g/cm³; Óleo/Azeite ~0,92 g/cm³; Carne bovina ~1,10 g/cm³; Feijão cozido ~0,95 g/cm³; Batata cozida ~0,90 g/cm³.
- Calcule a massa estimada em gramas: Massa em gramas = Volume em cm³ × Densidade em g/cm³.

4. CONVERSÃO DE MACRONUTRIENTES E ENERGIA:
Para cada item, aplique os fatores de Atwater e composição de referência (ex: TACO/USDA):
- Proteínas em gramas
- Carboidratos em gramas
- Lipídios/Gorduras em gramas
- Energia em kcal = (Proteínas × 4) + (Carboidratos × 4) + (Lipídios × 9)

5. ANÁLISE DE INCERTEZA E VIÉS:
- Aplique o fator de correção para subamostragem volumétrica em porções grandes (se massa total estimada > 400g, ajuste a massa e calorias em +15% para compensar a compressão tridimensional).
- Determine a faixa de erro estimada (limite inferior e superior em kcal, ex: ±10% a ±15%).

Retorne EXCLUSIVAMENTE um objeto JSON válido estruturado exatamente com o seguinte esquema:
{
  "calibracao_espacial": {
    "objeto_referencia_identificado": "string",
    "escala_estimada": "string"
  },
  "itens_analisados": [
    {
      "nome_alimento": "string",
      "preparacao_provavel": "string",
      "area_estimada_cm2": 0.0,
      "altura_estimada_cm": 0.0,
      "volume_estimado_cm3": 0.0,
      "densidade_g_cm3": 0.0,
      "massa_estimada_g": 0.0,
      "macronutrientes": {
        "proteinas_g": 0.0,
        "carboidratos_g": 0.0,
        "gorduras_g": 0.0
      },
      "energia_kcal": 0.0
    }
  ],
  "totais_refeicao": {
    "massa_total_g": 0.0,
    "proteinas_totais_g": 0.0,
    "carboidratos_totais_g": 0.0,
    "gorduras_totais_g": 0.0,
    "energia_total_kcal": 0.0,
    "intervalo_confianca_kcal": {
      "minimo": 0.0,
      "maximo": 0.0
    }
  }
}`;

export async function estimateMealFromVision(
  base64Image: string,
  userContext?: string,
  mealName?: string,
): Promise<MealVisionResult> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  const formattedImageUrl = base64Image.startsWith('data:')
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`;

  const promptText = `Analise esta foto de refeição${mealName ? ` (${mealName})` : ''} e estime detalhadamente todos os alimentos, pesos em gramas e macronutrientes.${
    userContext ? `\n\nPISTA / CONTEXTO INFORMADO PELO USUÁRIO: "${userContext}"` : ''
  }`;

  // ── Tentativa 1: OpenRouter (Modelo Primário Custo-Benefício: Google Gemini 3.6 Flash / 2.0 Flash)
  if (openRouterKey) {
    const primaryModels = [
      'google/gemini-3.6-flash',
      'google/gemini-2.0-flash-001',
      'anthropic/claude-sonnet-4.6',
      'minimax/minimax-m3',
    ];

    for (const model of primaryModels) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://meu-rastreador-metabolico.vercel.app',
            'X-Title': 'Metabolic Tracker Meal Vision',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: VISION_SYSTEM_PROMPT },
              {
                role: 'user',
                content: [
                  { type: 'text', text: promptText },
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
            const parsed = parseMealVisionJson(content);
            if (parsed && parsed.components.length > 0) {
              return parsed;
            }
          }
        }
      } catch (modelErr) {
        console.warn(`[mealVisionEstimate] Modelo ${model} falhou, tentando próximo:`, modelErr);
      }
    }
  }

  // ── Tentativa 2: Direct Google Gemini API se GEMINI_API_KEY configurada
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
                  { text: `${VISION_SYSTEM_PROMPT}\n\n${promptText}` },
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
          const parsed = parseMealVisionJson(text);
          if (parsed && parsed.components.length > 0) {
            return parsed;
          }
        }
      }
    } catch (geminiErr) {
      console.error('[mealVisionEstimate] Direct Gemini API falhou:', geminiErr);
    }
  }

  throw new Error(
    'Não foi possível estimar a refeição por visão computacional. Verifique o enquadramento do prato ou insira as informações manualmente.',
  );
}

function parseMealVisionJson(rawContent: string): MealVisionResult | null {
  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const data = JSON.parse(jsonMatch[0]);

    const rawItems = Array.isArray(data.itens_analisados) ? data.itens_analisados : [];
    const components: AnalyzedFoodComponent[] = rawItems.map((item: any) => ({
      name: String(item.nome_alimento || 'Alimento Identificado'),
      preparation: item.preparacao_provavel ? String(item.preparacao_provavel) : undefined,
      areaCm2: Number(item.area_estimada_cm2) || undefined,
      heightCm: Number(item.altura_estimada_cm) || undefined,
      volumeCm3: Number(item.volume_estimado_cm3) || undefined,
      densityGPerCm3: Number(item.densidade_g_cm3) || undefined,
      estimatedGrams: Math.round(Number(item.massa_estimada_g) || 100),
      calories: Math.round(Number(item.energia_kcal) || 0),
      protein: Math.round((Number(item.macronutrientes?.proteinas_g) || 0) * 10) / 10,
      carbs: Math.round((Number(item.macronutrientes?.carboidratos_g) || 0) * 10) / 10,
      fat: Math.round((Number(item.macronutrientes?.gorduras_g) || 0) * 10) / 10,
    }));

    const rawTotals = data.totais_refeicao || {};
    const sumCalories = components.reduce((acc, c) => acc + c.calories, 0);
    const sumProtein = components.reduce((acc, c) => acc + c.protein, 0);
    const sumCarbs = components.reduce((acc, c) => acc + c.carbs, 0);
    const sumFat = components.reduce((acc, c) => acc + c.fat, 0);
    const sumGrams = components.reduce((acc, c) => acc + c.estimatedGrams, 0);

    const totalKcal = Math.round(Number(rawTotals.energia_total_kcal) || sumCalories);

    const minKcal = Math.round(
      Number(rawTotals.intervalo_confianca_kcal?.minimo) || totalKcal * 0.88,
    );
    const maxKcal = Math.round(
      Number(rawTotals.intervalo_confianca_kcal?.maximo) || totalKcal * 1.12,
    );

    return {
      spatialCalibration: data.calibracao_espacial
        ? {
            referenceObject: data.calibracao_espacial.objeto_referencia_identificado,
            estimatedScale: data.calibracao_espacial.escala_estimada,
          }
        : undefined,
      components,
      totals: {
        totalGrams: Math.round(Number(rawTotals.massa_total_g) || sumGrams),
        totalCalories: totalKcal,
        totalProtein: Math.round((Number(rawTotals.proteinas_totais_g) || sumProtein) * 10) / 10,
        totalCarbs: Math.round((Number(rawTotals.carboidratos_totais_g) || sumCarbs) * 10) / 10,
        totalFat: Math.round((Number(rawTotals.gorduras_totais_g) || sumFat) * 10) / 10,
        uncertaintyRange: {
          minCalories: minKcal,
          maxCalories: maxKcal,
        },
      },
    };
  } catch (err) {
    console.error('[mealVisionEstimate] Falha no parse JSON:', err);
    return null;
  }
}
