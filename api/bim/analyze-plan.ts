import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

export const maxDuration = 60;

export interface AnalyzePlanResult {
  status: number;
  payload: Record<string, unknown>;
}

function stripMarkdownJsonFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export async function analyzePlanWithGemini(bodyInput: unknown): Promise<AnalyzePlanResult> {
  try {
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.API_KEY ||
      process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      return {
        status: 503,
        payload: {
          ok: false,
          error:
            'Chiave API Gemini non configurata sul server. Su Vercel imposta GEMINI_API_KEY in Settings > Environment Variables ed esegui un Redeploy; in AI Studio verifica Settings > Secrets.',
        },
      };
    }

    const body = (bodyInput && typeof bodyInput === 'object' ? bodyInput : {}) as Record<string, any>;
    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    const mimeType = body.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    const planWidthM = Number(body.planWidthM) || 15;
    const planHeightM = Number(body.planHeightM) || 12;
    const defaultHeightM = Number(body.defaultHeightM) || 3.0;
    const roomHints = Array.isArray(body.roomHints) ? body.roomHints.slice(0, 24) : [];

    if (!imageBase64 || imageBase64.length < 100) {
      return {
        status: 400,
        payload: { ok: false, error: 'Immagine planimetria mancante o non valida.' },
      };
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const hintsStr =
      roomHints.length > 0
        ? `\nDetected room label hints (name @ normalized [x,y] in 0..1000): ${roomHints
            .map((h: any) => `${h.name} (${h.xNorm},${h.yNorm}${h.areaMq ? `, ${h.areaMq}m2` : ''})`)
            .join('; ')}`
        : '';

    const systemInstruction = `You are a senior Italian BIM architect and CAD blueprint vectorizer.
Trace ONLY the real architectural structure of the attached 2D floor plan image into clean, crisp, watertight 3D BIM geometry (matching a minimalist white architectural cutaway maquette).

CRITICAL ACCURACY RULES:
1. IGNORE COMPLETELY: text labels, dimension numbers, dimension lines, arrows, hatches, title blocks (cartigli), furniture, beds, sofas, tables, kitchen cabinets, sinks, toilets, shower lines, AND staircase tread steps (NEVER trace stair steps as parallel walls!).
2. COORDINATES: integer values 0..1000 relative to the FULL image width (x: 0=left, 1000=right) and FULL image height (y: 0=top, 1000=bottom). Coordinates MUST align accurately to the wall centerlines in the image.
3. WALLS: Trace ONLY true structural exterior perimeter walls ("perimeter", thicknessM 0.30–0.38) and interior room-dividing partition walls ("partition", thicknessM 0.10–0.12). NEVER output duplicate/double parallel walls for a single wall! Merge collinear segments into one continuous centerline (doors/windows are carved automatically). Snap wall endpoints cleanly at corners so rooms close airtight. Include angled/diagonal perimeter walls accurately.
4. DOORS: Identify every real door opening from swing arcs or breaks (widthM 0.75–1.05, angleDeg aligned to host wall, swingSign 1 or -1).
5. WINDOWS: Identify every exterior window ("window", sillHeightM 0.95) and balcony French door ("french_door", sillHeightM 0.0) on perimeter walls.
6. PILLARS: Identify standalone square/rectangular structural columns ("pillars").
7. ROOMS: Trace a clean non-overlapping polygon (4–8 vertices in 0..1000 coords) for EVERY interior room, corridor, bathroom, stairwell, and exterior balcony/terrace, staying strictly inside the building/balcony footprint. Set floorType="oak" for living areas/bedrooms and floorType="ceramic" for bathrooms, kitchens, corridors, entrances, staircases, and balconies.
8. RAILINGS: Trace exterior balcony railings/parapets as straight segments (x1,y1,x2,y2).
Keep the output concise, clean, and geometrically exact. Return ONLY valid JSON.`;

    const promptText = `Vectorize this 2D architectural floor plan into clean, non-duplicated 3D/BIM geometry.
Sheet scale: image width = ${planWidthM.toFixed(2)} m, image height = ${planHeightM.toFixed(2)} m, wall height = ${defaultHeightM.toFixed(2)} m.${hintsStr}
Trace ONLY true walls, doors, windows, pillars, room polygons, and balcony railings. Never trace stair treads, furniture, text, or dimension lines.`;

    const t0 = Date.now();
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        walls: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              x1: { type: Type.NUMBER },
              y1: { type: Type.NUMBER },
              x2: { type: Type.NUMBER },
              y2: { type: Type.NUMBER },
              category: { type: Type.STRING, enum: ['perimeter', 'partition'] },
              thicknessM: { type: Type.NUMBER },
              roomName: { type: Type.STRING },
            },
            required: ['x1', 'y1', 'x2', 'y2', 'category'],
          },
        },
        doors: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              cx: { type: Type.NUMBER },
              cy: { type: Type.NUMBER },
              widthM: { type: Type.NUMBER },
              angleDeg: { type: Type.NUMBER },
              doorType: { type: Type.STRING, enum: ['internal', 'entrance', 'sliding'] },
              swingSign: { type: Type.NUMBER },
              roomName: { type: Type.STRING },
            },
            required: ['cx', 'cy', 'widthM', 'angleDeg'],
          },
        },
        windows: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              cx: { type: Type.NUMBER },
              cy: { type: Type.NUMBER },
              widthM: { type: Type.NUMBER },
              angleDeg: { type: Type.NUMBER },
              windowType: { type: Type.STRING, enum: ['window', 'french_door', 'glass_wall'] },
              sillHeightM: { type: Type.NUMBER },
              roomName: { type: Type.STRING },
            },
            required: ['cx', 'cy', 'widthM', 'angleDeg'],
          },
        },
        pillars: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              cx: { type: Type.NUMBER },
              cy: { type: Type.NUMBER },
              widthM: { type: Type.NUMBER },
              depthM: { type: Type.NUMBER },
            },
            required: ['cx', 'cy', 'widthM', 'depthM'],
          },
        },
        rooms: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              floorType: { type: Type.STRING, enum: ['oak', 'ceramic'] },
              areaM2: { type: Type.NUMBER },
              polygon: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                  },
                  required: ['x', 'y'],
                },
              },
            },
            required: ['name', 'floorType', 'polygon'],
          },
        },
        railings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              x1: { type: Type.NUMBER },
              y1: { type: Type.NUMBER },
              x2: { type: Type.NUMBER },
              y2: { type: Type.NUMBER },
              heightM: { type: Type.NUMBER },
            },
            required: ['x1', 'y1', 'x2', 'y2'],
          },
        },
      },
      required: ['walls', 'doors', 'windows', 'pillars', 'rooms'],
    };

    const attempts: Array<{ model: string; level: ThinkingLevel; delayMs: number }> = [
      { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL, delayMs: 0 },
      { model: 'gemini-4-hydrogen', level: ThinkingLevel.LOW, delayMs: 400 },
    ];

    let rawText = '';
    let modelUsed = attempts[0].model;
    let lastErr: any = null;

    for (const attempt of attempts) {
      if (attempt.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, attempt.delayMs));
      }
      try {
        const response = await ai.models.generateContent({
          model: attempt.model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
              { text: promptText },
            ],
          },
          config: {
            thinkingConfig: {
              thinkingLevel: attempt.level,
            },
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema,
          },
        });
        const text = (response.text || '').trim();
        if (text) {
          rawText = text;
          modelUsed = attempt.model;
          break;
        }
      } catch (err: any) {
        lastErr = err;
        const errStr = String(err?.message || err || '');
        const isRetryable =
          /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|404|NOT_FOUND|high demand|overloaded|timeout/i.test(errStr);
        console.warn(
          `[BIM AI] Tentativo su ${attempt.model} fallito (${isRetryable ? 'riprovabile' : 'definitivo'}):`,
          errStr.slice(0, 180)
        );
        if (!isRetryable) break;
      }
    }

    if (!rawText) {
      const errStr = String(lastErr?.message || '');
      const friendly = /503|UNAVAILABLE|high demand/i.test(errStr)
        ? 'Il servizio AI è momentaneamente sovraccarico (503). Riprova tra qualche secondo con "Ricostruisci Pulito".'
        : /429|RESOURCE_EXHAUSTED/i.test(errStr)
        ? 'Quota temporanea AI esaurita (429). Riprova tra un momento o verifica la chiave API.'
        : /API_KEY|PERMISSION_DENIED|403/i.test(errStr)
        ? 'Chiave API Gemini non valida o non autorizzata. Verifica GEMINI_API_KEY nelle impostazioni del server.'
        : errStr || 'Risposta vuota dal servizio AI.';
      return { status: 503, payload: { ok: false, error: friendly } };
    }

    const parsed = JSON.parse(stripMarkdownJsonFences(rawText));
    const durationMs = Date.now() - t0;
    console.log(
      `[BIM AI] Analisi completata con ${modelUsed} in ${durationMs}ms (walls=${parsed?.walls?.length ?? 0}, rooms=${parsed?.rooms?.length ?? 0})`
    );
    return {
      status: 200,
      payload: { ok: true, modelUsed, durationMs, data: parsed },
    };
  } catch (err: any) {
    console.error('Errore /api/bim/analyze-plan:', err);
    const msg = err?.message || 'Errore durante la ricostruzione architettonica AI.';
    return { status: 500, payload: { ok: false, error: msg } };
  }
}

type VercelReq = IncomingMessage & { body?: unknown; method?: string };
type VercelRes = ServerResponse & {
  status?: (code: number) => VercelRes;
  json?: (body: unknown) => void;
};

function sendJson(res: VercelRes, statusCode: number, data: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function readJsonBody(req: VercelReq): Promise<unknown> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      return req.body.trim() ? JSON.parse(req.body) : {};
    }
    if (Buffer.isBuffer(req.body)) {
      const str = req.body.toString('utf8').trim();
      return str ? JSON.parse(str) : {};
    }
    return req.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Metodo non consentito. Usa POST.' });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, error: 'Payload JSON non valido.' });
    return;
  }

  const result = await analyzePlanWithGemini(body);
  sendJson(res, result.status, result.payload);
}
