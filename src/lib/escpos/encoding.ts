/**
 * Character sets for ESC/POS text. Thermal printers print one byte per character from a code
 * page chosen with ESC t. Characters the chosen code page lacks (₹, Hindi and other Indian
 * scripts, emoji…) cannot be sent as text; the receipt engine prints those lines as an image.
 */
export type PrinterEncoding = 'pc437' | 'pc858' | 'wpc1252';

/** Code page tables for bytes 0x80–0xFF. */
const PC437 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const PC858 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈ€ÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';

function table1252() {
  try {
    const bytes = new Uint8Array(128).map((_, i) => 0x80 + i);
    return new TextDecoder('windows-1252').decode(bytes);
  } catch {
    return '';
  }
}

export const ENCODINGS: Record<PrinterEncoding, { label: string; escT: number; high: () => string }> = {
  pc437: { label: 'PC437 — standard (most printers)', escT: 0, high: () => PC437 },
  pc858: { label: 'PC858 — Western European with €', escT: 19, high: () => PC858 },
  wpc1252: { label: 'WPC1252 — Windows Latin', escT: 16, high: table1252 },
};

const maps = new Map<PrinterEncoding, Map<string, number>>();
function mapFor(enc: PrinterEncoding) {
  let m = maps.get(enc);
  if (!m) {
    m = new Map();
    const high = ENCODINGS[enc].high();
    for (let i = 0; i < high.length; i++) if (!m.has(high[i])) m.set(high[i], 0x80 + i);
    maps.set(enc, m);
  }
  return m;
}

/**
 * Plain-text equivalents for characters bills often contain but code pages don't have.
 * ₹ becomes "Rs." so amounts still print as text (fast and sharp).
 */
const SUBSTITUTE: Record<string, string> = {
  '₹': 'Rs.',
  '−': '-',
  '–': '-',
  '—': '-',
  '‐': '-',
  '×': 'x',
  '•': '*',
  '…': '...',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '\t': ' ',
};

/** Replaces characters that have a plain-text equivalent (₹ → Rs., − → -, …). */
export function simplify(text: string, enc: PrinterEncoding) {
  const m = mapFor(enc);
  let out = '';
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    // Control characters (ESC, GS, NUL…) never reach the printer from bill text.
    if (ch !== '\n' && ch !== '\t' && (c < 0x20 || c === 0x7f)) continue;
    if (c < 0x80 || m.has(ch)) out += ch;
    else out += SUBSTITUTE[ch] ?? ch;
  }
  // "·" is in PC437/PC858, but a plain hyphen reads better on cheap printers' fonts.
  return out.replace(/ · /g, ' - ');
}

/** True when every character of the (simplified) text exists in the code page. */
export function canEncode(text: string, enc: PrinterEncoding) {
  const m = mapFor(enc);
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (ch.length > 1) return false;
    if (c < 0x20 && ch !== '\n') return false;
    if (c >= 0x80 && !m.has(ch)) return false;
  }
  return true;
}

/** Encodes text for the printer. Characters the code page lacks become "?". Control characters are dropped. */
export function encode(text: string, enc: PrinterEncoding): number[] {
  const m = mapFor(enc);
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (ch === '\n') out.push(0x0a);
    else if (ch.length > 1 || c < 0x20 || c === 0x7f) {
      if (ch.length > 1 || c >= 0x20) out.push(0x3f);
    } else if (c < 0x80) out.push(c);
    else out.push(m.get(ch) ?? 0x3f);
  }
  return out;
}
