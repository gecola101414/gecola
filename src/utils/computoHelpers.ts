import { Article, Measurement } from '../types';

export const MIME_ARTICLE = 'application/gecola-article';
export const MIME_MEASUREMENT = 'application/gecola-measurement';
export const MIME_ANALYSIS_ROW = 'application/gecola-analysis-row';
export const MIME_ANALYSIS_DRAG = 'application/gecola-analysis-data';

let globalAudioCtx: AudioContext | null = null;

export const getAudioContext = (): AudioContext => {
  if (!globalAudioCtx) {
    globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return globalAudioCtx;
};

export const playUISound = (type: 'confirm' | 'move' | 'newline' | 'toggle' | 'cycle' | 'click' | 'delete') => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    if (type === 'confirm') {
      masterGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.005);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.connect(masterGain);
      osc.start();
      masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'move' || type === 'click') {
      masterGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.005);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.connect(masterGain);
      osc.start();
      masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'toggle' || type === 'cycle' || type === 'delete') {
      masterGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.005);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(type === 'cycle' ? 660 : 440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(type === 'cycle' ? 990 : 880, ctx.currentTime + 0.1);
      osc.connect(masterGain);
      osc.start();
      masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'newline') {
      masterGain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.005);
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.08);
        osc.connect(masterGain);
        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + 0.4);
      });
      masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    }
  } catch (e) {
    console.warn('Audio feedback disabled:', e);
  }
};

export const formatNumber = (val: number | undefined | null) => {
  if (val === undefined || val === null || val === 0) return '';
  return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
};

export const formatResult = (val: number | undefined | null) => {
  const value = val || 0;
  return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
};

export const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: true }).format(val || 0);
};

export const getDynamicNumberFontSize = (
  val: string | number | undefined | null,
  baseSize: number = 13.5,
  threshold: number = 7,
  minSize: number = 9
): string => {
  if (val === undefined || val === null || val === '') return `${baseSize}px`;
  const str = typeof val === 'number' ? val.toLocaleString('it-IT') : String(val).trim();
  const len = str.length;
  if (len <= threshold) return `${baseSize}px`;
  const excess = len - threshold;
  const computed = Math.max(minSize, baseSize - excess * 0.85);
  return `${computed.toFixed(1)}px`;
};

export const getWbsNumber = (code: string) => {
  const match = code.match(/WBS\.(\d+)/);
  if (match) return parseInt(match[1], 10);
  const sMatch = code.match(/S\.(\d+)/);
  if (sMatch) return parseInt(sMatch[1], 10);
  return code;
};

export const roundTwoDecimals = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

export const getRank = (unit: string) => {
  const u = unit.toLowerCase().replace(/\s/g, '');
  if (u.includes('m3') || u.includes('mc') || u.includes('m³')) return 3;
  if (u.includes('m2') || u.includes('mq') || u.includes('m²')) return 2;
  if (u === 'm' || u === 'ml' || u.includes('linea') || u.includes('ml.')) return 1;
  return 0;
};

export const calculateRowValueWithContext = (
  m: Measurement,
  _targetUnit: string,
  linkedValue: number = 0,
  _sourceUnit: string = ''
): number => {
  if (m.type === 'subtotal') return 0;

  const sign = m.type === 'deduction' ? -1 : 1;

  if (m.linkedArticleId) {
    let localPhysicalFactor = 1;
    if (m.length !== undefined && m.length !== 0) localPhysicalFactor *= m.length;
    if (m.width !== undefined && m.width !== 0) localPhysicalFactor *= m.width;
    if (m.height !== undefined && m.height !== 0) localPhysicalFactor *= m.height;
    const mult = m.multiplier !== undefined ? m.multiplier : 1;
    return linkedValue * localPhysicalFactor * mult * sign;
  }

  const isVediVoceDesc = m.description ? m.description.toLowerCase().includes('vedi voce') : false;
  if (isVediVoceDesc) {
    return (m.pdfQuantity ?? 0) * sign;
  }

  const hasLocalDimensions = m.length !== undefined || m.width !== undefined || m.height !== undefined;
  const hasMultiplier = m.multiplier !== undefined;

  if (!hasLocalDimensions && !hasMultiplier && m.pdfQuantity === undefined) return 0;

  const mult = hasMultiplier ? m.multiplier! : hasLocalDimensions ? 1 : 0;
  const l = m.length === undefined ? 1 : m.length;
  const w = m.width === undefined ? 1 : m.width;
  const h = m.height === undefined ? 1 : m.height;

  const base = hasLocalDimensions ? l * w * h : 0;
  const effectiveBase = !hasLocalDimensions && mult !== 0 ? 1 : base;
  const rawFormulaVal = effectiveBase * mult;
  const roundedFormulaVal = roundTwoDecimals(rawFormulaVal);

  if (m.pdfQuantity !== undefined) {
    if ((hasLocalDimensions || hasMultiplier) && Math.abs(roundedFormulaVal - m.pdfQuantity) <= 0.02) {
      return roundedFormulaVal * sign;
    }
    return m.pdfQuantity * sign;
  }

  return rawFormulaVal * sign;
};

