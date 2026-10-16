# API de Deejota Finanzas (Apps Script)

> Generado por `node scripts/docs/generar-api.mjs` desde `apps-script/Code.gs` (versión **1.0.0**, esquema **1**). No editar a mano: CI comprueba que coincide.
> Ningún ejemplo contiene secretos reales: los tokens y URLs son marcadores.

## 1. Transporte

- **POST** a la URL de la aplicación web (`https://script.google.com/macros/s/<id>/exec`), cuerpo JSON como `text/plain;charset=utf-8` (evita el preflight de CORS). Se siguen las redirecciones de Google.
- El token viaja **en el cuerpo**, nunca en la URL. No se usa `no-cors` para lecturas ni escrituras de negocio; el único `GET` es un ping opaco de calentamiento que no autentica.
- **GET** público: devuelve solo `{ "ok": true, "ping": true, "version": "1.0.0" }`.
- Tamaño máximo del cuerpo: 1 000 000 de caracteres → `VALIDATION`.
- La app valida la URL antes de enviar el token: https, host `script.google.com`, ruta `/macros/s/<id>/exec` (o `/a/macros/<dominio>/s/<id>/exec`), sin usuario/contraseña, puerto, parámetros ni `#`.

## 2. Petición

```json
{ "action": "movimiento.guardar", "payload": { "...": "..." }, "token": "<token>", "requestId": "r0123456789abcdef0123456789abcd" }
```

- `requestId` es **obligatorio en toda escritura** (`^[A-Za-z0-9_-]{8,64}$`) y se genera **una sola vez por operación lógica**; los reintentos usan el mismo.
- Los ids de entidades (`id`, `lote_id`) los genera el cliente (UUID con prefijo) para que reintentar no duplique.
- Hay dos tokens: el **maestro** (todas las acciones) y el del **atajo** (solo `atajo.*`). Cinco fallos seguidos bloquean temporalmente con espera creciente. Límite: 300 peticiones por minuto → `QUOTA`.

## 3. Respuesta

Éxito:
```json
{ "ok": true, "data": { }, "ms": 120, "version": "1.0.0", "generacion": "<uuid>", "repetido": true }
```
`repetido: true` indica que el servidor devolvió el resultado original de una petición ya aplicada (nada se volvió a escribir).

Error:
```json
{ "ok": false, "error": { "code": "CONFLICT", "message": "…", "campo": "version", "detalle": { } }, "ms": 8, "version": "1.0.0" }
```

| Código | Significado | ¿Reintentar igual? |
|---|---|---|
| `AUTH` | Token inválido o bloqueo temporal | No (se espera a corregir la conexión; lo escrito se conserva) |
| `VALIDATION` | Datos inválidos (`campo` indica cuál) | No |
| `NOT_FOUND` | La entidad ya no existe | No |
| `CONFLICT` | Versión desactualizada **o** `requestId` reutilizado con otros datos (`campo: "requestId"`) | No: releer y decidir |
| `SCHEMA` | Hoja, encabezados o versión incompatibles | No |
| `BUSY` | El bloqueo de escritura no se obtuvo en 10 s; **no se ejecutó nada** | Sí |
| `QUOTA` | Límite de Google o de peticiones por minuto | Sí, con espera |
| `SERVER_ERROR` | Error interno (el detalle queda solo en los registros) | Sí |
| `RED`, `TIEMPO` | (cliente) sin conexión o sin respuesta: el resultado es **desconocido** | Sí, con el mismo `requestId` |

## 4. Idempotencia y operaciones todo-o-nada

1. Antes de ejecutar, el servidor calcula una **huella** estable de `acción + payload` (independiente del orden de las claves).
2. Si el `requestId` ya se aplicó: con la **misma huella** devuelve la respuesta original (`repetido: true`) sin escribir; con **otra huella** responde `CONFLICT` (`campo: "requestId"`).
3. El registro de operaciones aplicadas es **durable**: vive en la hoja interna `_meta` (`op:<requestId>`), no solo en la caché de 500 entradas. Se conservan las últimas 2000 (se recorta al superar 3000).
4. Cada escritura toma el bloqueo del script y recorre **preparar → aplicar → confirmar**:
   - *preparar*: se crea `op:<requestId>` (estado `en_curso`) y se marca `OP_EN_CURSO` en las propiedades del script;
   - *aplicar*: antes de cada escritura a una hoja se guarda cómo deshacerla (`opu:<n>`, imagen previa de las filas);
   - *confirmar*: una sola celda deja la operación en `ok` junto con la respuesta (punto de commit). Después se limpia el deshacer y se recortan huellas y auditoría.
