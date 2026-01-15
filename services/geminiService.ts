
import { GoogleGenAI } from "@google/genai";
import { Article, Measurement, Category } from '../types';
import { CATEGORIES } from '../constants';

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is not configured");
  }
  return new GoogleGenAI({ apiKey });
};

// Helper to clean JSON from Markdown code blocks
const cleanAndParseJson = (text: string) => {
  try {
    // Remove ```json and ``` wrapping
    let cleanText = text.replace(/```json\n?|```/g, '').trim();
    // Sometimes the model adds extra text, try to find the first { and last }
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    
    // Also handle array at root
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');

    // Determine if it's an object or array and slice accordingly
    if (firstBracket !== -1 && lastBracket !== -1) {
       // It's likely an array
       cleanText = cleanText.substring(firstBracket, lastBracket + 1);
    } else if (firstBrace !== -1 && lastBrace !== -1) {
       cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return null;
  }
};

export const generateWbsCategories = async (description: string): Promise<Category[]> => {
  try {
    const ai = getAiClient();
    const prompt = `
    Act as an expert Italian Construction Project Manager.
    PROJECT DESCRIPTION: "${description}"

    TASK: Create a HIGHLY CUSTOMIZED Work Breakdown Structure (WBS) / List of Categories (Capitoli) specifically for this project.
    
    CRITICAL INSTRUCTIONS:
    1. Do NOT use a standard/generic list. The categories must change based on the specific works described.
    2. If the project is small (e.g. "Ristrutturazione Bagno"), use specific categories like "Demolizioni Bagno", "Impianti Idrosanitari", "Posa Rivestimenti", "Sanitari".
    3. If the project is general (e.g. "Costruzione Villetta"), use broader categories like "Scavi", "Fondazioni", "Elevazioni", "Tetto".
    4. Generate between 4 to 10 categories depending on the project complexity.
    5. Use sequential codes like "WBS.01", "WBS.02", etc.
    6. Return ONLY a JSON array of objects.

    OUTPUT FORMAT:
    [
      { "code": "WBS.01", "name": "..." },
      { "code": "WBS.02", "name": "..." }
    ]
    `;

    // Use flash for maximum speed
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) return [];

    const data = cleanAndParseJson(text);
    if (Array.isArray(data)) {
      return data.map((item: any) => ({
        code: item.code,
        name: item.name,
        isEnabled: true,
        isLocked: false
      }));
    } else if (data && data.categories && Array.isArray(data.categories)) {
        return data.categories.map((item: any) => ({
            code: item.code,
            name: item.name,
            isEnabled: true,
            isLocked: false
        }));
    }
    
    return [];

  } catch (error) {
    console.error("WBS Generation Error:", error);
    return [];
  }
};

