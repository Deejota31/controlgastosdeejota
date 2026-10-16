import '@testing-library/jest-dom/vitest'

// jsdom no implementa matchMedia.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// La URL (hash) es estado compartido entre pruebas del mismo archivo: cada prueba parte de «#/» sin filtros.
import { afterEach } from 'vitest'
if (typeof window !== 'undefined') {
  afterEach(() => {
    if (window.location.hash && window.location.hash !== '#/') {
      window.history.replaceState(null, '', '#/')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    }
  })
}
