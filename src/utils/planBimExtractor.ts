import { DetectedRoomBlock, PlanToken } from './pdfPlanExtractor';
import { LaserSensitivity, PlanLumaGrid } from './planLaserRaycaster';
import { ExtractedWall3D, Plan3DModelData } from './planWallExtractor3D';

export type BimObjectKind = 'wall' | 'door' | 'window' | 'pillar' | 'room';

export interface BimWallObject {
  id: string;
  kind: 'wall';
  code: string;
  name: string;
  category: 'Muro Perimetrale' | 'Tramezzo Interno';
  material: string;
  x1M: number;
  y1M: number;
  x2M: number;
  y2M: number;
  cxM: number;
  cyM: number;
  lengthM: number;
  thicknessM: number;
  heightM: number;
  orientation: 'H' | 'V';
  roomName?: string;
}

export interface BimDoorObject {
  id: string;
  kind: 'door';
  code: string;
  name: string;
  doorType: 'Porta Interna' | 'Portoncino Blindato' | 'Porta Scorrevole';
  cxM: number;
  cyM: number;
  widthM: number;
  heightM: number;
  thicknessM: number;
  orientation: 'H' | 'V';
  roomName?: string;
}

export interface BimWindowObject {
  id: string;
  kind: 'window';
  code: string;
  name: string;
  windowType: 'Finestra PVC/Alluminio' | 'Portafinestra' | 'Vetrata';
  cxM: number;
  cyM: number;
  widthM: number;
  heightM: number;
  sillHeightM: number;
  thicknessM: number;
  orientation: 'H' | 'V';
  roomName?: string;
}

export interface BimPillarObject {
  id: string;
  kind: 'pillar';
  code: string;
  name: string;
  material: 'C.A. gettato in opera' | 'Acciaio' | 'Muratura';
  cxM: number;
  cyM: number;
  widthM: number;
  depthM: number;
  heightM: number;
}

export interface BimRoomObject {
  id: string;
  kind: 'room';
  code: string;
  name: string;
  finish: string;
  cxM: number;
  cyM: number;
  widthM: number;
  depthM: number;
  areaM2: number;
  perimeterM: number;
  heightM: number;
}

export type BimObject =
  | BimWallObject
  | BimDoorObject
  | BimWindowObject
  | BimPillarObject
  | BimRoomObject;

