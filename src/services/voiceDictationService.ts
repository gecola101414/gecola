/**
 * Servizio Riconoscimento Vocale Intelligente per GeCoLa
 * Supporta dettatura continua, navigazione tra celle (avanti/indietro),
 * creazione automatica di nuovi righi misura e parsing numeri in italiano.
 */

export type VoiceField = 'description' | 'multiplier' | 'length' | 'width' | 'height';

export const MEASUREMENT_FIELDS: VoiceField[] = ['description', 'multiplier', 'length', 'width', 'height'];

export interface VoiceActionResult {
  command?: 'avanti' | 'indietro' | 'cancella' | 'cancella_rigo' | 'nuovo_rigo' | 'parziale';
  valueText?: string;
  valueNumber?: number;
  autoAdvance?: boolean;
}

// Mappa numeri italiani in parole
const ITALIAN_UNITS: Record<string, number> = {
  'zero': 0,
  'un': 1,
  'uno': 1,
  'una': 1,
  'due': 2,
  'tre': 3,
  'quattro': 4,
  'cinque': 5,
  'sei': 6,
  'sette': 7,
  'otto': 8,
  'nove': 9,
  'dieci': 10,
  'undici': 11,
  'dodici': 12,
  'tredici': 13,
  'quattordici': 14,
  'quindici': 15,
  'sedici': 16,
  'diciassette': 17,
  'diciotto': 18,
  'diciannove': 19
};

const ITALIAN_TENS: Record<string, number> = {
  'venti': 20,
  'ventuno': 21,
  'ventidue': 22,
  'ventitré': 23,
  'ventitre': 23,
  'ventiquattro': 24,
  'venticinque': 25,
  'ventisei': 26,
  'ventisette': 27,
  'ventotto': 28,
  'ventinove': 29,
  'trenta': 30,
  'trentuno': 31,
  'trentadue': 32,
  'trentatré': 33,
  'trentatre': 33,
  'trentaquattro': 34,
  'trentacinque': 35,
  'trentasei': 36,
  'trentasette': 37,
  'trentotto': 38,
  'trentanove': 39,
  'quaranta': 40,
  'quarantuno': 41,
  'quarantadue': 42,
  'quarantatré': 43,
  'quarantatre': 43,
  'quarantaquattro': 44,
  'quarantacinque': 45,
  'quarantasei': 46,
  'quarantasette': 47,
  'quarantotto': 48,
  'quarantanove': 49,
  'cinquanta': 50,
  'cinquantuno': 51,
  'cinquantadue': 52,
  'cinquantatré': 53,
  'cinquantatre': 53,
  'cinquantaquattro': 54,
  'cinquantacinque': 55,
  'cinquantasei': 56,
  'cinquantasette': 57,
  'cinquantotto': 58,
  'cinquantanove': 59,
  'sessanta': 60,
  'settanta': 70,
  'ottanta': 80,
  'novanta': 90
};

const ITALIAN_SCALES: Record<string, number> = {
  'cento': 100,
  'duecento': 200,
  'trecento': 300,
  'quattrocento': 400,
  'cinquecento': 500,
  'seicento': 600,
  'settecento': 700,
  'ottocento': 800,
  'novecento': 900,
  'mille': 1000,
  'duemila': 2000,
  'tremila': 3000
};

/**
 * Converte un token o una sequenza di parole italiane in numero intero
 */
