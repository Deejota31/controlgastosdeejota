/** Navegación a otra dirección (recarga la página). Aislada para poder probarla sin que jsdom navegue. */
export const navegador = {
  irA(url: string) {
    window.location.assign(url)
  },
}
