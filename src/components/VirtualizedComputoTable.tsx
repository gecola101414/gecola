import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Article, Measurement, ProjectInfo } from '../types';
import { VoiceField } from '../services/voiceDictationService';
import { ArticleGroup } from './ArticleGroup';

export interface ScrollToArticleRequest {
  id: string;
  nonce: number;
}

interface VirtualizedComputoTableProps {
  articles: Article[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  globalArticleIndexMap: Map<string, number>;
  allArticlesMap: Map<string, Article>;
  articleLocalNumberMap: Map<string, string>;
  isCategoryLocked?: boolean;
  isSurveyorGuardActive: boolean;
  projectSettings: ProjectInfo;
  lastMovedItemId: string | null;
  recordingArticleId: string | null;
  smartRepeatActiveId: string | null;
  lastAddedMeasurementId: string | null;
  voiceActiveRowId?: string | null;
  voiceActiveField?: VoiceField;
  scrollToArticleRequest?: ScrollToArticleRequest | null;
  onUpdateArticle: (id: string, field: keyof Article, value: any) => void;
  onEditArticleDetails: (article: Article) => void;
  onDeleteArticle: (id: string) => void;
  onToggleArticleEnabled?: (id: string) => void;
  onAddMeasurement: (articleId: string) => void;
  onAddSubtotal: (articleId: string) => void;
  onUpdateMeasurement: (articleId: string, mId: string, field: keyof Measurement, value: any) => void;
  onDeleteMeasurement: (articleId: string, mId: string) => void;
  onOpenLinkModal: (articleId: string, measurementId: string) => void;
  onScrollToArticle: (id: string, fromId?: string) => void;
  onArticleDragStart: (e: React.DragEvent, article: Article) => void;
  onArticleDrop: (e: React.DragEvent, targetArticleId: string, position: 'top' | 'bottom') => void;
  onArticleDragEnd: () => void;
  onColumnFocus: (column: string | null) => void;
  onViewAnalysis: (analysisId: string, articleId?: string) => void;
  onInsertExternalArticle: (index: number, text: string) => void;
  onToggleArticleLock: (id: string) => void;
  onOpenRebarCalculator: (articleId: string) => void;
  onOpenPaintingCalculator: (articleId: string) => void;
  onToggleSmartRepeat: (articleId: string) => void;
  onToggleItemDisplayMode: (articleId: string) => void;
  onStartVoiceDictation: (articleId: string) => void;
  onMeasurementDrop?: (
    sourceArticleId: string,
    measurementId: string,
    targetArticleId: string,
    targetMeasurementId?: string,
    position?: 'top' | 'bottom'
  ) => void;
  onVoiceCellFocus?: (rowId: string, field: VoiceField) => void;
  onOpenContextMenu?: (e: React.MouseEvent, article: Article, measurement?: Measurement | null) => void;
}

const VIRTUALIZATION_THRESHOLD = 15;
const OVERSCAN_PX = 750;

function estimateArticleHeight(article: Article): number {
  const mode = article.displayMode || 0;
  if (mode === 2) {
    // Modalità Patto d'Acciaio (compatta su una riga)
    return 64;
  }

  const descLen = article.description?.length || 0;
  const headerBase = mode === 1 ? 76 : article.isLocked ? 82 : Math.min(180, 96 + Math.floor(descLen / 95) * 18);
  const toolbarHeight = 32;
  const footerAndSepHeight = 46;

  let measHeight = 0;
  const measList = article.measurements;
  for (let i = 0; i < measList.length; i++) {
    const m = measList[i];
    const mDesc = m.description || '';
    const extraLines = mDesc.includes('\n') ? mDesc.split('\n').length - 1 : Math.floor(mDesc.length / 46);
    const linkedBadge = m.linkedArticleId ? 22 : 0;
    measHeight += 31 + Math.min(4, extraLines) * 18 + linkedBadge;
  }

  return headerBase + toolbarHeight + measHeight + footerAndSepHeight;
}

export const VirtualizedComputoTable: React.FC<VirtualizedComputoTableProps> = ({
  articles,
  scrollContainerRef,
  globalArticleIndexMap,
  allArticlesMap,
  articleLocalNumberMap,
  isCategoryLocked,
  isSurveyorGuardActive,
  projectSettings,
  lastMovedItemId,
  recordingArticleId,
  smartRepeatActiveId,
  lastAddedMeasurementId,
  voiceActiveRowId,
  voiceActiveField,
  scrollToArticleRequest,
  onUpdateArticle,
  onEditArticleDetails,
  onDeleteArticle,
  onToggleArticleEnabled,
  onAddMeasurement,
  onAddSubtotal,
  onUpdateMeasurement,
  onDeleteMeasurement,
  onOpenLinkModal,
  onScrollToArticle,
  onArticleDragStart,
  onArticleDrop,
  onArticleDragEnd,
  onColumnFocus,
  onViewAnalysis,
  onInsertExternalArticle,
  onToggleArticleLock,
  onOpenRebarCalculator,
  onOpenPaintingCalculator,
  onToggleSmartRepeat,
  onToggleItemDisplayMode,
  onStartVoiceDictation,
  onMeasurementDrop,
  onVoiceCellFocus,
  onOpenContextMenu,
}) => {
  const isVirtualized = articles.length > VIRTUALIZATION_THRESHOLD;

  const [scrollState, setScrollState] = useState<{ scrollTop: number; viewportHeight: number }>({
    scrollTop: 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 900,
  });
  const [layoutVersion, setLayoutVersion] = useState(0);

  const measuredHeightsRef = useRef<Map<string, number>>(new Map());
  const tbodyElementsRef = useRef<Map<string, HTMLTableSectionElement>>(new Map());
  const elementToIdRef = useRef<WeakMap<Element, string>>(new WeakMap());
  const articlesRef = useRef(articles);
  articlesRef.current = articles;

  const offsetsRef = useRef<Float64Array>(new Float64Array(0));
  const pendingMeasureRafRef = useRef<number | null>(null);
  const pendingScrollRafRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Calcola array delle posizioni cumulative Y in O(N)
  const layoutMetrics = useMemo(() => {
    const n = articles.length;
    const offsets = new Float64Array(n + 1);
    const heights = measuredHeightsRef.current;
    let total = 0;
    for (let i = 0; i < n; i++) {
      offsets[i] = total;
      const art = articles[i];
      const h = heights.get(art.id) ?? estimateArticleHeight(art);
      total += h;
    }
    offsets[n] = total;
    offsetsRef.current = offsets;
    return { offsets, totalHeight: total };
    // layoutVersion forza il ricalcolo quando ResizeObserver misura nuovi height
  }, [articles, layoutVersion]);

  // Pulizia cache altezze per articoli rimossi
  useEffect(() => {
    if (measuredHeightsRef.current.size > articles.length + 50) {
      const validIds = new Set(articles.map((a) => a.id));
      for (const id of measuredHeightsRef.current.keys()) {
        if (!validIds.has(id)) {
          measuredHeightsRef.current.delete(id);
        }
      }
    }
  }, [articles]);

  // ResizeObserver singolo condiviso con Scroll Anchoring per evitare salti durante lo scroll
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      const container = scrollContainerRef.current;
      const currentScrollTop = container ? container.scrollTop : 0;
      const currentArticles = articlesRef.current;
      const offsets = offsetsRef.current;
      let changed = false;
      let scrollDelta = 0;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const target = entry.target as HTMLElement;
        const articleId = elementToIdRef.current.get(target);
        if (!articleId) continue;

        const newHeight =
          entry.borderBoxSize && entry.borderBoxSize.length > 0
            ? entry.borderBoxSize[0].blockSize
            : target.getBoundingClientRect().height;

        if (newHeight <= 0) continue;

        const prevMeasured = measuredHeightsRef.current.get(articleId);
        if (prevMeasured !== undefined && Math.abs(prevMeasured - newHeight) < 1) {
          continue;
        }

        const idx = currentArticles.findIndex((a) => a.id === articleId);
        const baselineHeight =
          prevMeasured !== undefined
            ? prevMeasured
            : idx !== -1
            ? estimateArticleHeight(currentArticles[idx])
            : newHeight;

        const diff = newHeight - baselineHeight;
        measuredHeightsRef.current.set(articleId, newHeight);
        changed = true;

        // Scroll anchoring: se l'articolo ridimensionato inizia sopra la finestra visibile, compensa scrollTop
        if (idx !== -1 && idx < offsets.length && offsets[idx] + baselineHeight <= currentScrollTop + 2) {
          scrollDelta += diff;
        }
      }

