import { ApiError } from './cliente'

/** Versión del esquema de hojas que esta app entiende (SCHEMA_VERSION de Code.gs). */
export const ESQUEMA_ESPERADO = 1
/** Primera versión del backend con el contrato de API que usa esta app. */
export const BACKEND_MINIMO = '1.0.0'

const partes = (v: string) => v.split('.').map((x) => Number.parseInt(x, 10) || 0)
export function compararVersiones(a: string, b: string): number {
  const x = partes(a)
  const y = partes(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * Comprueba que el Code.gs desplegado sea compatible con esta app ANTES de habilitar escrituras o guardar
 * credenciales. Lanza ApiError('SCHEMA') con un mensaje accionable.
 */
export function verificarCompatibilidad(d: { esquema?: unknown; version_backend?: unknown } | null | undefined): void {
  const version = typeof d?.version_backend === 'string' ? d.version_backend : ''
  if (!version) {
    throw new ApiError('SCHEMA', 'El Code.gs desplegado no informa su versión: es más antiguo que esta app. Pega la versión nueva de Code.gs y vuelve a publicar la aplicación web.')
  }
  if (compararVersiones(version, BACKEND_MINIMO) < 0) {
    throw new ApiError('SCHEMA', `El Code.gs desplegado es la versión ${version} y esta app necesita ${BACKEND_MINIMO} o posterior. Actualízalo y publica una nueva versión de la implementación.`)
  }
  if (d?.esquema !== ESQUEMA_ESPERADO) {
    throw new ApiError(
      'SCHEMA',
      `La hoja usa el esquema ${String(d?.esquema ?? 'desconocido')} y esta app entiende el ${ESQUEMA_ESPERADO}. No se habilitan escrituras hasta alinear Code.gs y la app.`,
    )
  }
}
