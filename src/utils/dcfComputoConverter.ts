import * as pako from 'pako';
import { Article, Category, Measurement, ProjectInfo } from '../types';
import { ConvertedComputoResult } from './pdfComputoConverter';

/**
 * DcfImporter - Modulo nativo per la decodifica e importazione dei file .dcf (ACCA Software / PriMus)
 *
 * Architettura supportata:
 * 1. Contenitore Compound File binario con firma proprietaria `AAMVHFSS` / `AASFSSGN` o standard OLE2 (`D0 CF 11 E0`).
 * 2. Estrazione degli stream da Directory Entries + catene FAT / MiniFAT, affiancata da scanner binario diretto
 *    dei blocchi `AACS` + stream Zlib/Deflate (`0x78 0x9C`, `0x78 0xDA`, `0x78 0x01`, `0x78 0x5E`).
 * 3. Decompressione Zlib resiliente a byte di padding finali e decodifica intelligente UTF-8 / Windows-1252 / UTF-16LE.
 * 4. Parsing XML per `InfoDoc.xml`, `DatiGenerali.xml`, `CollectionGP.xml`, `CollectionEP.xml`, `CollectionVC.xml`
 *    (oltre a supporto per formato `.xpwe` / XML PriMus).
 */

export interface ExtractedDcfStreams {
  infoDocXml?: string;
  datiGeneraliXml?: string;
  collectionGPXml?: string;
  collectionEPXml?: string;
  collectionVCXml?: string;
  collectionSTXml?: string;
  xpweXml?: string;
  rawXmlStreams: Array<{ name: string; xml: string }>;
}

interface RawEpArticle {
  id: string;
  code: string;
  description: string;
  shortDescription?: string;
  unit: string;
  unitPrice: number;
  laborRate?: number;
  categoryId?: string;
  priceListSource?: string;
}

interface RawGpCategory {
  id: string;
  code: string;
  name: string;
  parentId?: string;
  isSuperCategory?: boolean;
  order: number;
}

interface RawVcMeasurement {
  description: string;
  multiplier?: number;
  length?: number;
  width?: number;
  height?: number;
  quantity?: number;
  isDeduction?: boolean;
  isSubtotal?: boolean;
  isCommentOnly?: boolean;
}

interface RawVcItem {
  id: string;
  epId: string;
  epCode?: string;
  categoryId?: string;
  superCategoryId?: string;
  quantity?: number;
  unitPrice?: number;
  descriptionOverride?: string;
  unitOverride?: string;
  measurements: RawVcMeasurement[];
  order: number;
}

const OLE_MAGIC = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
const ACCA_MAGIC_1 = 'AAMVHFSS';
const ACCA_MAGIC_2 = 'AASFSSGN';
const ENDOFCHAIN = 0xFFFFFFFE;
const FREESECT = 0xFFFFFFFF;

// Mappa inversa Unicode -> Windows-1252 per byte 0x80..0x9F (utile se un file .dcf è stato salvato/incollato come testo UTF-8)
const UNICODE_TO_CP1252: Record<number, number> = {
  0x20AC: 0x80,
  0x201A: 0x82,
  0x0192: 0x83,
  0x201E: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02C6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8A,
  0x2039: 0x8B,
  0x0152: 0x8C,
  0x017D: 0x8E,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201C: 0x93,
  0x201D: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02DC: 0x98,
  0x2122: 0x99,
  0x0161: 0x9A,
  0x203A: 0x9B,
  0x0153: 0x9C,
  0x017E: 0x9E,
  0x0178: 0x9F
};

function readUint16LE(buf: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > buf.length) return 0;
  return buf[offset] | (buf[offset + 1] << 8);
}

function readUint32LE(buf: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > buf.length) return 0;
  return (
    (buf[offset]) |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] * 0x1000000)
  ) >>> 0;
}

/**
 * Legge un uint32LE gestendo anche il caso in cui un file .dcf sia stato incollato come testo
 * (dove i byte alti 0x00 sono diventati 0x20).
 */
function readAccaSize32LE(buf: Uint8Array, offset: number, maxReasonable = 0x04000000): number {
  if (offset < 0 || offset + 4 > buf.length) return 0;
  const raw = readUint32LE(buf, offset);
  if (raw <= maxReasonable) return raw;

  const b0 = buf[offset] === 0x20 ? 0x00 : buf[offset];
  const b1 = buf[offset + 1] === 0x20 ? 0x00 : buf[offset + 1];
  const b2 = buf[offset + 2] === 0x20 ? 0x00 : buf[offset + 2];
  const b3 = buf[offset + 3] === 0x20 ? 0x00 : buf[offset + 3];
  const repaired = (b0 | (b1 << 8) | (b2 << 16) | (b3 * 0x1000000)) >>> 0;
  return repaired <= maxReasonable ? repaired : 0;
}

function isZlibHeader(b0: number, b1: number): boolean {
  // CMF = 0x78 (Deflate, 32K window), FLG check: (CMF * 256 + FLG) % 31 === 0
  if (b0 !== 0x78) return false;
  if (b1 !== 0x01 && b1 !== 0x5E && b1 !== 0x9C && b1 !== 0xDA) {
    return ((b0 << 8) | b1) % 31 === 0;
  }
  return true;
}

const UTF8_DECODER = new TextDecoder('utf-8');
const UTF8_FATAL_DECODER = new TextDecoder('utf-8', { fatal: true });
const WIN1252_DECODER = new TextDecoder('windows-1252');
const UTF16LE_DECODER = new TextDecoder('utf-16le');
const ASCII_DECODER = new TextDecoder('ascii');

/**
 * Se il file .dcf è stato copiato/incollato come testo UTF-8 (dove i byte > 127 sono stati codificati in sequenze UTF-8
 * a 2-3 byte e i byte 0x00 in spazi 0x20), ricostruisce il buffer binario single-byte Windows-1252.
 */
function normalizeDcfInputBuffer(buf: Uint8Array): { buf: Uint8Array; isTextNormalized: boolean } {
  if (buf.length < 16) return { buf, isTextNormalized: false };
  const head8 = String.fromCharCode(...buf.subarray(0, 8));
  if (
    head8 === ACCA_MAGIC_1 &&
    (buf[8] === 0x20 || buf[8] === 0xC3 || buf[8] === 0xC2 || (buf[8] === 0xFE && buf[9] === 0xFF))
  ) {
    try {
      const text = UTF8_DECODER.decode(buf);
      const out = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) {
        const cp = text.charCodeAt(i);
        if (cp <= 0xFF) {
          out[i] = cp;
        } else if (UNICODE_TO_CP1252[cp] !== undefined) {
          out[i] = UNICODE_TO_CP1252[cp];
        } else {
          out[i] = cp & 0xFF;
        }
      }
      return { buf: out, isTextNormalized: true };
    } catch {
      return { buf, isTextNormalized: false };
    }
  }
  return { buf, isTextNormalized: false };
}

/**
 * Esegue un tentativo di decompressione catturando sia l'output prodotto sia la posizione esatta
 * in cui lo stream Deflate si è eventualmente interrotto.
 */
function runPakoProbe(
  input: Uint8Array,
  raw: boolean
): { ok: boolean; output: Uint8Array; consumedInput: number } {
  const inflator = new pako.Inflate({ raw });
  const chunks: Uint8Array[] = [];
  const origOnData = inflator.onData;
  inflator.onData = (chunk: Uint8Array) => {
    chunks.push(new Uint8Array(chunk));
    if (origOnData) origOnData.call(inflator, chunk);
  };

  try {
    inflator.push(input, true);
  } catch {
    // Ignora eccezione sincrona
  }

  const strm = (inflator as any).strm;
  if (strm && strm.next_out > 0 && strm.output) {
    const partial = new Uint8Array(strm.output.subarray(0, strm.next_out));
    let alreadyLen = 0;
    for (let i = 0; i < chunks.length; i++) alreadyLen += chunks[i].length;
    if (alreadyLen === 0) {
      chunks.push(partial);
    }
  }

  let totalLen = 0;
  for (let i = 0; i < chunks.length; i++) totalLen += chunks[i].length;
  const merged = chunks.length === 1 ? chunks[0] : new Uint8Array(totalLen);
  if (chunks.length > 1) {
    let pos = 0;
    for (const c of chunks) {
      merged.set(c, pos);
      pos += c.length;
    }
  }

  const consumedInput = strm && typeof strm.next_in === 'number' ? strm.next_in : 0;
  const ok = inflator.err === 0 && Boolean((inflator as any).ended);
  return { ok, output: merged, consumedInput };
}

/**
 * Ripara al volo i byte `0x20` (che erano `0x00` o `0x07`) e `0x0A` (che erano `0x0D` o `0x0B`)
 * nei file .dcf che sono stati salvati/incollati come testo anziché come binario puro.
 */
function repairTextCorruptedDeflate(
  input: Uint8Array,
  raw: boolean,
  maxSteps = 250
): Uint8Array | null {
  const working = new Uint8Array(input);
  const startOffset = raw ? 0 : 2;
  let bestOutput: Uint8Array = new Uint8Array(0);

  interface SearchNode {
    buf: Uint8Array;
    consumed: number;
    outLen: number;
  }

  const initialProbe = runPakoProbe(working, raw);
  if (initialProbe.output.length > bestOutput.length) {
    bestOutput = initialProbe.output;
  }
  if (initialProbe.ok) return initialProbe.output;

  const stack: SearchNode[] = [
    {
      buf: working,
      consumed: initialProbe.consumedInput,
      outLen: initialProbe.output.length
    }
  ];
  const visitedSigs = new Set<string>();
  let steps = 0;

  while (stack.length > 0 && steps < maxSteps) {
    steps++;
    stack.sort((a, b) => b.consumed - a.consumed || b.outLen - a.outLen);
    const curr = stack.shift()!;

    const winStart = Math.max(startOffset, curr.consumed - 18);
    const winEnd = Math.min(curr.buf.length - 1, curr.consumed + 2);

    const candidates: Array<{ pos: number; alt: number }> = [];
    for (let p = winEnd; p >= winStart; p--) {
      const b = curr.buf[p];
      if (b === 0x20) {
        candidates.push({ pos: p, alt: 0x00 });
        candidates.push({ pos: p, alt: 0x07 });
      } else if (b === 0x0A) {
        candidates.push({ pos: p, alt: 0x0D });
        candidates.push({ pos: p, alt: 0x0B });
      }
    }

    for (const cand of candidates) {
      const nextBuf = new Uint8Array(curr.buf);
      nextBuf[cand.pos] = cand.alt;

      const probe = runPakoProbe(nextBuf, raw);
      if (probe.output.length > bestOutput.length) {
        bestOutput = probe.output;
      }
      if (probe.ok && probe.output.length > 0) {
        return probe.output;
      }

      if (
        probe.consumedInput > curr.consumed ||
        (probe.consumedInput === curr.consumed && probe.output.length > curr.outLen)
      ) {
        const sig = `${cand.pos}:${cand.alt}:${probe.consumedInput}:${probe.output.length}`;
        if (!visitedSigs.has(sig)) {
          visitedSigs.add(sig);
          stack.push({
            buf: nextBuf,
            consumed: probe.consumedInput,
            outLen: probe.output.length
          });
        }
      }
    }
  }

  return bestOutput.length > 0 ? bestOutput : null;
}

/**
 * Decomprime uno stream Raw Deflate (senza i 2 byte di header Zlib), tollerando eventuali byte di coda
 * o corruzioni da copia-incolla testuale (solo se allowRepair è attivo).
 */
function safeRawDeflateInflate(rawDeflate: Uint8Array, allowRepair = false): Uint8Array | null {
  if (!rawDeflate || rawDeflate.length < 2) return null;

  try {
    const res = pako.inflateRaw(rawDeflate);
    if (res && res.length > 0) return res;
  } catch {
    // Prova probe tollerante a trailing bytes
  }

  const probe = runPakoProbe(rawDeflate, true);
  if (probe.ok && probe.output.length > 0) {
    return probe.output;
  }

  if (allowRepair) {
    const repaired = repairTextCorruptedDeflate(rawDeflate, true);
    if (repaired && repaired.length > 0) {
      return repaired;
    }
  }

  return null;
}

/**
 * Decomprime uno stream Zlib/Deflate gestendo in modo sicuro eventuali byte di coda/padding
 * presenti nel contenitore binario dopo la fine logica dello stream compresso.
 */
function safeZlibInflate(compressed: Uint8Array, allowRepair = false): Uint8Array | null {
  if (!compressed || compressed.length < 2) return null;

  try {
    const res = pako.inflate(compressed);
    if (res && res.length > 0) return res;
  } catch {
    // Prova probe tollerante a trailing bytes
  }

  const probe = runPakoProbe(compressed, false);
  if (probe.ok && probe.output.length > 0) {
    return probe.output;
  }

  if (allowRepair) {
    const repairedZlib = repairTextCorruptedDeflate(compressed, false);
    const repairedRaw =
      compressed.length > 2 ? repairTextCorruptedDeflate(compressed.subarray(2), true) : null;

    if (repairedZlib && repairedRaw) {
      return repairedZlib.length >= repairedRaw.length ? repairedZlib : repairedRaw;
    }
    return repairedZlib || repairedRaw || null;
  }

  return null;
}

/**
 * Decodifica un array di byte XML gestendo automaticamente UTF-8, Windows-1252 (standard italiano PriMus) e UTF-16LE.
 */
