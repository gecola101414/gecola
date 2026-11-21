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

interface RawLineRun {
  /** Start along main axis (in grid cells) */
  start: number;
  /** End along main axis (in grid cells) */
  end: number;
  /** Min cross-axis cell */
  crossMin: number;
  /** Max cross-axis cell */
  crossMax: number;
  /** Center along cross-axis */
  crossCenter: number;
  /** Thickness in cells */
  thickCells: number;
  /** Average ink fill density inside bounding box */
  fillDensity: number;
}

interface CandidateWall {
  orientation: 'H' | 'V';
  x1M: number;
  y1M: number;
  x2M: number;
  y2M: number;
  thicknessM: number;
  isDoubleLine: boolean;
  confidence: number;
}

function getLumaThreshold(sensitivity: LaserSensitivity): number {
  if (sensitivity === 'thin') return 208;
  if (sensitivity === 'thick') return 130;
  return 172;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function pointToSegmentDist(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function segmentToSegmentDist(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number
): number {
  // Fast axis-aligned exact distance (all architectural segments here are H or V)
  const aMinX = Math.min(ax1, ax2);
  const aMaxX = Math.max(ax1, ax2);
  const aMinY = Math.min(ay1, ay2);
  const aMaxY = Math.max(ay1, ay2);
  const bMinX = Math.min(bx1, bx2);
  const bMaxX = Math.max(bx1, bx2);
  const bMinY = Math.min(by1, by2);
  const bMaxY = Math.max(by1, by2);

  const dx = Math.max(0, Math.max(aMinX - bMaxX, bMinX - aMaxX));
  const dy = Math.max(0, Math.max(aMinY - bMaxY, bMinY - aMaxY));
  return Math.hypot(dx, dy);
}

/**
 * High-Precision Architectural BIM Extractor directly from the original PDF PlanLumaGrid.
 *
 * 6-Stage Architectural Vision Pipeline:
 * 1. High-resolution analysis grid (maxDim = 760, ~1.5–2.5 cm/cell) with non-destructive
 *    text/quote masking + directional dimension-line corridor detection.
 * 2. Dual Wall Extractor:
 *    - Track A: Solid poché / hatched architectural walls (thickness 7.5 cm – 58 cm).
 *    - Track B: Parallel double-line CAD walls (two faces 7.5 cm – 46 cm apart),
 *      strictly rejecting single thin dimension lines, parallel quote chains, and furniture.
 * 3. Architectural Building Footprint Filter:
 *    - Connected component clustering weighted by wall mass & detected room labels,
 *      discarding isolated title blocks (cartigli), sheet frames, legends, and scale bars.
 * 4. Corner Snapping & Micro-Gap Healing:
 *    - Heals tiny text-mask / scan gaps (<= 36 cm) and snaps perpendicular L/T corners
 *      into crisp Revit-like architectural joins.
 * 5. 2D Exterior Flood-Fill Classification:
 *    - Seals virtual openings and flood-fills outside air vs interior rooms to classify
 *      true `Muro Perimetrale` vs `Tramezzo Interno` (even on L/U/T-shaped buildings!).
 * 6. Architectural Opening & Structural Object Recognition:
 *    - Detects collinear doors/windows, corner/T-junction interior doors, and embedded
 *      window bays inside poché walls, plus structural pillars and rooms.
 */
export function extractPlanBimModel(
  grid: PlanLumaGrid,
  metersPerPt: number,
  tokens: PlanToken[],
  detectedRooms: DetectedRoomBlock[],
  defaultHeightM: number,
  sensitivity: LaserSensitivity = 'medium'
): PlanBimModel {
  const planWidthM = Math.max(0.5, grid.pageWidthPt * metersPerPt);
  const planHeightM = Math.max(0.5, grid.pageHeightPt * metersPerPt);

  const emptyModel: PlanBimModel = {
    walls: [],
    doors: [],
    windows: [],
    pillars: [],
    rooms: [],
    planWidthM,
    planHeightM,
    boundsM: { minX: 0, maxX: planWidthM, minY: 0, maxY: planHeightM },
  };

  if (grid.width <= 8 || grid.height <= 8 || metersPerPt <= 0) {
    return emptyModel;
  }

  // =========================================================================
  // STAGE 1: HIGH-RES WORKING GRID + NON-DESTRUCTIVE TEXT & QUOTE CORRIDORS
  // =========================================================================
  const maxDim = 760;
  const aspect = grid.width / grid.height;
  const gw = aspect >= 1 ? Math.min(maxDim, grid.width) : Math.max(120, Math.round(Math.min(maxDim, grid.height) * aspect));
  const gh = aspect >= 1 ? Math.max(120, Math.round(gw / aspect)) : Math.min(maxDim, grid.height);

  const cellW_M = planWidthM / gw;
  const cellH_M = planHeightM / gh;
  const cellM = (cellW_M + cellH_M) * 0.5;

  const lumaThresh = getLumaThreshold(sensitivity);
  const rawDark = new Uint8Array(gw * gh); // Original ink (for door-swing & glass cues)
  const darkMask = new Uint8Array(gw * gh); // Text-masked ink (for wall tracing)
  const textMask = new Uint8Array(gw * gh);

  const srcW = grid.width;
  const srcH = grid.height;
  const srcData = grid.luma;

  // Min-pool downsampling so crisp 1–2px CAD double-line wall edges are never blurred away
  for (let gy = 0; gy < gh; gy++) {
    const sy0 = Math.floor((gy * srcH) / gh);
    const sy1 = Math.max(sy0 + 1, Math.min(srcH, Math.ceil(((gy + 1) * srcH) / gh)));
    const rowOff = gy * gw;
    for (let gx = 0; gx < gw; gx++) {
      const sx0 = Math.floor((gx * srcW) / gw);
      const sx1 = Math.max(sx0 + 1, Math.min(srcW, Math.ceil(((gx + 1) * srcW) / gw)));
      let minLuma = 255;
      let darkCount = 0;
      let totalCount = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const sRow = sy * srcW;
        for (let sx = sx0; sx < sx1; sx++) {
          const v = srcData[sRow + sx];
          if (v < minLuma) minLuma = v;
          if (v < lumaThresh) darkCount++;
          totalCount++;
        }
      }
      // Accept cell as dark if crisp stroke passed through it
      const isDark = minLuma < lumaThresh - 8 || (totalCount > 0 && darkCount / totalCount >= 0.32);
      if (isDark) {
        rawDark[rowOff + gx] = 1;
        darkMask[rowOff + gx] = 1;
      }
    }
  }

  // Mask ALL text / quote / label bounding boxes so letters & digits NEVER become walls
  const ptToGx = (xPt: number) => clamp(Math.floor((xPt / grid.pageWidthPt) * gw), 0, gw - 1);
  const ptToGy = (yPt: number) => clamp(Math.floor((yPt / grid.pageHeightPt) * gh), 0, gh - 1);
  const mToGx = (xM: number) => clamp(Math.round(xM / cellW_M), 0, gw - 1);
  const mToGy = (yM: number) => clamp(Math.round(yM / cellH_M), 0, gh - 1);

  interface DimCorridor {
    orientation: 'H' | 'V';
    crossMin: number;
    crossMax: number;
    alongMin: number;
    alongMax: number;
    quoteCenterAlong: number;
    quoteValueM: number;
  }
  const dimCorridors: DimCorridor[] = [];

  for (const tok of tokens) {
    const bwPt = tok.bbox.x2 - tok.bbox.x1;
    const bhPt = tok.bbox.y2 - tok.bbox.y1;
    if (bwPt <= 0 || bhPt <= 0) continue;
    if (bwPt > grid.pageWidthPt * 0.35 || bhPt > grid.pageHeightPt * 0.35) continue;

    // Tight text masking (+1.8pt) to avoid chewing nearby real walls while deleting every glyph
    const padPt = tok.kind === 'dimension' ? 2.2 : 1.6;
    const gx1 = ptToGx(tok.bbox.x1 - padPt);
    const gx2 = ptToGx(tok.bbox.x2 + padPt);
    const gy1 = ptToGy(tok.bbox.y1 - padPt);
    const gy2 = ptToGy(tok.bbox.y2 + padPt);

    for (let y = gy1; y <= gy2; y++) {
      const rOff = y * gw;
      for (let x = gx1; x <= gx2; x++) {
        textMask[rOff + x] = 1;
        darkMask[rOff + x] = 0;
      }
    }

    // Build directional dimension-line rejection corridors around every numeric quote!
    if (tok.kind === 'dimension' && typeof tok.numericValue === 'number' && tok.numericValue >= 0.25 && tok.numericValue <= 80) {
      const spanM = Math.min(Math.max(tok.numericValue * 1.15, 1.4), 28);
      if (tok.orientation === 'vertical') {
        const halfBandX = Math.max(4, Math.round((Math.max(bwPt, 12) * 1.35 * metersPerPt) / cellW_M));
        const halfSpanY = Math.round((spanM * 0.52) / cellH_M);
        const cx = ptToGx(tok.cx);
        const cy = ptToGy(tok.cy);
        dimCorridors.push({
          orientation: 'V',
          crossMin: Math.max(0, cx - halfBandX),
          crossMax: Math.min(gw - 1, cx + halfBandX),
          alongMin: Math.max(0, cy - halfSpanY),
          alongMax: Math.min(gh - 1, cy + halfSpanY),
          quoteCenterAlong: cy,
          quoteValueM: tok.numericValue,
        });
      } else {
        const halfBandY = Math.max(4, Math.round((Math.max(bhPt, 12) * 1.35 * metersPerPt) / cellH_M));
        const halfSpanX = Math.round((spanM * 0.52) / cellW_M);
        const cx = ptToGx(tok.cx);
        const cy = ptToGy(tok.cy);
        dimCorridors.push({
          orientation: 'H',
          crossMin: Math.max(0, cy - halfBandY),
          crossMax: Math.min(gh - 1, cy + halfBandY),
          alongMin: Math.max(0, cx - halfSpanX),
          alongMax: Math.min(gw - 1, cx + halfSpanX),
          quoteCenterAlong: cx,
          quoteValueM: tok.numericValue,
        });
      }
    }
  }

  // Sheet border margin (ignore page border frames around outer 2%)
  const marginX = Math.max(4, Math.round(gw * 0.02));
  const marginY = Math.max(4, Math.round(gh * 0.02));

  // Helper: check if a thin stroke lies inside a quote's dimension-line corridor
  const isInsideDimCorridor = (orient: 'H' | 'V', crossCenter: number, start: number, end: number): boolean => {
    const len = Math.max(1, end - start);
    let covered = 0;
    for (const dc of dimCorridors) {
      if (dc.orientation !== orient) continue;
      if (crossCenter < dc.crossMin || crossCenter > dc.crossMax) continue;
      const ov = Math.min(end, dc.alongMax) - Math.max(start, dc.alongMin);
      if (ov > 0) {
        covered += ov;
        // Direct hit: quote center lies right along this thin line
        if (dc.quoteCenterAlong >= start - 6 && dc.quoteCenterAlong <= end + 6) {
          return true;
        }
      }
    }
    return covered / len >= 0.42;
  };

  // =========================================================================
  // STAGE 2: DUAL ARCHITECTURAL LINE & WALL EXTRACTION (H + V)
  // =========================================================================
  // Physical tolerances in real meters (independent of PDF DPI!)
  const minWallLenM = 0.46;
  const maxSolidThickM = 0.62;
  const minSolidThickM = 0.072; // Real solid walls / partitions >= 7.2 cm
  const maxThinStrokeM = 0.068; // Single CAD wall-face line or dimension line
  const minDoubleWallGapM = 0.068; // Hollow tramezzo min 7cm center-to-center
  const maxDoubleWallGapM = 0.48; // Hollow perimeter wall max 48cm

  const minRunCellsH = Math.max(8, Math.round(minWallLenM / cellW_M));
  const minRunCellsV = Math.max(8, Math.round(minWallLenM / cellH_M));
  const maxGapBridgeCells = Math.max(2, Math.min(7, Math.round(0.09 / cellM)));

  /**
   * Extracts clean 1D horizontal or vertical straight strokes (both thin CAD faces and thick poché bands),
   * bridging tiny 1–2px scan/text-mask breaks while preserving real openings.
   */
  const extractAxisRuns = (orient: 'H' | 'V'): RawLineRun[] => {
    const alongMax = orient === 'H' ? gw - marginX : gh - marginY;
    const alongMin = orient === 'H' ? marginX : marginY;
    const crossMaxLim = orient === 'H' ? gh - marginY : gw - marginX;
    const crossMinLim = orient === 'H' ? marginY : marginX;
    const minRunCells = orient === 'H' ? minRunCellsH : minRunCellsV;

    interface SliceSeg {
      c: number;
      s: number;
      e: number;
    }
    const slices: SliceSeg[] = [];

    for (let c = crossMinLim; c < crossMaxLim; c++) {
      let a = alongMin;
      while (a < alongMax) {
        const idx = orient === 'H' ? c * gw + a : a * gw + c;
        if (!darkMask[idx]) {
          a++;
          continue;
        }
        const s = a;
        let lastDark = a;
        let gap = 0;
        let darkHits = 0;
        while (a < alongMax) {
          const i0 = orient === 'H' ? c * gw + a : a * gw + c;
          const isText = textMask[i0] === 1;
          if (darkMask[i0]) {
            lastDark = a;
            gap = 0;
            darkHits++;
          } else {
            // Allow bridging slightly wider only where text was masked on top of a line
            gap++;
            const allowedGap = isText ? maxGapBridgeCells + 4 : maxGapBridgeCells;
            if (gap > allowedGap) break;
          }
          a++;
        }
        const runLen = lastDark - s + 1;
        if (runLen >= minRunCells && darkHits / runLen >= 0.68) {
          slices.push({ c, s, e: lastDark });
        }
      }
    }

    // Group adjacent cross-axis slices with overlapping span into unified bands
    const bands: Array<{ start: number; end: number; crossMin: number; crossMax: number }> = [];
    for (const sl of slices) {
      let merged = false;
      for (let i = bands.length - 1; i >= 0; i--) {
        const b = bands[i];
        if (sl.c - b.crossMax > 1) {
          if (sl.c - b.crossMax > 4) break;
          continue;
        }
        const ov = Math.min(sl.e, b.end) - Math.max(sl.s, b.start);
        const minLen = Math.min(sl.e - sl.s + 1, b.end - b.start + 1);
        const maxLen = Math.max(sl.e - sl.s + 1, b.end - b.start + 1);
        // Merge only if spans substantially match (avoid fusing a long thin line with a short perpendicular wall cap!)
        if (ov >= minLen * 0.72 && minLen >= maxLen * 0.45) {
          b.crossMax = sl.c;
          b.start = Math.min(b.start, sl.s);
          b.end = Math.max(b.end, sl.e);
          merged = true;
          break;
        }
      }
      if (!merged) {
        bands.push({ start: sl.s, end: sl.e, crossMin: sl.c, crossMax: sl.c });
      }
    }

    // Compute fill density for each band
    const runs: RawLineRun[] = [];
    for (const b of bands) {
      const thickCells = b.crossMax - b.crossMin + 1;
      const lenCells = b.end - b.start + 1;
      let darkCnt = 0;
      let sampleCnt = 0;
      const stepA = Math.max(1, Math.floor(lenCells / 60));
      for (let c = b.crossMin; c <= b.crossMax; c++) {
        for (let a = b.start; a <= b.end; a += stepA) {
          const idx = orient === 'H' ? c * gw + a : a * gw + c;
          if (darkMask[idx] || textMask[idx]) darkCnt++;
          sampleCnt++;
        }
      }
      const fillDensity = sampleCnt > 0 ? darkCnt / sampleCnt : 0;
      if (fillDensity < 0.45) continue;

      runs.push({
        start: b.start,
        end: b.end,
        crossMin: b.crossMin,
        crossMax: b.crossMax,
        crossCenter: (b.crossMin + b.crossMax) * 0.5,
        thickCells,
        fillDensity,
      });
    }
    return runs;
  };

  /**
   * Separates solid poché walls from thin CAD lines, pairs parallel double-line walls,
   * and strictly discards single dimension lines & stacked dimension chains.
   */
  const buildCandidateWallsForAxis = (orient: 'H' | 'V', runs: RawLineRun[]): CandidateWall[] => {
    const alongCellM = orient === 'H' ? cellW_M : cellH_M;
    const crossCellM = orient === 'H' ? cellH_M : cellW_M;

    const results: CandidateWall[] = [];
    const thinLines: RawLineRun[] = [];

    for (const r of runs) {
      const thickM = r.thickCells * crossCellM;
      const lenM = (r.end - r.start + 1) * alongCellM;
      if (lenM < minWallLenM) continue;

      // Reject absurdly huge black title-bar banners (> 62 cm thick)
      if (thickM > maxSolidThickM) continue;

      // TRACK A: SOLID POCHÉ WALL (thick >= 7.2 cm with solid/hatched fill)
      if (thickM >= minSolidThickM && r.fillDensity >= 0.56) {
        // Extra check: avoid misclassifying a thick black sheet border spanning > 88% of entire PDF page
        const pageFrac = lenM / (orient === 'H' ? planWidthM : planHeightM);
        if (pageFrac > 0.88) continue;

        const cM = (r.crossCenter + 0.5) * crossCellM;
        const sM = r.start * alongCellM;
        const eM = (r.end + 1) * alongCellM;
        results.push({
          orientation: orient,
          x1M: orient === 'H' ? sM : cM,
          y1M: orient === 'H' ? cM : sM,
          x2M: orient === 'H' ? eM : cM,
          y2M: orient === 'H' ? cM : eM,
          thicknessM: clamp(thickM, 0.08, 0.55),
          isDoubleLine: false,
          confidence: 1.0,
        });
      } else if (thickM <= maxThinStrokeM * 1.2) {
        // Candidate thin stroke (could be one face of a hollow double-line wall OR a dimension line!)
        const pageFrac = lenM / (orient === 'H' ? planWidthM : planHeightM);
        if (pageFrac > 0.88) continue;
        thinLines.push(r);
      }
    }

    // Filter out thin lines that are clearly dimension lines inside quote corridors
    // (NOTE: real double-line walls have two closely spaced lines with NO quote number sitting directly between them)
    const eligibleThin = thinLines.filter((r) => {
      // Check if directly flagged by a dimension-line quote corridor
      if (isInsideDimCorridor(orient, r.crossCenter, r.start, r.end)) {
        // Wait: don't blindly discard if there is an exact double-line partner 8-38cm away AND the quote is NOT centered on it
        let hasCleanWallPartner = false;
        for (const other of thinLines) {
          if (other === r) continue;
          const distM = Math.abs(other.crossCenter - r.crossCenter) * crossCellM;
          if (distM < minDoubleWallGapM || distM > maxDoubleWallGapM) continue;
          const ov = Math.min(r.end, other.end) - Math.max(r.start, other.start);
          const minL = Math.min(r.end - r.start + 1, other.end - other.start + 1);
          if (ov >= minL * 0.55) {
            // Check if a quote token sits strictly BETWEEN these two lines (that's a dimension chain, NOT a wall!)
            const cLo = Math.min(r.crossCenter, other.crossCenter);
            const cHi = Math.max(r.crossCenter, other.crossCenter);
            let quoteInsideGap = false;
            for (const tok of tokens) {
              if (tok.kind !== 'dimension') continue;
              const tc = orient === 'H' ? ptToGy(tok.cy) : ptToGx(tok.cx);
              const ta = orient === 'H' ? ptToGx(tok.cx) : ptToGy(tok.cy);
              if (tc >= cLo - 2 && tc <= cHi + 2 && ta >= Math.max(r.start, other.start) && ta <= Math.min(r.end, other.end)) {
                quoteInsideGap = true;
                break;
              }
            }
            if (!quoteInsideGap) {
              hasCleanWallPartner = true;
              break;
            }
          }
        }
        return hasCleanWallPartner;
      }
      return true;
    });

    // TRACK B: PAIR PARALLEL DOUBLE-LINE HOLLOW WALLS (7 cm – 46 cm separation)
    // Sort by crossCenter so nearest parallel partners pair first!
    eligibleThin.sort((a, b) => a.crossCenter - b.crossCenter);
    const pairedMask = new Uint8Array(eligibleThin.length);

    for (let i = 0; i < eligibleThin.length; i++) {
      if (pairedMask[i]) continue;
      const a = eligibleThin[i];

      let bestJ = -1;
      let bestScore = -1;

      for (let j = i + 1; j < eligibleThin.length; j++) {
        if (pairedMask[j]) continue;
        const b = eligibleThin[j];
        const gapM = (b.crossCenter - a.crossCenter) * crossCellM;
        if (gapM > maxDoubleWallGapM) break;
        if (gapM < minDoubleWallGapM) continue;

        const ovStart = Math.max(a.start, b.start);
        const ovEnd = Math.min(a.end, b.end);
        const ovCells = ovEnd - ovStart + 1;
        if (ovCells < (orient === 'H' ? minRunCellsH : minRunCellsV) * 0.85) continue;

        const minLen = Math.min(a.end - a.start + 1, b.end - b.start + 1);
        const ovRatio = ovCells / Math.max(1, minLen);
        if (ovRatio < 0.45) continue;

        // Reject if a dimension quote sits directly inside the gap between a and b (classic stacked dimension chain!)
        let quoteInBand = false;
        for (const tok of tokens) {
          if (tok.kind !== 'dimension' && tok.kind !== 'room') continue;
          const tc = orient === 'H' ? ptToGy(tok.cy) : ptToGx(tok.cx);
          const ta = orient === 'H' ? ptToGx(tok.cx) : ptToGy(tok.cy);
          if (tc >= a.crossCenter - 1 && tc <= b.crossCenter + 1 && ta >= ovStart && ta <= ovEnd) {
            quoteInBand = true;
            break;
          }
        }
        if (quoteInBand) continue;

        // Check interior between the two faces: real hollow walls have clean cavity or light diagonal hatch (not dense text/furniture)
        // Prefer standard architectural wall thicknesses (8-16cm tramezzi & 24-42cm perimetrali)
        const archBonus =
          (gapM >= 0.08 && gapM <= 0.16) || (gapM >= 0.22 && gapM <= 0.44) ? 1.25 : 0.9;
        const score = ovRatio * ovCells * archBonus / (0.12 + gapM);
        if (score > bestScore) {
          bestScore = score;
          bestJ = j;
        }
      }

      if (bestJ >= 0) {
        const b = eligibleThin[bestJ];
        pairedMask[i] = 1;
        pairedMask[bestJ] = 1;

        const ovStart = Math.max(a.start, b.start);
        const ovEnd = Math.min(a.end, b.end);
        const wallThickM = clamp(
          (b.crossMax - a.crossMin + 1) * crossCellM,
          0.08,
          0.48
        );
        const centerM = ((a.crossMin + b.crossMax + 1) * 0.5) * crossCellM;
        const sM = ovStart * alongCellM;
        const eM = (ovEnd + 1) * alongCellM;

        if (eM - sM >= minWallLenM) {
          results.push({
            orientation: orient,
            x1M: orient === 'H' ? sM : centerM,
            y1M: orient === 'H' ? centerM : sM,
            x2M: orient === 'H' ? eM : centerM,
            y2M: orient === 'H' ? centerM : eM,
            thicknessM: wallThickM,
            isDoubleLine: true,
            confidence: 0.95,
          });
        }
      }
    }

    // Notice: Unpaired single thin lines (< 7.2 cm) are INTENTIONALLY NOT added as walls!
    // This eliminates 99% of dimension lines, witness lines, stairs/furniture outlines, and grid axes!
    return results;
  };

  const horizRuns = extractAxisRuns('H');
  const vertRuns = extractAxisRuns('V');
  let candidates: CandidateWall[] = [
    ...buildCandidateWallsForAxis('H', horizRuns),
    ...buildCandidateWallsForAxis('V', vertRuns),
  ];

  // Fallback ONLY if a schematic plan was drawn entirely with ultra-thin single strokes (0 double/solid walls found):
  if (candidates.length < 4) {
    const addFallbackSingleLines = (orient: 'H' | 'V', runs: RawLineRun[]) => {
      const alongCellM = orient === 'H' ? cellW_M : cellH_M;
      const crossCellM = orient === 'H' ? cellH_M : cellW_M;
      for (const r of runs) {
        const lenM = (r.end - r.start + 1) * alongCellM;
        if (lenM < 0.85) continue;
        if (isInsideDimCorridor(orient, r.crossCenter, r.start, r.end)) continue;
        const pageFrac = lenM / (orient === 'H' ? planWidthM : planHeightM);
        if (pageFrac > 0.88) continue;
        const cM = (r.crossCenter + 0.5) * crossCellM;
        const sM = r.start * alongCellM;
        const eM = (r.end + 1) * alongCellM;
        candidates.push({
          orientation: orient,
          x1M: orient === 'H' ? sM : cM,
          y1M: orient === 'H' ? cM : sM,
          x2M: orient === 'H' ? eM : cM,
          y2M: orient === 'H' ? cM : eM,
          thicknessM: clamp(Math.max(0.12, r.thickCells * crossCellM), 0.1, 0.35),
          isDoubleLine: false,
          confidence: 0.6,
        });
      }
    };
    addFallbackSingleLines('H', horizRuns);
    addFallbackSingleLines('V', vertRuns);
  }

  if (candidates.length === 0) {
    return emptyModel;
  }

  // =========================================================================
  // STAGE 3: COLLINEAR DEDUP & MICRO-GAP HEALING (preserves doors >= 0.56m!)
  // =========================================================================
  const mergeCollinearAxis = (orient: 'H' | 'V', list: CandidateWall[]): CandidateWall[] => {
    const axisWalls = list
      .filter((w) => w.orientation === orient)
      .map((w) => ({
        ...w,
        s: orient === 'H' ? Math.min(w.x1M, w.x2M) : Math.min(w.y1M, w.y2M),
        e: orient === 'H' ? Math.max(w.x1M, w.x2M) : Math.max(w.y1M, w.y2M),
        c: orient === 'H' ? (w.y1M + w.y2M) * 0.5 : (w.x1M + w.x2M) * 0.5,
      }))
      .sort((a, b) => a.c - b.c || a.s - b.s);

    const merged: typeof axisWalls = [];
    for (const w of axisWalls) {
      let didMerge = false;
      for (let i = merged.length - 1; i >= 0; i--) {
        const m = merged[i];
        const crossTol = Math.max(0.18, (m.thicknessM + w.thicknessM) * 0.65);
        if (Math.abs(w.c - m.c) > crossTol) {
          if (w.c - m.c > 0.65) break;
          continue;
        }
        const gap = Math.max(w.s - m.e, m.s - w.e);
        // Heal overlapping fragments & tiny text/intersection gaps (<= 0.36m),
        // NEVER merge across a real door or window opening (>= 0.55m)!
        if (gap <= 0.36) {
          const wLen = w.e - w.s;
          const mLen = m.e - m.s;
          const totalL = wLen + mLen;
          m.c = (m.c * mLen + w.c * wLen) / Math.max(0.01, totalL);
          m.s = Math.min(m.s, w.s);
          m.e = Math.max(m.e, w.e);
          m.thicknessM = Math.max(m.thicknessM, w.thicknessM);
          m.isDoubleLine = m.isDoubleLine || w.isDoubleLine;
          m.confidence = Math.max(m.confidence, w.confidence);
          didMerge = true;
          break;
        }
      }
      if (!didMerge) merged.push(w);
    }

    return merged
      .filter((m) => m.e - m.s >= 0.42)
      .map((m) => ({
        orientation: orient,
        x1M: orient === 'H' ? m.s : m.c,
        y1M: orient === 'H' ? m.c : m.s,
        x2M: orient === 'H' ? m.e : m.c,
        y2M: orient === 'H' ? m.c : m.e,
        thicknessM: m.thicknessM,
        isDoubleLine: m.isDoubleLine,
        confidence: m.confidence,
      }));
  };

  candidates = [
    ...mergeCollinearAxis('H', candidates),
    ...mergeCollinearAxis('V', candidates),
  ];

  // =========================================================================
  // STAGE 4: CONNECTED ARCHITECTURAL BUILDING FOOTPRINT FILTER
  // Discards isolated title blocks (cartigli), legends, and stray annotations!
  // =========================================================================
  const nCand = candidates.length;
  const parent = new Int32Array(nCand);
  for (let i = 0; i < nCand; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Connect walls that meet or span across openings up to 2.55m
  for (let i = 0; i < nCand; i++) {
    const a = candidates[i];
    for (let j = i + 1; j < nCand; j++) {
      const b = candidates[j];
      const d = segmentToSegmentDist(a.x1M, a.y1M, a.x2M, a.y2M, b.x1M, b.y1M, b.x2M, b.y2M);
      if (d <= 2.55) {
        union(i, j);
      }
    }
  }

  interface CompInfo {
    root: number;
    indices: number[];
    totalLenM: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    roomHits: number;
    score: number;
  }
  const compMap = new Map<number, CompInfo>();
  for (let i = 0; i < nCand; i++) {
    const r = find(i);
    const w = candidates[i];
    const len = Math.hypot(w.x2M - w.x1M, w.y2M - w.y1M);
    let comp = compMap.get(r);
    if (!comp) {
      comp = {
        root: r,
        indices: [],
        totalLenM: 0,
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
        roomHits: 0,
        score: 0,
      };
      compMap.set(r, comp);
    }
    comp.indices.push(i);
    comp.totalLenM += len;
    comp.minX = Math.min(comp.minX, w.x1M, w.x2M);
    comp.maxX = Math.max(comp.maxX, w.x1M, w.x2M);
    comp.minY = Math.min(comp.minY, w.y1M, w.y2M);
    comp.maxY = Math.max(comp.maxY, w.y1M, w.y2M);
  }

  const comps = Array.from(compMap.values());
  for (const c of comps) {
    // Count room labels inside component bounding box (strong proof this is the actual building!)
    for (const rm of detectedRooms) {
      const rx = ((rm.bbox.x1 + rm.bbox.x2) * 0.5) * metersPerPt;
      const ry = ((rm.bbox.y1 + rm.bbox.y2) * 0.5) * metersPerPt;
      if (rx >= c.minX - 0.8 && rx <= c.maxX + 0.8 && ry >= c.minY - 0.8 && ry <= c.maxY + 0.8) {
        c.roomHits++;
      }
    }
    const bboxArea = Math.max(0.1, (c.maxX - c.minX) * (c.maxY - c.minY));
    const isBottomRightCartiglio =
      c.minX > planWidthM * 0.62 && c.minY > planHeightM * 0.68 && c.roomHits === 0;
    const hasBothAxes =
      c.indices.some((idx) => candidates[idx].orientation === 'H') &&
      c.indices.some((idx) => candidates[idx].orientation === 'V');

    c.score =
      c.totalLenM *
      (1 + c.roomHits * 0.75) *
      (hasBothAxes ? 1.35 : 0.35) *
      (bboxArea < 1.5 ? 0.25 : 1.0) *
      (isBottomRightCartiglio ? 0.15 : 1.0);
  }

  comps.sort((a, b) => b.score - a.score);
  const keptIndices = new Set<number>();
  if (comps.length > 0) {
    const mainComp = comps[0];
    for (const idx of mainComp.indices) keptIndices.add(idx);
    // Also keep secondary floor plans on multi-floor sheets if substantial (>= 28% of main wall mass & has both H+V walls)
    for (let k = 1; k < comps.length; k++) {
      const c = comps[k];
      const hasBoth =
        c.indices.some((idx) => candidates[idx].orientation === 'H') &&
        c.indices.some((idx) => candidates[idx].orientation === 'V');
      if (
        hasBoth &&
        c.indices.length >= 4 &&
        (c.roomHits > 0 || c.totalLenM >= mainComp.totalLenM * 0.28)
      ) {
        for (const idx of c.indices) keptIndices.add(idx);
      }
    }
  }

  let wallsWork = candidates.filter((_, idx) => keptIndices.has(idx));

  // =========================================================================
  // STAGE 5: CLEAN L / T CORNER SNAPPING (Revit-like clean architectural joins)
  // =========================================================================
  const snapTolM = 0.26;
  for (let i = 0; i < wallsWork.length; i++) {
    const a = wallsWork[i];
    for (let j = 0; j < wallsWork.length; j++) {
      if (i === j) continue;
      const b = wallsWork[j];
      if (a.orientation === b.orientation) continue;

      if (a.orientation === 'H' && b.orientation === 'V') {
        const bx = (b.x1M + b.x2M) * 0.5;
        const bMinY = Math.min(b.y1M, b.y2M);
        const bMaxY = Math.max(b.y1M, b.y2M);
        const ay = (a.y1M + a.y2M) * 0.5;
        // Snap horizontal wall endpoints cleanly to perpendicular vertical wall centerline
        if (ay >= bMinY - snapTolM && ay <= bMaxY + snapTolM) {
          if (Math.abs(a.x1M - bx) <= snapTolM) a.x1M = bx;
          if (Math.abs(a.x2M - bx) <= snapTolM) a.x2M = bx;
        }
      } else if (a.orientation === 'V' && b.orientation === 'H') {
        const by = (b.y1M + b.y2M) * 0.5;
        const bMinX = Math.min(b.x1M, b.x2M);
        const bMaxX = Math.max(b.x1M, b.x2M);
        const ax = (a.x1M + a.x2M) * 0.5;
        if (ax >= bMinX - snapTolM && ax <= bMaxX + snapTolM) {
          if (Math.abs(a.y1M - by) <= snapTolM) a.y1M = by;
          if (Math.abs(a.y2M - by) <= snapTolM) a.y2M = by;
        }
      }
    }
  }

  wallsWork = wallsWork.filter((w) => Math.hypot(w.x2M - w.x1M, w.y2M - w.y1M) >= 0.42);
  if (wallsWork.length === 0) return emptyModel;

  // Compute true building bounds
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const w of wallsWork) {
    minX = Math.min(minX, w.x1M, w.x2M);
    maxX = Math.max(maxX, w.x1M, w.x2M);
    minY = Math.min(minY, w.y1M, w.y2M);
    maxY = Math.max(maxY, w.y1M, w.y2M);
  }

  // =========================================================================
  // STAGE 6: 2D EXTERIOR FLOOD-FILL FOR TRUE `Muro Perimetrale` vs `Tramezzo`
  // =========================================================================
  const fPadM = 1.2;
  const fMinX = minX - fPadM;
  const fMinY = minY - fPadM;
  const fSpanX = Math.max(2, maxX - minX + fPadM * 2);
  const fSpanY = Math.max(2, maxY - minY + fPadM * 2);
  const fCellM = Math.max(0.06, Math.min(0.12, Math.max(fSpanX, fSpanY) / 220));
  const fw = Math.min(280, Math.max(40, Math.ceil(fSpanX / fCellM)));
  const fh = Math.min(280, Math.max(40, Math.ceil(fSpanY / fCellM)));

  // 0 = empty, 1 = wall/virtual opening seal, 2 = OUTSIDE air
  const occ = new Uint8Array(fw * fh);
  const toFx = (xM: number) => clamp(Math.floor((xM - fMinX) / fCellM), 0, fw - 1);
  const toFy = (yM: number) => clamp(Math.floor((yM - fMinY) / fCellM), 0, fh - 1);

  const paintOccSeg = (x1: number, y1: number, x2: number, y2: number, halfThickM: number) => {
    const gx1 = toFx(Math.min(x1, x2) - halfThickM);
    const gx2 = toFx(Math.max(x1, x2) + halfThickM);
    const gy1 = toFy(Math.min(y1, y2) - halfThickM);
    const gy2 = toFy(Math.max(y1, y2) + halfThickM);
    for (let y = gy1; y <= gy2; y++) {
      const rOff = y * fw;
      for (let x = gx1; x <= gx2; x++) {
        occ[rOff + x] = 1;
      }
    }
  };

  for (const w of wallsWork) {
    paintOccSeg(w.x1M, w.y1M, w.x2M, w.y2M, Math.max(w.thicknessM * 0.55, fCellM * 0.9));
  }

  // Temporarily seal collinear window/door openings (<= 2.65m) and corner door gaps (<= 1.35m)
  // so exterior air doesn't flood inside the building through open windows or entrance doors!
  for (let i = 0; i < wallsWork.length; i++) {
    const a = wallsWork[i];
    for (let j = i + 1; j < wallsWork.length; j++) {
      const b = wallsWork[j];
      if (a.orientation !== b.orientation) continue;
      if (a.orientation === 'H') {
        const ay = (a.y1M + a.y2M) * 0.5;
        const by = (b.y1M + b.y2M) * 0.5;
        if (Math.abs(ay - by) > 0.28) continue;
        const aMin = Math.min(a.x1M, a.x2M);
        const aMax = Math.max(a.x1M, a.x2M);
        const bMin = Math.min(b.x1M, b.x2M);
        const bMax = Math.max(b.x1M, b.x2M);
        const gapS = Math.min(aMax, bMax);
        const gapE = Math.max(aMin, bMin);
        const gapW = gapE - gapS;
        if (gapW > 0.25 && gapW <= 2.65) {
          paintOccSeg(gapS, (ay + by) * 0.5, gapE, (ay + by) * 0.5, fCellM * 0.9);
        }
      } else {
        const ax = (a.x1M + a.x2M) * 0.5;
        const bx = (b.x1M + b.x2M) * 0.5;
        if (Math.abs(ax - bx) > 0.28) continue;
        const aMin = Math.min(a.y1M, a.y2M);
        const aMax = Math.max(a.y1M, a.y2M);
        const bMin = Math.min(b.y1M, b.y2M);
        const bMax = Math.max(b.y1M, b.y2M);
        const gapS = Math.min(aMax, bMax);
        const gapE = Math.max(aMin, bMin);
        const gapW = gapE - gapS;
        if (gapW > 0.25 && gapW <= 2.65) {
          paintOccSeg((ax + bx) * 0.5, gapS, (ax + bx) * 0.5, gapE, fCellM * 0.9);
        }
      }
    }
  }

  // Seal small corner openings (<= 1.35m from a wall end to a perpendicular wall)
  for (let i = 0; i < wallsWork.length; i++) {
    const a = wallsWork[i];
    const endpoints: Array<[number, number, number, number]> =
      a.orientation === 'H'
        ? [
            [Math.min(a.x1M, a.x2M), (a.y1M + a.y2M) * 0.5, -1, 0],
            [Math.max(a.x1M, a.x2M), (a.y1M + a.y2M) * 0.5, 1, 0],
          ]
        : [
            [(a.x1M + a.x2M) * 0.5, Math.min(a.y1M, a.y2M), 0, -1],
            [(a.x1M + a.x2M) * 0.5, Math.max(a.y1M, a.y2M), 0, 1],
          ];
    for (const [ex, ey, dx, dy] of endpoints) {
      let bestDist = 1.4;
      let hitX = ex;
      let hitY = ey;
      for (let j = 0; j < wallsWork.length; j++) {
        if (i === j) continue;
        const b = wallsWork[j];
        if (b.orientation === a.orientation) continue;
        if (a.orientation === 'H') {
          const bx = (b.x1M + b.x2M) * 0.5;
          const bMinY = Math.min(b.y1M, b.y2M) - 0.15;
          const bMaxY = Math.max(b.y1M, b.y2M) + 0.15;
          if (ey < bMinY || ey > bMaxY) continue;
          const dist = (bx - ex) * dx;
          if (dist > 0.12 && dist < bestDist) {
            bestDist = dist;
            hitX = bx;
            hitY = ey;
          }
        } else {
          const by = (b.y1M + b.y2M) * 0.5;
          const bMinX = Math.min(b.x1M, b.x2M) - 0.15;
          const bMaxX = Math.max(b.x1M, b.x2M) + 0.15;
          if (ex < bMinX || ex > bMaxX) continue;
          const dist = (by - ey) * dy;
          if (dist > 0.12 && dist < bestDist) {
            bestDist = dist;
            hitX = ex;
            hitY = by;
          }
        }
      }
      if (bestDist < 1.38) {
        paintOccSeg(ex, ey, hitX, hitY, fCellM * 0.85);
      }
    }
  }

  // BFS flood-fill OUTSIDE from all 4 outer borders
  const queue = new Int32Array(fw * fh);
  let qHead = 0;
  let qTail = 0;
  const enqueueOutside = (x: number, y: number) => {
    const idx = y * fw + x;
    if (occ[idx] === 0) {
      occ[idx] = 2;
      queue[qTail++] = idx;
    }
  };
  for (let x = 0; x < fw; x++) {
    enqueueOutside(x, 0);
    enqueueOutside(x, fh - 1);
  }
  for (let y = 0; y < fh; y++) {
    enqueueOutside(0, y);
    enqueueOutside(fw - 1, y);
  }
  while (qHead < qTail) {
    const idx = queue[qHead++];
    const x = idx % fw;
    const y = (idx - x) / fw;
    if (x > 0 && occ[idx - 1] === 0) {
      occ[idx - 1] = 2;
      queue[qTail++] = idx - 1;
    }
    if (x < fw - 1 && occ[idx + 1] === 0) {
      occ[idx + 1] = 2;
      queue[qTail++] = idx + 1;
    }
    if (y > 0 && occ[idx - fw] === 0) {
      occ[idx - fw] = 2;
      queue[qTail++] = idx - fw;
    }
    if (y < fh - 1 && occ[idx + fw] === 0) {
      occ[idx + fw] = 2;
      queue[qTail++] = idx + fw;
    }
  }

  const probeSideState = (xM: number, yM: number): 'outside' | 'inside' | 'wall' => {
    const fx = toFx(xM);
    const fy = toFy(yM);
    const v = occ[fy * fw + fx];
    if (v === 2) return 'outside';
    if (v === 0) return 'inside';
    return 'wall';
  };

  // Room label nearest lookup
  const roomCenters = detectedRooms.map((r) => ({
    name: r.name,
    xM: ((r.bbox.x1 + r.bbox.x2) * 0.5) * metersPerPt,
    yM: ((r.bbox.y1 + r.bbox.y2) * 0.5) * metersPerPt,
  }));
  const findNearestRoom = (xM: number, yM: number): string | undefined => {
    let best: string | undefined;
    let bestD = 3.8;
    for (const r of roomCenters) {
      const d = Math.hypot(r.xM - xM, r.yM - yM);
      if (d < bestD) {
        bestD = d;
        best = r.name;
      }
    }
    return best;
  };

  // Build final classified BimWallObjects
  const walls: BimWallObject[] = [];
  let perimCount = 0;
  let tramCount = 0;

  for (const w of wallsWork) {
    const lenM = round2(Math.hypot(w.x2M - w.x1M, w.y2M - w.y1M));
    if (lenM < 0.42) continue;

    // Sample 5 points along the wall on both sides (+normal / -normal)
    const nx = w.orientation === 'H' ? 0 : 1;
    const ny = w.orientation === 'H' ? 1 : 0;
    const probeOffset = Math.max(0.32, w.thicknessM * 0.65 + 0.18);

    let sideAOut = 0;
    let sideAIn = 0;
    let sideBOut = 0;
    let sideBIn = 0;

    for (let k = 1; k <= 5; k++) {
      const t = k / 6;
      const px = w.x1M + (w.x2M - w.x1M) * t;
      const py = w.y1M + (w.y2M - w.y1M) * t;
      const stA = probeSideState(px + nx * probeOffset, py + ny * probeOffset);
      const stB = probeSideState(px - nx * probeOffset, py - ny * probeOffset);
      if (stA === 'outside') sideAOut++;
      else if (stA === 'inside') sideAIn++;
      if (stB === 'outside') sideBOut++;
      else if (stB === 'inside') sideBIn++;
    }

    const facesExterior =
      (sideAOut >= 2 && sideBIn >= 1) ||
      (sideBOut >= 2 && sideAIn >= 1) ||
      (sideAOut >= 3 && sideBOut === 0) ||
      (sideBOut >= 3 && sideAOut === 0);

    // Reject completely free-floating exterior lines (OUTSIDE on BOTH sides & thin < 22cm!) — extra shield against stray annotations!
    if (sideAOut >= 4 && sideBOut >= 4 && w.thicknessM < 0.22) {
      continue;
    }

    const nearOuterHull =
      (w.orientation === 'H' && (Math.abs((w.y1M + w.y2M) * 0.5 - minY) <= 0.45 || Math.abs((w.y1M + w.y2M) * 0.5 - maxY) <= 0.45)) ||
      (w.orientation === 'V' && (Math.abs((w.x1M + w.x2M) * 0.5 - minX) <= 0.45 || Math.abs((w.x1M + w.x2M) * 0.5 - maxX) <= 0.45));

    const isPerimeter = facesExterior || w.thicknessM >= 0.21 || (nearOuterHull && w.thicknessM >= 0.16);

    const cleanThickM = isPerimeter
      ? round2(clamp(w.thicknessM, 0.24, 0.52))
      : round2(clamp(w.thicknessM, 0.09, 0.18));

    const cxM = (w.x1M + w.x2M) * 0.5;
    const cyM = (w.y1M + w.y2M) * 0.5;
    const roomName = findNearestRoom(cxM, cyM);

    const code = isPerimeter
      ? `MP${String(++perimCount).padStart(2, '0')}`
      : `TR${String(++tramCount).padStart(2, '0')}`;

    walls.push({
      id: `bim_wall_${walls.length + 1}`,
      kind: 'wall',
      code,
      name: isPerimeter
        ? `Muro Perimetrale ${code}${roomName ? ` (${roomName})` : ''}`
        : `Tramezzo ${code}${roomName ? ` (${roomName})` : ''}`,
      category: isPerimeter ? 'Muro Perimetrale' : 'Tramezzo Interno',
      material: isPerimeter ? 'Muratura perimetrale' : 'Laterizio forato / Cartongesso',
      x1M: round2(w.x1M),
      y1M: round2(w.y1M),
      x2M: round2(w.x2M),
      y2M: round2(w.y2M),
      cxM: round2(cxM),
      cyM: round2(cyM),
      lengthM: lenM,
      thicknessM: cleanThickM,
      heightM: defaultHeightM,
      orientation: w.orientation,
      roomName,
    });
  }

  // Recompute tight bounds after exterior stray cleanup
  if (walls.length > 0) {
    minX = Infinity;
    maxX = -Infinity;
    minY = Infinity;
    maxY = -Infinity;
    for (const w of walls) {
      minX = Math.min(minX, w.x1M, w.x2M);
      maxX = Math.max(maxX, w.x1M, w.x2M);
      minY = Math.min(minY, w.y1M, w.y2M);
      maxY = Math.max(maxY, w.y1M, w.y2M);
    }
  }

  // =========================================================================
  // STAGE 7: ARCHITECTURAL DOORS & WINDOWS DETECTION
  //   - Track 1: Collinear wall-to-wall openings
  //   - Track 2: Corner / T-junction interior & exterior openings
  //   - Uses rawDark cues (glass sill lines & door swing arcs) + exterior flood-fill!
  // =========================================================================
  const doors: BimDoorObject[] = [];
  const windows: BimWindowObject[] = [];

  const hasExistingOpeningNear = (cxM: number, cyM: number, minDist = 0.55): boolean => {
    for (const d of doors) {
      if (Math.hypot(d.cxM - cxM, d.cyM - cyM) < minDist) return true;
    }
    for (const win of windows) {
      if (Math.hypot(win.cxM - cxM, win.cyM - cyM) < minDist) return true;
    }
    return false;
  };

  // Sample original ink density in a rectangular meter box (to detect door swing arcs or window glass lines)
  const sampleRawInkRatio = (x1M: number, y1M: number, x2M: number, y2M: number): number => {
    const gx1 = mToGx(Math.min(x1M, x2M));
    const gx2 = mToGx(Math.max(x1M, x2M));
    const gy1 = mToGy(Math.min(y1M, y2M));
    const gy2 = mToGy(Math.max(y1M, y2M));
    let dark = 0;
    let total = 0;
    for (let y = gy1; y <= gy2; y++) {
      const rOff = y * gw;
      for (let x = gx1; x <= gx2; x++) {
        if (textMask[rOff + x]) continue;
        if (rawDark[rOff + x]) dark++;
        total++;
      }
    }
    return total > 0 ? dark / total : 0;
  };

  // Helper: check if a candidate opening touches OUTSIDE on one side (window / entrance door)
  // vs INSIDE on both sides (interior door)
  const classifyOpeningSides = (
    cxM: number,
    cyM: number,
    orient: 'H' | 'V',
    thickM: number
  ): { isExterior: boolean; bothOutside: boolean; hasSwingArc: boolean; hasGlassLine: boolean } => {
    const nx = orient === 'H' ? 0 : 1;
    const ny = orient === 'H' ? 1 : 0;
    const off = Math.max(0.38, thickM * 0.7 + 0.22);
    const stA = probeSideState(cxM + nx * off, cyM + ny * off);
    const stB = probeSideState(cxM - nx * off, cyM - ny * off);
    const isExterior = (stA === 'outside' && stB !== 'outside') || (stB === 'outside' && stA !== 'outside');
    const bothOutside = stA === 'outside' && stB === 'outside';

    // Check thin glass/sill ink inside the opening centerline
    const bandHalf = Math.max(0.08, thickM * 0.45);
    const centerInk =
      orient === 'H'
        ? sampleRawInkRatio(cxM - 0.28, cyM - bandHalf, cxM + 0.28, cyM + bandHalf)
        : sampleRawInkRatio(cxM - bandHalf, cyM - 0.28, cxM + bandHalf, cyM + 0.28);

    // Check door swing arc cue on the interior side (light curved arc ~3%–26% ink density)
    const swingHalf = 0.55;
    const swingA =
      orient === 'H'
        ? sampleRawInkRatio(cxM - 0.35, cyM + bandHalf, cxM + 0.35, cyM + bandHalf + swingHalf)
        : sampleRawInkRatio(cxM + bandHalf, cyM - 0.35, cxM + bandHalf + swingHalf, cyM + 0.35);
    const swingB =
      orient === 'H'
        ? sampleRawInkRatio(cxM - 0.35, cyM - bandHalf - swingHalf, cxM + 0.35, cyM - bandHalf)
        : sampleRawInkRatio(cxM - bandHalf - swingHalf, cyM - 0.35, cxM - bandHalf, cyM + 0.35);

    const hasSwingArc = (swingA >= 0.035 && swingA <= 0.38) || (swingB >= 0.035 && swingB <= 0.38);
    const hasGlassLine = centerInk >= 0.08 && centerInk <= 0.65;

    return { isExterior, bothOutside, hasSwingArc, hasGlassLine };
  };

  // Detect balcony / entrance hints from room tokens
  const isNearKeyword = (cxM: number, cyM: number, regex: RegExp, maxDistM = 2.6): boolean => {
    for (const tok of tokens) {
      if (tok.kind !== 'room' && tok.kind !== 'other') continue;
      if (!regex.test(tok.str)) continue;
      const d = Math.hypot(tok.cx * metersPerPt - cxM, tok.cy * metersPerPt - cyM);
      if (d <= maxDistM) return true;
    }
    return false;
  };

  const registerOpening = (
    cxM: number,
    cyM: number,
    gapWidthM: number,
    orient: 'H' | 'V',
    wallThickM: number,
    onPerimeterWall: boolean
  ) => {
    if (gapWidthM < 0.56 || gapWidthM > 2.75) return;
    if (hasExistingOpeningNear(cxM, cyM, 0.55)) return;

    const sides = classifyOpeningSides(cxM, cyM, orient, wallThickM);
    if (sides.bothOutside && !onPerimeterWall) return;

    // Make sure no perpendicular wall cuts right through the middle of this opening
    for (const w of walls) {
      if (w.orientation === orient) continue;
      const d = pointToSegmentDist(cxM, cyM, w.x1M, w.y1M, w.x2M, w.y2M);
      if (d < Math.min(0.28, gapWidthM * 0.3)) return;
    }

    const roomName = findNearestRoom(cxM, cyM);
    const nearEntrance = isNearKeyword(cxM, cyM, /INGRESSO|ENTRATA|SCALA|VANO SCALA|PIANEROTTOLO|ATRIO/i, 2.5);
    const nearBalcony = isNearKeyword(cxM, cyM, /BALCON|TERRAZZ|LOGGIA|VERANDA|GIARDIN|PORTICO/i, 3.0);

    const treatAsExterior = onPerimeterWall || sides.isExterior;

    if (treatAsExterior) {
      // Exterior armored entrance door?
      if (gapWidthM >= 0.78 && gapWidthM <= 1.28 && (nearEntrance || (sides.hasSwingArc && !sides.hasGlassLine && !nearBalcony))) {
        const code = `P${String(doors.length + 1).padStart(2, '0')}`;
        doors.push({
          id: `bim_door_${doors.length + 1}`,
          kind: 'door',
          code,
          name: `Portoncino ${code}${roomName ? ` (${roomName})` : ''}`,
          doorType: 'Portoncino Blindato',
          cxM: round2(cxM),
          cyM: round2(cyM),
          widthM: round2(gapWidthM),
          heightM: 2.15,
          thicknessM: round2(wallThickM),
          orientation: orient,
          roomName,
        });
        return;
      }

      // Window / Portafinestra
      if (gapWidthM >= 0.58 && gapWidthM <= 2.75) {
        const isPortaFinestra = gapWidthM >= 1.48 || nearBalcony || (gapWidthM >= 1.1 && sides.hasSwingArc);
        const code = isPortaFinestra
          ? `PF${String(windows.length + 1).padStart(2, '0')}`
          : `F${String(windows.length + 1).padStart(2, '0')}`;
        windows.push({
          id: `bim_win_${windows.length + 1}`,
          kind: 'window',
          code,
          name: `${isPortaFinestra ? 'Portafinestra' : 'Finestra'} ${code}${roomName ? ` (${roomName})` : ''}`,
          windowType: isPortaFinestra ? 'Portafinestra' : 'Finestra PVC/Alluminio',
          cxM: round2(cxM),
          cyM: round2(cyM),
          widthM: round2(gapWidthM),
          heightM: isPortaFinestra ? 2.2 : 1.35,
          sillHeightM: isPortaFinestra ? 0 : 0.95,
          thicknessM: round2(wallThickM),
          orientation: orient,
          roomName,
        });
      }
      return;
    }

    // Interior opening (Tramezzo Interno): realistic door width 0.62m – 1.38m
    if (gapWidthM >= 0.60 && gapWidthM <= 1.38) {
      const code = `P${String(doors.length + 1).padStart(2, '0')}`;
      doors.push({
        id: `bim_door_${doors.length + 1}`,
        kind: 'door',
        code,
        name: `Porta ${code}${roomName ? ` (${roomName})` : ''}`,
        doorType: 'Porta Interna',
        cxM: round2(cxM),
        cyM: round2(cyM),
        widthM: round2(gapWidthM),
        heightM: 2.1,
        thicknessM: round2(wallThickM),
        orientation: orient,
        roomName,
      });
    }
  };

  // --- Track 1: Collinear openings between two wall segments on the same axis ---
  for (const orient of ['H', 'V'] as const) {
    const group = walls
      .filter((w) => w.orientation === orient)
      .sort((a, b) =>
        orient === 'H' ? a.cyM - b.cyM || a.x1M - b.x1M : a.cxM - b.cxM || a.y1M - b.y1M
      );

    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      for (let j = i + 1; j < group.length; j++) {
        const b = group[j];
        const crossDiff = orient === 'H' ? Math.abs(a.cyM - b.cyM) : Math.abs(a.cxM - b.cxM);
        if (crossDiff > 0.24) continue;

        const aMin = orient === 'H' ? Math.min(a.x1M, a.x2M) : Math.min(a.y1M, a.y2M);
        const aMax = orient === 'H' ? Math.max(a.x1M, a.x2M) : Math.max(a.y1M, a.y2M);
        const bMin = orient === 'H' ? Math.min(b.x1M, b.x2M) : Math.min(b.y1M, b.y2M);
        const bMax = orient === 'H' ? Math.max(b.x1M, b.x2M) : Math.max(b.y1M, b.y2M);

        const gapStart = Math.min(aMax, bMax);
        const gapEnd = Math.max(aMin, bMin);
        const gapW = gapEnd - gapStart;
        if (gapW < 0.58 || gapW > 2.75) continue;

        // Ensure no third collinear wall already occupies this gap
        const gapMid = (gapStart + gapEnd) * 0.5;
        const crossAvg = orient === 'H' ? (a.cyM + b.cyM) * 0.5 : (a.cxM + b.cxM) * 0.5;
        let blocked = false;
        for (let k = 0; k < group.length; k++) {
          if (k === i || k === j) continue;
          const c = group[k];
          const cCross = orient === 'H' ? c.cyM : c.cxM;
          if (Math.abs(cCross - crossAvg) > 0.24) continue;
          const cMin = orient === 'H' ? Math.min(c.x1M, c.x2M) : Math.min(c.y1M, c.y2M);
          const cMax = orient === 'H' ? Math.max(c.x1M, c.x2M) : Math.max(c.y1M, c.y2M);
          if (cMax > gapStart + 0.1 && cMin < gapEnd - 0.1) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;

        const cxM = orient === 'H' ? gapMid : crossAvg;
        const cyM = orient === 'H' ? crossAvg : gapMid;
        const isPerim = a.category === 'Muro Perimetrale' || b.category === 'Muro Perimetrale';
        const thickM = Math.max(a.thicknessM, b.thicknessM);

        registerOpening(cxM, cyM, gapW, orient, thickM, isPerim);
      }
    }
  }

  // --- Track 2: Corner / T-Junction Doors & Windows (wall stopping 0.62m–1.25m before a perpendicular wall!) ---
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const endpoints: Array<[number, number, number, number]> =
      w.orientation === 'H'
        ? [
            [Math.min(w.x1M, w.x2M), w.cyM, -1, 0],
            [Math.max(w.x1M, w.x2M), w.cyM, 1, 0],
          ]
        : [
            [w.cxM, Math.min(w.y1M, w.y2M), 0, -1],
            [w.cxM, Math.max(w.y1M, w.y2M), 0, 1],
          ];

    for (const [ex, ey, dx, dy] of endpoints) {
      // Skip if this endpoint is already joined to another wall (< 0.35m away)
      let alreadyJoined = false;
      for (let j = 0; j < walls.length; j++) {
        if (i === j) continue;
        const other = walls[j];
        if (pointToSegmentDist(ex, ey, other.x1M, other.y1M, other.x2M, other.y2M) < 0.35) {
          alreadyJoined = true;
          break;
        }
      }
      if (alreadyJoined) continue;

      // Cast along wall direction to find a perpendicular wall forming a corner door/window jamb
      const maxSearchM = w.category === 'Muro Perimetrale' ? 1.85 : 1.22;
      let bestDist = maxSearchM + 0.01;
      let bestTarget: BimWallObject | null = null;

      for (let j = 0; j < walls.length; j++) {
        if (i === j) continue;
        const b = walls[j];
        if (b.orientation === w.orientation) continue;
        if (w.orientation === 'H') {
          const bMinY = Math.min(b.y1M, b.y2M) - 0.12;
          const bMaxY = Math.max(b.y1M, b.y2M) + 0.12;
          if (ey < bMinY || ey > bMaxY) continue;
          const dist = (b.cxM - ex) * dx;
          if (dist >= 0.62 && dist < bestDist) {
            bestDist = dist;
            bestTarget = b;
          }
        } else {
          const bMinX = Math.min(b.x1M, b.x2M) - 0.12;
          const bMaxX = Math.max(b.x1M, b.x2M) + 0.12;
          if (ex < bMinX || ex > bMaxX) continue;
          const dist = (b.cyM - ey) * dy;
          if (dist >= 0.62 && dist < bestDist) {
            bestDist = dist;
            bestTarget = b;
          }
        }
      }

      if (bestTarget && bestDist >= 0.62 && bestDist <= maxSearchM) {
        const netGap = bestDist - bestTarget.thicknessM * 0.5;
        if (netGap < 0.58) continue;
        const cxM = ex + dx * (bestDist * 0.5);
        const cyM = ey + dy * (bestDist * 0.5);
        const isPerim = w.category === 'Muro Perimetrale';
        const sides = classifyOpeningSides(cxM, cyM, w.orientation, w.thicknessM);
        // For corner openings, require either exterior glass/swing cue or interior door width
        if (isPerim) {
          if (sides.hasGlassLine || sides.hasSwingArc || netGap <= 1.55) {
            registerOpening(cxM, cyM, netGap, w.orientation, w.thicknessM, true);
          }
        } else if (netGap <= 1.18) {
          registerOpening(cxM, cyM, netGap, w.orientation, w.thicknessM, false);
        }
      }
    }
  }

  // --- Track 3: Embedded Window Bays inside Continuous Perimeter Walls ---
  // Catches CAD windows drawn inside continuous poché or hollow perimeter walls (with sill/glass lines)
  // and cleanly splits the perimeter wall so the 3D/BIM window sits in a real cutout without z-fighting!
  const splitAdditions: BimWallObject[] = [];
  const wallIdsToRemove = new Set<string>();

  for (const w of walls) {
    if (w.category !== 'Muro Perimetrale' || w.lengthM < 1.85 || w.thicknessM < 0.20) continue;

    const orient = w.orientation;
    const sM = orient === 'H' ? Math.min(w.x1M, w.x2M) : Math.min(w.y1M, w.y2M);
    const eM = orient === 'H' ? Math.max(w.x1M, w.x2M) : Math.max(w.y1M, w.y2M);
    const cM = orient === 'H' ? w.cyM : w.cxM;

    const stepM = 0.06;
    const nSteps = Math.floor((eM - sM) / stepM);
    if (nSteps < 28) continue;

    // Sample wall core ink (middle 46% of thickness, excluding the two outer wall faces)
    const coreHalf = Math.max(0.03, w.thicknessM * 0.24);
    const coreInk = new Float32Array(nSteps);
    let solidCount = 0;
    let hollowCount = 0;

    for (let k = 0; k < nSteps; k++) {
      const a0 = sM + k * stepM;
      const a1 = a0 + stepM;
      const ratio =
        orient === 'H'
          ? sampleRawInkRatio(a0, cM - coreHalf, a1, cM + coreHalf)
          : sampleRawInkRatio(cM - coreHalf, a0, cM + coreHalf, a1);
      coreInk[k] = ratio;
      if (ratio >= 0.65) solidCount++;
      else if (ratio <= 0.14) hollowCount++;
    }

    const isPocheWall = solidCount / nSteps >= 0.38;
    const isHollowWall = !isPocheWall && hollowCount / nSteps >= 0.42;
    if (!isPocheWall && !isHollowWall) continue;

    const bays: Array<{ startM: number; endM: number }> = [];
    const marginSteps = Math.ceil(0.32 / stepM); // Never cut right at a wall corner
    let k = marginSteps;

    while (k < nSteps - marginSteps) {
      const isWinCell = isPocheWall
        ? coreInk[k] < 0.42
        : coreInk[k] >= 0.24 && coreInk[k] <= 0.66;
      if (!isWinCell) {
        k++;
        continue;
      }
      const bStart = k;
      let miss = 0;
      let bLast = k;
      while (k < nSteps - marginSteps) {
        const hit = isPocheWall
          ? coreInk[k] < 0.42
          : coreInk[k] >= 0.24 && coreInk[k] <= 0.66;
        if (hit) {
          bLast = k;
          miss = 0;
        } else {
          miss++;
          if (miss > 2) break;
        }
        k++;
      }
      const bayLenM = (bLast - bStart + 1) * stepM;
      if (bayLenM >= 0.65 && bayLenM <= 2.45) {
        const bStartM = sM + bStart * stepM;
        const bEndM = sM + (bLast + 1) * stepM;
        const midM = (bStartM + bEndM) * 0.5;
        const cxM = orient === 'H' ? midM : cM;
        const cyM = orient === 'H' ? cM : midM;
        const sides = classifyOpeningSides(cxM, cyM, orient, w.thicknessM);
        // Must truly face exterior air on one side and not collide with an already registered opening
        if (sides.isExterior && !hasExistingOpeningNear(cxM, cyM, 0.55)) {
          bays.push({ startM: bStartM, endM: bEndM });
        }
      }
    }

    if (bays.length === 0) continue;

    // Register detected embedded windows and split the parent perimeter wall cleanly around them
    let cursorM = sM;
    let splitIdx = 0;
    let registeredAny = false;
    const pieces: Array<{ a: number; b: number }> = [];

    for (const bay of bays) {
      const midM = (bay.startM + bay.endM) * 0.5;
      const cxM = orient === 'H' ? midM : cM;
      const cyM = orient === 'H' ? cM : midM;
      const winCountBefore = windows.length + doors.length;
      registerOpening(cxM, cyM, bay.endM - bay.startM, orient, w.thicknessM, true);
      if (windows.length + doors.length > winCountBefore) {
        registeredAny = true;
        if (bay.startM - cursorM >= 0.30) {
          pieces.push({ a: cursorM, b: bay.startM });
        }
        cursorM = bay.endM;
      }
    }
    if (registeredAny) {
      if (eM - cursorM >= 0.30) {
        pieces.push({ a: cursorM, b: eM });
      }
      wallIdsToRemove.add(w.id);
      for (const p of pieces) {
        const lenM = round2(p.b - p.a);
        if (lenM < 0.30) continue;
        const pMid = (p.a + p.b) * 0.5;
        const suffix = String.fromCharCode(65 + splitIdx++);
        const code = `${w.code}${suffix}`;
        splitAdditions.push({
          ...w,
          id: `${w.id}_${suffix}`,
          code,
          name: `Muro Perimetrale ${code}${w.roomName ? ` (${w.roomName})` : ''}`,
          x1M: round2(orient === 'H' ? p.a : cM),
          y1M: round2(orient === 'H' ? cM : p.a),
          x2M: round2(orient === 'H' ? p.b : cM),
          y2M: round2(orient === 'H' ? cM : p.b),
          cxM: round2(orient === 'H' ? pMid : cM),
          cyM: round2(orient === 'H' ? cM : pMid),
          lengthM: lenM,
        });
      }
    }
  }

  if (wallIdsToRemove.size > 0) {
    const remainingWalls = walls.filter((w) => !wallIdsToRemove.has(w.id));
    walls.length = 0;
    walls.push(...remainingWalls, ...splitAdditions);
  }

  // =========================================================================
  // STAGE 8: STRUCTURAL PILLARS DETECTION (compact solid dark columns 24–68cm)
  // =========================================================================
  const pillars: BimPillarObject[] = [];
  const minPillarCells = Math.max(3, Math.round(0.22 / cellM));
  const maxPillarCells = Math.max(minPillarCells + 2, Math.round(0.68 / cellM));
  const visitedPillar = new Uint8Array(gw * gh);

  const bGx1 = Math.max(marginX, mToGx(minX - 0.5));
  const bGx2 = Math.min(gw - marginX - 1, mToGx(maxX + 0.5));
  const bGy1 = Math.max(marginY, mToGy(minY - 0.5));
  const bGy2 = Math.min(gh - marginY - 1, mToGy(maxY + 0.5));

  for (let y = bGy1; y <= bGy2 && pillars.length < 32; y += 2) {
    for (let x = bGx1; x <= bGx2 && pillars.length < 32; x += 2) {
      if (!darkMask[y * gw + x] || visitedPillar[y * gw + x]) continue;

      let x1 = x;
      let x2 = x;
      let y1 = y;
      let y2 = y;
      while (x1 > bGx1 && x - x1 < maxPillarCells && darkMask[y * gw + (x1 - 1)]) x1--;
      while (x2 < bGx2 && x2 - x < maxPillarCells && darkMask[y * gw + (x2 + 1)]) x2++;
      while (y1 > bGy1 && y - y1 < maxPillarCells && darkMask[(y1 - 1) * gw + x]) y1--;
      while (y2 < bGy2 && y2 - y < maxPillarCells && darkMask[(y2 + 1) * gw + x]) y2++;

      const bw = x2 - x1 + 1;
      const bh = y2 - y1 + 1;
      if (bw < minPillarCells || bh < minPillarCells || bw > maxPillarCells || bh > maxPillarCells) {
        continue;
      }
      const ratio = bw / bh;
      if (ratio < 0.58 || ratio > 1.72) continue;

      let filled = 0;
      for (let py = y1; py <= y2; py++) {
        for (let px = x1; px <= x2; px++) {
          if (darkMask[py * gw + px]) filled++;
        }
      }
      if (filled / (bw * bh) < 0.8) continue;

      // Require clear boundary on at least 3 sides so we don't pick wall corners
      const midY = Math.round((y1 + y2) * 0.5);
      const midX = Math.round((x1 + x2) * 0.5);
      const clearL = !darkMask[midY * gw + Math.max(0, x1 - 3)];
      const clearR = !darkMask[midY * gw + Math.min(gw - 1, x2 + 3)];
      const clearT = !darkMask[Math.max(0, y1 - 3) * gw + midX];
      const clearB = !darkMask[Math.min(gh - 1, y2 + 3) * gw + midX];
      if ((clearL ? 1 : 0) + (clearR ? 1 : 0) + (clearT ? 1 : 0) + (clearB ? 1 : 0) < 3) {
        continue;
      }

      for (let py = Math.max(0, y1 - 3); py <= Math.min(gh - 1, y2 + 3); py++) {
        for (let px = Math.max(0, x1 - 3); px <= Math.min(gw - 1, x2 + 3); px++) {
          visitedPillar[py * gw + px] = 1;
        }
      }

      const cxM = ((x1 + x2 + 1) * 0.5) * cellW_M;
      const cyM = ((y1 + y2 + 1) * 0.5) * cellH_M;
      // Skip if pillar overlaps an already extracted wall body
      const insideWall = walls.some(
        (w) => pointToSegmentDist(cxM, cyM, w.x1M, w.y1M, w.x2M, w.y2M) < w.thicknessM * 0.45
      );
      if (insideWall) continue;

      const code = `PL${String(pillars.length + 1).padStart(2, '0')}`;
      pillars.push({
        id: `bim_pil_${pillars.length + 1}`,
        kind: 'pillar',
        code,
        name: `Pilastro ${code}`,
        material: 'C.A. gettato in opera',
        cxM: round2(cxM),
        cyM: round2(cyM),
        widthM: round2(Math.max(0.25, bw * cellW_M)),
        depthM: round2(Math.max(0.25, bh * cellH_M)),
        heightM: defaultHeightM,
      });
    }
  }

  // =========================================================================
  // STAGE 9: BIM ROOMS / FLOOR SLABS
  // =========================================================================
  const rooms: BimRoomObject[] = [];
  for (let i = 0; i < detectedRooms.length; i++) {
    const rm = detectedRooms[i];
    const cxM = ((rm.bbox.x1 + rm.bbox.x2) * 0.5) * metersPerPt;
    const cyM = ((rm.bbox.y1 + rm.bbox.y2) * 0.5) * metersPerPt;
    const widthM = rm.lengthM && rm.lengthM > 0.6 ? rm.lengthM : rm.areaMq ? Math.sqrt(rm.areaMq) : 2.8;
    const depthM = rm.widthM && rm.widthM > 0.6 ? rm.widthM : rm.areaMq ? rm.areaMq / Math.max(1, widthM) : 2.6;
    const areaM2 = round2(rm.areaMq ?? widthM * depthM);
    const perimeterM = round2(rm.perimeterM ?? 2 * (widthM + depthM));
    const code = `V${String(i + 1).padStart(2, '0')}`;
    rooms.push({
      id: `bim_room_${i + 1}`,
      kind: 'room',
      code,
      name: rm.name || `Vano ${code}`,
      finish: 'Gres porcellanato',
      cxM: round2(cxM),
      cyM: round2(cyM),
      widthM: round2(clamp(widthM, 1.2, 12)),
      depthM: round2(clamp(depthM, 1.2, 12)),
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
    boundsM: {
      minX: Number.isFinite(minX) ? minX : 0,
      maxX: Number.isFinite(maxX) ? maxX : planWidthM,
      minY: Number.isFinite(minY) ? minY : 0,
      maxY: Number.isFinite(maxY) ? maxY : planHeightM,
    },
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
  const totalLengthM = round2(walls.reduce((s, w) => s + w.lengthM, 0));
  return {
    walls,
    planWidthM: bim.planWidthM,
    planHeightM: bim.planHeightM,
    totalLengthM,
    wallCount: walls.length,
    boundsM: bim.boundsM,
  };
}
