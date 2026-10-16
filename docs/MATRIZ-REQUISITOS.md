# Matriz de requisitos — Deejota Finanzas

> Generada con `node scripts/matriz/generar.mjs` desde `scripts/matriz/filas-*.mjs` (requisitos) y `scripts/matriz/estado.mjs` (estado y evidencia). No editar a mano.
>
> **Criterio:** «verificado en demo» significa probado con el simulador de Apps Script, la demo en memoria o el navegador; **no** equivale a integración real. «verificado en integración» exige backend y Google Sheets reales de prueba con relectura independiente.

## Resumen (306 requisitos)

- pendiente: **187**
- verificado en demo: **89**
- en curso: **27**
- implementado sin verificar: **3**

## Requisitos

| ID | requisito | origen/sección | pantalla/acción | implementación | API/hoja implicada | prueba automatizada | prueba de integración | evidencia | estado | bloqueo |
|---|---|---|---|---|---|---|---|---|---|---|
| AUD-01 | Movimientos, Presupuesto, Catálogo, Salud y Planificación son módulos completos (sin EnConstruccion) | B1 | Todas las rutas |  | todas |  |  |  | pendiente |  |
| AUD-02 | Inicio es el dashboard completo de la especificación | B1/J7.4 | Inicio |  | bootstrap |  |  |  | pendiente |  |
| AUD-03 | Buscar y Ctrl+K funcionan (búsqueda global y acciones) | B1/J7.2 | Barra superior |  | — |  |  |  | pendiente |  |
| AUD-04 | La campana muestra recordatorios y estados vacíos reales | B1/J7.2 | Barra superior |  | config, planificacion |  |  |  | pendiente |  |
| AUD-05 | Un único flujo demo (botón = ?demo), aislado y consistente | B1/C2/J4.2 | Sin conexión, banner |  | — |  |  |  | pendiente |  |
| AUD-06 | Configuración con todas sus secciones | B1/J7.11 | Configuración |  | varias |  |  |  | pendiente |  |
| AUD-07 | El FAB móvil "Nuevo gasto" abre el formulario único | B1/J5.2 | Barra inferior |  | movimiento.guardar |  |  |  | pendiente |  |
| AUD-08 | Fecha viva (useHoy) y zona horaria configurable en todos los cálculos | B1/J4.1 | Global |  | config.zona_horaria |  |  |  | pendiente |  |
| AUD-09 | Validación estricta de la URL de Apps Script antes de enviar el token | B1/E5 | Configuración | web/src/api/url.ts; validación también en transporteHttp | — | web/src/api/url.test.ts (14 casos) |  |  | verificado en demo |  |
| AUD-10 | Pruebas que detecten flujos inexistentes o rotos | B1/F | CI |  | — |  |  |  | pendiente |  |
| AUD-11 | Mi hoja apunta al destino correcto según la conexión | B1 | Barra superior |  | config |  |  |  | pendiente |  |
| AUD-12 | Drawer con foco controlado | B1/E4 | Layout |  | — |  |  |  | pendiente |  |
| GEN-01 | docs/MATRIZ-REQUISITOS.md con todos los requisitos descompuestos | B3 | docs | scripts/matriz/*.mjs → docs/MATRIZ-REQUISITOS.md | — |  |  |  | en curso |  |
| GEN-02 | docs/ESTADO-IMPLEMENTACION.md actualizado por incremento | B3 | docs | docs/ESTADO-IMPLEMENTACION.md | — |  |  |  | en curso |  |
| GEN-03 | develop sincronizado con main sin force-push | B2 | git |  | — |  |  | git merge origin/main en develop sin force-push | verificado en demo |  |
| GEN-04 | Piezas independientes identificadas: commit frontend / deployment Apps Script / spreadsheet | B2 | docs |  | — |  |  |  | pendiente |  |
| PRO-01 | No se ejecuta setup/reparación/importación/datos de prueba contra producción | C1 | Procesos |  | — |  |  |  | pendiente |  |
| PRO-02 | Ninguna prueba de escritura apunta a la hoja de producción (barrera por ID) | C2 | Pruebas | shared/barrera-produccion.mjs (huella SHA-256); el simulador y la barrera abortan con la hoja real | — | web/tests-backend/barrera.test.mjs |  |  | verificado en demo |  |
| PRO-03 | Entorno de pruebas identificable en backend y frontend (testRunId, datos TEST-) | C2 | Pruebas |  | _meta, config |  |  |  | pendiente |  |
| PRO-04 | Identidades, tokens, cachés, IndexedDB y colas separados por entorno y hoja | C2 | Almacén local | Cola, instantánea y coordinación separadas por entorno (hash de la URL) | — | web/src/api/cola.test.ts, web/src/store/datos.cola.test.ts |  |  | verificado en demo |  |
| PRO-05 | Demo en memoria: no lee ni modifica credenciales, caché ni registros reales | C2/J4.2 | Demo | La demo vive en memoria y no toca credenciales, colas ni IndexedDB | — | web/e2e/conexion.spec.ts |  |  | verificado en demo |  |
| PRO-06 | Sin tokens en código, VITE_*, bundle, Git, logs ni capturas | C3 | Build | Escaneo de credenciales en archivos versionados | — | web/tests-backend/barrera.test.mjs |  |  | verificado en demo | Falta escaneo del bundle y de capturas |
| API-01 | docs/API.md con todas las acciones, payloads, errores y ejemplos sin secretos | D2 | docs | docs/API.md generado desde Code.gs (62 acciones) y comprobado en CI | todas | scripts/docs/generar-api.mjs --check |  |  | verificado en demo |  |
| API-02 | POST /exec text/plain con token en cuerpo y requestId; redirecciones y CORS reales verificados | D2/J3.1 | Transporte |  | — |  |  |  | pendiente |  |
| API-03 | Sin no-cors para lecturas/escrituras de negocio; el ping opaco no autentica | D2 | Transporte |  | — |  |  |  | pendiente |  |
| API-04 | GET público solo salud/versión mínima | D2/J3.1 | doGet | Code.gs doGet | — | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| API-05 | Validación de versión de API/esquema antes de habilitar escrituras | D2 | Conexión | api/compat.ts: versión y esquema exigidos antes de guardar y de escribir | bootstrap | web/src/api/compat.test.ts, web/src/store/datos.test.ts |  |  | verificado en demo |  |
| API-06 | Una conexión incompatible no guarda credenciales ni invalida la previa | D2 | Conexión | probarConexion verifica antes de conectar; el flujo revierte si falla | — | web/src/api/compat.test.ts, web/src/app/App.test.tsx |  |  | verificado en demo |  |
| API-07 | Un solo bootstrap al conectar (prueba reutilizada) | D2 | Conexión | Configuracion reutiliza el bootstrap de la prueba (adoptarBootstrap) | bootstrap | web/src/app/App.test.tsx |  |  | verificado en demo |  |
| API-08 | Estados diferenciados: sin config, cargando, vacío, error, offline, datos sin confirmar | D2/J5.5 | Global |  | — |  |  |  | pendiente |  |
| IDP-01 | UUID y requestId una sola vez por operación lógica, conservados en reintentos | D3 | Cola | nuevoRequestId una vez por mutar; reintentos con el mismo | — | web/src/store/datos.cola.test.ts |  |  | verificado en demo |  |
| IDP-02 | Deduplicación persistente además de la caché de 500 | D3 | Backend | Code.gs: op:<requestId> en _meta con respuesta y huella (sobrevive a la caché) | _meta (op:<requestId>) | web/tests-backend/durabilidad.test.mjs |  |  | verificado en demo |  |
| IDP-03 | Dos peticiones iguales simultáneas no crean dos filas | D3 | Backend |  | lock |  |  |  | pendiente |  |
| IDP-04 | requestId reutilizado con payload distinto → conflicto/validación | D3 | Backend | Code.gs: huellaPeticion; CONFLICT campo requestId | — | web/tests-backend/durabilidad.test.mjs |  |  | verificado en demo |  |
| IDP-05 | Respuesta perdida → "pendiente de confirmar" y reconciliación por ID/versión/contenido | D3 | Cola/Store | Estado «por confirmar» + reenvío con el mismo requestId; el servidor devuelve la respuesta original | cambios | web/src/store/datos.cola.test.ts, web/tests-backend/durabilidad.test.mjs |  |  | verificado en demo |  |
| IDP-06 | Solo un rechazo definitivo revierte la proyección optimista | D3 | Store | Solo ApiError definitivo quita la proyección optimista | — | web/src/store/datos.test.ts |  |  | verificado en demo |  |
| IDP-07 | Backoff con jitter, límite de intentos; no reintenta AUTH/VALIDATION/CONFLICT/SCHEMA; clasifica HTML/redirecciones | D3 | Cliente | Backoff exponencial con variación ±20 %, pausa tras 10 fallos, SCHEMA para HTML/redirección | — | web/src/store/datos.cola.test.ts, web/src/demo/demo-url.test.ts |  |  | verificado en demo |  |
| IDP-08 | La cola se persiste antes de comunicar "guardado localmente"; si falla, se informa | D3 | Cola | La cola se escribe en IndexedDB antes de difundir; aviso si falla | — | web/src/api/cola.test.ts, web/src/store/datos.cola.test.ts |  |  | verificado en demo |  |
| IDP-09 | La cola conserva dependencias entre entidades; un lote no se ejecuta parcial ni se reordena | D3 | Cola | Dependencias por entidad/ids referenciados; el lote es una sola petición | — | web/src/api/cola.test.ts, web/src/store/datos.cola.test.ts |  |  | verificado en demo |  |
| IDP-10 | Coordinación entre pestañas: la cola no se procesa dos veces | D3 | Cola | Web Locks (líder) + BroadcastChannel; probado con coordinador simulado | — | web/src/store/datos.cola.test.ts |  |  | verificado en demo | Web Locks reales no probados en navegador con 2 pestañas |
| IDP-11 | Cambiar hoja/desconectar/actualizar PWA no descarta pendientes en silencio | D3 | Configuración/PWA | reiniciar() conserva la cola por hoja; aviso con N pendientes al desconectar | — | web/src/store/datos.cola.test.ts |  |  | verificado en demo |  |
| IDP-12 | Máximo 2 peticiones en paralelo, en serie por entidad | J4.1 | Cola | Máximo 2 en vuelo, en serie por entidad | — | web/src/api/cola.test.ts, web/src/store/datos.cola.test.ts |  |  | verificado en demo |  |
| IDP-13 | Persistencia de la cola en IndexedDB con aviso si no hay almacenamiento | J4.1 | Cola | almacenIndexedDb por hoja (dj-cola-<entorno>) | — | web/src/api/cola.test.ts |  |  | verificado en demo |  |
| IDP-14 | Lecturas tardías no pisan cambios confirmados ni pendientes | J4.1 | Store |  | — |  |  |  | pendiente |  |
| LOT-01 | Lote todo o nada observable: prevalida filas y referencias antes de mutar | D4 | Backend |  | movimientos.lote |  |  |  | pendiente |  |
| LOT-02 | Protocolo durable de preparación/confirmación/recuperación; sin estados parciales visibles | D4 | Backend | Code.gs: diario preparar→deshacer→confirmar + recuperarSiHaceFalta | _meta (op:*, opu:*), OP_EN_CURSO | web/tests-backend/durabilidad.test.mjs |  |  | verificado en demo | Atomicidad real de Google no verificada: ver docs/ESTADO-IMPLEMENTACION.md |
| LOT-03 | Fallos entre escrituras probados: estado visible y recuperación | D4 | Pruebas backend | Barrido de fallos (falloEn) y caídas (crashEn) en cada escritura | — | web/tests-backend/durabilidad.test.mjs |  |  | verificado en demo |  |
| LOT-04 | Revalidación final de versión/referencias dentro del lock | D4 | Backend |  | lock |  |  |  | pendiente |  |
| LOT-05 | version en todas las entidades mutables con conflicto; extensiones documentadas | D4 | Backend |  | todas |  |  |  | pendiente |  |
| LOT-06 | Sobrescribir conflicto exige decisión explícita sobre datos actuales | D4 | UI/Backend |  | CONFLICT |  |  |  | pendiente |  |
| LOT-07 | Caché, generación y auditoría coherentes con el commit lógico | D4 | Backend | La generación y la auditoría forman parte de la operación y se revierten con ella | auditoria, _meta | web/tests-backend/durabilidad.test.mjs |  |  | verificado en demo |  |
| FIN-01 | Motor único y puro en céntimos enteros con redondeo determinista; tasas con precisión decimal | D5/J6 | engine/ | web/src/engine/ | — | motor.test.ts, motor2.test.ts |  |  | verificado en demo |  |
| FIN-02 | monto_base y tipo de cambio congelados al registrar; editar recalcula de forma explícita y auditable | D5 | Formulario |  | movimiento.guardar |  |  |  | pendiente |  |
| FIN-03 | Cambiar una tasa de configuración no revaloriza movimientos antiguos | D5 | Configuración |  | config.guardar |  |  |  | pendiente |  |
| FIN-04 | Cambio de moneda base con histórico: procedimiento con respaldo y aprobación; selector explica el impacto | D5 | Configuración |  | config.guardar |  |  |  | pendiente |  |
| FIN-05 | Fuentes y cajas se aplican al mes explícitamente; la recurrencia solo sugiere | D5/J2.2 | Presupuesto | Las fuentes y cajas solo cuentan en los meses donde se aplican explícitamente | fuenteMes/cajaMes | servidor.test.ts, logica.test.ts |  |  | verificado en demo |  |
| FIN-06 | "Desde este mes" no cambia meses anteriores | D5/J7.7 | Presupuesto |  | fuenteMes.aplicar |  |  |  | pendiente |  |
| FIN-07 | Estado efectivo por mes: un cambio de catálogo no reescribe presupuestos históricos; política documentada | D5 | Presupuesto |  | fuentes_mes, cajas_mes |  |  |  | pendiente |  |
| FIN-08 | Fuentes en otras monedas se convierten de forma auditable al consolidar; se define dónde se congela | D5 | Presupuesto |  | fuentes_mes |  |  |  | pendiente |  |
| FIN-09 | Sin duplicar gasto entre cajas ni fuentes; desempate definido; importe sin cobertura visible | D5 | Motor |  | — |  |  |  | pendiente |  |
| FIN-10 | Atribuido + no cubierto = gasto, sin importar el orden de renderizado | D5 | Motor |  | — |  |  |  | pendiente |  |
| FIN-11 | Una fuente financia varios medios sin multiplicar; las libres se consumen en cascada | D5/J6 | Motor |  | — |  |  |  | pendiente |  |
| FIN-12 | Fórmulas de presupuesto/cajas de J con excesos y disponibles negativos; agregación multimes por mes | D5/J6 | Motor |  | — |  |  |  | pendiente |  |
| FIN-13 | Filtros parciales: base del presupuesto etiquetada, sin cifras proporcionales inventadas | D5 | Dashboard/Presupuesto |  | — |  |  |  | pendiente |  |
| FIN-14 | Comparaciones/proyecciones en el mismo tramo; "Nuevo"/"Sin base"; divisor cero "—" | D5 | Dashboard/Salud |  | — |  |  |  | pendiente |  |
| FIN-15 | Un gasto no cubre por completo varios compromisos; vínculo único o asignación parcial explícita | D5 | Compromisos |  | compromiso_pagos |  |  |  | pendiente |  |
| FIN-16 | Compromiso sin fecha "Sin fecha"; política visible para días 29/30/31; recalcula al desvincular/anular/restaurar | D5 | Compromisos |  | compromisos |  |  |  | pendiente |  |
| FIN-17 | Conciliación: disponible presupuestario y saldo real son conceptos distintos; diferencia = real − calculado | D5 | Conciliación |  | conciliaciones |  |  |  | pendiente |  |
| FIN-18 | Verificación con fecha de corte y ámbito/grupo efectivos; la hora solo documenta | D5 | Conciliación |  | conciliaciones |  |  |  | pendiente |  |
| FIN-19 | Sin doble conteo de fuentes en grupos; la foto detecta cambios posteriores; append-only | D5 | Conciliación |  | grupos_fondos |  |  |  | pendiente |  |
| FIN-20 | Disponible tras compromisos sin descontar dos veces reservas y compromisos; tooltips explican cada indicador | D5 | Salud |  | — |  |  |  | pendiente |  |
| FIN-21 | Dataset de referencia F3 (P=1000, cajas 200/300, gastos 250/100/100) reproducido en pruebas independientes | F3 | Pruebas motor |  | — |  |  |  | pendiente |  |
| FIN-22 | 500 escenarios aleatorios reproducibles del invariante disponible = saldo libre + reservas sin usar | F3/J6 | Pruebas motor | engine/presupuesto.ts | — | motor.test.ts (500 escenarios) |  |  | verificado en demo |  |
| FIN-23 | Anulados no cuentan; sin tipo de cambio el movimiento se excluye y se avisa | J6 | Motor | engine/movimientos.ts | — | motor.test.ts |  |  | verificado en demo |  |
| FIN-24 | Asignación a caja: subcategoría > categoría > ámbito > medio; empate por orden manual; avisos de solapamiento | J6 | Motor/Presupuesto | engine/presupuesto.ts | — | motor.test.ts |  |  | verificado en demo |  |
| FIN-25 | Serie diaria: acumulado, ideal, proyección solo en curso, días transcurridos con fecha viva | J6 | Dashboard | engine/serie.ts | — | motor2.test.ts |  |  | verificado en demo |  |
| FIN-26 | Calidad 0–100 (30/30/20/20) y duplicados por hash | J6 | Salud | engine/calidad.ts | — | motor2.test.ts |  |  | verificado en demo |  |
| FIN-27 | Evolución vs mismo tramo 1–2 meses atrás; "Nuevo"; ahorro potencial configurable | J6 | Salud | engine/evolucion.ts | — | motor2.test.ts |  |  | verificado en demo |  |
| FIN-28 | Reconciliación: la suma de cada gráfico = total; lista de movimientos usa la conversión del Dashboard | J6 | Todas |  | — |  |  |  | pendiente |  |
| FIN-29 | Descripción normalizada idéntica en frontend y Code.gs (idempotente, con excepciones) | J6 | Formulario |  | — |  |  |  | pendiente |  |
| CAT-01 | JSON canónico de catálogo; relaciones por ID; paridad frontend/backend probada | D6/J2.3 | Catálogo | shared/catalogo-inicial.json | — | paridad.test.mjs |  | frontend y Code.gs usan el mismo JSON | verificado en demo |  |
| CAT-02 | Herencia documentada cuando una categoría compartida no enumera subcategorías para un ámbito | D6 | Catálogo |  | ambito_subcategoria |  |  |  | pendiente |  |
| CAT-03 | "Otros" siempre al final en selectores, filtros y listas | D6 | Global |  | — |  |  |  | pendiente |  |
| CAT-04 | Desactivar un padre oculta hijos sin cambiar su estado ni las referencias históricas | D6 | Catálogo |  | — |  |  |  | pendiente |  |
| CAT-05 | Referencias inactivas identificadas y a corregir en editar/clonar/importar; sin sustituir por el primero | D6 | Formularios |  | — |  |  |  | pendiente |  |
| CAT-06 | Dependencias validadas en servidor (movimientos, plantillas, cajas, compromisos); nombres únicos normalizados | D6 | Backend |  | — |  |  |  | pendiente |  |
| IMP-01 | Importador: lee sin modificar, mapeo y simulación, detecta errores, respaldo previo, sin duplicados al reejecutar | D6/J2.5 | Configuración |  | importar.* |  |  |  | pendiente |  |
| IMP-02 | Se escribe después de la última fila real; primera fila de datos = 2 | D6/J3.3 | Backend |  | — |  |  |  | pendiente |  |
| IMP-03 | Vistas guardadas y preferencias con persistencia explícita (local/remota) y claves en lista blanca | D6 | Filtros/Configuración |  | config |  |  |  | pendiente |  |
| SEG-01 | Auth/autorización validadas en servidor por acción; token de atajo de alcance mínimo y revocable | E5/J3.1 | Backend |  | atajo.* |  |  |  | pendiente |  |
| SEG-02 | URL de Apps Script validada con URL: https, host permitido, sin credenciales/puertos/fragmentos | E5 | Configuración |  | — |  |  |  | pendiente |  |
| SEG-03 | Token solo en Propiedades del script; sin secretos en logs ni auditoría | E5 | Backend |  | — |  |  |  | pendiente |  |
| SEG-04 | Token local: minimizar exposición, CSP, sin HTML no confiable; desconectar borra solo su namespace | E5/J8 | Frontend |  | — |  |  |  | pendiente |  |
| SEG-05 | Payloads validados estrictamente en servidor (campos, tipos, longitudes, fechas, montos, moneda, IDs, URLs) | E5/J3.3 | Backend |  | todas |  |  |  | pendiente |  |
| SEG-06 | Neutraliza fórmulas al guardar y exportar CSV/XLSX (con espacios/controles previos); importes numéricos intactos; se prueba el archivo | E5/J3.3 | Backend/Export |  | exportar.csv |  |  |  | pendiente |  |
| SEG-07 | Sin XSS en descripciones, notas, nombres, tooltips, mensajes y URLs; enlaces externos seguros | E5 | Frontend |  | — |  |  |  | pendiente |  |
| SEG-08 | El backend no obtiene URLs arbitrarias del cliente; mantenimiento restringido al contexto autorizado | E5 | Backend |  | — |  |  |  | pendiente |  |
| SEG-09 | Rate limit sin bloqueo global fácil de provocar; limitaciones de Apps Script documentadas | E5/J8 | Backend |  | — |  |  |  | pendiente |  |
| SEG-10 | OAuth mínimo, dependencias, secretos en repo/historial y build revisados sin imprimir secretos | E5 | Repo |  | — |  |  |  | pendiente |  |
| SEG-11 | CSP y cabeceras verificadas en respuestas reales de Netlify | E5/J8 | Netlify |  | — |  |  |  | pendiente |  |
| SEG-12 | Service worker cachea shell/assets, no respuestas financieras; actualización con cola pendiente segura | E5 | PWA |  | — |  |  |  | pendiente |  |
| SEG-13 | Lista blanca de acciones y de claves de configuración | J8 | Backend |  | config.guardar |  |  |  | pendiente |  |
| UX-01 | Inventario de controles; cada uno con habilitación, acción, carga, éxito, error y recuperación | E1 | Todas |  | — |  |  |  | pendiente |  |
| UX-02 | Rutas con componentes funcionales propios; ruta desconocida = no encontrada con regreso | E1 | Router |  | — |  |  |  | pendiente |  |
| UX-03 | Nuevo/Editar/Clonar reutilizan el mismo formulario; clonar crea ID nuevo y conserva la fecha original | E2/J7.5 | Formulario | app/movimientos/FormMovimiento.tsx (un solo componente para Nuevo/Editar/Clonar) | movimiento.guardar | FormMovimiento.test.tsx (Editar conserva ID y versión; Clonar usa ID nuevo y conserva fecha) |  |  | verificado en demo |  |
| UX-04 | Descripción por subcategoría con confirmación si el usuario escribió; capitalización idempotente | E2/J7.5 | Formulario | FormMovimiento (autocompletar, Reemplazar/Conservar la mía); shared/descripcion.js idempotente | — | FormMovimiento.test.tsx, paridad.test.mjs |  |  | verificado en demo |  |
| UX-05 | Campos dependientes, estados inactivos y mensajes correctos al cambiar ámbito/categoría/alcance | E2 | Formularios | lib/catalogo.ts (categorías por ámbito, subcategorías efectivas, inactivas solo si ya eran la del movimiento) | — | FormMovimiento.test.tsx |  |  | en curso | Falta cubrir formularios de caja/plantilla/compromiso |
| UX-06 | Error por campo que se limpia al corregir; foco al primer error; teclado; Enter y Ctrl/Cmd+Enter | E2/J5.4 | Formularios | FormMovimiento: error por campo, foco al primero, Enter y Ctrl/Cmd+Enter | — | FormMovimiento.test.tsx |  |  | en curso | Falta limpiar el error al corregir bajo prueba y aplicar a los demás formularios |
| UX-07 | Cambios sin guardar protegidos al cerrar; borrador conservado si falla red o servidor | E2/J5.4 | Formularios | FormMovimiento: ConfirmDialog al cerrar con cambios (botón, Escape) | — | FormMovimiento.test.tsx, e2e/movimientos.spec.ts |  |  | en curso | Si el servidor rechaza tras cerrar, el borrador no se reabre: solo se muestra el error |
| UX-08 | Doble clic no crea duplicados; Guardar protege su operación sin bloquear la app | E2/J5.4 | Formularios | FormMovimiento: guardia síncrona + ID fijo por formulario; el servidor es idempotente | — | FormMovimiento.test.tsx, e2e/movimientos.spec.ts |  |  | verificado en demo |  |
| UX-09 | Selección múltiple persistente con contador visibles/ocultos y vista previa del impacto | E2/J7.5 | Movimientos | pages/Movimientos.tsx + BarraSeleccion.tsx: selección persistente entre páginas y filtros, impacto previo | movimientos.accionLote | Movimientos.test.tsx, e2e/movimientos.spec.ts |  |  | en curso | No muestra el contador «visibles/ocultos» por separado |
| UX-10 | Orden manual persistente y accesible; interacción con paginación y orden por columna definida | E2/J7.5 | Movimientos | components/DragList.tsx (puntero, teclado, botones Subir/Bajar) | movimientos.reordenar | DragList.test.tsx, Movimientos.test.tsx |  |  | en curso | El arrastre con puntero no está probado en navegador real |
| UX-11 | Toasts arriba a la derecha: éxito breve, errores persistentes con acciones, accesibles | E2/J5.3 | Global | components/Toaster.tsx | — | App.test.tsx |  |  | verificado en demo |  |
| UX-12 | Responsive 320/375/768/1024/1440/1920 sin recorte ni overflow oculto | E4/J5.2 | Todas |  | — | e2e/fundaciones.spec.ts, e2e/movimientos.spec.ts (6 anchos; Movimientos y su formulario) |  |  | en curso | Faltan Presupuesto, Catálogo, Salud, Planificación y Dashboard reales |
| UX-13 | Táctil ≥44 px, etiquetas, contraste, foco visible, scroll del modal, teclado virtual, safe area | E4/J5.2 | Todas |  | — |  |  |  | pendiente |  |
| UX-14 | Dialogs/drawer: foco inicial, contención, fondo inerte, Escape, devolución de foco; menús en portal | E4/J5.6 | Layout | Modal, ConfirmDialog, Flotante (portal con volteo), MenuAcciones | — | e2e/fundaciones.spec.ts (modal), e2e/movimientos.spec.ts (menú de fila dentro de pantalla), Combobox.test.tsx |  |  | en curso | Falta Drawer con fondo inerte y BottomSheet |
| UX-15 | Cada KPI/gráfico con explicación accesible; gráficos con tabla/resumen equivalente; vacíos sin datos ficticios | E4/J5.6 | Dashboard |  | — |  |  |  | pendiente |  |
| UX-16 | Acumulado a todo el ancho; Top 5 alternable; jerarquía contraída; sin gráfico "Últimos 6 meses"; Sankey incluido | E4/J7.4 | Dashboard |  | — |  |  |  | pendiente |  |
| UX-17 | Un aviso "sin datos" ofrece acción existente; conectado vacío no oculta el alta | E4/J5.5 | Todas |  | — |  |  |  | pendiente |  |
| UX-18 | Layout escritorio (barra lateral 76/240 recordada), tablet (drawer, 2 columnas), móvil (barra inferior, FAB, tarjetas, hojas inferiores) | J5.2 | Layout |  | — |  |  |  | pendiente |  |
| UX-19 | Tema Claro/Oscuro/Sistema con tokens semánticos | J5.1 | Global |  | config.tema |  |  |  | pendiente |  |
| UX-20 | Paleta de 64 colores sin rojo ni ámbar (fila de 10 + más + HEX libre) y catálogo de ~250 iconos en 13 familias con sinónimos | J5.1 | IconColorPicker |  | — |  |  |  | pendiente |  |
| UX-21 | Microinteracciones: check al guardar, montos que cuentan, arrastre con sombra; prefers-reduced-motion | J5.1 | Global |  | — |  |  |  | pendiente |  |
| UX-22 | Componentes: Radio, Combobox, MultiSelect, DatePicker, MonthPicker, RangePicker, MoneyInput, IconColorPicker, BottomSheet, MenuAcciones, Accordion, Pagination, DataTable, DragList, CommandPalette | J5.3 | components/ | Combobox, MultiSelect, MoneyInput, MenuAcciones, Pagination, DragList, ChipSelect, Campo, Flotante | — | Combobox.test.tsx, DragList.test.tsx, MoneyInput.test.ts |  |  | en curso | Faltan DatePicker/MonthPicker/RangePicker propios (se usa input nativo), IconColorPicker, BottomSheet, Accordion, DataTable genérica, CommandPalette |
| UX-23 | Catálogo de componentes /#/ui solo en desarrollo y demo | J5.3 | /ui | app/pages/UiCatalog.tsx | — | App.test.tsx, e2e |  |  | verificado en demo |  |
| UX-24 | Estados de pantalla: sin conexión, cargando (skeleton), vacío propio, error con reintentar, offline con banner | J5.5 | Todas |  | — |  |  |  | pendiente |  |
| UX-25 | WCAG 2.2 AA: roles ARIA, teclado completo, etiquetas, gráficos con tabla | J5.6 | Todas |  | — |  |  |  | pendiente |  |
| BKD-01 | Contrato: respuesta { ok, data, error{code,message,campo}, ms, version, generacion }; errores VALIDATION/NOT_FOUND/AUTH/BUSY/CONFLICT/SCHEMA/QUOTA/SERVER_ERROR | J3.1 | Backend | apps-script/Code.gs | todas | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-02 | Token en tiempo constante, bloqueo progresivo tras 5 fallos, token de atajo revocable | J3.1 | Backend | Code.gs autenticar() | AUTH | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-03 | Concurrencia optimista: CONFLICT con registro actual; UI Ver cambios/Sobrescribir/Descartar | J3.1 | Backend/UI | Code.gs (version/CONFLICT) | CONFLICT | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-04 | Normalización de salida: fechas texto, números number, booleanos reales | J3.1 | Backend | Code.gs normCelda | bootstrap | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-05 | bootstrap (comprimido, fresh) y cambios (delta) | J3.2 | Backend | accionBootstrap/accionCambios | bootstrap, cambios | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-06 | Acciones de movimientos: guardar, anular, restaurar, lote, estadoLote, reordenar (+accionLote) | J3.2 | Backend | acciones de movimiento | movimiento.* | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-07 | Acciones de catálogo: ambito/categoria/subcategoria/medio guardar\|reordenar\|eliminar | J3.2 | Backend | acciones de catálogo | catalogo | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-08 | Acciones de fuentes y cajas, fuenteMes/cajaMes aplicar\|omitir\|quitar, mes.copiarDeAnterior | J3.2 | Backend | acciones de fuentes/cajas | fuentes/cajas | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-09 | Plantillas y compromisos (guardar, eliminar, reordenar, aplicarMes, vincular, desvincular) | J3.2 | Backend | plantillas/compromisos | plantillas/compromisos | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-10 | revision.guardar, conciliacion.verificar\|seguimiento, grupoFondos.guardar, planificacion.guardar, config.guardar | J3.2 | Backend | revisión/conciliación/config | salud/config | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-11 | Mantenimiento: setup, diagnostico, repararHoja, respaldo.*, exportar.csv, importar.*, datosPrueba.*, atajo.token*, auditoria.consultar | J3.2 | Backend | mantenimiento | mantenimiento | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-12 | Atajo iPhone: atajo.catalogo y atajo.gasto | J3.2 | Backend | atajo.* | atajo.* | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-13 | openById, lectura por hoja una vez por petición, índice id→fila con TextFinder de respaldo | J3.3 | Backend | libro()/índices | — | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-14 | Escrituras agrupadas en setValues contiguos; lock solo en escritura (BUSY) | J3.3 | Backend | lock + setValues | — | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-15 | Caché de bootstrap por trozos <90 KB versionada por generación, TTL 10 min | J3.3 | Backend | caché por generación | _meta | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-16 | Validación estricta: fechas reales, monto >0 ≤1e9, 2 decimales, moneda, listas, longitudes, https, IDs, referencias activas | J3.3 | Backend | v* validadores | todas | backend.test.mjs |  | revisar contra E5 (fórmulas con espacios/controles, URLs) | en curso |  |
| BKD-17 | Cada escritura deja registro en auditoria; rotación >20 000 filas | J3.3 | Backend | auditoría y rotación | auditoria | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-18 | setup idempotente; se detiene si hay encabezados distintos; plantilla de formato (congelado, validación, bandas, protección) | J2.1 | Backend | setup() | setup | backend.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-19 | Esquema de 23 hojas y columnas exactas de J2.2 | J2.2 | Backend | ESQUEMAS_DEF | hojas | backend.test.mjs + esquemas.ts |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-20 | Datos iniciales (medios y catálogo) y claves de config de J2.4 | J2.3/2.4 | Backend | CONFIG_DEFECTO/catálogo | config | paridad.test.mjs |  | apps-script/test + web/tests-backend/backend.test.mjs (simulador de Apps Script) | verificado en demo |  |
| BKD-21 | Objetivos: bootstrap caliente <1,5 s, escrituras <2 s (medidos con condiciones) | J3.3/F4 | Backend |  | — |  |  |  | pendiente |  |
| FRT-01 | Stale-while-revalidate con snapshot en IndexedDB y sincronización en segundo plano | J4.1 | Store |  | cambios |  |  |  | pendiente |  |
| FRT-02 | Error de carga nunca se presenta como vacío; "Datos sin confirmar" con Reintentar | J4.1 | Store/UI |  | — |  |  |  | pendiente |  |
| FRT-03 | Ping de calentamiento sin bloquear | J4.1 | App | App.tsx (GET no-cors de calentamiento) | GET /exec |  |  |  | implementado sin verificar |  |
| FRT-04 | Aplicación inmediata, indicador por fila, contador de pendientes, beforeunload | J4.1 | Cola/UI |  | — |  |  |  | pendiente |  |
| FRT-05 | Ante error: revertir, toast con Reintentar (mismo ID) y Abrir formulario con lo escrito | J4.1 | Cola/UI |  | — |  |  |  | pendiente |  |
| FRT-06 | Backoff 1/3/7 s, timeout 20 s, HTTP 429/500/502/503/504 y HTML de Google; no reintentar VALIDATION/AUTH/CONFLICT/SCHEMA | J4.1 | Cliente | api/cliente.ts | — | demo-url.test.ts (esperaReintento) |  |  | en curso | falta clasificar HTML transitorio vs URL mala |
| FRT-07 | Hook useHoy(tz): medianoche en la zona configurada, visibilitychange y focus | J4.1 | Hook |  | — |  |  |  | pendiente |  |
| FRT-08 | Listas virtualizadas >200 filas, useDeferredValue en búsqueda, selectores memoizados, Recharts y módulos pesados lazy | J4.1 | Rendimiento |  | — |  |  |  | pendiente |  |
| FRT-09 | Cálculo pesado en Web Worker si supera 16 ms | J4.1 | Rendimiento |  | — |  |  |  | pendiente |  |
| FRT-10 | Demo solo con ?demo(=N&latencia&falla&vacio), transporte en memoria, determinista, no toca la conexión real | J4.2 | Demo | demo/parametros.ts, semilla.ts, conexion.ts | — | demo-url.test.ts, e2e/conexion.spec.ts |  |  | verificado en demo |  |
| FRT-11 | Onboarding de 3 pasos: plantilla, URL+token con Probar conexión (versión, latencia, hojas), moneda/zona/tema; enlace a demo | J7.1 | Onboarding |  | bootstrap |  |  |  | pendiente |  |
| FRT-12 | PWA instalable, ícono, splash, shell offline con cola de escrituras | J1 | PWA |  | — |  |  |  | pendiente |  |
| FRT-13 | Presupuesto de bundle ≤130 KB gzip en CI | J4.1/F4 | CI |  | — |  |  |  | pendiente |  |
| FRT-14 | Snapshot visible <1 s en 4G; bootstrap caliente <1,5 s; feedback <100 ms; filtros 10k <120 ms; motor 10k <30 ms | F4 | Rendimiento |  | — |  |  |  | pendiente |  |
| FRT-15 | Lighthouse móvil Perf ≥90, A11y ≥95, BP ≥95; PWA instalable aparte; axe sin serios/críticos | F4 | CI |  | — |  |  |  | pendiente |  |
| BAR-01 | Buscador ⌘K: movimientos, categorías, cajas y acciones ("nuevo gasto", "ir a cajas") | J7.2 | Paleta |  | — |  |  |  | pendiente |  |
| BAR-02 | Campana: Preparar ahora / Recordar mañana / Descartar el aviso del mes | J7.2 | Campana |  | config |  |  |  | pendiente |  |
| BAR-03 | Indicador Al día / N pendientes / Sin conexión y botón Actualizar incremental | J7.2 | Barra |  | cambios |  |  |  | pendiente |  |
| BAR-04 | "Mi hoja" abre la hoja real o lleva a conectar con etiqueta correcta | J5.2/AUD-11 | Barra |  | — |  |  |  | pendiente |  |
| FLT-01 | Período: Este mes, Mes anterior, 3/6/12 meses, Este año, Personalizado, con flechas ← → | J7.3 | Filtros |  | — |  |  |  | pendiente |  |
| FLT-02 | Multiselección dependiente con búsqueda: Ámbito→Categoría→Subcategoría + medio, tipo de gasto y recurrente | J7.3 | Filtros |  | — |  |  |  | pendiente |  |
| FLT-03 | Chips de filtros activos y Limpiar | J7.3 | Filtros |  | — |  |  |  | pendiente |  |
| FLT-04 | Vistas guardadas con nombre | J7.3 | Filtros |  | config |  |  |  | pendiente |  |
| FLT-05 | Filtros viven en la URL y se comparten entre Inicio, Movimientos, Presupuesto y Salud; consistentes tras recarga | J7.3 | Filtros |  | — |  |  |  | pendiente |  |
| DSH-01 | Saludo y botones + Nuevo gasto / Gastos del mes | J7.4 | Inicio |  | — |  |  |  | pendiente |  |
| DSH-02 | Resumen: P, gastado, disponible, reservado, libre inicial, fuera de cajas, saldo libre, % consumido con barra segmentada y leyenda | J7.4 | Inicio |  | — |  |  |  | pendiente |  |
| DSH-03 | 8 KPIs con ⓘ y variación vs mes anterior | J7.4 | Inicio |  | — |  |  |  | pendiente |  |
| DSH-04 | Gasto acumulado (real, ideal, proyección, presupuesto) y gasto diario con promedio | J7.4 | Inicio |  | — |  |  |  | pendiente |  |
| DSH-05 | Donut por ámbito (total al centro, leyenda filtra) y Top 5 Categorías/Subcategorías | J7.4 | Inicio |  | — |  |  |  | pendiente |  |
| DSH-06 | Mini tarjetas de cajas con progreso y estado | J7.4 | Inicio |  | — |  |  |  | pendiente |  |
| DSH-07 | Análisis: Jerarquía (contraída), Flujo de medios (Sankey SVG), Frecuencia vs monto (burbujas) | J7.4 | Inicio |  | — |  |  |  | pendiente |  |
| DSH-08 | Mes sin configurar: Preparar mi mes / Copiar del mes anterior | J7.4 | Inicio |  | — |  |  |  | pendiente |  |
| MOV-01 | Formulario: ámbito en chips con icono; categoría dependiente solo activas; subcategoría obligatoria si hay | J7.5 | Formulario | FormMovimiento + lib/catalogo.ts | movimiento.guardar | FormMovimiento.test.tsx |  |  | en curso | Los chips de ámbito aún no llevan icono |
| MOV-02 | Descripción: autocompleta con subcategoría, Reemplazar/Conservar, Otros/Por Clasificar vacía, normaliza al salir | J7.5 | Formulario | FormMovimiento (autocompletado y confirmación) | — | FormMovimiento.test.tsx |  |  | en curso | Falta el caso Otros/Por Clasificar vacío y normalizar al salir del campo (se normaliza al guardar) |
| MOV-03 | Monto grande, moneda permitida y equivalente en base en vivo | J7.5 | Formulario | MoneyInput + FormMovimiento (equivalente en base con el tipo de cambio vigente o el congelado al editar) | — | FormMovimiento.test.tsx, MoneyInput.test.ts |  |  | verificado en demo |  |
| MOV-04 | Fecha hoy viva; al clonar conserva la original | J7.5 | Formulario | FormMovimiento: fecha viva mientras no se toque (useHoy); Clonar conserva la original | — | FormMovimiento.test.tsx (clonar), fechaViva.test.tsx (hook) |  |  | implementado sin verificar | Falta prueba de que el formulario nuevo sigue a la medianoche |
| MOV-05 | Tipo de gasto, medio (botones con color, activos) y recurrente | J7.5 | Formulario | FormMovimiento: tipo (Segmented), medio (Combobox solo activos), recurrente | — | FormMovimiento.test.tsx |  |  | en curso | El medio no se muestra como botones con color |
| MOV-06 | Comprobante URL https opcional y notas | J7.5 | Formulario | FormMovimiento + lib/catalogo.ts urlComprobanteValida (misma regla que el servidor) | — | FormMovimiento.test.tsx |  |  | verificado en demo |  |
| MOV-07 | Sugerencia inteligente de clasificación según descripción | J7.5 | Formulario | FormMovimiento: sugiere medio y tipo del último movimiento de la misma subcategoría | — | ninguna dedicada |  |  | en curso | La especificación pide sugerir según la descripción escrita; no implementado |
| MOV-08 | Tabla: columnas, orden, paginación 10/25/50/100 con "Mostrando a–b de N", búsqueda por texto/monto/medio | J7.5 | Movimientos | pages/Movimientos.tsx (columnas, orden, paginación 10/25/50/100, búsqueda por texto, categoría y medio) | — | Movimientos.test.tsx, consulta.test.ts |  |  | en curso | La búsqueda no filtra por monto |
| MOV-09 | Vistas Activos/Anulados/Todos; Restaurar en anulados; totales con conversión y sin anulados | J7.5 | Movimientos | Movimientos.tsx + consulta.ts (totales en céntimos con monto_base, anulados no suman) | movimiento.anular\|restaurar | consulta.test.ts, Movimientos.test.tsx |  |  | verificado en demo |  |
| MOV-10 | Selección múltiple persistente: anular, restaurar, cambiar categoría/medio en lote, todo o nada | J7.5 | Movimientos | BarraSeleccion.tsx + reductor movimientos.accionLote + Code.gs accionMovimientosAccionLote (todo o nada) | movimientos.accionLote | Movimientos.test.tsx, optimista.test.ts, backend.test.mjs |  |  | verificado en demo |  |
| MOV-11 | Orden manual: arrastrar en escritorio, ↑↓ en móvil | J7.5 | Movimientos | DragList + movimientos.reordenar (hasta 1000 filtrados) | movimientos.reordenar | DragList.test.tsx, Movimientos.test.tsx |  |  | en curso | Arrastre con puntero sin probar en navegador real |
| MOV-12 | Exportar CSV/Excel del período filtrado y del historial completo | J7.5 | Movimientos | lib/exportar.ts (CSV y XLSX propios, fórmulas neutralizadas) | exportar.csv | exportar.test.ts |  | XLSX de muestra leído con openpyxl (hoja, textos, número y fórmula neutralizada) | verificado en demo | No abierto con Excel real |
| MOV-13 | Historial de cambios por movimiento (auditoría) | J7.5 | Movimientos | movimientos/Historial.tsx sobre auditoria.consultar | auditoria.consultar | Historial.test.tsx |  |  | verificado en demo |  |
| MOV-14 | Abrir un movimiento resaltado desde Salud/Compromisos con botón Volver | J7.5 | Movimientos | Movimientos.tsx: ?resaltar=<id>&volver=<ruta> | — |  |  |  | implementado sin verificar | Sin prueba; Salud y Compromisos aún no existen |
| MOV-15 | Tabla móvil como tarjetas de dos líneas con ⋯ como alternativa al deslizar | J5.2 | Movimientos | Movimientos.tsx: tarjetas bajo 768 px con menú ⋯ | — | Movimientos.test.tsx, e2e (móvil) |  |  | en curso | Sin gesto de deslizar |
| GM-01 | Plantilla de gasto: datos completos, "Es compromiso" con día; "Requiere revisión" si su clasificación quedó inactiva | J7.6/E3 | Gastos del mes | FormPlantillaGasto: compromiso con día, clonar, revisión si la clasificación quedó inactiva | plantilla.guardar | GastosMesModal.test.tsx, logica.test.ts, servidor.test.ts |  |  | verificado en demo |  |
| GM-02 | Modal ancho: fecha, búsqueda, filtro ámbito, casillas, Todas/Visibles/Limpiar | J7.6 | Gastos del mes | GastosMesModal: fecha, búsqueda, ámbito, Todas/Visibles/Limpiar, selección persistente | — | GastosMesModal.test.tsx, e2e/gastosmes.spec.ts |  |  | verificado en demo |  |
| GM-03 | Edición en línea temporal de monto/moneda/medio sin modificar la plantilla | J7.6/E3 | Gastos del mes | Edición temporal por fila; la plantilla no cambia | — | GastosMesModal.test.tsx, e2e/gastosmes.spec.ts |  |  | verificado en demo |  |
| GM-04 | Resumen fijo: cantidad, totales por moneda, detalle | J7.6 | Gastos del mes | Resumen fijo con totales por moneda | — | GastosMesModal.test.tsx, logica.test.ts |  |  | verificado en demo |  |
| GM-05 | Registrar N gastos: lote idempotente todo o nada con vínculo de compromisos | J7.6 | Gastos del mes | construirLote + movimientos.lote con lote_id fijo; vínculo de compromisos | movimientos.lote | servidor.test.ts, GastosMesModal.test.tsx |  |  | verificado en demo |  |
| GM-06 | Acciones Usar, Editar, Clonar (sin duplicados exactos), Eliminar (vuelve al modal), Reordenar | J7.6 | Gastos del mes | Menú por fila: Usar, Editar, Clonar, Eliminar, Subir/Bajar | plantilla.* | GastosMesModal.test.tsx |  |  | verificado en demo |  |
| GM-07 | Guardar plantilla no registra gastos; cada unidad tiene ID propio; accesible desde Inicio y Movimientos | E3 | Gastos del mes | Guardar plantilla no registra; id propio por unidad; botones en Inicio y Movimientos | — | GastosMesModal.test.tsx, e2e/gastosmes.spec.ts |  |  | verificado en demo |  |
| PRE-01 | Fuentes: lista/tarjetas recordada; formulario con nombre único, monto, moneda, recurrencia, medios, principal, activa | J7.7 | Presupuesto | app/pages/Presupuesto.tsx, presupuesto/FormFuente.tsx: nombre único, monto ≥ 0, moneda, recurrencia, medios, principal, activa | fuente.guardar | Presupuesto.test.tsx, e2e/presupuesto.spec.ts |  |  | en curso | La preferencia lista/tarjetas no se recuerda (solo hay tarjetas) |
| PRE-02 | Interruptor ON/OFF con vista previa de impacto (P y disponible antes/después) | J7.7 | Presupuesto | DialogoImpacto: presupuesto, reservado, disponible y saldo libre antes/después; no escribe hasta confirmar | fuente.guardar | logica.test.ts, Presupuesto.test.tsx, e2e/presupuesto.spec.ts |  |  | verificado en demo |  |
| PRE-03 | Ajustar importe del mes ("solo este mes"/"desde este mes") y quitar ajuste | J7.7 | Presupuesto | DialogoAjusteMes: solo este mes / desde este mes (fuentes) y Quitar del mes | fuenteMes.* | Presupuesto.test.tsx |  |  | verificado en demo | Que «desde este mes» no altere meses anteriores se cubre por el backend (backend tests), no por una prueba de interfaz propia |
| PRE-04 | Menú ⋯ de fuente: Clonar (inactiva), Guardar como plantilla, Subir/Bajar, Eliminar u ofrecer desactivar | J7.7 | Presupuesto | Menú de fuente: Editar, Clonar (inactiva), Guardar como plantilla, Subir/Bajar, Eliminar u ofrecer Desactivar | fuente.eliminar | Presupuesto.test.tsx |  |  | verificado en demo |  |
| PRE-05 | Cajas: búsqueda, filtro de alcance/estado, orden (manual/nombre/monto/%/más gastadas) | J7.7 | Presupuesto | filtrarCajas: texto sin tildes, alcance, estado, orden manual/nombre/monto/% uso/más gastadas | — | logica.test.ts, Presupuesto.test.tsx |  |  | verificado en demo |  |
| PRE-06 | Formulario de caja con alcance (ámbito/categoría/subcategoría "Cat › Sub"/medio), monto, descripción, activa, aspecto del alcance | J7.7 | Presupuesto | FormCaja: alcance con «Categoría › Sub», monto, descripción, activa, aviso de solapes | caja.guardar | Presupuesto.test.tsx, e2e/presupuesto.spec.ts |  |  | en curso | El icono y color no se heredan automáticamente del alcance: se eligen a mano (el servidor sí los sugiere si faltan) |
| PRE-07 | Tarjeta de caja: barra con Al día/Atención 70/Crítico 90/Excedida X %, disponible negativo en rojo, aviso de solapamientos | J7.7 | Presupuesto | TarjetaCaja: Al día / Atención / Crítico / Excedida X %, disponible negativo en rojo, aviso de solapes | — | logica.test.ts, Presupuesto.test.tsx |  |  | verificado en demo |  |
| PRE-08 | Ajustar monto del mes de la caja y quitar ajuste; menú ⋯ igual que fuentes | J7.7 | Presupuesto | Ajustar monto del mes y Quitar del mes en cajas; mismo menú que fuentes | cajaMes.* | Presupuesto.test.tsx |  |  | verificado en demo |  |
| PRE-09 | Plantillas mensuales de fuentes y cajas: crear, aplicar con vista previa Crear/Actualizar/Sin cambios/Omitir; reaplicar no duplica | J7.7 | Presupuesto | FormPlantilla + DialogoAplicarPlantillas con Crear / Actualizar / Sin cambios / Omitir; la vista previa del cliente coincide con la del servidor | plantilla.aplicarMes | logica.test.ts, servidor.test.ts, Presupuesto.test.tsx |  |  | verificado en demo |  |
| PRE-10 | Estados Pendiente/Aplicada/No aplica este mes idempotentes | J7.7/E3 | Presupuesto | Pendiente / Aplicada / No aplica este mes; reaplicar no duplica filas | fuenteMes/cajaMes | servidor.test.ts, logica.test.ts |  |  | verificado en demo |  |
| PRE-11 | Copiar configuración del mes anterior con vista previa editable, sin duplicar ni sobrescribir | J7.7 | Presupuesto | DialogoCopiar: montos editables y exclusiones; no duplica ni pisa; vista previa idéntica a la del servidor | mes.copiarDeAnterior | logica.test.ts, servidor.test.ts, Presupuesto.test.tsx, e2e/presupuesto.spec.ts |  |  | verificado en demo |  |
| CTL-01 | Contadores "X activas · Y en total", buscador con resaltado, menú + Agregar (ámbito, categoría, subcategoría, medio) | J7.8 | Catálogo | app/pages/Catalogo.tsx: contadores, buscador con resaltado sin tildes, menú Agregar | — | Catalogo.test.tsx, logica.test.ts |  |  | verificado en demo |  |
| CTL-02 | Ámbitos: pestañas-tarjeta con interruptor, editables y reordenables | J7.8 | Catálogo | Pestañas-tarjeta con interruptor y menú; reordenar con Subir/Bajar | ambito.* | Catalogo.test.tsx |  |  | verificado en demo | Reordenar ámbitos por arrastre con puntero no probado en navegador |
| CTL-03 | Categorías: tarjetas con interruptor, + subcategoría, menú ⋯ (Editar, Subir, Bajar, Eliminar), Otros al final | J7.8 | Catálogo | Tarjetas con interruptor por ámbito, menú Editar/Subir/Bajar/Eliminar, Otros fijo al final | categoria.* | Catalogo.test.tsx, logica.test.ts |  |  | verificado en demo |  |
| CTL-04 | Subcategorías: chips con icono, inactivas tachadas, editar y reordenar | J7.8 | Catálogo | Chips con inactivas tachadas; Ordenar subcategorías en DragList | subcategoria.* | Catalogo.test.tsx |  |  | verificado en demo | Los chips no muestran aún el icono |
| CTL-05 | Apariencia compartida de categoría entre ámbitos por ID global; renombrar no reescribe movimientos | J7.8 | Catálogo |  | — |  |  |  | pendiente |  |
| CTL-06 | Desactivar un nivel oculta hijos sin cambiar su estado | J7.8 | Catálogo |  | — |  |  |  | pendiente |  |
| CTL-07 | Eliminar revisa dependencias; en uso ofrece Desactivar; solo hijos pide confirmar cascada | J7.8 | Catálogo | Flujo eliminar → en_uso (Desactivar en su lugar) / tiene_hijos (cascada confirmada) | *.eliminar | Catalogo.test.tsx |  |  | verificado en demo |  |
| CTL-08 | Nombres únicos por nivel sin distinguir mayúsculas | J7.8 | Catálogo | nombreRepetido sin tildes ni mayúsculas, además del error del servidor en el campo | — | Catalogo.test.tsx, logica.test.ts |  |  | verificado en demo |  |
| CTL-09 | Medios de pago: crear con icono/color sugeridos, editar, activar/desactivar, reordenar | J7.8 | Catálogo | FormCatalogo para medios con IconColorPicker | medio.* | Catalogo.test.tsx |  |  | en curso | Sugerencia automática de icono/color por tipo pendiente |
| SAL-01 | Calidad de datos: anillo 0–100 con 4 dimensiones y pesos; Revisar datos (incompletos, inactivos con sugerencia, duplicados) | J7.9 | Salud |  | revision.guardar |  |  |  | pendiente |  |
| SAL-02 | Duplicados: Legítimo/Pendiente/Duplicado confirmado; confirmar ofrece anular uno | J7.9 | Salud |  | revision.guardar |  |  |  | pendiente |  |
| SAL-03 | Mi presupuesto: disponible tras compromisos, alertas 70/90/100, cajas en riesgo | J7.9 | Salud |  | — |  |  |  | pendiente |  |
| SAL-04 | Evolución: ranking de subidas/bajadas, Nuevo, tarjetas de ahorro potencial | J7.9 | Salud |  | — |  |  |  | pendiente |  |
| SAL-05 | Compromisos: previsto/pagado/pendiente, estados con detalle, asociar/quitar y Registrar pago precargado | J7.9/E3 | Salud |  | compromiso.* |  |  |  | pendiente |  |
| SAL-06 | Compromisos en lista compacta: vencidos/próximos primero, pagados contraídos | E3 | Salud |  | — |  |  |  | pendiente |  |
| SAL-07 | Conciliación: período, fecha de corte viva, hora; comparación con diferencia con signo y % | J7.9 | Salud |  | conciliacion.verificar |  |  |  | pendiente |  |
| SAL-08 | Grupos de fondos: una fuente solo en un grupo activo | J7.9 | Salud |  | grupoFondos.guardar |  |  |  | pendiente |  |
| SAL-09 | Estados Pendiente/En revisión/Conciliada/Cerrada con diferencia justificada/Desactualizada | J7.9 | Salud |  | — |  |  |  | pendiente |  |
| SAL-10 | Revisar diferencia: movimientos del período, registrar gasto olvidado con la fecha de corte, ir a Fuentes, documentar causa | J7.9 | Salud |  | conciliacion.seguimiento |  |  |  | pendiente |  |
| SAL-11 | Historial completo; nunca crea movimientos para cuadrar; corregir agrega fila que reemplaza a la anterior | J7.9 | Salud |  | conciliaciones |  |  |  | pendiente |  |
| SAL-12 | Cinco tarjetas-pestaña; Conciliación es la quinta | E3/J7.9 | Salud |  | — |  |  |  | pendiente |  |
| PLN-01 | Asistente Fuentes → Cajas → Gastos del mes → Resumen con estados Pendiente/En progreso/Completada/Omitida/Error | J7.10 | Prepara tu mes |  | planificacion.guardar |  |  |  | pendiente |  |
| PLN-02 | Etapa Completada solo tras confirmación del backend y relectura; todo en segundo plano sin cambiar de pantalla | J7.10 | Prepara tu mes |  | — |  |  |  | pendiente |  |
| PLN-03 | Resumen con conteos y totales reales; Finalizar solo guarda estado | J7.10 | Prepara tu mes |  | — |  |  |  | pendiente |  |
| PLN-04 | Recordatorios: activar, día por defecto, día y ON/OFF por mes y año con días reales y bisiestos | J7.10 | Prepara tu mes |  | config |  |  |  | pendiente |  |
| PLN-05 | Atajos: mismo día para todos, copiar del año anterior, restablecer; vista de próximas fechas | J7.10 | Prepara tu mes |  | config |  |  |  | pendiente |  |
| CFG-01 | Conexión: URL y token (ojo), Probar, Conectar/Desconectar, versión con aviso de incompatibilidad, última sync y latencia media | J7.11 | Configuración |  | — |  |  |  | pendiente |  |
| CFG-02 | Preferencias: moneda base, monedas y tipos de cambio, zona, formato de fecha, tema, auto-refresh, notificaciones, excepciones, umbrales, % ahorro | J7.11 | Configuración |  | config.guardar |  |  |  | pendiente |  |
| CFG-03 | Datos: crear respaldo y elegir carpeta | J7.11 | Configuración |  | respaldo.* |  |  |  | pendiente |  |
| CFG-04 | Datos: exportar CSV/Excel | J7.11 | Configuración |  | exportar.csv |  |  |  | pendiente |  |
| CFG-05 | Datos: importar desde otra hoja (simular/ejecutar) | J7.11 | Configuración |  | importar.* |  |  |  | pendiente |  |
| CFG-06 | Datos: datos de prueba generar/borrar; abrir mi hoja | J7.11 | Configuración |  | datosPrueba.* |  |  |  | pendiente |  |
| CFG-07 | Mantenimiento: diagnóstico, reparar hoja, auditoría, con consola de resultados (función, estado, duración, copiar) y confirmación en lo destructivo | J7.11 | Configuración |  | diagnostico, repararHoja |  |  |  | pendiente |  |
| CFG-08 | Atajo de iPhone: crear/revocar token con guía | J7.11 | Configuración |  | atajo.token* |  |  |  | pendiente |  |
| CFG-09 | Acerca de: versiones de frontend, backend y esquema | J7.11 | Configuración |  | — |  |  |  | pendiente |  |
| E2E-01 | Sin conexión → formulario → errores locales → conexión correcta de prueba → recarga | F2 | Playwright/integración |  | — | e2e/conexion.spec.ts (parcial; sin Sheet real) |  |  | en curso | integración real pendiente de entorno de pruebas |
| E2E-02 | Token incorrecto/URL inválida → recuperación; no guarda ni borra la anterior | F2 | Playwright/integración |  | — | App.test.tsx (validación y reversión) |  |  | en curso |  |
| E2E-03 | Demo desde botón y URL; salir; recargar; sin tocar conexión real | F2 | Playwright/integración |  | — | e2e/conexion.spec.ts (demo botón/URL) |  |  | en curso |  |
| E2E-04 | Crear gasto con clasificación completa (fila real de prueba) | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-05 | Editar y clonar gasto | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-06 | Anular/restaurar gasto vinculado | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-07 | Doble clic, reintento y solicitud repetida concurrente | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-08 | Guardado aplicado y respuesta perdida → pendiente de confirmar → reconciliado | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-09 | Sin red → escribir → recargar → reconectar | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-10 | Dos clientes editan la misma versión → CONFLICT y resolución | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-11 | Lote con fila inválida/fallo entre pasos sin estado parcial | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-12 | Selección múltiple con filtros/paginación | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-13 | Orden manual y recarga | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-14 | Crear/editar/desactivar/reactivar catálogo | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-15 | Eliminar entidad con dependencias | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-16 | Fuente mensual/única, medios ligados, ajustes | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-17 | Cajas solapadas, excedidas y sin coincidencia | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-18 | Crear/editar/clonar/usar plantilla de gasto | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-19 | Registrar parte de las plantillas como lote | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-20 | Aplicar/reaplicar/omitir fuentes y cajas del mes | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-21 | Copiar mes anterior con vista previa | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-22 | Filtros compartidos y vistas guardadas | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-23 | Dashboard, KPIs y todos los gráficos | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-24 | Calidad y revisión de duplicados | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-25 | Compromiso parcial/cubierto/sin monto/sin fecha | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-26 | Conciliación por grupo, seguimiento y corrección | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-27 | Prepara tu mes con fallos y reintentos | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-28 | Recordatorios y calendario de meses/años | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-29 | Exportación CSV y XLSX filtrada/completa | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-30 | Importación simulada y ejecutada dos veces | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-31 | Diagnóstico, respaldo, reparación y auditoría en staging | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-32 | Token de atajo: crear, usar y revocar | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-33 | Buscar/Ctrl+K, campana, Mi hoja, navegación profunda | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-34 | Temas, móvil, drawer, formularios y menús | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-35 | Medianoche, fin de mes, zona y volver a la pestaña | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-36 | PWA offline y nueva versión con cola pendiente | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-37 | Cambiar conexión/desconectar con pendientes | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| E2E-38 | Backend/esquema incompatible y respuesta inválida | F2 | Playwright/integración |  | — |  |  |  | pendiente |  |
| QA-01 | Pruebas unitarias del motor, fechas, normalización, validación y serialización | F1.1 | Vitest |  | — | motor.test.ts, motor2.test.ts, fechaViva.test.tsx |  |  | en curso |  |
| QA-02 | Pruebas de componentes con foco, errores, vacíos y dependencias | F1.2 | Vitest+RTL |  | — |  |  |  | pendiente |  |
| QA-03 | Backend real Code.gs en simulador | F1.3 | Vitest |  | — | web/tests-backend (84 pruebas) |  |  | verificado en demo |  |
| QA-04 | Cliente/store/cola: offline, persistencia, conflictos, reintentos, reconciliación, aislamiento | F1.4 | Vitest |  | — |  |  |  | pendiente |  |
| QA-05 | E2E contra demo en escritorio y móvil | F1.5 | Playwright |  | — | fundaciones.spec.ts, conexion.spec.ts (24 pruebas) |  |  | en curso |  |
| QA-06 | Integración contra deployment real de Apps Script y Sheet de pruebas con relectura independiente | F1.6 | Integración |  | todas |  |  |  | pendiente |  |
| QA-07 | Smoke no destructivo de la URL pública y verificación del artefacto | F1.7 | Smoke |  | — |  |  |  | pendiente |  |
| QA-08 | axe-core sin violaciones serias en cada pantalla | J9.6 | Playwright+axe |  | — |  |  |  | pendiente |  |
| QA-09 | Visual toHaveScreenshot por pantalla (claro/oscuro, escritorio/móvil) | J9.7 | Playwright |  | — |  |  |  | pendiente |  |
| QA-10 | Benchmarks del motor 1k/10k/50k, bundle y Lighthouse CI con condiciones publicadas | J9.8/F4 | CI |  | — |  |  |  | pendiente |  |
| QA-11 | CI: lint, tipos, unit, backend, e2e, bundle, audit, a11y, visual; sin skips ni debilitar tests | F5 | CI |  | — |  |  |  | pendiente |  |
| QA-12 | Fecha viva con fake timers 23:59→00:01 | J9.2 | Vitest |  | — |  |  |  | pendiente |  |
| DEP-01 | Todo el trabajo en develop; commits por incremento; sin commits directos a main | H | git |  | — |  |  |  | pendiente |  |
| DEP-02 | PR develop→main con problema, solución, módulos, esquema/API, pruebas, métricas, impacto, límites, despliegue y rollback | H | GitHub |  | — |  |  |  | pendiente |  |
| DEP-03 | Revisión propia minuciosa; sin aprobación ficticia ni evasión de protecciones | H | GitHub |  | — |  |  |  | pendiente |  |
| DEP-04 | Rollback frontend y backend documentado antes de publicar | H | docs/ROLLBACK.md |  | — |  |  |  | pendiente |  |
| DEP-05 | Apps Script desplegado por mecanismo autorizado (nueva versión de la implementación correcta) | H | Apps Script |  | — |  |  |  | pendiente |  |
| DEP-06 | Netlify sirve el build de main esperado; se verifica estado, URL, versión, rutas, consola y cabeceras | H | Netlify |  | — |  |  |  | pendiente |  |
| DOC-01 | README, ARQUITECTURA, MODELO-DATOS, API, REGLAS-FINANCIERAS, DISENO, SEGURIDAD, DESPLIEGUE, MIGRACIONES, ROLLBACK, ATAJO-IPHONE, QA-RESULTADOS, PRUEBAS-MANUALES | I | docs |  | — |  |  |  | pendiente |  |
| DOC-02 | Entrega final con URL, repo, PR, commit, versiones, tabla por módulo, AUD cerrados, conteos, métricas, esquema, pasos de conexión, pruebas manuales y acciones del usuario | I | Informe |  | — |  |  |  | pendiente |  |