export function decodeDcfXmlBytes(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) return '';

  // Controllo BOM UTF-16LE (FF FE)
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return UTF16LE_DECODER.decode(bytes.subarray(2));
  }
  // Controllo UTF-16LE senza BOM (caratteri ASCII alternati a 0x00)
  if (bytes.length >= 4 && bytes[0] === 0x3C && bytes[1] === 0x00 && bytes[2] === 0x3F && bytes[3] === 0x00) {
    return UTF16LE_DECODER.decode(bytes);
  }
  // Controllo BOM UTF-8 (EF BB BF)
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return UTF8_DECODER.decode(bytes.subarray(3));
  }

  // Ispezione prologo XML nei primi 160 byte per rilevare Windows-1252 / ISO-8859-1 dichiarato
  const prologSample = ASCII_DECODER.decode(bytes.subarray(0, Math.min(160, bytes.length))).toLowerCase();
  if (prologSample.includes('windows-1252') || prologSample.includes('iso-8859-1') || prologSample.includes('iso-8859-15')) {
    return WIN1252_DECODER.decode(bytes);
  }

  // Prova decodifica UTF-8 rigorosa; se ci sono sequenze non valide (es. accenti/simboli Windows-1252 come ², °, €, à, è), usa Windows-1252
  try {
    return UTF8_FATAL_DECODER.decode(bytes);
  } catch {
    return WIN1252_DECODER.decode(bytes);
  }
}

/**
 * Livello 3 ACCA PriMus:
 * Dopo aver decompresso lo stream Zlib esterno (che inizia a AACS + 144), PriMus restituisce un buffer `layer2`
 * che inizia con i 34 byte `\x1e\x00\x00\x00Copyright ACCA software S.p.A.` seguiti da un contenitore ZIP
 * (`PK\x03\x04` + nome entry `"CopyRightAcca2006"` / `"CopyRightAcca2002"` + Raw Deflate XML + `PK\x01\x02` + `PK\x05\x06`)
 * in cui i primi K byte dopo l'header (`layer2[34 .. 34 + K - 1]`, con K = 100 se L > 200 altrimenti floor(L/2) - 1)
 * sono stati scambiati con gli ultimi K byte del buffer (`layer2[N - K .. N - 1]`)!
 *
 * Questa funzione ripristina lo swap dei K byte ed estrae il payload interno (XML o sotto-contenitore .dcf).
 */
