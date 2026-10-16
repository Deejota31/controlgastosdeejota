# Estado de implementación

> Documento de continuidad: si la sesión pierde contexto, continuar desde aquí sin reiniciar ni pedir de nuevo el encargo.
> El estado detallado por requisito está en [MATRIZ-REQUISITOS.md](MATRIZ-REQUISITOS.md) (generada con `node scripts/matriz/generar.mjs`).

## Piezas independientes (no confundir)

| Pieza | Dónde vive | Cómo se actualiza |
|---|---|---|
| Frontend | Netlify `https://deejota-finanzas.netlify.app`, build de `main` (`web/`) | Merge a `main` → deploy automático |
| Backend | Deployment de Apps Script del propietario (versión/ID propios) | **Manual**: pegar `Code.gs`/`appsscript.json` y publicar una *nueva versión* de la implementación. Un merge no actualiza Apps Script |
| Datos | Hoja «Control de Gastos Deejota» (producción) | Solo a través de la API; **ninguna prueba escribe aquí** |

Entorno de pruebas aislado: pendiente de crear por el propietario o de recibir uno identificado (ver bloqueos).

## Línea base verificada (commit `63a9045` en main)

- Código: ~5 700 líneas de frontend/pruebas y ~3 800 de `Code.gs`.
- Pruebas ejecutadas en esa línea: 93 app/motor, 84 backend (simulador), 24 e2e (demo).
- Módulos con pantalla real: Inicio mínimo y Configuración › Conexión. El resto muestra `EnConstruccion` (AUD-01).

## Decisiones tomadas

1. La matriz se genera por script para no desincronizar estado y requisitos; el script comprueba que las pruebas citadas existan.
2. «Verificado en demo» = simulador/demo/navegador. Solo la integración con Apps Script y Sheets reales de prueba cuenta como «verificado en integración».
3. Producción es intocable: sin `setup`, importación ni datos de prueba contra la hoja real.
4. El merge a `main` se hace al final y solo si se cumplen las condiciones de la sección H; los avances por fases se identifican como tales.

## Avance

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Diagnóstico, matriz y estado | En curso (matriz y estado creados) |
| A | Transversales: fecha viva, URL estricta, demo único, cola/idempotencia, API.md, entorno de pruebas | Pendiente |
| B | Componentes base, formulario único y Movimientos | Pendiente |
| C | Catálogo y Presupuesto | Pendiente |
| D | Gastos del mes y compromisos | Pendiente |
| E | Dashboard y filtros globales | Pendiente |
| F | Salud financiera y conciliación | Pendiente |
| G | Planificación, recordatorios, búsqueda y Configuración | Pendiente |
| H | Importación/exportación, mantenimiento, atajo, seguridad, a11y, PWA y rendimiento | Pendiente |
| I | Regresión, PR, despliegue y smoke | Pendiente |

## Próximo paso

Fase A: `useHoy`, validación estricta de URL, demo único, deduplicación durable, cola con pendiente de confirmar.

## Bloqueos conocidos

- **Integración real (F1.6 / QA-06):** requiere un deployment de Apps Script y una hoja exclusivos de pruebas. Esta sesión no puede crear ni publicar deployments de Apps Script. Se entregará el procedimiento exacto y las suites listas; hasta que el propietario provea el entorno, esos requisitos quedan como «bloqueado».
- **Lighthouse real sobre Netlify y cabeceras HTTP reales (SEG-11):** requieren acceso de red a la URL pública desde esta sesión; se intentará con las herramientas disponibles y, si no, se documentará.
