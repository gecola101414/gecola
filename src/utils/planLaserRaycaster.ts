import { PlanBBox } from './pdfPlanExtractor';

export type LaserSensitivity = 'thin' | 'medium' | 'thick';
export type LaserMode = 'single' | 'dual' | 'cross' | 'area';

export interface PlanLumaGrid {
  width: number;
  height: number;
  luma: Uint8Array;
  pageWidthPt: number;
  pageHeightPt: number;
}

export interface LaserPoint {
  x: number;
  y: number;
}

export interface LaserRayHit {
  hitPt: LaserPoint;
  hitWall: boolean;
  distPt: number;
}

export interface VirtualLaserShot {
  mode: 'single' | 'dual';
  p1: LaserPoint;
  p2: LaserPoint;
  emitter: LaserPoint;
  hitWall1: boolean;
  hitWall2: boolean;
  d1Pt: number;
  d2Pt: number;
  distPt: number;
  angleDeg: number;
}

export interface VirtualLaserCrossShot {
  emitter: LaserPoint;
  pLeft: LaserPoint;
  pRight: LaserPoint;
  pTop: LaserPoint;
  pBottom: LaserPoint;
  hitWallLeft: boolean;
  hitWallRight: boolean;
  hitWallTop: boolean;
  hitWallBottom: boolean;
  dLeftPt: number;
  dRightPt: number;
  dTopPt: number;
  dBottomPt: number;
  spanXPt: number;
  spanYPt: number;
  areaPt2: number;
}

export interface VirtualLaserAreaResult {
  origin: LaserPoint;
  cursor: LaserPoint;
  centroid: LaserPoint;
  svgFillPath: string;
  svgBorderPath: string;
  scanRays: Array<{ from: LaserPoint; to: LaserPoint; hitWall: boolean }>;
  areaPt2: number;
  perimPt: number;
  enclosed: boolean;
  cellCount: number;
}

export interface LaserPixelRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Extracts a compact 1-byte-per-pixel grayscale luminance map from the rendered PDF canvas.
 * Cached per render/zoom so real-time mousemove raycasting runs at 60 FPS with zero getImageData overhead.
 */
export function extractCanvasLumaGrid(
  canvas: HTMLCanvasElement,
  pageWidthPt: number,
  pageHeightPt: number
): PlanLumaGrid | null {
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 2 || height <= 2 || pageWidthPt <= 0 || pageHeightPt <= 0) return null;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const total = width * height;
    const luma = new Uint8Array(total);
    for (let i = 0, p = 0; i < total; i++, p += 4) {
      const a = data[p + 3];
      if (a < 32) {
        luma[i] = 255;
      } else {
        // Fast integer approximation of Rec. 601 luminance
        luma[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
      }
    }
    return { width, height, luma, pageWidthPt, pageHeightPt };
  } catch {
    return null;
  }
}

function getSensitivityParams(sensitivity: LaserSensitivity): {
  threshold: number;
  minConsecutiveSteps: number;
  usePerpProbe: boolean;
} {
  if (sensitivity === 'thin') {
    return { threshold: 200, minConsecutiveSteps: 2, usePerpProbe: true };
  }
  if (sensitivity === 'thick') {
    return { threshold: 118, minConsecutiveSteps: 5, usePerpProbe: false };
  }
  // 'medium' — balanced for architectural CAD & scanned floor plans
  return { threshold: 158, minConsecutiveSteps: 3, usePerpProbe: true };
}

export function buildLaserIgnoreRects(grid: PlanLumaGrid, ignoreBboxes?: PlanBBox[]): LaserPixelRect[] {
  if (!ignoreBboxes || ignoreBboxes.length === 0) return [];
  const scaleX = grid.width / grid.pageWidthPt;
  const scaleY = grid.height / grid.pageHeightPt;
  const maxW = grid.width * 0.24;
  const maxH = grid.height * 0.24;
  const out: LaserPixelRect[] = [];
  for (const b of ignoreBboxes) {
    const x1 = b.x1 * scaleX - 1;
    const y1 = b.y1 * scaleY - 1;
    const x2 = b.x2 * scaleX + 1;
    const y2 = b.y2 * scaleY + 1;
    const w = x2 - x1;
    const h = y2 - y1;
    if (w > 1 && h > 1 && w < maxW && h < maxH) {
      out.push({ x1, y1, x2, y2 });
    }
  }
  return out;
}