function unwrapAccaInnerContainer(layer2: Uint8Array, allowRepair = false): Uint8Array | null {
  if (!layer2 || layer2.length < 36) return null;

  const headAscii = ASCII_DECODER.decode(layer2.subarray(0, Math.min(48, layer2.length)));
  const hasAccaCopyright = headAscii.includes('Copyright ACCA');

  let pk34Pos = -1;
  const searchStart = Math.max(0, layer2.length - 300);
  for (let i = layer2.length - 4; i >= searchStart; i--) {
    if (
      layer2[i] === 0x50 &&
      layer2[i + 1] === 0x4B &&
      layer2[i + 2] === 0x03 &&
      layer2[i + 3] === 0x04
    ) {
      pk34Pos = i;
      break;
    }
  }

  if (pk34Pos === -1) {
    const anchor = [0x43, 0x6F, 0x70, 0x79, 0x52, 0x69, 0x67, 0x68, 0x74, 0x41, 0x63, 0x63, 0x61];
    for (let i = layer2.length - anchor.length; i >= 30; i--) {
      let match = true;
      for (let j = 0; j < anchor.length; j++) {
        if (layer2[i + j] !== anchor[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        if (i >= 46 && layer2[i - 46] === 0x50 && layer2[i - 45] === 0x4B && layer2[i - 44] === 0x01) {
          continue;
        }
        pk34Pos = i - 30;
        break;
      }
    }
  }

  if (pk34Pos === -1) {
    for (let i = 0; i <= layer2.length - 4; i++) {
      if (
        layer2[i] === 0x50 &&
        layer2[i + 1] === 0x4B &&
        layer2[i + 2] === 0x03 &&
        layer2[i + 3] === 0x04
      ) {
        pk34Pos = i;
        break;
      }
    }
  }

  if (hasAccaCopyright || pk34Pos !== -1) {
    const headerLen = hasAccaCopyright ? 34 : 0;
    const L = layer2.length - headerLen;
    const defaultK = L > 200 ? 100 : Math.max(0, Math.floor(L / 2) - 1);

    const candidateConfigs: Array<{ swapPos: number; k: number }> = [];
    if (pk34Pos > headerLen) {
      const kFromPk = Math.min(100, layer2.length - pk34Pos, pk34Pos - headerLen);
      candidateConfigs.push({ swapPos: pk34Pos, k: kFromPk });
    }
    if (defaultK > 0 && layer2.length - defaultK > headerLen) {
      candidateConfigs.push({ swapPos: layer2.length - defaultK, k: defaultK });
    }

    for (const { swapPos, k } of candidateConfigs) {
      const unswapped = new Uint8Array(layer2);
      for (let i = 0; i < k; i++) {
        const tmp = unswapped[headerLen + i];
        unswapped[headerLen + i] = unswapped[swapPos + i];
        unswapped[swapPos + i] = tmp;
      }

      if (
        unswapped[headerLen] === 0x50 &&
        unswapped[headerLen + 1] === 0x4B &&
        unswapped[headerLen + 2] === 0x03 &&
        unswapped[headerLen + 3] === 0x04
      ) {
        const compMethodRaw = readUint16LE(unswapped, headerLen + 8);
        const compMethod = compMethodRaw === 0 ? 0 : 8;
        const rawNameLen = readUint16LE(unswapped, headerLen + 26);
        const nameLen = rawNameLen > 0 && rawNameLen <= 64 ? rawNameLen : 17;
        const rawExtraLen = readUint16LE(unswapped, headerLen + 28);
        const extraLen = rawExtraLen <= 128 ? rawExtraLen : 0;
        const dataStart = headerLen + 30 + nameLen + extraLen;

        let pk12Pos = -1;
        for (let i = dataStart; i <= unswapped.length - 4; i++) {
          if (
            unswapped[i] === 0x50 &&
            unswapped[i + 1] === 0x4B &&
            unswapped[i + 2] === 0x01 &&
            unswapped[i + 3] === 0x02
          ) {
            pk12Pos = i;
            break;
          }
        }

        let compSize = 0;
        if (pk12Pos !== -1 && pk12Pos + 24 <= unswapped.length) {
          compSize = readAccaSize32LE(unswapped, pk12Pos + 20, unswapped.length);
        }
        if (!compSize || compSize <= 2) {
          const lfhCompSize = readAccaSize32LE(unswapped, headerLen + 18, unswapped.length);
          if (lfhCompSize > 32) compSize = lfhCompSize;
        }

        if (dataStart < unswapped.length) {
          const candidateSlices: Uint8Array[] = [];
          if (compSize > 0 && dataStart + compSize <= unswapped.length) {
            candidateSlices.push(unswapped.subarray(dataStart, dataStart + compSize));
          }
          if (pk12Pos > dataStart) {
            candidateSlices.push(unswapped.subarray(dataStart, pk12Pos));
            if (pk12Pos > dataStart + 15) {
              candidateSlices.push(unswapped.subarray(dataStart, pk12Pos - 15));
            }
          }
          candidateSlices.push(
            unswapped.subarray(dataStart, Math.max(dataStart + 1, unswapped.length - 85))
          );
          candidateSlices.push(unswapped.subarray(dataStart));

          for (const payloadSlice of candidateSlices) {
            if (compMethod === 0) {
              return payloadSlice;
            }
            const inflated = safeRawDeflateInflate(payloadSlice, allowRepair);
            if (inflated && inflated.length > 0) {
              return inflated;
            }
          }
        }
      }
    }

    if (pk34Pos > headerLen && pk34Pos + 30 <= layer2.length) {
      const compMethodRaw = readUint16LE(layer2, pk34Pos + 8);
      const compMethod = compMethodRaw === 0 ? 0 : 8;
      const rawNameLen = readUint16LE(layer2, pk34Pos + 26);
      const nameLen = rawNameLen > 0 && rawNameLen <= 64 ? rawNameLen : 17;
      const rawExtraLen = readUint16LE(layer2, pk34Pos + 28);
      const extraLen = rawExtraLen <= 128 ? rawExtraLen : 0;
      const headChunkStart = pk34Pos + 30 + nameLen + extraLen;
      const headChunkEnd = Math.min(layer2.length, pk34Pos + 100);

      if (headChunkStart < headChunkEnd) {
        const part1 = layer2.subarray(headChunkStart, headChunkEnd);
        const part2Start = Math.min(layer2.length, headerLen + 100);
        const part2End = Math.max(part2Start, pk34Pos);
        const part2 = layer2.subarray(part2Start, part2End);
        const part3 = layer2.subarray(headerLen, Math.min(layer2.length, headerLen + 100));

        const combined = new Uint8Array(part1.length + part2.length + part3.length);
        combined.set(part1, 0);
        combined.set(part2, part1.length);
        combined.set(part3, part1.length + part2.length);

        if (compMethod === 0) return combined;
        const inflated = safeRawDeflateInflate(combined, allowRepair);
        if (inflated && inflated.length > 0) return inflated;
      }
    }
  }

  return null;
}

function extractXmlFromLayer2(layer2: Uint8Array, allowRepair = false): { xml?: string; nestedDcf?: Uint8Array } | null {
  if (!layer2 || layer2.length === 0) return null;

  const unwrapped = unwrapAccaInnerContainer(layer2, allowRepair);
  if (unwrapped && unwrapped.length > 0) {
    if (
      unwrapped.length >= 8 &&
      String.fromCharCode(...unwrapped.subarray(0, 8)) === ACCA_MAGIC_1
    ) {
      return { nestedDcf: unwrapped };
    }
    const xml = decodeDcfXmlBytes(unwrapped);
    const trimmedUnwrapped = xml.trim();
    if (
      (trimmedUnwrapped.startsWith('<') || trimmedUnwrapped.startsWith('\ufeff<')) &&
      /<\s*[a-zA-Z_][a-zA-Z0-9_:.-]*(\s+[^>]*)?>/.test(trimmedUnwrapped)
    ) {
      return { xml };
    }
  }

  const directXml = decodeDcfXmlBytes(layer2);
  const trimmed = directXml.trim();
  if (
    (trimmed.startsWith('<') || trimmed.startsWith('\ufeff<')) &&
    /<\s*[a-zA-Z_][a-zA-Z0-9_:.-]*(\s+[^>]*)?>/.test(trimmed) &&
    !directXml.startsWith('\x1e')
  ) {
    return { xml: directXml };
  }

  return null;
}

function decodeSingleDcfStreamWithNested(
  streamBytes: Uint8Array,
  allowRepair = false
): { xml?: string; nestedDcf?: Uint8Array } | null {
  if (!streamBytes || streamBytes.length < 4) return null;

  let trimmedStart = 0;
  const maxWs = Math.min(32, streamBytes.length);
  while (
    trimmedStart < maxWs &&
    (streamBytes[trimmedStart] === 0x20 ||
      streamBytes[trimmedStart] === 0x09 ||
      streamBytes[trimmedStart] === 0x0D ||
      streamBytes[trimmedStart] === 0x0A)
  ) {
    trimmedStart++;
  }

  if (
    streamBytes[trimmedStart] === 0x3C ||
    (streamBytes[0] === 0xEF && streamBytes[1] === 0xBB && streamBytes[2] === 0xBF) ||
    (streamBytes[0] === 0xFF && streamBytes[1] === 0xFE)
  ) {
    const text = decodeDcfXmlBytes(streamBytes);
    if (text.includes('<') && text.includes('>')) return { xml: text };
  }

  if (
    streamBytes[0] === 0x41 &&
    streamBytes[1] === 0x41 &&
    streamBytes[2] === 0x43 &&
    streamBytes[3] === 0x53
  ) {
    if (streamBytes.length > 146 && isZlibHeader(streamBytes[144], streamBytes[145])) {
      const u1 = readAccaSize32LE(streamBytes, 128, streamBytes.length);
      const zlibSlice =
        u1 > 2 && 144 + u1 <= streamBytes.length
          ? streamBytes.subarray(144, 144 + u1)
          : streamBytes.subarray(144);
      const inflated = safeZlibInflate(zlibSlice, allowRepair);
      if (inflated && inflated.length > 0) {
        const extracted = extractXmlFromLayer2(inflated, allowRepair);
        if (extracted) return extracted;
      }
    }

    const searchLimit = Math.min(streamBytes.length - 2, 256);
    for (let offset = 4; offset < searchLimit; offset++) {
      if (offset === 144) continue;
      if (isZlibHeader(streamBytes[offset], streamBytes[offset + 1])) {
        const inflated = safeZlibInflate(streamBytes.subarray(offset), false);
        if (inflated && inflated.length > 0) {
          const extracted = extractXmlFromLayer2(inflated, false);
          if (extracted) return extracted;
        }
      }
    }

    let copyIdx = -1;
    const anchor = [0x43, 0x6F, 0x70, 0x79, 0x72, 0x69, 0x67, 0x68, 0x74, 0x20, 0x41, 0x43, 0x43, 0x41];
    for (let i = 0; i <= Math.min(streamBytes.length - anchor.length, 500); i++) {
      let m = true;
      for (let j = 0; j < anchor.length; j++) {
        if (streamBytes[i + j] !== anchor[j]) {
          m = false;
          break;
        }
      }
      if (m) {
        copyIdx = i;
        break;
      }
    }
    if (copyIdx !== -1) {
      const headPos = Math.max(0, copyIdx - 4);
      const extracted = extractXmlFromLayer2(streamBytes.subarray(headPos), allowRepair);
      if (extracted) return extracted;
    }
  }

  const maxScan = Math.min(streamBytes.length - 2, 256);
  for (let offset = 0; offset < maxScan; offset++) {
    if (isZlibHeader(streamBytes[offset], streamBytes[offset + 1])) {
      const inflated = safeZlibInflate(streamBytes.subarray(offset), false);
      if (inflated && inflated.length > 0) {
        const extracted = extractXmlFromLayer2(inflated, false);
        if (extracted) return extracted;
      }
    }
  }

  if (streamBytes[0] === 0x3C || (streamBytes.length < 4096 && streamBytes.includes(0x3C))) {
    const directText = decodeDcfXmlBytes(streamBytes);
    const trimmedDirect = directText.trim();
    if (
      (trimmedDirect.startsWith('<') || trimmedDirect.startsWith('\ufeff<')) &&
      /<\s*[a-zA-Z_][a-zA-Z0-9_:.-]*(\s+[^>]*)?>/.test(trimmedDirect)
    ) {
      return { xml: directText };
    }
  }

  return null;
}

function decodeSingleDcfStream(streamBytes: Uint8Array, allowRepair = false): string | null {
  const res = decodeSingleDcfStreamWithNested(streamBytes, allowRepair);
  return res?.xml ?? null;
}

/**
 * Livello 1 ACCA PriMus (`AAMVHFSS` / `AASFSSGN`):
 * Parser nativo per il contenitore paginato a 4096 byte di ACCA Software.
 */
function parseAccaPagedContainerStreams(buf: Uint8Array): Map<string, Uint8Array> {
  const streams = new Map<string, Uint8Array>();
  if (buf.length < 512) return streams;

  // Individua l'inizio di `AASFSSGN` (tipicamente a offset 280 = 0x118, oppure a offset 0)
  let aasfPos = -1;
  const maxHeaderScan = Math.min(buf.length - 8, 1024);
  for (let i = 0; i <= maxHeaderScan; i++) {
    if (
      buf[i] === 0x41 && // 'A'
      buf[i + 1] === 0x41 && // 'A'
      buf[i + 2] === 0x53 && // 'S'
      buf[i + 3] === 0x46 && // 'F'
      buf[i + 4] === 0x53 && // 'S'
      buf[i + 5] === 0x53 && // 'S'
      buf[i + 6] === 0x47 && // 'G'
      buf[i + 7] === 0x4E // 'N'
    ) {
      aasfPos = i;
      break;
    }
  }

  if (aasfPos === -1) return streams;

  const rawPageSize = readAccaSize32LE(buf, aasfPos + 16, 65536);
  const pageSize =
    rawPageSize === 4096 || rawPageSize === 2048 || rawPageSize === 8192 ? rawPageSize : 4096;
  const totalPages = Math.floor((buf.length - aasfPos) / pageSize);
  if (totalPages <= 1) return streams;

  // 1. Scansiona tutti i blocchi da 512 byte alla ricerca delle Directory Entries di ACCA PriMus
  interface AccaDirEntry {
    name: string;
    inodeSec: number;
    byteLength: number;
  }
  const dirEntries: AccaDirEntry[] = [];
  const seenDirNames = new Set<string>();

  for (let p = 1; p < totalPages; p++) {
    const pageOff = aasfPos + p * pageSize;
    // Le pagine dati iniziano con 0x90 0xEE 0x19; le saltiamo durante la scansione directory
    if (buf[pageOff] === 0x90 && buf[pageOff + 1] === 0xEE && buf[pageOff + 2] === 0x19) {
      continue;
    }

    const slots = Math.floor(pageSize / 512);
    for (let s = 0; s < slots; s++) {
      const entryOff = pageOff + s * 512;
      if (entryOff + 320 > buf.length) break;

      // Il nome dello stream in ACCA .dcf si trova a +256 (0x100) dentro la slot da 512 byte (o leggermente traslato a +254/+258)
      let nameStart = entryOff + 256;
      for (let candOff = entryOff + 248; candOff <= entryOff + 264; candOff++) {
        if (
          buf[candOff] >= 0x41 &&
          buf[candOff] <= 0x5A &&
          (buf[candOff - 1] === 0x00 || buf[candOff - 1] === 0x20)
        ) {
          nameStart = candOff;
          break;
        }
      }
      const firstChar = buf[nameStart];
      if (firstChar < 0x21 || firstChar > 0x7E) continue;

      let nameEnd = nameStart;
      while (
        nameEnd < nameStart + 64 &&
        buf[nameEnd] >= 0x20 &&
        buf[nameEnd] <= 0x7E &&
        !(buf[nameEnd] === 0x20 && buf[nameEnd + 1] === 0x20)
      ) {
        nameEnd++;
      }
      const nameLen = nameEnd - nameStart;
      if (nameLen < 3 || nameLen > 60) continue;

      // Verifica che dopo il nome ci siano 0x00 (o 0x20 nel caso di file incollati come testo)
      const trailingByte = buf[nameEnd];
      if (trailingByte !== 0x00 && trailingByte !== 0x20) continue;

      let candidateName = new TextDecoder('ascii')
        .decode(buf.subarray(nameStart, nameEnd))
        .trim();

      if (candidateName.startsWith('llection')) {
        candidateName = 'Co' + candidateName;
      }

      // Filtra solo nomi di stream validi (es. *.xml, *.dcf, Versione, VersioneFix)
      if (
        !/^[A-Za-z0-9_.-]+$/.test(candidateName) ||
        (!candidateName.toLowerCase().endsWith('.xml') &&
          !candidateName.toLowerCase().endsWith('.dcf') &&
          !candidateName.toLowerCase().startsWith('versione'))
      ) {
        continue;
      }

      const trueEntryOff = nameStart - 256;
      const inodeSec = readAccaSize32LE(
        buf,
        trueEntryOff >= 0 ? trueEntryOff + 32 : entryOff + 32,
        totalPages + 100
      );
      const byteLength = readAccaSize32LE(
        buf,
        trueEntryOff >= 0 ? trueEntryOff + 36 : entryOff + 36,
        buf.length
      );

      if (!seenDirNames.has(candidateName)) {
        seenDirNames.add(candidateName);
        dirEntries.push({
          name: candidateName,
          inodeSec,
          byteLength
        });
      }
    }
  }

  // 1b. Scansione continua solo se la griglia standard non ha trovato nessuna directory entry
  if (dirEntries.length === 0) {
    const knownPrefixes = [
      'Collection',
      'InfoDoc',
      'DatiGenerali',
      'CostiSicurezza',
      'Versione',
      'Identity',
      'OpzioniInterfaccia',
      'EPV'
    ];
    for (const prefix of knownPrefixes) {
      let searchPos = 0;
      while ((searchPos = buf.indexOf(prefix.charCodeAt(0), searchPos)) !== -1) {
        if (searchPos + prefix.length <= buf.length) {
          let match = true;
          for (let k = 0; k < prefix.length; k++) {
            if (buf[searchPos + k] !== prefix.charCodeAt(k)) {
              match = false;
              break;
            }
          }
          if (match) {
            const nameStart = searchPos;
            let nameEnd = nameStart;
            while (
              nameEnd < nameStart + 64 &&
              buf[nameEnd] >= 0x20 &&
              buf[nameEnd] <= 0x7E &&
              !(buf[nameEnd] === 0x20 && buf[nameEnd + 1] === 0x20)
            ) {
              nameEnd++;
            }
            let candidateName = ASCII_DECODER.decode(buf.subarray(nameStart, nameEnd)).trim();
            if (candidateName.startsWith('llection')) {
              candidateName = 'Co' + candidateName;
            }
            if (/^[A-Za-z0-9_.-]+$/.test(candidateName) && !seenDirNames.has(candidateName)) {
              const trueEntryOff = nameStart - 256;
              if (trueEntryOff >= 0 && trueEntryOff + 40 <= buf.length) {
                const inodeSec = readAccaSize32LE(buf, trueEntryOff + 32, totalPages + 100);
                const byteLength = readAccaSize32LE(buf, trueEntryOff + 36, buf.length);
                seenDirNames.add(candidateName);
                dirEntries.push({
                  name: candidateName,
                  inodeSec,
                  byteLength
                });
              }
            }
          }
        }
        searchPos++;
      }
    }
  }

  // 2. Raggruppa tutte le Data Pages (`0x90 0xEE 0x19`, tipo 6) per Stream Owner ID
  interface PageInfo {
    offset: number;
    pageIndex: number;
  }
  const ownerPagesMap = new Map<string, PageInfo[]>();
  const recordedPageOffsets = new Set<number>();

  const registerPage = (pageOff: number, pIdx: number) => {
    if (pageOff + 32 > buf.length || recordedPageOffsets.has(pageOff)) return;
    if (
      ((buf[pageOff] === 0x90 && buf[pageOff + 1] === 0xEE && buf[pageOff + 2] === 0x19) ||
       (buf[pageOff] === 0x3C && buf[pageOff + 1] === 0xEB && buf[pageOff + 2] === 0x19) ||
       (buf[pageOff] === 0x19 && buf[pageOff + 1] === 0x00 && buf[pageOff + 2] === 0x00)) &&
      (buf[pageOff + 8] === 0x06 || buf[pageOff + 8] === 0x20 || buf[pageOff + 8] === 0x00 || buf[pageOff + 8] === 0x04)
    ) {
      recordedPageOffsets.add(pageOff);
      const ownerBytes = buf.subarray(pageOff + 24, pageOff + 32);
      const ownerKey = Array.from(ownerBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const list = ownerPagesMap.get(ownerKey) || [];
      list.push({ offset: pageOff, pageIndex: pIdx });
      ownerPagesMap.set(ownerKey, list);
    }
  };

  // 2a. Scansione veloce su griglia standard delle pagine
  for (let p = 1; p < totalPages; p++) {
    registerPage(aasfPos + p * pageSize, p);
  }

  // 2b. Scansione disallineata SOLO se la griglia non ha trovato pagine sufficienti
  if (ownerPagesMap.size === 0) {
    for (const marker of [0x90, 0x3C, 0x19]) {
      let pos = aasfPos + 512;
      while ((pos = buf.indexOf(marker, pos)) !== -1 && pos <= buf.length - 64) {
        if (
          ((buf[pos] === 0x90 && buf[pos + 1] === 0xEE && buf[pos + 2] === 0x19) ||
           (buf[pos] === 0x3C && buf[pos + 1] === 0xEB && buf[pos + 2] === 0x19) ||
           (buf[pos] === 0x19 && buf[pos + 1] === 0x00 && buf[pos + 2] === 0x00)) &&
          (buf[pos + 8] === 0x06 || buf[pos + 8] === 0x20 || buf[pos + 8] === 0x00 || buf[pos + 8] === 0x04)
        ) {
          const pIdx = Math.max(1, Math.round((pos - aasfPos) / pageSize));
          registerPage(pos, pIdx);
        }
        pos++;
      }
    }
  }

  // 3. Ricostruisce ogni stream concatenando i 4064 byte (`pageOff + 32 .. pageOff + 4096`) delle sue pagine
  let fallbackCounter = 1;
  const usedDirNames = new Set<string>();

  for (const [, pageList] of ownerPagesMap.entries()) {
    if (pageList.length === 0) continue;
    pageList.sort((a, b) => a.offset - b.offset);

    const firstPageOff = pageList[0].offset;
    let pageHeaderLen = 32;
    for (let cOff = firstPageOff + 28; cOff <= firstPageOff + 36; cOff++) {
      if (
        cOff + 4 <= buf.length &&
        buf[cOff] === 0x41 &&
        buf[cOff + 1] === 0x41 &&
        buf[cOff + 2] === 0x43 &&
        buf[cOff + 3] === 0x53
      ) {
        pageHeaderLen = cOff - firstPageOff;
        break;
      }
    }
    const payloadStart = firstPageOff + pageHeaderLen;
    if (payloadStart + 8 > buf.length) continue;

    // Controlla se la prima pagina dello stream inizia con `AACS` (0x41 0x41 0x43 0x53)
    const isAacs =
      buf[payloadStart] === 0x41 &&
      buf[payloadStart + 1] === 0x41 &&
      buf[payloadStart + 2] === 0x43 &&
      buf[payloadStart + 3] === 0x53;

    const payloadBytesPerPage = pageSize - pageHeaderLen;
    const maxCapacity = pageList.length * payloadBytesPerPage;
    const assembled = new Uint8Array(maxCapacity);

    for (let i = 0; i < pageList.length; i++) {
      const pOff = pageList[i].offset + pageHeaderLen;
      const nextOff = i + 1 < pageList.length ? pageList[i + 1].offset : pOff + payloadBytesPerPage;
      const avail = Math.min(payloadBytesPerPage, Math.max(0, nextOff - pOff), buf.length - pOff);
      if (avail > 0) {
        assembled.set(buf.subarray(pOff, pOff + avail), i * payloadBytesPerPage);
      }
    }

    // Calcola la lunghezza esatta dello stream dall'header AACS (`144 + u1`)
    let exactStreamLen = maxCapacity;
    if (isAacs && assembled.length >= 144) {
      const u1 = readAccaSize32LE(assembled, 128, maxCapacity);
      if (u1 > 0 && 144 + u1 <= maxCapacity) {
        exactStreamLen = 144 + u1;
      }
    }

    const finalStreamBytes = assembled.subarray(0, exactStreamLen);

    // Associa il nome dalla Directory Entry corrispondente (tramite inodeSec, dimensione o ispezione contenuto)
    let matchedName: string | undefined;
    for (const de of dirEntries) {
      if (
        !usedDirNames.has(de.name) &&
        (de.byteLength === exactStreamLen ||
          de.inodeSec === pageList[0].pageIndex - 1 ||
          de.inodeSec === pageList[0].pageIndex ||
          de.inodeSec === pageList[0].pageIndex + 1)
      ) {
        matchedName = de.name;
        usedDirNames.add(de.name);
        break;
      }
    }

    if (!matchedName) {
      matchedName = `AccaStream_${fallbackCounter++}.xml`;
    }

    streams.set(matchedName, finalStreamBytes);
  }

  return streams;
}

/**
 * Parser per contenitori Compound File binari standard OLE2 (`D0 CF 11 E0`).
 * Ricostruisce i flussi seguendo le catene di settori FAT e MiniFAT.
 */
function parseCompoundFileStreams(buf: Uint8Array): Map<string, Uint8Array> {
  const streams = new Map<string, Uint8Array>();
  if (buf.length < 512) return streams;

  const isOleCompound = OLE_MAGIC.every((b, idx) => buf[idx] === b);
  if (!isOleCompound) {
    return streams;
  }

  try {
    const sectorShift = readUint16LE(buf, 0x1E);
    const miniSectorShift = readUint16LE(buf, 0x20);
    if (sectorShift < 7 || sectorShift > 16 || miniSectorShift < 4 || miniSectorShift > 12) {
      return streams;
    }

    const sectorSize = 1 << sectorShift;
    const miniSectorSize = 1 << miniSectorShift;
    const numFatSectors = readUint32LE(buf, 0x2C);
    const dirStartSector = readUint32LE(buf, 0x30);
    const miniSectorCutoff = readUint32LE(buf, 0x38) || 4096;
    const miniFatStartSector = readUint32LE(buf, 0x3C);
    const numMiniFatSectors = readUint32LE(buf, 0x40);
    const difatStartSector = readUint32LE(buf, 0x44);
    const numDifatSectors = readUint32LE(buf, 0x48);

    const getSectorOffset = (secId: number): number => (secId + 1) * sectorSize;

    // 1. Raccolta settori DIFAT (primi 109 nell'header + eventuali settori DIFAT aggiuntivi)
    const fatSectorIds: number[] = [];
    for (let i = 0; i < 109 && fatSectorIds.length < numFatSectors; i++) {
      const secId = readUint32LE(buf, 0x4C + i * 4);
      if (secId !== FREESECT && secId !== ENDOFCHAIN) {
        fatSectorIds.push(secId);
      }
    }

    let currentDifatSec = difatStartSector;
    let difatSafety = 0;
    const entriesPerSector = (sectorSize >>> 2) - 1;
    while (
      currentDifatSec !== ENDOFCHAIN &&
      currentDifatSec !== FREESECT &&
      difatSafety < numDifatSectors + 1024
    ) {
      difatSafety++;
      const pos = getSectorOffset(currentDifatSec);
      if (pos < 0 || pos + sectorSize > buf.length) break;
      for (let i = 0; i < entriesPerSector && fatSectorIds.length < numFatSectors; i++) {
        const secId = readUint32LE(buf, pos + i * 4);
        if (secId !== FREESECT && secId !== ENDOFCHAIN) {
          fatSectorIds.push(secId);
        }
      }
      currentDifatSec = readUint32LE(buf, pos + entriesPerSector * 4);
    }

    // 2. Costruzione tabella FAT
    const intsPerSector = sectorSize >>> 2;
    const fatTable = new Uint32Array(fatSectorIds.length * intsPerSector);
    fatTable.fill(FREESECT);
    for (let i = 0; i < fatSectorIds.length; i++) {
      const pos = getSectorOffset(fatSectorIds[i]);
      if (pos < 0 || pos + sectorSize > buf.length) continue;
      for (let j = 0; j < intsPerSector; j++) {
        fatTable[i * intsPerSector + j] = readUint32LE(buf, pos + j * 4);
      }
    }

    const readNormalChain = (startSector: number, exactSize?: number): Uint8Array => {
      const sectors: number[] = [];
      const visited = new Set<number>();
      let sec = startSector;
      while (sec !== ENDOFCHAIN && sec !== FREESECT && sec < fatTable.length && !visited.has(sec)) {
        visited.add(sec);
        sectors.push(sec);
        sec = fatTable[sec];
      }
      const totalBytes = exactSize !== undefined ? exactSize : sectors.length * sectorSize;
      const out = new Uint8Array(totalBytes);
      let written = 0;
      for (const s of sectors) {
        const pos = getSectorOffset(s);
        if (pos < 0 || pos >= buf.length) break;
        const avail = Math.min(sectorSize, buf.length - pos, totalBytes - written);
        if (avail <= 0) break;
        out.set(buf.subarray(pos, pos + avail), written);
        written += avail;
      }
      return out;
    };

    // 3. Lettura catena Directory
    const dirBytes = readNormalChain(dirStartSector);
    if (dirBytes.length < 128) return streams;

    // 4. Costruzione tabella MiniFAT
    const miniFatBytes =
      miniFatStartSector !== ENDOFCHAIN && miniFatStartSector !== FREESECT && numMiniFatSectors > 0
        ? readNormalChain(miniFatStartSector)
        : new Uint8Array(0);
    const miniFatTable = new Uint32Array(miniFatBytes.length >>> 2);
    for (let i = 0; i < miniFatTable.length; i++) {
      miniFatTable[i] = readUint32LE(miniFatBytes, i * 4);
    }

    // 5. Individuazione Root Entry (entry 0) per ottenere il MiniStream
    const rootStartSector = readUint32LE(dirBytes, 0x74);
    const rootStreamSize = readUint32LE(dirBytes, 0x78);
    const miniStreamBytes =
      rootStartSector !== ENDOFCHAIN && rootStartSector !== FREESECT && rootStreamSize > 0
        ? readNormalChain(rootStartSector, rootStreamSize)
        : new Uint8Array(0);

    const readMiniChain = (startMiniSec: number, exactSize: number): Uint8Array => {
      const out = new Uint8Array(exactSize);
      let written = 0;
      let sec = startMiniSec;
      const visited = new Set<number>();
      while (
        sec !== ENDOFCHAIN &&
        sec !== FREESECT &&
        !visited.has(sec) &&
        written < exactSize
      ) {
        visited.add(sec);
        const pos = sec * miniSectorSize;
        if (pos < 0 || pos >= miniStreamBytes.length) break;
        const avail = Math.min(miniSectorSize, miniStreamBytes.length - pos, exactSize - written);
        if (avail <= 0) break;
        out.set(miniStreamBytes.subarray(pos, pos + avail), written);
        written += avail;
        sec = sec < miniFatTable.length ? miniFatTable[sec] : ENDOFCHAIN;
      }
      return out;
    };

    // 6. Iterazione su tutte le Directory Entries (128 byte ciascuna)
    const numEntries = Math.floor(dirBytes.length / 128);
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = i * 128;
      const nameLen = readUint16LE(dirBytes, entryOffset + 0x40);
      const objType = dirBytes[entryOffset + 0x42]; // 2 = Stream
      if (objType !== 2 || nameLen <= 2 || nameLen > 64) continue;

      const rawNameBytes = dirBytes.subarray(entryOffset, entryOffset + nameLen - 2);
      const entryName = new TextDecoder('utf-16le').decode(rawNameBytes).replace(/\0/g, '').trim();
      if (!entryName) continue;

      const startSec = readUint32LE(dirBytes, entryOffset + 0x74);
      const streamSize = readUint32LE(dirBytes, entryOffset + 0x78);
      if (streamSize <= 0 || startSec === FREESECT || startSec === ENDOFCHAIN) continue;

      const data =
        streamSize < miniSectorCutoff && miniStreamBytes.length > 0
          ? readMiniChain(startSec, streamSize)
          : readNormalChain(startSec, streamSize);

      if (data.length > 0) {
        streams.set(entryName, data);
      }
    }
  } catch (err) {
    console.warn('Avviso lettura struttura Compound File .dcf, passo a scansione binaria AACS:', err);
  }

  return streams;
}

/**
 * Scanner binario diretto per blocchi `AACS` + Zlib (`0x78 0x9C` / `0x78 0xDA` / `0x78 0x01` / `0x78 0x5E`)
 * su tutto il buffer del file .dcf, ottimizzato con `buf.indexOf`.
 */
function scanRawAacsAndZlibStreams(buf: Uint8Array, allowRepair = false): string[] {
  const xmlList: string[] = [];
  const seenHashes = new Set<string>();

  // 1. Ricerca rapida tramite indexOf di tutti i marcatori ASCII `AACS` (0x41 0x41 0x43 0x53)
  const aacsPositions: number[] = [];
  let searchPos = 0;
  while ((searchPos = buf.indexOf(0x41, searchPos)) !== -1 && searchPos <= buf.length - 8) {
    if (buf[searchPos + 1] === 0x41 && buf[searchPos + 2] === 0x43 && buf[searchPos + 3] === 0x53) {
      aacsPositions.push(searchPos);
      searchPos += 4;
    } else {
      searchPos++;
    }
  }

  for (let idx = 0; idx < aacsPositions.length; idx++) {
    const start = aacsPositions[idx];
    const nextStart = idx + 1 < aacsPositions.length ? aacsPositions[idx + 1] : buf.length;
    const blockSlice = buf.subarray(start, nextStart);
    const decoded = decodeSingleDcfStream(blockSlice, allowRepair);
    if (decoded) {
      const sig = `${decoded.length}:${decoded.slice(0, 120)}`;
      if (!seenHashes.has(sig)) {
        seenHashes.add(sig);
        xmlList.push(decoded);
      }
    }
  }

  // 2. Fallback header Zlib diretti SOLO se nessun blocco AACS ha prodotto XML (senza costosa riparazione per byte casuali)
  if (xmlList.length === 0) {
    let pos = 0;
    while ((pos = buf.indexOf(0x78, pos)) !== -1 && pos <= buf.length - 6) {
      if (isZlibHeader(buf[pos], buf[pos + 1])) {
        const inflated = safeZlibInflate(buf.subarray(pos), false);
        if (inflated && inflated.length > 16) {
          const extracted = extractXmlFromLayer2(inflated, false);
          const decoded = extracted?.xml;
          if (decoded && decoded.includes('<') && decoded.includes('>')) {
            const sig = `${decoded.length}:${decoded.slice(0, 120)}`;
            if (!seenHashes.has(sig)) {
              seenHashes.add(sig);
              xmlList.push(decoded);
            }
          }
        }
      }
      pos++;
    }
  }

  return xmlList;
}

/**
 * Classifica e raccoglie tutti gli stream XML contenuti in un file .dcf
 */
export function extractDcfXmlStreams(rawInputBuf: Uint8Array): ExtractedDcfStreams {
  const { buf, isTextNormalized } = normalizeDcfInputBuffer(rawInputBuf);
  const result: ExtractedDcfStreams = {
    rawXmlStreams: []
  };

  const assignXmlByRole = (nameHint: string, xml: string) => {
    const lowerName = nameHint.toLowerCase();
    const head = xml.slice(0, 3000);
    const headLower = head.toLowerCase();

    result.rawXmlStreams.push({ name: nameHint, xml });

    if (
      lowerName.includes('collectionep') ||
      lowerName.includes('llectionep') ||
      lowerName.includes('elencoprezzi') ||
      headLower.includes('<collectionep') ||
      headLower.includes('<itemep') ||
      headLower.includes('<epitem') ||
      headLower.includes('<elencoprezzi')
    ) {
      if (!result.collectionEPXml || xml.length > result.collectionEPXml.length) {
        result.collectionEPXml = xml;
      }
      return;
    }

    if (
      lowerName.includes('collectionvc') ||
      lowerName.includes('llectionvc') ||
      lowerName.includes('vocicomputo') ||
      headLower.includes('<collectionvc') ||
      headLower.includes('<itemvc') ||
      headLower.includes('<vcitem') ||
      headLower.includes('<vocicomputo')
    ) {
      if (!result.collectionVCXml || xml.length > result.collectionVCXml.length) {
        result.collectionVCXml = xml;
      }
      return;
    }

    if (
      lowerName.includes('collectiongp') ||
      lowerName.includes('llectiongp') ||
      headLower.includes('<collectiongp') ||
      headLower.includes('<itemgp') ||
      headLower.includes('<gpitem') ||
      headLower.includes('<itemspcat') ||
      headLower.includes('<itemcat') ||
      headLower.includes('<gruppi') ||
      headLower.includes('<spcat') ||
      headLower.includes('<dgcapitolicategorie')
    ) {
      if (!result.collectionGPXml || xml.length > result.collectionGPXml.length) {
        result.collectionGPXml = xml;
      }
      return;
    }

    if (lowerName.includes('datigenerali') || headLower.includes('<datigenerali')) {
      if (!result.datiGeneraliXml || xml.length > result.datiGeneraliXml.length) {
        result.datiGeneraliXml = xml;
      }
      return;
    }

    if (lowerName.includes('infodoc') || headLower.includes('<infodoc')) {
      if (!result.infoDocXml || xml.length > result.infoDocXml.length) {
        result.infoDocXml = xml;
      }
      return;
    }

    if (
      lowerName.includes('collectionst') ||
      lowerName.includes('llectionst') ||
      lowerName.includes('supertest') ||
      lowerName.includes('stringtable') ||
      lowerName === 'st.xml' ||
      headLower.includes('<collectionst') ||
      headLower.includes('<itemst') ||
      headLower.includes('<stitem') ||
      headLower.includes('<supertesti')
    ) {
      if (!result.collectionSTXml || xml.length > result.collectionSTXml.length) {
        result.collectionSTXml = xml;
      }
      return;
    }

    if (headLower.includes('<pwedocumento') || headLower.includes('<primus')) {
      result.xpweXml = xml;
    }
  };

  // Fase 1A: Estrazione nativa dal contenitore paginato ACCA PriMus (`AAMVHFSS` / `AASFSSGN` a pagine da 4096 byte)
  const accaPagedStreams = parseAccaPagedContainerStreams(buf);
  for (const [entryName, streamData] of accaPagedStreams.entries()) {
    const decoded = decodeSingleDcfStreamWithNested(streamData, isTextNormalized);
    if (decoded?.xml) {
      assignXmlByRole(entryName, decoded.xml);
    } else if (decoded?.nestedDcf) {
      const nestedStreams = parseAccaPagedContainerStreams(decoded.nestedDcf);
      for (const [nestedName, nestedData] of nestedStreams.entries()) {
        const nestedXml = decodeSingleDcfStream(nestedData, isTextNormalized);
        if (nestedXml) {
          assignXmlByRole(`${entryName}/${nestedName}`, nestedXml);
        }
      }
    }
  }

  // Fase 1B: Estrazione strutturata da Compound File OLE2 standard (`D0 CF 11 E0`) solo se non è già un contenitore ACCA paginato
  if (accaPagedStreams.size === 0 || (!result.collectionEPXml && !result.collectionVCXml)) {
    const compoundStreams = parseCompoundFileStreams(buf);
    for (const [entryName, streamData] of compoundStreams.entries()) {
      const xml = decodeSingleDcfStream(streamData, isTextNormalized);
      if (xml) {
        assignXmlByRole(entryName, xml);
      }
    }
  }

  // Fase 2: Scansione binaria diretta dei blocchi `AACS` solo se mancano sia EP sia VC (o 0 stream estratti)
  if (result.rawXmlStreams.length === 0 || (!result.collectionEPXml && !result.collectionVCXml && !result.xpweXml)) {
    const scannedXmls = scanRawAacsAndZlibStreams(buf, isTextNormalized);
    scannedXmls.forEach((xml, idx) => {
      assignXmlByRole(`Stream_AACS_${idx + 1}.xml`, xml);
    });
  }

  // Fase 3: Fallback XML diretto (es. file .xpwe o .dcf salvato in XML non compresso)
  if (result.rawXmlStreams.length === 0) {
    const directText = decodeDcfXmlBytes(buf);
    if (directText.includes('<') && directText.includes('>')) {
      assignXmlByRole('Direct.xml', directText);
    }
  }

  // Fase 4: Fallback estremo di riparazione testo solo se nulla è stato estratto finora
  if (result.rawXmlStreams.length === 0 && !isTextNormalized) {
    const repairedXmls = scanRawAacsAndZlibStreams(buf, true);
    repairedXmls.forEach((xml, idx) => {
      assignXmlByRole(`Stream_AACS_Repaired_${idx + 1}.xml`, xml);
    });
  }

  return result;
}

/**
 * Normalizza e pulisce le sigle delle unità di misura (es. 'm3' -> 'm³', 'mq' -> 'm²', 'ml' -> 'm')
 */
export function normalizeUnit(raw?: string | null): string {
  if (!raw) return '';
  const clean = raw.trim().toLowerCase().replace(/\.$/, '');
  if (clean === 'm3' || clean === 'mc' || clean === 'm^3' || clean === 'metri cubi' || clean === 'metro cubo') return 'm³';
  if (clean === 'm2' || clean === 'mq' || clean === 'm^2' || clean === 'metri quadri' || clean === 'metro quadro') return 'm²';
  if (clean === 'm' || clean === 'ml' || clean === 'mt' || clean === 'metri' || clean === 'metro lineare' || clean === 'm.l') return 'm';
  if (clean === 'kg' || clean === 'chilogrammi' || clean === 'chilo') return 'kg';
  if (clean === 't' || clean === 'ton' || clean === 'tonnellate') return 't';
  if (clean === 'cad' || clean === 'cadauno' || clean === 'n' || clean === 'nr' || clean === 'num' || clean === 'numero' || clean === 'pz' || clean === 'pezzi') return 'cad';
  if (clean === 'ora' || clean === 'ore' || clean === 'h') return 'h';
  if (clean === 'km') return 'km';
  if (clean === 'l' || clean === 'lt' || clean === 'litri') return 'l';
  if (clean === 'corpo' || clean === 'a corpo') return 'a corpo';
  return raw.trim();
}

/**
 * Pulisce stringhe di testo o RTF semplice provenienti da ACCA PriMus
 */
function cleanDcfText(raw?: string | null): string {
  if (!raw) return '';
  if (!raw.includes('&') && !raw.includes('\\')) {
    return raw.includes('\r') || raw.includes('\t') || raw.includes('  ')
      ? raw.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
      : raw.trim();
  }

  let s = raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  if (s.includes('\\rtf') || s.includes('\\par') || s.includes("\\'")) {
    s = s
      .replace(/\\par\b/g, '\n')
      .replace(/\\line\b/g, '\n')
      .replace(/\\tab\b/g, ' ')
      .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
        try {
          const byte = new Uint8Array([parseInt(hex, 16)]);
          return WIN1252_DECODER.decode(byte);
        } catch {
          return '';
        }
      })
      .replace(/\\u(-?\d+)\??/g, (_, code) => {
        const c = parseInt(code, 10);
        return String.fromCharCode(c < 0 ? c + 65536 : c);
      })
      .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
      .replace(/[{}]/g, '');
  }

  return s.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

export function parseDcfNumber(raw?: string | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;

  // Fast-path immediata per numeri puri standard (95% dei casi)
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    const v = parseFloat(trimmed);
    return isNaN(v) ? undefined : v;
  }
  if (/^[+-]?\d+,\d+$/.test(trimmed)) {
    const v = parseFloat(trimmed.replace(',', '.'));
    return isNaN(v) ? undefined : v;
  }

  const normalizeNumToken = (token: string): string => {
    let t = token.split('|')[0].replace(/[´' $€]/g, '');
    const lastComma = t.lastIndexOf(',');
    const lastDot = t.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) {
        t = t.replace(/\./g, '').replace(',', '.');
      } else {
        t = t.replace(/,/g, '');
      }
    } else if (lastComma > -1) {
      t = t.replace(',', '.');
    }
    return t;
  };

  const normalized = normalizeNumToken(trimmed);
  if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(normalized)) {
    const val = parseFloat(normalized);
    return isNaN(val) ? undefined : val;
  }

  const expr = trimmed
    .replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2')
    .replace(/,/g, '.')
    .replace(/[^0-9.+\-*/()]/g, '');

  if (expr && /^[0-9.+\-*/()]+$/.test(expr) && /[0-9]/.test(expr)) {
    try {
      // eslint-disable-next-line no-new-func
      const evaluated = Function(`"use strict"; return (${expr});`)();
      if (typeof evaluated === 'number' && isFinite(evaluated) && !isNaN(evaluated)) {
        return evaluated;
      }
    } catch {
      // Fallback a parseFloat
    }
  }

  const fallback = parseFloat(normalized);
  return isNaN(fallback) ? undefined : fallback;
}