export interface PlanBimModel {
  walls: BimWallObject[];
  doors: BimDoorObject[];
  windows: BimWindowObject[];
  pillars: BimPillarObject[];
  rooms: BimRoomObject[];
  planWidthM: number;
  planHeightM: number;
  boundsM: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

interface RawWallStrip {
  start: number;
  end: number;
  crossMin: number;
  crossMax: number;
  isHollowMerged: boolean;
}

function getLumaThreshold(sensitivity: LaserSensitivity): number {
  if (sensitivity === 'thin') return 196;
  if (sensitivity === 'thick') return 112;
  return 152;
}

/**
 * Extracts clean architectural walls AND editable BIM objects (Walls, Doors, Windows,
 * Structural Pillars, Rooms) directly from the cleaned floor-plan grid.
 *
 * Designed to reject stray single thin dimension lines so ONLY genuine structural
 * and partition walls extrude into 3D & BIM!
 */
export function extractPlanBimModel(
  cleanGrid: PlanLumaGrid | null,
  metersPerPt: number,
  tokens: PlanToken[],
  detectedRooms: DetectedRoomBlock[],
  defaultHeightM: number,
  sensitivity: LaserSensitivity = 'medium'
): PlanBimModel {
  if (!cleanGrid || !Number.isFinite(metersPerPt) || metersPerPt <= 0) {
    return {
      walls: [],
      doors: [],
      windows: [],
      pillars: [],
      rooms: [],
      planWidthM: 10,
      planHeightM: 10,
      boundsM: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
    };
  }

  const planWidthM = cleanGrid.pageWidthPt * metersPerPt;
  const planHeightM = cleanGrid.pageHeightPt * metersPerPt;

  const maxDim = 340;
  const scaleDown = Math.min(1, maxDim / Math.max(cleanGrid.width, cleanGrid.height));
  const gw = Math.max(56, Math.round(cleanGrid.width * scaleDown));
  const gh = Math.max(56, Math.round(cleanGrid.height * scaleDown));
  const cellW_M = planWidthM / gw;
  const cellH_M = planHeightM / gh;
  const cellSizeM = (cellW_M + cellH_M) * 0.5;

  // Mask any residual token bboxes for double safety
  const textMask = new Uint8Array(gw * gh);
  const ptToGx = gw / cleanGrid.pageWidthPt;
  const ptToGy = gh / cleanGrid.pageHeightPt;
  for (const t of tokens) {
    const bw = (t.bbox.x2 - t.bbox.x1) * ptToGx;
    const bh = (t.bbox.y2 - t.bbox.y1) * ptToGy;
    if (bw > gw * 0.25 || bh > gh * 0.25) continue;
    const x1 = Math.max(0, Math.floor(t.bbox.x1 * ptToGx) - 1);
    const y1 = Math.max(0, Math.floor(t.bbox.y1 * ptToGy) - 1);
    const x2 = Math.min(gw - 1, Math.ceil(t.bbox.x2 * ptToGx) + 1);
    const y2 = Math.min(gh - 1, Math.ceil(t.bbox.y2 * ptToGy) + 1);
    for (let y = y1; y <= y2; y++) {
      const off = y * gw;
      for (let x = x1; x <= x2; x++) {
        textMask[off + x] = 1;
      }
    }
  }

  const threshold = getLumaThreshold(sensitivity);
  const rawMask = new Uint8Array(gw * gh);
  const srcStepX = cleanGrid.width / gw;
  const srcStepY = cleanGrid.height / gh;
  // Require stronger dark pixel density in 'medium'/'thick' so faint dimension lines are ignored
  const minDarkRatio = sensitivity === 'thin' ? 0.08 : sensitivity === 'thick' ? 0.38 : 0.2;

  for (let gy = 0; gy < gh; gy++) {
    const sy0 = Math.floor(gy * srcStepY);
    const sy1 = Math.min(cleanGrid.height - 1, Math.max(sy0, Math.floor((gy + 1) * srcStepY) - 1));
    const rowOff = gy * gw;
    for (let gx = 0; gx < gw; gx++) {
      if (textMask[rowOff + gx]) continue;
      const sx0 = Math.floor(gx * srcStepX);
      const sx1 = Math.min(cleanGrid.width - 1, Math.max(sx0, Math.floor((gx + 1) * srcStepX) - 1));

      let darkHits = 0;
      let totalSampled = 0;
      for (let sy = sy0; sy <= sy1; sy++) {
        const lRow = sy * cleanGrid.width;
        for (let sx = sx0; sx <= sx1; sx++) {
          totalSampled++;
          if (cleanGrid.luma[lRow + sx] < threshold) darkHits++;
        }
      }
      if (totalSampled > 0 && darkHits / totalSampled >= minDarkRatio) {
        rawMask[rowOff + gx] = 1;
      }
    }
  }

  // Strip isolated noise pixels and sheet margins
  const marginX = Math.max(2, Math.floor(gw * 0.02));
  const marginY = Math.max(2, Math.floor(gh * 0.02));
  const wallMask = new Uint8Array(gw * gh);
  for (let y = marginY; y < gh - marginY; y++) {
    const row = y * gw;
    for (let x = marginX; x < gw - marginX; x++) {
      if (!rawMask[row + x]) continue;
      const horiz = (rawMask[row + x - 1] || 0) + (rawMask[row + x + 1] || 0);
      const vert = (rawMask[(y - 1) * gw + x] || 0) + (rawMask[(y + 1) * gw + x] || 0);
      if (horiz >= 1 || vert >= 1) wallMask[row + x] = 1;
    }
  }

  const minRunCells = Math.max(6, Math.round(0.45 / Math.max(0.02, cellSizeM)));
  const maxThickCells = Math.max(5, Math.min(18, Math.round(0.72 / Math.max(0.02, cellSizeM))));

  // --- Extract Horizontal & Vertical Wall Strips ---
  const extractAxisStrips = (isHoriz: boolean): RawWallStrip[] => {
    const outerMax = isHoriz ? gh - marginY : gw - marginX;
    const outerMin = isHoriz ? marginY : marginX;
    const innerMax = isHoriz ? gw - marginX : gh - marginY;
    const innerMin = isHoriz ? marginX : marginY;
    const strips: RawWallStrip[] = [];

    for (let cross = outerMin; cross < outerMax; cross++) {
      let along = innerMin;
      while (along < innerMax) {
        const val = isHoriz ? wallMask[cross * gw + along] : wallMask[along * gw + cross];
        if (!val) {
          along++;
          continue;
        }
        const start = along;
        let gap = 0;
        let lastSolid = along;
        while (along < innerMax) {
          const cur = isHoriz ? wallMask[cross * gw + along] : wallMask[along * gw + cross];
          if (cur) {
            lastSolid = along;
            gap = 0;
          } else {
            gap++;
            if (gap > 1) break;
          }
          along++;
        }
        const runLen = lastSolid - start + 1;
        if (runLen >= minRunCells) {
          let merged = false;
          for (let i = strips.length - 1; i >= 0; i--) {
            const st = strips[i];
            if (st.crossMax < cross - 1) break;
            if (st.crossMax - st.crossMin + 1 >= maxThickCells) continue;
            const overlap = Math.min(st.end, lastSolid) - Math.max(st.start, start) + 1;
            const minW = Math.min(st.end - st.start + 1, runLen);
            if (overlap >= minW * 0.65 && Math.abs(st.start - start) <= 4 && Math.abs(st.end - lastSolid) <= 4) {
              st.start = Math.min(st.start, start);
              st.end = Math.max(st.end, lastSolid);
              st.crossMax = cross;
              merged = true;
              break;
            }
          }
          if (!merged) {
            strips.push({ start, end: lastSolid, crossMin: cross, crossMax: cross, isHollowMerged: false });
          }
        }
      }
    }

    // Filter full-page border frames & boxy non-wall blocks
    const axisDim = isHoriz ? gw : gh;
    const kept: RawWallStrip[] = [];
    for (const s of strips) {
      const len = s.end - s.start + 1;
      const thick = s.crossMax - s.crossMin + 1;
      if (len > axisDim * 0.85 && thick <= 3) continue;
      if (thick > 5 && len / thick < 2.0) continue;
      kept.push(s);
    }

    // Collapse paired double lines of hollow masonry walls (0.09–0.44m apart)
    const crossCellM = isHoriz ? cellH_M : cellW_M;
    const maxHollowCells = Math.max(2, Math.round(0.44 / Math.max(0.02, crossCellM)));
    kept.sort((a, b) => a.crossMin - b.crossMin || a.start - b.start);
    const used = new Array<boolean>(kept.length).fill(false);
    const collapsed: RawWallStrip[] = [];

    for (let i = 0; i < kept.length; i++) {
      if (used[i]) continue;
      const a: RawWallStrip = { ...kept[i] };
      used[i] = true;
      for (let j = i + 1; j < kept.length; j++) {
        if (used[j]) continue;
        const b = kept[j];
        const gap = b.crossMin - a.crossMax;
        if (gap > maxHollowCells) break;
        if (gap < 0) continue;
        const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
        const minLen = Math.min(a.end - a.start, b.end - b.start);
        if (minLen > 0 && overlap >= minLen * 0.68) {
          a.start = Math.min(a.start, b.start);
          a.end = Math.max(a.end, b.end);
          a.crossMax = Math.max(a.crossMax, b.crossMax);
          a.isHollowMerged = true;
          used[j] = true;
          break;
        }
      }
      collapsed.push(a);
    }

    // Strict architectural wall check (crucial to reject leftover stray 1px dimension lines!):
    // In 'medium' and 'thick' modes, if a strip is ONLY 1 cell thick AND wasn't part of a double-line wall,
    // reject it when cellSizeM < 0.085m (too thin to be a real partition/structural wall!).
    const verified = collapsed.filter((s) => {
      const thickCells = s.crossMax - s.crossMin + 1;
      if (s.isHollowMerged) return true;
      if (sensitivity === 'thin') return true;
      if (thickCells >= 2) return true;
      // Single cell thick: keep only if cellSizeM is coarse enough that 1 cell >= 8.5cm
      return crossCellM >= 0.085;
    });

    // Merge collinear segments separated by tiny 1-2 cell anti-alias gaps (NOT real door openings!)
    verified.sort((a, b) => a.crossMin - b.crossMin || a.start - b.start);
    const finalMerged: RawWallStrip[] = [];
    for (const s of verified) {
      const sMid = (s.crossMin + s.crossMax) * 0.5;
      let joined = false;
      for (let i = finalMerged.length - 1; i >= 0; i--) {
        const m = finalMerged[i];
        const mMid = (m.crossMin + m.crossMax) * 0.5;
        if (Math.abs(mMid - sMid) <= 2.0 && s.start <= m.end + 2 && s.end >= m.start - 2) {
          m.start = Math.min(m.start, s.start);
          m.end = Math.max(m.end, s.end);
          m.crossMin = Math.min(m.crossMin, s.crossMin);
          m.crossMax = Math.max(m.crossMax, s.crossMax);
          m.isHollowMerged = m.isHollowMerged || s.isHollowMerged;
          joined = true;
          break;
        }
      }
      if (!joined) finalMerged.push({ ...s });
    }
    return finalMerged;
  };

  const finalH = extractAxisStrips(true);
  const finalV = extractAxisStrips(false);

  // Room markers in meters
  const roomMarkers = tokens
    .filter((t) => t.kind === 'room')
    .map((t) => ({ name: t.str.trim(), xM: t.cx * metersPerPt, yM: t.cy * metersPerPt }));

  const findNearestRoom = (cxM: number, cyM: number): string | undefined => {
    let best: string | undefined;
    let bestD = 3.8;
    for (const r of roomMarkers) {
      const d = Math.hypot(r.xM - cxM, r.yM - cyM);
      if (d < bestD) {
        bestD = d;
        best = r.name;
      }
    }
    return best;
  };

  const clampThick = (m: number) => Math.max(0.1, Math.min(0.48, Math.round(m * 100) / 100));

  // Build initial wall objects
  const rawWalls: BimWallObject[] = [];
  for (const s of finalH) {
    const x1M = s.start * cellW_M;
    const x2M = (s.end + 1) * cellW_M;
    const cyM = ((s.crossMin + s.crossMax + 1) * 0.5) * cellH_M;
    const lengthM = Math.round((x2M - x1M) * 100) / 100;
    if (lengthM < 0.42) continue;
    const thicknessM = clampThick((s.crossMax - s.crossMin + 1) * cellH_M);
    const cxM = (x1M + x2M) * 0.5;
    rawWalls.push({
      id: `bim_w_h_${rawWalls.length + 1}`,
      kind: 'wall',
      code: '',
      name: '',
      category: 'Tramezzo Interno',
      material: 'Laterizio forato',
      x1M,
      y1M: cyM,
      x2M,
      y2M: cyM,
      cxM,
      cyM,
      lengthM,
      thicknessM,
      heightM: defaultHeightM,
      orientation: 'H',
      roomName: findNearestRoom(cxM, cyM),
    });
  }

  for (const s of finalV) {
    const y1M = s.start * cellH_M;
    const y2M = (s.end + 1) * cellH_M;
    const cxM = ((s.crossMin + s.crossMax + 1) * 0.5) * cellW_M;
    const lengthM = Math.round((y2M - y1M) * 100) / 100;
    if (lengthM < 0.42) continue;
    const thicknessM = clampThick((s.crossMax - s.crossMin + 1) * cellW_M);
    const cyM = (y1M + y2M) * 0.5;
    rawWalls.push({
      id: `bim_w_v_${rawWalls.length + 1}`,
      kind: 'wall',
      code: '',
      name: '',
      category: 'Tramezzo Interno',
      material: 'Laterizio forato',
      x1M: cxM,
      y1M,
      x2M: cxM,
      y2M,
      cxM,
      cyM,
      lengthM,
      thicknessM,
      heightM: defaultHeightM,
      orientation: 'V',
      roomName: findNearestRoom(cxM, cyM),
    });
  }

  rawWalls.sort((a, b) => b.lengthM - a.lengthM);
  const walls = rawWalls.slice(0, 220);

  // Compute building envelope bounds
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
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = planWidthM;
    minY = 0;
    maxY = planHeightM;
  }

