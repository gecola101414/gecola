
import { GoogleGenAI, Type } from "@google/genai";
import { Article, Measurement, Category } from '../types';
import { CATEGORIES } from '../constants';

// Added comment above fix: strictly following initialization guidelines
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

    // Added responseSchema for more structured and reliable JSON responses from the model
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

    // Added comment: correctly accessing .text property
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

export const parseDroppedContent = (rawText: string): Partial<Article> | null => {
  try {
    if (!rawText) return null;
    let parts = rawText.split('\t').map(s => s.trim()).filter(s => s.length > 0);
    if (parts.length < 3) {
       parts = rawText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    }
    if (parts.length < 4) return null;

    const unitPrice = parseFloat(parts[3].replace(/[€$£\s]/g, '').replace(/\./g, '').replace(',', '.'));
    let laborRate = 0;
    if (parts.length >= 5) {
       const val = parseFloat(parts[4].replace(/[%\s]/g, '').replace(',', '.'));
       laborRate = !isNaN(val) ? (val <= 1 ? val * 100 : val) : 0;
    }

    return {
      code: parts[0],
      description: parts[1],
      unit: parts[2],
      unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
      laborRate,
      quantity: 1,
      priceListSource: parts[5] || ""
    };
  } catch (error) {
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
        // Added comment: correctly accessing .text property
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
