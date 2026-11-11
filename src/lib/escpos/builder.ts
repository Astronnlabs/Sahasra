import { encode, ENCODINGS, type PrinterEncoding } from './encoding';

/**
 * ESC/POS command builder (Epson standard, understood by almost every thermal receipt printer).
 * Only the receipt engine in this app produces commands: text is always passed through
 * `encode`, which removes control bytes, so bill contents (item names, notes) can never
 * smuggle printer commands in.
 */
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export type Alignment = 'left' | 'center' | 'right';

export interface Bitmap {
  /** Width in dots (a multiple of 8). */
  width: number;
  height: number;
  /** 1 bit per dot, rows of width/8 bytes, MSB first, 1 = black. */
  data: Uint8Array;
}

export class EscPos {
  private bytes: number[] = [];
  constructor(private readonly enc: PrinterEncoding) {}

  private push(...b: number[]) {
    for (const x of b) this.bytes.push(x & 0xff);
    return this;
  }

  /** ESC @ (reset) and the chosen code page. */
  init() {
    return this.push(ESC, 0x40, ESC, 0x74, ENCODINGS[this.enc].escT);
  }

  align(a: Alignment) {
    return this.push(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0);
  }

  bold(on: boolean) {
    return this.push(ESC, 0x45, on ? 1 : 0);
  }

  /** Double-strike: darker text on printers that print light. */
  doubleStrike(on: boolean) {
    return this.push(ESC, 0x47, on ? 1 : 0);
  }

  underline(on: boolean) {
    return this.push(ESC, 0x2d, on ? 1 : 0);
  }

  /** Character size multipliers, 1–4 each (GS !). */
  size(width: number, height: number) {
    const w = Math.min(Math.max(Math.round(width), 1), 4) - 1;
    const h = Math.min(Math.max(Math.round(height), 1), 4) - 1;
    return this.push(GS, 0x21, (w << 4) | h);
  }

  /** Line spacing in dots, or the printer's default. */
  lineSpacing(dots?: number) {
    return dots === undefined ? this.push(ESC, 0x32) : this.push(ESC, 0x33, Math.min(Math.max(Math.round(dots), 0), 255));
  }

  /** Text without a line break. */
  text(s: string) {
    this.bytes.push(...encode(s, this.enc));
    return this;
  }

  line(s = '') {
    return this.text(s).push(LF);
  }

  feed(lines = 1) {
    return this.push(ESC, 0x64, Math.min(Math.max(lines, 0), 255));
  }

  /** Feeds and cuts (partial cut). Only for printers with a cutter. */
  cut() {
    return this.push(GS, 0x56, 66, 3);
  }

  /** QR code printed by the printer itself (GS ( k, model 2). */
  qr(data: string, moduleSize = 6) {
    const d = Array.from(new TextEncoder().encode(data)).slice(0, 700);
    const len = d.length + 3;
    return this.push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0) // model 2
      .push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, Math.min(Math.max(moduleSize, 1), 16))
      .push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31) // error correction M
      .push(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...d)
      .push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30)
      .push(LF);
  }

  /** CODE128 barcode printed by the printer itself, with the text below it. */
  barcode128(value: string, height = 64) {
    const d = encode(value.replace(/[^\x20-\x7e]/g, ''), 'pc437').slice(0, 60);
    return this.push(GS, 0x68, Math.min(Math.max(height, 16), 255))
      .push(GS, 0x77, 2)
      .push(GS, 0x48, 2) // text below
      .push(GS, 0x66, 0)
      .push(GS, 0x6b, 73, d.length + 2, 0x7b, 0x42, ...d)
      .push(LF);
  }

  /**
   * Raster image (GS v 0), sent in bands so printers with small buffers keep up.
   * Logos, QR codes as images and lines in scripts the printer has no font for use this.
   */
  image(bmp: Bitmap, band = 128) {
    const bytesPerRow = bmp.width / 8;
    for (let y = 0; y < bmp.height; y += band) {
      const h = Math.min(band, bmp.height - y);
      this.push(GS, 0x76, 0x30, 0, bytesPerRow & 0xff, bytesPerRow >> 8, h & 0xff, h >> 8);
      const slice = bmp.data.subarray(y * bytesPerRow, (y + h) * bytesPerRow);
      for (let i = 0; i < slice.length; i++) this.bytes.push(slice[i]);
    }
    return this;
  }

  build() {
    return Uint8Array.from(this.bytes);
  }
}
