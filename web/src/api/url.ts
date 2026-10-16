const RE_RUTA_WEBAPP = /^\/(?:macros\/s\/[A-Za-z0-9_-]{20,}|a\/macros\/[A-Za-z0-9.-]+\/s\/[A-Za-z0-9_-]{20,})\/exec$/

/**
 * Validación estricta de la URL de la aplicación web de Apps Script: https, host script.google.com,
 * ruta /macros/s/<id>/exec (o /a/macros/<dominio>/s/<id>/exec), sin credenciales, puerto, query ni hash.
 * Se aplica al guardar y también dentro del transporte HTTP.
 */
export function validarUrlWebApp(url: string): string | null {
  const u = url.trim()
  if (!u) return 'Pega la URL de la aplicación web.'
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return 'La URL no es válida. Debe verse como https://script.google.com/macros/s/…/exec'
  }
  if (parsed.protocol !== 'https:') return 'La URL debe empezar con https://'
  if (parsed.username || parsed.password) return 'La URL no debe incluir usuario ni contraseña.'
  if (parsed.hostname !== 'script.google.com') return 'La URL debe ser de script.google.com.'
  if (parsed.port) return 'La URL no debe indicar un puerto.'
  if (parsed.search || parsed.hash) return 'La URL no debe llevar parámetros ni #. Pega solo la dirección que termina en /exec.'
  if (!parsed.pathname.endsWith('/exec')) return 'La URL debe terminar en /exec (la de la implementación como aplicación web, no la del editor).'
  if (!RE_RUTA_WEBAPP.test(parsed.pathname)) return 'La ruta no parece una aplicación web: debe ser /macros/s/<id>/exec.'
  return null
}