  const perimMargin = 0.65;
  const isOnPerimeter = (w: BimWallObject): boolean => {
    if (w.thicknessM >= 0.25) return true;
    if (w.orientation === 'H') {
      return Math.abs(w.cyM - minY) <= perimMargin || Math.abs(w.cyM - maxY) <= perimMargin;
    }
    return Math.abs(w.cxM - minX) <= perimMargin || Math.abs(w.cxM - maxX) <= perimMargin;
  };

  walls.forEach((w, idx) => {
    const ext = isOnPerimeter(w);
    w.category = ext ? 'Muro Perimetrale' : 'Tramezzo Interno';
    w.material = ext ? 'Muratura portante / tamponamento' : 'Laterizio forato 10-12 cm';
    w.code = `M${String(idx + 1).padStart(2, '0')}`;
    w.name = w.roomName
      ? `${ext ? 'Muro Est.' : 'Parete'} ${w.roomName} (${w.code})`
      : `${ext ? 'Muro Perimetrale' : 'Tramezzo'} ${w.code}`;
  });

  // --- AUTOMATIC BIM OPENING DETECTION: DOORS & WINDOWS ---
  // Scan pairs of collinear wall segments separated by architectural openings:
  // - Interior wall gap 0.65m..1.35m -> Porta Interna
  // - Exterior wall gap 0.60m..2.50m -> Finestra (or Portoncino if ~0.85..1.15m with door proportions)
  const doors: BimDoorObject[] = [];
  const windows: BimWindowObject[] = [];