function parseItalianIntegerWords(str: string): number | null {
  str = str.trim().toLowerCase();
  if (!str) return null;

  // Se è già un numero numerico
  const directNum = parseInt(str, 10);
  if (!isNaN(directNum) && String(directNum) === str) {
    return directNum;
  }

  if (str === 'mezzo' || str === 'mezza') return 0.5;

  if (ITALIAN_UNITS[str] !== undefined) return ITALIAN_UNITS[str];
  if (ITALIAN_TENS[str] !== undefined) return ITALIAN_TENS[str];
  if (ITALIAN_SCALES[str] !== undefined) return ITALIAN_SCALES[str];

  // Prova a combinare parole composte (es: "quaranta cinque", "due cento trenta")
  const tokens = str.split(/[\s-]+/);
  if (tokens.length > 1) {
    let total = 0;
    let current = 0;
    for (const token of tokens) {
      if (token === 'e') continue;
      const u = ITALIAN_UNITS[token];
      const t = ITALIAN_TENS[token];
      const s = ITALIAN_SCALES[token];
      const num = parseInt(token, 10);

      if (!isNaN(num)) {
        current += num;
      } else if (u !== undefined) {
        current += u;
      } else if (t !== undefined) {
        current += t;
      } else if (s !== undefined) {
        if (s >= 1000) {
          total += (current || 1) * s;
          current = 0;
        } else {
          current += s;
        }
      } else {
        return null;
      }
    }
    return total + current;
  }

  // Decomposizione di parole composte attaccate (es: "centoventi", "trecentocinquanta")
  for (const scaleName in ITALIAN_SCALES) {
    if (str.startsWith(scaleName) && str.length > scaleName.length) {
      const rest = str.substring(scaleName.length);
      const restVal = parseItalianIntegerWords(rest);
      if (restVal !== null) {
        return ITALIAN_SCALES[scaleName] + restVal;
      }
    }
  }

  // Decomposizione decine (es: "trentacinque", "ottantadue")
  for (const tensName in ITALIAN_TENS) {
    if (str.startsWith(tensName) && str.length > tensName.length) {
      const rest = str.substring(tensName.length);
      const restVal = parseItalianIntegerWords(rest);
      if (restVal !== null) {
        return ITALIAN_TENS[tensName] + restVal;
      }
    }
  }

  return null;
}

/**
 * Converte testo vocale parlato in numero (con supporto decimali, virgola, punto, e mezzo)
 * Es: "cinque virgola due" -> 5.2
 *     "quattro e mezzo" -> 4.5
 *     "12,5" -> 12.5
 *     "tre e cinquanta" -> 3.5
 *     "zero virgola quaranta" -> 0.4
 */
export function parseItalianSpokenNumber(text: string): number | null {
  if (!text) return null;
  let clean = text.trim().toLowerCase();

  // Gestione segno negativo
  let isNegative = false;
  if (clean.startsWith('meno ') || clean.startsWith('-')) {
    isNegative = true;
    clean = clean.replace(/^(meno\s+|-)/, '').trim();
  }

  // Se contiene già cifre con virgola o punto
  // es: "5,20" o "5.20"
  const digitsMatch = clean.match(/^(\d+)(?:[.,](\d+))?$/);
  if (digitsMatch) {
    const intPart = digitsMatch[1];
    const decPart = digitsMatch[2] || '0';
    const val = parseFloat(`${intPart}.${decPart}`);
    return isNegative ? -val : val;
  }

  // Gestione "e mezzo" / "e mezza"
  if (clean.endsWith(' e mezzo') || clean.endsWith(' e mezza')) {
    const beforeMezzo = clean.replace(/\s+e\s+mezz[oa]$/, '').trim();
    const baseInt = parseItalianIntegerWords(beforeMezzo);
    if (baseInt !== null) {
      const val = baseInt + 0.5;
      return isNegative ? -val : val;
    }
  }

  // Gestione divisori decimali: "virgola", "punto"
  // Es: "cinque virgola venti", "12 virgola 5", "due punto otto"
  const decimalSplit = clean.split(/\s*(?:virgola|punto)\s*/);
  if (decimalSplit.length === 2) {
    const intStr = decimalSplit[0].trim();
    const decStr = decimalSplit[1].trim();

    const intVal = parseItalianIntegerWords(intStr);
    let decVal = parseItalianIntegerWords(decStr);

    if (intVal !== null && decVal !== null) {
      // Gestione decimali (se "due" -> 0.2, se "venti" -> 0.20, se "zero cinque" -> 0.05)
      let decStrNumeric = String(decVal);
      // Se era una cifra singola detta come decimo (es. "virgola cinque" -> .5)
      const val = parseFloat(`${intVal}.${decStrNumeric}`);
      return isNegative ? -val : val;
    }
  }

  // Gestione "e" tra interi e centesimi: "tre e venti" -> 3.20 (tipico nel cantiere)
  const eSplit = clean.split(/\s+e\s+/);
  if (eSplit.length === 2) {
    const intVal = parseItalianIntegerWords(eSplit[0].trim());
    const decVal = parseItalianIntegerWords(eSplit[1].trim());
    if (intVal !== null && decVal !== null && decVal < 100) {
      const val = parseFloat(`${intVal}.${decVal}`);
      return isNegative ? -val : val;
    }
  }

  // Intero semplice
  const wholeVal = parseItalianIntegerWords(clean);
  if (wholeVal !== null) {
    return isNegative ? -wholeVal : wholeVal;
  }

  return null;
}

