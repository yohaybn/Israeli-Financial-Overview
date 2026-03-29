/**
 * pdfjs-dist (used by pdf-parse) expects browser globals on Node. When @napi-rs/canvas
 * native bindings fail to load, pdf.mjs can throw ReferenceError: DOMMatrix is not defined
 * at module load time. Install minimal polyfills before any pdf-parse import.
 */
import CSSMatrix from 'dommatrix';
import { Path2D } from 'path2d';

if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = CSSMatrix as unknown as typeof DOMMatrix;
}
if (typeof globalThis.Path2D === 'undefined') {
    // path2d's Path2D is API-compatible; TS sees distinct nominal Path2D types vs lib.dom.
    globalThis.Path2D = Path2D as unknown as typeof globalThis.Path2D;
}
if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageDataPolyfill {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        constructor(dataOrWidth: number | Uint8ClampedArray, widthOrHeight?: number, height?: number) {
            if (typeof dataOrWidth === 'number') {
                const w = dataOrWidth;
                const h = widthOrHeight ?? 0;
                this.width = w;
                this.height = h;
                this.data = new Uint8ClampedArray(w * h * 4);
            } else {
                this.data = dataOrWidth;
                this.width = widthOrHeight ?? 0;
                this.height = height ?? 0;
            }
        }
    } as unknown as typeof ImageData;
}