interface LiteXmlNode {
  tagName: string;
  lowerTag: string;
  attributes: Record<string, string>;
  lowerAttrs: Record<string, string>;
  text: string;
  children: LiteXmlNode[];
}

let activeXmlCache: Map<string, LiteXmlNode> | null = null;

function parseXmlToLiteTree(xmlString: string): LiteXmlNode {
  if (activeXmlCache && activeXmlCache.has(xmlString)) {
    return activeXmlCache.get(xmlString)!;
  }

  let parsedTree: LiteXmlNode | null = null;

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, 'text/xml');
      const parserError = doc.querySelector('parsererror');
      if (!parserError && doc.documentElement) {
        const convertDomNode = (el: Element): LiteXmlNode => {
          const attrs: Record<string, string> = {};
          const lowerAttrs: Record<string, string> = {};
          const elAttrs = el.attributes;
          for (let i = 0; i < elAttrs.length; i++) {
            const a = elAttrs[i];
            attrs[a.name] = a.value;
            if (a.value !== '') {
              lowerAttrs[a.name.toLowerCase()] = a.value;
            }
          }
          const children: LiteXmlNode[] = [];
          let directText = '';
          const childNodes = el.childNodes;
          for (let i = 0; i < childNodes.length; i++) {
            const cn = childNodes[i];
            if (cn.nodeType === 1) {
              children.push(convertDomNode(cn as Element));
            } else if (cn.nodeType === 3 || cn.nodeType === 4) {
              directText += cn.nodeValue || '';
            }
          }
          const text = directText.trim() || (children.length === 0 ? el.textContent?.trim() || '' : '');
          return {
            tagName: el.tagName,
            lowerTag: el.tagName.toLowerCase(),
            attributes: attrs,
            lowerAttrs,
            text,
            children
          };
        };
        parsedTree = convertDomNode(doc.documentElement);
      }
    } catch {
      // Fallback al parser leggero integrato
    }
  }

  if (!parsedTree) {
    const root: LiteXmlNode = { tagName: 'root', lowerTag: 'root', attributes: {}, lowerAttrs: {}, text: '', children: [] };
    const stack: LiteXmlNode[] = [root];

    const cleanXml = xmlString
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    const tagRegex = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([a-zA-Z0-9_:-]+)((?:\s+[a-zA-Z0-9_:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(cleanXml)) !== null) {
      const [, cdata, closingSlash, tagName, attrStr, selfClosingSlash, textNode] = match;
      const current = stack[stack.length - 1];

      if (cdata !== undefined) {
        current.text += cdata;
      } else if (textNode !== undefined) {
        const t = textNode.trim();
        if (t) current.text += (current.text ? ' ' : '') + t;
      } else if (tagName) {
        if (closingSlash) {
          if (stack.length > 1) stack.pop();
        } else {
          const attributes: Record<string, string> = {};
          const lowerAttrs: Record<string, string> = {};
          if (attrStr) {
            const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
            let am: RegExpExecArray | null;
            while ((am = attrRegex.exec(attrStr)) !== null) {
              const val = cleanDcfText(am[2] ?? am[3] ?? '');
              attributes[am[1]] = val;
              if (val !== '') {
                lowerAttrs[am[1].toLowerCase()] = val;
              }
            }
          }
          const node: LiteXmlNode = {
            tagName,
            lowerTag: tagName.toLowerCase(),
            attributes,
            lowerAttrs,
            text: '',
            children: []
          };
          current.children.push(node);
          if (!selfClosingSlash) {
            stack.push(node);
          }
        }
      }
    }

    parsedTree = root.children.length === 1 ? root.children[0] : root;
  }

  if (activeXmlCache) {
    activeXmlCache.set(xmlString, parsedTree);
  }
  return parsedTree;
}

