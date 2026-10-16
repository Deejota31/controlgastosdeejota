/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

const CODE_GS = fileURLToPath(new URL('../apps-script/Code.gs', import.meta.url))

/**
 * Expone el Code.gs REAL como módulo del navegador para el modo demostración:
 * se envuelve en una función que recibe los servicios simulados de Google (sin eval, compatible con CSP).
 */
function codeGsVirtual(): Plugin {
  const id = 'virtual:code-gs'
  const resuelto = '\0' + id
  return {
    name: 'code-gs-virtual',
    resolveId: (origen) => (origen === id ? resuelto : null),
    load(origen) {
      if (origen !== resuelto) return null
      this.addWatchFile(CODE_GS)
      const fuente = readFileSync(CODE_GS, 'utf8')
      return `export function crearBackend(G) {
  const { SpreadsheetApp, CacheService, PropertiesService, LockService, Utilities, ContentService, MimeType, DriveApp, console } = G;
${fuente}
  return { doPost, setup, resetCtx: function () { CTX = null; } };
}`
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@gas': fileURLToPath(new URL('../apps-script/test', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { fs: { allow: ['..'] } },
  plugins: [
    codeGsVirtual(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Deejota Finanzas',
        short_name: 'Deejota',
        description: 'Gastos, presupuesto y salud financiera personal.',
        lang: 'es-PE',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F5F7FB',
        theme_color: '#1E3A8A',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'], navigateFallback: '/index.html' },
    }),
  ],
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
