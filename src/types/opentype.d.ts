declare module 'opentype.js' {
  export interface Font {
    unitsPerEm: number
    ascender: number
    descender: number
    getPath(text: string, x: number, y: number, fontSize: number): Path
  }

  export interface Path {
    toPathData(decimalPlaces?: number): string
  }

  export function parse(buffer: ArrayBuffer): Font
}