function getNodeFullText(node: LiteXmlNode): string {
  if (node.text) return node.text;
  let full = '';
  for (let i = 0; i < node.children.length; i++) {
    const ct = getNodeFullText(node.children[i]);
    if (ct) full += (full ? ' ' : '') + ct;
  }
  return full;
}

function getFieldVal(node: LiteXmlNode, candidateNames: readonly string[]): string | undefined {
  const lowerAttrs = node.lowerAttrs;
  const children = node.children;

  // 1. Ricerca diretta O(1) negli attributi pre-lowercased (senza allocare Map né toLowerCase ripetuti)
  for (let i = 0; i < candidateNames.length; i++) {
    const cand = candidateNames[i].toLowerCase();
    const found = lowerAttrs[cand];
    if (found !== undefined && found !== '') {
      return cleanDcfText(found);
    }
  }

  // 2. Ricerca nei figli diretti
  if (children.length > 0) {
    for (let i = 0; i < candidateNames.length; i++) {
      const cand = candidateNames[i].toLowerCase();
      for (let j = 0; j < children.length; j++) {
        const child = children[j];
        if (child.lowerTag === cand) {
          const val =
            getNodeFullText(child) ||
            child.lowerAttrs.value ||
            child.lowerAttrs.valore ||
            child.lowerAttrs.val ||
            '';
          if (val !== '') return cleanDcfText(val);
        }
      }
    }
  }

  return undefined;
}

function collectNodesByPredicate(node: LiteXmlNode, pred: (n: LiteXmlNode) => boolean, out: LiteXmlNode[] = []): LiteXmlNode[] {
  if (pred(node)) {
    out.push(node);
  }
  for (let i = 0; i < node.children.length; i++) {
    collectNodesByPredicate(node.children[i], pred, out);
  }
  return out;
}

/**
 * Estrae i metadati del progetto da `InfoDoc.xml` e `DatiGenerali.xml`
 */
function parseProjectMetadata(infoDocXml?: string, datiGeneraliXml?: string, fileName?: string): ProjectInfo {
  const defaultTitle = fileName ? fileName.replace(/\.(dcf|xpwe|xml)$/i, '') : 'Computo Metrico PriMus (.dcf)';
  const projectInfo: ProjectInfo = {
    title: defaultTitle,
    client: 'Committente da Computo PriMus',
    designer: 'Progettista da Computo PriMus',
    location: 'Cantiere Principale',
    date: new Date().toLocaleDateString('it-IT'),
    priceList: 'Prezzario PriMus ACCA (.dcf)',
    region: 'Nazionale',
    year: String(new Date().getFullYear()),
    vatRate: 10,
    safetyRate: 2.5
  };

  for (const xml of [infoDocXml, datiGeneraliXml]) {
    if (!xml) continue;
    const tree = parseXmlToLiteTree(xml);
    const allNodes = collectNodesByPredicate(tree, () => true);

    for (const n of allNodes) {
      const title = getFieldVal(n, [
        'Oggetto',
        'Titolo',
        'Lavoro',
        'Progetto',
        'NomeProgetto',
        'DesLavoro',
        'Opera',
        'Des',
        'Descrizione'
      ]);
      if (
        title &&
        title.length > 2 &&
        n.tagName.toLowerCase() !== 'infodoc' &&
        projectInfo.title === defaultTitle
      ) {
        projectInfo.title = title;
      }

      const client = getFieldVal(n, ['Committente', 'Ente', 'StazioneAppaltante', 'Impresa']);
      if (client && client.length > 1) projectInfo.client = client;

      const designer = getFieldVal(n, ['Progettista', 'Tecnico', 'Redattore', 'Compilatore', 'DirettoreLavori']);
      if (designer && designer.length > 1) projectInfo.designer = designer;

      const loc = getFieldVal(n, ['Comune', 'Localita', 'Luogo', 'Cantiere', 'Indirizzo', 'Provincia']);
      if (loc && loc.length > 1) projectInfo.location = loc;

      const dateStr = getFieldVal(n, ['Data', 'DataDocumento', 'DataProgetto']);
      if (dateStr && dateStr.length >= 4 && !dateStr.includes('1899')) projectInfo.date = dateStr;

      const priceList = getFieldVal(n, ['Listino', 'Prezzario', 'Tariffario', 'Fonte']);
      if (priceList && priceList.length > 2) projectInfo.priceList = priceList;
    }
  }

  return projectInfo;
}

