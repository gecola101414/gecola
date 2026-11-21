import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

function getCliArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const prefix = `${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

const PORT = Number(getCliArg('--port') || process.env.PORT || 3000);
const HOST = getCliArg('--host') || '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

const DATA_ROOT = path.resolve('.gecola-shared');
const FILES_DIR = path.join(DATA_ROOT, 'files');
const INDEX_FILE = path.join(DATA_ROOT, 'index.json');
const FOLDERS_FILE = path.join(DATA_ROOT, 'folders.json');
const CHAT_FILE = path.join(DATA_ROOT, 'chat.json');

const DEFAULT_FOLDERS = ['Generale', 'Gare e Appalti', 'Cantieri Attivi', 'Subappalti'];

interface SharedFileMeta {
  id: string;
  fileName: string;
  title: string;
  folder: string;
  docType: 'CME' | 'CM';
  author: string;
  note?: string;
  articleCount: number;
  planSheetCount: number;
  totalAmount: number;
  sizeBytes: number;
  savedAt: string;
  updatedAt: string;
}

interface ChatAttachment {
  sharedFileId: string;
  fileName: string;
  title: string;
  folder: string;
  docType: 'CME' | 'CM';
  articleCount: number;
  totalAmount: number;
}

interface ChatMessage {
  id: string;
  channel: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  attachment?: ChatAttachment;
}

interface OnlineClient {
  ws: WebSocket;
  clientId: string;
  userId: string;
  userName: string;
  channel: string;
  connectedAt: string;
}

function ensureStorageDirs() {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  if (!fs.existsSync(FOLDERS_FILE)) {
    fs.writeFileSync(FOLDERS_FILE, JSON.stringify(DEFAULT_FOLDERS, null, 2), 'utf8');
  }
  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify([], null, 2), 'utf8');
  }
  if (!fs.existsSync(CHAT_FILE)) {
    fs.writeFileSync(CHAT_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function sanitizeFolderName(name: string): string {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return cleaned || 'Generale';
}

function sanitizeFileId(id: string): string {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

ensureStorageDirs();

const app = express();
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const onlineClients = new Map<string, OnlineClient>();

function broadcastEvent(payload: Record<string, unknown>) {
  const encoded = JSON.stringify(payload);
  for (const client of onlineClients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(encoded);
    }
  }
}

function getOnlineOperatorsList() {
  const byUser = new Map<string, { userId: string; userName: string; channel: string; connectedAt: string }>();
  for (const c of onlineClients.values()) {
    if (!byUser.has(c.userId)) {
      byUser.set(c.userId, {
        userId: c.userId,
        userName: c.userName,
        channel: c.channel,
        connectedAt: c.connectedAt,
      });
    }
  }
  return Array.from(byUser.values());
}

function broadcastPresence() {
  broadcastEvent({
    type: 'presence:update',
    operators: getOnlineOperatorsList(),
  });
}

function appendChatMessage(msg: ChatMessage): ChatMessage {
  const all = readJsonSafe<ChatMessage[]>(CHAT_FILE, []);
  const existing = all.find((m) => m.id === msg.id);
  if (existing) return existing;
  const next = [...all, msg].slice(-500);
  writeJsonSafe(CHAT_FILE, next);
  return msg;
}

// ---------------- API: CARTELLA CONDIVISA ----------------

app.get('/api/shared-folder', (_req, res) => {
  const folders = readJsonSafe<string[]>(FOLDERS_FILE, DEFAULT_FOLDERS);
  const files = readJsonSafe<SharedFileMeta[]>(INDEX_FILE, []).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  res.json({ folders, files });
});

app.post('/api/shared-folder/folders', (req, res) => {
  const folderName = sanitizeFolderName(req.body?.name);
  const folders = readJsonSafe<string[]>(FOLDERS_FILE, DEFAULT_FOLDERS);
  if (!folders.some((f) => f.toLowerCase() === folderName.toLowerCase())) {
    folders.push(folderName);
    writeJsonSafe(FOLDERS_FILE, folders);
    broadcastEvent({ type: 'shared:updated', action: 'folder_created', folder: folderName });
  }
  res.json({ ok: true, folder: folderName, folders });
});

app.post('/api/shared-folder/files', (req, res) => {
  try {
    const body = req.body || {};
    const folder = sanitizeFolderName(body.folder || 'Generale');
    const docType: 'CME' | 'CM' = body.docType === 'CM' ? 'CM' : 'CME';
    const rawTitle = String(body.title || body.fileName || 'Progetto_GeCoLa').trim();
    const cleanBase = rawTitle.replace(/\.(json)$/i, '').replace(/[\\/:*?"<>|]+/g, '_');
    const fileName = body.fileName
      ? String(body.fileName).trim()
      : `${cleanBase}_${docType}.json`;
    const author = String(body.author || 'Operatore GeCoLa').trim().slice(0, 80);
    const note = body.note ? String(body.note).trim().slice(0, 240) : undefined;
    const payload = body.payload;

    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'Contenuto progetto mancante.' });
      return;
    }

    const folders = readJsonSafe<string[]>(FOLDERS_FILE, DEFAULT_FOLDERS);
    if (!folders.some((f) => f.toLowerCase() === folder.toLowerCase())) {
      folders.push(folder);
      writeJsonSafe(FOLDERS_FILE, folders);
    }

    const index = readJsonSafe<SharedFileMeta[]>(INDEX_FILE, []);
    const nowIso = new Date().toISOString();
    const existingIdx = index.findIndex(
      (f) => f.folder.toLowerCase() === folder.toLowerCase() && f.fileName.toLowerCase() === fileName.toLowerCase()
    );

    const id = existingIdx >= 0 ? index[existingIdx].id : `sh_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const serialized = JSON.stringify(payload, null, 2);
    const sizeBytes = Buffer.byteLength(serialized, 'utf8');
    fs.writeFileSync(path.join(FILES_DIR, `${id}.json`), serialized, 'utf8');

    const meta: SharedFileMeta = {
      id,
      fileName,
      title: rawTitle,
      folder,
      docType,
      author,
      note,
      articleCount: Number(body.articleCount) || 0,
      planSheetCount: Number(body.planSheetCount) || 0,
      totalAmount: Number(body.totalAmount) || 0,
      sizeBytes,
      savedAt: existingIdx >= 0 ? index[existingIdx].savedAt : nowIso,
      updatedAt: nowIso,
    };

    if (existingIdx >= 0) {
      index[existingIdx] = meta;
    } else {
      index.unshift(meta);
    }
    writeJsonSafe(INDEX_FILE, index);

    broadcastEvent({ type: 'shared:updated', action: 'file_saved', file: meta });

    if (body.notifyInChat) {
      const chatChannel = String(body.chatChannel || 'generale').trim() || 'generale';
      const chatMsg: ChatMessage = {
        id: `msg_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
        channel: chatChannel,
        senderId: String(body.senderId || author),
        senderName: author,
        text: note
          ? `Ho salvato "${fileName}" nella cartella condivisa "${folder}": ${note}`
          : `Ho salvato "${fileName}" nella cartella condivisa "${folder}".`,
        timestamp: nowIso,
        attachment: {
          sharedFileId: meta.id,
          fileName: meta.fileName,
          title: meta.title,
          folder: meta.folder,
          docType: meta.docType,
          articleCount: meta.articleCount,
          totalAmount: meta.totalAmount,
        },
      };
      const savedMsg = appendChatMessage(chatMsg);
      broadcastEvent({ type: 'chat:message', message: savedMsg });
    }

    res.json({ ok: true, file: meta, folders });
  } catch (err: any) {
    console.error('Shared folder save error:', err);
    res.status(500).json({ error: err?.message || 'Errore salvataggio in cartella condivisa.' });
  }
});

app.get('/api/shared-folder/files/:id', (req, res) => {
  const id = sanitizeFileId(req.params.id);
  const index = readJsonSafe<SharedFileMeta[]>(INDEX_FILE, []);
  const meta = index.find((f) => f.id === id);
  const filePath = path.join(FILES_DIR, `${id}.json`);

  if (!meta || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File non trovato nella cartella condivisa.' });
    return;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ meta, payload });
  } catch {
    res.status(500).json({ error: 'File corrotto o illeggibile.' });
  }
});

app.delete('/api/shared-folder/files/:id', (req, res) => {
  const id = sanitizeFileId(req.params.id);
  const index = readJsonSafe<SharedFileMeta[]>(INDEX_FILE, []);
  const nextIndex = index.filter((f) => f.id !== id);
  writeJsonSafe(INDEX_FILE, nextIndex);

  const filePath = path.join(FILES_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore unlink error
    }
  }

  broadcastEvent({ type: 'shared:updated', action: 'file_deleted', fileId: id });
  res.json({ ok: true, id });
});

// ---------------- API: CHAT TEAM ----------------

app.get('/api/chat/messages', (req, res) => {
  const channel = req.query.channel ? String(req.query.channel) : null;
  const all = readJsonSafe<ChatMessage[]>(CHAT_FILE, []);
  const messages = channel ? all.filter((m) => m.channel === channel) : all;
  res.json({
    messages: messages.slice(-200),
    operators: getOnlineOperatorsList(),
  });
});

app.post('/api/chat/messages', (req, res) => {
  const body = req.body || {};
  const text = String(body.text || '').trim().slice(0, 2000);
  if (!text && !body.attachment) {
    res.status(400).json({ error: 'Messaggio vuoto.' });
    return;
  }

  const msg: ChatMessage = {
    id: String(body.id || `msg_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`),
    channel: String(body.channel || 'generale').trim() || 'generale',
    senderId: String(body.senderId || 'anon'),
    senderName: String(body.senderName || 'Operatore').trim().slice(0, 80),
    text,
    timestamp: body.timestamp || new Date().toISOString(),
    attachment: body.attachment || undefined,
  };

  const saved = appendChatMessage(msg);
  broadcastEvent({ type: 'chat:message', message: saved });
  res.json({ ok: true, message: saved });
});

app.delete('/api/chat/messages/:id', (req, res) => {
  const id = String(req.params.id || '');
  const all = readJsonSafe<ChatMessage[]>(CHAT_FILE, []);
  const next = all.filter((m) => m.id !== id);
  writeJsonSafe(CHAT_FILE, next);
  broadcastEvent({ type: 'chat:deleted', messageId: id });
  res.json({ ok: true, id });
});

// ---------------- WEBSOCKET SERVER (/ws) ----------------

wss.on('connection', (ws) => {
  const clientId = `cl_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  onlineClients.set(clientId, {
    ws,
    clientId,
    userId: clientId,
    userName: 'Operatore',
    channel: 'generale',
    connectedAt: new Date().toISOString(),
  });

  ws.send(
    JSON.stringify({
      type: 'init',
      clientId,
      messages: readJsonSafe<ChatMessage[]>(CHAT_FILE, []).slice(-200),
      operators: getOnlineOperatorsList(),
    })
  );

  ws.on('message', (rawData) => {
    try {
      const data = JSON.parse(String(rawData));
      const client = onlineClients.get(clientId);
      if (!client) return;

      if (data.type === 'presence:join') {
        client.userId = String(data.userId || clientId).slice(0, 80);
        client.userName = String(data.userName || 'Operatore').trim().slice(0, 80) || 'Operatore';
        client.channel = String(data.channel || 'generale').trim() || 'generale';
        broadcastPresence();
        return;
      }

      if (data.type === 'chat:send') {
        const text = String(data.text || '').trim().slice(0, 2000);
        if (!text && !data.attachment) return;
        const msg: ChatMessage = {
          id: String(data.id || `msg_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`),
          channel: String(data.channel || client.channel || 'generale'),
          senderId: client.userId,
          senderName: String(data.senderName || client.userName || 'Operatore').trim().slice(0, 80),
          text,
          timestamp: new Date().toISOString(),
          attachment: data.attachment || undefined,
        };
        const saved = appendChatMessage(msg);
        broadcastEvent({ type: 'chat:message', message: saved });
        return;
      }

      if (data.type === 'chat:delete' && data.messageId) {
        const id = String(data.messageId);
        const all = readJsonSafe<ChatMessage[]>(CHAT_FILE, []);
        writeJsonSafe(
          CHAT_FILE,
          all.filter((m) => m.id !== id)
        );
        broadcastEvent({ type: 'chat:deleted', messageId: id });
      }
    } catch {
      // ignore malformed frames
    }
  });

  ws.on('close', () => {
    onlineClients.delete(clientId);
    broadcastPresence();
  });
});

