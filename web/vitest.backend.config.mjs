import { defineConfig } from 'vitest/config'
// Pruebas del backend (Code.gs) contra el simulador de Apps Script. No necesitan DOM.
export default defineConfig({
  test: { environment: 'node', include: ['tests-backend/**/*.test.mjs'], testTimeout: 30000 },
})