  const detectOpeningsOnAxis = (axis: 'H' | 'V') => {
    const axisWalls = walls
      .filter((w) => w.orientation === axis)
      .sort((a, b) =>
        axis === 'H' ? a.cyM - b.cyM || a.x1M - b.x1M : a.cxM - b.cxM || a.y1M - b.y1M
      );

    for (let i = 0; i < axisWalls.length; i++) {
      const a = axisWalls[i];
      const aCross = axis === 'H' ? a.cyM : a.cxM;
      const aEnd = axis === 'H' ? a.x2M : a.y2M;

      let bestB: BimWallObject | null = null;
      let bestGap = Infinity;

      for (let j = i + 1; j < axisWalls.length; j++) {
        const b = axisWalls[j];
        const bCross = axis === 'H' ? b.cyM : b.cxM;
        if (Math.abs(bCross - aCross) > 0.28) continue;
        const bStart = axis === 'H' ? b.x1M : b.y1M;
        const gap = bStart - aEnd;
        if (gap >= 0.62 && gap <= 2.45 && gap < bestGap) {
          bestGap = gap;
          bestB = b;
        }
      }

      if (!bestB || !Number.isFinite(bestGap)) continue;

      const midCross = (aCross + (axis === 'H' ? bestB.cyM : bestB.cxM)) * 0.5;
      const midAlong = aEnd + bestGap * 0.5;
      const cxM = axis === 'H' ? midAlong : midCross;
      const cyM = axis === 'H' ? midCross : midAlong;
      const thickM = Math.max(a.thicknessM, bestB.thicknessM);
      const widthM = Math.round(bestGap * 100) / 100;
      const roomName = findNearestRoom(cxM, cyM);

      // Avoid duplicates at same location
      const duplicate =
        doors.some((d) => Math.hypot(d.cxM - cxM, d.cyM - cyM) < 0.55) ||
        windows.some((wn) => Math.hypot(wn.cxM - cxM, wn.cyM - cyM) < 0.55);
      if (duplicate) continue;

      const isExterior = a.category === 'Muro Perimetrale' && bestB.category === 'Muro Perimetrale';

      if (isExterior) {
        if (windows.length < 48) {
          const code = `F${String(windows.length + 1).padStart(2, '0')}`;
          const isFrench = widthM >= 1.45;
          windows.push({
            id: `bim_win_${windows.length + 1}`,
            kind: 'window',
            code,
            name: roomName ? `Finestra ${roomName} (${code})` : `Finestra ${code}`,
            windowType: isFrench ? 'Portafinestra' : 'Finestra PVC/Alluminio',
            cxM,
            cyM,
            widthM,
            heightM: isFrench ? Math.min(2.2, defaultHeightM - 0.3) : 1.4,
            sillHeightM: isFrench ? 0.05 : 1.0,
            thicknessM: thickM,
            orientation: axis,
            roomName,
          });
        }
      } else if (widthM <= 1.38 && doors.length < 48) {
        const code = `P${String(doors.length + 1).padStart(2, '0')}`;
        doors.push({
          id: `bim_door_${doors.length + 1}`,
          kind: 'door',
          code,
          name: roomName ? `Porta ${roomName} (${code})` : `Porta Interna ${code}`,
          doorType: 'Porta Interna',
          cxM,
          cyM,
          widthM,
          heightM: Math.min(2.1, Math.max(1.8, defaultHeightM - 0.25)),
          thicknessM: thickM,
          orientation: axis,
          roomName,
        });
      }
    }
  };