export const generateArticleItem = async (
  categoryName: string, 
  categoryCode: string, 
  userInstruction: string = "",
  region: string = "Lombardia",
  year: string = "2024"
): Promise<Partial<Article> | null> => {
  try {
    const ai = getAiClient();
    
    let promptContext = "";
    if (userInstruction) {
      promptContext = `USER REQUEST: "${userInstruction}".`;
    } else {
      promptContext = `Generate a standard item for this category.`;
    }

    const prompt = `Act as an expert Italian Quantity Surveyor (Computista Esperto). 
    TASK: Provide a technical construction item for a "Computo Metrico Estimativo".
    Region/Context: ${region} ${year}.
    Category: "${categoryName}" (${categoryCode}).
    ${promptContext}

    INSTRUCTIONS:
    1. Try to find a real match in official Price Lists (Prezzari Regionali/DEI) if possible using Google Search.
    2. IF NOT FOUND or if the request is custom: YOU MUST GENERATE A "New Price" (Nuovo Prezzo) based on your expert knowledge of current market rates in Italy.
    3. If generating a New Price, use the code format "NP.###" (e.g., NP.001).
    4. The Description must be highly professional, technical, and detailed (include materials, labor, transport, etc.).
    5. The Labor Incidence (Manodopera) is mandatory (0-100%).

    OUTPUT FORMAT:
    Return ONLY a JSON object.
    {
      "found": boolean,
      "code": string,       // Official Code or NP.xxx
      "description": string, // Full technical description
      "unit": string,       // e.g., m2, cad, kg
      "unitPrice": number,  // Number
      "laborRate": number,   // Percentage (0-100)
      "priceListSource": string    // e.g. "Prezzario Lombardia 2024" or "Analisi NP"
    }
    `;

    // CHANGED TO GEMINI 2.5 FLASH FOR SPEED
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const data = cleanAndParseJson(text);
    
    if (!data) {
      return null;
    }

    return {
      code: data.code,
      description: data.description,
      unit: data.unit,
      unitPrice: data.unitPrice,
      laborRate: data.laborRate,
      priceListSource: data.priceListSource,
      quantity: 1 // Default to 1 if not specified
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
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
    
    // Map the CURRENTLY AVAILABLE categories, not the static constant ones
    const categoriesList = availableCategories.map(c => `${c.code}: ${c.name}`).join("\n");

    const prompt = `Act as an expert Quantity Surveyor.
    PROJECT CONTEXT: ${userDescription}
    REGION/YEAR: ${region} ${year}
    
    TASK: Break down the project into a list of specific work items.
    
    INSTRUCTIONS:
    1. Analyze the description and create a logical list of works.
    2. Map each item strictly to one of these provided categories:
    ${categoriesList}
    3. Use official codes if known, otherwise use "NP.xxx" (Nuovo Prezzo) and estimate market prices.
    4. Provide realistic Labor Rates (%).

    OUTPUT FORMAT:
    Return ONLY a JSON object with an array "items".
    {
      "items": [
        {
          "categoryCode": "WBS.01",
          "code": "1C.10... or NP.001",
          "description": "...",
          "unit": "...",
          "quantity": 10,
          "unitPrice": 100.00,
          "laborRate": 25,
          "priceListSource": "Stima Sintetica"
        }
      ]
    }
    `;

    // Keeping pro for bulk reasoning as it's complex, but could switch if needed
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    if (!text) return [];

    const data = cleanAndParseJson(text);
    return data?.items || [];

  } catch (error) {
    console.error("Gemini Bulk API Error:", error);
    throw error;
  }
};

// DETERMINISTIC PARSING FUNCTION (No AI)
// Rules: 1. Code, 2. Description, 3. Unit, 4. Price, 5. Labor (0.5 or 50%), 6. Source
export const parseDroppedContent = (rawText: string): Partial<Article> | null => {
  try {
    if (!rawText) return null;

    // Normalize text: split by Tab first (common in web tables/Excel)
    // If not tabs, try splitting by newlines (if copy-pasted as list)
    let parts = rawText.split('\t').map(s => s.trim()).filter(s => s.length > 0);
    
    // Fallback to newline if tabs didn't produce structured data (e.g. less than 3 fields)
    if (parts.length < 3) {
       parts = rawText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    }

    // Must have at least Code, Desc, Unit, Price
    if (parts.length < 4) {
      console.warn("Dropped content structure not recognized. Requires at least 4 fields.");
      return null;
    }

    // 1. Code
    const code = parts[0];

    // 2. Description
    const description = parts[1];

    // 3. Unit (U.M.)
    const unit = parts[2];

    // 4. Price
    // Handle format "1.200,00 €" -> 1200.00
    const priceRaw = parts[3];
    const cleanPrice = priceRaw
      .replace(/[€$£\s]/g, '') // remove currency/spaces
      .replace(/\./g, '')      // remove thousands separator
      .replace(',', '.');      // replace decimal separator
    const unitPrice = parseFloat(cleanPrice);

    // 5. Labor Rate (Optional)
    let laborRate = 0;
    if (parts.length >= 5) {
       const laborRaw = parts[4]; // "50 %" or "0,5"
       const cleanLabor = laborRaw.replace(/[%\s]/g, '').replace(',', '.');
       const val = parseFloat(cleanLabor);
       
       if (!isNaN(val)) {
         // Logic: if <= 1 (e.g. 0.5), treat as factor -> 50%
         // if > 1 (e.g. 50), treat as percentage -> 50%
         if (val <= 1 && val > 0) {
            laborRate = val * 100;
         } else {
            laborRate = val;
         }
       }
    }

    // 6. Source (Index 5)
    let priceListSource = "";
    if (parts.length >= 6) {
        priceListSource = parts[5];
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
    console.error("Local Parsing Error:", error);
    return null;
  }
};

export const parseVoiceMeasurement = async (transcript: string): Promise<Partial<Measurement>> => {
    try {
        const ai = getAiClient();
        const prompt = `
        Act as a data parser for a construction app.
        USER SPOKEN INPUT: "${transcript}"
        
        TASK: Extract measurement data.
        Return ONLY a JSON object with:
        - description: string (the text part)
        - length: number | null
        - width: number | null
        - height: number | null (can be height or weight)
        - multiplier: number | null (default null)
        
        Example: "Muro cucina 4 per 3" -> {"description": "Muro cucina", "length": 4, "width": 3, "height": null, "multiplier": null}
        Example: "2 finestre soggiorno uno e venti per due e dieci" -> {"description": "finestre soggiorno", "length": 1.20, "width": 2.10, "height": null, "multiplier": 2}
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Use flash for speed
            contents: prompt,
            config: { responseMimeType: "application/json" } // Force JSON
        });

        const text = response.text;
        if (!text) return { description: transcript };

        const data = JSON.parse(text);
        return {
            description: data.description || transcript,
            length: data.length || undefined,
            width: data.width || undefined,
            height: data.height || undefined,
            multiplier: data.multiplier || undefined
        };
    } catch (e) {
        console.error("Voice Parse Error", e);
        return { description: transcript };
    }
}