function isInsideIgnoredRect(px: number, py: number, rects: LaserPixelRect[]): boolean {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (px >= r.x1 && px <= r.x2 && py >= r.y1 && py <= r.y2) {
      return true;
    }
  }
  return false;
}

/**
 * Casts a single virtual laser ray from `originPt` along unit direction `(dirX, dirY)`
 * and stops automatically at the leading edge of the first detected wall.
 */
export function castSingleLaserRay(
  grid: PlanLumaGrid,
  originPt: LaserPoint,
  dirX: number,
  dirY: number,
  sensitivity: LaserSensitivity = 'medium',
  ignoreRects: LaserPixelRect[] = []
): LaserRayHit {
  const len = Math.hypot(dirX, dirY);
  if (len < 1e-6) {
    return { hitPt: originPt, hitWall: false, distPt: 0 };
  }
  const ux = dirX / len;
  const uy = dirY / len;

  const scaleX = grid.width / grid.pageWidthPt;
  const scaleY = grid.height / grid.pageHeightPt;

  const ox = originPt.x * scaleX;
  const oy = originPt.y * scaleY;

  // Direction in pixel space, normalized to 0.5 px step so even 1px thin walls are never skipped
  const rawVx = ux * scaleX;
  const rawVy = uy * scaleY;
  const vLen = Math.hypot(rawVx, rawVy);
  if (vLen < 1e-6) {
    return { hitPt: originPt, hitWall: false, distPt: 0 };
  }
  const stepPx = 0.5;
  const dx = (rawVx / vLen) * stepPx;
  const dy = (rawVy / vLen) * stepPx;
  const perpX = -rawVy / vLen;
  const perpY = rawVx / vLen;

  const { threshold, minConsecutiveSteps, usePerpProbe } = getSensitivityParams(sensitivity);
  const { width, height, luma } = grid;

  const sampleIsDark = (x: number, y: number): boolean => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) return false;
    if (ignoreRects.length > 0 && isInsideIgnoredRect(ix, iy, ignoreRects)) return false;

    const cLuma = luma[iy * width + ix];
    if (cLuma < threshold) return true;

    if (usePerpProbe) {
      const ix1 = Math.round(x + perpX);
      const iy1 = Math.round(y + perpY);
      const ix2 = Math.round(x - perpX);
      const iy2 = Math.round(y - perpY);
      const d1 =
        ix1 >= 0 &&
        ix1 < width &&
        iy1 >= 0 &&
        iy1 < height &&
        !(ignoreRects.length > 0 && isInsideIgnoredRect(ix1, iy1, ignoreRects)) &&
        luma[iy1 * width + ix1] < threshold - 12;
      const d2 =
        ix2 >= 0 &&
        ix2 < width &&
        iy2 >= 0 &&
        iy2 < height &&
        !(ignoreRects.length > 0 && isInsideIgnoredRect(ix2, iy2, ignoreRects)) &&
        luma[iy2 * width + ix2] < threshold - 12;
      if (d1 && d2) return true;
    }
    return false;
  };

  // Detect whether origin starts directly on/inside a wall (common with OSNAP on corners)
  const startedInDark =
    sampleIsDark(ox, oy) ||
    sampleIsDark(ox + dx * 2, oy + dy * 2) ||
    sampleIsDark(ox + dx * 4, oy + dy * 4);

  const maxSteps = Math.ceil(Math.hypot(width, height) / stepPx) + 4;
  const maxStartExitSteps = Math.min(64, Math.max(24, Math.round((scaleX * 14) / stepPx)));
  const openSpaceMinClearanceSteps = startedInDark ? 5 : 4;

  let armed = !startedInDark;
  let consecutiveLight = 0;
  let consecutiveDark = 0;
  let firstDarkX = ox;
  let firstDarkY = oy;

  let curX = ox;
  let curY = oy;
  let lastValidX = ox;
  let lastValidY = oy;

  for (let step = 1; step <= maxSteps; step++) {
    curX = ox + dx * step;
    curY = oy + dy * step;

    if (curX < 1 || curX >= width - 1 || curY < 1 || curY >= height - 1) {
      break;
    }
    lastValidX = curX;
    lastValidY = curY;

    const dark = sampleIsDark(curX, curY);

    if (!armed) {
      if (!dark) {
        consecutiveLight++;
        if (consecutiveLight >= openSpaceMinClearanceSteps) {
          armed = true;
        }
      } else {
        consecutiveLight = 0;
      }
      if (step >= maxStartExitSteps) {
        armed = true;
      }
      continue;
    }

    if (!startedInDark && step < openSpaceMinClearanceSteps) {
      continue;
    }

    if (dark) {
      if (consecutiveDark === 0) {
        firstDarkX = curX;
        firstDarkY = curY;
      }
      consecutiveDark++;
      if (consecutiveDark >= minConsecutiveSteps) {
        const hitPt: LaserPoint = {
          x: firstDarkX / scaleX,
          y: firstDarkY / scaleY,
        };
        return {
          hitPt,
          hitWall: true,
          distPt: Math.hypot(hitPt.x - originPt.x, hitPt.y - originPt.y),
        };
      }
    } else {
      consecutiveDark = 0;
    }
  }

  const edgePt: LaserPoint = {
    x: lastValidX / scaleX,
    y: lastValidY / scaleY,
  };
  return {
    hitPt: edgePt,
    hitWall: false,
    distPt: Math.hypot(edgePt.x - originPt.x, edgePt.y - originPt.y),
  };
}

