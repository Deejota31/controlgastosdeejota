# Deejota Finanzas

App web personal de **gastos, presupuesto y salud financiera**. Frontend React + TypeScript (PWA), backend en Google Apps Script y base de datos en Google Sheets.

> Estado: en construcción por fases (ver `docs/`). Rama de trabajo: `develop`; se publica desde `main`.

## Comandos (carpeta `web/`)

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck + build de producción |
| `npm run lint` | oxlint |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run test:e2e` | Pruebas E2E (Playwright, escritorio 1440 px y móvil 375 px) |
| `npm run size` | Presupuesto de bundle (≤ 130 KB gzip) |

Catálogo de componentes: `/#/ui` (solo en desarrollo o con `?demo`).

## Estructura

```
apps-script/   Backend (Code.gs)
web/           Frontend (Vite + React 19 + Tailwind 4)
docs/          Arquitectura, modelo de datos, despliegue
.github/       CI
```
