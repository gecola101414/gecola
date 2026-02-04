
import { GoogleGenAI, Type } from "@google/genai";
import { Article, Measurement, Category } from '../types';

const getAiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const cleanAndParseJson = (text: string) => {
  try {
    let cleanText = text.replace(/```json\n?|```/g, '').trim();
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');

    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
       cleanText = cleanText.substring(firstBracket, lastBracket + 1);
    } else if (firstBrace !== -1) {
       cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return null;
  }
};

export const generateBulkItems = async (
  userDescription: string,
  region: string,
  year: string,
  availableCategories: Category[]
): Promise<Partial<Article>[]> => {
  try {
    const ai = getAiClient();
    const categoriesList = availableCategories.map(c => `${c.code}: ${c.name}`).join("\n");

    const prompt = `Act as an expert Italian Quantity Surveyor.
    PROJECT CONTEXT: ${userDescription}
    REGION/YEAR: ${region} ${year}
    
    TASK: Break down the project into work items mapped strictly to these categories:
    ${categoriesList}

    Return ONLY a JSON object with an array "items".
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  categoryCode: { type: Type.STRING },
                  code: { type: Type.STRING },
                  description: { type: Type.STRING },
                  unit: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unitPrice: { type: Type.NUMBER },
                  laborRate: { type: Type.NUMBER },
                  priceListSource: { type: Type.STRING }
                },
                required: ["categoryCode", "code", "description", "unit", "quantity", "unitPrice"]
              }
            }
          }
        }
      },
    });

    const data = cleanAndParseJson(response.text || "");
    const groundingUrls = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return (data?.items || []).map((item: any) => ({
        ...item,
        groundingUrls: groundingUrls
    }));
  } catch (error) {
    console.error("Gemini Bulk API Error:", error);
    throw error;
  }
};

/**
 * PARSER "AGGANCIO PERFETTO" v2.6
 * Ottimizzato per listini GeCoLa.it: estrae dinamicamente il nome del prezzario ufficiale.
 */
export const parseDroppedContent = (rawText: string): Partial<Article> | null => {
  try {
    if (!rawText) return null;

    // Cleanup e normalizzazione testo
    const cleanText = rawText.trim();

    // Split per tabulazioni o spazi multipli (struttura tabellare)
    let parts = cleanText.split(/\t|\s{3,}/).map(s => s.trim()).filter(s => s.length > 0);
    
    // Se non abbiamo abbastanza parti, proviamo a processare le righe
    if (parts.length < 3) {
      parts = cleanText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    }

    if (parts.length < 3) return null;

    const parseItaNumber = (str: string) => {
        if (!str) return 0;
        // Rimuove simboli valuta, gestisce punti migliaia e virgole decimali
        const clean = str.replace(/[€$£%\s]/g, '').replace(/\./g, '').replace(',', '.');
        return parseFloat(clean);
    };

    // Mappatura Standard: 0:Codice, 1:Descrizione, 2:UM, 3:Prezzo, 4:MO%
    const code = parts[0] || 'NP.001';
    const description = parts[1] || 'Voce importata';
    const unit = parts[2] || 'cad';
    const unitPrice = parseItaNumber(parts[3] || '0');
    
    let laborRate = 0;
    if (parts.length >= 5) {
       const val = parseItaNumber(parts[4]);
       laborRate = !isNaN(val) ? (val <= 1 && val > 0 ? val * 100 : val) : 0;
    }

    // --- LOGICA ESTRAZIONE PREZZARIO UFFICIALE (Task Richiesto) ---
    let priceListSource = "Prezzario Ufficiale";
    
    // Se è presente una sesta parte, solitamente è il nome del prezzario sorgente
    if (parts.length >= 6) {
       priceListSource = parts[5];
    } else {
       // Euristiche di ricerca nel blocco di testo completo per pattern comuni (es. "Prezzario Regione... 2024")
       const sourceMatch = cleanText.match(/(Prezzario|Listino|Tariffario)\s+[A-Za-z\s,]+\s+\d{4}/i);
       if (sourceMatch) {
           priceListSource = sourceMatch[0];
       } else if (cleanText.toLowerCase().includes("gecola.it")) {
           priceListSource = "Listino Online GeCoLa";
       }
    }

    return {
      code,
      description,
      unit,
      unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
      laborRate: isNaN(laborRate) ? 0 : laborRate,
      quantity: 1,
      priceListSource
    };
  } catch (error) {
    console.error("Perfect Hook Parser Error:", error);
    return null;
  }
};

export const parseVoiceMeasurement = async (transcript: string): Promise<Partial<Measurement>> => {
    try {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Extract measurement data from: "${transcript}". Return JSON with description, length, width, height, multiplier.`,
            config: { 
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  length: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER },
                  multiplier: { type: Type.NUMBER }
                }
              }
            }
        });
        const data = JSON.parse(response.text || "{}");
        return {
            description: data.description || transcript,
            length: data.length || undefined,
            width: data.width || undefined,
            height: data.height || undefined,
            multiplier: data.multiplier || undefined
        };
    } catch (e) {
        return { description: transcript };
    }
}
