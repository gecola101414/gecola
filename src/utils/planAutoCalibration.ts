import { PlanToken } from './pdfPlanExtractor';
import { castSingleLaserRay, PlanLumaGrid } from './planLaserRaycaster';

export type AutoCalibrationStatus =
  | 'idle'
  | 'pending_ocr'
  | 'auto_calibrated'
  | 'manual_calibrated'
  | 'needs_manual';

export interface AutoCalibrationSample {
  tokenId: string;
  tokenStr: string;
  orientation: 'horizontal' | 'vertical';
  valueM: number;
  spanPt: number;
  metersPerPt: number;
  derivedScale: number;
}

export interface AutoCalibrationResult {
  success: boolean;
  metersPerPt?: number;
  derivedScaleDenominator?: number;
  matchedHorizontal: number;
  matchedVertical: number;
  totalQuotesH: number;
  totalQuotesV: number;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  samples: AutoCalibrationSample[];
}

interface PixelRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const MIN_METERS_PER_PT = (0.0254 / 72) * 8; // ~1:8
const MAX_METERS_PER_PT = (0.0254 / 72) * 1200; // ~1:1200
const MIN_SPAN_PT = 12;
const MAX_SPAN_FRACTION = 0.92;

function buildTokenIgnoreRects(grid: PlanLumaGrid, tokens: PlanToken[]): PixelRect[] {
  const scaleX = grid.width / grid.pageWidthPt;
  const scaleY = grid.height / grid.pageHeightPt;
  const maxW = grid.width * 0.25;
  const maxH = grid.height * 0.25;
  const rects: PixelRect[] = [];
  for (const t of tokens) {
    const x1 = t.bbox.x1 * scaleX - 2;
    const y1 = t.bbox.y1 * scaleY - 2;
    const x2 = t.bbox.x2 * scaleX + 2;
    const y2 = t.bbox.y2 * scaleY + 2;
    const w = x2 - x1;
    const h = y2 - y1;
    if (w > 1 && h > 1 && w < maxW && h < maxH) {
      rects.push({ x1, y1, x2, y2 });
    }
  }
  return rects;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function metersPerPtToScaleDenom(mPerPt: number): number {
  return Math.max(1, Math.round((mPerPt * 72) / 0.0254));
}

/**
 * Probes opposing laser rays around a horizontal or vertical dimension quote
 * to measure the wall-to-wall / tick-to-tick span (in PDF points) that the quote refers to.
 */
function measureQuoteSpanPt(
  grid: PlanLumaGrid,
  tok: PlanToken,
  ignoreRects: PixelRect[]
): number[] {
  const isHoriz = tok.orientation === 'horizontal';
  const dirX = isHoriz ? 1 : 0;
  const dirY = isHoriz ? 0 : 1;
  const maxSpanPt = (isHoriz ? grid.pageWidthPt : grid.pageHeightPt) * MAX_SPAN_FRACTION;

  // Probe at the quote's center line AND slightly offset perpendicular to it
  // (quotes are often written just above a horizontal dimension line or just beside a vertical line,
  // or centered inside a room between opposing walls).
  const perpSize = isHoriz ? Math.max(6, tok.h) : Math.max(6, tok.w);
  const offsets = [0, -perpSize * 0.9, perpSize * 0.9, -perpSize * 1.8, perpSize * 1.8];

  const spans: number[] = [];

  for (const offset of offsets) {
    const px = isHoriz ? tok.cx : tok.cx + offset;
    const py = isHoriz ? tok.cy + offset : tok.cy;
    if (px <= 2 || py <= 2 || px >= grid.pageWidthPt - 2 || py >= grid.pageHeightPt - 2) {
      continue;
    }

    const neg = castSingleLaserRay(grid, { x: px, y: py }, -dirX, -dirY, 'medium', ignoreRects);
    const pos = castSingleLaserRay(grid, { x: px, y: py }, dirX, dirY, 'medium', ignoreRects);

    if (neg.hitWall && pos.hitWall) {
      const span = neg.distPt + pos.distPt;
      if (span >= MIN_SPAN_PT && span <= maxSpanPt) {
        // Require the quote to sit reasonably within the span (not wildly off-center unless near an edge)
        const minSide = Math.min(neg.distPt, pos.distPt);
        if (minSide >= 2.5) {
          spans.push(span);
        }
      }
    }
  }

  // Deduplicate similar spans (within 4%) so each distinct geometric span votes cleanly
  const unique: number[] = [];
  for (const s of spans) {
    const existingIdx = unique.findIndex((u) => Math.abs(u - s) / Math.max(u, s) < 0.045);
    if (existingIdx === -1) {
      unique.push(s);
    } else {
      unique[existingIdx] = (unique[existingIdx] + s) / 2;
    }
  }

  return unique;
}

/**
 * Automatically calibrates the floor plan scale (`metersPerPt`) using detected horizontal
 * and vertical dimension quotes (`PlanToken` with `kind === 'dimension'`).
 *
 * Returns `success: false` with a clear Italian explanation if no usable horizontal/vertical
 * quotes exist or no consistent geometric consensus can be verified — prompting manual calibration.
 */
export function autoCalibratePlanFromQuotes(
  grid: PlanLumaGrid | null,
  tokens: PlanToken[],
  detectedScaleDenominator?: number
): AutoCalibrationResult {
  // 1. Collect valid horizontal & vertical dimension tokens
  const usableQuotes = tokens.filter(
    (t) =>
      t.kind === 'dimension' &&
      (t.orientation === 'horizontal' || t.orientation === 'vertical') &&
      typeof t.numericValue === 'number' &&
      Number.isFinite(t.numericValue) &&
      t.numericValue >= 0.3 &&
      t.numericValue <= 65
  );

  const quotesH = usableQuotes.filter((t) => t.orientation === 'horizontal');
  const quotesV = usableQuotes.filter((t) => t.orientation === 'vertical');

  if (usableQuotes.length === 0) {
    return {
      success: false,
      matchedHorizontal: 0,
      matchedVertical: 0,
      totalQuotesH: 0,
      totalQuotesV: 0,
      confidence: 'low',
      reason:
        'Nessuna misura orizzontale o verticale censita sulla tavola: è necessario calibrare manualmente la scala.',
      samples: [],
    };
  }

  if (!grid) {
    return {
      success: false,
      matchedHorizontal: 0,
      matchedVertical: 0,
      totalQuotesH: quotesH.length,
      totalQuotesV: quotesV.length,
      confidence: 'low',
      reason: 'Immagine tavola non ancora pronta per la calibrazione automatica.',
      samples: [],
    };
  }

  const ignoreRects = buildTokenIgnoreRects(grid, tokens);

  // Limit to at most 40 best quotes (balanced H and V) to guarantee <10ms runtime
  const prioritizedQuotes: PlanToken[] = [];
  const maxPerAxis = 22;
  for (let i = 0; i < Math.max(quotesH.length, quotesV.length); i++) {
    if (i < quotesH.length && i < maxPerAxis) prioritizedQuotes.push(quotesH[i]);
    if (i < quotesV.length && i < maxPerAxis) prioritizedQuotes.push(quotesV[i]);
  }

  // 2. Generate scale ratio hypotheses (valueM / spanPt) from each H & V quote
  const hypotheses: AutoCalibrationSample[] = [];
  for (const tok of prioritizedQuotes) {
    const valM = tok.numericValue!;
    const spans = measureQuoteSpanPt(grid, tok, ignoreRects);
    for (const spanPt of spans) {
      const mPerPt = valM / spanPt;
      if (mPerPt < MIN_METERS_PER_PT || mPerPt > MAX_METERS_PER_PT) continue;
      hypotheses.push({
        tokenId: tok.id,
        tokenStr: tok.str,
        orientation: tok.orientation as 'horizontal' | 'vertical',
        valueM: valM,
        spanPt,
        metersPerPt: mPerPt,
        derivedScale: metersPerPtToScaleDenom(mPerPt),
      });
    }
  }

  if (hypotheses.length === 0) {
    return {
      success: false,
      matchedHorizontal: 0,
      matchedVertical: 0,
      totalQuotesH: quotesH.length,
      totalQuotesV: quotesV.length,
      confidence: 'low',
      reason:
        'Le misure orizzontali/verticali rilevate non trovano riscontro geometrico sulle pareti: calibra manualmente la scala.',
      samples: [],
    };
  }

  // 3. Robust RANSAC / Cluster Consensus Voting (±8.5% tolerance)
  const expectedMPerPt =
    detectedScaleDenominator && detectedScaleDenominator >= 10 && detectedScaleDenominator <= 1000
      ? (0.0254 / 72) * detectedScaleDenominator
      : null;

  let bestCluster: AutoCalibrationSample[] = [];
  let bestScore = -1;

  for (const pivot of hypotheses) {
    // Keep at most one best-matching hypothesis per unique tokenId so one token cannot vote twice
    const byToken = new Map<string, AutoCalibrationSample>();
    for (const cand of hypotheses) {
      const relErr = Math.abs(cand.metersPerPt - pivot.metersPerPt) / pivot.metersPerPt;
      if (relErr <= 0.085) {
        const existing = byToken.get(cand.tokenId);
        if (
          !existing ||
          Math.abs(cand.metersPerPt - pivot.metersPerPt) < Math.abs(existing.metersPerPt - pivot.metersPerPt)
        ) {
          byToken.set(cand.tokenId, cand);
        }
      }
    }

    const cluster = Array.from(byToken.values());
    const countH = cluster.filter((c) => c.orientation === 'horizontal').length;
    const countV = cluster.filter((c) => c.orientation === 'vertical').length;
    const hasBothAxes = countH > 0 && countV > 0;

    // Score prioritizes: unique quotes agreeing + strong bonus when BOTH H & V quotes agree
    // + bonus when close to a standard architectural scale or explicit 1:N label
    let score = cluster.length * 10;
    if (hasBothAxes) score += 14 + Math.min(countH, countV) * 4;

    const medRatio = median(cluster.map((c) => c.metersPerPt));
    const derivedDenom = metersPerPtToScaleDenom(medRatio);

    if (expectedMPerPt) {
      const scaleDiff = Math.abs(medRatio - expectedMPerPt) / expectedMPerPt;
      if (scaleDiff <= 0.14) score += 12;
    }

    // Mild architectural prior for standard CAD scales (1:20, 1:25, 1:50, 1:100, 1:200, 1:500)
    const stdScales = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500];
    const nearStd = stdScales.some((s) => Math.abs(derivedDenom - s) / s <= 0.06);
    if (nearStd) score += 3;

    // Slight preference for tighter internal variance
    const avgRelDev =
      cluster.reduce((acc, c) => acc + Math.abs(c.metersPerPt - medRatio) / medRatio, 0) /
      Math.max(1, cluster.length);
    score -= avgRelDev * 15;

    if (score > bestScore) {
      bestScore = score;
      bestCluster = cluster;
    }
  }

  const matchedH = bestCluster.filter((c) => c.orientation === 'horizontal').length;
  const matchedV = bestCluster.filter((c) => c.orientation === 'vertical').length;
  const totalMatched = bestCluster.length;

  // Require reliable consensus:
  // - At least 2 distinct quotes agreeing (ideally H + V), OR
  // - 1 quote that also agrees with a detected 1:N scale label on the sheet.
  const finalMPerPt = median(bestCluster.map((c) => c.metersPerPt));
  const finalScaleDenom = metersPerPtToScaleDenom(finalMPerPt);
  const agreesWithScaleLabel =
    expectedMPerPt !== null && Math.abs(finalMPerPt - expectedMPerPt) / expectedMPerPt <= 0.16;

  const isReliable = totalMatched >= 2 || (totalMatched === 1 && agreesWithScaleLabel);

  if (!isReliable || !Number.isFinite(finalMPerPt) || finalMPerPt <= 0) {
    return {
      success: false,
      matchedHorizontal: matchedH,
      matchedVertical: matchedV,
      totalQuotesH: quotesH.length,
      totalQuotesV: quotesV.length,
      confidence: 'low',
      reason:
        'Quote orizzontali/verticali insufficienti per una verifica sicura della scala: è necessario calibrare manualmente.',
      samples: bestCluster,
    };
  }

  const confidence: 'high' | 'medium' | 'low' =
    matchedH >= 1 && matchedV >= 1 && totalMatched >= 3
      ? 'high'
      : totalMatched >= 2
      ? 'medium'
      : 'low';

  const axisSummary =
    matchedH > 0 && matchedV > 0
      ? `${matchedH} quote H + ${matchedV} quote V`
      : matchedH > 0
      ? `${matchedH} quote H`
      : `${matchedV} quote V`;

  return {
    success: true,
    metersPerPt: finalMPerPt,
    derivedScaleDenominator: finalScaleDenom,
    matchedHorizontal: matchedH,
    matchedVertical: matchedV,
    totalQuotesH: quotesH.length,
    totalQuotesV: quotesV.length,
    confidence,
    reason: `Scala auto-calibrata ~1:${finalScaleDenom} su ${axisSummary}`,
    samples: bestCluster,
  };
}
