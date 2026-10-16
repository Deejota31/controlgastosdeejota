# Arquitectura

```
Navegador (PWA)                          Google
┌──────────────────────────┐   POST     ┌────────────────────┐
│ UI React + estado Zustand│ text/plain │ Apps Script (V8)   │
│ Motor de cálculo (puro)  │ ─────────▶ │ Code.gs  API JSON  │
│ Cola de escrituras (IDB) │ ◀───────── │        │           │
└──────────────────────────┘  JSON      │   Google Sheets    │
                                         └────────────────────┘
```

## Decisiones vigentes (Fase 1)

- **Router por hash** (`/#/ruta?filtros`): hosting estático sin reglas de reescritura y filtros en la URL.
- **Tokens semánticos** como variables CSS (claro/oscuro) expuestos a Tailwind con `@theme inline`.
- **Fecha viva**: `useHoy(tz)` recalcula "hoy" a medianoche de la zona configurada y al recuperar el foco.
- **Sin datos falsos**: sin conexión configurada se muestra el onboarding; los datos de demostración solo existen con `?demo`.
- **Catálogo `/#/ui`**: solo en desarrollo y modo demo.
