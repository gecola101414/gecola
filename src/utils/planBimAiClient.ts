import { DetectedRoomBlock } from './pdfPlanExtractor';
import {
  BimDoorObject,
  BimPillarObject,
  BimRailingObject,
  BimRoomObject,
  BimWallObject,
  BimWindowObject,
  cleanArchitecturalWalls,
  inferRoomFloorType,
  PlanBimModel,
  splitWallsAroundOpenings,
} from './planBimExtractor';

interface AiRawWall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  category: 'perimeter' | 'partition';
  thicknessM?: number;
  roomName?: string;
}

interface AiRawDoor {
  cx: number;
  cy: number;
  widthM: number;
  angleDeg: number;
  doorType?: 'internal' | 'entrance' | 'sliding';
  swingSign?: number;
  roomName?: string;
}

interface AiRawWindow {
  cx: number;
  cy: number;
  widthM: number;
  angleDeg: number;
  windowType?: 'window' | 'french_door' | 'glass_wall';
  sillHeightM?: number;
  roomName?: string;
}

interface AiRawPillar {
  cx: number;
  cy: number;
  widthM: number;
  depthM: number;
}

interface AiRawRoom {
  name: string;
  floorType?: 'oak' | 'ceramic';
  polygon?: Array<{ x: number; y: number }>;
  areaM2?: number;
}

interface AiRawRailing {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  heightM?: number;
}

interface AiBimApiResponse {
  ok?: boolean;
  error?: string;
  data?: {
    walls?: AiRawWall[];
    doors?: AiRawDoor[];
    windows?: AiRawWindow[];
    pillars?: AiRawPillar[];
    rooms?: AiRawRoom[];
    railings?: AiRawRailing[];
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function polygonAreaM2(pts: Array<{ x: number; y: number }>): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) * 0.5;
}

function polygonPerimeterM(pts: Array<{ x: number; y: number }>): number {
  if (pts.length < 2) return 0;
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

/**
 * Downscales the rendered PDF canvas to a crisp JPEG suitable for Gemini Vision
 * architectural blueprint analysis (max 1536px on longest edge).
 */
function encodeFloorPlanCanvas(canvas: HTMLCanvasElement): { base64: string; mimeType: 'image/jpeg' } {
  const maxDim = 1536;
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  const w = Math.max(256, Math.round(canvas.width * scale));
  const h = Math.max(256, Math.round(canvas.height * scale));

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0, w, h);
  }
  const dataUrl = out.toDataURL('image/jpeg', 0.9);
  const comma = dataUrl.indexOf(',');
  return {
    base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
    mimeType: 'image/jpeg',
  };
}

/**
 * Calls the server-side Gemini Vision architectural analyzer (`POST /api/bim/analyze-plan`)
 * and converts normalized [0..1000] blueprint geometry into a calibrated, clean, watertight
 * PlanBimModel with pure walls, doorways, glazed windows, pillars, oak/ceramic rooms, and railings.
 */