  detectOpeningsOnAxis('H');
  detectOpeningsOnAxis('V');

  // --- AUTOMATIC BIM PILLARS DETECTION (compact solid dark structural blocks 0.22m..0.68m) ---
  const pillars: BimPillarObject[] = [];
  const minPillarCells = Math.max(2, Math.round(0.22 / Math.max(0.02, cellSizeM)));
  const maxPillarCells = Math.max(minPillarCells + 1, Math.round(0.68 / Math.max(0.02, cellSizeM)));
  const visitedPillar = new Uint8Array(gw * gh);

  for (let y = marginY; y < gh - marginY && pillars.length < 36; y += 2) {
    for (let x = marginX; x < gw - marginX && pillars.length < 36; x += 2) {
      if (!wallMask[y * gw + x] || visitedPillar[y * gw + x]) continue;
      // Check if local dark block is compact & dense (not a long wall)
      let x1 = x;
      let x2 = x;
      let y1 = y;
      let y2 = y;
      while (x1 > marginX && x - x1 < maxPillarCells && wallMask[y * gw + (x1 - 1)]) x1--;
      while (x2 < gw - marginX - 1 && x2 - x < maxPillarCells && wallMask[y * gw + (x2 + 1)]) x2++;
      while (y1 > marginY && y - y1 < maxPillarCells && wallMask[(y1 - 1) * gw + x]) y1--;
      while (y2 < gh - marginY - 1 && y2 - y < maxPillarCells && wallMask[(y2 + 1) * gw + x]) y2++;

      const bw = x2 - x1 + 1;
      const bh = y2 - y1 + 1;
      if (bw < minPillarCells || bh < minPillarCells || bw > maxPillarCells || bh > maxPillarCells) {
        continue;
      }
      const aspect = bw / bh;
      if (aspect < 0.55 || aspect > 1.85) continue;

      // Verify solid fill density >= 78% AND clear white boundary on at least 2 opposite sides
      let filled = 0;
      for (let py = y1; py <= y2; py++) {
        for (let px = x1; px <= x2; px++) {
          if (wallMask[py * gw + px]) filled++;
        }
      }
      const density = filled / (bw * bh);
      if (density < 0.78) continue;

      // Ensure it is an isolated/standing pillar (not just an arbitrary pixel inside a continuous wall)
      const leftClear = !wallMask[Math.round((y1 + y2) / 2) * gw + Math.max(0, x1 - 2)];
      const rightClear = !wallMask[Math.round((y1 + y2) / 2) * gw + Math.min(gw - 1, x2 + 2)];
      const topClear = !wallMask[Math.max(0, y1 - 2) * gw + Math.round((x1 + x2) / 2)];
      const botClear = !wallMask[Math.min(gh - 1, y2 + 2) * gw + Math.round((x1 + x2) / 2)];
      const clearSides = (leftClear ? 1 : 0) + (rightClear ? 1 : 0) + (topClear ? 1 : 0) + (botClear ? 1 : 0);
      if (clearSides < 3) continue;

      for (let py = Math.max(0, y1 - 2); py <= Math.min(gh - 1, y2 + 2); py++) {
        for (let px = Math.max(0, x1 - 2); px <= Math.min(gw - 1, x2 + 2); px++) {
          visitedPillar[py * gw + px] = 1;
        }
      }

      const wM = Math.max(0.25, Math.round(bw * cellW_M * 100) / 100);
      const dM = Math.max(0.25, Math.round(bh * cellH_M * 100) / 100);
      const cxM = ((x1 + x2 + 1) * 0.5) * cellW_M;
      const cyM = ((y1 + y2 + 1) * 0.5) * cellH_M;
      const code = `PL${String(pillars.length + 1).padStart(2, '0')}`;
      pillars.push({
        id: `bim_pil_${pillars.length + 1}`,
        kind: 'pillar',
        code,
        name: `Pilastro ${code}`,
        material: 'C.A. gettato in opera',
        cxM,
        cyM,
        widthM: wM,
        depthM: dM,
        heightM: defaultHeightM,
      });
    }
  }