server.on('upgrade', (request, socket, head) => {
  const reqUrl = request.url || '';
  if (reqUrl === '/ws' || reqUrl.startsWith('/ws?')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: IS_PROD ? 'prod' : 'dev' });
});

// ---------------- API: GEMINI VISION ARCHITECTURAL BIM RECONSTRUCTOR ----------------

app.post('/api/bim/analyze-plan', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      res.status(503).json({
        ok: false,
        error:
          'Chiave API Gemini non configurata sul server. Configura GEMINI_API_KEY in Settings > Secrets per attivare la ricostruzione architettonica AI.',
      });
      return;
    }

    const body = req.body || {};
    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    const mimeType = body.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    const planWidthM = Number(body.planWidthM) || 15;
    const planHeightM = Number(body.planHeightM) || 12;
    const defaultHeightM = Number(body.defaultHeightM) || 3.0;
    const roomHints = Array.isArray(body.roomHints) ? body.roomHints.slice(0, 24) : [];

    if (!imageBase64 || imageBase64.length < 100) {
      res.status(400).json({ ok: false, error: 'Immagine planimetria mancante o non valida.' });
      return;
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
        const isTransient = /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|high demand|overloaded|timeout/i.test(errStr);
        console.warn(`[BIM AI] Tentativo su ${attempt.model} fallito (${isTransient ? 'transitorio' : 'definitivo'}):`, errStr.slice(0, 180));
        if (!isTransient) break;
      }
    }

    if (!rawText) {
      const errStr = String(lastErr?.message || '');
      const friendly = /503|UNAVAILABLE|high demand/i.test(errStr)
        ? 'Il servizio AI è momentaneamente sovraccarico (503). Riprova tra qualche secondo con "Ricostruisci Pulito".'
        : /429|RESOURCE_EXHAUSTED/i.test(errStr)
        ? 'Quota temporanea AI esaurita (429). Riprova tra un momento o verifica la chiave API in Settings > Secrets.'
        : /API_KEY|PERMISSION_DENIED|403/i.test(errStr)
        ? 'Chiave API Gemini non valida o non autorizzata. Verifica la chiave in Settings > Secrets.'
        : errStr || 'Risposta vuota dal servizio AI.';
      res.status(503).json({ ok: false, error: friendly });
      return;
    }

    const parsed = JSON.parse(rawText);
    const durationMs = Date.now() - t0;
    console.log(
      `[BIM AI] Analisi completata con ${modelUsed} in ${durationMs}ms (walls=${parsed?.walls?.length ?? 0}, rooms=${parsed?.rooms?.length ?? 0})`
    );
    res.json({ ok: true, modelUsed, durationMs, data: parsed });
  } catch (err: any) {
    console.error('Errore /api/bim/analyze-plan:', err);
    const msg = err?.message || 'Errore durante la ricostruzione architettonica AI.';
    res.status(500).json({ ok: false, error: msg });
  }
});