/**
 * Computes a linear virtual laser shot from `originPt` oriented by `cursorPt`:
 * - 'single': fires 1 ray from `originPt` toward `cursorPt` until hitting the opposite wall.
 * - 'dual': fires 2 opposing rays from `originPt` (both along +dir and -dir, e.g. Left & Right or Up & Down)
 *   and automatically sums the two distances (d1 + d2 = wall-to-wall total).
 */
export function computeVirtualLaserShot(params: {
  grid: PlanLumaGrid;
  mode: 'single' | 'dual';
  originPt: LaserPoint | null;
  cursorPt: LaserPoint;
  orthoLock: boolean;
  sensitivity: LaserSensitivity;
  ignoreBboxes?: PlanBBox[];
  precomputedIgnoreRects?: LaserPixelRect[];
}): VirtualLaserShot | null {
  const { grid, mode, originPt, cursorPt, orthoLock, sensitivity, ignoreBboxes, precomputedIgnoreRects } = params;
  if (!originPt) return null;

  let vx = cursorPt.x - originPt.x;
  let vy = cursorPt.y - originPt.y;
  const cursorDist = Math.hypot(vx, vy);
  if (cursorDist < 1.5) return null;

  if (orthoLock) {
    if (Math.abs(vx) >= Math.abs(vy)) {
      vx = vx >= 0 ? 1 : -1;
      vy = 0;
    } else {
      vx = 0;
      vy = vy >= 0 ? 1 : -1;
    }
  } else {
    vx /= cursorDist;
    vy /= cursorDist;
  }

  const ignoreRects = precomputedIgnoreRects ?? buildLaserIgnoreRects(grid, ignoreBboxes);
  const angleDeg = Math.round(((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360);

  if (mode === 'dual') {
    const hitPos = castSingleLaserRay(grid, originPt, vx, vy, sensitivity, ignoreRects);
    const hitNeg = castSingleLaserRay(grid, originPt, -vx, -vy, sensitivity, ignoreRects);
    const d1Pt = hitNeg.distPt;
    const d2Pt = hitPos.distPt;
    return {
      mode: 'dual',
      p1: hitNeg.hitPt,
      p2: hitPos.hitPt,
      emitter: originPt,
      hitWall1: hitNeg.hitWall,
      hitWall2: hitPos.hitWall,
      d1Pt,
      d2Pt,
      distPt: d1Pt + d2Pt,
      angleDeg,
    };
  }

  // Single-beam mode: Origin -> Mouse Direction -> Wall Hit
  const rayHit = castSingleLaserRay(grid, originPt, vx, vy, sensitivity, ignoreRects);
  let finalHitPt = rayHit.hitPt;
  let finalDistPt = rayHit.distPt;
  if (!rayHit.hitWall) {
    const projDist = Math.max(1, (cursorPt.x - originPt.x) * vx + (cursorPt.y - originPt.y) * vy);
    finalHitPt = {
      x: originPt.x + vx * projDist,
      y: originPt.y + vy * projDist,
    };
    finalDistPt = projDist;
  }

  return {
    mode: 'single',
    p1: originPt,
    p2: finalHitPt,
    emitter: originPt,
    hitWall1: true,
    hitWall2: rayHit.hitWall,
    d1Pt: 0,
    d2Pt: finalDistPt,
    distPt: finalDistPt,
    angleDeg,
  };
}

/**
 * Computes a 4-way perpendicular Cross Laser shot ('cross') from `emitterPt`:
 * - Fires 2 opposing horizontal rays (Left + Right) to measure total room side 1 (spanXPt)
 * - Fires 2 opposing vertical rays (Up + Down) perpendicular to the first axis to measure total room side 2 (spanYPt)
 * Stays active in real time as the mouse moves, so clicking once transfers both Lunghezza and Larghezza into the measurement schedule.
 */
export function computeVirtualLaserCross(params: {
  grid: PlanLumaGrid;
  emitterPt: LaserPoint | null;
  sensitivity: LaserSensitivity;
  ignoreBboxes?: PlanBBox[];
  precomputedIgnoreRects?: LaserPixelRect[];
}): VirtualLaserCrossShot | null {
  const { grid, emitterPt, sensitivity, ignoreBboxes, precomputedIgnoreRects } = params;
  if (!emitterPt) return null;

  const ignoreRects = precomputedIgnoreRects ?? buildLaserIgnoreRects(grid, ignoreBboxes);

  const hitLeft = castSingleLaserRay(grid, emitterPt, -1, 0, sensitivity, ignoreRects);
  const hitRight = castSingleLaserRay(grid, emitterPt, 1, 0, sensitivity, ignoreRects);
  const hitTop = castSingleLaserRay(grid, emitterPt, 0, -1, sensitivity, ignoreRects);
  const hitBottom = castSingleLaserRay(grid, emitterPt, 0, 1, sensitivity, ignoreRects);

  const dLeftPt = hitLeft.distPt;
  const dRightPt = hitRight.distPt;
  const dTopPt = hitTop.distPt;
  const dBottomPt = hitBottom.distPt;

  const spanXPt = dLeftPt + dRightPt;
  const spanYPt = dTopPt + dBottomPt;

  if (spanXPt < 1 && spanYPt < 1) return null;

  return {
    emitter: emitterPt,
    pLeft: hitLeft.hitPt,
    pRight: hitRight.hitPt,
    pTop: hitTop.hitPt,
    pBottom: hitBottom.hitPt,
    hitWallLeft: hitLeft.hitWall,
    hitWallRight: hitRight.hitWall,
    hitWallTop: hitTop.hitWall,
    hitWallBottom: hitBottom.hitWall,
    dLeftPt,
    dRightPt,
    dTopPt,
    dBottomPt,
    spanXPt,
    spanYPt,
    areaPt2: spanXPt * spanYPt,
  };
}

/**
 * Helper: picks a robust wall boundary value from an array of ray hits while rejecting
 * narrow doorway outliers (rays that slipped through an open door far beyond the room wall).
 */
function pickRobustBoundary(values: number[], direction: 'min' | 'max', mustInclude: number): number {
  if (values.length === 0) return mustInclude;
  const sorted = [...values].sort((a, b) => a - b);
  if (direction === 'min') {
    // Low values are farther left/top; skip extreme 15% outlier rays if they leaked through a door
    const idx = sorted.length >= 5 ? Math.floor(sorted.length * 0.18) : 0;
    return Math.min(mustInclude, sorted[idx]);
  }
  const idx = sorted.length >= 5 ? Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.82) - 1) : sorted.length - 1;
  return Math.max(mustInclude, sorted[idx]);
}