export const resolveArticleQuantity = (
  articleId: string,
  allArticlesMap: Map<string, Article>,
  visited: Set<string> = new Set(),
  resolvedCache?: Map<string, number>
): number => {
  if (resolvedCache && resolvedCache.has(articleId)) {
    return resolvedCache.get(articleId)!;
  }
  if (visited.has(articleId)) return 0;
  visited.add(articleId);

  const article = allArticlesMap.get(articleId);
  if (!article) return 0;

  let sum = 0;
  const measurements = article.measurements;
  for (let i = 0; i < measurements.length; i++) {
    const m = measurements[i];
    if (m.type === 'subtotal') continue;
    if (m.linkedArticleId) {
      const sourceQty = resolveArticleQuantity(m.linkedArticleId, allArticlesMap, visited, resolvedCache);
      const sourceArt = allArticlesMap.get(m.linkedArticleId);
      let finalSourceVal = sourceQty;
      if (m.linkedType === 'amount' && sourceArt) {
        finalSourceVal = sourceQty * sourceArt.unitPrice;
      }
      sum += calculateRowValueWithContext(m, article.unit, finalSourceVal, sourceArt?.unit || '');
    } else {
      sum += calculateRowValueWithContext(m, article.unit);
    }
  }

  visited.delete(articleId);

  const result = measurements.length === 0 || (sum === 0 && article.quantity > 0) ? article.quantity : sum;
  if (resolvedCache) {
    resolvedCache.set(articleId, result);
  }
  return result;
};

export const isBlankMeasurement = (m: Measurement) => {
  const hasNoDesc = !m.description || m.description.trim() === '';
  const hasNoDims =
    (m.length === undefined || m.length === 0) &&
    (m.width === undefined || m.width === 0) &&
    (m.height === undefined || m.height === 0);
  const hasNoLinked = !m.linkedArticleId;
  const isPositive = m.type === 'positive';
  return hasNoDesc && hasNoDims && hasNoLinked && isPositive;
};

export const recalculateAllArticles = (articles: Article[]): Article[] => {
  const articleMap = new Map<string, Article>();
  for (let i = 0; i < articles.length; i++) {
    articleMap.set(articles[i].id, articles[i]);
  }
  const resolvedCache = new Map<string, number>();
  let anyChanged = false;

  const result = articles.map((art) => {
    const calculatedQty = roundTwoDecimals(resolveArticleQuantity(art.id, articleMap, new Set(), resolvedCache));
    if (calculatedQty === art.quantity) {
      return art;
    }
    anyChanged = true;
    return { ...art, quantity: calculatedQty };
  });

  return anyChanged ? result : articles;
};

/**
 * Ricalcola rapidamente solo l'articolo modificato e gli eventuali articoli che lo referenziano tramite Vedi Voce.
 * Evita di ricalcolare centinaia o migliaia di articoli non coinvolti durante la digitazione delle misure.
 */
export const recalculateAffectedArticles = (articles: Article[], changedArticleId: string): Article[] => {
  // Verifica veloce se qualche articolo ha collegamenti inter-voce
  let hasAnyLink = false;
  for (let i = 0; i < articles.length; i++) {
    const ms = articles[i].measurements;
    for (let j = 0; j < ms.length; j++) {
      if (ms[j].linkedArticleId) {
        hasAnyLink = true;
        break;
      }
    }
    if (hasAnyLink) break;
  }

  if (hasAnyLink) {
    return recalculateAllArticles(articles);
  }

  // Fast-path O(1) sugli articoli non toccati: aggiorna solo l'articolo modificato
  let changed = false;
  const next = articles.map((art) => {
    if (art.id !== changedArticleId) return art;
    let sum = 0;
    for (let i = 0; i < art.measurements.length; i++) {
      const m = art.measurements[i];
      if (m.type !== 'subtotal') {
        sum += calculateRowValueWithContext(m, art.unit);
      }
    }
    const nextQty =
      art.measurements.length === 0 || (sum === 0 && art.quantity > 0)
        ? art.quantity
        : roundTwoDecimals(sum);
    if (nextQty === art.quantity) return art;
    changed = true;
    return { ...art, quantity: nextQty };
  });

  return changed ? next : articles;
};