/**
 * Estrae tutti i testi formattati e stringhe descrittive da `CollectionST.xml` (SuperTesto / String Table di PriMus).
 * Mappa `IdST` -> Testo pulito (decodificando markup RTF in testo con a capo).
 */
function parseCollectionST(stXml?: string): Map<string, string> {
  const stMap = new Map<string, string>();
  if (!stXml) return stMap;

  const tree = parseXmlToLiteTree(stXml);
  const stTagNames = new Set(['itemst', 'stitem', 'supertesto', 'item', 'record', 'elemento', 'stringa']);

  const nodes = collectNodesByPredicate(tree, n => {
    const t = n.tagName.toLowerCase();
    if (stTagNames.has(t)) return true;
    return Boolean(getFieldVal(n, ['IdST', 'IDST', 'Id', 'ID', 'Testo', 'RTF', 'SuperTesto']));
  });

  nodes.forEach((node, idx) => {
    const seqIndex = String(idx + 1);
    const id =
      getFieldVal(node, ['IdST', 'IDST', 'Id', 'ID', 'Key', 'Progressivo', 'CodiceInterno', 'Num']) ||
      seqIndex;

    const rawText =
      node.text ||
      getFieldVal(node, [
        'Testo',
        'Txt',
        'Text',
        'Des',
        'Descrizione',
        'DesEstesa',
        'DesRidotta',
        'Valore',
        'Val',
        'RTF',
        'TestoRTF',
        'DesRTF',
        'SuperTesto',
        'Stringa',
        'Content'
      ]) ||
      '';

    const cleaned = cleanDcfText(rawText);
    if (cleaned) {
      stMap.set(id, cleaned);
      if (!stMap.has(seqIndex)) stMap.set(seqIndex, cleaned);
      if (!stMap.has(`st_${id}`)) stMap.set(`st_${id}`, cleaned);
      const cleanId = id.replace(/\.$/, '').trim();
      if (!stMap.has(cleanId)) stMap.set(cleanId, cleaned);
      const numId = parseInt(cleanId, 10);
      if (!isNaN(numId) && !stMap.has(String(numId))) {
        stMap.set(String(numId), cleaned);
      }
    }
  });

  return stMap;
}

/**
 * Estrae le categorie/capitoli WBS da `CollectionGP.xml` (o sezione categorie di DatiGenerali / XPWE)
 */
function parseCollectionGP(gpXml?: string, datiGeneraliXml?: string, xpweXml?: string): RawGpCategory[] {
  const categories: RawGpCategory[] = [];
  const seenIds = new Set<string>();

  const candidateXmls = [gpXml, datiGeneraliXml, xpweXml].filter(Boolean) as string[];
  const catTagNames = new Set([
    'itemgp',
    'gpitem',
    'itemspcat',
    'itemcat',
    'itemsbcat',
    'itemspcap',
    'itemcap',
    'itemsbcap',
    'itemwbs',
    'gruppo',
    'categoria',
    'capitolo',
    'cat',
    'spcat',
    'sbcat',
    'cap',
    'spcap',
    'sbcap',
    'pwecapitolocategoria',
    'dgcapitolocategoria',
    'wbsitem'
  ]);

  for (const xml of candidateXmls) {
    const tree = parseXmlToLiteTree(xml);
    const nodes = collectNodesByPredicate(tree, n => {
      const t = n.tagName.toLowerCase();
      if (catTagNames.has(t)) return true;
      if (t === 'item' || t === 'record' || t === 'elemento') {
        const hasDesc = Boolean(getFieldVal(n, ['Descrizione', 'Des', 'DesSintetica', 'DesEstesa', 'Nome']));
        const hasPrice = Boolean(getFieldVal(n, ['Prezzo', 'Prezzo1', 'Pr1', 'Prz', 'PrezzoUnitario', 'UnitaMisura', 'UM', 'Um']));
        const hasDimensions = Boolean(getFieldVal(n, ['Lunghezza', 'Lu', 'Larghezza', 'La', 'PartiUguali', 'Pu', 'IdEP', 'IDEP']));
        return hasDesc && !hasPrice && !hasDimensions;
      }
      return false;
    });

    for (const node of nodes) {
      const name = getFieldVal(node, [
        'Descrizione',
        'DesEstesa',
        'DesSintetica',
        'Des',
        'DesBreve',
        'Dsc',
        'Nome',
        'Titolo',
        'Denominazione'
      ]);
      if (!name) continue;

      const rawId =
        getFieldVal(node, [
          'IdGP',
          'IDGP',
          'IdCat',
          'IDCat',
          'IdSbCat',
          'IDSbCat',
          'IdSpCat',
          'IDSpCat',
          'IdCap',
          'IDCap',
          'IdSbCap',
          'IDSbCap',
          'IdSpCap',
          'IDSpCap',
          'ID',
          'Id',
          'IDGruppo',
          'Key',
          'CodiceInterno'
        ]) || String(categories.length + 1);

      const tagLower = node.tagName.toLowerCase();
      const tipo = (getFieldVal(node, ['Tipo', 'Type', 'Livello', 'Level', 'Genere']) || '').toLowerCase();
      const isSuper =
        tagLower === 'spcat' ||
        tagLower === 'itemspcat' ||
        tagLower === 'spcap' ||
        tagLower === 'itemspcap' ||
        tipo.includes('super') ||
        tipo === 'spcat' ||
        tipo === 'spcap';

      const uniqueKey = `${isSuper ? 'S' : 'C'}_${rawId}_${name}`;
      if (seenIds.has(uniqueKey)) continue;
      seenIds.add(uniqueKey);

      const code =
        getFieldVal(node, ['Cod', 'Codice', 'Sigla', 'Numero', 'Num']) ||
        `WBS.${String(categories.length + 1).padStart(2, '0')}`;

      const parentId = getFieldVal(node, ['IdSpCat', 'IDSpCat', 'IdSpCap', 'IDSpCap', 'IDPadre', 'ParentID', 'IDSuper']);

      categories.push({
        id: rawId,
        code,
        name,
        parentId,
        isSuperCategory: isSuper,
        order: categories.length + 1
      });
    }

    if (categories.length > 0) break;
  }

  return categories;
}

/**
 * Estrae gli articoli di Elenco Prezzi da `CollectionEP.xml` (o XPWE)
 */
function parseCollectionEP(
  epXml?: string,
  xpweXml?: string,
  stMap?: Map<string, string>
): Map<string, RawEpArticle> {
  const epMap = new Map<string, RawEpArticle>();
  const sourceXml = epXml || xpweXml;
  if (!sourceXml) return epMap;

  const tree = parseXmlToLiteTree(sourceXml);
  const epTagNames = new Set([
    'itemep',
    'epitem',
    'voceep',
    'articolo',
    'ep',
    'pweepitem',
    'pweelencoprezziitem',
    'voceelencoprezzi'
  ]);

  const nodes = collectNodesByPredicate(tree, n => {
    const t = n.tagName.toLowerCase();
    if (epTagNames.has(t)) return true;
    if (t === 'item' || t === 'record' || t === 'voce' || t === 'elemento') {
      const hasCodeOrDesc = Boolean(
        getFieldVal(n, [
          'Tariffa',
          'Trf',
          'CodTariffa',
          'CodiceTariffa',
          'CodArt',
          'CodiceArticolo',
          'Codice',
          'Cod',
          'DesEstesa',
          'DesRidotta',
          'Descrizione',
          'Des',
          'Dsc',
          'IdST',
          'IDST'
        ])
      );
      const hasPriceOrUnit = Boolean(
        getFieldVal(n, [
          'Pr1',
          'Prz',
          'Prezzo',
          'Prezzo1',
          'PrezzoUnitario',
          'ImpUnitario',
          'Um',
          'UM',
          'UnitaMisura',
          'UnMis'
        ])
      );
      const isMeasRow = Boolean(getFieldVal(n, ['IdVC', 'IDVC', 'IdRM', 'IDRM', 'Lu', 'Lunghezza', 'PartiUguali']));
      return hasCodeOrDesc && (hasPriceOrUnit || !isMeasRow);
    }
    return false;
  });

  nodes.forEach((node, idx) => {
    const seqIndex = String(idx + 1);
    const id =
      getFieldVal(node, ['IdEP', 'IDEP', 'ID', 'Id', 'IDArticolo', 'IDVoce', 'Key', 'Progressivo']) ||
      seqIndex;

    // 1. Ricerca CODICE TARIFFA REALE prioritario (evita di usare Cod="001." se esiste una tariffa ufficiale)
    const realTariffCandidates = [
      'Tariffa',
      'Trf',
      'CodTariffa',
      'CodiceTariffa',
      'CodArt',
      'CodiceArticolo',
      'CodElencoPrezzi',
      'CodEP',
      'Articolo',
      'Sigla',
      'NumTariffa',
      'Codice'
    ];
    let tariffVal = getFieldVal(node, realTariffCandidates);
    const progVal = getFieldVal(node, ['Cod', 'Num', 'Progressivo', 'IDVoce', 'IDArticolo']);
    if (!tariffVal || /^\d{1,4}\.?$/.test(tariffVal.trim())) {
      if (progVal && !/^\d{1,4}\.?$/.test(progVal.trim())) {
        tariffVal = progVal;
      } else if (!tariffVal) {
        tariffVal = progVal || `NP.${String(idx + 1).padStart(3, '0')}`;
      }
    }
    const code = tariffVal;

    // 2. Risoluzione DESCRIZIONE con SuperTesti (CollectionST) e attributi estesi/ridotti
    const stId = getFieldVal(node, [
      'IdST',
      'IDST',
      'IdSTEstesa',
      'IDSTEstesa',
      'IdSTRidotta',
      'IDSTRidotta',
      'IdDes',
      'IDDes',
      'IdDesEstesa',
      'IDDesEstesa',
      'IdDesRidotta',
      'IDDesRidotta',
      'RefST',
      'IdTesto',
      'IDTesto',
      'IdSuperTesto',
      'SuperTesto'
    ]);
    let stText: string | undefined;
    if (stId && stMap) {
      stText = stMap.get(stId) || stMap.get(`st_${stId}`) || stMap.get(stId.replace(/\.$/, ''));
    }
    if (!stText && stMap) {
      stText = stMap.get(id) || stMap.get(seqIndex) || stMap.get(id.replace(/\.$/, ''));
    }

    const extDescCandidates = [
      'DesEstesa',
      'DescrizioneEstesa',
      'DesEst',
      'DescrEstesa',
      'TestoEsteso',
      'Des',
      'Descrizione',
      'Descr',
      'Desc',
      'Dsc',
      'Testo',
      'DesLavoro',
      'Designazione',
      'DesignazioneLavori',
      'TestoRTF',
      'RTF',
      'DesRTF',
      'SuperTesto',
      'Note'
    ];
    const extDesc = getFieldVal(node, extDescCandidates) || stText;

    const shortDescCandidates = [
      'DesRidotta',
      'DescrizioneRidotta',
      'DesRid',
      'DesSintetica',
      'DescrizioneSintetica',
      'DesSint',
      'DesBreve',
      'DescrizioneBreve',
      'DscBreve',
      'Titolo',
      'Oggetto',
      'Rubrica',
      'Sommario'
    ];
    let shortDesc = getFieldVal(node, shortDescCandidates);
    const stShortId = getFieldVal(node, ['IdSTRidotta', 'IDSTRidotta', 'IdDesRidotta', 'IDDesRidotta']);
    if (stShortId && stMap && !shortDesc) {
      shortDesc = stMap.get(stShortId) || stMap.get(`st_${stShortId}`) || stMap.get(stShortId.replace(/\.$/, ''));
    }

    let description = '';
    if (extDesc && shortDesc) {
      if (extDesc.toLowerCase().includes(shortDesc.toLowerCase().slice(0, Math.min(30, shortDesc.length)))) {
        description = extDesc;
      } else {
        description = `${shortDesc}\n${extDesc}`;
      }
    } else {
      description = extDesc || shortDesc || '';
    }

    if (!description && stMap) {
      description = stMap.get(id) || stMap.get(seqIndex) || '';
    }
    if (!description) {
      description = `Voce ${code}`;
    }

    // 3. Risoluzione e normalizzazione Unità di Misura
    const rawUnit = getFieldVal(node, [
      'Um',
      'UM',
      'UnMis',
      'UnitaMisura',
      'Unita_Misura',
      'Udm',
      'UDM',
      'Unita',
      'Misura',
      'SiglaUM',
      'DesUM',
      'UMis',
      'Sigla'
    ]);
    const unit = normalizeUnit(rawUnit);

    const priceRaw = getFieldVal(node, [
      'Pr1',
      'Prz',
      'Prz1',
      'Prezzo',
      'Prezzo1',
      'PrezzoUnitario',
      'ImpUnitario',
      'Pu',
      'PU',
      'Pr2',
      'Pr3',
      'Imp',
      'Imprt',
      'Valore',
      'ImportoUnitario'
    ]);
    const unitPrice = parseDcfNumber(priceRaw) ?? 0;

    const laborRaw = getFieldVal(node, [
      'IncMdo',
      'IncManodopera',
      'PercManodopera',
      'Manodopera',
      'Mdo',
      'PercMdo',
      'IncidenzaManodopera'
    ]);
    const laborRate = parseDcfNumber(laborRaw) ?? 35.0;

    const categoryId = getFieldVal(node, [
      'IdCat',
      'IDCat',
      'IdSbCat',
      'IDSbCat',
      'IdSpCat',
      'IDSpCat',
      'IdCap',
      'IDCap',
      'IdSbCap',
      'IDSbCap',
      'IdSpCap',
      'IDSpCap',
      'IdGP',
      'IDGP',
      'IDGruppo',
      'IDCategoria',
      'IDCapitolo',
      'Cat',
      'Cap'
    ]);
    const priceListSource = getFieldVal(node, ['Listino', 'Prezzario', 'Origine', 'Fonte']);

    const item: RawEpArticle = {
      id,
      code,
      description,
      shortDescription: shortDesc,
      unit,
      unitPrice,
      laborRate,
      categoryId,
      priceListSource
    };

    epMap.set(id, item);
    if (!epMap.has(seqIndex)) epMap.set(seqIndex, item);
    if (!epMap.has(`idx0_${idx}`)) epMap.set(`idx0_${idx}`, item);
    if (code && !epMap.has(`code_${code}`)) epMap.set(`code_${code}`, item);
    if (progVal && !epMap.has(`prog_${progVal}`)) epMap.set(`prog_${progVal}`, item);
    const cleanId = id.replace(/\.$/, '').trim();
    if (!epMap.has(cleanId)) epMap.set(cleanId, item);
  });

  return epMap;
}

