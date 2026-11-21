import { PlanToken } from './pdfPlanExtractor';
import { extractCanvasLumaGrid, PlanLumaGrid } from './planLaserRaycaster';

export interface SignificantQuoteItem {
  id: string;
  text: string;
  kind: 'dimension' | 'room' | 'surface';
  orientation: 'horizontal' | 'vertical';
  /** Coordinates in PDF points */
  xPt: number;
  yPt: number;
  /** Coordinates in real meters */
  xM: number;
  yM: number;
  numericValue?: number;
}

export interface CleanedPlanResult {
  cleanCanvas: HTMLCanvasElement;
  cleanGrid: PlanLumaGrid;
  significantQuotes: SignificantQuoteItem[];
  erasedTextCount: number;
  erasedDimLinesCount: number;
}

/**
 * Lightweight extraction of significant quotes, room labels, and surfaces for the
 * dedicated toggleable CAD/BIM "Quote & Misure" layer — without erasing any pixels.
 */
export function extractSignificantQuotes(
  tokens: PlanToken[],
  metersPerPt: number
): SignificantQuoteItem[] {
  const significantQuotes: SignificantQuoteItem[] = [];
  const seenKeys = new Set<string>();

  for (const t of tokens) {
    if (t.kind === 'dimension' && typeof t.numericValue === 'number' && t.numericValue >= 0.4 && t.numericValue <= 60) {
      const key = `d_${Math.round(t.cx / 18)}_${Math.round(t.cy / 18)}_${t.numericValue.toFixed(2)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      significantQuotes.push({
        id: `sq_${t.id}`,
        text: `${t.numericValue.toFixed(2)} m`,
        kind: 'dimension',
        orientation: t.orientation === 'vertical' ? 'vertical' : 'horizontal',
        xPt: t.cx,
        yPt: t.cy,
        xM: t.cx * metersPerPt,
        yM: t.cy * metersPerPt,
        numericValue: t.numericValue,
      });
    } else if (t.kind === 'room' && t.str.trim().length >= 2) {
      const key = `r_${t.str.trim().toLowerCase()}_${Math.round(t.cx / 35)}_${Math.round(t.cy / 35)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      significantQuotes.push({
        id: `sq_${t.id}`,
        text: t.str.trim(),
        kind: 'room',
        orientation: 'horizontal',
        xPt: t.cx,
        yPt: t.cy,
        xM: t.cx * metersPerPt,
        yM: t.cy * metersPerPt,
      });
    } else if (t.kind === 'surface' && typeof t.numericValue === 'number' && t.numericValue >= 0.5) {
      significantQuotes.push({
        id: `sq_${t.id}`,
        text: `${t.numericValue.toFixed(2)} m²`,
        kind: 'surface',
        orientation: 'horizontal',
        xPt: t.cx,
        yPt: t.cy,
        xM: t.cx * metersPerPt,
        yM: t.cy * metersPerPt,
        numericValue: t.numericValue,
      });
    }
  }

  return significantQuotes;
}

/**
 * Strips all detected text labels, quote numbers, thin dimension lines, witness ticks,
 * and exterior quote chains from a copy of the rendered PDF canvas, keeping ONLY the
 * clean architectural geometry (walls, openings, pillars) in memory for 2D-clean / 3D / BIM.
 *
 * Also extracts the most significant quotes & room names into `significantQuotes`
 * so they can be rendered on a dedicated toggleable CAD/BIM Layer ("Quote & Misure").
 */
export function buildCleanedArchitecturalPlan(
  sourceCanvas: HTMLCanvasElement,
  sourceGrid: PlanLumaGrid,
  tokens: PlanToken[],
  metersPerPt: number
): CleanedPlanResult | null {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (width <= 4 || height <= 4 || sourceGrid.pageWidthPt <= 0 || sourceGrid.pageHeightPt <= 0) {
    return null;
  }

  const cleanCanvas = document.createElement('canvas');
  cleanCanvas.width = width;
  cleanCanvas.height = height;
  const ctx = cleanCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(sourceCanvas, 0, 0);

  const scaleX = width / sourceGrid.pageWidthPt;
  const scaleY = height / sourceGrid.pageHeightPt;
  const mPerPxX = metersPerPt / scaleX;
  const mPerPxY = metersPerPt / scaleY;
  const avgMPerPx = (mPerPxX + mPerPxY) * 0.5;

  // Dimension lines in CAD plans are thin strokes (< ~6.5 cm real equivalent, typically 1-4 px)
  // Real walls are either >= 8-10cm solid OR paired double lines.
  const maxDimLineThickPx = Math.max(2, Math.min(6, Math.round(0.065 / Math.max(0.002, avgMPerPx))));

  // --- PASS 1: Erase all detected text / quote bounding boxes with clean padding ---
  let erasedTextCount = 0;
  ctx.fillStyle = '#ffffff';
  for (const tok of tokens) {
    const bwPt = tok.bbox.x2 - tok.bbox.x1;
    const bhPt = tok.bbox.y2 - tok.bbox.y1;
    if (bwPt <= 0 || bhPt <= 0) continue;
    if (bwPt > sourceGrid.pageWidthPt * 0.35 || bhPt > sourceGrid.pageHeightPt * 0.35) continue;

    const padPt = tok.kind === 'dimension' ? 3.2 : 2.2;
    const rx = Math.max(0, Math.floor((tok.bbox.x1 - padPt) * scaleX));
    const ry = Math.max(0, Math.floor((tok.bbox.y1 - padPt) * scaleY));
    const rw = Math.min(width - rx, Math.ceil((bwPt + padPt * 2) * scaleX));
    const rh = Math.min(height - ry, Math.ceil((bhPt + padPt * 2) * scaleY));
    if (rw > 0 && rh > 0) {
      ctx.fillRect(rx, ry, rw, rh);
      erasedTextCount++;
    }
  }

  // Grab pixel buffer after text erasure to surgically erase thin dimension lines & witness ticks
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const luma = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    luma[i] = data[p + 3] < 32 ? 255 : (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }

  const isDark = (x: number, y: number, thresh = 195): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return luma[y * width + x] < thresh;
  };

  const erasePx = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    luma[idx] = 255;
    const p = idx * 4;
    data[p] = 255;
    data[p + 1] = 255;
    data[p + 2] = 255;
    data[p + 3] = 255;
  };

  // Measure vertical stroke thickness at (x, y)
  const measureVertThick = (x: number, y: number): { top: number; bottom: number; thick: number } => {
    let top = y;
    let bottom = y;
    while (top > 0 && y - top <= maxDimLineThickPx + 2 && isDark(x, top - 1)) top--;
    while (bottom < height - 1 && bottom - y <= maxDimLineThickPx + 2 && isDark(x, bottom + 1)) bottom++;
    return { top, bottom, thick: bottom - top + 1 };
  };

  // Measure horizontal stroke thickness at (x, y)
  const measureHorizThick = (x: number, y: number): { left: number; right: number; thick: number } => {
    let left = x;
    let right = x;
    while (left > 0 && x - left <= maxDimLineThickPx + 2 && isDark(left - 1, y)) left--;
    while (right < width - 1 && right - x <= maxDimLineThickPx + 2 && isDark(right + 1, y)) right++;
    return { left, right, thick: right - left + 1 };
  };

  // Check if a horizontal thin line at row `y` is part of a hollow double-line architectural wall
  // (i.e. has another parallel line 0.09m–0.44m away across most of its length)
  const isPartOfParallelWallH = (xStart: number, xEnd: number, yMid: number): boolean => {
    const minOff = Math.max(maxDimLineThickPx + 2, Math.round(0.085 / Math.max(0.002, mPerPxY)));
    const maxOff = Math.min(80, Math.round(0.45 / Math.max(0.002, mPerPxY)));
    const len = xEnd - xStart;
    if (len < 16) return false;
    const samples = 7;
    for (const sign of [-1, 1]) {
      for (let off = minOff; off <= maxOff; off += 2) {
        const py = yMid + sign * off;
        if (py < 2 || py >= height - 2) continue;
        let hits = 0;
        for (let s = 1; s <= samples; s++) {
          const sx = Math.round(xStart + (len * s) / (samples + 1));
          if (isDark(sx, py, 175) || isDark(sx, py - 1, 175) || isDark(sx, py + 1, 175)) {
            hits++;
          }
        }
        if (hits >= 5) return true;
      }
    }
    return false;
  };

  const isPartOfParallelWallV = (yStart: number, yEnd: number, xMid: number): boolean => {
    const minOff = Math.max(maxDimLineThickPx + 2, Math.round(0.085 / Math.max(0.002, mPerPxX)));
    const maxOff = Math.min(80, Math.round(0.45 / Math.max(0.002, mPerPxX)));
    const len = yEnd - yStart;
    if (len < 16) return false;
    const samples = 7;
    for (const sign of [-1, 1]) {
      for (let off = minOff; off <= maxOff; off += 2) {
        const px = xMid + sign * off;
        if (px < 2 || px >= width - 2) continue;
        let hits = 0;
        for (let s = 1; s <= samples; s++) {
          const sy = Math.round(yStart + (len * s) / (samples + 1));
          if (isDark(px, sy, 175) || isDark(px - 1, sy, 175) || isDark(px + 1, sy, 175)) {
            hits++;
          }
        }
        if (hits >= 5) return true;
      }
    }
    return false;
  };

  // Trace & erase a thin horizontal dimension line passing near (seedX, seedY)
  let erasedDimLinesCount = 0;
  const traceAndEraseHorizDimLine = (seedX: number, seedY: number, maxReachPx: number) => {
    const init = measureVertThick(seedX, seedY);
    if (init.thick > maxDimLineThickPx) return;
    const midY = Math.round((init.top + init.bottom) * 0.5);

    // Trace left & right allowing small gaps (where text was just erased or ticks cross)
    const maxGap = Math.max(18, Math.round(42 * scaleX));
    let xL = seedX;
    let gap = 0;
    let lastDarkL = seedX;
    while (xL > 1 && seedX - xL < maxReachPx) {
      xL--;
      let hit = false;
      for (let dy = -1; dy <= 1; dy++) {
        if (isDark(xL, midY + dy)) {
          const mt = measureVertThick(xL, midY + dy);
          if (mt.thick <= maxDimLineThickPx + 1) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        lastDarkL = xL;
        gap = 0;
      } else {
        gap++;
        if (gap > maxGap) break;
      }
    }

    let xR = seedX;
    gap = 0;
    let lastDarkR = seedX;
    while (xR < width - 2 && xR - seedX < maxReachPx) {
      xR++;
      let hit = false;
      for (let dy = -1; dy <= 1; dy++) {
        if (isDark(xR, midY + dy)) {
          const mt = measureVertThick(xR, midY + dy);
          if (mt.thick <= maxDimLineThickPx + 1) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        lastDarkR = xR;
        gap = 0;
      } else {
        gap++;
        if (gap > maxGap) break;
      }
    }

    const spanPx = lastDarkR - lastDarkL;
    if (spanPx < 10) return;

    // Never erase if it's clearly one face of a double-line hollow masonry wall
    if (isPartOfParallelWallH(lastDarkL, lastDarkR, midY)) return;

    // Erase the thin horizontal dimension line + any small slash/tick marks on it
    const tickRadius = Math.max(4, Math.round(7 * scaleY));
    for (let x = lastDarkL; x <= lastDarkR; x++) {
      const mt = measureVertThick(x, midY);
      if (mt.thick <= maxDimLineThickPx + 1) {
        for (let y = mt.top - 1; y <= mt.bottom + 1; y++) {
          erasePx(x, y);
        }
      } else if (mt.thick <= tickRadius * 2 + 2) {
        // Erase short witness tick / 45° architectural slash at endpoints or junctions
        let tickHorizW = 0;
        for (let dx = -3; dx <= 3; dx++) {
          if (isDark(x + dx, mt.top) || isDark(x + dx, mt.bottom)) tickHorizW++;
        }
        if (tickHorizW <= 5) {
          for (let y = mt.top; y <= mt.bottom; y++) {
            erasePx(x, y);
          }
        }
      }
    }
    erasedDimLinesCount++;
  };

  const traceAndEraseVertDimLine = (seedX: number, seedY: number, maxReachPx: number) => {
    const init = measureHorizThick(seedX, seedY);
    if (init.thick > maxDimLineThickPx) return;
    const midX = Math.round((init.left + init.right) * 0.5);

    const maxGap = Math.max(18, Math.round(42 * scaleY));
    let yT = seedY;
    let gap = 0;
    let lastDarkT = seedY;
    while (yT > 1 && seedY - yT < maxReachPx) {
      yT--;
      let hit = false;
      for (let dx = -1; dx <= 1; dx++) {
        if (isDark(midX + dx, yT)) {
          const mt = measureHorizThick(midX + dx, yT);
          if (mt.thick <= maxDimLineThickPx + 1) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        lastDarkT = yT;
        gap = 0;
      } else {
        gap++;
        if (gap > maxGap) break;
      }
    }

    let yB = seedY;
    gap = 0;
    let lastDarkB = seedY;
    while (yB < height - 2 && yB - seedY < maxReachPx) {
      yB++;
      let hit = false;
      for (let dx = -1; dx <= 1; dx++) {
        if (isDark(midX + dx, yB)) {
          const mt = measureHorizThick(midX + dx, yB);
          if (mt.thick <= maxDimLineThickPx + 1) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        lastDarkB = yB;
        gap = 0;
      } else {
        gap++;
        if (gap > maxGap) break;
      }
    }

    const spanPx = lastDarkB - lastDarkT;
    if (spanPx < 10) return;
    if (isPartOfParallelWallV(lastDarkT, lastDarkB, midX)) return;

    const tickRadius = Math.max(4, Math.round(7 * scaleX));
    for (let y = lastDarkT; y <= lastDarkB; y++) {
      const mt = measureHorizThick(midX, y);
      if (mt.thick <= maxDimLineThickPx + 1) {
        for (let x = mt.left - 1; x <= mt.right + 1; x++) {
          erasePx(x, y);
        }
      } else if (mt.thick <= tickRadius * 2 + 2) {
        let tickVertH = 0;
        for (let dy = -3; dy <= 3; dy++) {
          if (isDark(mt.left, y + dy) || isDark(mt.right, y + dy)) tickVertH++;
        }
        if (tickVertH <= 5) {
          for (let x = mt.left; x <= mt.right; x++) {
            erasePx(x, y);
          }
        }
      }
    }
    erasedDimLinesCount++;
  };

  // --- PASS 2: Around every detected dimension quote, locate & erase its associated thin dimension line ---
  const dimTokens = tokens.filter((t) => t.kind === 'dimension');
  const searchRadiusPt = 24;

  for (const tok of dimTokens) {
    const cxPx = Math.round(tok.cx * scaleX);
    const cyPx = Math.round(tok.cy * scaleY);
    const maxReach = Math.round(
      Math.max(
        width * 0.45,
        (tok.numericValue && metersPerPt > 0 ? (tok.numericValue / metersPerPt) * 1.25 : 180) *
          (tok.orientation === 'vertical' ? scaleY : scaleX)
      )
    );

    if (tok.orientation === 'vertical') {
      const radPx = Math.round(searchRadiusPt * scaleX);
      const probeYOffsets = [0, -Math.round((tok.h * 0.6 + 6) * scaleY), Math.round((tok.h * 0.6 + 6) * scaleY)];
      for (const pyOff of probeYOffsets) {
        const py = cyPx + pyOff;
        if (py < 2 || py >= height - 2) continue;
        for (let dx = -radPx; dx <= radPx; dx++) {
          const px = cxPx + dx;
          if (px < 2 || px >= width - 2) continue;
          if (isDark(px, py)) {
            const mt = measureHorizThick(px, py);
            if (mt.thick <= maxDimLineThickPx) {
              traceAndEraseVertDimLine(px, py, maxReach);
            }
          }
        }
      }
    } else {
      // Horizontal (or default) dimension quote
      const radPx = Math.round(searchRadiusPt * scaleY);
      const probeXOffsets = [0, -Math.round((tok.w * 0.6 + 6) * scaleX), Math.round((tok.w * 0.6 + 6) * scaleX)];
      for (const pxOff of probeXOffsets) {
        const px = cxPx + pxOff;
        if (px < 2 || px >= width - 2) continue;
        for (let dy = -radPx; dy <= radPx; dy++) {
          const py = cyPx + dy;
          if (py < 2 || py >= height - 2) continue;
          if (isDark(px, py)) {
            const mt = measureVertThick(px, py);
            if (mt.thick <= maxDimLineThickPx) {
              traceAndEraseHorizDimLine(px, py, maxReach);
            }
          }
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const cleanGrid = extractCanvasLumaGrid(cleanCanvas, sourceGrid.pageWidthPt, sourceGrid.pageHeightPt);
  if (!cleanGrid) return null;

  // --- PASS 3: Curate most significant quotes & room names for the dedicated toggleable Layer ---
  const significantQuotes: SignificantQuoteItem[] = [];
  const seenKeys = new Set<string>();

  for (const t of tokens) {
    if (t.kind === 'dimension' && typeof t.numericValue === 'number' && t.numericValue >= 0.4 && t.numericValue <= 60) {
      const key = `d_${Math.round(t.cx / 18)}_${Math.round(t.cy / 18)}_${t.numericValue.toFixed(2)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      significantQuotes.push({
        id: `sq_${t.id}`,
        text: `${t.numericValue.toFixed(2)} m`,
        kind: 'dimension',
        orientation: t.orientation === 'vertical' ? 'vertical' : 'horizontal',
        xPt: t.cx,
        yPt: t.cy,
        xM: t.cx * metersPerPt,
        yM: t.cy * metersPerPt,
        numericValue: t.numericValue,
      });
    } else if (t.kind === 'room' && t.str.trim().length >= 2) {
      const key = `r_${t.str.trim().toLowerCase()}_${Math.round(t.cx / 35)}_${Math.round(t.cy / 35)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      significantQuotes.push({
        id: `sq_${t.id}`,
        text: t.str.trim(),
        kind: 'room',
        orientation: 'horizontal',
        xPt: t.cx,
        yPt: t.cy,
        xM: t.cx * metersPerPt,
        yM: t.cy * metersPerPt,
      });
    } else if (t.kind === 'surface' && typeof t.numericValue === 'number' && t.numericValue >= 0.5) {
      significantQuotes.push({
        id: `sq_${t.id}`,
        text: `${t.numericValue.toFixed(2)} m²`,
        kind: 'surface',
        orientation: 'horizontal',
        xPt: t.cx,
        yPt: t.cy,
        xM: t.cx * metersPerPt,
        yM: t.cy * metersPerPt,
        numericValue: t.numericValue,
      });
    }
  }

  return {
    cleanCanvas,
    cleanGrid,
    significantQuotes,
    erasedTextCount,
    erasedDimLinesCount,
  };
}

export type WallsOnlyFilterStrength = 'soft' | 'standard' | 'strong';

/**
 * Morphological "Walls-Only" filter for the 2D Pulito workspace.
 * Removes light hatches, furniture outlines, thin dimension ticks, door-swing arcs,
 * and isolated dust specks while preserving solid architectural walls, double-line walls,
 * and structural pillars so 3D and BIM extraction becomes razor-clean.
 */
export function buildWallsOnlyFilterCanvas(
  sourceCanvas: HTMLCanvasElement,
  pageWidthPt: number,
  pageHeightPt: number,
  metersPerPt: number,
  strength: WallsOnlyFilterStrength = 'standard'
): { canvas: HTMLCanvasElement; grid: PlanLumaGrid } | null {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (width <= 4 || height <= 4 || pageWidthPt <= 0 || pageHeightPt <= 0) return null;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(sourceCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const total = width * height;

  // 1. Threshold grayscale intensity (discards pale hatches, grid lines, and colored notes)
  const lumaThresh = strength === 'soft' ? 190 : strength === 'standard' ? 158 : 128;
  const mask = new Uint8Array(total);
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const a = data[p + 3];
    if (a < 40) continue;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const lum = (r * 77 + g * 150 + b * 29) >> 8;
    // Discard strongly saturated light markup colors (e.g. cyan/amber/green/red thin annotations)
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC - minC;
    if (sat > 55 && lum > 85) continue;
    if (lum < lumaThresh) mask[i] = 1;
  }

  // 2. Measure minimum structural span in pixels (~5cm–8cm depending on strength)
  const scaleX = width / pageWidthPt;
  const scaleY = height / pageHeightPt;
  const avgMPerPx = (metersPerPt / scaleX + metersPerPt / scaleY) * 0.5;
  const minRunPx =
    strength === 'soft'
      ? Math.max(2, Math.round(0.035 / Math.max(0.002, avgMPerPx)))
      : strength === 'standard'
      ? Math.max(2, Math.round(0.055 / Math.max(0.002, avgMPerPx)))
      : Math.max(3, Math.round(0.085 / Math.max(0.002, avgMPerPx)));

  // Keep pixels that either belong to:
  // (a) thick solid strokes (>= minRunPx in both directions or strong local density), OR
  // (b) long continuous straight architectural lines (double-line hollow walls, >= ~0.42m continuous)
  const minLongWallPx = Math.max(18, Math.round((strength === 'strong' ? 0.55 : 0.38) / Math.max(0.002, avgMPerPx)));
  const keep = new Uint8Array(total);

  // Pass A: Thick solid regions (fast 2D morphological check via neighbor density)
  const rad = strength === 'soft' ? 1 : strength === 'standard' ? 1 : 2;
  const minNeighbors = strength === 'soft' ? 4 : strength === 'standard' ? 6 : 13;
  for (let y = rad; y < height - rad; y++) {
    const rowOff = y * width;
    for (let x = rad; x < width - rad; x++) {
      if (!mask[rowOff + x]) continue;
      let cnt = 0;
      for (let dy = -rad; dy <= rad; dy++) {
        const rOff = (y + dy) * width;
        for (let dx = -rad; dx <= rad; dx++) {
          if (mask[rOff + x + dx]) cnt++;
        }
      }
      if (cnt >= minNeighbors) {
        keep[rowOff + x] = 1;
      }
    }
  }

  // Pass B: Preserve long straight horizontal/vertical wall outlines (hollow double-line walls)
  // Horizontal runs
  for (let y = 1; y < height - 1; y++) {
    const rowOff = y * width;
    let x = 0;
    while (x < width) {
      if (!mask[rowOff + x]) {
        x++;
        continue;
      }
      const start = x;
      let gap = 0;
      let lastDark = x;
      while (x < width) {
        if (mask[rowOff + x] || mask[rowOff - width + x] || mask[rowOff + width + x]) {
          lastDark = x;
          gap = 0;
        } else {
          gap++;
          if (gap > 2) break;
        }
        x++;
      }
      if (lastDark - start + 1 >= minLongWallPx) {
        for (let k = start; k <= lastDark; k++) {
          if (mask[rowOff + k]) keep[rowOff + k] = 1;
        }
      }
    }
  }

  // Vertical runs
  for (let x = 1; x < width - 1; x++) {
    let y = 0;
    while (y < height) {
      if (!mask[y * width + x]) {
        y++;
        continue;
      }
      const start = y;
      let gap = 0;
      let lastDark = y;
      while (y < height) {
        const idx = y * width + x;
        if (mask[idx] || mask[idx - 1] || mask[idx + 1]) {
          lastDark = y;
          gap = 0;
        } else {
          gap++;
          if (gap > 2) break;
        }
        y++;
      }
      if (lastDark - start + 1 >= minLongWallPx) {
        for (let k = start; k <= lastDark; k++) {
          const idx = k * width + x;
          if (mask[idx]) keep[idx] = 1;
        }
      }
    }
  }

  // Pass C: Despeckle tiny isolated fragments (< minRunPx * 3 pixels in small connected bursts)
  const finalMask = new Uint8Array(total);
  for (let y = 1; y < height - 1; y++) {
    const rowOff = y * width;
    for (let x = 1; x < width - 1; x++) {
      if (!keep[rowOff + x]) continue;
      let nb = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const rOff = (y + dy) * width;
        for (let dx = -1; dx <= 1; dx++) {
          if (keep[rOff + x + dx]) nb++;
        }
      }
      if (nb >= (strength === 'soft' ? 2 : 3)) {
        finalMask[rowOff + x] = 1;
      }
    }
  }

  // Render crisp high-contrast architectural walls onto clean white paper
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    if (finalMask[i]) {
      data[p] = 24;
      data[p + 1] = 28;
      data[p + 2] = 36;
      data[p + 3] = 255;
    } else {
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const grid = extractCanvasLumaGrid(outCanvas, pageWidthPt, pageHeightPt);
  if (!grid) return null;
  return { canvas: outCanvas, grid };
}