// ---------------- VITE DEV MIDDLEWARE / PROD STATIC ----------------

let viteServerInstance: { close: () => Promise<void> } | null = null;

function startServer() {
  if (!IS_PROD) {
    // Initialize Vite asynchronously while HTTP server binds port 3000 immediately
    // so startup probes succeed in <300ms even during cold dependency pre-bundling.
    const viteReady = import('vite')
      .then(({ createServer: createViteServer }) =>
        createViteServer({
          server: {
            middlewareMode: true,
            hmr: false,
            ws: false,
          },
          appType: 'spa',
        })
      )
      .then((vite) => {
        viteServerInstance = vite;
        return vite;
      });

    viteReady.catch((err) => {
      console.error('Errore inizializzazione Vite dev server:', err);
    });

    app.use((req, res, next) => {
      viteReady
        .then((vite) => {
          vite.middlewares(req, res, next);
        })
        .catch(next);
    });
  } else {
    const distDir = path.resolve('dist');
    app.use(express.static(distDir));
    app.use((req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Endpoint non trovato.' });
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`GeCoLa Server attivo su http://${HOST}:${PORT} (${IS_PROD ? 'prod' : 'dev'})`);
  });
}

const shutdown = async () => {
  try {
    wss.close();
    if (viteServerInstance) await viteServerInstance.close();
  } catch {
    // ignore shutdown errors
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

startServer();