/**
 * Laser 3 — Area Laser Scanner:
 * Starts at `originPt` and sweeps toward `cursorPt`, expanding a wall-bounded laser field
 * across the entire room/zone encountered between the two points (supporting rectangles,
 * L-shapes, niches, pillars, and preventing leaks through open doorways).
 */
export function computeVirtualLaserArea(params: {
  grid: PlanLumaGrid;
  originPt: LaserPoint;
  cursorPt: LaserPoint;
  sensitivity: LaserSensitivity;
  ignoreBboxes?: PlanBBox[];
  precomputedIgnoreRects?: LaserPixelRect[];
}): VirtualLaserAreaResult | null {
  const { grid, originPt, cursorPt, sensitivity, ignoreBboxes, precomputedIgnoreRects } = params;
  if (Math.hypot(cursorPt.x - originPt.x, cursorPt.y - originPt.y) < 2) return null;

  const scaleX = grid.width / grid.pageWidthPt;
  const scaleY = grid.height / grid.pageHeightPt;
  const ignoreRects = precomputedIgnoreRects ?? buildLaserIgnoreRects(grid, ignoreBboxes);
  const { threshold } = getSensitivityParams(sensitivity);
  const { width, height, luma } = grid;

  // 1. Cast a curtain of cardinal laser rays from evenly spaced points along origin -> cursor
  //    This simultaneously discovers the room's walls (including L-shape wings) and filters doorway leaks!
  const sampleCount = 9;
  const leftHits: number[] = [];
  const rightHits: number[] = [];
  const topHits: number[] = [];
  const bottomHits: number[] = [];
  const scanRays: Array<{ from: LaserPoint; to: LaserPoint; hitWall: boolean }> = [];

  for (let i = 0; i < sampleCount; i++) {
    const t = i / (sampleCount - 1);
    const sp: LaserPoint = {
      x: originPt.x + (cursorPt.x - originPt.x) * t,
      y: originPt.y + (cursorPt.y - originPt.y) * t,
    };

    const rL = castSingleLaserRay(grid, sp, -1, 0, sensitivity, ignoreRects);
    const rR = castSingleLaserRay(grid, sp, 1, 0, sensitivity, ignoreRects);
    const rU = castSingleLaserRay(grid, sp, 0, -1, sensitivity, ignoreRects);
    const rD = castSingleLaserRay(grid, sp, 0, 1, sensitivity, ignoreRects);

    if (rL.hitWall) leftHits.push(rL.hitPt.x);
    if (rR.hitWall) rightHits.push(rR.hitPt.x);
    if (rU.hitWall) topHits.push(rU.hitPt.y);
    if (rD.hitWall) bottomHits.push(rD.hitPt.y);

    // Keep visual laser scanner rays at start, midpoint, and end for clear optical feedback
    if (i === 0 || i === 4 || i === sampleCount - 1) {
      scanRays.push({ from: sp, to: rL.hitPt, hitWall: rL.hitWall });
      scanRays.push({ from: sp, to: rR.hitPt, hitWall: rR.hitWall });
      scanRays.push({ from: sp, to: rU.hitPt, hitWall: rU.hitWall });
      scanRays.push({ from: sp, to: rD.hitPt, hitWall: rD.hitWall });
    }
  }

  const minCursorX = Math.min(originPt.x, cursorPt.x);
  const maxCursorX = Math.max(originPt.x, cursorPt.x);
  const minCursorY = Math.min(originPt.y, cursorPt.y);
  const maxCursorY = Math.max(originPt.y, cursorPt.y);

  const boundX1 = Math.max(0, pickRobustBoundary(leftHits, 'min', minCursorX) - 2);
  const boundX2 = Math.min(grid.pageWidthPt, pickRobustBoundary(rightHits, 'max', maxCursorX) + 2);
  const boundY1 = Math.max(0, pickRobustBoundary(topHits, 'min', minCursorY) - 2);
  const boundY2 = Math.min(grid.pageHeightPt, pickRobustBoundary(bottomHits, 'max', maxCursorY) + 2);

  // Convert wall-clamped bounds to canvas pixel space
  const px1 = Math.max(1, Math.floor(boundX1 * scaleX));
  const px2 = Math.min(width - 2, Math.ceil(boundX2 * scaleX));
  const py1 = Math.max(1, Math.floor(boundY1 * scaleY));
  const py2 = Math.min(height - 2, Math.ceil(boundY2 * scaleY));

  const regionW = px2 - px1 + 1;
  const regionH = py2 - py1 + 1;
  if (regionW < 4 || regionH < 4) return null;

  // Choose an adaptive grid step so BFS always stays < 0.7ms (~180x180 max cells) with ~1-2cm precision
  const maxRegionDim = Math.max(regionW, regionH);
  const cellPx = Math.max(2, Math.ceil(maxRegionDim / 170));
  const cols = Math.ceil(regionW / cellPx);
  const rows = Math.ceil(regionH / cellPx);
  const totalCells = cols * rows;
  if (totalCells <= 0 || totalCells > 45000) return null;

  // 2. Build local wall occupancy mask (1 = wall, 0 = open space)
  const wallMask = new Uint8Array(totalCells);
  const blockCheck = sensitivity === 'thick' ? 1 : Math.min(2, cellPx);
  for (let gy = 0; gy < rows; gy++) {
    const basePy = py1 + gy * cellPx;
    for (let gx = 0; gx < cols; gx++) {
      const basePx = px1 + gx * cellPx;
      let isWall = false;
      for (let dy = 0; dy < blockCheck && !isWall; dy++) {
        const py = basePy + dy;
        if (py >= height) break;
        const rowOff = py * width;
        for (let dx = 0; dx < blockCheck; dx++) {
          const px = basePx + dx;
          if (px >= width) break;
          if (luma[rowOff + px] < threshold) {
            if (ignoreRects.length === 0 || !isInsideIgnoredRect(px, py, ignoreRects)) {
              isWall = true;
              break;
            }
          }
        }
      }
      if (isWall) {
        wallMask[gy * cols + gx] = 1;
      }
    }
  }

  // 3. Find clean open-space seed starting at originPt (or nudging slightly toward cursorPt if snapped onto a wall)
  const toCell = (pt: LaserPoint) => ({
    gx: Math.max(0, Math.min(cols - 1, Math.floor((pt.x * scaleX - px1) / cellPx))),
    gy: Math.max(0, Math.min(rows - 1, Math.floor((pt.y * scaleY - py1) / cellPx))),
  });

  let seed = toCell(originPt);
  if (wallMask[seed.gy * cols + seed.gx] === 1) {
    // Try nudging along the vector toward cursorPt
    const segLen = Math.hypot(cursorPt.x - originPt.x, cursorPt.y - originPt.y);
    let found = false;
    for (let step = 1; step <= 14 && !found; step++) {
      const frac = Math.min(1, (step * 2.5) / Math.max(1, segLen));
      const probe = toCell({
        x: originPt.x + (cursorPt.x - originPt.x) * frac,
        y: originPt.y + (cursorPt.y - originPt.y) * frac,
      });
      if (wallMask[probe.gy * cols + probe.gx] === 0) {
        seed = probe;
        found = true;
      }
    }
    if (!found) {
      // Fallback: check cursorPt itself
      const cSeed = toCell(cursorPt);
      if (wallMask[cSeed.gy * cols + cSeed.gx] === 0) {
        seed = cSeed;
      } else {
        return null;
      }
    }
  }

  // 4. Fast flat-array 4-neighbor BFS flood-fill inside the wall-clamped room bounds
  const visited = new Uint8Array(totalCells);
  const queue = new Int32Array(totalCells);
  let head = 0;
  let tail = 0;
  const startIdx = seed.gy * cols + seed.gx;
  visited[startIdx] = 1;
  queue[tail++] = startIdx;

  // Also seed cursorPt if it's in the same open area (helps if a thin furniture line partially bisected origin)
  const cursorCell = toCell(cursorPt);
  const cursorIdx = cursorCell.gy * cols + cursorCell.gx;

  while (head < tail) {
    const idx = queue[head++];
    const gx = idx % cols;
    const gy = (idx - gx) / cols;

    if (gx > 0) {
      const n = idx - 1;
      if (!visited[n] && !wallMask[n]) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    if (gx + 1 < cols) {
      const n = idx + 1;
      if (!visited[n] && !wallMask[n]) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    if (gy > 0) {
      const n = idx - cols;
      if (!visited[n] && !wallMask[n]) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    if (gy + 1 < rows) {
      const n = idx + cols;
      if (!visited[n] && !wallMask[n]) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  // If origin and cursor are both open and cursor wasn't reached only because of an interior obstacle/text line,
  // keep the primary room flood from origin (or if origin flood was tiny < 12 cells, flood from cursor instead).
  if (tail < 12 && !visited[cursorIdx] && !wallMask[cursorIdx]) {
    visited.fill(0);
    head = 0;
    tail = 0;
    visited[cursorIdx] = 1;
    queue[tail++] = cursorIdx;
    while (head < tail) {
      const idx = queue[head++];
      const gx = idx % cols;
      const gy = (idx - gx) / cols;
      if (gx > 0 && !visited[idx - 1] && !wallMask[idx - 1]) {
        visited[idx - 1] = 1;
        queue[tail++] = idx - 1;
      }
      if (gx + 1 < cols && !visited[idx + 1] && !wallMask[idx + 1]) {
        visited[idx + 1] = 1;
        queue[tail++] = idx + 1;
      }
      if (gy > 0 && !visited[idx - cols] && !wallMask[idx - cols]) {
        visited[idx - cols] = 1;
        queue[tail++] = idx - cols;
      }
      if (gy + 1 < rows && !visited[idx + cols] && !wallMask[idx + cols]) {
        visited[idx + cols] = 1;
        queue[tail++] = idx + cols;
      }
    }
  }

  const cellCount = tail;
  if (cellCount < 4) return null;

  // 5. Build merged horizontal-span SVG fill path + wall-contact border path + exact centroid & perimeter
  const cellWpt = cellPx / scaleX;
  const cellHpt = cellPx / scaleY;
  const baseXpt = px1 / scaleX;
  const baseYpt = py1 / scaleY;

  let sumX = 0;
  let sumY = 0;
  let wallEdgeHoriz = 0;
  let wallEdgeVert = 0;
  let openEdgeCount = 0;

  // Collect horizontal runs per row, then merge vertically identical runs so rectangles become 1 subpath!
  interface RunRect {
    x1: number;
    x2: number;
    y1: number;
    y2: number;
  }
  const activeRuns = new Map<string, RunRect>();
  const finishedRuns: RunRect[] = [];
  const borderSegments: string[] = [];

  for (let gy = 0; gy < rows; gy++) {
    const rowBase = gy * cols;
    const yTopPt = baseYpt + gy * cellHpt;
    const yBotPt = yTopPt + cellHpt;
    const nextActive = new Map<string, RunRect>();

    let gx = 0;
    while (gx < cols) {
      if (!visited[rowBase + gx]) {
        gx++;
        continue;
      }
      const runStart = gx;
      while (gx < cols && visited[rowBase + gx]) {
        const idx = rowBase + gx;
        sumX += gx + 0.5;
        sumY += gy + 0.5;

        const xLeftPt = baseXpt + gx * cellWpt;
        const xRightPt = xLeftPt + cellWpt;

        // Check 4 neighbors for wall-contact perimeter & luminous border
        const topVisited = gy > 0 && visited[idx - cols] === 1;
        const botVisited = gy + 1 < rows && visited[idx + cols] === 1;
        const leftVisited = gx > 0 && visited[idx - 1] === 1;
        const rightVisited = gx + 1 < cols && visited[idx + 1] === 1;

        if (!topVisited) {
          wallEdgeHoriz++;
          if (gy === 0 && !topHits.length) openEdgeCount++;
          borderSegments.push(`M${xLeftPt.toFixed(1)},${yTopPt.toFixed(1)}H${xRightPt.toFixed(1)}`);
        }
        if (!botVisited) {
          wallEdgeHoriz++;
          if (gy === rows - 1 && !bottomHits.length) openEdgeCount++;
          borderSegments.push(`M${xLeftPt.toFixed(1)},${yBotPt.toFixed(1)}H${xRightPt.toFixed(1)}`);
        }
        if (!leftVisited) {
          wallEdgeVert++;
          if (gx === 0 && !leftHits.length) openEdgeCount++;
          borderSegments.push(`M${xLeftPt.toFixed(1)},${yTopPt.toFixed(1)}V${yBotPt.toFixed(1)}`);
        }
        if (!rightVisited) {
          wallEdgeVert++;
          if (gx === cols - 1 && !rightHits.length) openEdgeCount++;
          borderSegments.push(`M${xRightPt.toFixed(1)},${yTopPt.toFixed(1)}V${yBotPt.toFixed(1)}`);
        }

        gx++;
      }
      const runEnd = gx;
      const key = `${runStart}:${runEnd}`;
      const existing = activeRuns.get(key);
      if (existing) {
        existing.y2 = yBotPt;
        nextActive.set(key, existing);
        activeRuns.delete(key);
      } else {
        nextActive.set(key, {
          x1: baseXpt + runStart * cellWpt,
          x2: baseXpt + runEnd * cellWpt,
          y1: yTopPt,
          y2: yBotPt,
        });
      }
    }

    for (const r of activeRuns.values()) {
      finishedRuns.push(r);
    }
    activeRuns.clear();
    for (const [k, v] of nextActive.entries()) {
      activeRuns.set(k, v);
    }
  }
  for (const r of activeRuns.values()) {
    finishedRuns.push(r);
  }

  const svgFillPath = finishedRuns
    .map(
      (r) =>
        `M${r.x1.toFixed(1)},${r.y1.toFixed(1)}H${r.x2.toFixed(1)}V${r.y2.toFixed(1)}H${r.x1.toFixed(1)}Z`
    )
    .join('');

  // Simplify border path count if very dense (still crisp)
  const svgBorderPath = borderSegments.join('');

  // Compensate subtle half-cell wall quantization so inner-face area is ultra-accurate
  const wallEdgesTotal = wallEdgeHoriz + wallEdgeVert;
  const effectiveCells = cellCount + wallEdgesTotal * 0.22;
  const areaPt2 = effectiveCells * cellWpt * cellHpt;
  const perimPt = wallEdgeHoriz * cellWpt + wallEdgeVert * cellHpt;

  const enclosed =
    leftHits.length > 0 &&
    rightHits.length > 0 &&
    topHits.length > 0 &&
    bottomHits.length > 0 &&
    openEdgeCount < wallEdgesTotal * 0.15;

  const centroid: LaserPoint = {
    x: baseXpt + (sumX / cellCount) * cellWpt,
    y: baseYpt + (sumY / cellCount) * cellHpt,
  };

  return {
    origin: originPt,
    cursor: cursorPt,
    centroid,
    svgFillPath,
    svgBorderPath,
    scanRays,
    areaPt2,
    perimPt,
    enclosed,
    cellCount,
  };
}

/**
 * Plays a subtle, crisp laser rangefinder confirmation chirp using Web Audio API.
 */
export function playLaserBeep(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.exponentialRampToValueAtTime(1960, now + 0.045);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
    osc.onended = () => {
      try {
        ctx.close();
      } catch {}
    };
  } catch {
    // Ignore audio restrictions gracefully
  }
}
