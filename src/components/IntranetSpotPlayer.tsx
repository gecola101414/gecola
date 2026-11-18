import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  FileSpreadsheet,
  FileText,
  Calculator,
  CalendarRange,
  ShieldCheck,
  CheckCircle2,
  Phone,
  Mail,
  ArrowRight,
  MonitorPlay,
  XCircle,
} from 'lucide-react';

interface IntranetSpotPlayerProps {
  youtubeBlockedNotice?: boolean;
  hasLocalMp4?: boolean;
  canTryYoutube?: boolean;
  onSwitchToYoutube?: () => void;
  onClose: () => void;
  onTryDemo?: () => void;
  onVisitorEnter?: () => void;
}

interface SpotScene {
  id: string;
  durationSec: number;
  chapter: string;
  title: string;
  subtitle: string;
  narration: string;
}

const SCENES: SpotScene[] = [
  {
    id: 'intro',
    durationSec: 7,
    chapter: '01. Presentazione',
    title: 'Computi Metrici e Contabilità Lavori direttamente nel browser',
    subtitle:
      'Nessuna installazione locale, compatibile con reti aziendali e intranet protette. Avvio immediato su qualsiasi postazione.',
    narration:
      'Benvenuti in GeCoLa Web. La piattaforma professionale per computi metrici estimativi, analisi prezzi e contabilità lavori direttamente dal browser, senza alcuna installazione.',
  },
  {
    id: 'import',
    durationSec: 8,
    chapter: '02. Importazione PriMus & PDF',
    title: 'Trascina file DCF, XPWE o PDF direttamente dentro una WBS',
    subtitle:
      'Riconoscimento automatico di codici tariffa regionali, descrizioni estese, unità di misura, quantità e importi.',
    narration:
      'Trascina un computo PriMus in formato DCF, XPWE oppure una stampa PDF direttamente nella WBS di destinazione: tariffe, descrizioni e importi vengono acquisiti all’istante.',
  },
  {
    id: 'measure',
    durationSec: 8,
    chapter: '03. Prezzari e Misure',
    title: 'Libretto delle misure analitico e Prezzari Regionali aggiornati',
    subtitle:
      'Gestione completa di parti uguali, dimensioni, detrazioni, manodopera, categorie SOA e nuovi prezzi con calcolo in tempo reale.',
    narration:
      'Gestisci libretto delle misure, detrazioni, incidenza manodopera, categorie SOA e Prezzari Regionali con ricalcolo istantaneo anche su computi complessi.',
  },
  {
    id: 'gantt',
    durationSec: 7,
    chapter: '04. Cronoprogramma & Stampe',
    title: 'Diagramma di Gantt per WBS ed esportazione PDF, Excel e XPWE',
    subtitle:
      'Genera in un clic fascicoli impaginati pronti per la gara, fogli Excel strutturati e file compatibili con ACCA PriMus.',
    narration:
      'Pianifica le lavorazioni con il cronoprogramma Gantt per WBS ed esporta in un clic computi impaginati in PDF, fogli Excel e file compatibili PriMus.',
  },
  {
    id: 'cta',
    durationSec: 8,
    chapter: '05. Accesso Rapido',
    title: 'Pronto per Studi Tecnici, Pubblica Amministrazione ed Enti',
    subtitle:
      'Prova subito il progetto dimostrativo di Milano oppure accedi con un computo vuoto come Visitatore.',
    narration:
      'Inizia subito senza configurazioni: esplora il progetto dimostrativo completo di Milano o apri un nuovo computo vuoto.',
  },
];

const TOTAL_DURATION = SCENES.reduce((acc, s) => acc + s.durationSec, 0);

const SCENE_OFFSETS = SCENES.reduce<number[]>((acc, s, idx) => {
  acc.push(idx === 0 ? 0 : acc[idx - 1] + SCENES[idx - 1].durationSec);
  return acc;
}, []);