export async function analyzePlanBimWithAi(
  sourceCanvas: HTMLCanvasElement,
  planWidthM: number,
  planHeightM: number,
  metersPerPt: number,
  defaultHeightM: number,
  detectedRooms: DetectedRoomBlock[],
  signal?: AbortSignal
): Promise<PlanBimModel> {
  const { base64, mimeType } = encodeFloorPlanCanvas(sourceCanvas);

  const roomHints = detectedRooms
    .filter((r) => r.name && r.name.trim().length > 0)
    .slice(0, 24)
    .map((r) => ({
      name: r.name.trim(),
      xNorm: Math.round((((r.bbox.x1 + r.bbox.x2) * 0.5 * metersPerPt) / Math.max(0.1, planWidthM)) * 1000),
      yNorm: Math.round((((r.bbox.y1 + r.bbox.y2) * 0.5 * metersPerPt) / Math.max(0.1, planHeightM)) * 1000),
      areaMq: r.areaMq,
    }));

  const resp = await fetch('/api/bim/analyze-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      imageBase64: base64,
      mimeType,
      planWidthM: round2(planWidthM),
      planHeightM: round2(planHeightM),
      defaultHeightM: round2(defaultHeightM),
      roomHints,
    }),
  });

  const json = (await resp.json().catch(() => ({}))) as AiBimApiResponse;
  if (!resp.ok || !json.ok || !json.data) {
    throw new Error(json.error || `Analisi AI BIM non riuscita (HTTP ${resp.status}).`);
  }

  const raw = json.data;
  const toXM = (xNorm: number) => (clamp(Number(xNorm) || 0, 0, 1000) / 1000) * planWidthM;
  const toYM = (yNorm: number) => (clamp(Number(yNorm) || 0, 0, 1000) / 1000) * planHeightM;

  // 1. Walls (orthogonal + diagonal) with clean corner snapping
  const rawWalls = Array.isArray(raw.walls) ? raw.walls : [];
  const workWalls: Array<{
    x1M: number;
    y1M: number;
    x2M: number;
    y2M: number;
    isPerim: boolean;
    thicknessM: number;
    roomName?: string;
  }> = [];

  for (const w of rawWalls) {
    const x1M = toXM(w.x1);
    const y1M = toYM(w.y1);
    const x2M = toXM(w.x2);
    const y2M = toYM(w.y2);
    const len = Math.hypot(x2M - x1M, y2M - y1M);
    if (!Number.isFinite(len) || len < 0.25) continue;

    // Snap near-orthogonal walls (within 2.5 degrees) to exact H or V for crisp CAD alignment
    const absDx = Math.abs(x2M - x1M);
    const absDy = Math.abs(y2M - y1M);
    let sx1 = x1M;
    let sy1 = y1M;
    let sx2 = x2M;
    let sy2 = y2M;
    if (absDy < len * 0.04) {
      const avgY = (y1M + y2M) * 0.5;
      sy1 = avgY;
      sy2 = avgY;
    } else if (absDx < len * 0.04) {
      const avgX = (x1M + x2M) * 0.5;
      sx1 = avgX;
      sx2 = avgX;
    }

    const isPerim = w.category === 'perimeter' || (typeof w.thicknessM === 'number' && w.thicknessM >= 0.2);
    const thicknessM = isPerim
      ? clamp(Number(w.thicknessM) || 0.3, 0.22, 0.55)
      : clamp(Number(w.thicknessM) || 0.11, 0.08, 0.18);

    workWalls.push({
      x1M: sx1,
      y1M: sy1,
      x2M: sx2,
      y2M: sy2,
      isPerim,
      thicknessM,
      roomName: w.roomName?.trim() || undefined,
    });
  }

  // Snap nearby endpoints (<= 0.18m) so walls meet airtight at L/T corners
  const snapDist = 0.18;
  for (let i = 0; i < workWalls.length; i++) {
    for (let j = i + 1; j < workWalls.length; j++) {
      const a = workWalls[i];
      const b = workWalls[j];
      const pairs: Array<['1' | '2', '1' | '2']> = [
        ['1', '1'],
        ['1', '2'],
        ['2', '1'],
        ['2', '2'],
      ];
      for (const [pa, pb] of pairs) {
        const ax = pa === '1' ? a.x1M : a.x2M;
        const ay = pa === '1' ? a.y1M : a.y2M;
        const bx = pb === '1' ? b.x1M : b.x2M;
        const by = pb === '1' ? b.y1M : b.y2M;
        if (Math.hypot(ax - bx, ay - by) <= snapDist) {
          const mx = (ax + bx) * 0.5;
          const my = (ay + by) * 0.5;
          if (pa === '1') {
            a.x1M = mx;
            a.y1M = my;
          } else {
            a.x2M = mx;
            a.y2M = my;
          }
          if (pb === '1') {
            b.x1M = mx;
            b.y1M = my;
          } else {
            b.x2M = mx;
            b.y2M = my;
          }
        }
      }
    }
  }

  let mpCnt = 0;
  let trCnt = 0;
  const initialWalls: BimWallObject[] = workWalls
    .filter((w) => Math.hypot(w.x2M - w.x1M, w.y2M - w.y1M) >= 0.25)
    .map((w, idx) => {
      const dx = w.x2M - w.x1M;
      const dy = w.y2M - w.y1M;
      const len = Math.hypot(dx, dy);
      const angleRad = Math.atan2(dy, dx);
      const orientation: 'H' | 'V' = Math.abs(dx) >= Math.abs(dy) ? 'H' : 'V';
      const code = w.isPerim
        ? `MP${String(++mpCnt).padStart(2, '0')}`
        : `TR${String(++trCnt).padStart(2, '0')}`;
      return {
        id: `ai_wall_${idx + 1}`,
        kind: 'wall',
        code,
        name: w.isPerim
          ? `Muro Perimetrale ${code}${w.roomName ? ` (${w.roomName})` : ''}`
          : `Tramezzo ${code}${w.roomName ? ` (${w.roomName})` : ''}`,
        category: w.isPerim ? 'Muro Perimetrale' : 'Tramezzo Interno',
        material: w.isPerim ? 'Muratura perimetrale' : 'Laterizio forato / Cartongesso',
        x1M: round2(w.x1M),
        y1M: round2(w.y1M),
        x2M: round2(w.x2M),
        y2M: round2(w.y2M),
        cxM: round2((w.x1M + w.x2M) * 0.5),
        cyM: round2((w.y1M + w.y2M) * 0.5),
        lengthM: round2(len),
        thicknessM: round2(w.thicknessM),
        heightM: defaultHeightM,
        orientation,
        angleRad,
        roomName: w.roomName,
      };
    });

  // 2. Doors
  const doors: BimDoorObject[] = (Array.isArray(raw.doors) ? raw.doors : [])
    .filter((d) => Number.isFinite(d.cx) && Number.isFinite(d.cy))
    .map((d, idx) => {
      const deg = Number(d.angleDeg) || 0;
      const rad = (deg * Math.PI) / 180;
      const orientation: 'H' | 'V' = Math.abs(Math.cos(rad)) >= Math.abs(Math.sin(rad)) ? 'H' : 'V';
      const doorType: BimDoorObject['doorType'] =
        d.doorType === 'entrance'
          ? 'Portoncino Blindato'
          : d.doorType === 'sliding'
          ? 'Porta Scorrevole'
          : 'Porta Interna';
      const code = `P${String(idx + 1).padStart(2, '0')}`;
      const roomName = d.roomName?.trim() || undefined;
      return {
        id: `ai_door_${idx + 1}`,
        kind: 'door',
        code,
        name: `${doorType === 'Portoncino Blindato' ? 'Portoncino' : 'Porta'} ${code}${roomName ? ` (${roomName})` : ''}`,
        doorType,
        cxM: round2(toXM(d.cx)),
        cyM: round2(toYM(d.cy)),
        widthM: round2(clamp(Number(d.widthM) || 0.85, 0.6, 1.8)),
        heightM: doorType === 'Portoncino Blindato' ? 2.15 : 2.1,
        thicknessM: doorType === 'Portoncino Blindato' ? 0.3 : 0.12,
        orientation,
        angleRad: rad,
        swingSign: d.swingSign === -1 ? -1 : 1,
        roomName,
      };
    });

  // 3. Windows & Portefinestre
  const windows: BimWindowObject[] = (Array.isArray(raw.windows) ? raw.windows : [])
    .filter((w) => Number.isFinite(w.cx) && Number.isFinite(w.cy))
    .map((w, idx) => {
      const deg = Number(w.angleDeg) || 0;
      const rad = (deg * Math.PI) / 180;
      const orientation: 'H' | 'V' = Math.abs(Math.cos(rad)) >= Math.abs(Math.sin(rad)) ? 'H' : 'V';
      const isFrench = w.windowType === 'french_door' || (typeof w.sillHeightM === 'number' && w.sillHeightM <= 0.1);
      const windowType: BimWindowObject['windowType'] =
        w.windowType === 'glass_wall'
          ? 'Vetrata'
          : isFrench
          ? 'Portafinestra'
          : 'Finestra PVC/Alluminio';
      const code = isFrench ? `PF${String(idx + 1).padStart(2, '0')}` : `F${String(idx + 1).padStart(2, '0')}`;
      const roomName = w.roomName?.trim() || undefined;
      return {
        id: `ai_win_${idx + 1}`,
        kind: 'window',
        code,
        name: `${isFrench ? 'Portafinestra' : 'Finestra'} ${code}${roomName ? ` (${roomName})` : ''}`,
        windowType,
        cxM: round2(toXM(w.cx)),
        cyM: round2(toYM(w.cy)),
        widthM: round2(clamp(Number(w.widthM) || (isFrench ? 1.5 : 1.2), 0.55, 4.2)),
        heightM: isFrench ? 2.25 : 1.35,
        sillHeightM: isFrench ? 0 : round2(clamp(Number(w.sillHeightM) || 0.95, 0.5, 1.4)),
        thicknessM: 0.3,
        orientation,
        angleRad: rad,
        roomName,
      };
    });

  // Deduplicate any parallel strokes & strip stair-step noise, then carve door/window openings!
  const cleanedAiWalls = cleanArchitecturalWalls(initialWalls);
  const walls = splitWallsAroundOpenings(cleanedAiWalls, doors, windows);

  // 4. Pillars
  const pillars: BimPillarObject[] = (Array.isArray(raw.pillars) ? raw.pillars : [])
    .filter((p) => Number.isFinite(p.cx) && Number.isFinite(p.cy))
    .map((p, idx) => {
      const code = `PL${String(idx + 1).padStart(2, '0')}`;
      return {
        id: `ai_pil_${idx + 1}`,
        kind: 'pillar',
        code,
        name: `Pilastro ${code}`,
        material: 'C.A. gettato in opera',
        cxM: round2(toXM(p.cx)),
        cyM: round2(toYM(p.cy)),
        widthM: round2(clamp(Number(p.widthM) || 0.35, 0.2, 0.9)),
        depthM: round2(clamp(Number(p.depthM) || 0.35, 0.2, 0.9)),
        heightM: defaultHeightM,
      };
    });

  // 5. Rooms with exact floor polygons & oak/ceramic material assignment
  const rooms: BimRoomObject[] = (Array.isArray(raw.rooms) ? raw.rooms : [])
    .filter((r) => Array.isArray(r.polygon) && r.polygon.length >= 3)
    .map((r, idx) => {
      const polyM = (r.polygon || []).map((pt) => ({
        x: round2(toXM(pt.x)),
        y: round2(toYM(pt.y)),
      }));
      let minRX = Infinity;
      let maxRX = -Infinity;
      let minRY = Infinity;
      let maxRY = -Infinity;
      for (const pt of polyM) {
        if (pt.x < minRX) minRX = pt.x;
        if (pt.x > maxRX) maxRX = pt.x;
        if (pt.y < minRY) minRY = pt.y;
        if (pt.y > maxRY) maxRY = pt.y;
      }
      const floorType: 'oak' | 'ceramic' =
        r.floorType === 'oak' || r.floorType === 'ceramic' ? r.floorType : inferRoomFloorType(r.name);
      const calcArea = polygonAreaM2(polyM);
      const areaM2 = round2(calcArea >= 0.4 ? calcArea : Number(r.areaM2) || 4);
      const perimM = round2(polygonPerimeterM(polyM));
      const code = `V${String(idx + 1).padStart(2, '0')}`;
      return {
        id: `ai_room_${idx + 1}`,
        kind: 'room',
        code,
        name: r.name?.trim() || `Vano ${code}`,
        finish: floorType === 'oak' ? 'Parquet Rovere Naturale' : 'Gres Porcellanato Beige',
        floorType,
        polygonM: polyM,
        cxM: round2((minRX + maxRX) * 0.5),
        cyM: round2((minRY + maxRY) * 0.5),
        widthM: round2(Math.max(0.8, maxRX - minRX)),
        depthM: round2(Math.max(0.8, maxRY - minRY)),
        areaM2,
        perimeterM: perimM,
        heightM: defaultHeightM,
      };
    });

  // 6. Balcony railings / parapets
  const railings: BimRailingObject[] = (Array.isArray(raw.railings) ? raw.railings : [])
    .map((rl, idx) => ({
      id: `ai_rail_${idx + 1}`,
      x1M: round2(toXM(rl.x1)),
      y1M: round2(toYM(rl.y1)),
      x2M: round2(toXM(rl.x2)),
      y2M: round2(toYM(rl.y2)),
      heightM: round2(clamp(Number(rl.heightM) || 1.05, 0.85, 1.3)),
    }))
    .filter((rl) => Math.hypot(rl.x2M - rl.x1M, rl.y2M - rl.y1M) >= 0.4);

  // Tight bounds from reconstructed building
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.x1M, w.x2M);
    maxX = Math.max(maxX, w.x1M, w.x2M);
    minY = Math.min(minY, w.y1M, w.y2M);
    maxY = Math.max(maxY, w.y1M, w.y2M);
  }
  for (const r of rooms) {
    for (const pt of r.polygonM || []) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
  }

  return {
    walls,
    doors,
    windows,
    pillars,
    rooms,
    railings,
    source: 'ai-vision',
    planWidthM,
    planHeightM,
    boundsM: {
      minX: Number.isFinite(minX) ? minX : 0,
      maxX: Number.isFinite(maxX) ? maxX : planWidthM,
      minY: Number.isFinite(minY) ? minY : 0,
      maxY: Number.isFinite(maxY) ? maxY : planHeightM,
    },
  };
}