  // --- AUTOMATIC BIM ROOMS / FLOOR SLABS ---
  const rooms: BimRoomObject[] = [];
  for (let i = 0; i < detectedRooms.length; i++) {
    const rm = detectedRooms[i];
    const cxM = ((rm.bbox.x1 + rm.bbox.x2) * 0.5) * metersPerPt;
    const cyM = ((rm.bbox.y1 + rm.bbox.y2) * 0.5) * metersPerPt;
    const widthM = rm.lengthM && rm.lengthM > 0.6 ? rm.lengthM : rm.areaMq ? Math.sqrt(rm.areaMq) : 2.8;
    const depthM = rm.widthM && rm.widthM > 0.6 ? rm.widthM : rm.areaMq ? rm.areaMq / Math.max(1, widthM) : 2.6;
    const areaM2 = Math.round((rm.areaMq ?? widthM * depthM) * 100) / 100;
    const perimeterM = Math.round((rm.perimeterM ?? 2 * (widthM + depthM)) * 100) / 100;
    const code = `V${String(i + 1).padStart(2, '0')}`;
    rooms.push({
      id: `bim_room_${i + 1}`,
      kind: 'room',
      code,
      name: rm.name || `Vano ${code}`,
      finish: 'Gres porcellanato',
      cxM,
      cyM,
      widthM: Math.round(Math.min(12, Math.max(1.2, widthM)) * 100) / 100,
      depthM: Math.round(Math.min(12, Math.max(1.2, depthM)) * 100) / 100,
      areaM2,
      perimeterM,
      heightM: rm.heightM && rm.heightM > 0 ? rm.heightM : defaultHeightM,
    });
  }

  return {
    walls,
    doors,
    windows,
    pillars,
    rooms,
    planWidthM,
    planHeightM,
    boundsM: { minX, maxX, minY, maxY },
  };
}

/** Converts a PlanBimModel's walls back to the lightweight Plan3DModelData shape */
export function bimModelToPlan3DData(bim: PlanBimModel): Plan3DModelData {
  const walls: ExtractedWall3D[] = bim.walls.map((w) => ({
    id: w.id,
    label: w.name,
    x1M: w.x1M,
    y1M: w.y1M,
    x2M: w.x2M,
    y2M: w.y2M,
    cxM: w.cxM,
    cyM: w.cyM,
    lengthM: w.lengthM,
    thicknessM: w.thicknessM,
    orientation: w.orientation,
    roomName: w.roomName,
  }));
  const totalLengthM = Math.round(walls.reduce((s, w) => s + w.lengthM, 0) * 100) / 100;
  return {
    walls,
    planWidthM: bim.planWidthM,
    planHeightM: bim.planHeightM,
    totalLengthM,
    wallCount: walls.length,
    boundsM: bim.boundsM,
  };
}
