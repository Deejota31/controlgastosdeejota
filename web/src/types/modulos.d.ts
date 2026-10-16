declare module 'virtual:code-gs' {
  export interface BackendGs {
    doPost(e: { postData: { contents: string } }): { getContent(): string }
    setup(): { token?: string; [k: string]: unknown }
    resetCtx(): void
  }
  export function crearBackend(servicios: unknown): BackendGs
}

declare module '@gas/gas-core.mjs' {
  export interface Servicios {
    libro: { hojas: Array<{ nombre: string; datos: unknown[][]; maxFilas: number; formatos: Record<number, string> }> }
    props: Map<string, string>
    libros: Map<string, unknown>
    Hoja: unknown
    [k: string]: unknown
  }
  export function crearServicios(cfg: {
    tz: string
    nuevaFecha: (s: string) => Date
    extras: {
      base64Encode: (x: unknown) => string
      base64Decode: (s: string) => number[]
      Utilities?: Record<string, unknown>
    }
  }): Servicios
}

declare module '@shared/descripcion.js' {
  export function normalizarDescripcion(texto: string, excepciones?: string[]): string
  export const EXCEPCIONES_DESCRIPCION_DEFECTO: string[]
}