const IntranetSpotPlayer: React.FC<IntranetSpotPlayerProps> = ({
  youtubeBlockedNotice = false,
  hasLocalMp4 = false,
  canTryYoutube = true,
  onSwitchToYoutube,
  onClose,
  onTryDemo,
  onVisitorEnter,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [sourceType, setSourceType] = useState<'interactive' | 'mp4'>(hasLocalMp4 ? 'mp4' : 'interactive');
  const lastSpokenSceneRef = useRef<number>(-1);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (hasLocalMp4) {
      setSourceType('mp4');
    }
  }, [hasLocalMp4]);

  // Calcola indice scena corrente e progresso interno [0..1]
  let activeSceneIdx = SCENES.length - 1;
  for (let i = 0; i < SCENES.length; i++) {
    const start = SCENE_OFFSETS[i];
    const end = start + SCENES[i].durationSec;
    if (elapsedSec < end) {
      activeSceneIdx = i;
      break;
    }
  }
  const activeScene = SCENES[activeSceneIdx];
  const sceneElapsed = Math.max(0, elapsedSec - SCENE_OFFSETS[activeSceneIdx]);
  const sceneProgress = Math.min(1, sceneElapsed / activeScene.durationSec);

  // Loop animazione fluido con requestAnimationFrame
  useEffect(() => {
    if (sourceType !== 'interactive' || !isPlaying) {
      lastTickRef.current = null;
      return;
    }

    const tick = (now: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
      }
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      setElapsedSec((prev) => {
        const next = prev + dt;
        return next >= TOTAL_DURATION ? 0 : next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = null;
    };
  }, [isPlaying, sourceType]);

  // Sintesi vocale offline (Web Speech API) quando l'utente abilita l'audio
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (!voiceEnabled || !isPlaying || sourceType !== 'interactive') {
      window.speechSynthesis.cancel();
      if (!voiceEnabled) lastSpokenSceneRef.current = -1;
      return;
    }

    if (lastSpokenSceneRef.current !== activeSceneIdx) {
      lastSpokenSceneRef.current = activeSceneIdx;
      window.speechSynthesis.cancel();
      try {
        const utterance = new SpeechSynthesisUtterance(activeScene.narration);
        utterance.lang = 'it-IT';
        utterance.rate = 1.02;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Ignore speech synthesis restrictions
      }
    }
  }, [voiceEnabled, isPlaying, activeSceneIdx, activeScene.narration, sourceType]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const jumpToScene = (idx: number) => {
    const clamped = Math.max(0, Math.min(SCENES.length - 1, idx));
    lastSpokenSceneRef.current = -1;
    setElapsedSec(SCENE_OFFSETS[clamped]);
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    lastSpokenSceneRef.current = -1;
    setElapsedSec(ratio * TOTAL_DURATION);
  };

  const formatTime = (sec: number) => {
    const s = Math.floor(sec);
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const renderSceneVisual = () => {
    switch (activeScene.id) {
      case 'intro':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center w-full max-w-4xl mx-auto">
            <div className="lg:col-span-7 space-y-3 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-400">
                Presentazione Piattaforma · Modalità Intranet Compatibile
              </div>
              <h3
                className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-tight"
                style={{ textWrap: 'balance' }}
              >
                {activeScene.title}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
                {activeScene.subtitle}
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>Browser HTML5</span>
                <span aria-hidden="true">·</span>
                <span>Zero Plugin Esterni</span>
                <span aria-hidden="true">·</span>
                <span>Compatibile PriMus ACCA</span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 shadow-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-orange-500 p-1.5 rounded-lg">
                      <Calculator className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm font-black text-white tracking-tight">GeCoLa WEB</span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400">PRONTO</span>
                </div>

                <div className="space-y-2 text-xs">
                  {[
                    { label: 'WBS.01 · Demolizioni e Rimozioni', val: '924,94 €', w: '78%' },
                    { label: 'WBS.02 · Impianti Idro-Termici', val: '3.275,00 €', w: '92%' },
                    { label: 'WBS.03 · Opere Murarie e Finiture', val: '3.624,68 €', w: '65%' },
                  ].map((row, idx) => (
                    <div
                      key={row.label}
                      className="bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 transition-transform duration-500"
                      style={{
                        opacity: sceneProgress > idx * 0.14 ? 1 : 0.25,
                        transform: `translateY(${sceneProgress > idx * 0.14 ? 0 : 8}px)`,
                      }}
                    >
                      <div className="flex items-center justify-between text-slate-200 font-medium mb-1">
                        <span className="truncate pr-2">{row.label}</span>
                        <span className="font-mono tabular-nums text-blue-300 shrink-0">{row.val}</span>
                      </div>
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: row.w }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'import':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center w-full max-w-4xl mx-auto">
            <div className="lg:col-span-6 space-y-3 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                02 · Caricamento Diretto Drag & Drop
              </div>
              <h3
                className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-tight"
                style={{ textWrap: 'balance' }}
              >
                {activeScene.title}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">{activeScene.subtitle}</p>
            </div>

            <div className="lg:col-span-6">
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 space-y-3">
                {/* Simulazione file trascinato nella WBS */}
                <div className="flex items-center gap-3">
                  <div
                    className="bg-blue-600/20 border border-blue-400/60 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-blue-100 font-semibold transition-transform duration-700"
                    style={{
                      transform: `translateX(${Math.min(1, sceneProgress * 1.8) * 10}px)`,
                    }}
                  >
                    <FileText className="w-4 h-4 text-orange-400 shrink-0" />
                    <span className="truncate">Computo_Lombardia_2026.pdf</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="bg-slate-950 border border-dashed border-orange-400/70 rounded-xl px-3 py-2 text-xs font-bold text-orange-300 whitespace-nowrap">
                    Rilascia in WBS.02
                  </div>
                </div>

                {/* Risultato estrazione immediata */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden text-[11px]">
                  <div className="grid grid-cols-12 bg-slate-800/80 text-slate-300 font-semibold px-3 py-1.5">
                    <span className="col-span-4">Tariffa</span>
                    <span className="col-span-5">Lavorazione</span>
                    <span className="col-span-3 text-right">Importo</span>
                  </div>
                  {[
                    { code: 'LOM261.1C.01.050', desc: 'Demolizione pavimenti', tot: '111,00 €' },
                    { code: 'LOM261.1C.01.060', desc: 'Rimozione sanitari', tot: '168,00 €' },
                    { code: 'LOM261.1C.09.030', desc: 'Rivestimento gres 30x60', tot: '1.435,20 €' },
                  ].map((item, idx) => (
                    <div
                      key={item.code}
                      className="grid grid-cols-12 px-3 py-2 border-t border-slate-800/80 text-slate-200 transition-opacity duration-500"
                      style={{ opacity: sceneProgress > 0.18 + idx * 0.18 ? 1 : 0.2 }}
                    >
                      <span className="col-span-4 font-mono text-orange-300 truncate">{item.code}</span>
                      <span className="col-span-5 truncate pr-1">{item.desc}</span>
                      <span className="col-span-3 text-right font-mono tabular-nums text-emerald-300">
                        {item.tot}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'measure':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center w-full max-w-4xl mx-auto">
            <div className="lg:col-span-5 space-y-3 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-400">
                03 · Calcolo Analitico & Prezzari
              </div>
              <h3
                className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-tight"
                style={{ textWrap: 'balance' }}
              >
                {activeScene.title}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">{activeScene.subtitle}</p>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 space-y-2.5 text-[11px]">
                <div className="flex items-center justify-between text-slate-300 border-b border-slate-800 pb-2">
                  <span className="font-mono text-blue-300 font-semibold">WBS.03 · OPERE MURARIE</span>
                  <span className="font-mono tabular-nums text-white font-bold">Totale: 1.435,20 €</span>
                </div>
                <div className="grid grid-cols-12 text-slate-400 font-semibold px-2">
                  <span className="col-span-5">Descrizione Rigo Misura</span>
                  <span className="col-span-1 text-right">P.ug</span>
                  <span className="col-span-2 text-right">Lung.</span>
                  <span className="col-span-2 text-right">Alt.</span>
                  <span className="col-span-2 text-right">Quantità</span>
                </div>
                {[
                  { desc: 'Parete Nord + Sud bagno', p: '2', l: '3,00', h: '2,40', q: '14,40', neg: false },
                  { desc: 'Parete Est + Ovest bagno', p: '2', l: '2,00', h: '2,40', q: '9,60', neg: false },
                  { desc: 'A detrarre vano porta ingresso', p: '1', l: '0,80', h: '2,40', q: '-1,92', neg: true },
                ].map((r, idx) => (
                  <div
                    key={r.desc}
                    className={`grid grid-cols-12 px-2 py-1.5 rounded-lg border transition-opacity duration-500 ${
                      r.neg
                        ? 'bg-red-950/30 border-red-900/50 text-red-200'
                        : 'bg-slate-950/70 border-slate-800 text-slate-200'
                    }`}
                    style={{ opacity: sceneProgress > idx * 0.2 ? 1 : 0.2 }}
                  >
                    <span className="col-span-5 truncate pr-2">{r.desc}</span>
                    <span className="col-span-1 text-right font-mono tabular-nums">{r.p}</span>
                    <span className="col-span-2 text-right font-mono tabular-nums">{r.l}</span>
                    <span className="col-span-2 text-right font-mono tabular-nums">{r.h}</span>
                    <span className="col-span-2 text-right font-mono tabular-nums font-bold">{r.q}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-slate-300 font-mono tabular-nums">
                  <span>SOMMANO m²</span>
                  <span className="text-sm font-black text-emerald-400">22,08 m² × 65,00 € = 1.435,20 €</span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'gantt':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center w-full max-w-4xl mx-auto">
            <div className="lg:col-span-6 space-y-3 text-left">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                04 · Cronoprogramma & Esportazioni
              </div>
              <h3
                className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-tight"
                style={{ textWrap: 'balance' }}
              >
                {activeScene.title}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">{activeScene.subtitle}</p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-200 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-red-400" /> Stampa PDF
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Excel .XLSX
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarRange className="w-3.5 h-3.5 text-blue-400" /> Gantt Lavori
                </span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-300 border-b border-slate-800 pb-2">
                  <span className="font-bold">Cronoprogramma Lavorazioni (Settimane 1–6)</span>
                  <span className="font-mono tabular-nums text-orange-400">42 gg</span>
                </div>
                <div className="space-y-2.5 text-[11px]">
                  {[
                    { name: 'WBS.01 · Demolizioni', left: '0%', width: '28%', color: 'bg-orange-500' },
                    { name: 'WBS.02 · Impianti Idro-Elettrici', left: '22%', width: '36%', color: 'bg-blue-500' },
                    { name: 'WBS.03 · Massetti e Impermeab.', left: '48%', width: '26%', color: 'bg-sky-500' },
                    { name: 'WBS.04 · Rivestimenti e Sanitari', left: '68%', width: '32%', color: 'bg-emerald-500' },
                  ].map((bar, idx) => (
                    <div key={bar.name} className="space-y-1">
                      <div className="flex justify-between text-slate-300">
                        <span>{bar.name}</span>
                      </div>
                      <div className="h-3 bg-slate-950 rounded-md border border-slate-800 relative overflow-hidden">
                        <div
                          className={`absolute top-0 bottom-0 ${bar.color} rounded transition-transform duration-700 origin-left`}
                          style={{
                            left: bar.left,
                            width: bar.width,
                            transform: `scaleX(${Math.min(1, Math.max(0.1, (sceneProgress - idx * 0.1) * 2.2))})`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'cta':
      default:
        return (
          <div className="w-full max-w-3xl mx-auto text-center space-y-5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
              <ShieldCheck className="w-4 h-4" /> Operativo anche in Reti Intranet senza accesso a YouTube
            </div>
            <h3
              className="text-2xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight"
              style={{ textWrap: 'balance' }}
            >
              {activeScene.title}
            </h3>
            <p className="text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
              {activeScene.subtitle}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              {onTryDemo && (
                <button
                  type="button"
                  onClick={onTryDemo}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-lg transition-colors flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Apri Demo Ristrutturazione Milano
                </button>
              )}
              {onVisitorEnter && (
                <button
                  type="button"
                  onClick={onVisitorEnter}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-xs px-5 py-3 rounded-xl transition-colors"
                >
                  Entra come Visitatore
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 pt-2 text-xs text-slate-400 font-mono">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-orange-400" /> 351 9822401
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-orange-400" /> gecolakey@gmail.com
              </span>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-slate-950 z-40 flex flex-col justify-between overflow-hidden select-none">
      {/* Sfondo tecnico griglia + gradient discreto */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-slate-950/80 pointer-events-none" />

      {/* Top Bar player */}
      <div className="relative z-20 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800/80 bg-slate-950/75 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-white whitespace-nowrap shrink-0">
            <MonitorPlay className="w-4 h-4 text-orange-400" />
            <span>Spot Presentazione 2026</span>
          </div>
          {youtubeBlockedNotice && (
            <span className="hidden sm:inline text-[11px] text-amber-300/90 truncate">
              · YouTube bloccato dalla rete: attiva modalità locale
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasLocalMp4 && (
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setSourceType('mp4')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
                  sourceType === 'mp4' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Video MP4 Locale
              </button>
              <button
                type="button"
                onClick={() => setSourceType('interactive')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
                  sourceType === 'interactive' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                Spot Interattivo
              </button>
            </div>
          )}

          {canTryYoutube && onSwitchToYoutube && (
            <button
              type="button"
              onClick={onSwitchToYoutube}
              className="text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
            >
              Prova YouTube
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi presentazione"
            className="text-slate-300 hover:text-white hover:bg-red-600/80 p-1.5 rounded-lg transition-colors"
            title="Chiudi player e mostra sfondo"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Area centrale video/animazione */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-4 overflow-y-auto">
        {sourceType === 'mp4' && hasLocalMp4 ? (
          <video
            src="/spot-gecola.mp4"
            controls
            autoPlay
            muted
            playsInline
            className="w-full h-full max-h-full rounded-xl bg-black object-contain shadow-2xl border border-slate-800"
          >
            Il browser non supporta il tag video HTML5.
          </video>
        ) : (
          renderSceneVisual()
        )}
      </div>

      {/* Barra inferiore controlli player (solo in modalità Spot Interattivo) */}
      {sourceType === 'interactive' && (
        <div className="relative z-20 px-4 py-3 bg-slate-950/90 border-t border-slate-800/80 space-y-2.5">
          {/* Timeline cliccabile */}
          <div
            onClick={handleScrub}
            role="slider"
            aria-label="Avanzamento presentazione"
            aria-valuemin={0}
            aria-valuemax={TOTAL_DURATION}
            aria-valuenow={Math.round(elapsedSec)}
            tabIndex={0}
            className="w-full h-2 bg-slate-800 rounded-full cursor-pointer overflow-hidden relative group"
          >
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-blue-500 transition-[width] duration-75"
              style={{ width: `${(elapsedSec / TOTAL_DURATION) * 100}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Pulsanti trasporto */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                aria-label={isPlaying ? 'Pausa' : 'Riproduci'}
                className="bg-orange-500 hover:bg-orange-600 text-white p-2 rounded-lg transition-colors"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => jumpToScene(activeSceneIdx - 1)}
                aria-label="Scena precedente"
                className="text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-lg transition-colors"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => jumpToScene(activeSceneIdx + 1)}
                aria-label="Scena successiva"
                className="text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-lg transition-colors"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  lastSpokenSceneRef.current = -1;
                  setElapsedSec(0);
                  setIsPlaying(true);
                }}
                aria-label="Riavvia spot"
                className="text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <span className="text-xs font-mono tabular-nums text-slate-400 ml-1">
                {formatTime(elapsedSec)} / {formatTime(TOTAL_DURATION)}
              </span>
            </div>

            {/* Selettore capitoli */}
            <div className="hidden xl:flex items-center gap-1">
              {SCENES.map((sc, idx) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => jumpToScene(idx)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                    idx === activeSceneIdx
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {sc.chapter}
                </button>
              ))}
            </div>

            {/* Voce guida locale (Sintesi Vocale it-IT) */}
            <button
              type="button"
              onClick={() => {
                lastSpokenSceneRef.current = -1;
                setVoiceEnabled((v) => !v);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                voiceEnabled
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Attiva o disattiva la voce guida locale (funziona offline senza YouTube)"
            >
              {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{voiceEnabled ? 'Voce Guida ON' : 'Voce Guida OFF'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntranetSpotPlayer;