/**
 * Estrae una singola riga di misurazione da un nodo XML di misura PriMus (`<ItemRM>` / `<Rigo>` / ecc.)
 */
function parseMeasurementNode(mNode: LiteXmlNode): RawVcMeasurement | null {
  const desc =
    getFieldVal(mNode, ['Des', 'Descrizione', 'Designazione', 'Commento', 'Note', 'Testo', 'Voce']) || '';

  const mult = parseDcfNumber(
    getFieldVal(mNode, ['Pu', 'PU', 'PartiUguali', 'ParUg', 'Uguali', 'Fattore', 'NParti', 'Moltiplicatore', 'QuantitaParziale'])
  );
  const length = parseDcfNumber(
    getFieldVal(mNode, ['Lu', 'Lunghezza', 'Lung', 'Lun', 'L', 'Dim1'])
  );
  const width = parseDcfNumber(
    getFieldVal(mNode, ['La', 'Larghezza', 'Larg', 'Lar', 'B', 'Dim2'])
  );
  const height = parseDcfNumber(
    getFieldVal(mNode, ['Hp', 'HPeso', 'Altezza', 'Alt', 'H', 'Peso', 'AltezzaPeso', 'Dim3'])
  );
  const qty = parseDcfNumber(
    getFieldVal(mNode, ['Qt', 'Qta', 'Quantita', 'Prodotto', 'Totale', 'Valore', 'Sommano', 'Misura'])
  );

  const flagsStr = (
    getFieldVal(mNode, ['Detrazione', 'IsDetrazione', 'Segno', 'Tipo', 'TipoRigo', 'Azione']) || ''
  ).toLowerCase();
  const fgsNum = parseInt(getFieldVal(mNode, ['Fgs', 'Flags']) || '0', 10);

  const isSubtotal =
    flagsStr.includes('subtot') ||
    flagsStr.includes('parzial') ||
    flagsStr === 's' ||
    (fgsNum & 4) !== 0 ||
    desc.toLowerCase().startsWith('sommano parziali');

  const isDeduction =
    flagsStr === '1' ||
    flagsStr === 'true' ||
    flagsStr === '-' ||
    flagsStr.includes('detr') ||
    flagsStr === 'd' ||
    (fgsNum & 2) !== 0 ||
    (qty !== undefined && qty < 0) ||
    (mult !== undefined && mult < 0) ||
    desc.toLowerCase().includes('a dedurre') ||
    desc.toLowerCase().includes('detrazione');

  const hasAnyDimension =
    (mult !== undefined && mult !== 0) ||
    (length !== undefined && length !== 0) ||
    (width !== undefined && width !== 0) ||
    (height !== undefined && height !== 0) ||
    (qty !== undefined && qty !== 0);

  if (!desc && !hasAnyDimension && !isSubtotal) {
    return null;
  }

  return {
    description: desc,
    multiplier: mult !== undefined && mult !== 0 ? Math.abs(mult) : undefined,
    length: length !== undefined && length !== 0 ? Math.abs(length) : undefined,
    width: width !== undefined && width !== 0 ? Math.abs(width) : undefined,
    height: height !== undefined && height !== 0 ? Math.abs(height) : undefined,
    quantity: qty !== undefined ? Math.abs(qty) : undefined,
    isDeduction,
    isSubtotal,
    isCommentOnly: Boolean(desc) && !hasAnyDimension && !isSubtotal
  };
}

/**
 * Estrae le Voci di Computo e relative misurazioni da `CollectionVC.xml` (o XPWE)
 */
function parseCollectionVC(
  vcXml?: string,
  xpweXml?: string,
  stMap?: Map<string, string>
): RawVcItem[] {
  const vcItems: RawVcItem[] = [];
  const sourceXml = vcXml || xpweXml;
  if (!sourceXml) return vcItems;

  const tree = parseXmlToLiteTree(sourceXml);
  const vcTagNames = new Set([
    'itemvc',
    'vcitem',
    'vocecomputo',
    'pwevcitem',
    'pwevocicomputoitem',
    'vocemisura',
    'articolocomputo'
  ]);
  const measTagNames = new Set([
    'itemrm',
    'itemvrm',
    'rmitem',
    'rigo',
    'riga',
    'misura',
    'misurazione',
    'vcsubitem',
    'rigamisura',
    'rgitem',
    'pwevcmisure',
    'pwerigomisura',
    'rigocomputo',
    'dettagliomisura'
  ]);

  const candidateNodes = collectNodesByPredicate(tree, n => {
    const t = n.tagName.toLowerCase();
    if (vcTagNames.has(t)) return true;
    if (t === 'item' || t === 'record' || t === 'voce') {
      const hasEpRef = Boolean(getFieldVal(n, ['IdEP', 'IDEP', 'IDArticolo', 'IDVoceEP', 'RefEP', 'CodEP', 'IDTariffa']));
      return hasEpRef;
    }
    return false;
  });

  candidateNodes.forEach((node, idx) => {
    const id = getFieldVal(node, ['IdVC', 'IDVC', 'ID', 'Id', 'Key', 'Progressivo']) || String(idx + 1);
    const epId =
      getFieldVal(node, ['IdEP', 'IDEP', 'IDArticolo', 'IDVoceEP', 'RefEP', 'IDVoce', 'IDTariffa', 'CodEP']) || '';
    const epCode = getFieldVal(node, [
      'Tariffa',
      'Trf',
      'CodTariffa',
      'CodiceTariffa',
      'CodArt',
      'CodiceArticolo',
      'Sigla',
      'Codice',
      'CodEP',
      'Cod',
      'Num'
    ]);
    const categoryId = getFieldVal(node, [
      'IdCat',
      'IDCat',
      'IdSbCat',
      'IDSbCat',
      'IdCap',
      'IDCap',
      'IdSbCap',
      'IDSbCap',
      'IdGP',
      'IDGP',
      'IdWBS',
      'IDWBS',
      'IDCategoria',
      'IDCapitolo',
      'IDGruppo',
      'Cat',
      'Cap'
    ]);
    const superCategoryId = getFieldVal(node, ['IdSpCat', 'IDSpCat', 'IdSpCap', 'IDSpCap', 'IDSuperCategoria', 'IDSuperCapitolo']);

    const quantity = parseDcfNumber(
      getFieldVal(node, ['Qt', 'Qta', 'Quantita', 'TotaleQta', 'QuantitaTotale', 'Sommano', 'Totale'])
    );
    const totalAmount = parseDcfNumber(
      getFieldVal(node, ['Imprt', 'Imp', 'Importo', 'ImportoTotale', 'TotaleImporto'])
    );
    let unitPrice = parseDcfNumber(
      getFieldVal(node, ['Pr1', 'Prz', 'Prezzo', 'Prezzo1', 'PrezzoUnitario', 'PU'])
    );
    // Se il prezzo unitario non è esplicito in ItemVC ma sono presenti Importo (`Imprt`) e Quantità (`Qt`), ricavalo:
    if (unitPrice === undefined && totalAmount !== undefined && quantity !== undefined && Math.abs(quantity) > 1e-6) {
      unitPrice = Math.round((totalAmount / quantity) * 100) / 100;
    }

    const stVcId = getFieldVal(node, [
      'IdST',
      'IDST',
      'IdSTEstesa',
      'IDSTEstesa',
      'IdSTRidotta',
      'IDSTRidotta',
      'IdDes',
      'IDDes',
      'IdTesto',
      'IDTesto',
      'RefST'
    ]);
    let vcStText: string | undefined;
    if (stVcId && stMap) {
      vcStText = stMap.get(stVcId) || stMap.get(`st_${stVcId}`) || stMap.get(stVcId.replace(/\.$/, ''));
    }

    const descriptionOverride =
      getFieldVal(node, [
        'Des',
        'DesEstesa',
        'DescrizioneEstesa',
        'DesRidotta',
        'DescrizioneRidotta',
        'Descrizione',
        'Dsc',
        'Testo',
        'Designazione'
      ]) || vcStText;

    const rawUnitOverride = getFieldVal(node, [
      'Um',
      'UM',
      'UnitaMisura',
      'UnMis',
      'Udm',
      'UDM',
      'SiglaUM',
      'DesUM'
    ]);
    const unitOverride = normalizeUnit(rawUnitOverride);

    // Cerca righe di misurazione figlie (<CollectionRM> -> <ItemRM>)
    const measNodes = collectNodesByPredicate(node, child => {
      if (child === node) return false;
      const ct = child.tagName.toLowerCase();
      if (measTagNames.has(ct)) return true;
      if (ct === 'item' || ct === 'row' || ct === 'record') {
        return Boolean(
          getFieldVal(child, [
            'IdRM',
            'IDRM',
            'Pu',
            'PartiUguali',
            'ParUg',
            'Lu',
            'Lunghezza',
            'Lung',
            'La',
            'Larghezza',
            'Larg',
            'Hp',
            'Altezza',
            'Alt',
            'HPeso',
            'Qt',
            'Quantita',
            'Qta'
          ])
        );
      }
      return false;
    });

    const measurements: RawVcMeasurement[] = [];
    let pendingComments: string[] = [];

    for (const mn of measNodes) {
      const parsedM = parseMeasurementNode(mn);
      if (!parsedM) continue;
      if (parsedM.isCommentOnly) {
        pendingComments.push(parsedM.description);
        continue;
      }
      if (pendingComments.length > 0) {
        parsedM.description = [...pendingComments, parsedM.description].filter(Boolean).join(' - ');
        pendingComments = [];
      }
      measurements.push(parsedM);
    }

    // Se ci sono commenti residui e almeno una misura precedente, accodali
    if (pendingComments.length > 0 && measurements.length > 0) {
      const lastM = measurements[measurements.length - 1];
      lastM.description = [lastM.description, ...pendingComments].filter(Boolean).join(' - ');
    }

    // Se il nodo VC stesso contiene dimensioni dirette (struttura piatta senza sotto-nodi Rigo)
    if (measurements.length === 0) {
      const directMeas = parseMeasurementNode(node);
      if (directMeas && !directMeas.isCommentOnly) {
        measurements.push(directMeas);
      }
    }

    vcItems.push({
      id,
      epId,
      epCode,
      categoryId,
      superCategoryId,
      quantity,
      unitPrice,
      descriptionOverride,
      unitOverride,
      measurements,
      order: idx + 1
    });
  });

  return vcItems;
}

/**
 * Converte una misurazione grezza del .dcf in un oggetto `Measurement` di GeCoLa,
 * verificando se il prodotto `Par.Ug * Lung * Larg * H/Peso` coincide con la quantità del rigo:
 * - Se coincide (tolleranza <= 0.02), lascia la formula attiva senza blocco pdfQuantity.
 * - Se NON coincide (o se sono presenti solo quantità dirette), mantiene tutti gli elementi trovati
 *   e imposta `pdfQuantity` al valore esatto indicato nel file .dcf.
 */
function buildGeCoLaMeasurement(rawM: RawVcMeasurement, id: string): Measurement {
  if (rawM.isSubtotal) {
    return {
      id,
      description: rawM.description || 'Sommano parziali',
      type: 'subtotal'
    };
  }

  const hasDims =
    rawM.length !== undefined || rawM.width !== undefined || rawM.height !== undefined;
  const hasMult = rawM.multiplier !== undefined;

  const mult = hasMult ? rawM.multiplier! : hasDims ? 1 : 0;
  const l = rawM.length === undefined ? 1 : rawM.length;
  const w = rawM.width === undefined ? 1 : rawM.width;
  const h = rawM.height === undefined ? 1 : rawM.height;
  const base = hasDims ? l * w * h : !hasDims && mult !== 0 ? 1 : 0;
  const formulaProduct = Math.round(base * mult * 100) / 100;

  let pdfQuantity: number | undefined;
  if (rawM.quantity !== undefined && rawM.quantity > 0) {
    if (!hasDims && !hasMult) {
      // Nessun fattore dimensionale ma quantità presente: usa pdfQuantity
      pdfQuantity = rawM.quantity;
    } else if (Math.abs(formulaProduct - rawM.quantity) > 0.02) {
      // La quantità nel .dcf non corrisponde al prodotto degli elementi: lascia gli elementi trovati e fissa la quantità del .dcf
      pdfQuantity = rawM.quantity;
    }
  }

  return {
    id,
    description: rawM.description || 'Misurazione',
    type: rawM.isDeduction ? 'deduction' : 'positive',
    multiplier: rawM.multiplier,
    length: rawM.length,
    width: rawM.width,
    height: rawM.height,
    pdfQuantity
  };
}

