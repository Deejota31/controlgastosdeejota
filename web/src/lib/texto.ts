/** Minúsculas y sin tildes: para buscar «cafe» y encontrar «Café». */
export function normalizarBusqueda(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