5. Si algo falla antes de confirmar, la operación se **revierte** (en orden inverso) y el cliente recibe el error: lo que ve el cliente nunca es un estado a medias.
6. Si la ejecución muere (por ejemplo, tiempo agotado), `OP_EN_CURSO` queda marcado y **la siguiente petición —lectura o escritura— la deshace** antes de continuar (la recuperación es reanudable). Si la caída fue posterior al commit, solo se limpia.
7. La auditoría y la generación de caché forman parte de la operación: se revierten con ella.

**Respuesta perdida**: el cliente deja la escritura como *por confirmar* y la reenvía con el mismo `requestId`; recibe la respuesta original. Nunca se duplica.

## 5. Versionado

- `bootstrap` devuelve `version_backend` y `esquema`. La app exige `version_backend ≥ 1.0.0` y `esquema = 1` **antes** de guardar la conexión o enviar escrituras; si no, muestra un mensaje accionable y deja lo pendiente en la cola.
- Las entidades mutables llevan `version` (entero) y `actualizado_en`. Editar exige enviar la versión leída; si cambió, `CONFLICT` con `detalle.actual` (la fila vigente).

## 6. Lotes

- `movimientos.lote`: máximo 200 filas; se prevalidan **todas** (campos y referencias) antes de escribir; se deduplican por `lote_id`; se aplican como una sola operación (todo o nada).
- `movimientos.accionLote`: acción masiva sobre ids existentes, también todo o nada.
- `movimientos.estadoLote`: consulta de solo lectura de un `lote_id`.

## 7. Acciones

Los campos listados son los que el servidor lee del `payload` (los obligatorios y sus formatos los valida el servidor y se describen en `docs/MODELO-DATOS.md`).