function computeMeasurementContribution(m: Measurement): number {
  if (m.type === 'subtotal') return 0;
  const sign = m.type === 'deduction' ? -1 : 1;
  const hasDims = m.length !== undefined || m.width !== undefined || m.height !== undefined;
  const hasMult = m.multiplier !== undefined;

  if (!hasDims && !hasMult) {
    return (m.pdfQuantity ?? 0) * sign;
  }

  const mult = hasMult ? m.multiplier! : 1;
  const l = m.length ?? 1;
  const w = m.width ?? 1;
  const h = m.height ?? 1;
  const base = hasDims ? l * w * h : 1;
  const formulaVal = Math.round(base * mult * 100) / 100;

  if (m.pdfQuantity !== undefined && Math.abs(formulaVal - m.pdfQuantity) > 0.02) {
    return m.pdfQuantity * sign;
  }
  return formulaVal * sign;
}

/**
 * Funzione principale di conversione di un file `.dcf` (ACCA PriMus) nel formato interno `ConvertedComputoResult` di GeCoLa.
 */
export async function convertDcfComputo(
  fileOrBuffer: File | ArrayBuffer | Uint8Array,
  fileName?: string,
  onProgress?: (step: string) => void
): Promise<ConvertedComputoResult> {
  let uint8: Uint8Array;
  if (fileOrBuffer instanceof File) {
    const ab = await fileOrBuffer.arrayBuffer();
    uint8 = new Uint8Array(ab);
    fileName = fileName || fileOrBuffer.name;
  } else if (fileOrBuffer instanceof Uint8Array) {
    uint8 = fileOrBuffer;
  } else {
    uint8 = new Uint8Array(fileOrBuffer);
  }

  if (uint8.length < 16) {
    throw new Error('Il file .dcf selezionato è vuoto o danneggiato.');
  }

  onProgress?.('Estrazione e decompressione stream XML dal contenitore .dcf...');

  // 1. Estrazione e decompressione degli stream XML dal contenitore .dcf
  const streams = extractDcfXmlStreams(uint8);
  if (streams.rawXmlStreams.length === 0) {
    throw new Error(
      'Il file .dcf sembra essere di una versione o variante non supportata (nessun stream XML standard trovato). Attendo il formato aperto di interscambio per procedere.'
    );
  }

  onProgress?.('Parsing struttura WBS, Elenco Prezzi e Misurazioni...');
  await new Promise((r) => setTimeout(r, 0));

  // Attiva cache alberi XML per evitare di ri-parsare più volte lo stesso stream (es. xpweXml)
  activeXmlCache = new Map<string, LiteXmlNode>();
  try {
    // 2. Parsing Metadati Progetto (InfoDoc.xml + DatiGenerali.xml)
    const projectInfo = parseProjectMetadata(streams.infoDocXml, streams.datiGeneraliXml, fileName);

    // 3. Parsing SuperTesti / String Table (CollectionST.xml)
    const stMap = parseCollectionST(streams.collectionSTXml);

    // 4. Parsing Categorie / Capitoli WBS (CollectionGP.xml)
    const rawCategories = parseCollectionGP(streams.collectionGPXml, streams.datiGeneraliXml, streams.xpweXml);

    // 5. Parsing Elenco Prezzi (CollectionEP.xml)
    let epMap = parseCollectionEP(streams.collectionEPXml, streams.xpweXml, stMap);

    // 6. Parsing Voci di Computo e Misure (CollectionVC.xml)
    let rawVcItems = parseCollectionVC(streams.collectionVCXml, streams.xpweXml, stMap);

  // Fallback: se epMap o rawVcItems sono vuoti, cerca in tutti gli stream XML estratti
  if (epMap.size === 0) {
    for (const s of streams.rawXmlStreams) {
      if (
        s.xml &&
        (s.xml.includes('<ItemEP') ||
          s.xml.includes('<EPItem') ||
          s.xml.includes('<ElencoPrezzi') ||
          s.xml.includes('<Articol') ||
          s.xml.includes('<Tariff'))
      ) {
        const altEp = parseCollectionEP(s.xml, streams.xpweXml, stMap);
        if (altEp.size > 0) {
          epMap = altEp;
          break;
        }
      }
    }
  }

  if (rawVcItems.length === 0) {
    for (const s of streams.rawXmlStreams) {
      if (
        s.xml &&
        (s.xml.includes('<ItemVC') ||
          s.xml.includes('<VCItem') ||
          s.xml.includes('<VociComputo') ||
          s.xml.includes('<Misur') ||
          s.xml.includes('<RigoMisura'))
      ) {
        const altVc = parseCollectionVC(s.xml, streams.xpweXml, stMap);
        if (altVc.length > 0) {
          rawVcItems = altVc;
          break;
        }
      }
    }
  }

  // Costruzione mappa Categorie WBS di GeCoLa
  const categoryIdToCodeMap = new Map<string, string>();
  const categories: Category[] = [];

  const nonSuperRawCats = rawCategories.filter(c => !c.isSuperCategory);
  const effectiveRawCats = nonSuperRawCats.length > 0 ? nonSuperRawCats : rawCategories;

  if (effectiveRawCats.length > 0) {
    effectiveRawCats.forEach((rc, idx) => {
      const wbsCode = `WBS.${String(idx + 1).padStart(2, '0')}`;
      categoryIdToCodeMap.set(rc.id, wbsCode);
      categoryIdToCodeMap.set(rc.code, wbsCode);
      categoryIdToCodeMap.set(String(idx + 1), wbsCode);
      categories.push({
        id: `cat_dcf_${idx + 1}`,
        code: wbsCode,
        name: rc.name.toUpperCase(),
        type: 'work',
        isEnabled: true,
        isSuperCategory: false
      });
    });
  } else {
    const defaultCode = 'WBS.01';
    categoryIdToCodeMap.set('default', defaultCode);
    categories.push({
      id: 'cat_dcf_1',
      code: defaultCode,
      name: 'LAVORI A MISURA',
      type: 'work',
      isEnabled: true,
      isSuperCategory: false
    });
  }

  const defaultCategoryCode = categories[0].code;

  // 7. Assemblaggio Articoli e Misurazioni
  const articles: Article[] = [];

  if (rawVcItems.length > 0) {
    rawVcItems.forEach((vc, idx) => {
      const order = idx + 1;
      const ep =
        epMap.get(vc.epId) ||
        (vc.epCode ? epMap.get(`code_${vc.epCode}`) : undefined) ||
        (vc.epCode ? epMap.get(`prog_${vc.epCode}`) : undefined) ||
        epMap.get(String(vc.epId)) ||
        epMap.get(`idx0_${vc.epId}`) ||
        epMap.get(String(order)) ||
        epMap.get(`idx0_${idx}`);

      const rawCatRef = vc.categoryId || ep?.categoryId || vc.superCategoryId || '';
      const assignedCatCode =
        (rawCatRef && categoryIdToCodeMap.get(rawCatRef)) || defaultCategoryCode;

      // 1. Risoluzione Codice Tariffa (priorità al codice tariffa reale, evitando che Cod="001." prevalga)
      let tariffCode = ep?.code || vc.epCode || '';
      if (!tariffCode || /^\d{1,4}\.?$/.test(tariffCode.trim())) {
        if (vc.epCode && !/^\d{1,4}\.?$/.test(vc.epCode.trim())) {
          tariffCode = vc.epCode;
        } else if (ep?.code && !/^\d{1,4}\.?$/.test(ep.code.trim())) {
          tariffCode = ep.code;
        } else if (!tariffCode) {
          tariffCode = `NP.${String(order).padStart(3, '0')}`;
        }
      }

      // 2. Risoluzione Descrizione (con fallback su SuperTesti ST)
      let description = ep?.description || vc.descriptionOverride || '';
      if (!description || description.startsWith('Voce ') || description.startsWith('Voce di computo')) {
        const candidateStKeys = [
          vc.epId,
          vc.id,
          String(order),
          `st_${vc.epId}`,
          `st_${vc.id}`,
          `st_${order}`
        ];
        for (const k of candidateStKeys) {
          if (k && stMap.has(k)) {
            const stVal = stMap.get(k);
            if (stVal && stVal.length > 3) {
              description = stVal;
              break;
            }
          }
        }
      }
      if (!description) {
        description = `Voce di computo n. ${order}`;
      }

      // 3. Risoluzione e Inferenza Intelligente dell'Unità di Misura
      let unit = ep?.unit || vc.unitOverride || '';
      if (!unit || unit === 'cad' || unit === 'n' || unit === 'nr') {
        let hasVolume = false;
        let hasArea = false;
        let hasLength = false;

        for (const m of vc.measurements) {
          if (m.isSubtotal) continue;
          const l = m.length !== undefined && m.length > 0;
          const w = m.width !== undefined && m.width > 0;
          const h = m.height !== undefined && m.height > 0;
          if (l && w && h) {
            hasVolume = true;
            break;
          } else if (l && w) {
            hasArea = true;
          } else if (l || w || h) {
            hasLength = true;
          }
        }

        if (hasVolume) {
          unit = 'm³';
        } else if (hasArea) {
          unit = 'm²';
        } else if (hasLength) {
          unit = 'm';
        } else if (!unit) {
          unit = 'cad';
        }
      }
      unit = normalizeUnit(unit);

      const unitPrice =
        ep?.unitPrice && ep.unitPrice > 0
          ? ep.unitPrice
          : vc.unitPrice ?? ep?.unitPrice ?? 0;
      const laborRate = ep?.laborRate ?? 35.0;

      const measurements: Measurement[] = vc.measurements.map((m, mIdx) =>
        buildGeCoLaMeasurement(m, `m_dcf_${order}_${mIdx + 1}`)
      );

      let computedQty = measurements.reduce((sum, m) => sum + computeMeasurementContribution(m), 0);
      computedQty = Math.round(computedQty * 100) / 100;

      // Garantisce fedeltà assoluta con la quantità totale della voce nel .dcf
      const targetQty = vc.quantity !== undefined ? Math.round(vc.quantity * 100) / 100 : computedQty;

      if (measurements.length === 0) {
        measurements.push({
          id: `m_dcf_${order}_1`,
          description: 'Misurazione da computo PriMus (.dcf)',
          type: targetQty < 0 ? 'deduction' : 'positive',
          pdfQuantity: Math.abs(targetQty)
        });
        computedQty = targetQty;
      } else if (vc.quantity !== undefined && Math.abs(computedQty - targetQty) > 0.02) {
        if (measurements.length === 1 && measurements[0].type !== 'subtotal') {
          measurements[0].pdfQuantity = Math.abs(targetQty);
          measurements[0].type = targetQty < 0 ? 'deduction' : 'positive';
        }
        computedQty = targetQty;
      }

      articles.push({
        id: `art_dcf_${order}`,
        categoryCode: assignedCatCode,
        code: tariffCode,
        originalGlobalIndex: order,
        priceListSource:
          ep?.priceListSource ||
          (tariffCode.toUpperCase().startsWith('NP') || tariffCode.toUpperCase().startsWith('NV')
            ? 'Nuovo Prezzo PriMus (.dcf)'
            : 'Prezzario PriMus (.dcf)'),
        description,
        unit,
        unitPrice,
        laborRate,
        measurements,
        quantity: computedQty,
        displayMode: 0
      });
    });
  } else if (epMap.size > 0) {
    // Caso in cui il file .dcf contenga un Elenco Prezzi senza Voci di Computo (Listino .dcf)
    const uniqueEpArticles = Array.from(new Set(epMap.values()));
    uniqueEpArticles.forEach((ep, idx) => {
      const order = idx + 1;
      const assignedCatCode =
        (ep.categoryId && categoryIdToCodeMap.get(ep.categoryId)) || defaultCategoryCode;

      articles.push({
        id: `art_dcf_ep_${order}`,
        categoryCode: assignedCatCode,
        code: ep.code,
        originalGlobalIndex: order,
        priceListSource: ep.priceListSource || 'Elenco Prezzi PriMus (.dcf)',
        description: ep.description,
        unit: normalizeUnit(ep.unit) || 'cad',
        unitPrice: ep.unitPrice,
        laborRate: ep.laborRate ?? 35.0,
        measurements: [
          {
            id: `m_dcf_ep_${order}_1`,
            description: 'Voce da Elenco Prezzi PriMus (.dcf)',
            type: 'positive',
            pdfQuantity: 1
          }
        ],
        quantity: 1,
        displayMode: 0
      });
    });
  }

  if (articles.length === 0) {
    throw new Error(
      'Nessuna voce di computo o articolo di elenco prezzi trovato negli stream XML del file .dcf.'
    );
  }

  // Filtra eventuali categorie rimaste vuote (mantenendo almeno la prima se tutte vuote)
  const usedCatCodes = new Set(articles.map(a => a.categoryCode));
  const finalCategories = categories.filter(c => usedCatCodes.has(c.code));
  if (finalCategories.length === 0) {
    finalCategories.push(categories[0]);
  }

  const totalAmount = articles.reduce((sum, a) => sum + a.unitPrice * a.quantity, 0);

    return {
      projectInfo,
      categories: finalCategories,
      articles,
      totalAmount,
      totalPages: streams.rawXmlStreams.length,
      articlesCount: articles.length,
      fileName
    };
  } finally {
    activeXmlCache = null;
  }
}