      if (container && Math.abs(scrollDelta) >= 1) {
        container.scrollTop = Math.max(0, container.scrollTop + scrollDelta);
      }

      if (changed && pendingMeasureRafRef.current === null) {
        pendingMeasureRafRef.current = requestAnimationFrame(() => {
          pendingMeasureRafRef.current = null;
          setLayoutVersion((v) => v + 1);
        });
      }
    });

    resizeObserverRef.current = ro;
    for (const [, el] of tbodyElementsRef.current) {
      ro.observe(el);
    }

    return () => {
      if (pendingMeasureRafRef.current !== null) {
        cancelAnimationFrame(pendingMeasureRafRef.current);
        pendingMeasureRafRef.current = null;
      }
      ro.disconnect();
      resizeObserverRef.current = null;
    };
  }, [scrollContainerRef]);

  const handleTbodyRef = useCallback((articleId: string, el: HTMLTableSectionElement | null) => {
    const prevEl = tbodyElementsRef.current.get(articleId);
    if (prevEl && prevEl !== el) {
      resizeObserverRef.current?.unobserve(prevEl);
      tbodyElementsRef.current.delete(articleId);
    }
    if (el) {
      elementToIdRef.current.set(el, articleId);
      if (prevEl !== el) {
        tbodyElementsRef.current.set(articleId, el);
        resizeObserverRef.current?.observe(el);
      }
    }
  }, []);

  // Listener scroll + resize viewport throttled a 1x per animation frame
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const syncViewport = () => {
      setScrollState((prev) => {
        const nextTop = container.scrollTop;
        const nextHeight = container.clientHeight || window.innerHeight;
        if (Math.abs(prev.scrollTop - nextTop) < 4 && Math.abs(prev.viewportHeight - nextHeight) < 4) {
          return prev;
        }
        return { scrollTop: nextTop, viewportHeight: nextHeight };
      });
    };

    const onScroll = () => {
      if (pendingScrollRafRef.current !== null) return;
      pendingScrollRafRef.current = requestAnimationFrame(() => {
        pendingScrollRafRef.current = null;
        syncViewport();
      });
    };

    syncViewport();
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    let containerRo: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      containerRo = new ResizeObserver(onScroll);
      containerRo.observe(container);
    }

    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      containerRo?.disconnect();
      if (pendingScrollRafRef.current !== null) {
        cancelAnimationFrame(pendingScrollRafRef.current);
        pendingScrollRafRef.current = null;
      }
    };
  }, [scrollContainerRef, articles.length]);

  // Supporto Scroll-To-Article anche quando la voce destinazione è fuori dal viewport virtuale
  useEffect(() => {
    if (!scrollToArticleRequest) return;
    const { id } = scrollToArticleRequest;
    const idx = articles.findIndex((a) => a.id === id);
    const container = scrollContainerRef.current;
    if (idx === -1 || !container) return;

    if (isVirtualized) {
      const targetEstimatedTop = layoutMetrics.offsets[idx] ?? 0;
      container.scrollTop = Math.max(0, targetEstimatedTop - 8);
      setScrollState({
        scrollTop: container.scrollTop,
        viewportHeight: container.clientHeight || window.innerHeight,
      });
    }

    let cancelled = false;
    const fineAlign = (smooth: boolean) => {
      if (cancelled) return;
      const el = document.getElementById(`article-${id}`);
      const sc = scrollContainerRef.current;
      if (el && sc) {
        const containerRect = sc.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const exactTop = sc.scrollTop + (elRect.top - containerRect.top);
        sc.scrollTo({
          top: Math.max(0, exactTop - 2),
          behavior: smooth ? 'smooth' : 'auto',
        });
      }
    };

    const t1 = requestAnimationFrame(() => fineAlign(false));
    const t2 = setTimeout(() => fineAlign(true), 90);
    return () => {
      cancelled = true;
      cancelAnimationFrame(t1);
      clearTimeout(t2);
    };
  }, [scrollToArticleRequest, articles, isVirtualized, scrollContainerRef]);

  // Calcola intervallo visibile [startIdx, endIdx] con binary search
  const { startIdx, endIdx, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    const n = articles.length;
    if (!isVirtualized || n === 0) {
      return { startIdx: 0, endIdx: n - 1, topSpacerHeight: 0, bottomSpacerHeight: 0 };
    }

    const { offsets, totalHeight } = layoutMetrics;
    const minY = Math.max(0, scrollState.scrollTop - OVERSCAN_PX);
    const maxY = scrollState.scrollTop + scrollState.viewportHeight + OVERSCAN_PX;

    // Binary search per il primo articolo il cui bottom > minY
    let lo = 0;
    let hi = n - 1;
    let first = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] > minY) {
        first = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    // Binary search per l'ultimo articolo il cui top < maxY
    lo = first;
    hi = n - 1;
    let last = first;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid] < maxY) {
        last = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const topSpacer = offsets[first];
    const bottomSpacer = Math.max(0, totalHeight - offsets[last + 1]);

    return {
      startIdx: first,
      endIdx: last,
      topSpacerHeight: topSpacer,
      bottomSpacerHeight: bottomSpacer,
    };
  }, [articles.length, isVirtualized, layoutMetrics, scrollState]);

  const visibleSlice = isVirtualized ? articles.slice(startIdx, endIdx + 1) : articles;

  return (
    <>
      {isVirtualized && topSpacerHeight > 0 && (
        <tbody aria-hidden="true" className="pointer-events-none select-none">
          <tr style={{ height: `${Math.round(topSpacerHeight)}px` }}>
            <td colSpan={11} style={{ padding: 0, border: 'none', height: `${Math.round(topSpacerHeight)}px` }} />
          </tr>
        </tbody>
      )}

      {visibleSlice.map((article, localOffset) => {
        const artIndex = isVirtualized ? startIdx + localOffset : localOffset;
        return (
          <ArticleGroup
            key={article.id}
            article={article}
            index={artIndex}
            globalIndex={globalArticleIndexMap.get(article.id) || 0}
            allArticlesMap={allArticlesMap}
            articleLocalNumberMap={articleLocalNumberMap}
            isPrintMode={false}
            isCategoryLocked={isCategoryLocked}
            isSurveyorGuardActive={isSurveyorGuardActive}
            projectSettings={projectSettings}
            lastMovedItemId={lastMovedItemId}
            recordingArticleId={recordingArticleId}
            onUpdateArticle={onUpdateArticle}
            onEditArticleDetails={onEditArticleDetails}
            onDeleteArticle={onDeleteArticle}
            onToggleArticleEnabled={onToggleArticleEnabled}
            onAddMeasurement={onAddMeasurement}
            onAddSubtotal={onAddSubtotal}
            onUpdateMeasurement={onUpdateMeasurement}
            onDeleteMeasurement={onDeleteMeasurement}
            onOpenLinkModal={onOpenLinkModal}
            onScrollToArticle={onScrollToArticle}
            onArticleDragStart={onArticleDragStart}
            onArticleDrop={onArticleDrop}
            onArticleDragEnd={onArticleDragEnd}
            lastAddedMeasurementId={lastAddedMeasurementId}
            onColumnFocus={onColumnFocus}
            onViewAnalysis={onViewAnalysis}
            onInsertExternalArticle={onInsertExternalArticle}
            onToggleArticleLock={onToggleArticleLock}
            onOpenRebarCalculator={onOpenRebarCalculator}
            onOpenPaintingCalculator={onOpenPaintingCalculator}
            onToggleSmartRepeat={onToggleSmartRepeat}
            onToggleItemDisplayMode={onToggleItemDisplayMode}
            onStartVoiceDictation={onStartVoiceDictation}
            smartRepeatActiveId={smartRepeatActiveId}
            onMeasurementDrop={onMeasurementDrop}
            voiceActiveRowId={voiceActiveRowId}
            voiceActiveField={voiceActiveField}
            onVoiceCellFocus={onVoiceCellFocus}
            onOpenContextMenu={onOpenContextMenu}
            onTbodyRef={isVirtualized ? handleTbodyRef : undefined}
          />
        );
      })}

      {isVirtualized && bottomSpacerHeight > 0 && (
        <tbody aria-hidden="true" className="pointer-events-none select-none">
          <tr style={{ height: `${Math.round(bottomSpacerHeight)}px` }}>
            <td colSpan={11} style={{ padding: 0, border: 'none', height: `${Math.round(bottomSpacerHeight)}px` }} />
          </tr>
        </tbody>
      )}
    </>
  );
};
