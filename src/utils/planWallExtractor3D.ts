import { PlanToken } from './pdfPlanExtractor';
import { LaserSensitivity, PlanLumaGrid } from './planLaserRaycaster';

export interface ExtractedWall3D {
  id: string;
  label: string;
  /** Endpoints in PDF-aligned meters (origin top-left of PDF page) */
  x1M: number;
  y1M: number;
  x2M: number;
  y2M: number;
  /** Center in PDF-aligned meters */
  cxM: number;
  cyM: number;
  lengthM: number;
  thicknessM: number;
  orientation: 'H' | 'V';
  roomName?: string;
}

export interface Plan3DModelData {
  walls: ExtractedWall3D[];
  planWidthM: number;
  planHeightM: number;
  totalLengthM: number;
  wallCount: number;
  /** Bounding box of detected walls in PDF-aligned meters */
  boundsM: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

interface RawStrip {
  /** Axis coordinate along the strip */
  start: number;
  end: number;
  /** Cross-axis range (thickness in cells) */
  crossMin: number;
  crossMax: number;
}

function getLumaWallThreshold(sensitivity: LaserSensitivity): number {
  if (sensitivity === 'thin') return 204;
  if (sensitivity === 'thick') return 115;
  return 155;
}

/**
 * Extracts architectural wall segments from the rendered PDF luminance grid
 * so they can be extruded into an interactive 3D building model at the declared height `H`.
 *
 * Text/dimension tokens are masked out automatically so labels never extrude as walls.
 */
export function extractPlanWallsFor3D(
  grid: PlanLumaGrid | null,
  metersPerPt: number,
  tokens: PlanToken[],
  sensitivity: LaserSensitivity = 'medium'
): Plan3DModelData {
  if (!grid || !Number.isFinite(metersPerPt) || metersPerPt <= 0) {
    return {
      walls: [],
      planWidthM: 10,
      planHeightM: 10,
      totalLengthM: 0,
      wallCount: 0,
      boundsM: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
    };
  }

  const planWidthM = grid.pageWidthPt * metersPerPt;
  const planHeightM = grid.pageHeightPt * metersPerPt;

  // Target analysis grid (~340px max dimension) for fast (<15ms) crisp wall vectorization
  const maxDim = 340;
  const scaleDown = Math.min(1, maxDim / Math.max(grid.width, grid.height));
  const gw = Math.max(48, Math.round(grid.width * scaleDown));
  const gh = Math.max(48, Math.round(grid.height * scaleDown));
  const cellW_M = planWidthM / gw;
  const cellH_M = planHeightM / gh;
  const cellSizeM = (cellW_M + cellH_M) * 0.5;

  // Build text-mask on the downsampled grid so quote numbers & room labels are never extruded
  const textMask = new Uint8Array(gw * gh);
  const ptToGx = gw / grid.pageWidthPt;
  const ptToGy = gh / grid.pageHeightPt;
  for (const t of tokens) {
    const bw = (t.bbox.x2 - t.bbox.x1) * ptToGx;
    const bh = (t.bbox.y2 - t.bbox.y1) * ptToGy;
    if (bw > gw * 0.25 || bh > gh * 0.25) continue;
    const x1 = Math.max(0, Math.floor(t.bbox.x1 * ptToGx) - 1);
    const y1 = Math.max(0, Math.floor(t.bbox.y1 * ptToGy) - 1);
    const x2 = Math.min(gw - 1, Math.ceil(t.bbox.x2 * ptToGx) + 1);
    const y2 = Math.min(gh - 1, Math.ceil(t.bbox.y2 * ptToGy) + 1);
    for (let y = y1; y <= y2; y++) {
      const rowOff = y * gw;
      for (let x = x1; x <= x2; x++) {
        textMask[rowOff + x] = 1;
      }
    }
  }

  // Downsample luma using minimum-pooling (preserves crisp CAD wall lines even when thin)
  const threshold = getLumaWallThreshold(sensitivity);
  const rawMask = new Uint8Array(gw * gh);
  const srcStepX = grid.width / gw;
  const srcStepY = grid.height / gh;
  const darkCountRequired = sensitivity === 'thick' ? 2 : 1;

  for (let gy = 0; gy < gh; gy++) {
    const sy0 = Math.floor(gy * srcStepY);
    const sy1 = Math.min(grid.height - 1, Math.max(sy0, Math.floor((gy + 1) * srcStepY) - 1));
    const rowOff = gy * gw;
    for (let gx = 0; gx < gw; gx++) {
      if (textMask[rowOff + gx]) continue;
      const sx0 = Math.floor(gx * srcStepX);
      const sx1 = Math.min(grid.width - 1, Math.max(sx0, Math.floor((gx + 1) * srcStepX) - 1));

      let darkHits = 0;
      outer: for (let sy = sy0; sy <= sy1; sy++) {
        const lRow = sy * grid.width;
        for (let sx = sx0; sx <= sx1; sx++) {
          if (grid.luma[lRow + sx] < threshold) {
            darkHits++;
            if (darkHits >= darkCountRequired) break outer;
          }
        }
      }
      if (darkHits >= darkCountRequired) {
        rawMask[rowOff + gx] = 1;
      }
    }
  }

  // Clean isolated 1-cell specks and page border frame (outer 2% margin)
  const marginX = Math.max(2, Math.floor(gw * 0.015));
  const marginY = Math.max(2, Math.floor(gh * 0.015));
  const wallMask = new Uint8Array(gw * gh);

  for (let y = marginY; y < gh - marginY; y++) {
    const row = y * gw;
    for (let x = marginX; x < gw - marginX; x++) {
      if (!rawMask[row + x]) continue;
      // Keep cell if it has horizontal or vertical continuity
      const horiz = (rawMask[row + x - 1] || 0) + (rawMask[row + x + 1] || 0);
      const vert = (rawMask[(y - 1) * gw + x] || 0) + (rawMask[(y + 1) * gw + x] || 0);
      if (horiz >= 1 || vert >= 1) {
        wallMask[row + x] = 1;
      }
    }
  }

  // Minimum linear wall run in cells (approx >= 0.42m or >= 6 cells)
  const minRunCells = Math.max(6, Math.round(0.42 / Math.max(0.02, cellSizeM)));
  // Maximum wall thickness in cells (~0.65m, anything thicker is a solid black hatch/title block)
  const maxThickCells = Math.max(5, Math.min(18, Math.round(0.75 / Math.max(0.02, cellSizeM))));
  // Allow bridging 1-cell anti-alias gap along a wall
  const maxBridgeGap = 1;

  // --- Extract Horizontal Wall Strips ---
  const horizStrips: RawStrip[] = [];
  for (let y = marginY; y < gh - marginY; y++) {
    const row = y * gw;
    let x = marginX;
    while (x < gw - marginX) {
      if (!wallMask[row + x]) {
        x++;
        continue;
      }
      const start = x;
      let gap = 0;
      let lastSolid = x;
      while (x < gw - marginX) {
        if (wallMask[row + x]) {
          lastSolid = x;
          gap = 0;
        } else {
          gap++;
          if (gap > maxBridgeGap) break;
        }
        x++;
      }
      const runLen = lastSolid - start + 1;
      if (runLen >= minRunCells) {
        // Merge with an active horizontal strip on row y-1 if heavily overlapping
        let merged = false;
        for (let i = horizStrips.length - 1; i >= 0; i--) {
          const st = horizStrips[i];
          if (st.crossMax < y - 1) break;
          if (st.crossMax - st.crossMin + 1 >= maxThickCells) continue;
          const overlap = Math.min(st.end, lastSolid) - Math.max(st.start, start) + 1;
          const minW = Math.min(st.end - st.start + 1, runLen);
          if (overlap >= minW * 0.65 && Math.abs(st.start - start) <= 4 && Math.abs(st.end - lastSolid) <= 4) {
            st.start = Math.min(st.start, start);
            st.end = Math.max(st.end, lastSolid);
            st.crossMax = y;
            merged = true;
            break;
          }
        }
        if (!merged) {
          horizStrips.push({ start, end: lastSolid, crossMin: y, crossMax: y });
        }
      }
    }
  }

  // --- Extract Vertical Wall Strips ---
  const vertStrips: RawStrip[] = [];
  for (let x = marginX; x < gw - marginX; x++) {
    let y = marginY;
    while (y < gh - marginY) {
      if (!wallMask[y * gw + x]) {
        y++;
        continue;
      }
      const start = y;
      let gap = 0;
      let lastSolid = y;
      while (y < gh - marginY) {
        if (wallMask[y * gw + x]) {
          lastSolid = y;
          gap = 0;
        } else {
          gap++;
          if (gap > maxBridgeGap) break;
        }
        y++;
      }
      const runLen = lastSolid - start + 1;
      if (runLen >= minRunCells) {
        let merged = false;
        for (let i = vertStrips.length - 1; i >= 0; i--) {
          const st = vertStrips[i];
          if (st.crossMax < x - 1) break;
          if (st.crossMax - st.crossMin + 1 >= maxThickCells) continue;
          const overlap = Math.min(st.end, lastSolid) - Math.max(st.start, start) + 1;
          const minH = Math.min(st.end - st.start + 1, runLen);
          if (overlap >= minH * 0.65 && Math.abs(st.start - start) <= 4 && Math.abs(st.end - lastSolid) <= 4) {
            st.start = Math.min(st.start, start);
            st.end = Math.max(st.end, lastSolid);
            st.crossMax = x;
            merged = true;
            break;
          }
        }
        if (!merged) {
          vertStrips.push({ start, end: lastSolid, crossMin: x, crossMax: x });
        }
      }
    }
  }

  // Filter out overly thin dimension lines (1 cell thick with very long span right near borders)
  // AND filter out giant solid rectangles (e.g. cartiglio/title blocks where thickness > maxThickCells * 0.9 and aspect < 2.2)
  const filterStrips = (strips: RawStrip[], axisMax: number): RawStrip[] => {
    const kept: RawStrip[] = [];
    for (const s of strips) {
      const len = s.end - s.start + 1;
      const thick = s.crossMax - s.crossMin + 1;
      // Ignore full-page frame borders (> 88% of sheet width/height)
      if (len > axisMax * 0.88 && thick <= 3) continue;
      // Ignore boxy filled furniture/stamps that aren't elongated walls
      if (thick > 5 && len / thick < 2.1) continue;
      kept.push(s);
    }

    // Merge collinear strips separated by tiny gaps (<= 2 cells) on the same alignment
    kept.sort((a, b) => a.crossMin - b.crossMin || a.start - b.start);
    const merged: RawStrip[] = [];
    for (const s of kept) {
      const sMid = (s.crossMin + s.crossMax) * 0.5;
      let joined = false;
      for (let i = merged.length - 1; i >= 0; i--) {
        const m = merged[i];
        const mMid = (m.crossMin + m.crossMax) * 0.5;
        if (Math.abs(mMid - sMid) <= 2.2 && s.start <= m.end + 2 && s.end >= m.start - 2) {
          m.start = Math.min(m.start, s.start);
          m.end = Math.max(m.end, s.end);
          m.crossMin = Math.min(m.crossMin, s.crossMin);
          m.crossMax = Math.max(m.crossMax, s.crossMax);
          joined = true;
          break;
        }
      }
      if (!joined) merged.push({ ...s });
    }
    return merged;
  };

  const cleanH = filterStrips(horizStrips, gw);
  const cleanV = filterStrips(vertStrips, gh);

  // Deduplicate parallel double-lines of hollow CAD walls (two parallel lines 0.10–0.42m apart -> merge into one architectural wall)
  const collapseDoubleWalls = (strips: RawStrip[], crossCellM: number): RawStrip[] => {
    const maxHollowDistCells = Math.max(2, Math.round(0.42 / Math.max(0.02, crossCellM)));
    const sorted = [...strips].sort((a, b) => a.crossMin - b.crossMin || a.start - b.start);
    const used = new Array<boolean>(sorted.length).fill(false);
    const result: RawStrip[] = [];

    for (let i = 0; i < sorted.length; i++) {
      if (used[i]) continue;
      const a = { ...sorted[i] };
      used[i] = true;
      for (let j = i + 1; j < sorted.length; j++) {
        if (used[j]) continue;
        const b = sorted[j];
        const gap = b.crossMin - a.crossMax;
        if (gap > maxHollowDistCells) break;
        if (gap < 0) continue;
        const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
        const minLen = Math.min(a.end - a.start, b.end - b.start);
        if (minLen > 0 && overlap >= minLen * 0.7) {
          a.start = Math.min(a.start, b.start);
          a.end = Math.max(a.end, b.end);
          a.crossMax = Math.max(a.crossMax, b.crossMax);
          used[j] = true;
          break;
        }
      }
      result.push(a);
    }
    return result;
  };

  const finalH = collapseDoubleWalls(cleanH, cellH_M);
  const finalV = collapseDoubleWalls(cleanV, cellW_M);

  // Room tokens in meters for automatic wall labeling
  const roomMarkers = tokens
    .filter((t) => t.kind === 'room')
    .map((t) => ({
      name: t.str,
      xM: t.cx * metersPerPt,
      yM: t.cy * metersPerPt,
    }));

  const findNearestRoom = (cxM: number, cyM: number): string | undefined => {
    let bestName: string | undefined;
    let bestDist = 3.8; // within 3.8 meters
    for (const r of roomMarkers) {
      const d = Math.hypot(r.xM - cxM, r.yM - cyM);
      if (d < bestDist) {
        bestDist = d;
        bestName = r.name;
      }
    }
    return bestName;
  };

  // Convert strips to ExtractedWall3D in real meters
  const allWalls: ExtractedWall3D[] = [];
  const clampThickness = (rawM: number) => Math.max(0.11, Math.min(0.45, Math.round(rawM * 100) / 100));

  for (const s of finalH) {
    const x1M = s.start * cellW_M;
    const x2M = (s.end + 1) * cellW_M;
    const cyM = ((s.crossMin + s.crossMax + 1) * 0.5) * cellH_M;
    const lengthM = Math.round((x2M - x1M) * 100) / 100;
    if (lengthM < 0.4) continue;
    const thicknessM = clampThickness((s.crossMax - s.crossMin + 1) * cellH_M);
    const cxM = (x1M + x2M) * 0.5;
    const roomName = findNearestRoom(cxM, cyM);
    allWalls.push({
      id: `w3d_h_${allWalls.length + 1}`,
      label: '',
      x1M,
      y1M: cyM,
      x2M,
      y2M: cyM,
      cxM,
      cyM,
      lengthM,
      thicknessM,
      orientation: 'H',
      roomName,
    });
  }

  for (const s of finalV) {
    const y1M = s.start * cellH_M;
    const y2M = (s.end + 1) * cellH_M;
    const cxM = ((s.crossMin + s.crossMax + 1) * 0.5) * cellW_M;
    const lengthM = Math.round((y2M - y1M) * 100) / 100;
    if (lengthM < 0.4) continue;
    const thicknessM = clampThickness((s.crossMax - s.crossMin + 1) * cellW_M);
    const cyM = (y1M + y2M) * 0.5;
    const roomName = findNearestRoom(cxM, cyM);
    allWalls.push({
      id: `w3d_v_${allWalls.length + 1}`,
      label: '',
      x1M: cxM,
      y1M,
      x2M: cxM,
      y2M,
      cxM,
      cyM,
      lengthM,
      thicknessM,
      orientation: 'V',
      roomName,
    });
  }

  // Cap at top 240 architectural walls (by length) to keep WebGL silky-smooth on dense CAD sheets
  allWalls.sort((a, b) => b.lengthM - a.lengthM);
  const capped = allWalls.slice(0, 240);

  // Assign crisp sequential labels (e.g., "Parete Cucina #1" or "Parete #1 (Orizz.)")
  const roomCounters = new Map<string, number>();
  let genericIdx = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let totalLengthM = 0;

  for (const w of capped) {
    if (w.roomName) {
      const cnt = (roomCounters.get(w.roomName) || 0) + 1;
      roomCounters.set(w.roomName, cnt);
      w.label = `Parete ${w.roomName} #${cnt}`;
    } else {
      genericIdx++;
      w.label = `Parete #${genericIdx} (${w.orientation === 'H' ? 'Orizz.' : 'Vert.'})`;
    }
    minX = Math.min(minX, w.x1M, w.x2M);
    maxX = Math.max(maxX, w.x1M, w.x2M);
    minY = Math.min(minY, w.y1M, w.y2M);
    maxY = Math.max(maxY, w.y1M, w.y2M);
    totalLengthM += w.lengthM;
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = planWidthM;
    minY = 0;
    maxY = planHeightM;
  }

  return {
    walls: capped,
    planWidthM,
    planHeightM,
    totalLengthM: Math.round(totalLengthM * 100) / 100,
    wallCount: capped.length,
    boundsM: { minX, maxX, minY, maxY },
  };
}