| Acción | Tipo | Campos del payload |
|---|---|---|
| `bootstrap` | lectura | `fresh` |
| `cambios` | lectura | `generacion`, `desde` |
| `diagnostico` | lectura | — |
| `exportar.csv` | lectura | `alcance`, `desde`, `hasta`, `incluir_anulados` |
| `auditoria.consultar` | lectura | `limite`, `entidad`, `entidad_id` |
| `importar.simular` | lectura | — |
| `atajo.catalogo` | lectura | — |
| `movimiento.guardar` | escritura | `id`, `origen`, `compromiso_id`, `version` |
| `movimiento.anular` | escritura | `lote_id`, `items` |
| `movimiento.restaurar` | escritura | `lote_id`, `items` |
| `movimientos.lote` | escritura | `lote_id`, `items` |
| `movimientos.estadoLote` | lectura | `lote_id` |
| `movimientos.accionLote` | escritura | `accion`, `ids`, `medio_pago_id`, `ambito_id`, `categoria_id`, `subcategoria_id` |
| `movimientos.reordenar` | escritura | `items` |
| `ambito.guardar` | escritura | `id`, `nombre`, `icono`, `color`, `activo`, `version` |
| `ambito.reordenar` | escritura | `ids` |
| `categoria.guardar` | escritura | `id`, `nombre`, `icono`, `color`, `quitar_ambito_ids`, `vinculos`, `version` |
| `categoria.reordenar` | escritura | `ambito_id`, `ids` |
| `categoria.eliminar` | escritura | `id`, `cascada` |
| `subcategoria.guardar` | escritura | `id`, `categoria_id`, `nombre`, `icono`, `activo`, `version`, `ambitos` |
| `subcategoria.reordenar` | escritura | `categoria_id`, `ids` |
| `subcategoria.eliminar` | escritura | `id` |
| `medio.guardar` | escritura | `id`, `nombre`, `tipo`, `icono`, `color`, `activo`, `version` |
| `medio.reordenar` | escritura | `ids` |
| `medio.eliminar` | escritura | `id` |
| `fuente.guardar` | escritura | `id`, `nombre`, `monto_defecto`, `moneda`, `recurrencia`, `mes_inicio`, `mes_fin`, `activo`, `es_principal`, `medios`, `aplicar_mes`, `icono`, `color`, `monto_mes`, `version` |
| `fuente.eliminar` | escritura | `id` |
| `fuente.reordenar` | escritura | `ids` |
| `fuenteMes.aplicar` | escritura | `fuente_id`, `mes`, `monto`, `desde_este_mes` |
| `fuenteMes.omitir` | escritura | `fuente_id`, `mes` |
| `fuenteMes.quitar` | escritura | `fuente_id`, `mes` |
| `caja.guardar` | escritura | `id`, `nombre`, `alcance`, `alcance_id`, `monto_defecto`, `activo`, `aplicar_mes`, `icono`, `color`, `descripcion`, `monto_mes`, `version` |
| `caja.eliminar` | escritura | `id` |
| `caja.reordenar` | escritura | `ids` |
| `cajaMes.aplicar` | escritura | `caja_id`, `mes`, `monto` |
| `cajaMes.omitir` | escritura | `caja_id`, `mes` |
| `cajaMes.quitar` | escritura | `caja_id`, `mes` |
| `mes.copiarDeAnterior` | escritura | `mes`, `previsualizar`, `excluir`, `montos` |
| `plantilla.guardar` | escritura | `id`, `tipo`, `nombre`, `activo`, `datos`, `version` |
| `plantilla.eliminar` | escritura | `id` |
| `plantilla.reordenar` | escritura | `tipo`, `ids` |
| `plantilla.aplicarMes` | escritura | `tipo`, `mes`, `plantilla_ids`, `omitir_ids`, `previsualizar`, `montos` |
| `compromiso.guardar` | escritura | `id`, `nombre`, `plantilla_id`, `monto_previsto`, `moneda`, `dia_vencimiento`, `activo`, `version` |
| `compromiso.eliminar` | escritura | `id` |
| `compromiso.vincular` | escritura | `compromiso_id`, `movimiento_id`, `mes` |
| `compromiso.desvincular` | escritura | `compromiso_id`, `movimiento_id` |
| `revision.guardar` | escritura | `tipo_alerta`, `firma`, `estado`, `movimiento_ids` |
| `conciliacion.verificar` | escritura | `grupo_id`, `periodo`, `fecha_corte`, `hora`, `saldo_calculado`, `saldo_real`, `reemplaza_a`, `id`, `conciliacion_id`, `causa`, `observacion` |
| `conciliacion.seguimiento` | escritura | `conciliacion_id`, `estado`, `causa`, `id`, `observacion` |
| `grupoFondos.guardar` | escritura | `id`, `nombre`, `fuente_ids`, `activo`, `version` |
| `planificacion.guardar` | escritura | `mes`, `etapa`, `estado` |
| `config.guardar` | escritura | `items`, `clave`, `valor` |
| `setup` | escritura | — |
| `repararHoja` | escritura | `hoja` |
| `respaldo.crear` | escritura | — |
| `respaldo.carpeta` | escritura | `carpeta_id` |
| `importar.ejecutar` | escritura | — |
| `datosPrueba.generar` | escritura | `cantidad` |
| `datosPrueba.borrar` | escritura | — |
| `atajo.tokenCrear` | escritura | — |
| `atajo.tokenRevocar` | escritura | — |
| `atajo.gasto` | escritura | `id`, `ambito_id`, `ambito`, `categoria_id`, `categoria`, `subcategoria_id`, `subcategoria`, `medio_pago_id`, `medio`, `fecha`, `monto`, `moneda`, `descripcion`, `tipo_gasto`, `es_recurrente`, `notas` |

Total: 62 acciones en 29 grupos.

## 8. Ejemplos (sin secretos)

Alta de un gasto:
```json
{
  "action": "movimiento.guardar",
  "requestId": "r7c1e2d3a4b5f60718293a4b5c6d7e8",
  "token": "<token>",
  "payload": { "id": "mov-1f0c…", "fecha": "2026-10-15", "monto": 25.5, "moneda": "PEN", "ambito_id": "<id>", "categoria_id": "<id>", "subcategoria_id": "<id>", "medio_pago_id": "<id>", "descripcion": "menú del día" }
}
```
Reenvío con otros datos y el mismo `requestId` → `{ "ok": false, "error": { "code": "CONFLICT", "campo": "requestId", … } }`.

Lectura incremental:
```json
{ "action": "cambios", "payload": { "generacion": "<última>", "desde": "2026-10-15T20:00:00.000Z" }, "token": "<token>" }
```