/**
 * Analizza la trascrizione vocale e determina l'azione o il valore per la cella corrente
 */
export function analyzeVoiceTranscript(
  rawTranscript: string, 
  currentField: VoiceField
): VoiceActionResult {
  const trimmed = rawTranscript.trim();
  const lower = trimmed.toLowerCase();

  // 1. Comandi di Navigazione Pura
  if (['avanti', 'prossimo', 'successivo', 'next', 'avanza'].includes(lower)) {
    return { command: 'avanti' };
  }

  if (['indietro', 'precedente', 'back', 'torna indietro'].includes(lower)) {
    return { command: 'indietro' };
  }

  if (['cancella rigo', 'elimina rigo', 'cancella riga', 'elimina riga'].includes(lower)) {
    return { command: 'cancella_rigo' };
  }

  if (['cancella', 'elimina', 'pulisci', 'svuota', 'cancella tutto'].includes(lower)) {
    return { command: 'cancella' };
  }

  if (['nuovo rigo', 'nuova riga', 'nuova misura', 'rigo nuovo', 'a capo', 'invio'].includes(lower)) {
    return { command: 'nuovo_rigo' };
  }

  if (['sommano', 'parziale', 'subtotale', 'totale parziale'].includes(lower)) {
    return { command: 'parziale' };
  }

  // 2. Dettatura con comando "avanti" in coda (es: "fondazioni corpo b avanti", "5 virgola 2 avanti")
  const trailingAvantiMatch = lower.match(/^(.*?)[\s,]+(?:avanti|successivo|next)$/);
  if (trailingAvantiMatch) {
    const content = trailingAvantiMatch[1].trim();
    if (currentField === 'description') {
      return {
        valueText: content,
        autoAdvance: true,
        command: 'avanti'
      };
    } else {
      const num = parseItalianSpokenNumber(content);
      if (num !== null) {
        return {
          valueNumber: num,
          autoAdvance: true,
          command: 'avanti'
        };
      }
    }
  }

  // 3. Valore inserito nella cella attiva
  if (currentField === 'description') {
    // In descrizione si inserisce direttamente il testo parlato naturale
    return {
      valueText: trimmed
    };
  } else {
    // In celle numeriche (parti uguali, lunghezza, larghezza, altezza)
    const num = parseItalianSpokenNumber(lower);
    if (num !== null) {
      return {
        valueNumber: num
      };
    }
    // Se non è riuscito a parsare un numero puro ma l'utente ha detto un numero in cifre
    const rawNumberMatch = trimmed.match(/^[\d.,]+$/);
    if (rawNumberMatch) {
      const parsedFloat = parseFloat(trimmed.replace(',', '.'));
      if (!isNaN(parsedFloat)) {
        return { valueNumber: parsedFloat };
      }
    }

    return {
      valueText: trimmed
    };
  }
}
