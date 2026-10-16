/**
 * Deejota Finanzas — Backend (Google Apps Script, V8)
 * API JSON sobre una hoja de Google Sheets.
 *
 * Instalación: pega este archivo en el editor de Apps Script del libro (Extensiones → Apps Script),
 * ejecuta setup() una vez, y publica como Aplicación web (ejecutar como "yo", acceso "cualquiera").
 *
 * Secciones: 0 Constantes · 1 Compartido (generado) · 2 Utilidades · 3 Esquema y acceso a hojas
 *            4 Auditoría y caché · 5 Seguridad · 6 Validación · 7 Instalación · 8 Lectura
 *            9 Movimientos · 10 Catálogo · 11 Presupuesto · 12 Plantillas y compromisos
 *            13 Calidad y conciliación · 14 Planificación y configuración · 15 Mantenimiento
 *            16 Atajo iPhone · 17 Importador · 18 Despacho (doGet/doPost)
 *
 * NO editar a mano los bloques GENERADO: se regeneran con `node scripts/sync-shared.mjs`.
 */

/* ============================== 0. CONSTANTES ============================== */
var VERSION = '1.0.0';
var SCHEMA_VERSION = 1;
var COLOR_MARCA = '#1E3A8A';
var MAX_AUDITORIA = 20000;
var MANTENER_AUDITORIA = 2000;
var TTL_BOOTSTRAP = 600;
var TTL_IDEMPOTENCIA = 21600;
var MAX_IDEMPOTENCIA = 500;
var MAX_OPERACIONES = 3000;       // filas op:* en _meta antes de recortar
var MANTENER_OPERACIONES = 2000;  // huellas durables que se conservan
var TROZO_DIARIO = 40000;         // celda de Sheets: 50 000 caracteres como máximo
var TROZO_CACHE = 90000;
var LIMITE_PETICIONES_MIN = 300;
var MAX_LOTE = 200;

var ENUMS = {
  tipo_gasto: ['fijo', 'variable', 'extraordinario'],
  estado_mov: ['activo', 'anulado'],
  origen: ['web', 'lote', 'atajo', 'importacion', 'prueba'],
  medio_tipo: ['billetera', 'tarjeta', 'vale', 'efectivo', 'transferencia', 'otro'],
  recurrencia: ['mensual', 'unica'],
  estado_mes: ['aplicada', 'omitida'],
  alcance: ['ambito', 'categoria', 'subcategoria', 'medio_pago'],
  plantilla_tipo: ['gasto', 'fuente', 'caja'],
  revision_estado: ['legitimo', 'pendiente', 'duplicado'],
  conciliacion_tipo: ['verificacion', 'seguimiento'],
  conciliacion_estado: ['pendiente', 'en_revision', 'conciliada', 'cerrada_justificada', 'desactualizada'],
  plan_etapa: ['fuentes', 'cajas', 'gastos', 'resumen'],
  plan_estado: ['pendiente', 'en_progreso', 'completada', 'omitida', 'error']
};

/* Definición compacta de hojas: columna[:tipo]  (s texto · n número · i entero · b booleano · d fecha · m mes · j JSON) */
var ESQUEMAS_DEF = {
  movimientos: 'id,fecha:d,monto:n,moneda,tipo_cambio:n,monto_base:n,ambito_id,categoria_id,subcategoria_id,descripcion,medio_pago_id,tipo_gasto,es_recurrente:b,estado,origen,plantilla_id,lote_id,comprobante_url,notas,creado_en,actualizado_en,version:i',
  ambitos: 'id,nombre,icono,color,orden:i,activo:b,creado_en,actualizado_en,version:i',
  categorias: 'id,nombre,icono,color,creado_en,actualizado_en,version:i',
  ambito_categoria: 'id,ambito_id,categoria_id,orden:i,activo:b',
  subcategorias: 'id,categoria_id,nombre,icono,orden:i,activo:b,creado_en,actualizado_en,version:i',
  ambito_subcategoria: 'id,ambito_id,subcategoria_id,activo:b',
  medios_pago: 'id,nombre,tipo,icono,color,orden:i,activo:b,creado_en,actualizado_en,version:i',
  fuentes: 'id,nombre,monto_defecto:n,moneda,recurrencia,mes_inicio:m,mes_fin:m,icono,color,orden:i,activo:b,es_principal:b,creado_en,actualizado_en,version:i',
  fuente_medios: 'id,fuente_id,medio_pago_id,orden:i',
  fuentes_mes: 'id,fuente_id,mes:m,monto:n,estado,actualizado_en',
  cajas: 'id,nombre,alcance,alcance_id,monto_defecto:n,icono,color,descripcion,orden:i,activo:b,creado_en,actualizado_en,version:i',
  cajas_mes: 'id,caja_id,mes:m,monto:n,estado,actualizado_en',
  plantillas: 'id,tipo,nombre,datos_json:j,orden:i,activo:b,creado_en,actualizado_en,version:i',
  compromisos: 'id,plantilla_id,nombre,monto_previsto:n,moneda,dia_vencimiento:i,activo:b,creado_en,actualizado_en,version:i',
  compromiso_pagos: 'id,compromiso_id,movimiento_id,mes:m,creado_en',
  revisiones_calidad: 'id,tipo_alerta,firma,movimiento_ids:j,estado,creado_en,actualizado_en',
  grupos_fondos: 'id,nombre,fuente_ids_json:j,activo:b,creado_en,actualizado_en,version:i',
  conciliaciones: 'id,tipo,conciliacion_id,periodo,fecha_corte:d,hora,grupo_id,saldo_calculado:n,saldo_real:n,diferencia:n,estado,causa,observacion,reemplaza_a,creado_en',
  planificacion: 'id,mes:m,etapa,estado,actualizado_en',
  orden_movimientos: 'movimiento_id,orden:i',
  config: 'clave,valor,actualizado_en',
  auditoria: 'id,fecha_hora,accion,entidad,entidad_id,antes_json:j,despues_json:j,origen',
  _meta: 'clave,valor'
};

/* Cómo se envía cada hoja en `cambios` (delta): por columna de fecha o completa si es pequeña/sin fecha */
var DELTA = {
  movimientos: 'actualizado_en', ambitos: 'actualizado_en', categorias: 'actualizado_en', ambito_categoria: 'todo',
  subcategorias: 'actualizado_en', ambito_subcategoria: 'todo', medios_pago: 'actualizado_en', fuentes: 'actualizado_en',
  fuente_medios: 'todo', fuentes_mes: 'actualizado_en', cajas: 'actualizado_en', cajas_mes: 'actualizado_en',
  plantillas: 'actualizado_en', compromisos: 'actualizado_en', compromiso_pagos: 'creado_en',
  revisiones_calidad: 'actualizado_en', grupos_fondos: 'actualizado_en', conciliaciones: 'creado_en',
  planificacion: 'actualizado_en', orden_movimientos: 'todo', config: 'actualizado_en'
};

/* Hojas que viajan en bootstrap (auditoría y _meta no) */
var HOJAS_BOOTSTRAP = Object.keys(DELTA);

/* Hojas internas (protegidas con advertencia) */
var HOJAS_INTERNAS = ['auditoria', '_meta', 'orden_movimientos', 'conciliaciones', 'config'];

var CONFIG_DEFECTO = {
  moneda_base: 'PEN',
  monedas_permitidas: 'PEN',
  zona_horaria: 'America/Lima',
  formato_fecha: 'DD/MM/YYYY',
  tema: 'sistema',
  auto_refresh_seg: '0',
  notificaciones_guardado: 'TRUE',
  desc_excepciones: '',
  plan_activo: 'TRUE',
  plan_dia_defecto: '25',
  carpeta_respaldo_id: '',
  umbral_alertas: '70,90,100',
  ahorro_simulado_pct: '15'
};

/* ============================ 1. COMPARTIDO (GENERADO) ============================ */
// <<GENERADO:descripcion>>
/**
 * Normalización de descripciones — ÚNICA fuente de verdad.
 * Se importa en el frontend y se inyecta tal cual en apps-script/Code.gs
 * (scripts/sync-shared.mjs). No usar sintaxis que Apps Script (V8) no soporte.
 *
 * Reglas:
 *  - Mayúscula inicial en cada palabra; conectores en minúscula (salvo la primera).
 *  - Las excepciones (ChatGPT, iPhone, YouTube, USD, API…) conservan su escritura exacta,
 *    sin distinguir mayúsculas al detectarlas.
 *  - Idempotente: normalizar(normalizar(x)) === normalizar(x).
 *  - No reescribe registros antiguos: solo se aplica al guardar.
 */
var EXCEPCIONES_DESCRIPCION_DEFECTO = ['ChatGPT', 'iPhone', 'YouTube', 'USD', 'PEN', 'API', 'SOAT', 'HBO', 'WiFi']

var CONECTORES_DESCRIPCION = ['a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'sin', 'u', 'un', 'una', 'y']

function normalizarDescripcion(texto, excepciones) {
  var base = String(texto == null ? '' : texto)
    .replace(/\s+/g, ' ')
    .trim()
  if (!base) return ''
  var lista = excepciones && excepciones.length ? excepciones : EXCEPCIONES_DESCRIPCION_DEFECTO
  var mapaExc = {}
  for (var i = 0; i < lista.length; i++) {
    var ex = String(lista[i]).trim()
    if (ex) mapaExc[ex.toLowerCase()] = ex
  }
  var palabras = base.split(' ')
  for (var j = 0; j < palabras.length; j++) {
    var p = palabras[j]
    // separa puntuación final/inicial para detectar excepciones ("ChatGPT," → "chatgpt")
    var m = /^([^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]*)(.*?)([^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]*)$/.exec(p)
    var pre = m ? m[1] : ''
    var nucleo = m ? m[2] : p
    var post = m ? m[3] : ''
    var nucleoMin = nucleo.toLowerCase()
    var nuevo
    if (mapaExc[nucleoMin]) {
      nuevo = mapaExc[nucleoMin]
    } else if (j > 0 && CONECTORES_DESCRIPCION.indexOf(nucleoMin) !== -1) {
      nuevo = nucleoMin
    } else if (nucleo.length === 0) {
      nuevo = nucleo
    } else {
      nuevo = nucleoMin.charAt(0).toUpperCase() + nucleoMin.slice(1)
    }
    palabras[j] = pre + nuevo + post
  }
  return palabras.join(' ')
}
// <</GENERADO:descripcion>>

// <<GENERADO:catalogo>>
var CATALOGO_INICIAL = {
  "version": 1,
  "medios": [
    {
      "nombre": "Yape",
      "tipo": "billetera",
      "icono": "smartphone",
      "color": "#451E67"
    },
    {
      "nombre": "Plin",
      "tipo": "billetera",
      "icono": "smartphone",
      "color": "#254BE4"
    },
    {
      "nombre": "Sodexo",
      "tipo": "vale",
      "icono": "ticket",
      "color": "#25E4D4"
    },
    {
      "nombre": "Transferencia",
      "tipo": "transferencia",
      "icono": "landmark",
      "color": "#2585E4"
    },
    {
      "nombre": "Efectivo",
      "tipo": "efectivo",
      "icono": "banknote",
      "color": "#B4E425"
    },
    {
      "nombre": "Otros",
      "tipo": "otro",
      "icono": "ellipsis",
      "color": "#64748B"
    }
  ],
  "categorias": {
    "Alimentación": {
      "icono": "utensils",
      "color": "#B4E425"
    },
    "Auto": {
      "icono": "car",
      "color": "#254BE4"
    },
    "Transporte": {
      "icono": "bus",
      "color": "#2585E4"
    },
    "Servicios": {
      "icono": "plug",
      "color": "#25BEE4"
    },
    "Suscripciones": {
      "icono": "repeat",
      "color": "#8B25E4"
    },
    "Compras": {
      "icono": "shopping-bag",
      "color": "#D425E4"
    },
    "Salud": {
      "icono": "heart-pulse",
      "color": "#25E445"
    },
    "Cuidado Personal": {
      "icono": "scissors",
      "color": "#E425AB"
    },
    "Educación": {
      "icono": "graduation-cap",
      "color": "#4525E4"
    },
    "Herramientas y Equipamiento": {
      "icono": "wrench",
      "color": "#25E4D4"
    },
    "Plan Nube": {
      "icono": "cloud",
      "color": "#206BB6"
    },
    "Regalos": {
      "icono": "gift",
      "color": "#671E51"
    },
    "Salidas": {
      "icono": "party-popper",
      "color": "#611E67"
    },
    "Bebé": {
      "icono": "baby",
      "color": "#25E49E"
    },
    "Hogar": {
      "icono": "house",
      "color": "#65E425"
    },
    "Apoyo Familiar": {
      "icono": "hand-heart",
      "color": "#451E67"
    },
    "Salud Familiar": {
      "icono": "stethoscope",
      "color": "#20B639"
    },
    "Otros": {
      "icono": "ellipsis",
      "color": "#64748B"
    }
  },
  "subcategorias_icono": {
    "Desayuno": "coffee",
    "Almuerzo": "utensils",
    "Cena": "soup",
    "Delivery": "bike",
    "Snack / Antojos": "cookie",
    "Bebidas": "cup-soda",
    "Gasolina": "fuel",
    "Gas": "flame",
    "Car Wash": "droplets",
    "Estacionamiento": "circle-parking",
    "Mantenimiento": "wrench",
    "Repuestos": "cog",
    "Seguro Vehicular": "shield-check",
    "SOAT": "file-check",
    "Revisión Técnica": "clipboard-check",
    "Multas": "receipt-text",
    "Taxi": "car-taxi-front",
    "Moto Taxi": "bike",
    "Bus / Micro": "bus",
    "Línea Celular": "smartphone",
    "Juegos": "gamepad-2",
    "ChatGPT": "bot",
    "Claude": "sparkles",
    "Cluely": "eye",
    "Google": "globe",
    "Spotify": "music",
    "Netflix": "clapperboard",
    "HBO Max": "tv",
    "Prime Video": "film",
    "Crunchyroll": "play",
    "Tecnología": "laptop",
    "Perfumes": "spray-can",
    "Accesorios": "watch",
    "Ropa": "shirt",
    "Calzado": "footprints",
    "Regalos": "gift",
    "Electrodomésticos": "refrigerator",
    "Muebles": "sofa",
    "Consultas Médicas": "stethoscope",
    "Medicamentos": "pill",
    "Exámenes Médicos": "test-tube",
    "Odontología": "smile",
    "Barbería / Peluquería": "scissors",
    "Higiene Personal": "bath",
    "Gimnasio": "dumbbell",
    "Maestría": "graduation-cap",
    "Matrícula": "badge-check",
    "Libros": "book-open",
    "Certificaciones": "award",
    "Plataformas Educativas": "monitor-play",
    "Cursos": "notebook-pen",
    "Imprevistos": "triangle-alert",
    "Trámites": "file-text",
    "Por Clasificar": "tag",
    "Software Laboral": "app-window",
    "Equipos de Trabajo": "monitor",
    "Hospedaje": "bed-double",
    "Cuidado Íntimo": "heart",
    "Detalle Mensual": "flower-2",
    "Fecha Especial": "calendar-heart",
    "Aniversario": "cake",
    "Sorpresas": "party-popper",
    "Paseos": "trees",
    "Cine": "clapperboard",
    "Diversión": "smile-plus",
    "Restaurantes": "chef-hat",
    "Actividades Recreativas": "tent",
    "Leche": "milk",
    "Pañales": "baby",
    "Pañitos": "sparkles",
    "Alimentación": "utensils",
    "Juguetes": "blocks",
    "Cuidado Infantil": "heart-handshake",
    "Supermercado": "shopping-cart",
    "Limpieza": "spray-can",
    "Reparaciones": "hammer",
    "Luz": "lightbulb",
    "Agua": "droplet",
    "Internet": "wifi",
    "Padre": "user",
    "Madre": "user-round",
    "Pareja": "heart",
    "Hija": "baby",
    "Hermanos": "users",
    "Apoyo Económico": "hand-coins",
    "Regalo Familiar": "gift",
    "Emergencias": "siren",
    "Reuniones": "users-round",
    "Actividades Deportivas": "trophy",
    "Cumpleaños": "cake",
    "Fechas Especiales": "calendar-heart",
    "Otros": "ellipsis"
  },
  "ambitos": [
    {
      "nombre": "Personal",
      "icono": "user",
      "color": "#254BE4",
      "categorias": [
        {
          "nombre": "Alimentación",
          "subcategorias": [
            "Desayuno",
            "Almuerzo",
            "Cena",
            "Delivery",
            "Snack / Antojos",
            "Bebidas",
            "Otros"
          ]
        },
        {
          "nombre": "Auto",
          "subcategorias": [
            "Gasolina",
            "Gas",
            "Car Wash",
            "Estacionamiento",
            "Mantenimiento",
            "Repuestos",
            "Seguro Vehicular",
            "SOAT",
            "Revisión Técnica",
            "Multas",
            "Otros"
          ]
        },
        {
          "nombre": "Transporte",
          "subcategorias": [
            "Taxi",
            "Moto Taxi",
            "Bus / Micro",
            "Otros"
          ]
        },
        {
          "nombre": "Servicios",
          "subcategorias": [
            "Línea Celular",
            "Otros"
          ]
        },
        {
          "nombre": "Suscripciones",
          "subcategorias": [
            "Juegos",
            "ChatGPT",
            "Claude",
            "Cluely",
            "Google",
            "Spotify",
            "Netflix",
            "HBO Max",
            "Prime Video",
            "Crunchyroll",
            "Otros"
          ]
        },
        {
          "nombre": "Compras",
          "subcategorias": [
            "Tecnología",
            "Perfumes",
            "Accesorios",
            "Ropa",
            "Calzado",
            "Regalos",
            "Electrodomésticos",
            "Muebles",
            "Otros"
          ]
        },
        {
          "nombre": "Salud",
          "subcategorias": [
            "Consultas Médicas",
            "Medicamentos",
            "Exámenes Médicos",
            "Odontología",
            "Otros"
          ]
        },
        {
          "nombre": "Cuidado Personal",
          "subcategorias": [
            "Barbería / Peluquería",
            "Higiene Personal",
            "Gimnasio",
            "Otros"
          ]
        },
        {
          "nombre": "Educación",
          "subcategorias": [
            "Maestría",
            "Matrícula",
            "Libros",
            "Certificaciones",
            "Plataformas Educativas",
            "Cursos",
            "Otros"
          ]
        },
        {
          "nombre": "Otros",
          "subcategorias": [
            "Imprevistos",
            "Trámites",
            "Por Clasificar",
            "Otros"
          ]
        }
      ]
    },
    {
      "nombre": "Trabajo",
      "icono": "briefcase",
      "color": "#4525E4",
      "categorias": [
        {
          "nombre": "Alimentación",
          "subcategorias": [
            "Desayuno",
            "Almuerzo",
            "Cena",
            "Delivery",
            "Snack / Antojos",
            "Bebidas",
            "Otros"
          ]
        },
        {
          "nombre": "Transporte",
          "subcategorias": [
            "Taxi",
            "Moto Taxi",
            "Bus / Micro",
            "Otros"
          ]
        },
        {
          "nombre": "Herramientas y Equipamiento",
          "subcategorias": [
            "Software Laboral",
            "Equipos de Trabajo",
            "Accesorios",
            "Otros"
          ]
        },
        {
          "nombre": "Otros",
          "subcategorias": [
            "Imprevistos",
            "Trámites",
            "Por Clasificar",
            "Otros"
          ]
        }
      ]
    },
    {
      "nombre": "Pareja",
      "icono": "heart",
      "color": "#671E51",
      "categorias": [
        {
          "nombre": "Alimentación",
          "subcategorias": [
            "Desayuno",
            "Almuerzo",
            "Cena",
            "Delivery",
            "Snack / Antojos",
            "Bebidas",
            "Otros"
          ]
        },
        {
          "nombre": "Plan Nube",
          "subcategorias": [
            "Hospedaje",
            "Cuidado Íntimo",
            "Otros"
          ]
        },
        {
          "nombre": "Transporte",
          "subcategorias": [
            "Taxi",
            "Moto Taxi",
            "Bus / Micro",
            "Otros"
          ]
        },
        {
          "nombre": "Regalos",
          "subcategorias": [
            "Detalle Mensual",
            "Fecha Especial",
            "Aniversario",
            "Sorpresas",
            "Otros"
          ]
        },
        {
          "nombre": "Compras",
          "subcategorias": [
            "Tecnología",
            "Perfumes",
            "Accesorios",
            "Ropa",
            "Calzado",
            "Regalos",
            "Electrodomésticos",
            "Muebles",
            "Otros"
          ]
        },
        {
          "nombre": "Salidas",
          "subcategorias": [
            "Paseos",
            "Cine",
            "Juegos",
            "Diversión",
            "Restaurantes",
            "Actividades Recreativas",
            "Otros"
          ]
        },
        {
          "nombre": "Otros",
          "subcategorias": [
            "Imprevistos",
            "Trámites",
            "Por Clasificar",
            "Otros"
          ]
        }
      ]
    },
    {
      "nombre": "Familia",
      "icono": "users",
      "color": "#B4E425",
      "categorias": [
        {
          "nombre": "Alimentación",
          "subcategorias": [
            "Desayuno",
            "Almuerzo",
            "Cena",
            "Delivery",
            "Snack / Antojos",
            "Bebidas",
            "Otros"
          ]
        },
        {
          "nombre": "Bebé",
          "subcategorias": [
            "Leche",
            "Pañales",
            "Pañitos",
            "Ropa",
            "Alimentación",
            "Juguetes",
            "Accesorios",
            "Consultas Médicas",
            "Medicamentos",
            "Cuidado Infantil",
            "Otros"
          ]
        },
        {
          "nombre": "Hogar",
          "subcategorias": [
            "Supermercado",
            "Limpieza",
            "Reparaciones",
            "Mantenimiento",
            "Electrodomésticos",
            "Muebles",
            "Otros"
          ]
        },
        {
          "nombre": "Servicios",
          "subcategorias": [
            "Luz",
            "Agua",
            "Gas",
            "Internet",
            "Línea Celular",
            "Otros"
          ]
        },
        {
          "nombre": "Transporte",
          "subcategorias": [
            "Taxi",
            "Moto Taxi",
            "Bus / Micro",
            "Otros"
          ]
        },
        {
          "nombre": "Compras",
          "subcategorias": [
            "Tecnología",
            "Perfumes",
            "Accesorios",
            "Ropa",
            "Calzado",
            "Regalos",
            "Electrodomésticos",
            "Muebles",
            "Otros"
          ]
        },
        {
          "nombre": "Apoyo Familiar",
          "subcategorias": [
            "Padre",
            "Madre",
            "Pareja",
            "Hija",
            "Hermanos",
            "Apoyo Económico",
            "Regalo Familiar",
            "Otros"
          ]
        },
        {
          "nombre": "Salud Familiar",
          "subcategorias": [
            "Consultas Médicas",
            "Medicamentos",
            "Exámenes Médicos",
            "Emergencias",
            "Otros"
          ]
        },
        {
          "nombre": "Educación",
          "subcategorias": [
            "Maestría",
            "Matrícula",
            "Libros",
            "Certificaciones",
            "Plataformas Educativas",
            "Cursos",
            "Otros"
          ]
        },
        {
          "nombre": "Otros",
          "subcategorias": [
            "Imprevistos",
            "Trámites",
            "Por Clasificar",
            "Otros"
          ]
        }
      ]
    },
    {
      "nombre": "Amigos",
      "icono": "party-popper",
      "color": "#611E67",
      "categorias": [
        {
          "nombre": "Alimentación",
          "subcategorias": [
            "Desayuno",
            "Almuerzo",
            "Cena",
            "Delivery",
            "Snack / Antojos",
            "Bebidas",
            "Otros"
          ]
        },
        {
          "nombre": "Transporte",
          "subcategorias": [
            "Taxi",
            "Moto Taxi",
            "Bus / Micro",
            "Otros"
          ]
        },
        {
          "nombre": "Salidas",
          "subcategorias": [
            "Cine",
            "Paseos",
            "Juegos",
            "Diversión",
            "Reuniones",
            "Actividades Deportivas",
            "Otros"
          ]
        },
        {
          "nombre": "Regalos",
          "subcategorias": [
            "Cumpleaños",
            "Fechas Especiales",
            "Otros"
          ]
        },
        {
          "nombre": "Otros",
          "subcategorias": [
            "Imprevistos",
            "Trámites",
            "Por Clasificar",
            "Otros"
          ]
        }
      ]
    }
  ]
};
var PALETA_COLORES = ["#91B620","#728C21","#B4E425","#55671E","#BEDD5F","#52B620","#458C21","#65E425","#36671E","#89DD5F","#20B639","#218C33","#25E445","#1E672A","#5FDD74","#20B67F","#218C65","#25E49E","#1E674C","#5FDDAF","#20B6AA","#218C83","#25E4D4","#1E6761","#5FDDD3","#2098B6","#21778C","#25BEE4","#1E5867","#5FC4DD","#206BB6","#21578C","#2585E4","#1E4267","#5F9EDD","#203EB6","#21368C","#254BE4","#1E2C67","#5F78DD","#3920B6","#33218C","#4525E4","#2A1E67","#745FDD","#7020B6","#5A218C","#8B25E4","#451E67","#A25FDD","#AA20B6","#83218C","#D425E4","#611E67","#D35FDD","#B62089","#8C216C","#E425AB","#671E51","#DD5FB7","#64748B","#475569","#6B7280","#78716C"];
// <</GENERADO:catalogo>>

/* ============================== 2. UTILIDADES ============================== */
class ApiError extends Error {
  constructor(code, message, campo, detalle) {
    super(message);
    this.code = code;
    this.campo = campo;
    this.detalle = detalle;
  }
}

function fallar(code, message, campo, detalle) {
  throw new ApiError(code, message, campo, detalle);
}
function invalido(campo, message) {
  throw new ApiError('VALIDATION', message, campo);
}

function uuid() {
  return Utilities.getUuid();
}
function ahoraIso() {
  return new Date().toISOString();
}
function redondear2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function esObjeto(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}
function claveNorm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
function igualesCI(a, b) {
  return claveNorm(a) === claveNorm(b);
}
function iguales(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Comparación en tiempo constante (sin cortocircuito por longitud ni por carácter). */
function igualesConstante(a, b) {
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  var largo = Math.max(a.length, b.length);
  var diff = a.length ^ b.length;
  for (var i = 0; i < largo; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function tokenAleatorio(largo) {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var out = '';
  var fuente = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (var i = 0; i < largo; i++) {
    var n = parseInt(fuente.substr((i * 2) % (fuente.length - 1), 2), 16);
    out += abc.charAt((n + i * 7) % abc.length);
  }
  return out;
}

function maximoPor(arr, fn) {
  var m = 0;
  for (var i = 0; i < arr.length; i++) {
    var v = fn(arr[i]);
    if (v > m) m = v;
  }
  return m;
}

function fechaReal(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-');
  var y = +p[0], m = +p[1], d = +p[2];
  if (y < 1990 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function mesReal(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s) && +s.slice(0, 4) >= 1990 && +s.slice(0, 4) <= 2200;
}
function mesAnterior(mes) {
  var y = +mes.slice(0, 4), m = +mes.slice(5, 7);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  return y + '-' + (m < 10 ? '0' + m : m);
}
function ordenarOtrosAlFinal(items, nombreDe) {
  var normales = [], otros = [];
  for (var i = 0; i < items.length; i++) {
    (claveNorm(nombreDe(items[i])) === 'otros' ? otros : normales).push(items[i]);
  }
  return normales.concat(otros);
}

/** CSV seguro: neutraliza fórmulas (= + - @ tab CR) en celdas de texto. */
function celdaCsv(v) {
  if (v === null || v === undefined) return '';
  var s = typeof v === 'string' ? v : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/* ====================== 3. ESQUEMA Y ACCESO A HOJAS ====================== */
var _ESQ = null;
function esquemas() {
  if (_ESQ) return _ESQ;
  _ESQ = {};
  Object.keys(ESQUEMAS_DEF).forEach(function (hoja) {
    var cols = ESQUEMAS_DEF[hoja].split(',').map(function (c) {
      var p = c.split(':');
      return { n: p[0], t: p[1] || 's' };
    });
    var idx = {};
    cols.forEach(function (c, i) { idx[c.n] = i; });
    _ESQ[hoja] = { hoja: hoja, cols: cols, idx: idx, ncols: cols.length, clave: cols[0].n };
  });
  return _ESQ;
}
function esq(hoja) {
  var e = esquemas()[hoja];
  if (!e) fallar('SERVER_ERROR', 'Hoja desconocida: ' + hoja);
  return e;
}

/* Contexto por petición: libro, zona horaria, tablas leídas, auditoría pendiente */
var CTX = null;
function nuevoCtx(origen) {
  CTX = { ss: null, tz: null, t: {}, hojas: {}, audit: [], cfg: null, origen: origen || 'web', gen: null, escribio: false, indices: {} };
  return CTX;
}
/**
 * Devuelve el libro de datos. Con `crear` (solo desde setup) y sin libro asociado ni SHEET_ID —por ejemplo
 * un proyecto creado en script.google.com— crea uno nuevo en tu Drive y lo recuerda.
 */
function libro(crear) {
  if (CTX.ss) return CTX.ss;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = null;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  }
  if (!ss && crear) {
    ss = SpreadsheetApp.create('Control de Gastos Deejota');
    ss.setSpreadsheetTimeZone('America/Lima');
    PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
    CTX.libroCreado = true;
  }
  if (!ss) fallar('SCHEMA', 'No se encontró la hoja de cálculo. Ejecuta setup() una vez desde el editor de Apps Script.');
  CTX.ss = ss;
  CTX.tz = ss.getSpreadsheetTimeZone();
  return ss;
}

function normCelda(v, t) {
  if (t === 'd') {
    if (v instanceof Date) return Utilities.formatDate(v, CTX.tz || 'UTC', 'yyyy-MM-dd');
    return v === null || v === undefined || v === '' ? '' : String(v).slice(0, 10);
  }
  if (t === 'm') {
    if (v instanceof Date) return Utilities.formatDate(v, CTX.tz || 'UTC', 'yyyy-MM');
    return v === null || v === undefined || v === '' ? '' : String(v).slice(0, 7);
  }
  if (t === 'n' || t === 'i') {
    if (v === '' || v === null || v === undefined) return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (isNaN(n)) return null;
    return t === 'i' ? Math.round(n) : n;
  }
  if (t === 'b') {
    if (typeof v === 'boolean') return v;
    var s = String(v).toLowerCase();
    return s === 'true' || s === '1' || s === 'si' || s === 'sí';
  }
  if (t === 'j') {
    if (v === '' || v === null || v === undefined) return null;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch (e) { return null; }
  }
  if (v instanceof Date) return v.toISOString();
  return v === null || v === undefined ? '' : String(v);
}

function aObjeto(e, fila, nFila) {
  var o = {};
  for (var i = 0; i < e.ncols; i++) o[e.cols[i].n] = normCelda(fila[i], e.cols[i].t);
  Object.defineProperty(o, '_fila', { value: nFila, enumerable: false, writable: true, configurable: true });
  return o;
}
function aFila(e, o) {
  var f = [];
  for (var i = 0; i < e.ncols; i++) {
    var c = e.cols[i], v = o[c.n];
    if (c.t === 'j') v = v === null || v === undefined ? '' : JSON.stringify(v);
    else if (c.t === 'b') v = v === true;
    else if (c.t === 'n' || c.t === 'i') v = v === null || v === undefined || v === '' ? '' : Number(v);
    else v = v === null || v === undefined ? '' : String(v);
    f.push(v);
  }
  return f;
}

function hoja(nombre) {
  if (CTX.hojas[nombre]) return CTX.hojas[nombre];
  var sh = libro().getSheetByName(nombre);
  if (!sh) fallar('SCHEMA', 'Falta la hoja "' + nombre + '". Ejecuta setup() para crearla.');
  var e = esq(nombre);
  var enc = sh.getRange(1, 1, 1, e.ncols).getValues()[0];
  for (var i = 0; i < e.ncols; i++) {
    if (String(enc[i]) !== e.cols[i].n) {
      fallar('SCHEMA', 'La hoja "' + nombre + '" tiene encabezados distintos a los esperados (columna ' + (i + 1) + ': esperaba "' + e.cols[i].n + '" y hay "' + enc[i] + '").');
    }
  }
  CTX.hojas[nombre] = sh;
  return sh;
}

/** Lee toda la hoja (una sola vez por petición). */
function leerTodo(nombre) {
  if (CTX.t[nombre]) return CTX.t[nombre];
  var sh = hoja(nombre), e = esq(nombre);
  var ult = sh.getLastRow();
  var out = [];
  if (ult >= 2) {
    var vals = sh.getRange(2, 1, ult - 1, e.ncols).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (vals[i][0] === '' && nombre !== 'orden_movimientos') continue;
      out.push(aObjeto(e, vals[i], i + 2));
    }
  }
  CTX.t[nombre] = out;
  return out;
}

/** Lee solo una columna (p. ej. ids) sin traer la hoja entera. */
function leerColumna(nombre, col) {
  var sh = hoja(nombre), e = esq(nombre);
  var ult = sh.getLastRow();
  if (ult < 2) return [];
  var vals = sh.getRange(2, e.idx[col] + 1, ult - 1, 1).getValues();
  return vals.map(function (r) { return r[0]; });
}

/* ---- Índice id → fila en CacheService (validado por generación) ---- */
function claveIndice(nombre) { return 'idx:' + generacion() + ':' + nombre; }
function cargarIndice(nombre) {
  var c = cacheSegura();
  var partes = c.get(claveIndice(nombre) + ':n');
  if (!partes) return null;
  var txt = '';
  for (var i = 0; i < +partes; i++) {
    var p = c.get(claveIndice(nombre) + ':' + i);
    if (p === null || p === undefined) return null;
    txt += p;
  }
  try { return JSON.parse(txt); } catch (e) { return null; }
}
function guardarIndice(nombre, mapa) {
  try {
    var txt = JSON.stringify(mapa), c = cacheSegura();
    var n = Math.ceil(txt.length / TROZO_CACHE);
    if (n > 8) return; // demasiado grande para la caché: se usará TextFinder
    var pares = {};
    for (var i = 0; i < n; i++) pares[claveIndice(nombre) + ':' + i] = txt.substr(i * TROZO_CACHE, TROZO_CACHE);
    pares[claveIndice(nombre) + ':n'] = String(n);
    c.putAll(pares, TTL_BOOTSTRAP);
  } catch (e) { /* la caché es opcional */ }
}
function numeroDeFila(nombre, id) {
  var sh = hoja(nombre);
  var ult = sh.getLastRow();
  if (ult < 2) return 0;
  var mapa = CTX.indices[nombre] || cargarIndice(nombre);
  if (!mapa) {
    mapa = {};
    var ids = leerColumna(nombre, esq(nombre).clave);
    for (var i = 0; i < ids.length; i++) if (ids[i] !== '') mapa[ids[i]] = i + 2;
    guardarIndice(nombre, mapa);
  }
  CTX.indices[nombre] = mapa;
  var f = mapa[id];
  if (f && f <= ult && String(sh.getRange(f, 1).getValue()) === String(id)) return f; // validación
  var r = sh.getRange(2, 1, ult - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return r ? r.getRow() : 0;
}

/** Busca un registro por id leyendo solo su fila (o la tabla cacheada de la petición). */
function buscarPorId(nombre, id) {
  if (id === null || id === undefined || id === '') return null;
  if (CTX.t[nombre]) {
    var arr = CTX.t[nombre];
    for (var i = 0; i < arr.length; i++) if (String(arr[i][esq(nombre).clave]) === String(id)) return arr[i];
    return null;
  }
  var f = numeroDeFila(nombre, id);
  if (!f) return null;
  var e = esq(nombre);
  return aObjeto(e, hoja(nombre).getRange(f, 1, 1, e.ncols).getValues()[0], f);
}

/** Garantiza que la cuadrícula de la hoja llegue hasta `hasta` (Sheets no crece sola al escribir con setValues). */
function asegurarFilas(sh, hasta) {
  var max = sh.getMaxRows();
  if (hasta > max) sh.insertRowsAfter(max, Math.max(hasta - max, 200));
}
function insertar(nombre, objs) {
  if (!objs.length) return;
  var sh = hoja(nombre), e = esq(nombre);
  var ult = Math.max(sh.getLastRow(), 1);
  var filas = objs.map(function (o) { return aFila(e, o); });
  diarioRegistrar({ k: 'i', h: nombre, f: ult + 1, n: filas.length });
  asegurarFilas(sh, ult + filas.length);
  sh.getRange(ult + 1, 1, filas.length, e.ncols).setValues(filas);
  for (var i = 0; i < objs.length; i++) {
    Object.defineProperty(objs[i], '_fila', { value: ult + 1 + i, enumerable: false, writable: true, configurable: true });
    if (CTX.t[nombre]) CTX.t[nombre].push(objs[i]);
    if (CTX.indices[nombre]) CTX.indices[nombre][objs[i][e.clave]] = ult + 1 + i;
  }
  CTX.escribio = true;
}
function actualizar(nombre, o) {
  var e = esq(nombre);
  var f = o._fila || numeroDeFila(nombre, o[e.clave]);
  if (!f) fallar('NOT_FOUND', 'No se encontró el registro a actualizar.');
  if (CTX.op) diarioRegistrar({ k: 'a', h: nombre, filas: [{ f: f, v: serializarFila(hoja(nombre).getRange(f, 1, 1, e.ncols).getValues()[0]) }] });
  hoja(nombre).getRange(f, 1, 1, e.ncols).setValues([aFila(e, o)]);
  CTX.escribio = true;
}
function borrarFilas(nombre, objs) {
  if (!objs.length) return;
  var sh = hoja(nombre), e = esq(nombre);
  var filas = objs.map(function (o) { return o._fila || numeroDeFila(nombre, o[e.clave]); }).filter(Boolean);
  filas.sort(function (a, b) { return b - a; });
  if (CTX.op && filas.length) {
    var min = filas[filas.length - 1], max = filas[0];
    var antes = sh.getRange(min, 1, max - min + 1, e.ncols).getValues();
    var previas = filas.slice().reverse().map(function (f) { return { f: f, v: serializarFila(antes[f - min]) }; });
    diarioRegistrar({ k: 'b', h: nombre, filas: previas });
  }
  for (var i = 0; i < filas.length; i++) sh.deleteRow(filas[i]);
  delete CTX.t[nombre];
  delete CTX.indices[nombre];
  CTX.escribio = true;
}
function reescribirHoja(nombre, objs) {
  var sh = hoja(nombre), e = esq(nombre);
  var ult = sh.getLastRow();
  if (CTX.op) diarioRegistrar({ k: 'r', h: nombre, v: ult >= 2 ? sh.getRange(2, 1, ult - 1, e.ncols).getValues().map(serializarFila) : [] });
  if (ult >= 2) sh.getRange(2, 1, ult - 1, e.ncols).clearContent();
  asegurarFilas(sh, 1 + objs.length);
  if (objs.length) sh.getRange(2, 1, objs.length, e.ncols).setValues(objs.map(function (o) { return aFila(e, o); }));
  delete CTX.t[nombre];
  delete CTX.indices[nombre];
  CTX.escribio = true;
}

/* Metadatos de entidad */
function metaNueva() {
  var t = ahoraIso();
  return { creado_en: t, actualizado_en: t, version: 1 };
}
function tocar(o) {
  o.actualizado_en = ahoraIso();
  o.version = (o.version || 0) + 1;
  return o;
}
function copia(o) {
  var c = {};
  Object.keys(o).forEach(function (k) { c[k] = o[k]; });
  if (o._fila) Object.defineProperty(c, '_fila', { value: o._fila, enumerable: false, writable: true, configurable: true });
  return c;
}
/** Concurrencia optimista: la versión enviada debe coincidir con la guardada. */
function exigirVersion(actual, enviada) {
  if (enviada === undefined || enviada === null) invalido('version', 'Falta la versión del registro que estás editando.');
  if (Number(enviada) !== Number(actual.version)) {
    fallar('CONFLICT', 'Este registro cambió desde que lo abriste.', 'version', { actual: copia(actual) });
  }
}

/* ======================== 4. AUDITORÍA, GENERACIÓN E IDEMPOTENCIA ======================== */
function metaGet(clave) {
  var r = leerTodo('_meta');
  for (var i = 0; i < r.length; i++) if (r[i].clave === clave) return r[i].valor;
  return '';
}
function metaSet(clave, valor) {
  var r = leerTodo('_meta');
  for (var i = 0; i < r.length; i++) {
    if (r[i].clave === clave) { r[i].valor = String(valor); actualizar('_meta', r[i]); return; }
  }
  insertar('_meta', [{ clave: clave, valor: String(valor) }]);
}
function generacion() {
  if (CTX.gen) return CTX.gen;
  var c = cacheSegura();
  var g = c.get('gen');
  if (!g) {
    g = metaGet('generacion');
    if (!g) { g = uuid(); metaSet('generacion', g); }
    c.put('gen', g, 21600);
  }
  CTX.gen = g;
  return g;
}
/** Cambia la generación: invalida cachés (bootstrap, índices) y alimenta `cambios`. */
function nuevaGeneracion() {
  var g = uuid();
  metaSet('generacion', g);
  cacheSegura().put('gen', g, 21600);
  CTX.gen = g;
  return g;
}

function auditar(accion, entidad, id, antes, despues) {
  CTX.audit.push({ accion: accion, entidad: entidad, entidad_id: id || '', antes: antes === undefined ? null : antes, despues: despues === undefined ? null : despues });
}
function acotarJson(v) {
  if (v === null || v === undefined) return null;
  var s = JSON.stringify(v);
  return s.length > 20000 ? { truncado: true } : v;
}
function volcarAuditoria() {
  if (!CTX.audit.length) return;
  var t = ahoraIso();
  var filas = CTX.audit.map(function (a) {
    return { id: uuid(), fecha_hora: t, accion: a.accion, entidad: a.entidad, entidad_id: a.entidad_id, antes_json: acotarJson(a.antes), despues_json: acotarJson(a.despues), origen: CTX.origen };
  });
  insertar('auditoria', filas);
  CTX.audit = [];
}
/** Al superar 20 000 filas, archiva en Drive (CSV) y conserva las últimas 2 000. */
function rotarAuditoria() {
  var sh = hoja('auditoria'), e = esq('auditoria');
  var ult = sh.getLastRow();
  if (ult - 1 <= MAX_AUDITORIA) return;
  var archivar = ult - 1 - MANTENER_AUDITORIA;
  var vals = sh.getRange(2, 1, archivar, e.ncols).getValues();
  var lineas = [e.cols.map(function (c) { return c.n; }).join(',')];
  vals.forEach(function (f) { lineas.push(f.map(celdaCsv).join(',')); });
  var nombre = 'auditoria-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss') + '.csv';
  var carpetaId = cfg().carpeta_respaldo_id;
  try {
    var carpeta = carpetaId ? DriveApp.getFolderById(carpetaId) : null;
    if (carpeta) carpeta.createFile(nombre, lineas.join('\n'), MimeType.CSV);
    else DriveApp.createFile(nombre, lineas.join('\n'), MimeType.CSV);
  } catch (err) {
    // Si no se puede archivar, NO se borra nada.
    console.error('No se pudo archivar la auditoría: ' + err);
    return;
  }
  sh.deleteRows(2, archivar);
  delete CTX.t['auditoria'];
  delete CTX.indices['auditoria'];
}

/* ---- Huella de la petición: mismo requestId + otros datos = CONFLICT ---- */
function estable(v) {
  if (v === null || v === undefined || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(estable).join(',') + ']';
  return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + estable(v[k]); }).join(',') + '}';
}
function hash53(str, semilla) {
  var h1 = 0xdeadbeef ^ semilla, h2 = 0x41c6ce57 ^ semilla;
  for (var i = 0; i < str.length; i++) {
    var ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function huellaPeticion(accion, payload) {
  var s = accion + '|' + estable(payload);
  return hash53(s, 1) + hash53(s, 2) + s.length.toString(36);
}

/* ---- Idempotencia: caché rápida + registro durable en `_meta` (op:<requestId>) ---- */
function idemObtener(requestId) {
  var s = cacheSegura().get('rq:' + requestId);
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}
function idemGuardar(requestId, huella, resp) {
  var c = cacheSegura();
  var s = JSON.stringify({ h: huella, r: resp });
  if (s.length > TROZO_CACHE) s = JSON.stringify({ h: huella, r: { ok: true, data: { repetido: true, nota: 'La respuesta original era demasiado grande; relee con "cambios".' }, version: VERSION, generacion: resp.generacion } });
  c.put('rq:' + requestId, s, TTL_IDEMPOTENCIA);
  var idx = [];
  try { idx = JSON.parse(c.get('rqidx') || '[]'); } catch (e) { idx = []; }
  idx.push(requestId);
  while (idx.length > MAX_IDEMPOTENCIA) c.remove('rq:' + idx.shift());
  c.put('rqidx', JSON.stringify(idx), TTL_IDEMPOTENCIA);
}
/** Repetición de una petición ya aplicada: devuelve su respuesta original o CONFLICT si los datos cambiaron. */
function repetida(huella, previa) {
  if (previa.h !== huella) fallar('CONFLICT', 'Este identificador de petición (requestId) ya se usó con otros datos. Genera uno nuevo.', 'requestId');
  var r = previa.r;
  r.repetido = true;
  return r;
}

/* ---- Diario de operaciones: preparar → aplicar → confirmar, con deshacer persistente ----
 * Apps Script no ofrece transacciones sobre hojas. Para que cada acción sea "todo o nada":
 *  1) antes de la PRIMERA escritura se crea op:<id> (estado en_curso) y se marca OP_EN_CURSO;
 *  2) antes de CADA escritura se guarda en `opu:<k>` cómo deshacerla (imagen previa de las filas);
 *  3) la confirmación es una sola celda: op:<id> pasa a "ok" con la respuesta (punto de commit);
 *  4) si algo falla, o si la ejecución murió, la siguiente petición deshace en orden inverso (recuperación).
 */
function filaMeta(clave) {
  var sh = hoja('_meta'), ult = sh.getLastRow();
  if (ult < 2) return 0;
  var r = sh.getRange(2, 1, ult - 1, 1).createTextFinder(clave).matchEntireCell(true).findNext();
  return r ? r.getRow() : 0;
}
/** Escribe una fila de `_meta` sin pasar por el diario (el diario no se registra a sí mismo). */
function metaCrudo(clave, valor, fila) {
  var sh = hoja('_meta');
  var f = fila || filaMeta(clave);
  if (!f) { f = Math.max(sh.getLastRow(), 1) + 1; asegurarFilas(sh, f); }
  sh.getRange(f, 1, 1, 2).setValues([[clave, valor]]);
  delete CTX.t['_meta'];
  return f;
}
function serializarFila(fila) {
  return fila.map(function (v) { return v instanceof Date ? { $d: v.getTime() } : v; });
}
function revivirFila(fila) {
  return fila.map(function (v) { return v !== null && typeof v === 'object' && v.$d !== undefined ? new Date(v.$d) : v; });
}
function cabeceraOp(op, estado, extra) {
  var o = { h: op.huella, a: op.accion, s: estado, t: op.t };
  if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
  return JSON.stringify(o);
}
function diarioPreparar() {
  var op = CTX.op;
  if (op.preparada) return;
  PropertiesService.getScriptProperties().setProperty('OP_EN_CURSO', op.rid);
  op.filaCab = metaCrudo('op:' + op.rid, cabeceraOp(op, 'en_curso'), op.filaCab || 0);
  op.preparada = true;
}
/** Guarda cómo deshacer la escritura que viene (siempre ANTES de escribir). Formato: una entrada JSON por línea. */
function diarioRegistrar(entrada) {
  var op = CTX.op;
  if (!op) return;
  diarioPreparar();
  var linea = JSON.stringify(entrada) + '\n';
  var desde = op.texto.length;
  op.texto += linea;
  op.entradas.push(entrada);
  var n = Math.ceil(op.texto.length / TROZO_DIARIO);
  for (var k = Math.floor(desde / TROZO_DIARIO); k < n; k++) {
    op.filasU[k] = metaCrudo('opu:' + k, op.texto.substr(k * TROZO_DIARIO, TROZO_DIARIO), op.filasU[k] || 0);
  }
}
function leerDeshacer() {
  var txt = '';
  for (var k = 0; k < 10000; k++) {
    var f = filaMeta('opu:' + k);
    if (!f) break;
    var v = String(hoja('_meta').getRange(f, 2).getValue());
    if (v === '') break;
    txt += v;
  }
  var out = [];
  txt.split('\n').forEach(function (l) {
    if (!l) return;
    try { out.push(JSON.parse(l)); } catch (e) { /* línea cortada por una caída: su escritura no llegó a ocurrir */ }
  });
  return out;
}
function limpiarDeshacer() {
  for (var k = 0; k < 10000; k++) {
    var f = filaMeta('opu:' + k);
    if (!f) break;
    var sh = hoja('_meta');
    if (String(sh.getRange(f, 2).getValue()) === '') break;
    sh.getRange(f, 2).setValues([['']]);
  }
}
function deshacerUna(e) {
  var sh = hoja(e.h), n = esq(e.h).ncols;
  if (e.k === 'i') {
    var ult = sh.getLastRow();
    if (ult >= e.f) sh.getRange(e.f, 1, Math.min(e.n, ult - e.f + 1), n).clearContent();
  } else if (e.k === 'a') {
    e.filas.forEach(function (x) { sh.getRange(x.f, 1, 1, n).setValues([revivirFila(x.v)]); });
  } else if (e.k === 'b') {
    e.filas.forEach(function (x) {
      if (x.f <= sh.getLastRow() && String(sh.getRange(x.f, 1).getValue()) === String(x.v[0])) return; // ya restaurada
      if (x.f <= sh.getLastRow()) sh.insertRowBefore(x.f);
      asegurarFilas(sh, x.f);
      sh.getRange(x.f, 1, 1, n).setValues([revivirFila(x.v)]);
    });
  } else if (e.k === 'r') {
    var u = sh.getLastRow();
    if (u >= 2) sh.getRange(2, 1, u - 1, n).clearContent();
    if (e.v.length) { asegurarFilas(sh, 1 + e.v.length); sh.getRange(2, 1, e.v.length, n).setValues(e.v.map(revivirFila)); }
  }
}
/** Deshace las `restantes` primeras entradas en orden inverso, dejando constancia del avance (es reanudable). */
function deshacerEntradas(entradas, restantes, rid, filaCab, base) {
  for (var i = Math.min(restantes, entradas.length) - 1; i >= 0; i--) {
    deshacerUna(entradas[i]);
    metaCrudo('op:' + rid, JSON.stringify(Object.assign({}, base, { s: 'en_curso', d: i })), filaCab);
  }
  delete CTX.t['_meta'];
}
/** Revierte lo escrito por la petición en curso (error a mitad de camino). */
function revertirOperacion(err) {
  var op = CTX.op;
  if (!op || !op.preparada) return;
  var base = { h: op.huella, a: op.accion, t: op.t };
  CTX.op = null; // las escrituras de la reversión no se registran
  deshacerEntradas(op.entradas, op.entradas.length, op.rid, op.filaCab, base);
  metaCrudo('op:' + op.rid, JSON.stringify(Object.assign({}, base, { s: 'revertida', d: 0, e: String(err && err.message || err).slice(0, 300) })), op.filaCab);
  limpiarDeshacer();
  PropertiesService.getScriptProperties().deleteProperty('OP_EN_CURSO');
  CTX.t = {}; CTX.indices = {}; CTX.escribio = false; CTX.audit = [];
  nuevaGeneracion();
}
/** Si una ejecución anterior murió a mitad de una operación, la deshace. Requiere tener el bloqueo. */
function recuperarSiHaceFalta() {
  var props = PropertiesService.getScriptProperties();
  var rid = props.getProperty('OP_EN_CURSO');
  if (!rid) return false;
  var previo = CTX.op;
  CTX.op = null;
  try {
    var f = filaMeta('op:' + rid);
    var cab = null;
    if (f) { try { cab = JSON.parse(String(hoja('_meta').getRange(f, 2).getValue())); } catch (e) { cab = null; } }
    if (cab && cab.s === 'en_curso') {
      var entradas = leerDeshacer();
      var restantes = cab.d === undefined ? entradas.length : cab.d;
      deshacerEntradas(entradas, restantes, rid, f, { h: cab.h, a: cab.a, t: cab.t });
      metaCrudo('op:' + rid, JSON.stringify({ h: cab.h, a: cab.a, t: cab.t, s: 'revertida', d: 0, e: 'ejecución interrumpida: se deshizo al recuperar' }), f);
      console.error('Operación interrumpida revertida: ' + rid + ' (' + cab.a + ')');
    }
    limpiarDeshacer();
    props.deleteProperty('OP_EN_CURSO');
    CTX.t = {}; CTX.indices = {};
    nuevaGeneracion();
  } finally {
    CTX.op = previo;
  }
  return true;
}
function buscarOperacion(rid) {
  var f = filaMeta('op:' + rid);
  if (!f) return null;
  try { return { fila: f, cab: JSON.parse(String(hoja('_meta').getRange(f, 2).getValue())) }; } catch (e) { return { fila: f, cab: null }; }
}
/** Punto de commit: una sola escritura deja la operación "ok" junto con su respuesta. */
function diarioConfirmar(resp) {
  var op = CTX.op;
  if (!op || !op.preparada) return;
  var r = resp;
  var largo = JSON.stringify(resp);
  if (largo.length > 30000) r = { ok: true, data: { repetido: true, nota: 'La respuesta original era demasiado grande; relee con "cambios".' }, version: VERSION, generacion: resp.generacion };
  metaCrudo('op:' + op.rid, cabeceraOp(op, 'ok', { c: ahoraIso(), d: 0, r: r }), op.filaCab);
  CTX.op = null;
  try { limpiarDeshacer(); PropertiesService.getScriptProperties().deleteProperty('OP_EN_CURSO'); } catch (e) { /* queda para la recuperación */ }
}
/** Conserva solo las últimas MANTENER_OPERACIONES huellas cuando se supera el máximo. */
function recortarOperaciones() {
  var sh = hoja('_meta'), ult = sh.getLastRow();
  if (ult - 1 <= MAX_OPERACIONES) return;
  var claves = sh.getRange(2, 1, ult - 1, 1).getValues();
  var ops = [];
  for (var i = 0; i < claves.length; i++) if (String(claves[i][0]).indexOf('op:') === 0) ops.push(i + 2);
  var sobran = ops.length - MANTENER_OPERACIONES;
  if (sobran <= 0) return;
  var borrar = ops.slice(0, sobran);
  // Se borran de la última a la primera, agrupando filas contiguas.
  var j = borrar.length - 1;
  while (j >= 0) {
    var fin = borrar[j], ini = fin;
    while (j - 1 >= 0 && borrar[j - 1] === ini - 1) { j--; ini = borrar[j]; }
    sh.deleteRows(ini, fin - ini + 1);
    j--;
  }
  delete CTX.t['_meta'];
}

/* ============================ 5. SEGURIDAD ============================ */
/** La caché solo sirve para bloqueo y límite de velocidad: si no está disponible se sigue validando el token. */
function cacheSegura() {
  var c = null;
  try { c = CacheService.getScriptCache(); } catch (e) { c = null; }
  return {
    get: function (k) { try { return c ? c.get(k) : null; } catch (e) { return null; } },
    put: function (k, v, t) { try { if (c) c.put(k, v, t); } catch (e) { /* sin caché */ } },
    remove: function (k) { try { if (c) c.remove(k); } catch (e) { /* sin caché */ } },
    putAll: function (o, t) { try { if (c) c.putAll(o, t); } catch (e) { /* sin caché */ } }
  };
}
function autenticar(token, accion) {
  var c = cacheSegura();
  var props = PropertiesService.getScriptProperties();
  var bloqueo = Number(c.get('auth_lock') || 0);
  if (bloqueo > Date.now()) {
    var min = Math.ceil((bloqueo - Date.now()) / 60000);
    fallar('AUTH', 'Demasiados intentos fallidos. Vuelve a intentar en ' + min + ' min.');
  }
  var maestro = props.getProperty('TOKEN') || '';
  var atajo = props.getProperty('ATAJO_TOKEN') || '';
  var t = typeof token === 'string' ? token : '';
  var okMaestro = igualesConstante(t, maestro) && maestro !== '';
  var okAtajo = igualesConstante(t, atajo) && atajo !== '' && String(accion).indexOf('atajo.') === 0;
  if (okMaestro || okAtajo) {
    c.remove('auth_fail');
    return okMaestro ? 'maestro' : 'atajo';
  }
  var fallos = Number(c.get('auth_fail') || 0) + 1;
  c.put('auth_fail', String(fallos), 3600);
  if (fallos >= 5) {
    var espera = Math.min(60 * Math.pow(2, fallos - 5), 3600);
    c.put('auth_lock', String(Date.now() + espera * 1000), espera);
  }
  fallar('AUTH', 'Token inválido.');
}
function limitarVelocidad() {
  var c = cacheSegura();
  var k = 'rl:' + Math.floor(Date.now() / 60000);
  var n = Number(c.get(k) || 0) + 1;
  c.put(k, String(n), 120);
  if (n > LIMITE_PETICIONES_MIN) fallar('QUOTA', 'Demasiadas peticiones por minuto. Espera un momento.');
}

/* ============================ 6. VALIDACIÓN ============================ */
var RE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

function cfg() {
  if (CTX.cfg) return CTX.cfg;
  var m = {};
  Object.keys(CONFIG_DEFECTO).forEach(function (k) { m[k] = CONFIG_DEFECTO[k]; });
  leerTodo('config').forEach(function (r) { m[r.clave] = r.valor; });
  if (!m.desc_excepciones) m.desc_excepciones = EXCEPCIONES_DESCRIPCION_DEFECTO.join(',');
  CTX.cfg = m;
  return m;
}
function excepcionesDesc() {
  return cfg().desc_excepciones.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}
function descNorm(txt) {
  return normalizarDescripcion(txt, excepcionesDesc());
}
function hoyNegocio() {
  return Utilities.formatDate(new Date(), cfg().zona_horaria, 'yyyy-MM-dd');
}
function monedasPermitidas() {
  var base = cfg().moneda_base;
  var lista = cfg().monedas_permitidas.split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean);
  if (lista.indexOf(base) === -1) lista.unshift(base);
  return lista;
}
function tipoCambioDe(moneda) {
  if (moneda === cfg().moneda_base) return 1;
  var v = Number(cfg()['tipo_cambio_' + moneda]);
  if (!(v > 0)) invalido('moneda', 'Configura el tipo de cambio ' + moneda + ' → ' + cfg().moneda_base + ' en Configuración antes de usar esa moneda.');
  return v;
}

function vTexto(p, campo, o) {
  o = o || {};
  var etiqueta = o.etiqueta || campo;
  var v = p[campo];
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (o.req) invalido(campo, 'Escribe ' + etiqueta + '.');
    return o.def !== undefined ? o.def : '';
  }
  if (typeof v !== 'string') invalido(campo, 'El campo ' + etiqueta + ' debe ser texto.');
  var s = v.replace(/\s+/g, ' ').trim();
  if (o.multilinea) s = v.trim();
  if (s.length > (o.max || 100)) invalido(campo, etiqueta + ' no puede superar ' + (o.max || 100) + ' caracteres.');
  return s;
}
function vNumero(p, campo, o) {
  o = o || {};
  var v = p[campo];
  if (v === undefined || v === null || v === '') {
    if (o.req) invalido(campo, 'Escribe ' + (o.etiqueta || campo) + '.');
    return o.def === undefined ? null : o.def;
  }
  var n = typeof v === 'number' ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? parseFloat(v) : NaN);
  if (!isFinite(n)) invalido(campo, (o.etiqueta || campo) + ' debe ser un número.');
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) invalido(campo, (o.etiqueta || campo) + ' admite como máximo 2 decimales.');
  var min = o.min === undefined ? 0 : o.min;
  if (o.positivo ? !(n > 0) : n < min) invalido(campo, (o.etiqueta || campo) + (o.positivo ? ' debe ser mayor que 0.' : ' no puede ser menor que ' + min + '.'));
  if (Math.abs(n) > 1e9) invalido(campo, (o.etiqueta || campo) + ' es demasiado grande.');
  return redondear2(n);
}
function vEntero(p, campo, o) {
  o = o || {};
  var v = p[campo];
  if (v === undefined || v === null || v === '') {
    if (o.req) invalido(campo, 'Indica ' + (o.etiqueta || campo) + '.');
    return o.def === undefined ? null : o.def;
  }
  var n = Number(v);
  if (!isFinite(n) || Math.floor(n) !== n) invalido(campo, (o.etiqueta || campo) + ' debe ser un número entero.');
  if (o.min !== undefined && n < o.min) invalido(campo, (o.etiqueta || campo) + ' no puede ser menor que ' + o.min + '.');
  if (o.max !== undefined && n > o.max) invalido(campo, (o.etiqueta || campo) + ' no puede ser mayor que ' + o.max + '.');
  return n;
}
function vFecha(p, campo, o) {
  o = o || {};
  var v = p[campo];
  if (v === undefined || v === null || v === '') {
    if (o.req) invalido(campo, 'Elige ' + (o.etiqueta || 'la fecha') + '.');
    return o.def === undefined ? '' : o.def;
  }
  if (!fechaReal(v)) invalido(campo, (o.etiqueta || 'La fecha') + ' no es válida (usa AAAA-MM-DD).');
  return v;
}
function vMes(p, campo, o) {
  o = o || {};
  var v = p[campo];
  if (v === undefined || v === null || v === '') {
    if (o.req) invalido(campo, 'Elige el mes.');
    return o.def === undefined ? '' : o.def;
  }
  if (!mesReal(v)) invalido(campo, 'El mes no es válido (usa AAAA-MM).');
  return v;
}
function vEnum(p, campo, lista, o) {
  o = o || {};
  var v = p[campo];
  if (v === undefined || v === null || v === '') {
    if (o.req) invalido(campo, 'Elige ' + (o.etiqueta || campo) + '.');
    return o.def === undefined ? '' : o.def;
  }
  if (lista.indexOf(v) === -1) invalido(campo, (o.etiqueta || campo) + ' no es válido. Opciones: ' + lista.join(', ') + '.');
  return v;
}
function vBool(p, campo, def) {
  var v = p[campo];
  if (v === undefined || v === null || v === '') return def === undefined ? false : def;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 'TRUE') return true;
  if (v === 'false' || v === 'FALSE') return false;
  invalido(campo, 'El campo ' + campo + ' debe ser verdadero o falso.');
}
function vId(p, campo, o) {
  o = o || {};
  var v = p[campo];
  if (v === undefined || v === null || v === '') {
    if (o.req) invalido(campo, 'Falta el identificador (' + campo + ').');
    return '';
  }
  if (typeof v !== 'string' || !RE_ID.test(v)) invalido(campo, 'El identificador (' + campo + ') no tiene un formato válido.');
  return v;
}
function vIdLista(p, campo, o) {
  o = o || {};
  var v = p[campo];
  if (v === undefined || v === null) {
    if (o.req) invalido(campo, 'Falta la lista ' + campo + '.');
    return [];
  }
  if (!Array.isArray(v)) invalido(campo, 'El campo ' + campo + ' debe ser una lista.');
  if (o.max && v.length > o.max) invalido(campo, 'La lista ' + campo + ' admite como máximo ' + o.max + ' elementos.');
  var vistos = {};
  v.forEach(function (x) {
    if (typeof x !== 'string' || !RE_ID.test(x)) invalido(campo, 'La lista ' + campo + ' tiene un identificador inválido.');
    if (vistos[x]) invalido(campo, 'La lista ' + campo + ' tiene elementos repetidos.');
    vistos[x] = true;
  });
  return v;
}
function vColor(p, campo, def) {
  var v = p[campo];
  if (v === undefined || v === null || v === '') return def || '';
  if (typeof v !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(v)) invalido(campo, 'El color debe tener formato #RRGGBB.');
  return v.toUpperCase();
}
function vIcono(p, campo, def) {
  var v = p[campo];
  if (v === undefined || v === null || v === '') return def || '';
  if (typeof v !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) || v.length > 40) invalido(campo, 'El icono no es válido.');
  return v;
}
function vUrlHttps(p, campo) {
  var v = p[campo];
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || !/^https:\/\/[^\s"'<>]{3,480}$/.test(v)) invalido(campo, 'El enlace debe empezar con https://.');
  return v;
}
function vMoneda(p, campo, def) {
  var v = p[campo] === undefined || p[campo] === null || p[campo] === '' ? (def || cfg().moneda_base) : p[campo];
  if (typeof v !== 'string' || monedasPermitidas().indexOf(v) === -1) invalido(campo, 'La moneda no está permitida. Opciones: ' + monedasPermitidas().join(', ') + '.');
  return v;
}

/** Referencia existente (y activa si la entidad tiene `activo`), salvo que sea la misma ya guardada. */
function exigirRef(nombreHoja, id, campo, etiqueta, original) {
  if (!id) invalido(campo, 'Elige ' + etiqueta + '.');
  var r = buscarPorId(nombreHoja, id);
  if (!r) invalido(campo, etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) + ' ya no existe.');
  if (esq(nombreHoja).idx.activo !== undefined && r.activo !== true && id !== original) invalido(campo, etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) + ' está inactivo. Actívalo o elige otro.');
  return r;
}
function nombreUnico(nombreHoja, nombre, idPropio, filtro) {
  var arr = leerTodo(nombreHoja);
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].id !== idPropio && igualesCI(arr[i].nombre, nombre) && (!filtro || filtro(arr[i]))) {
      invalido('nombre', 'Ya existe "' + arr[i].nombre + '". Usa otro nombre.');
    }
  }
}

/* ============================== 7. INSTALACIÓN ============================== */
var COLUMNAS_ANCHO = { id: 90, descripcion: 260, notas: 240, nombre: 180, datos_json: 320, antes_json: 260, despues_json: 260, comprobante_url: 240 };
var VALIDACIONES = {
  movimientos: { tipo_gasto: 'tipo_gasto', estado: 'estado_mov', origen: 'origen' },
  medios_pago: { tipo: 'medio_tipo' },
  fuentes: { recurrencia: 'recurrencia' },
  fuentes_mes: { estado: 'estado_mes' },
  cajas: { alcance: 'alcance' },
  cajas_mes: { estado: 'estado_mes' },
  plantillas: { tipo: 'plantilla_tipo' },
  revisiones_calidad: { estado: 'revision_estado' },
  conciliaciones: { tipo: 'conciliacion_tipo', estado: 'conciliacion_estado' },
  planificacion: { etapa: 'plan_etapa', estado: 'plan_estado' }
};

function encabezadosDe(nombre) { return esq(nombre).cols.map(function (c) { return c.n; }); }

function formatearHoja(sh, nombre, escribirEncabezados) {
  var e = esq(nombre), n = e.ncols;
  if (escribirEncabezados) sh.getRange(1, 1, 1, n).setValues([encabezadosDe(nombre)]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground(COLOR_MARCA).setFontColor('#FFFFFF');
  var filas = Math.max(sh.getMaxRows() - 1, 1);
  e.cols.forEach(function (c, i) {
    var rango = sh.getRange(2, i + 1, filas, 1);
    if (c.t === 'n') rango.setNumberFormat('#,##0.00');
    else if (c.t === 'i') rango.setNumberFormat('0');
    else if (c.t === 'b') { /* TRUE/FALSE reales */ }
    else rango.setNumberFormat('@'); // texto plano: neutraliza fórmulas y conserva AAAA-MM-DD
    sh.setColumnWidth(i + 1, COLUMNAS_ANCHO[c.n] || (c.t === 's' ? 130 : 105));
  });
  var vals = VALIDACIONES[nombre] || {};
  Object.keys(vals).forEach(function (col) {
    var regla = SpreadsheetApp.newDataValidation().requireValueInList(ENUMS[vals[col]], true).setAllowInvalid(false).build();
    sh.getRange(2, e.idx[col] + 1, filas, 1).setDataValidation(regla);
  });
  e.cols.forEach(function (c, i) {
    if (c.t === 'b') {
      var r = SpreadsheetApp.newDataValidation().requireValueInList(['TRUE', 'FALSE'], true).setAllowInvalid(false).build();
      sh.getRange(2, i + 1, filas, 1).setDataValidation(r);
    }
  });
  if (sh.getBandings().length === 0) sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  if (HOJAS_INTERNAS.indexOf(nombre) !== -1 && sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
    sh.protect().setWarningOnly(true).setDescription('Hoja interna de Deejota Finanzas. Edítala solo desde la app.');
  }
}

/** Compara los encabezados de una hoja existente con el esquema. Devuelve null si coincide o está vacía. */
function diferenciasEncabezado(sh, nombre) {
  var e = esq(nombre);
  if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) return null;
  var enc = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), e.ncols)).getValues()[0].map(String);
  var vacia = enc.every(function (x) { return x === ''; });
  if (vacia) return null;
  var faltan = [], sobran = [];
  var esperados = encabezadosDe(nombre);
  esperados.forEach(function (x) { if (enc.indexOf(x) === -1) faltan.push(x); });
  enc.forEach(function (x) { if (x !== '' && esperados.indexOf(x) === -1) sobran.push(x); });
  var mismoOrden = esperados.every(function (x, i) { return enc[i] === x; });
  if (mismoOrden && sobran.length === 0) return null;
  return { hoja: nombre, faltan: faltan, sobran: sobran, mismoOrden: mismoOrden };
}

function sembrarCatalogo() {
  var t = ahoraIso();
  var medios = CATALOGO_INICIAL.medios;
  var ordMedios = ordenarOtrosAlFinal(medios, function (m) { return m.nombre; });
  insertar('medios_pago', ordMedios.map(function (m, i) {
    return { id: uuid(), nombre: m.nombre, tipo: m.tipo, icono: m.icono, color: m.color, orden: i + 1, activo: true, creado_en: t, actualizado_en: t, version: 1 };
  }));
  var ambitos = CATALOGO_INICIAL.ambitos.map(function (a, i) {
    return { id: uuid(), nombre: a.nombre, icono: a.icono, color: a.color, orden: i + 1, activo: true, creado_en: t, actualizado_en: t, version: 1 };
  });
  insertar('ambitos', ambitos);
  // Categorías globales (únicas por nombre) y sus subcategorías (unión de los ámbitos)
  var catPorNombre = {}, catOrden = [], subsPorCat = {};
  CATALOGO_INICIAL.ambitos.forEach(function (a) {
    a.categorias.forEach(function (c) {
      if (!catPorNombre[c.nombre]) { catPorNombre[c.nombre] = true; catOrden.push(c.nombre); subsPorCat[c.nombre] = []; }
      c.subcategorias.forEach(function (s) { if (subsPorCat[c.nombre].indexOf(s) === -1) subsPorCat[c.nombre].push(s); });
    });
  });
  var cats = catOrden.map(function (nombre) {
    var ap = CATALOGO_INICIAL.categorias[nombre];
    return { id: uuid(), nombre: nombre, icono: ap.icono, color: ap.color, creado_en: t, actualizado_en: t, version: 1 };
  });
  insertar('categorias', cats);
  var catId = {};
  cats.forEach(function (c) { catId[c.nombre] = c.id; });
  var subs = [], subId = {};
  catOrden.forEach(function (cn) {
    ordenarOtrosAlFinal(subsPorCat[cn], function (s) { return s; }).forEach(function (sn, i) {
      var o = { id: uuid(), categoria_id: catId[cn], nombre: sn, icono: CATALOGO_INICIAL.subcategorias_icono[sn] || 'tag', orden: i + 1, activo: true, creado_en: t, actualizado_en: t, version: 1 };
      subs.push(o);
      subId[cn + '|' + sn] = o.id;
    });
  });
  insertar('subcategorias', subs);
  var ac = [], asub = [];
  CATALOGO_INICIAL.ambitos.forEach(function (a, ai) {
    var ordenadas = ordenarOtrosAlFinal(a.categorias, function (c) { return c.nombre; });
    ordenadas.forEach(function (c, ci) {
      ac.push({ id: uuid(), ambito_id: ambitos[ai].id, categoria_id: catId[c.nombre], orden: ci + 1, activo: true });
      // Subcategorías de la categoría que este ámbito NO lista → desactivadas solo en este ámbito
      subsPorCat[c.nombre].forEach(function (sn) {
        if (c.subcategorias.indexOf(sn) === -1) asub.push({ id: uuid(), ambito_id: ambitos[ai].id, subcategoria_id: subId[c.nombre + '|' + sn], activo: false });
      });
    });
  });
  insertar('ambito_categoria', ac);
  insertar('ambito_subcategoria', asub);
}

/** Instalador idempotente. Se puede ejecutar desde el editor o desde la web (acción `setup`). */
function setup() {
  var propio = !CTX;
  if (propio) nuevoCtx('setup');
  var ss = libro(true);
  var props = PropertiesService.getScriptProperties();
  var reporte = { version: VERSION, libro_url: ss.getUrl ? ss.getUrl() : '', libro_creado: !!CTX.libroCreado, hojas_creadas: [], hojas_existentes: [], semilla_catalogo: false, token_nuevo: false, avisos: [] };
  var nombres = Object.keys(ESQUEMAS_DEF);
  // 1) Nada se modifica si alguna hoja existente tiene encabezados distintos.
  var problemas = [];
  nombres.forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (!sh) return;
    var d = diferenciasEncabezado(sh, n);
    if (d) problemas.push(d);
  });
  if (problemas.length) {
    var msg = problemas.map(function (d) {
      return '"' + d.hoja + '": ' + (d.faltan.length ? 'faltan ' + d.faltan.join(', ') : '') + (d.sobran.length ? (d.faltan.length ? '; ' : '') + 'sobran ' + d.sobran.join(', ') : '') + (!d.faltan.length && !d.sobran.length ? 'las columnas están en otro orden' : '');
    }).join(' | ');
    fallar('SCHEMA', 'setup se detuvo sin modificar nada. Hojas con encabezados distintos: ' + msg + '. Renombra esas hojas o corrígelas y vuelve a ejecutar.', undefined, { problemas: problemas });
  }
  // 2) Crear y formatear
  nombres.forEach(function (n) {
    var sh = ss.getSheetByName(n);
    var nueva = false;
    if (!sh) { sh = ss.insertSheet(n); nueva = true; }
    var vacia = sh.getLastRow() === 0;
    formatearHoja(sh, n, nueva || vacia);
    (nueva ? reporte.hojas_creadas : reporte.hojas_existentes).push(n);
  });
  // 3) Quitar la hoja inicial vacía si la hay
  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() <= 1 && sh.getLastColumn() <= 1 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  CTX.hojas = {}; CTX.t = {}; CTX.indices = {};
  // 4) Metadatos, configuración y catálogo (una sola vez)
  var t = ahoraIso();
  if (!metaGet('instalado_en')) metaSet('instalado_en', t);
  metaSet('version_esquema', SCHEMA_VERSION);
  metaSet('version_backend', VERSION);
  if (!metaGet('generacion')) metaSet('generacion', uuid());
  var cfgExistente = {};
  leerTodo('config').forEach(function (r) { cfgExistente[r.clave] = true; });
  var nuevas = [];
  Object.keys(CONFIG_DEFECTO).forEach(function (k) {
    if (!cfgExistente[k]) nuevas.push({ clave: k, valor: k === 'desc_excepciones' ? EXCEPCIONES_DESCRIPCION_DEFECTO.join(',') : CONFIG_DEFECTO[k], actualizado_en: t });
  });
  insertar('config', nuevas);
  if (metaGet('seed_catalogo') !== '1') {
    sembrarCatalogo();
    metaSet('seed_catalogo', '1');
    reporte.semilla_catalogo = true;
  }
  // 5) Token
  if (!props.getProperty('TOKEN')) {
    var tk = tokenAleatorio(40);
    props.setProperty('TOKEN', tk);
    reporte.token_nuevo = true;
    reporte.token = tk; // solo se devuelve cuando se crea
    console.log('TOKEN DE ACCESO (guárdalo, no se vuelve a mostrar con setup): ' + tk);
  }
  console.log('HOJA DE CÁLCULO: ' + (ss.getUrl ? ss.getUrl() : ss.getId()));
  props.setProperty('SHEET_ID', ss.getId());
  nuevaGeneracion();
  if (propio) CTX = null;
  return reporte;
}

/** Utilidad del editor: muestra de nuevo el token en el registro. */
function mostrarToken() {
  var tk = PropertiesService.getScriptProperties().getProperty('TOKEN');
  console.log(tk ? 'TOKEN: ' + tk : 'Aún no hay token. Ejecuta setup().');
  return tk || '';
}

/* ================================ 8. LECTURA ================================ */
function plano(arr) {
  return arr.map(function (o) { var c = {}; Object.keys(o).forEach(function (k) { c[k] = o[k]; }); return c; });
}

function cacheBootstrapLeer(gen) {
  var c = cacheSegura();
  var n = c.get('bs:' + gen + ':n');
  if (!n) return null;
  var b64 = '';
  for (var i = 0; i < +n; i++) {
    var p = c.get('bs:' + gen + ':' + i);
    if (p === null || p === undefined) return null;
    b64 += p;
  }
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip');
    return JSON.parse(Utilities.ungzip(blob).getDataAsString());
  } catch (e) { return null; }
}
function cacheBootstrapGuardar(gen, data) {
  try {
    var gz = Utilities.gzip(Utilities.newBlob(JSON.stringify(data), 'application/json'));
    var b64 = Utilities.base64Encode(gz.getBytes());
    var n = Math.ceil(b64.length / TROZO_CACHE);
    if (n > 9) return; // no cabe en CacheService: se leerá de la hoja
    var pares = {};
    for (var i = 0; i < n; i++) pares['bs:' + gen + ':' + i] = b64.substr(i * TROZO_CACHE, TROZO_CACHE);
    pares['bs:' + gen + ':n'] = String(n);
    cacheSegura().putAll(pares, TTL_BOOTSTRAP);
  } catch (e) { /* la caché es opcional */ }
}

function accionBootstrap(p) {
  var gen = generacion();
  var data = !p.fresh ? cacheBootstrapLeer(gen) : null;
  var desdeCache = !!data;
  if (!data) {
    data = { hojas: {}, config: cfg(), esquema: SCHEMA_VERSION };
    HOJAS_BOOTSTRAP.forEach(function (h) { data.hojas[h] = plano(leerTodo(h)); });
    cacheBootstrapGuardar(gen, data);
  }
  data.version_backend = VERSION;
  data.generacion = gen;
  data.hoy = hoyNegocio(); // nunca desde la caché
  data.zona_horaria = cfg().zona_horaria;
  data.desde_cache = desdeCache;
  data.ahora = ahoraIso();
  return data;
}

function accionCambios(p) {
  var gen = generacion();
  if (p.generacion && p.generacion === gen) return { sin_cambios: true, generacion: gen, ahora: ahoraIso() };
  var desde = typeof p.desde === 'string' ? p.desde : '';
  if (!desde) return { completo: true, generacion: gen, ahora: ahoraIso(), motivo: 'Sin referencia previa: usa bootstrap.' };
  var out = { sin_cambios: false, completo: false, generacion: gen, ahora: ahoraIso(), hojas: {}, eliminados: [] };
  HOJAS_BOOTSTRAP.forEach(function (h) {
    var modo = DELTA[h];
    if (modo === 'todo') { out.hojas[h] = plano(leerTodo(h)); return; }
    var col = esq(h).idx[modo];
    var vals = leerColumna(h, modo);
    var filas = [];
    for (var i = 0; i < vals.length; i++) if (String(vals[i]) >= desde) filas.push(i + 2);
    if (!filas.length) { out.hojas[h] = []; return; }
    var e = esq(h), sh = hoja(h);
    if (filas.length <= 25 && !CTX.t[h]) {
      out.hojas[h] = filas.map(function (f) { return plano([aObjeto(e, sh.getRange(f, 1, 1, e.ncols).getValues()[0], f)])[0]; });
    } else {
      out.hojas[h] = plano(leerTodo(h).filter(function (o) { return String(o[modo]) >= desde; }));
    }
    void col;
  });
  // Eliminaciones: se leen de la cola de auditoría
  var sh = hoja('auditoria'), e2 = esq('auditoria');
  var ult = sh.getLastRow();
  var ventana = 500;
  var ini = Math.max(2, ult - ventana + 1);
  if (ult >= 2) {
    var filasAud = sh.getRange(ini, 1, ult - ini + 1, e2.ncols).getValues().map(function (f, i) { return aObjeto(e2, f, ini + i); });
    if (ini > 2 && filasAud.length && String(filasAud[0].fecha_hora) > desde) out.completo = true; // se pudo perder alguna baja
    filasAud.forEach(function (a) {
      if (String(a.fecha_hora) >= desde && /\.(eliminar|quitar|borrar|desvincular)/.test(a.accion) && a.despues_json === null) {
        out.eliminados.push({ entidad: a.entidad, entidad_id: a.entidad_id });
      }
    });
  }
  return out;
}

/* =============================== 9. MOVIMIENTOS =============================== */
function precargar(lista) { lista.forEach(function (h) { leerTodo(h); }); }

function subActivaEnAmbito(subId, ambitoId) {
  var rows = leerTodo('ambito_subcategoria');
  for (var i = 0; i < rows.length; i++) if (rows[i].ambito_id === ambitoId && rows[i].subcategoria_id === subId) return rows[i].activo === true;
  return true; // sin fila = hereda el estado global
}
function subcategoriasEfectivas(categoriaId, ambitoId) {
  return leerTodo('subcategorias').filter(function (s) {
    return s.categoria_id === categoriaId && s.activo === true && subActivaEnAmbito(s.id, ambitoId);
  });
}

/** Valida ámbito → categoría → subcategoría (jerarquía, pertenencia y estado efectivo). */
function validarClasificacion(p, orig) {
  precargar(['ambitos', 'categorias', 'ambito_categoria', 'subcategorias', 'ambito_subcategoria']);
  orig = orig || {};
  var ambito = exigirRef('ambitos', vId(p, 'ambito_id', { req: true }), 'ambito_id', 'el ámbito', orig.ambito_id);
  var catId = vId(p, 'categoria_id', { req: true });
  var cat = buscarPorId('categorias', catId);
  if (!cat) invalido('categoria_id', 'La categoría ya no existe.');
  var vinc = leerTodo('ambito_categoria').filter(function (r) { return r.ambito_id === ambito.id && r.categoria_id === cat.id; })[0];
  if (!vinc) invalido('categoria_id', 'La categoría "' + cat.nombre + '" no pertenece al ámbito "' + ambito.nombre + '".');
  if (!vinc.activo && !(orig.categoria_id === cat.id && orig.ambito_id === ambito.id)) invalido('categoria_id', 'La categoría "' + cat.nombre + '" está inactiva en "' + ambito.nombre + '".');
  var subId = vId(p, 'subcategoria_id');
  var efectivas = subcategoriasEfectivas(cat.id, ambito.id);
  var sub = null;
  if (subId) {
    sub = leerTodo('subcategorias').filter(function (s) { return s.id === subId; })[0];
    if (!sub || sub.categoria_id !== cat.id) invalido('subcategoria_id', 'La subcategoría no pertenece a "' + cat.nombre + '".');
    var activaEf = sub.activo === true && subActivaEnAmbito(sub.id, ambito.id);
    if (!activaEf && !(orig.subcategoria_id === sub.id && orig.ambito_id === ambito.id)) invalido('subcategoria_id', 'La subcategoría "' + sub.nombre + '" está inactiva.');
  } else if (efectivas.length) {
    invalido('subcategoria_id', 'Elige una subcategoría de "' + cat.nombre + '".');
  }
  return { ambito: ambito, categoria: cat, subcategoria: sub };
}

function construirMovimiento(p, orig) {
  var clas = validarClasificacion(p, orig);
  var o = orig || {};
  var monto = vNumero(p, 'monto', { req: true, positivo: true, etiqueta: 'el monto' });
  var moneda = vMoneda(p, 'moneda');
  var medio = exigirRef('medios_pago', vId(p, 'medio_pago_id', { req: true }), 'medio_pago_id', 'el medio de pago', o.medio_pago_id);
  var plantillaId = vId(p, 'plantilla_id');
  if (plantillaId && !buscarPorId('plantillas', plantillaId)) invalido('plantilla_id', 'La plantilla ya no existe.');
  var tc, base;
  if (orig && orig.moneda === moneda) { tc = orig.tipo_cambio; } else { tc = tipoCambioDe(moneda); }
  base = redondear2(monto * tc);
  return {
    id: orig ? orig.id : vId(p, 'id', { req: true }),
    fecha: vFecha(p, 'fecha', { req: true, etiqueta: 'la fecha' }),
    monto: monto,
    moneda: moneda,
    tipo_cambio: tc,
    monto_base: base,
    ambito_id: clas.ambito.id,
    categoria_id: clas.categoria.id,
    subcategoria_id: clas.subcategoria ? clas.subcategoria.id : '',
    descripcion: descNorm(vTexto(p, 'descripcion', { max: 200, etiqueta: 'la descripción' })),
    medio_pago_id: medio.id,
    tipo_gasto: vEnum(p, 'tipo_gasto', ENUMS.tipo_gasto, { def: 'variable', etiqueta: 'el tipo de gasto' }),
    es_recurrente: vBool(p, 'es_recurrente', false),
    estado: orig ? orig.estado : 'activo',
    origen: orig ? orig.origen : 'web',
    plantilla_id: plantillaId,
    lote_id: orig ? orig.lote_id : vId(p, 'lote_id'),
    comprobante_url: vUrlHttps(p, 'comprobante_url'),
    notas: vTexto(p, 'notas', { max: 1000, multilinea: true, etiqueta: 'las notas' }),
    creado_en: orig ? orig.creado_en : ahoraIso(),
    actualizado_en: ahoraIso(),
    version: orig ? orig.version + 1 : 1
  };
}

function accionMovimientoGuardar(p) {
  var id = vId(p, 'id', { req: true });
  var orig = buscarPorId('movimientos', id);
  if (orig && (p.version === undefined || p.version === null)) {
    return { movimiento: copia(orig), existente: true }; // reintento de un alta ya aplicada
  }
  if (orig) {
    exigirVersion(orig, p.version);
    if (orig.estado === 'anulado') invalido('id', 'Restaura el movimiento antes de editarlo.');
    var nuevo = construirMovimiento(p, orig);
    Object.defineProperty(nuevo, '_fila', { value: orig._fila, enumerable: false, writable: true, configurable: true });
    actualizar('movimientos', nuevo);
    auditar('movimiento.editar', 'movimientos', id, copia(orig), nuevo);
    return { movimiento: nuevo };
  }
  var mov = construirMovimiento(p, null);
  var origenPedido = vEnum(p, 'origen', ['web', 'prueba'], { def: 'web' });
  mov.origen = origenPedido;
  var comp = null;
  var compId = vId(p, 'compromiso_id');
  if (compId) { comp = buscarPorId('compromisos', compId); if (!comp) invalido('compromiso_id', 'El compromiso ya no existe.'); }
  insertar('movimientos', [mov]);
  auditar('movimiento.crear', 'movimientos', id, null, mov);
  var avisos = [];
  if (comp) vincularPago(comp, mov);
  return { movimiento: mov, avisos: avisos };
}

function cambiarEstadoMov(p, estado) {
  var id = vId(p, 'id', { req: true });
  var orig = buscarPorId('movimientos', id);
  if (!orig) fallar('NOT_FOUND', 'El movimiento no existe.', 'id');
  if (p.version !== undefined && p.version !== null) exigirVersion(orig, p.version);
  if (orig.estado === estado) return { movimiento: copia(orig), sin_cambios: true };
  var antes = copia(orig);
  orig.estado = estado;
  tocar(orig);
  actualizar('movimientos', orig);
  auditar(estado === 'anulado' ? 'movimiento.anular' : 'movimiento.restaurar', 'movimientos', id, antes, orig);
  return { movimiento: orig };
}
function accionMovimientoAnular(p) { return cambiarEstadoMov(p, 'anulado'); }
function accionMovimientoRestaurar(p) { return cambiarEstadoMov(p, 'activo'); }

function accionMovimientosLote(p) {
  var loteId = vId(p, 'lote_id', { req: true });
  if (!Array.isArray(p.items) || p.items.length === 0) invalido('items', 'Elige al menos un gasto.');
  if (p.items.length > MAX_LOTE) invalido('items', 'Un lote admite como máximo ' + MAX_LOTE + ' gastos.');
  var yaLote = leerColumna('movimientos', 'lote_id');
  var existentes = [];
  if (yaLote.indexOf(loteId) !== -1) {
    var todosIds = leerColumna('movimientos', 'id');
    for (var i = 0; i < yaLote.length; i++) if (yaLote[i] === loteId) existentes.push(todosIds[i]);
    return { lote_id: loteId, creados: 0, existente: true, ids: existentes };
  }
  var idsExistentes = {};
  leerColumna('movimientos', 'id').forEach(function (x) { idsExistentes[x] = true; });
  precargar(['ambitos', 'categorias', 'ambito_categoria', 'subcategorias', 'ambito_subcategoria', 'medios_pago', 'plantillas', 'compromisos']);
  var vistos = {}, nuevos = [], enlaces = [];
  p.items.forEach(function (it, n) {
    try {
      if (!esObjeto(it)) invalido('items', 'El gasto ' + (n + 1) + ' no es válido.');
      var id = vId(it, 'id', { req: true });
      if (vistos[id] || idsExistentes[id]) invalido('id', 'El gasto ' + (n + 1) + ' repite un identificador.');
      vistos[id] = true;
      var item = {};
      Object.keys(it).forEach(function (k) { item[k] = it[k]; });
      item.lote_id = loteId;
      var mov = construirMovimiento(item, null);
      mov.origen = 'lote';
      mov.lote_id = loteId;
      nuevos.push(mov);
      var compId = vId(it, 'compromiso_id');
      if (compId) {
        var comp = buscarPorId('compromisos', compId);
        if (!comp) invalido('compromiso_id', 'El compromiso ya no existe.');
        enlaces.push({ comp: comp, mov: mov });
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION') {
        throw new ApiError('VALIDATION', 'Gasto ' + (n + 1) + ': ' + err.message, 'items[' + n + '].' + (err.campo || ''), { indice: n });
      }
      throw err;
    }
  });
  // Todo o nada: solo se escribe si TODOS los gastos son válidos
  insertar('movimientos', nuevos);
  enlaces.forEach(function (e) { vincularPago(e.comp, e.mov); });
  auditar('movimientos.lote', 'movimientos', loteId, null, { cantidad: nuevos.length, ids: nuevos.map(function (m) { return m.id; }) });
  return { lote_id: loteId, creados: nuevos.length, ids: nuevos.map(function (m) { return m.id; }) };
}

function accionMovimientosEstadoLote(p) {
  var loteId = vId(p, 'lote_id', { req: true });
  var lotes = leerColumna('movimientos', 'lote_id');
  var ids = leerColumna('movimientos', 'id');
  var out = [];
  for (var i = 0; i < lotes.length; i++) if (lotes[i] === loteId) out.push(ids[i]);
  return { lote_id: loteId, cantidad: out.length, ids: out };
}

/** Actualiza varias filas agrupando las contiguas en un solo setValues. */
function actualizarVarios(nombre, objs) {
  if (!objs.length) return;
  var e = esq(nombre), sh = hoja(nombre);
  var orden = objs.slice().sort(function (a, b) { return a._fila - b._fila; });
  if (CTX.op) {
    var previas = [];
    var x = 0;
    while (x < orden.length) {
      var y = x;
      while (y + 1 < orden.length && orden[y + 1]._fila === orden[y]._fila + 1) y++;
      var vals = sh.getRange(orden[x]._fila, 1, y - x + 1, e.ncols).getValues();
      for (var q = 0; q < vals.length; q++) previas.push({ f: orden[x]._fila + q, v: serializarFila(vals[q]) });
      x = y + 1;
    }
    diarioRegistrar({ k: 'a', h: nombre, filas: previas });
  }
  var i = 0;
  while (i < orden.length) {
    var j = i;
    while (j + 1 < orden.length && orden[j + 1]._fila === orden[j]._fila + 1) j++;
    var bloque = orden.slice(i, j + 1).map(function (o) { return aFila(e, o); });
    sh.getRange(orden[i]._fila, 1, bloque.length, e.ncols).setValues(bloque);
    i = j + 1;
  }
  CTX.escribio = true;
}

/** Acciones masivas sobre movimientos existentes: todo o nada. */
function accionMovimientosAccionLote(p) {
  var accion = vEnum(p, 'accion', ['anular', 'restaurar', 'categoria', 'medio'], { req: true, etiqueta: 'la acción' });
  var ids = vIdLista(p, 'ids', { req: true, max: 500 });
  if (!ids.length) invalido('ids', 'Selecciona al menos un movimiento.');
  var todos = leerTodo('movimientos');
  var mapa = {};
  todos.forEach(function (m) { mapa[m.id] = m; });
  var objetivo = ids.map(function (id) {
    if (!mapa[id]) fallar('NOT_FOUND', 'Uno de los movimientos ya no existe.', 'ids');
    return mapa[id];
  });
  var antes = objetivo.map(copia);
  var cambiados = [];
  if (accion === 'anular' || accion === 'restaurar') {
    var meta = accion === 'anular' ? 'anulado' : 'activo';
    objetivo.forEach(function (m) { if (m.estado !== meta) { m.estado = meta; cambiados.push(m); } });
  } else if (accion === 'medio') {
    var medio = exigirRef('medios_pago', vId(p, 'medio_pago_id', { req: true }), 'medio_pago_id', 'el medio de pago');
    objetivo.forEach(function (m) {
      if (m.estado === 'anulado') invalido('ids', 'Hay movimientos anulados en la selección. Restáuralos primero.');
      if (m.medio_pago_id !== medio.id) { m.medio_pago_id = medio.id; cambiados.push(m); }
    });
  } else {
    objetivo.forEach(function (m) {
      if (m.estado === 'anulado') invalido('ids', 'Hay movimientos anulados en la selección. Restáuralos primero.');
      var datos = { ambito_id: p.ambito_id || m.ambito_id, categoria_id: p.categoria_id, subcategoria_id: p.subcategoria_id };
      var clas = validarClasificacion(datos, m);
      var nuevoAmb = clas.ambito.id, nuevaCat = clas.categoria.id, nuevaSub = clas.subcategoria ? clas.subcategoria.id : '';
      if (m.ambito_id !== nuevoAmb || m.categoria_id !== nuevaCat || m.subcategoria_id !== nuevaSub) {
        m.ambito_id = nuevoAmb; m.categoria_id = nuevaCat; m.subcategoria_id = nuevaSub; cambiados.push(m);
      }
    });
  }
  cambiados.forEach(tocar);
  actualizarVarios('movimientos', cambiados);
  auditar('movimientos.accionLote', 'movimientos', '', { ids: ids, accion: accion }, { cambiados: cambiados.length });
  void antes;
  return { accion: accion, solicitados: ids.length, cambiados: cambiados.length, movimientos: plano(cambiados) };
}

function accionMovimientosReordenar(p) {
  if (!Array.isArray(p.items) || !p.items.length) invalido('items', 'No hay nada que reordenar.');
  if (p.items.length > 1000) invalido('items', 'Demasiados elementos para reordenar a la vez.');
  var existentes = {};
  leerColumna('movimientos', 'id').forEach(function (x) { existentes[x] = true; });
  var filas = leerTodo('orden_movimientos');
  var mapa = {};
  filas.forEach(function (f) { mapa[f.movimiento_id] = f; });
  var nuevos = [], cambios = [];
  p.items.forEach(function (it) {
    var id = vId(it, 'movimiento_id', { req: true });
    var orden = vEntero(it, 'orden', { req: true, min: 0, max: 1000000 });
    if (!existentes[id]) invalido('movimiento_id', 'Un movimiento ya no existe.');
    if (mapa[id]) { if (mapa[id].orden !== orden) { mapa[id].orden = orden; cambios.push(mapa[id]); } }
    else { var f = { movimiento_id: id, orden: orden }; mapa[id] = f; nuevos.push(f); }
  });
  actualizarVarios('orden_movimientos', cambios);
  insertar('orden_movimientos', nuevos);
  auditar('movimientos.reordenar', 'orden_movimientos', '', null, { elementos: p.items.length });
  return { actualizados: cambios.length, creados: nuevos.length };
}

/* ================================ 10. CATÁLOGO ================================ */
function hashTexto(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function sugerirApariencia(nombre) {
  var k = String(nombre);
  var cat = CATALOGO_INICIAL.categorias[k];
  var icono = (cat && cat.icono) || CATALOGO_INICIAL.subcategorias_icono[k] || 'tag';
  var color = (cat && cat.color) || PALETA_COLORES[hashTexto(claveNorm(k)) % PALETA_COLORES.length];
  return { icono: icono, color: color };
}

function ordenAlta(hojaNombre, filas, nombre, nombreDe, conMeta) {
  var maxO = maximoPor(filas, function (f) { return f.orden || 0; });
  if (claveNorm(nombre) === 'otros') return maxO + 1;
  var otros = null;
  filas.forEach(function (f) { if (claveNorm(nombreDe(f)) === 'otros') otros = f; });
  if (!otros) return maxO + 1;
  var nuevo = otros.orden;
  otros.orden = maxO + 1;
  if (conMeta) tocar(otros);
  actualizar(hojaNombre, otros);
  return nuevo;
}

/** Reordena un grupo: los ids dados primero (en ese orden), luego el resto; "Otros" siempre al final. */
function reordenarGrupo(hojaNombre, filasGrupo, ids, nombreDe, conMeta) {
  var porId = {};
  filasGrupo.forEach(function (f) { porId[f[esq(hojaNombre).clave]] = f; });
  ids.forEach(function (id) { if (!porId[id]) invalido('ids', 'Un elemento de la lista ya no existe o no pertenece a este grupo.'); });
  var listados = ids.map(function (id) { return porId[id]; });
  var resto = filasGrupo.filter(function (f) { return ids.indexOf(f[esq(hojaNombre).clave]) === -1; })
    .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
  var ord = ordenarOtrosAlFinal(listados.concat(resto), nombreDe);
  var cambiados = [];
  ord.forEach(function (f, i) {
    if (f.orden !== i + 1) { f.orden = i + 1; if (conMeta) tocar(f); cambiados.push(f); }
  });
  actualizarVarios(hojaNombre, cambiados);
  auditar(hojaNombre + '.reordenar', hojaNombre, '', null, { elementos: ord.length });
  return ord.map(function (f) { return f[esq(hojaNombre).clave]; });
}

function accionAmbitoGuardar(p) {
  var id = vId(p, 'id', { req: true });
  var orig = buscarPorId('ambitos', id);
  var nombre = vTexto(p, 'nombre', { req: true, max: 40, etiqueta: 'el nombre del ámbito' });
  nombreUnico('ambitos', nombre, id);
  var icono = vIcono(p, 'icono', orig ? orig.icono : 'folder');
  var color = vColor(p, 'color', orig ? orig.color : COLOR_MARCA);
  var activo = vBool(p, 'activo', orig ? orig.activo : true);
  if (orig) {
    exigirVersion(orig, p.version);
    var antes = copia(orig);
    orig.nombre = nombre; orig.icono = icono; orig.color = color; orig.activo = activo;
    tocar(orig);
    actualizar('ambitos', orig);
    auditar('ambito.guardar', 'ambitos', id, antes, orig);
    return { ambito: orig };
  }
  var filas = leerTodo('ambitos');
  var o = { id: id, nombre: nombre, icono: icono, color: color, orden: maximoPor(filas, function (f) { return f.orden || 0; }) + 1, activo: activo };
  var m = metaNueva();
  o.creado_en = m.creado_en; o.actualizado_en = m.actualizado_en; o.version = m.version;
  insertar('ambitos', [o]);
  auditar('ambito.guardar', 'ambitos', id, null, o);
  return { ambito: o };
}
function accionAmbitoReordenar(p) {
  var ids = vIdLista(p, 'ids', { req: true, max: 100 });
  return { orden: reordenarGrupo('ambitos', leerTodo('ambitos'), ids, function (f) { return f.nombre; }, true) };
}

function accionCategoriaGuardar(p) {
  precargar(['ambitos', 'categorias', 'ambito_categoria']);
  var id = vId(p, 'id', { req: true });
  var orig = buscarPorId('categorias', id);
  var nombre = vTexto(p, 'nombre', { req: true, max: 40, etiqueta: 'el nombre de la categoría' });
  nombreUnico('categorias', nombre, id);
  var sug = sugerirApariencia(nombre);
  var icono = vIcono(p, 'icono', orig ? orig.icono : sug.icono);
  var color = vColor(p, 'color', orig ? orig.color : sug.color);
  var vinculos = [];
  if (p.vinculos !== undefined && p.vinculos !== null) {
    if (!Array.isArray(p.vinculos)) invalido('vinculos', 'Los ámbitos deben ser una lista.');
    vinculos = p.vinculos;
  }
  if (!orig && vinculos.length === 0) invalido('vinculos', 'Elige al menos un ámbito para la categoría.');
  var cat;
  if (orig) {
    exigirVersion(orig, p.version);
    var antes = copia(orig);
    var cambio = orig.nombre !== nombre || orig.icono !== icono || orig.color !== color;
    orig.nombre = nombre; orig.icono = icono; orig.color = color;
    if (cambio) { tocar(orig); actualizar('categorias', orig); auditar('categoria.guardar', 'categorias', id, antes, orig); }
    cat = orig;
  } else {
    var m = metaNueva();
    cat = { id: id, nombre: nombre, icono: icono, color: color, creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: m.version };
    insertar('categorias', [cat]);
    auditar('categoria.guardar', 'categorias', id, null, cat);
  }
  var catPorId = {};
  leerTodo('categorias').forEach(function (c) { catPorId[c.id] = c; });
  var nombreDeVinc = function (f) { return catPorId[f.categoria_id] ? catPorId[f.categoria_id].nombre : ''; };
  var vincRes = [];
  vinculos.forEach(function (v) {
    if (!esObjeto(v)) invalido('vinculos', 'Un ámbito de la lista no es válido.');
    var ambId = vId(v, 'ambito_id', { req: true });
    if (!buscarPorId('ambitos', ambId)) invalido('vinculos', 'Un ámbito ya no existe.');
    var activo = vBool(v, 'activo', true);
    var filasAmb = leerTodo('ambito_categoria').filter(function (r) { return r.ambito_id === ambId; });
    var existente = filasAmb.filter(function (r) { return r.categoria_id === cat.id; })[0];
    if (existente) {
      if (existente.activo !== activo) { existente.activo = activo; actualizar('ambito_categoria', existente); auditar('categoria.vincular', 'ambito_categoria', existente.id, null, existente); }
      vincRes.push(existente);
    } else {
      var fila = { id: uuid(), ambito_id: ambId, categoria_id: cat.id, orden: 0, activo: activo };
      fila.orden = ordenAlta('ambito_categoria', filasAmb, cat.nombre, nombreDeVinc, false);
      insertar('ambito_categoria', [fila]);
      auditar('categoria.vincular', 'ambito_categoria', fila.id, null, fila);
      vincRes.push(fila);
    }
  });
  var quitar = vIdLista(p, 'quitar_ambito_ids');
  if (quitar.length) {
    var movCat = leerColumna('movimientos', 'categoria_id'), movAmb = leerColumna('movimientos', 'ambito_id');
    quitar.forEach(function (ambId) {
      for (var i = 0; i < movCat.length; i++) if (movCat[i] === cat.id && movAmb[i] === ambId) invalido('quitar_ambito_ids', 'Hay movimientos con esta categoría en ese ámbito. Desactívala en su lugar.');
    });
    var aBorrar = leerTodo('ambito_categoria').filter(function (r) { return r.categoria_id === cat.id && quitar.indexOf(r.ambito_id) !== -1; });
    aBorrar.forEach(function (r) { auditar('categoria.desvincular', 'ambito_categoria', r.id, copia(r), null); });
    borrarFilas('ambito_categoria', aBorrar);
  }
  return { categoria: cat, vinculos: leerTodo('ambito_categoria').filter(function (r) { return r.categoria_id === cat.id; }) };
}
function accionCategoriaReordenar(p) {
  precargar(['categorias', 'ambito_categoria']);
  var ambId = vId(p, 'ambito_id', { req: true });
  var ids = vIdLista(p, 'ids', { req: true, max: 200 });
  var catPorId = {};
  leerTodo('categorias').forEach(function (c) { catPorId[c.id] = c; });
  var filas = leerTodo('ambito_categoria').filter(function (r) { return r.ambito_id === ambId; });
  var porCat = {};
  filas.forEach(function (r) { porCat[r.categoria_id] = r; });
  var idsFilas = ids.map(function (cid) { if (!porCat[cid]) invalido('ids', 'Una categoría no pertenece a este ámbito.'); return porCat[cid].id; });
  var orden = reordenarGrupo('ambito_categoria', filas, idsFilas, function (f) { return catPorId[f.categoria_id] ? catPorId[f.categoria_id].nombre : ''; }, false);
  return { orden: orden.map(function (rid) { return filas.filter(function (f) { return f.id === rid; })[0].categoria_id; }) };
}

function accionSubcategoriaGuardar(p) {
  precargar(['categorias', 'subcategorias', 'ambitos', 'ambito_subcategoria']);
  var id = vId(p, 'id', { req: true });
  var orig = buscarPorId('subcategorias', id);
  var catId = vId(p, 'categoria_id', { req: true });
  if (orig && orig.categoria_id !== catId) invalido('categoria_id', 'No se puede mover una subcategoría a otra categoría. Crea una nueva.');
  var cat = buscarPorId('categorias', catId);
  if (!cat) invalido('categoria_id', 'La categoría ya no existe.');
  var nombre = vTexto(p, 'nombre', { req: true, max: 40, etiqueta: 'el nombre de la subcategoría' });
  nombreUnico('subcategorias', nombre, id, function (r) { return r.categoria_id === catId; });
  var sug = sugerirApariencia(nombre);
  var icono = vIcono(p, 'icono', orig ? orig.icono : sug.icono);
  var activo = vBool(p, 'activo', orig ? orig.activo : true);
  var sub;
  if (orig) {
    exigirVersion(orig, p.version);
    var antes = copia(orig);
    orig.nombre = nombre; orig.icono = icono; orig.activo = activo;
    tocar(orig);
    actualizar('subcategorias', orig);
    auditar('subcategoria.guardar', 'subcategorias', id, antes, orig);
    sub = orig;
  } else {
    var hermanas = leerTodo('subcategorias').filter(function (s) { return s.categoria_id === catId; });
    var m = metaNueva();
    sub = { id: id, categoria_id: catId, nombre: nombre, icono: icono, orden: 0, activo: activo, creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: m.version };
    sub.orden = ordenAlta('subcategorias', hermanas, nombre, function (f) { return f.nombre; }, true);
    insertar('subcategorias', [sub]);
    auditar('subcategoria.guardar', 'subcategorias', id, null, sub);
  }
  if (p.ambitos !== undefined && p.ambitos !== null) {
    if (!Array.isArray(p.ambitos)) invalido('ambitos', 'Los ámbitos deben ser una lista.');
    p.ambitos.forEach(function (a) {
      if (!esObjeto(a)) invalido('ambitos', 'Un ámbito de la lista no es válido.');
      var ambId = vId(a, 'ambito_id', { req: true });
      if (!buscarPorId('ambitos', ambId)) invalido('ambitos', 'Un ámbito ya no existe.');
      var act = vBool(a, 'activo', true);
      var fila = leerTodo('ambito_subcategoria').filter(function (r) { return r.ambito_id === ambId && r.subcategoria_id === sub.id; })[0];
      if (fila) { if (fila.activo !== act) { fila.activo = act; actualizar('ambito_subcategoria', fila); auditar('subcategoria.vincular', 'ambito_subcategoria', fila.id, null, fila); } }
      else if (!act) {
        var nf = { id: uuid(), ambito_id: ambId, subcategoria_id: sub.id, activo: false };
        insertar('ambito_subcategoria', [nf]);
        auditar('subcategoria.vincular', 'ambito_subcategoria', nf.id, null, nf);
      }
    });
  }
  return { subcategoria: sub };
}
function accionSubcategoriaReordenar(p) {
  var catId = vId(p, 'categoria_id', { req: true });
  var ids = vIdLista(p, 'ids', { req: true, max: 200 });
  var filas = leerTodo('subcategorias').filter(function (s) { return s.categoria_id === catId; });
  return { orden: reordenarGrupo('subcategorias', filas, ids, function (f) { return f.nombre; }, true) };
}

function accionMedioGuardar(p) {
  var id = vId(p, 'id', { req: true });
  var orig = buscarPorId('medios_pago', id);
  var nombre = vTexto(p, 'nombre', { req: true, max: 40, etiqueta: 'el nombre del medio de pago' });
  nombreUnico('medios_pago', nombre, id);
  var sug = sugerirApariencia(nombre);
  var tipo = vEnum(p, 'tipo', ENUMS.medio_tipo, { def: orig ? orig.tipo : 'otro', etiqueta: 'el tipo' });
  var icono = vIcono(p, 'icono', orig ? orig.icono : 'wallet');
  var color = vColor(p, 'color', orig ? orig.color : sug.color);
  var activo = vBool(p, 'activo', orig ? orig.activo : true);
  if (orig) {
    exigirVersion(orig, p.version);
    var antes = copia(orig);
    orig.nombre = nombre; orig.tipo = tipo; orig.icono = icono; orig.color = color; orig.activo = activo;
    tocar(orig);
    actualizar('medios_pago', orig);
    auditar('medio.guardar', 'medios_pago', id, antes, orig);
    return { medio: orig };
  }
  var filas = leerTodo('medios_pago');
  var m = metaNueva();
  var o = { id: id, nombre: nombre, tipo: tipo, icono: icono, color: color, orden: 0, activo: activo, creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: m.version };
  o.orden = ordenAlta('medios_pago', filas, nombre, function (f) { return f.nombre; }, true);
  insertar('medios_pago', [o]);
  auditar('medio.guardar', 'medios_pago', id, null, o);
  return { medio: o };
}
function accionMedioReordenar(p) {
  var ids = vIdLista(p, 'ids', { req: true, max: 100 });
  return { orden: reordenarGrupo('medios_pago', leerTodo('medios_pago'), ids, function (f) { return f.nombre; }, true) };
}

/* ---- Eliminación con dependencias ---- */
function contarEnColumna(hojaNombre, col, id) {
  var n = 0;
  leerColumna(hojaNombre, col).forEach(function (v) { if (v === id) n++; });
  return n;
}
function dependenciasDe(tipo, id) {
  var dep = {};
  var claveMov = { categoria: 'categoria_id', subcategoria: 'subcategoria_id', medio: 'medio_pago_id', fuente: null, caja: null }[tipo];
  if (claveMov) dep.movimientos = contarEnColumna('movimientos', claveMov, id);
  var alcance = { categoria: 'categoria', subcategoria: 'subcategoria', medio: 'medio_pago' }[tipo];
  if (alcance) dep.cajas = leerTodo('cajas').filter(function (c) { return c.alcance === alcance && c.alcance_id === id; }).length;
  var campoPlant = { categoria: 'categoria_id', subcategoria: 'subcategoria_id', medio: 'medio_pago_id' }[tipo];
  if (campoPlant) dep.plantillas = leerTodo('plantillas').filter(function (pl) { return pl.datos_json && pl.datos_json[campoPlant] === id; }).length;
  if (tipo === 'medio') dep.fuentes = leerTodo('fuente_medios').filter(function (f) { return f.medio_pago_id === id; }).length;
  var total = 0;
  Object.keys(dep).forEach(function (k) { total += dep[k]; });
  dep._total = total;
  return dep;
}
function exigirConfirmacion(p) {
  if (p.confirmar !== true) invalido('confirmar', 'Confirma la eliminación antes de continuar.');
}

function accionCategoriaEliminar(p) {
  exigirConfirmacion(p);
  precargar(['categorias', 'subcategorias', 'ambito_categoria', 'ambito_subcategoria', 'cajas', 'plantillas']);
  var id = vId(p, 'id', { req: true });
  var cat = buscarPorId('categorias', id);
  if (!cat) fallar('NOT_FOUND', 'La categoría no existe.', 'id');
  var subs = leerTodo('subcategorias').filter(function (s) { return s.categoria_id === id; });
  var dep = dependenciasDe('categoria', id);
  subs.forEach(function (s) {
    var d = dependenciasDe('subcategoria', s.id);
    dep.movimientos += d.movimientos; dep.cajas += d.cajas; dep.plantillas += d.plantillas; dep._total += d._total;
  });
  if (dep._total > 0) return { eliminado: false, motivo: 'en_uso', dependencias: dep, sugerencia: 'desactivar' };
  if (subs.length && p.cascada !== true) return { eliminado: false, motivo: 'tiene_hijos', hijos: subs.length, requiere_cascada: true };
  var subIds = subs.map(function (s) { return s.id; });
  var asub = leerTodo('ambito_subcategoria').filter(function (r) { return subIds.indexOf(r.subcategoria_id) !== -1; });
  var ac = leerTodo('ambito_categoria').filter(function (r) { return r.categoria_id === id; });
  asub.forEach(function (r) { auditar('categoria.eliminar', 'ambito_subcategoria', r.id, copia(r), null); });
  ac.forEach(function (r) { auditar('categoria.eliminar', 'ambito_categoria', r.id, copia(r), null); });
  subs.forEach(function (s) { auditar('categoria.eliminar', 'subcategorias', s.id, copia(s), null); });
  auditar('categoria.eliminar', 'categorias', id, copia(cat), null);
  borrarFilas('ambito_subcategoria', asub);
  borrarFilas('ambito_categoria', ac);
  borrarFilas('subcategorias', subs);
  borrarFilas('categorias', [cat]);
  return { eliminado: true, id: id, subcategorias_eliminadas: subs.length };
}
function accionSubcategoriaEliminar(p) {
  exigirConfirmacion(p);
  precargar(['subcategorias', 'ambito_subcategoria', 'cajas', 'plantillas']);
  var id = vId(p, 'id', { req: true });
  var sub = buscarPorId('subcategorias', id);
  if (!sub) fallar('NOT_FOUND', 'La subcategoría no existe.', 'id');
  var dep = dependenciasDe('subcategoria', id);
  if (dep._total > 0) return { eliminado: false, motivo: 'en_uso', dependencias: dep, sugerencia: 'desactivar' };
  var asub = leerTodo('ambito_subcategoria').filter(function (r) { return r.subcategoria_id === id; });
  asub.forEach(function (r) { auditar('subcategoria.eliminar', 'ambito_subcategoria', r.id, copia(r), null); });
  auditar('subcategoria.eliminar', 'subcategorias', id, copia(sub), null);
  borrarFilas('ambito_subcategoria', asub);
  borrarFilas('subcategorias', [sub]);
  return { eliminado: true, id: id };
}
function accionMedioEliminar(p) {
  exigirConfirmacion(p);
  precargar(['medios_pago', 'fuente_medios', 'cajas', 'plantillas']);
  var id = vId(p, 'id', { req: true });
  var medio = buscarPorId('medios_pago', id);
  if (!medio) fallar('NOT_FOUND', 'El medio de pago no existe.', 'id');
  var dep = dependenciasDe('medio', id);
  if (dep._total > 0) return { eliminado: false, motivo: 'en_uso', dependencias: dep, sugerencia: 'desactivar' };
  auditar('medio.eliminar', 'medios_pago', id, copia(medio), null);
  borrarFilas('medios_pago', [medio]);
  return { eliminado: true, id: id };
}

/* ======================== 11. PRESUPUESTO (FUENTES Y CAJAS) ======================== */
function colorAuto(nombre) { return PALETA_COLORES[hashTexto(claveNorm(nombre)) % PALETA_COLORES.length]; }

function fuenteVigente(f, mes) {
  if (f.recurrencia === 'unica') return mes === f.mes_inicio;
  if (f.mes_inicio && mes < f.mes_inicio) return false;
  if (f.mes_fin && mes > f.mes_fin) return false;
  return true;
}

function upsertMes(hojaMes, clave, entidadId, mes, monto, estado) {
  var fila = leerTodo(hojaMes).filter(function (r) { return r[clave] === entidadId && r.mes === mes; })[0];
  var t = ahoraIso();
  if (fila) {
    var antes = copia(fila);
    fila.monto = monto; fila.estado = estado; fila.actualizado_en = t;
    actualizar(hojaMes, fila);
    auditar(hojaMes + '.guardar', hojaMes, fila.id, antes, fila);
    return fila;
  }
  var nueva = { id: uuid(), mes: mes, monto: monto, estado: estado, actualizado_en: t };
  nueva[clave] = entidadId;
  var ordenada = { id: nueva.id };
  ordenada[clave] = entidadId; ordenada.mes = mes; ordenada.monto = monto; ordenada.estado = estado; ordenada.actualizado_en = t;
  insertar(hojaMes, [ordenada]);
  auditar(hojaMes + '.guardar', hojaMes, ordenada.id, null, ordenada);
  return ordenada;
}

function accionFuenteGuardar(p) {
  precargar(['fuentes', 'fuente_medios', 'medios_pago', 'fuentes_mes']);
  var id = vId(p, 'id', { req: true });
  var orig = buscarPorId('fuentes', id);
  var nombre = vTexto(p, 'nombre', { req: true, max: 60, etiqueta: 'el nombre de la fuente' });
  nombreUnico('fuentes', nombre, id);
  var monto = vNumero(p, 'monto_defecto', { min: 0, def: orig ? orig.monto_defecto : 0, etiqueta: 'el monto por defecto' });
  var moneda = vMoneda(p, 'moneda', orig ? orig.moneda : undefined);
  var recurrencia = vEnum(p, 'recurrencia', ENUMS.recurrencia, { req: true, etiqueta: 'la recurrencia' });
  var mesInicio = vMes(p, 'mes_inicio', { req: true });
  var mesFin = vMes(p, 'mes_fin');
  if (recurrencia === 'unica') mesFin = mesInicio;
  if (mesFin && mesFin < mesInicio) invalido('mes_fin', 'El mes final no puede ser anterior al inicial.');
  var activo = vBool(p, 'activo', orig ? orig.activo : true);
  var principal = vBool(p, 'es_principal', orig ? orig.es_principal : false);
  if (principal && !activo) invalido('es_principal', 'La fuente principal debe estar activa.');
  var medios = p.medios === undefined ? null : vIdLista(p, 'medios', { max: 50 });
  if (medios) medios.forEach(function (mid) { if (!buscarPorId('medios_pago', mid)) invalido('medios', 'Un medio de pago ya no existe.'); });
  var mesAplicar = vMes(p, 'aplicar_mes');
  var f;
  if (orig) {
    exigirVersion(orig, p.version);
    var antes = copia(orig);
    orig.nombre = nombre; orig.monto_defecto = monto; orig.moneda = moneda; orig.recurrencia = recurrencia;
    orig.mes_inicio = mesInicio; orig.mes_fin = mesFin; orig.icono = vIcono(p, 'icono', orig.icono); orig.color = vColor(p, 'color', orig.color);
    orig.activo = activo; orig.es_principal = principal;
    tocar(orig);
    actualizar('fuentes', orig);
    auditar('fuente.guardar', 'fuentes', id, antes, orig);
    f = orig;
  } else {
    var m = metaNueva();
    f = { id: id, nombre: nombre, monto_defecto: monto, moneda: moneda, recurrencia: recurrencia, mes_inicio: mesInicio, mes_fin: mesFin,
      icono: vIcono(p, 'icono', 'wallet'), color: vColor(p, 'color', colorAuto(nombre)),
      orden: maximoPor(leerTodo('fuentes'), function (x) { return x.orden || 0; }) + 1, activo: activo, es_principal: principal,
      creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: m.version };
    insertar('fuentes', [f]);
    auditar('fuente.guardar', 'fuentes', id, null, f);
  }
  if (principal) {
    leerTodo('fuentes').forEach(function (o) {
      if (o.id !== f.id && o.es_principal) { var a = copia(o); o.es_principal = false; tocar(o); actualizar('fuentes', o); auditar('fuente.guardar', 'fuentes', o.id, a, o); }
    });
  }
  if (medios) {
    var actuales = leerTodo('fuente_medios').filter(function (r) { return r.fuente_id === f.id; });
    var quitar = actuales.filter(function (r) { return medios.indexOf(r.medio_pago_id) === -1; });
    quitar.forEach(function (r) { auditar('fuente.guardar', 'fuente_medios', r.id, copia(r), null); });
    borrarFilas('fuente_medios', quitar);
    var restantes = leerTodo('fuente_medios').filter(function (r) { return r.fuente_id === f.id; });
    var nuevos = [];
    medios.forEach(function (mid, i) {
      var ex = restantes.filter(function (r) { return r.medio_pago_id === mid; })[0];
      if (ex) { if (ex.orden !== i + 1) { ex.orden = i + 1; actualizar('fuente_medios', ex); } }
      else nuevos.push({ id: uuid(), fuente_id: f.id, medio_pago_id: mid, orden: i + 1 });
    });
    insertar('fuente_medios', nuevos);
    nuevos.forEach(function (r) { auditar('fuente.guardar', 'fuente_medios', r.id, null, r); });
  }
  var filaMes = null;
  if (mesAplicar) filaMes = aplicarFuenteMes(f, mesAplicar, vNumero(p, 'monto_mes', { min: 0, def: f.monto_defecto }), false);
  return { fuente: f, medios: leerTodo('fuente_medios').filter(function (r) { return r.fuente_id === f.id; }), fuente_mes: filaMes };
}
function accionFuenteReordenar(p) {
  var ids = vIdLista(p, 'ids', { req: true, max: 200 });
  return { orden: reordenarGrupo('fuentes', leerTodo('fuentes'), ids, function (f) { return f.nombre; }, true) };
}
function accionFuenteEliminar(p) {
  exigirConfirmacion(p);
  precargar(['fuentes', 'fuente_medios', 'fuentes_mes', 'plantillas', 'grupos_fondos']);
  var id = vId(p, 'id', { req: true });
  var f = buscarPorId('fuentes', id);
  if (!f) fallar('NOT_FOUND', 'La fuente no existe.', 'id');
  var meses = leerTodo('fuentes_mes').filter(function (r) { return r.fuente_id === id; });
  var fechas = leerColumna('movimientos', 'fecha'), estados = leerColumna('movimientos', 'estado');
  var mesesConGasto = {};
  for (var i = 0; i < fechas.length; i++) if (estados[i] === 'activo') mesesConGasto[String(fechas[i]).slice(0, 7)] = true;
  var aplicadosConGasto = meses.filter(function (r) { return r.estado === 'aplicada' && mesesConGasto[r.mes]; }).length;
  if (aplicadosConGasto > 0) return { eliminado: false, motivo: 'en_uso', dependencias: { meses_con_gastos: aplicadosConGasto }, sugerencia: 'desactivar' };
  var fm = leerTodo('fuente_medios').filter(function (r) { return r.fuente_id === id; });
  fm.forEach(function (r) { auditar('fuente.eliminar', 'fuente_medios', r.id, copia(r), null); });
  meses.forEach(function (r) { auditar('fuente.eliminar', 'fuentes_mes', r.id, copia(r), null); });
  leerTodo('plantillas').forEach(function (pl) {
    if (pl.tipo === 'fuente' && pl.datos_json && pl.datos_json.fuente_id === id && pl.activo) {
      var a = copia(pl); pl.activo = false; tocar(pl); actualizar('plantillas', pl); auditar('plantilla.guardar', 'plantillas', pl.id, a, pl);
    }
  });
  leerTodo('grupos_fondos').forEach(function (g) {
    if (g.fuente_ids_json && g.fuente_ids_json.indexOf(id) !== -1) {
      var a2 = copia(g); g.fuente_ids_json = g.fuente_ids_json.filter(function (x) { return x !== id; }); tocar(g); actualizar('grupos_fondos', g); auditar('grupoFondos.guardar', 'grupos_fondos', g.id, a2, g);
    }
  });
  auditar('fuente.eliminar', 'fuentes', id, copia(f), null);
  borrarFilas('fuente_medios', fm);
  borrarFilas('fuentes_mes', meses);
  borrarFilas('fuentes', [f]);
  return { eliminado: true, id: id };
}

function aplicarFuenteMes(f, mes, monto, desdeEsteMes) {
  if (!f.activo) invalido('fuente_id', 'Activa la fuente "' + f.nombre + '" antes de aplicarla a un mes.');
  if (!fuenteVigente(f, mes)) invalido('mes', 'La fuente "' + f.nombre + '" no está vigente en ' + mes + '.');
  if (desdeEsteMes && f.monto_defecto !== monto) {
    var antes = copia(f);
    f.monto_defecto = monto; tocar(f); actualizar('fuentes', f);
    auditar('fuente.guardar', 'fuentes', f.id, antes, f);
  }
  return upsertMes('fuentes_mes', 'fuente_id', f.id, mes, monto, 'aplicada');
}
function accionFuenteMesAplicar(p) {
  precargar(['fuentes', 'fuentes_mes']);
  var f = exigirRef('fuentes', vId(p, 'fuente_id', { req: true }), 'fuente_id', 'la fuente');
  var mes = vMes(p, 'mes', { req: true });
  var monto = vNumero(p, 'monto', { min: 0, def: f.monto_defecto, etiqueta: 'el monto' });
  var fila = aplicarFuenteMes(f, mes, monto, vBool(p, 'desde_este_mes', false));
  return { fuente_mes: fila, fuente: f };
}
function accionFuenteMesOmitir(p) {
  precargar(['fuentes', 'fuentes_mes']);
  var f = buscarPorId('fuentes', vId(p, 'fuente_id', { req: true }));
  if (!f) invalido('fuente_id', 'La fuente ya no existe.');
  var mes = vMes(p, 'mes', { req: true });
  var ex = leerTodo('fuentes_mes').filter(function (r) { return r.fuente_id === f.id && r.mes === mes; })[0];
  return { fuente_mes: upsertMes('fuentes_mes', 'fuente_id', f.id, mes, ex ? ex.monto : f.monto_defecto, 'omitida') };
}
function accionFuenteMesQuitar(p) {
  precargar(['fuentes_mes']);
  var fid = vId(p, 'fuente_id', { req: true });
  var mes = vMes(p, 'mes', { req: true });
  var ex = leerTodo('fuentes_mes').filter(function (r) { return r.fuente_id === fid && r.mes === mes; })[0];
  if (!ex) return { quitado: false, sin_cambios: true };
  auditar('fuenteMes.quitar', 'fuentes_mes', ex.id, copia(ex), null);
  borrarFilas('fuentes_mes', [ex]);
  return { quitado: true, id: ex.id };
}

/* ---- Cajas ---- */
var HOJA_ALCANCE = { ambito: 'ambitos', categoria: 'categorias', subcategoria: 'subcategorias', medio_pago: 'medios_pago' };

function aspectoDeAlcance(alcance, ent) {
  if (alcance === 'subcategoria') {
    var cat = buscarPorId('categorias', ent.categoria_id);
    return { icono: ent.icono, color: cat ? cat.color : colorAuto(ent.nombre) };
  }
  return { icono: ent.icono || 'piggy-bank', color: ent.color || colorAuto(ent.nombre) };
}

function accionCajaGuardar(p) {
  precargar(['cajas', 'cajas_mes', 'ambitos', 'categorias', 'subcategorias', 'medios_pago']);
  var id = vId(p, 'id', { req: true });
  var orig = buscarPorId('cajas', id);
  var nombre = vTexto(p, 'nombre', { req: true, max: 60, etiqueta: 'el nombre de la caja' });
  nombreUnico('cajas', nombre, id);
  var alcance = vEnum(p, 'alcance', ENUMS.alcance, { req: true, etiqueta: 'el alcance' });
  var alcanceId = vId(p, 'alcance_id', { req: true });
  var ent = buscarPorId(HOJA_ALCANCE[alcance], alcanceId);
  if (!ent) invalido('alcance_id', alcance === 'medio_pago' ? 'Elige un medio de pago.' : 'Elige un valor para el alcance "' + alcance + '".');
  var monto = vNumero(p, 'monto_defecto', { min: 0, def: orig ? orig.monto_defecto : 0, etiqueta: 'el monto por defecto' });
  var activo = vBool(p, 'activo', orig ? orig.activo : true);
  if (activo) {
    var duplicada = leerTodo('cajas').filter(function (c) { return c.id !== id && c.activo && c.alcance === alcance && c.alcance_id === alcanceId; })[0];
    if (duplicada) invalido('alcance_id', 'Ya hay una caja activa con este alcance ("' + duplicada.nombre + '"). Desactívala o elige otro alcance.');
  }
  var asp = aspectoDeAlcance(alcance, ent);
  var mesAplicar = vMes(p, 'aplicar_mes');
  var caja;
  if (orig) {
    exigirVersion(orig, p.version);
    var antes = copia(orig);
    orig.nombre = nombre; orig.alcance = alcance; orig.alcance_id = alcanceId; orig.monto_defecto = monto;
    orig.icono = vIcono(p, 'icono', orig.icono || asp.icono); orig.color = vColor(p, 'color', orig.color || asp.color);
    orig.descripcion = vTexto(p, 'descripcion', { max: 300, def: orig.descripcion, etiqueta: 'la descripción' });
    orig.activo = activo;
    tocar(orig);
    actualizar('cajas', orig);
    auditar('caja.guardar', 'cajas', id, antes, orig);
    caja = orig;
  } else {
    var m = metaNueva();
    caja = { id: id, nombre: nombre, alcance: alcance, alcance_id: alcanceId, monto_defecto: monto, icono: vIcono(p, 'icono', asp.icono), color: vColor(p, 'color', asp.color),
      descripcion: vTexto(p, 'descripcion', { max: 300, etiqueta: 'la descripción' }), orden: maximoPor(leerTodo('cajas'), function (x) { return x.orden || 0; }) + 1, activo: activo,
      creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: m.version };
    insertar('cajas', [caja]);
    auditar('caja.guardar', 'cajas', id, null, caja);
  }
  var filaMes = null;
  if (mesAplicar) filaMes = aplicarCajaMes(caja, mesAplicar, vNumero(p, 'monto_mes', { min: 0, def: caja.monto_defecto }));
  return { caja: caja, caja_mes: filaMes };
}
function accionCajaReordenar(p) {
  var ids = vIdLista(p, 'ids', { req: true, max: 300 });
  return { orden: reordenarGrupo('cajas', leerTodo('cajas'), ids, function (f) { return f.nombre; }, true) };
}
function accionCajaEliminar(p) {
  exigirConfirmacion(p);
  precargar(['cajas', 'cajas_mes', 'plantillas']);
  var id = vId(p, 'id', { req: true });
  var c = buscarPorId('cajas', id);
  if (!c) fallar('NOT_FOUND', 'La caja no existe.', 'id');
  var meses = leerTodo('cajas_mes').filter(function (r) { return r.caja_id === id; });
  var aplicados = meses.filter(function (r) { return r.estado === 'aplicada'; }).length;
  if (aplicados > 0) return { eliminado: false, motivo: 'en_uso', dependencias: { meses_aplicados: aplicados }, sugerencia: 'desactivar' };
  meses.forEach(function (r) { auditar('caja.eliminar', 'cajas_mes', r.id, copia(r), null); });
  leerTodo('plantillas').forEach(function (pl) {
    if (pl.tipo === 'caja' && pl.datos_json && pl.datos_json.caja_id === id && pl.activo) {
      var a = copia(pl); pl.activo = false; tocar(pl); actualizar('plantillas', pl); auditar('plantilla.guardar', 'plantillas', pl.id, a, pl);
    }
  });
  auditar('caja.eliminar', 'cajas', id, copia(c), null);
  borrarFilas('cajas_mes', meses);
  borrarFilas('cajas', [c]);
  return { eliminado: true, id: id };
}
function aplicarCajaMes(c, mes, monto) {
  if (!c.activo) invalido('caja_id', 'Activa la caja "' + c.nombre + '" antes de aplicarla a un mes.');
  return upsertMes('cajas_mes', 'caja_id', c.id, mes, monto, 'aplicada');
}
function accionCajaMesAplicar(p) {
  precargar(['cajas', 'cajas_mes']);
  var c = exigirRef('cajas', vId(p, 'caja_id', { req: true }), 'caja_id', 'la caja');
  var mes = vMes(p, 'mes', { req: true });
  var monto = vNumero(p, 'monto', { min: 0, def: c.monto_defecto, etiqueta: 'el monto' });
  return { caja_mes: aplicarCajaMes(c, mes, monto), caja: c };
}
function accionCajaMesOmitir(p) {
  precargar(['cajas', 'cajas_mes']);
  var c = buscarPorId('cajas', vId(p, 'caja_id', { req: true }));
  if (!c) invalido('caja_id', 'La caja ya no existe.');
  var mes = vMes(p, 'mes', { req: true });
  var ex = leerTodo('cajas_mes').filter(function (r) { return r.caja_id === c.id && r.mes === mes; })[0];
  return { caja_mes: upsertMes('cajas_mes', 'caja_id', c.id, mes, ex ? ex.monto : c.monto_defecto, 'omitida') };
}
function accionCajaMesQuitar(p) {
  precargar(['cajas_mes']);
  var cid = vId(p, 'caja_id', { req: true });
  var mes = vMes(p, 'mes', { req: true });
  var ex = leerTodo('cajas_mes').filter(function (r) { return r.caja_id === cid && r.mes === mes; })[0];
  if (!ex) return { quitado: false, sin_cambios: true };
  auditar('cajaMes.quitar', 'cajas_mes', ex.id, copia(ex), null);
  borrarFilas('cajas_mes', [ex]);
  return { quitado: true, id: ex.id };
}

/** Copia la configuración (fuentes y cajas aplicadas) del mes anterior sin duplicar ni sobrescribir. */
function accionMesCopiarDeAnterior(p) {
  precargar(['fuentes', 'fuentes_mes', 'cajas', 'cajas_mes']);
  var mes = vMes(p, 'mes', { req: true });
  var ant = mesAnterior(mes);
  var excluir = {};
  (Array.isArray(p.excluir) ? p.excluir : []).forEach(function (x) { if (esObjeto(x)) excluir[x.tipo + ':' + x.id] = true; });
  var montos = esObjeto(p.montos) ? p.montos : {};
  var filas = [];
  leerTodo('fuentes_mes').filter(function (r) { return r.mes === ant && r.estado === 'aplicada'; }).forEach(function (r) {
    var f = buscarPorId('fuentes', r.fuente_id);
    if (!f || !f.activo || f.recurrencia !== 'mensual' || !fuenteVigente(f, mes)) return;
    var ya = leerTodo('fuentes_mes').filter(function (x) { return x.fuente_id === f.id && x.mes === mes; })[0];
    var clave = 'fuente:' + f.id;
    var monto = montos[clave] !== undefined ? vNumero(montos, clave, { min: 0 }) : r.monto;
    filas.push({ tipo: 'fuente', id: f.id, nombre: f.nombre, monto_anterior: r.monto, monto: monto, accion: ya ? 'existente' : (excluir[clave] ? 'omitir' : 'crear') });
  });
  leerTodo('cajas_mes').filter(function (r) { return r.mes === ant && r.estado === 'aplicada'; }).forEach(function (r) {
    var c = buscarPorId('cajas', r.caja_id);
    if (!c || !c.activo) return;
    var ya = leerTodo('cajas_mes').filter(function (x) { return x.caja_id === c.id && x.mes === mes; })[0];
    var clave = 'caja:' + c.id;
    var monto = montos[clave] !== undefined ? vNumero(montos, clave, { min: 0 }) : r.monto;
    filas.push({ tipo: 'caja', id: c.id, nombre: c.nombre, monto_anterior: r.monto, monto: monto, accion: ya ? 'existente' : (excluir[clave] ? 'omitir' : 'crear') });
  });
  var aplicadas = 0;
  if (!vBool(p, 'previsualizar', false)) {
    filas.forEach(function (f) {
      if (f.accion !== 'crear') return;
      if (f.tipo === 'fuente') upsertMes('fuentes_mes', 'fuente_id', f.id, mes, f.monto, 'aplicada');
      else upsertMes('cajas_mes', 'caja_id', f.id, mes, f.monto, 'aplicada');
      aplicadas++;
    });
  }
  return { mes: mes, anterior: ant, previsualizacion: vBool(p, 'previsualizar', false), filas: filas, aplicadas: aplicadas };
}

/* ===================== 12. PLANTILLAS Y COMPROMISOS ===================== */
function datosPlantillaGasto(d, orig) {
  if (!esObjeto(d)) invalido('datos', 'Faltan los datos de la plantilla.');
  var o = orig && esObjeto(orig) ? orig : {};
  var clas = validarClasificacion(d, o);
  var medio = exigirRef('medios_pago', vId(d, 'medio_pago_id', { req: true }), 'medio_pago_id', 'el medio de pago', o.medio_pago_id);
  var esComp = vBool(d, 'es_compromiso', false);
  var dia = vEntero(d, 'dia_vencimiento', { min: 1, max: 31, req: esComp, etiqueta: 'el día de vencimiento' });
  return {
    ambito_id: clas.ambito.id,
    categoria_id: clas.categoria.id,
    subcategoria_id: clas.subcategoria ? clas.subcategoria.id : '',
    descripcion: descNorm(vTexto(d, 'descripcion', { max: 200, etiqueta: 'la descripción' })),
    monto: vNumero(d, 'monto', { positivo: true, def: null, etiqueta: 'el monto' }),
    moneda: vMoneda(d, 'moneda'),
    medio_pago_id: medio.id,
    tipo_gasto: vEnum(d, 'tipo_gasto', ENUMS.tipo_gasto, { def: 'variable', etiqueta: 'el tipo de gasto' }),
    es_recurrente: vBool(d, 'es_recurrente', false),
    es_compromiso: esComp,
    dia_vencimiento: esComp ? dia : null
  };
}
function datosPlantilla(tipo, d, orig) {
  if (tipo === 'gasto') return datosPlantillaGasto(d, orig);
  if (!esObjeto(d)) invalido('datos', 'Faltan los datos de la plantilla.');
  if (tipo === 'fuente') {
    var f = exigirRef('fuentes', vId(d, 'fuente_id', { req: true }), 'fuente_id', 'la fuente', orig && orig.fuente_id);
    return { fuente_id: f.id, monto: vNumero(d, 'monto', { min: 0, def: null, etiqueta: 'el monto' }) };
  }
  var c = exigirRef('cajas', vId(d, 'caja_id', { req: true }), 'caja_id', 'la caja', orig && orig.caja_id);
  return { caja_id: c.id, monto: vNumero(d, 'monto', { min: 0, def: null, etiqueta: 'el monto' }) };
}

function sincronizarCompromiso(pl) {
  var d = pl.datos_json || {};
  var existente = leerTodo('compromisos').filter(function (c) { return c.plantilla_id === pl.id; })[0];
  if (pl.tipo !== 'gasto') return;
  if (d.es_compromiso) {
    if (existente) {
      var antes = copia(existente);
      existente.nombre = pl.nombre; existente.monto_previsto = d.monto; existente.moneda = d.moneda; existente.dia_vencimiento = d.dia_vencimiento; existente.activo = pl.activo;
      tocar(existente); actualizar('compromisos', existente);
      auditar('compromiso.guardar', 'compromisos', existente.id, antes, existente);
    } else {
      var m = metaNueva();
      var c = { id: uuid(), plantilla_id: pl.id, nombre: pl.nombre, monto_previsto: d.monto, moneda: d.moneda, dia_vencimiento: d.dia_vencimiento, activo: pl.activo, creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: m.version };
      insertar('compromisos', [c]);
      auditar('compromiso.guardar', 'compromisos', c.id, null, c);
    }
  } else if (existente && existente.activo) {
    var a2 = copia(existente);
    existente.activo = false; tocar(existente); actualizar('compromisos', existente);
    auditar('compromiso.guardar', 'compromisos', existente.id, a2, existente);
  }
}

function accionPlantillaGuardar(p) {
  precargar(['plantillas', 'compromisos', 'ambitos', 'categorias', 'ambito_categoria', 'subcategorias', 'ambito_subcategoria', 'medios_pago', 'fuentes', 'cajas']);
  var id = vId(p, 'id', { req: true });
  var orig = buscarPorId('plantillas', id);
  var tipo = orig ? orig.tipo : vEnum(p, 'tipo', ENUMS.plantilla_tipo, { req: true, etiqueta: 'el tipo de plantilla' });
  if (orig && p.tipo && p.tipo !== orig.tipo) invalido('tipo', 'No se puede cambiar el tipo de una plantilla.');
  var nombre = vTexto(p, 'nombre', { req: true, max: 60, etiqueta: 'el nombre de la plantilla' });
  nombreUnico('plantillas', nombre, id, function (r) { return r.tipo === tipo; });
  var datos = datosPlantilla(tipo, p.datos, orig ? orig.datos_json : null);
  leerTodo('plantillas').forEach(function (r) {
    if (r.id !== id && r.tipo === tipo && iguales(r.datos_json, datos)) invalido('datos', 'Ya existe una plantilla idéntica ("' + r.nombre + '").');
  });
  var activo = vBool(p, 'activo', orig ? orig.activo : true);
  var pl;
  if (orig) {
    exigirVersion(orig, p.version);
    var antes = copia(orig);
    orig.nombre = nombre; orig.datos_json = datos; orig.activo = activo;
    tocar(orig);
    actualizar('plantillas', orig);
    auditar('plantilla.guardar', 'plantillas', id, antes, orig);
    pl = orig;
  } else {
    var m = metaNueva();
    var grupo = leerTodo('plantillas').filter(function (r) { return r.tipo === tipo; });
    pl = { id: id, tipo: tipo, nombre: nombre, datos_json: datos, orden: maximoPor(grupo, function (x) { return x.orden || 0; }) + 1, activo: activo, creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: m.version };
    insertar('plantillas', [pl]);
    auditar('plantilla.guardar', 'plantillas', id, null, pl);
  }
  sincronizarCompromiso(pl);
  return { plantilla: pl };
}
function accionPlantillaReordenar(p) {
  var tipo = vEnum(p, 'tipo', ENUMS.plantilla_tipo, { req: true });
  var ids = vIdLista(p, 'ids', { req: true, max: 300 });
  var filas = leerTodo('plantillas').filter(function (r) { return r.tipo === tipo; });
  return { orden: reordenarGrupo('plantillas', filas, ids, function (f) { return f.nombre; }, true) };
}
function accionPlantillaEliminar(p) {
  exigirConfirmacion(p);
  precargar(['plantillas', 'compromisos']);
  var id = vId(p, 'id', { req: true });
  var pl = buscarPorId('plantillas', id);
  if (!pl) fallar('NOT_FOUND', 'La plantilla no existe.', 'id');
  leerTodo('compromisos').forEach(function (c) {
    if (c.plantilla_id === id) { var a = copia(c); c.plantilla_id = ''; tocar(c); actualizar('compromisos', c); auditar('compromiso.guardar', 'compromisos', c.id, a, c); }
  });
  auditar('plantilla.eliminar', 'plantillas', id, copia(pl), null);
  borrarFilas('plantillas', [pl]);
  return { eliminado: true, id: id };
}

/** Aplica plantillas de fuentes o cajas a un mes (con vista previa). Reaplicar no duplica. */
function accionPlantillaAplicarMes(p) {
  precargar(['plantillas', 'fuentes', 'fuentes_mes', 'cajas', 'cajas_mes']);
  var tipo = vEnum(p, 'tipo', ['fuente', 'caja'], { req: true, etiqueta: 'el tipo de plantilla' });
  var mes = vMes(p, 'mes', { req: true });
  var ids = p.plantilla_ids === undefined ? null : vIdLista(p, 'plantilla_ids', { max: 300 });
  var omitir = vIdLista(p, 'omitir_ids', { max: 300 });
  var montos = esObjeto(p.montos) ? p.montos : {};
  var filas = [];
  leerTodo('plantillas').filter(function (pl) { return pl.tipo === tipo && pl.activo && (!ids || ids.indexOf(pl.id) !== -1); })
    .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); })
    .forEach(function (pl) {
      var d = pl.datos_json || {};
      var entId = tipo === 'fuente' ? d.fuente_id : d.caja_id;
      var ent = buscarPorId(tipo === 'fuente' ? 'fuentes' : 'cajas', entId);
      var fila = { plantilla_id: pl.id, nombre: pl.nombre, entidad_id: entId, monto: null, accion: 'omitir', estado: 'pendiente', motivo: '' };
      if (!ent || !ent.activo) { fila.motivo = 'La ' + tipo + ' está inactiva o ya no existe.'; filas.push(fila); return; }
      if (tipo === 'fuente' && !fuenteVigente(ent, mes)) { fila.motivo = 'La fuente no está vigente en ' + mes + '.'; filas.push(fila); return; }
      var monto = montos[pl.id] !== undefined ? vNumero(montos, pl.id, { min: 0 }) : (d.monto !== null && d.monto !== undefined ? d.monto : ent.monto_defecto);
      fila.monto = monto;
      var hojaMes = tipo === 'fuente' ? 'fuentes_mes' : 'cajas_mes', clave = tipo === 'fuente' ? 'fuente_id' : 'caja_id';
      var ex = leerTodo(hojaMes).filter(function (r) { return r[clave] === entId && r.mes === mes; })[0];
      if (omitir.indexOf(pl.id) !== -1) { fila.accion = 'omitir'; fila.estado = 'no_aplica'; fila.explicita = true; }
      else if (!ex) { fila.accion = 'crear'; }
      else if (ex.estado === 'aplicada' && ex.monto === monto) { fila.accion = 'sin_cambios'; fila.estado = 'aplicada'; }
      else { fila.accion = 'actualizar'; }
      if (ex && ex.estado === 'omitida' && fila.accion !== 'omitir') fila.estado = 'no_aplica';
      filas.push(fila);
    });
  var escritas = 0;
  if (!vBool(p, 'previsualizar', false)) {
    filas.forEach(function (f) {
      if (f.accion === 'crear' || f.accion === 'actualizar') {
        upsertMes(tipo === 'fuente' ? 'fuentes_mes' : 'cajas_mes', tipo === 'fuente' ? 'fuente_id' : 'caja_id', f.entidad_id, mes, f.monto, 'aplicada');
        f.estado = 'aplicada'; escritas++;
      } else if (f.accion === 'omitir' && f.explicita) {
        var hojaMes = tipo === 'fuente' ? 'fuentes_mes' : 'cajas_mes';
        var clave = tipo === 'fuente' ? 'fuente_id' : 'caja_id';
        var ex = leerTodo(hojaMes).filter(function (r) { return r[clave] === f.entidad_id && r.mes === mes; })[0];
        upsertMes(hojaMes, clave, f.entidad_id, mes, f.monto !== null ? f.monto : (ex ? ex.monto : 0), 'omitida');
        escritas++;
      }
    });
  }
  return { mes: mes, tipo: tipo, previsualizacion: vBool(p, 'previsualizar', false), filas: filas, escritas: escritas };
}

/* ---- Compromisos ---- */
function vincularPago(comp, mov) {
  var existente = leerTodo('compromiso_pagos').filter(function (r) { return r.compromiso_id === comp.id && r.movimiento_id === mov.id; })[0];
  if (existente) return existente;
  var otro = leerTodo('compromiso_pagos').filter(function (r) { return r.movimiento_id === mov.id; })[0];
  if (otro) invalido('movimiento_id', 'Este movimiento ya paga otro compromiso.');
  var fila = { id: uuid(), compromiso_id: comp.id, movimiento_id: mov.id, mes: String(mov.fecha).slice(0, 7), creado_en: ahoraIso() };
  insertar('compromiso_pagos', [fila]);
  auditar('compromiso.vincular', 'compromiso_pagos', fila.id, null, fila);
  return fila;
}
function accionCompromisoGuardar(p) {
  precargar(['compromisos', 'plantillas']);
  var id = vId(p, 'id', { req: true });
  var orig = buscarPorId('compromisos', id);
  var nombre = vTexto(p, 'nombre', { req: true, max: 60, etiqueta: 'el nombre del compromiso' });
  nombreUnico('compromisos', nombre, id);
  var plantillaId = vId(p, 'plantilla_id');
  if (plantillaId) {
    var pl = buscarPorId('plantillas', plantillaId);
    if (!pl || pl.tipo !== 'gasto') invalido('plantilla_id', 'La plantilla de gasto ya no existe.');
  }
  var o = {
    nombre: nombre,
    plantilla_id: plantillaId,
    monto_previsto: vNumero(p, 'monto_previsto', { positivo: true, def: null, etiqueta: 'el monto previsto' }),
    moneda: vMoneda(p, 'moneda'),
    dia_vencimiento: vEntero(p, 'dia_vencimiento', { req: true, min: 1, max: 31, etiqueta: 'el día de vencimiento' }),
    activo: vBool(p, 'activo', orig ? orig.activo : true)
  };
  if (orig) {
    exigirVersion(orig, p.version);
    var antes = copia(orig);
    Object.keys(o).forEach(function (k) { orig[k] = o[k]; });
    tocar(orig);
    actualizar('compromisos', orig);
    auditar('compromiso.guardar', 'compromisos', id, antes, orig);
    return { compromiso: orig };
  }
  var m = metaNueva();
  var c = { id: id, plantilla_id: o.plantilla_id, nombre: o.nombre, monto_previsto: o.monto_previsto, moneda: o.moneda, dia_vencimiento: o.dia_vencimiento, activo: o.activo, creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: m.version };
  insertar('compromisos', [c]);
  auditar('compromiso.guardar', 'compromisos', id, null, c);
  return { compromiso: c };
}
function accionCompromisoEliminar(p) {
  exigirConfirmacion(p);
  precargar(['compromisos', 'compromiso_pagos']);
  var id = vId(p, 'id', { req: true });
  var c = buscarPorId('compromisos', id);
  if (!c) fallar('NOT_FOUND', 'El compromiso no existe.', 'id');
  var pagos = leerTodo('compromiso_pagos').filter(function (r) { return r.compromiso_id === id; }).length;
  if (pagos > 0) return { eliminado: false, motivo: 'en_uso', dependencias: { pagos: pagos }, sugerencia: 'desactivar' };
  auditar('compromiso.eliminar', 'compromisos', id, copia(c), null);
  borrarFilas('compromisos', [c]);
  return { eliminado: true, id: id };
}
function accionCompromisoVincular(p) {
  precargar(['compromisos', 'compromiso_pagos']);
  var comp = buscarPorId('compromisos', vId(p, 'compromiso_id', { req: true }));
  if (!comp) invalido('compromiso_id', 'El compromiso ya no existe.');
  var mov = buscarPorId('movimientos', vId(p, 'movimiento_id', { req: true }));
  if (!mov) invalido('movimiento_id', 'El movimiento ya no existe.');
  if (mov.estado !== 'activo') invalido('movimiento_id', 'No se puede asociar un movimiento anulado.');
  var fila = vincularPago(comp, mov);
  var mes = vMes(p, 'mes');
  if (mes && fila.mes !== mes) { fila.mes = mes; actualizar('compromiso_pagos', fila); auditar('compromiso.vincular', 'compromiso_pagos', fila.id, null, fila); }
  return { pago: fila };
}
function accionCompromisoDesvincular(p) {
  precargar(['compromiso_pagos']);
  var cid = vId(p, 'compromiso_id', { req: true }), mid = vId(p, 'movimiento_id', { req: true });
  var fila = leerTodo('compromiso_pagos').filter(function (r) { return r.compromiso_id === cid && r.movimiento_id === mid; })[0];
  if (!fila) return { desvinculado: false, sin_cambios: true };
  auditar('compromiso.desvincular', 'compromiso_pagos', fila.id, copia(fila), null);
  borrarFilas('compromiso_pagos', [fila]);
  return { desvinculado: true, id: fila.id };
}

/* ================== 13. CALIDAD DE DATOS Y CONCILIACIÓN ================== */
function accionRevisionGuardar(p) {
  precargar(['revisiones_calidad']);
  var tipo = vTexto(p, 'tipo_alerta', { req: true, max: 40, etiqueta: 'el tipo de alerta' });
  var firma = vTexto(p, 'firma', { req: true, max: 300, etiqueta: 'la firma' });
  var estado = vEnum(p, 'estado', ENUMS.revision_estado, { req: true, etiqueta: 'el estado' });
  var ids = vIdLista(p, 'movimiento_ids', { req: true, max: 100 });
  var ex = leerTodo('revisiones_calidad').filter(function (r) { return r.tipo_alerta === tipo && r.firma === firma; })[0];
  var t = ahoraIso();
  if (ex) {
    var antes = copia(ex);
    ex.estado = estado; ex.movimiento_ids = ids; ex.actualizado_en = t;
    actualizar('revisiones_calidad', ex);
    auditar('revision.guardar', 'revisiones_calidad', ex.id, antes, ex);
    return { revision: ex };
  }
  var r = { id: uuid(), tipo_alerta: tipo, firma: firma, movimiento_ids: ids, estado: estado, creado_en: t, actualizado_en: t };
  insertar('revisiones_calidad', [r]);
  auditar('revision.guardar', 'revisiones_calidad', r.id, null, r);
  return { revision: r };
}

function accionGrupoFondosGuardar(p) {
  precargar(['grupos_fondos', 'fuentes']);
  var id = vId(p, 'id', { req: true });
  var orig = buscarPorId('grupos_fondos', id);
  var nombre = vTexto(p, 'nombre', { req: true, max: 60, etiqueta: 'el nombre del grupo' });
  nombreUnico('grupos_fondos', nombre, id);
  var fuenteIds = vIdLista(p, 'fuente_ids', { req: true, max: 50 });
  if (!fuenteIds.length) invalido('fuente_ids', 'Elige al menos una fuente.');
  fuenteIds.forEach(function (fid) { if (!buscarPorId('fuentes', fid)) invalido('fuente_ids', 'Una fuente ya no existe.'); });
  var activo = vBool(p, 'activo', orig ? orig.activo : true);
  if (activo) {
    leerTodo('grupos_fondos').forEach(function (g) {
      if (g.id !== id && g.activo && g.fuente_ids_json) {
        fuenteIds.forEach(function (fid) { if (g.fuente_ids_json.indexOf(fid) !== -1) invalido('fuente_ids', 'Una fuente solo puede estar en un grupo activo (ya está en "' + g.nombre + '").'); });
      }
    });
  }
  if (orig) {
    exigirVersion(orig, p.version);
    var antes = copia(orig);
    orig.nombre = nombre; orig.fuente_ids_json = fuenteIds; orig.activo = activo;
    tocar(orig);
    actualizar('grupos_fondos', orig);
    auditar('grupoFondos.guardar', 'grupos_fondos', id, antes, orig);
    return { grupo: orig };
  }
  var m = metaNueva();
  var g = { id: id, nombre: nombre, fuente_ids_json: fuenteIds, activo: activo, creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: m.version };
  insertar('grupos_fondos', [g]);
  auditar('grupoFondos.guardar', 'grupos_fondos', id, null, g);
  return { grupo: g };
}

function vHora(p, campo) {
  var v = p[campo];
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) invalido(campo, 'La hora debe tener formato HH:MM.');
  return v;
}
/** La hoja `conciliaciones` es de solo agregar: no existe ninguna acción que edite o borre sus filas. */
function accionConciliacionVerificar(p) {
  precargar(['conciliaciones', 'grupos_fondos']);
  var grupo = buscarPorId('grupos_fondos', vId(p, 'grupo_id', { req: true }));
  if (!grupo) invalido('grupo_id', 'El grupo de fondos ya no existe.');
  var periodo = vMes(p, 'periodo', { req: true });
  var fecha = vFecha(p, 'fecha_corte', { req: true, etiqueta: 'la fecha de corte' });
  var hora = vHora(p, 'hora');
  var calculado = vNumero(p, 'saldo_calculado', { req: true, min: -1e9, etiqueta: 'el saldo calculado' });
  var real = vNumero(p, 'saldo_real', { req: true, min: -1e9, etiqueta: 'el saldo real' });
  var reemplaza = vId(p, 'reemplaza_a');
  if (reemplaza) {
    var prev = leerTodo('conciliaciones').filter(function (r) { return r.id === reemplaza; })[0];
    if (!prev || prev.tipo !== 'verificacion') invalido('reemplaza_a', 'La verificación que quieres corregir no existe.');
  }
  var dif = redondear2(real - calculado);
  var fila = {
    id: vId(p, 'id') || uuid(), tipo: 'verificacion', conciliacion_id: vId(p, 'conciliacion_id') || uuid(), periodo: periodo, fecha_corte: fecha, hora: hora,
    grupo_id: grupo.id, saldo_calculado: calculado, saldo_real: real, diferencia: dif, estado: dif === 0 ? 'conciliada' : 'pendiente',
    causa: vTexto(p, 'causa', { max: 200, etiqueta: 'la causa' }), observacion: vTexto(p, 'observacion', { max: 500, multilinea: true, etiqueta: 'la observación' }),
    reemplaza_a: reemplaza, creado_en: ahoraIso()
  };
  if (leerTodo('conciliaciones').some(function (r) { return r.id === fila.id; })) return { conciliacion: leerTodo('conciliaciones').filter(function (r) { return r.id === fila.id; })[0], existente: true };
  insertar('conciliaciones', [fila]);
  auditar('conciliacion.verificar', 'conciliaciones', fila.id, null, fila);
  return { conciliacion: fila };
}
function accionConciliacionSeguimiento(p) {
  precargar(['conciliaciones']);
  var cid = vId(p, 'conciliacion_id', { req: true });
  var previas = leerTodo('conciliaciones').filter(function (r) { return r.conciliacion_id === cid; });
  if (!previas.length) invalido('conciliacion_id', 'No existe una verificación con ese identificador.');
  var base = previas.filter(function (r) { return r.tipo === 'verificacion'; }).pop();
  var estado = vEnum(p, 'estado', ENUMS.conciliacion_estado, { req: true, etiqueta: 'el estado' });
  var causa = vTexto(p, 'causa', { max: 200, etiqueta: 'la causa' });
  if (estado === 'cerrada_justificada' && !causa) invalido('causa', 'Documenta la causa para cerrar con diferencia justificada.');
  var fila = {
    id: vId(p, 'id') || uuid(), tipo: 'seguimiento', conciliacion_id: cid, periodo: base.periodo, fecha_corte: base.fecha_corte, hora: base.hora, grupo_id: base.grupo_id,
    saldo_calculado: base.saldo_calculado, saldo_real: base.saldo_real, diferencia: base.diferencia, estado: estado, causa: causa,
    observacion: vTexto(p, 'observacion', { max: 500, multilinea: true, etiqueta: 'la observación' }), reemplaza_a: '', creado_en: ahoraIso()
  };
  if (previas.some(function (r) { return r.id === fila.id; })) return { conciliacion: previas.filter(function (r) { return r.id === fila.id; })[0], existente: true };
  insertar('conciliaciones', [fila]);
  auditar('conciliacion.seguimiento', 'conciliaciones', fila.id, null, fila);
  return { conciliacion: fila };
}

/* =================== 14. PLANIFICACIÓN Y CONFIGURACIÓN =================== */
function accionPlanificacionGuardar(p) {
  precargar(['planificacion']);
  var mes = vMes(p, 'mes', { req: true });
  var etapa = vEnum(p, 'etapa', ENUMS.plan_etapa, { req: true, etiqueta: 'la etapa' });
  var estado = vEnum(p, 'estado', ENUMS.plan_estado, { req: true, etiqueta: 'el estado' });
  var ex = leerTodo('planificacion').filter(function (r) { return r.mes === mes && r.etapa === etapa; })[0];
  var t = ahoraIso();
  if (ex) {
    var antes = copia(ex);
    ex.estado = estado; ex.actualizado_en = t;
    actualizar('planificacion', ex);
    auditar('planificacion.guardar', 'planificacion', ex.id, antes, ex);
    return { planificacion: ex };
  }
  var f = { id: uuid(), mes: mes, etapa: etapa, estado: estado, actualizado_en: t };
  insertar('planificacion', [f]);
  auditar('planificacion.guardar', 'planificacion', f.id, null, f);
  return { planificacion: f };
}

function zonaValida(z) {
  try { Utilities.formatDate(new Date(), z, 'yyyy'); return true; } catch (e) { return false; }
}
/** Valida y normaliza el valor de una clave de configuración. Devuelve el texto a guardar. */
function validarConfig(clave, valor) {
  var v = valor === null || valor === undefined ? '' : (typeof valor === 'boolean' ? (valor ? 'TRUE' : 'FALSE') : (typeof valor === 'object' ? JSON.stringify(valor) : String(valor)));
  var m;
  if (clave === 'moneda_base') {
    if (!/^[A-Z]{3}$/.test(v)) invalido('valor', 'La moneda base debe ser un código de 3 letras (ej. PEN).');
    var hay = leerColumna('movimientos', 'id').length;
    if (hay > 0 && v !== cfg().moneda_base) invalido('valor', 'No se puede cambiar la moneda base con movimientos registrados.');
    return v;
  }
  if (clave === 'monedas_permitidas') {
    var lista = v.split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean);
    if (!lista.length || lista.some(function (s) { return !/^[A-Z]{3}$/.test(s); })) invalido('valor', 'Usa códigos de 3 letras separados por comas (ej. PEN,USD).');
    var unicos = lista.filter(function (s, i) { return lista.indexOf(s) === i; });
    return unicos.join(',');
  }
  if (clave === 'zona_horaria') {
    if (!zonaValida(v)) invalido('valor', 'La zona horaria no es válida (ej. America/Lima).');
    return v;
  }
  if (clave === 'formato_fecha') {
    if (['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'].indexOf(v) === -1) invalido('valor', 'Formato de fecha no válido.');
    return v;
  }
  if (clave === 'tema') {
    if (['claro', 'oscuro', 'sistema'].indexOf(v) === -1) invalido('valor', 'El tema debe ser claro, oscuro o sistema.');
    return v;
  }
  if (clave === 'auto_refresh_seg') {
    if (['0', '30', '60', '300', '600'].indexOf(v) === -1) invalido('valor', 'El refresco automático debe ser 0, 30, 60, 300 o 600 segundos.');
    return v;
  }
  if (clave === 'notificaciones_guardado' || clave === 'plan_activo') {
    if (v !== 'TRUE' && v !== 'FALSE') invalido('valor', 'Debe ser verdadero o falso.');
    return v;
  }
  if (clave === 'desc_excepciones') {
    if (v.length > 500) invalido('valor', 'La lista de excepciones es demasiado larga.');
    return v.split(',').map(function (s) { return s.trim(); }).filter(Boolean).join(',');
  }
  if (clave === 'plan_dia_defecto') {
    if (!/^\d{1,2}$/.test(v) || +v < 1 || +v > 31) invalido('valor', 'El día debe estar entre 1 y 31.');
    return String(+v);
  }
  if (clave === 'carpeta_respaldo_id') {
    if (v && !/^[A-Za-z0-9_-]{10,100}$/.test(v)) invalido('valor', 'El identificador de la carpeta no es válido.');
    return v;
  }
  if (clave === 'umbral_alertas') {
    var u = v.split(',').map(function (s) { return Number(s.trim()); });
    if (u.length !== 3 || u.some(function (n) { return !isFinite(n) || n <= 0 || n > 200 || Math.floor(n) !== n; }) || !(u[0] < u[1] && u[1] <= u[2])) invalido('valor', 'Usa tres umbrales crecientes (ej. 70,90,100).');
    return u.join(',');
  }
  if (clave === 'vistas_filtros') {
    var arr;
    try { arr = v ? JSON.parse(v) : []; } catch (e2) { arr = null; }
    if (!Array.isArray(arr)) invalido('valor', 'Las vistas guardadas deben ser una lista.');
    if (arr.length > 20) invalido('valor', 'Puedes guardar hasta 20 vistas.');
    var nombresVistas = {};
    var limpias = arr.map(function (x) {
      if (!esObjeto(x) || typeof x.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(x.id)) invalido('valor', 'Vista con identificador no válido.');
      var nom = typeof x.nombre === 'string' ? x.nombre.trim() : '';
      if (!nom || nom.length > 40) invalido('valor', 'El nombre de la vista debe tener entre 1 y 40 caracteres.');
      if (/^[=+\-@]/.test(nom)) invalido('valor', 'El nombre de la vista no puede empezar por = + - @.');
      var kn = nom.toLowerCase();
      if (nombresVistas[kn]) invalido('valor', 'Ya existe una vista con el nombre "' + nom + '".');
      nombresVistas[kn] = true;
      if (typeof x.query !== 'string' || x.query.length > 600 || !/^[A-Za-z0-9_=&,.\-]*$/.test(x.query)) invalido('valor', 'Los filtros de la vista no son válidos.');
      return { id: x.id, nombre: nom, query: x.query };
    });
    return JSON.stringify(limpias);
  }
  if (clave === 'ahorro_simulado_pct') {
    var n = Number(v);
    if (!isFinite(n) || n < 0 || n > 100) invalido('valor', 'El porcentaje debe estar entre 0 y 100.');
    return String(n);
  }
  if ((m = /^tipo_cambio_([A-Z]{3})$/.exec(clave))) {
    var tc = Number(v);
    if (!(tc > 0) || tc > 1e6) invalido('valor', 'El tipo de cambio debe ser un número mayor que 0.');
    if (m[1] === cfg().moneda_base) invalido('clave', 'La moneda base no necesita tipo de cambio.');
    return String(tc);
  }
  if ((m = /^plan_dias_(\d{4})$/.exec(clave))) {
    var anio = +m[1];
    var obj;
    try { obj = JSON.parse(v); } catch (e) { obj = null; }
    if (!esObjeto(obj)) invalido('valor', 'Los días por mes deben ser un objeto {"01":15,...}.');
    var limpio = {};
    Object.keys(obj).forEach(function (mes) {
      if (!/^(0[1-9]|1[0-2])$/.test(mes)) invalido('valor', 'Mes inválido: ' + mes + '.');
      var cfgMes = obj[mes];
      var dia = esObjeto(cfgMes) ? cfgMes.dia : cfgMes;
      var activo = esObjeto(cfgMes) && cfgMes.activo === false ? false : true;
      if (!isFinite(Number(dia)) || Math.floor(Number(dia)) !== Number(dia)) invalido('valor', 'Día inválido en el mes ' + mes + '.');
      var maxDia = new Date(Date.UTC(anio, +mes, 0)).getUTCDate(); // respeta bisiestos
      if (Number(dia) < 1 || Number(dia) > maxDia) invalido('valor', 'El mes ' + mes + ' de ' + anio + ' tiene ' + maxDia + ' días.');
      limpio[mes] = { dia: Number(dia), activo: activo };
    });
    return JSON.stringify(limpio);
  }
  fallar('VALIDATION', 'La clave de configuración "' + clave + '" no está permitida.', 'clave');
}
function accionConfigGuardar(p) {
  precargar(['config']);
  var items = Array.isArray(p.items) ? p.items : (p.clave !== undefined ? [{ clave: p.clave, valor: p.valor }] : null);
  if (!items || !items.length) invalido('items', 'No hay nada que guardar.');
  if (items.length > 50) invalido('items', 'Demasiados cambios de configuración a la vez.');
  var validados = items.map(function (it) {
    if (!esObjeto(it) || typeof it.clave !== 'string') invalido('clave', 'Falta la clave de configuración.');
    return { clave: it.clave, valor: validarConfig(it.clave, it.valor) };
  });
  var t = ahoraIso();
  var nuevos = [], guardados = [];
  validados.forEach(function (v) {
    var ex = leerTodo('config').filter(function (r) { return r.clave === v.clave; })[0];
    if (ex) {
      if (ex.valor !== v.valor) { var antes = copia(ex); ex.valor = v.valor; ex.actualizado_en = t; actualizar('config', ex); auditar('config.guardar', 'config', v.clave, antes, ex); }
      guardados.push(ex);
    } else {
      var f = { clave: v.clave, valor: v.valor, actualizado_en: t };
      nuevos.push(f);
      guardados.push(f);
      auditar('config.guardar', 'config', v.clave, null, f);
    }
  });
  insertar('config', nuevos);
  CTX.cfg = null;
  return { config: guardados };
}

/* ============================== 15. MANTENIMIENTO ============================== */
function accionDiagnostico() {
  var t0 = Date.now();
  var ss = libro();
  var filas = {}, problemas = [];
  Object.keys(ESQUEMAS_DEF).forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (!sh) { problemas.push('Falta la hoja "' + n + '".'); return; }
    var d = diferenciasEncabezado(sh, n);
    if (d) problemas.push('Encabezados distintos en "' + n + '"' + (d.faltan.length ? ' (faltan ' + d.faltan.join(', ') + ')' : '') + '.');
    filas[n] = Math.max(sh.getLastRow() - 1, 0);
  });
  var cacheOk = false;
  try { var c = CacheService.getScriptCache(); c.put('diag', 'ok', 30); cacheOk = c.get('diag') === 'ok'; } catch (e) { cacheOk = false; }
  var props = PropertiesService.getScriptProperties();
  return {
    version_backend: VERSION, esquema: SCHEMA_VERSION, esquema_hoja: Number(metaGet('version_esquema')) || 0,
    generacion: generacion(), filas: filas, problemas: problemas, cache: { ok: cacheOk },
    zona_horaria: cfg().zona_horaria, moneda_base: cfg().moneda_base,
    atajo_activo: !!props.getProperty('ATAJO_TOKEN'), latencia_ms: Date.now() - t0, instalado_en: metaGet('instalado_en')
  };
}

function accionRepararHoja(p) {
  var ss = libro();
  var objetivo = typeof p.hoja === 'string' && p.hoja ? [p.hoja] : Object.keys(ESQUEMAS_DEF);
  objetivo.forEach(function (n) { if (!ESQUEMAS_DEF[n]) invalido('hoja', 'La hoja "' + n + '" no es parte de Deejota Finanzas.'); });
  var rep = { reparadas: [], sin_cambios: [], errores: [] };
  objetivo.forEach(function (n) {
    var sh = ss.getSheetByName(n);
    var esperados = encabezadosDe(n);
    if (!sh) { sh = ss.insertSheet(n); formatearHoja(sh, n, true); rep.reparadas.push(n + ' (creada)'); return; }
    var d = diferenciasEncabezado(sh, n);
    if (d) {
      var enc = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
      while (enc.length && enc[enc.length - 1] === '') enc.pop();
      var esPrefijo = enc.length < esperados.length && enc.every(function (x, i) { return x === esperados[i]; });
      if (esPrefijo) {
        sh.getRange(1, enc.length + 1, 1, esperados.length - enc.length).setValues([esperados.slice(enc.length)]);
        formatearHoja(sh, n, false);
        rep.reparadas.push(n + ' (se agregaron columnas: ' + esperados.slice(enc.length).join(', ') + ')');
      } else {
        rep.errores.push('"' + n + '": no se puede reparar sin riesgo (' + (d.faltan.length ? 'faltan ' + d.faltan.join(', ') : '') + (d.sobran.length ? '; sobran ' + d.sobran.join(', ') : '') + '). Corrígela a mano.');
      }
      return;
    }
    formatearHoja(sh, n, sh.getLastRow() === 0);
    rep.sin_cambios.push(n);
  });
  CTX.hojas = {}; CTX.t = {}; CTX.indices = {};
  CTX.escribio = true;
  auditar('repararHoja', '_meta', '', null, rep);
  return rep;
}

function crearCopiaRespaldo() {
  var ss = libro();
  var nombre = 'Respaldo Deejota Finanzas ' + Utilities.formatDate(new Date(), cfg().zona_horaria, 'yyyy-MM-dd HH-mm');
  var archivo = DriveApp.getFileById(ss.getId());
  var carpetaId = cfg().carpeta_respaldo_id;
  var copiaArchivo = carpetaId ? archivo.makeCopy(nombre, DriveApp.getFolderById(carpetaId)) : archivo.makeCopy(nombre);
  return { id: copiaArchivo.getId(), url: copiaArchivo.getUrl(), nombre: nombre };
}
function accionRespaldoCrear() {
  var r = crearCopiaRespaldo();
  auditar('respaldo.crear', '_meta', '', null, { id: r.id, nombre: r.nombre });
  CTX.escribio = true;
  return r;
}
function accionRespaldoCarpeta(p) {
  var id = vTexto(p, 'carpeta_id', { req: true, max: 100, etiqueta: 'la carpeta' });
  var carpeta;
  try { carpeta = DriveApp.getFolderById(id); } catch (e) { invalido('carpeta_id', 'No se pudo abrir esa carpeta de Drive. Revisa el identificador y los permisos.'); }
  accionConfigGuardar({ clave: 'carpeta_respaldo_id', valor: id });
  return { carpeta_id: id, nombre: carpeta.getName() };
}

function accionExportarCsv(p) {
  precargar(['ambitos', 'categorias', 'subcategorias', 'medios_pago']);
  var alcance = vEnum(p, 'alcance', ['periodo', 'todo'], { def: 'todo' });
  var desde = alcance === 'periodo' ? vFecha(p, 'desde', { req: true, etiqueta: 'la fecha inicial' }) : '';
  var hasta = alcance === 'periodo' ? vFecha(p, 'hasta', { req: true, etiqueta: 'la fecha final' }) : '';
  if (desde && hasta && desde > hasta) invalido('hasta', 'La fecha final no puede ser anterior a la inicial.');
  var incluirAnulados = vBool(p, 'incluir_anulados', true);
  var nombre = function (hojaN, id) { var r = buscarPorId(hojaN, id); return r ? r.nombre : ''; };
  var cab = ['fecha', 'descripcion', 'ambito', 'categoria', 'subcategoria', 'medio_pago', 'monto', 'moneda', 'tipo_cambio', 'monto_base', 'tipo_gasto', 'recurrente', 'estado', 'origen', 'comprobante_url', 'notas'];
  var lineas = [cab.join(',')], n = 0;
  leerTodo('movimientos').forEach(function (m) {
    if (desde && (m.fecha < desde || m.fecha > hasta)) return;
    if (!incluirAnulados && m.estado === 'anulado') return;
    n++;
    lineas.push([m.fecha, m.descripcion, nombre('ambitos', m.ambito_id), nombre('categorias', m.categoria_id), nombre('subcategorias', m.subcategoria_id), nombre('medios_pago', m.medio_pago_id),
      m.monto, m.moneda, m.tipo_cambio, m.monto_base, m.tipo_gasto, m.es_recurrente ? 'SI' : 'NO', m.estado, m.origen, m.comprobante_url, m.notas].map(celdaCsv).join(','));
  });
  return { nombre_archivo: 'movimientos-' + (alcance === 'periodo' ? desde + '_' + hasta : 'historial') + '.csv', csv: '﻿' + lineas.join('\r\n'), filas: n };
}

function accionDatosPruebaGenerar(p) {
  precargar(['ambitos', 'categorias', 'ambito_categoria', 'subcategorias', 'ambito_subcategoria', 'medios_pago']);
  var cantidad = vEntero(p, 'cantidad', { def: 30, min: 1, max: 200 });
  var combos = [];
  leerTodo('ambitos').filter(function (a) { return a.activo; }).forEach(function (a) {
    leerTodo('ambito_categoria').filter(function (r) { return r.ambito_id === a.id && r.activo; }).forEach(function (r) {
      var efect = subcategoriasEfectivas(r.categoria_id, a.id);
      if (efect.length) efect.forEach(function (s) { combos.push({ a: a.id, c: r.categoria_id, s: s.id }); });
      else combos.push({ a: a.id, c: r.categoria_id, s: '' });
    });
  });
  var medios = leerTodo('medios_pago').filter(function (m) { return m.activo; });
  if (!combos.length || !medios.length) invalido('cantidad', 'Hace falta al menos un ámbito, una categoría y un medio de pago activos.');
  var hoy = hoyNegocio();
  var base = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  var t = ahoraIso(), out = [], lote = 'test-' + uuid();
  for (var i = 0; i < cantidad; i++) {
    var cb = combos[(i * 7) % combos.length], md = medios[i % medios.length];
    var d = new Date(base - ((i * 3) % 30) * 86400000);
    out.push({
      id: uuid(), fecha: d.toISOString().slice(0, 10), monto: redondear2(8 + ((i * 37) % 180) + (i % 4) * 0.5), moneda: cfg().moneda_base, tipo_cambio: 1, monto_base: 0,
      ambito_id: cb.a, categoria_id: cb.c, subcategoria_id: cb.s, descripcion: 'TEST-' + ('000' + (i + 1)).slice(-3), medio_pago_id: md.id,
      tipo_gasto: ENUMS.tipo_gasto[i % 3], es_recurrente: false, estado: 'activo', origen: 'prueba', plantilla_id: '', lote_id: lote, comprobante_url: '', notas: 'Dato de prueba', creado_en: t, actualizado_en: t, version: 1
    });
    out[i].monto_base = out[i].monto;
  }
  insertar('movimientos', out);
  auditar('datosPrueba.generar', 'movimientos', lote, null, { cantidad: out.length });
  return { generados: out.length, lote_id: lote };
}
function accionDatosPruebaBorrar(p) {
  exigirConfirmacion(p);
  var todos = leerTodo('movimientos').filter(function (m) { return m.origen === 'prueba' && /^TEST-/i.test(m.descripcion); });
  if (!todos.length) return { eliminados: 0 };
  var ids = {};
  todos.forEach(function (m) { ids[m.id] = true; });
  var pagos = leerTodo('compromiso_pagos').filter(function (r) { return ids[r.movimiento_id]; });
  var orden = leerTodo('orden_movimientos').filter(function (r) { return ids[r.movimiento_id]; });
  pagos.forEach(function (r) { auditar('datosPrueba.borrar', 'compromiso_pagos', r.id, copia(r), null); });
  todos.forEach(function (m) { auditar('datosPrueba.borrar', 'movimientos', m.id, { id: m.id, descripcion: m.descripcion }, null); });
  borrarFilas('compromiso_pagos', pagos);
  borrarFilas('orden_movimientos', orden);
  borrarFilas('movimientos', todos);
  return { eliminados: todos.length };
}

function accionAtajoTokenCrear() {
  var tk = tokenAleatorio(32);
  PropertiesService.getScriptProperties().setProperty('ATAJO_TOKEN', tk);
  auditar('atajo.tokenCrear', '_meta', '', null, { creado: true });
  CTX.escribio = true;
  return { token: tk, aviso: 'Guárdalo ahora: no se vuelve a mostrar.' };
}
function accionAtajoTokenRevocar() {
  var props = PropertiesService.getScriptProperties();
  var habia = !!props.getProperty('ATAJO_TOKEN');
  props.deleteProperty('ATAJO_TOKEN');
  auditar('atajo.tokenRevocar', '_meta', '', null, { revocado: habia });
  CTX.escribio = true;
  return { revocado: habia };
}

function accionAuditoriaConsultar(p) {
  var limite = vEntero(p, 'limite', { def: 100, min: 1, max: 500 });
  var entidad = vTexto(p, 'entidad', { max: 40 });
  var entidadId = vTexto(p, 'entidad_id', { max: 80 });
  var sh = hoja('auditoria'), e = esq('auditoria');
  var ult = sh.getLastRow();
  if (ult < 2) return { filas: [] };
  var ini = Math.max(2, ult - 5000 + 1);
  var out = [];
  var vals = sh.getRange(ini, 1, ult - ini + 1, e.ncols).getValues();
  for (var i = vals.length - 1; i >= 0 && out.length < limite; i--) {
    var o = aObjeto(e, vals[i], ini + i);
    if (entidad && o.entidad !== entidad) continue;
    if (entidadId && o.entidad_id !== entidadId) continue;
    out.push(o);
  }
  return { filas: plano(out) };
}

/* ================================ 16. ATAJO IPHONE ================================ */
function accionAtajoCatalogo() {
  precargar(['ambitos', 'categorias', 'ambito_categoria', 'subcategorias', 'ambito_subcategoria', 'medios_pago']);
  var out = { moneda_base: cfg().moneda_base, monedas: monedasPermitidas(), ambitos: [], medios: [] };
  leerTodo('ambitos').filter(function (a) { return a.activo; }).sort(function (x, y) { return x.orden - y.orden; }).forEach(function (a) {
    var ent = { id: a.id, nombre: a.nombre, categorias: [] };
    leerTodo('ambito_categoria').filter(function (r) { return r.ambito_id === a.id && r.activo; }).sort(function (x, y) { return x.orden - y.orden; }).forEach(function (r) {
      var c = buscarPorId('categorias', r.categoria_id);
      if (!c) return;
      ent.categorias.push({ id: c.id, nombre: c.nombre, subcategorias: subcategoriasEfectivas(c.id, a.id).sort(function (x, y) { return x.orden - y.orden; }).map(function (s) { return { id: s.id, nombre: s.nombre }; }) });
    });
    out.ambitos.push(ent);
  });
  leerTodo('medios_pago').filter(function (m) { return m.activo; }).sort(function (x, y) { return x.orden - y.orden; }).forEach(function (m) { out.medios.push({ id: m.id, nombre: m.nombre }); });
  return out;
}
function resolverPorNombre(hojaN, valorId, valorNombre, campo, etiqueta, filtro) {
  if (valorId) return valorId;
  if (!valorNombre) return '';
  var hallados = leerTodo(hojaN).filter(function (r) { return igualesCI(r.nombre, valorNombre) && (!filtro || filtro(r)); });
  if (!hallados.length) invalido(campo, 'No encontré ' + etiqueta + ' "' + valorNombre + '".');
  return hallados[0].id;
}
function accionAtajoGasto(p) {
  precargar(['ambitos', 'categorias', 'ambito_categoria', 'subcategorias', 'ambito_subcategoria', 'medios_pago']);
  var rid = CTX.requestId ? String(CTX.requestId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : '';
  var id = vId(p, 'id') || (rid.length >= 4 ? 'atj-' + rid : uuid());
  var ya = buscarPorId('movimientos', id);
  if (ya) return { movimiento: copia(ya), existente: true };
  var ambId = resolverPorNombre('ambitos', p.ambito_id, p.ambito, 'ambito', 'el ámbito');
  var catId = resolverPorNombre('categorias', p.categoria_id, p.categoria, 'categoria', 'la categoría');
  var subId = resolverPorNombre('subcategorias', p.subcategoria_id, p.subcategoria, 'subcategoria', 'la subcategoría', function (s) { return s.categoria_id === catId; });
  var medioId = resolverPorNombre('medios_pago', p.medio_pago_id, p.medio, 'medio', 'el medio de pago');
  var datos = {
    id: id, fecha: p.fecha || hoyNegocio(), monto: p.monto, moneda: p.moneda, ambito_id: ambId, categoria_id: catId, subcategoria_id: subId,
    descripcion: p.descripcion, medio_pago_id: medioId, tipo_gasto: p.tipo_gasto, es_recurrente: p.es_recurrente, notas: p.notas
  };
  var mov = construirMovimiento(datos, null);
  mov.origen = 'atajo';
  insertar('movimientos', [mov]);
  auditar('movimiento.crear', 'movimientos', id, null, mov);
  return { movimiento: mov };
}

/* ================================== 17. IMPORTADOR ================================== */
var SINONIMOS = {
  fecha: ['fecha', 'date', 'dia'],
  monto: ['monto', 'importe', 'valor', 'amount', 'total'],
  moneda: ['moneda', 'currency', 'divisa'],
  ambito: ['ambito', 'contexto', 'ambito_gasto'],
  categoria: ['categoria', 'category', 'rubro'],
  subcategoria: ['subcategoria', 'sub_categoria', 'subcategory'],
  descripcion: ['descripcion', 'detalle', 'concepto', 'description'],
  medio: ['medio_pago', 'medio', 'medio_de_pago', 'metodo_pago', 'metodo', 'forma_pago'],
  tipo_gasto: ['tipo_gasto', 'tipo'],
  recurrente: ['recurrente', 'es_recurrente'],
  estado: ['estado', 'status'],
  notas: ['notas', 'nota', 'observaciones', 'observacion'],
  comprobante: ['comprobante', 'comprobante_url', 'url'],
  nombre: ['nombre', 'fuente', 'caja', 'name'],
  mes: ['mes', 'periodo', 'month'],
  alcance: ['alcance', 'tipo_alcance'],
  valor: ['valor', 'alcance_valor', 'alcance_id', 'referencia'],
  activo: ['activo', 'activa', 'habilitado'],
  recurrencia: ['recurrencia', 'frecuencia'],
  principal: ['principal', 'es_principal']
};
function claveColumna(s) { return claveNorm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function leerOrigen(ss, candidatas) {
  var hojasO = ss.getSheets();
  var hallada = null;
  for (var i = 0; i < hojasO.length && !hallada; i++) {
    var nombreN = claveColumna(hojasO[i].getName());
    if (candidatas.some(function (c) { return claveColumna(c) === nombreN; })) hallada = hojasO[i];
  }
  if (!hallada || hallada.getLastRow() < 2) return hallada ? { hoja: hallada.getName(), filas: [] } : null;
  var vals = hallada.getRange(1, 1, hallada.getLastRow(), hallada.getLastColumn()).getValues();
  var enc = vals[0].map(claveColumna);
  var filas = [];
  for (var r = 1; r < vals.length; r++) {
    if (vals[r].every(function (v) { return v === '' || v === null; })) continue;
    var o = { _fila: r + 1 };
    for (var c = 0; c < enc.length; c++) if (enc[c]) o[enc[c]] = vals[r][c];
    filas.push(o);
  }
  return { hoja: hallada.getName(), filas: filas };
}
function campo(fila, nombre) {
  var sin = SINONIMOS[nombre] || [nombre];
  for (var i = 0; i < sin.length; i++) {
    var v = fila[claveColumna(sin[i])];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}
function parseFechaFlexible(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CTX.tz || 'UTC', 'yyyy-MM-dd');
  var s = String(v).trim();
  var m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) s = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  else if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(s))) s = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  else return '';
  return fechaReal(s.slice(0, 10)) ? s.slice(0, 10) : '';
}
function parseMesFlexible(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CTX.tz || 'UTC', 'yyyy-MM');
  var s = String(v).trim(), m;
  if ((m = /^(\d{4})-(\d{1,2})/.exec(s))) s = m[1] + '-' + ('0' + m[2]).slice(-2);
  else if ((m = /^(\d{1,2})[\/\-](\d{4})$/.exec(s))) s = m[2] + '-' + ('0' + m[1]).slice(-2);
  else return '';
  return mesReal(s.slice(0, 7)) ? s.slice(0, 7) : '';
}
function parseMontoFlexible(v) {
  if (typeof v === 'number') return isFinite(v) ? redondear2(v) : NaN;
  var s = String(v).replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  var ultC = s.lastIndexOf(','), ultP = s.lastIndexOf('.');
  if (ultC !== -1 && ultP !== -1) s = ultC > ultP ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (ultC !== -1) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  var n = parseFloat(s);
  return isFinite(n) ? redondear2(n) : NaN;
}
function verdadero(v) {
  if (typeof v === 'boolean') return v;
  return ['true', 'si', 'sí', '1', 'x', 'yes'].indexOf(String(v).trim().toLowerCase()) !== -1;
}
function md5Hex(txt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, txt, Utilities.Charset.UTF_8).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** Prepara (y opcionalmente ejecuta) la importación desde una hoja antigua. */
function importarDesde(p, ejecutar) {
  var origenId = vTexto(p, 'origen_id', { req: true, max: 100, etiqueta: 'el identificador de la hoja origen' });
  var ssO;
  try { ssO = SpreadsheetApp.openById(origenId); } catch (e) { invalido('origen_id', 'No se pudo abrir la hoja de origen. Revisa el identificador y los permisos.'); }
  precargar(['ambitos', 'categorias', 'ambito_categoria', 'subcategorias', 'ambito_subcategoria', 'medios_pago', 'fuentes', 'fuentes_mes', 'cajas']);
  var rep = { origen: ssO.getName(), hojas: {}, a_crear: { ambitos: 0, categorias: 0, subcategorias: 0, medios: 0, fuentes: 0, fuentes_mes: 0, cajas: 0 },
    movimientos: { en_origen: 0, a_importar: 0, ya_importados: 0, sin_tipo_cambio: 0, omitidos: [] }, no_importado: [], advertencias: [] };
  var gastos = leerOrigen(ssO, ['GASTOS', 'MOVIMIENTOS']);
  var catalogo = leerOrigen(ssO, ['CATALOGO']);
  var mediosO = leerOrigen(ssO, ['MEDIOS_PAGO', 'MEDIOS']);
  var fuentesO = leerOrigen(ssO, ['FUENTES']);
  var fuentesMesO = leerOrigen(ssO, ['FUENTES_MESES', 'FUENTES_MES']);
  var cajasO = leerOrigen(ssO, ['CAJAS']);
  [['GASTOS', gastos], ['CATALOGO', catalogo], ['MEDIOS_PAGO', mediosO], ['FUENTES', fuentesO], ['FUENTES_MESES', fuentesMesO], ['CAJAS', cajasO]].forEach(function (x) {
    rep.hojas[x[0]] = x[1] ? { encontrada: x[1].hoja, filas: x[1].filas.length } : { encontrada: null, filas: 0 };
  });
  ['PRESUPUESTOS', 'PLANTILLAS_FINANCIERAS', 'CONFIG'].forEach(function (n) { if (leerOrigen(ssO, [n])) rep.no_importado.push(n + ' (se rehace desde la app: plantillas, presupuestos y ajustes)'); });
  if (!gastos) rep.advertencias.push('No se encontró la hoja GASTOS en el origen.');

  // Estructuras de catálogo (existente + por crear), con ids provisionales para la simulación
  var amb = {}, cat = {}, sub = {}, med = {}, nuevosAmb = [], nuevasCat = [], nuevasSub = [], nuevosMed = [], nuevosVinc = [];
  leerTodo('ambitos').forEach(function (a) { amb[claveNorm(a.nombre)] = a; });
  leerTodo('categorias').forEach(function (c) { cat[claveNorm(c.nombre)] = c; });
  leerTodo('subcategorias').forEach(function (s) { sub[s.categoria_id + '|' + claveNorm(s.nombre)] = s; });
  leerTodo('medios_pago').forEach(function (m) { med[claveNorm(m.nombre)] = m; });
  var vinc = {};
  leerTodo('ambito_categoria').forEach(function (r) { vinc[r.ambito_id + '|' + r.categoria_id] = r; });
  var t = ahoraIso();
  function meta() { return { creado_en: t, actualizado_en: t, version: 1 }; }
  function ambitoDe(nombre) {
    var k = claveNorm(nombre);
    if (amb[k]) return amb[k];
    var m = meta();
    var a = { id: uuid(), nombre: String(nombre).trim(), icono: 'folder', color: colorAuto(nombre), orden: Object.keys(amb).length + 1, activo: true, creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: 1 };
    amb[k] = a; nuevosAmb.push(a); return a;
  }
  function categoriaDe(nombre) {
    var k = claveNorm(nombre);
    if (cat[k]) return cat[k];
    var sug = sugerirApariencia(String(nombre).trim());
    var m = meta();
    var c = { id: uuid(), nombre: String(nombre).trim(), icono: sug.icono, color: sug.color, creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: 1 };
    cat[k] = c; nuevasCat.push(c); return c;
  }
  function subDe(c, nombre) {
    var k = c.id + '|' + claveNorm(nombre);
    if (sub[k]) return sub[k];
    var m = meta();
    var hermanas = Object.keys(sub).filter(function (x) { return x.indexOf(c.id + '|') === 0; }).length;
    var s = { id: uuid(), categoria_id: c.id, nombre: String(nombre).trim(), icono: sugerirApariencia(String(nombre).trim()).icono, orden: hermanas + 1, activo: true, creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: 1 };
    sub[k] = s; nuevasSub.push(s); return s;
  }
  function vincular(a, c) {
    var k = a.id + '|' + c.id;
    if (vinc[k]) return;
    var f = { id: uuid(), ambito_id: a.id, categoria_id: c.id, orden: Object.keys(vinc).filter(function (x) { return x.indexOf(a.id + '|') === 0; }).length + 1, activo: true };
    vinc[k] = f; nuevosVinc.push(f);
  }
  function medioDe(nombre) {
    var k = claveNorm(nombre);
    if (med[k]) return med[k];
    var m = meta();
    var x = { id: uuid(), nombre: String(nombre).trim(), tipo: 'otro', icono: 'wallet', color: colorAuto(nombre), orden: Object.keys(med).length + 1, activo: true, creado_en: m.creado_en, actualizado_en: m.actualizado_en, version: 1 };
    med[k] = x; nuevosMed.push(x); return x;
  }

  if (catalogo) catalogo.filas.forEach(function (f) {
    var an = campo(f, 'ambito'), cn = campo(f, 'categoria'), sn = campo(f, 'subcategoria');
    if (!an || !cn) return;
    var a = ambitoDe(an), c = categoriaDe(cn);
    vincular(a, c);
    if (sn) subDe(c, sn);
  });
  if (mediosO) mediosO.filas.forEach(function (f) { var n = campo(f, 'nombre') || f.medio; if (n) medioDe(n); });

  // Movimientos
  var existentes = {};
  if (gastos && gastos.filas.length) leerColumna('movimientos', 'id').forEach(function (x) { existentes[x] = true; });
  var vistas = {}, movs = [];
  var permitidas = monedasPermitidas();
  if (gastos) gastos.filas.forEach(function (f) {
    rep.movimientos.en_origen++;
    var fecha = parseFechaFlexible(campo(f, 'fecha'));
    var monto = parseMontoFlexible(campo(f, 'monto'));
    var moneda = String(campo(f, 'moneda') || cfg().moneda_base).trim().toUpperCase();
    var omitir = function (motivo) { if (rep.movimientos.omitidos.length < 50) rep.movimientos.omitidos.push({ fila: f._fila, motivo: motivo }); };
    if (!fecha) return omitir('fecha inválida');
    if (!(monto > 0)) return omitir('monto inválido');
    if (permitidas.indexOf(moneda) === -1) return omitir('moneda no permitida: ' + moneda);
    var an = campo(f, 'ambito'), cn = campo(f, 'categoria'), sn = campo(f, 'subcategoria'), mn = campo(f, 'medio');
    if (!an) return omitir('sin ámbito');
    if (!cn) return omitir('sin categoría');
    if (!mn) return omitir('sin medio de pago');
    var desc = String(campo(f, 'descripcion')).trim().slice(0, 200);
    var firma = [fecha, monto, moneda, claveNorm(an), claveNorm(cn), claveNorm(sn), claveNorm(desc), claveNorm(mn)].join('|');
    vistas[firma] = (vistas[firma] || 0) + 1;
    var id = 'imp-' + md5Hex(firma + '#' + vistas[firma]);
    if (existentes[id]) { rep.movimientos.ya_importados++; return; }
    var a = ambitoDe(an), c = categoriaDe(cn);
    vincular(a, c);
    var s = sn ? subDe(c, sn) : null;
    var m = medioDe(mn);
    var tc = null, base = null;
    if (moneda === cfg().moneda_base) { tc = 1; base = monto; }
    else if (Number(cfg()['tipo_cambio_' + moneda]) > 0) { tc = Number(cfg()['tipo_cambio_' + moneda]); base = redondear2(monto * tc); }
    else rep.movimientos.sin_tipo_cambio++;
    var tg = String(campo(f, 'tipo_gasto')).trim().toLowerCase();
    var url = String(campo(f, 'comprobante')).trim();
    var estadoO = String(campo(f, 'estado')).trim().toLowerCase();
    movs.push({
      id: id, fecha: fecha, monto: monto, moneda: moneda, tipo_cambio: tc, monto_base: base, ambito_id: a.id, categoria_id: c.id, subcategoria_id: s ? s.id : '',
      descripcion: desc, medio_pago_id: m.id, tipo_gasto: ENUMS.tipo_gasto.indexOf(tg) !== -1 ? tg : 'variable', es_recurrente: verdadero(campo(f, 'recurrente')),
      estado: estadoO === 'anulado' || estadoO === 'cancelado' ? 'anulado' : 'activo', origen: 'importacion', plantilla_id: '', lote_id: '',
      comprobante_url: /^https:\/\/\S{3,480}$/.test(url) ? url : '', notas: String(campo(f, 'notas')).trim().slice(0, 1000), creado_en: t, actualizado_en: t, version: 1
    });
  });
  rep.movimientos.a_importar = movs.length;

  // Fuentes, fuentes_mes y cajas (definiciones)
  var fuentesNuevas = [], fmNuevas = [], cajasNuevas = [];
  var fuentePorNombre = {};
  leerTodo('fuentes').forEach(function (x) { fuentePorNombre[claveNorm(x.nombre)] = x; });
  if (fuentesO) fuentesO.filas.forEach(function (f) {
    var n = String(campo(f, 'nombre')).trim();
    if (!n || fuentePorNombre[claveNorm(n)]) return;
    var monto = parseMontoFlexible(campo(f, 'monto'));
    var mon = String(campo(f, 'moneda') || cfg().moneda_base).trim().toUpperCase();
    var recur = claveNorm(campo(f, 'recurrencia')).indexOf('unic') === 0 ? 'unica' : 'mensual';
    var mesIni = parseMesFlexible(campo(f, 'mes')) || hoyNegocio().slice(0, 7);
    var o = { id: uuid(), nombre: n.slice(0, 60), monto_defecto: monto >= 0 ? monto : 0, moneda: permitidas.indexOf(mon) !== -1 ? mon : cfg().moneda_base, recurrencia: recur, mes_inicio: mesIni, mes_fin: recur === 'unica' ? mesIni : '',
      icono: 'wallet', color: colorAuto(n), orden: Object.keys(fuentePorNombre).length + 1, activo: campo(f, 'activo') === '' ? true : verdadero(campo(f, 'activo')), es_principal: verdadero(campo(f, 'principal')), creado_en: t, actualizado_en: t, version: 1 };
    fuentePorNombre[claveNorm(n)] = o; fuentesNuevas.push(o);
  });
  if (fuentesMesO) fuentesMesO.filas.forEach(function (f) {
    var fu = fuentePorNombre[claveNorm(campo(f, 'nombre'))];
    var mes = parseMesFlexible(campo(f, 'mes')), monto = parseMontoFlexible(campo(f, 'monto'));
    if (!fu || !mes || !(monto >= 0)) return;
    var ya = leerTodo('fuentes_mes').some(function (r) { return r.fuente_id === fu.id && r.mes === mes; }) || fmNuevas.some(function (r) { return r.fuente_id === fu.id && r.mes === mes; });
    if (!ya) fmNuevas.push({ id: uuid(), fuente_id: fu.id, mes: mes, monto: monto, estado: 'aplicada', actualizado_en: t });
  });
  var cajaPorNombre = {};
  leerTodo('cajas').forEach(function (x) { cajaPorNombre[claveNorm(x.nombre)] = x; });
  if (cajasO) cajasO.filas.forEach(function (f) {
    var n = String(campo(f, 'nombre')).trim();
    if (!n || cajaPorNombre[claveNorm(n)]) return;
    var alc = claveNorm(campo(f, 'alcance')).replace(/ /g, '_');
    var ref = String(campo(f, 'valor')).trim();
    var alcance = ENUMS.alcance.indexOf(alc) !== -1 ? alc : (alc === 'medio' ? 'medio_pago' : '');
    if (!alcance || !ref) { rep.advertencias.push('Caja "' + n + '": alcance no reconocido, se omite.'); return; }
    var ent = null;
    if (alcance === 'ambito') ent = amb[claveNorm(ref)];
    else if (alcance === 'categoria') ent = cat[claveNorm(ref)];
    else if (alcance === 'medio_pago') ent = med[claveNorm(ref)];
    else { var partes = ref.split(/\s*[›>\/]\s*/); var cc = cat[claveNorm(partes[0])]; ent = cc && partes[1] ? sub[cc.id + '|' + claveNorm(partes[1])] : null; }
    if (!ent) { rep.advertencias.push('Caja "' + n + '": no se encontró "' + ref + '" en el catálogo, se omite.'); return; }
    var monto = parseMontoFlexible(campo(f, 'monto'));
    var o = { id: uuid(), nombre: n.slice(0, 60), alcance: alcance, alcance_id: ent.id, monto_defecto: monto >= 0 ? monto : 0, icono: ent.icono || 'piggy-bank', color: ent.color || colorAuto(n), descripcion: '', orden: Object.keys(cajaPorNombre).length + 1,
      activo: campo(f, 'activo') === '' ? true : verdadero(campo(f, 'activo')), creado_en: t, actualizado_en: t, version: 1 };
    cajaPorNombre[claveNorm(n)] = o; cajasNuevas.push(o);
  });

  rep.a_crear = { ambitos: nuevosAmb.length, categorias: nuevasCat.length, subcategorias: nuevasSub.length, medios: nuevosMed.length, fuentes: fuentesNuevas.length, fuentes_mes: fmNuevas.length, cajas: cajasNuevas.length };
  rep.modo = ejecutar ? 'ejecucion' : 'simulacion';
  if (!ejecutar) return rep;

  // Ejecución: primero el respaldo; si falla, no se escribe nada.
  try { rep.respaldo = crearCopiaRespaldo(); } catch (err) { fallar('SERVER_ERROR', 'No se pudo crear el respaldo previo, así que no se importó nada. Revisa los permisos de Drive.'); }
  insertar('ambitos', nuevosAmb);
  insertar('categorias', nuevasCat);
  insertar('ambito_categoria', nuevosVinc);
  insertar('subcategorias', nuevasSub);
  insertar('medios_pago', nuevosMed);
  insertar('fuentes', fuentesNuevas);
  insertar('fuentes_mes', fmNuevas);
  insertar('cajas', cajasNuevas);
  for (var i = 0; i < movs.length; i += 1000) insertar('movimientos', movs.slice(i, i + 1000));
  auditar('importar.ejecutar', 'movimientos', '', null, { importados: movs.length, a_crear: rep.a_crear });
  rep.importados = movs.length;
  return rep;
}
function accionImportarSimular(p) { return importarDesde(p, false); }
function accionImportarEjecutar(p) { return importarDesde(p, true); }

/* ================================ 18. DESPACHO ================================ */
var ACCIONES = {
  'bootstrap': { fn: accionBootstrap, escribe: false },
  'cambios': { fn: accionCambios, escribe: false },
  'diagnostico': { fn: accionDiagnostico, escribe: false },
  'exportar.csv': { fn: accionExportarCsv, escribe: false },
  'auditoria.consultar': { fn: accionAuditoriaConsultar, escribe: false },
  'importar.simular': { fn: accionImportarSimular, escribe: false },
  'atajo.catalogo': { fn: accionAtajoCatalogo, escribe: false },

  'movimiento.guardar': { fn: accionMovimientoGuardar, escribe: true },
  'movimiento.anular': { fn: accionMovimientoAnular, escribe: true },
  'movimiento.restaurar': { fn: accionMovimientoRestaurar, escribe: true },
  'movimientos.lote': { fn: accionMovimientosLote, escribe: true },
  'movimientos.estadoLote': { fn: accionMovimientosEstadoLote, escribe: false },
  'movimientos.accionLote': { fn: accionMovimientosAccionLote, escribe: true },
  'movimientos.reordenar': { fn: accionMovimientosReordenar, escribe: true },

  'ambito.guardar': { fn: accionAmbitoGuardar, escribe: true },
  'ambito.reordenar': { fn: accionAmbitoReordenar, escribe: true },
  'categoria.guardar': { fn: accionCategoriaGuardar, escribe: true },
  'categoria.reordenar': { fn: accionCategoriaReordenar, escribe: true },
  'categoria.eliminar': { fn: accionCategoriaEliminar, escribe: true },
  'subcategoria.guardar': { fn: accionSubcategoriaGuardar, escribe: true },
  'subcategoria.reordenar': { fn: accionSubcategoriaReordenar, escribe: true },
  'subcategoria.eliminar': { fn: accionSubcategoriaEliminar, escribe: true },
  'medio.guardar': { fn: accionMedioGuardar, escribe: true },
  'medio.reordenar': { fn: accionMedioReordenar, escribe: true },
  'medio.eliminar': { fn: accionMedioEliminar, escribe: true },

  'fuente.guardar': { fn: accionFuenteGuardar, escribe: true },
  'fuente.eliminar': { fn: accionFuenteEliminar, escribe: true },
  'fuente.reordenar': { fn: accionFuenteReordenar, escribe: true },
  'fuenteMes.aplicar': { fn: accionFuenteMesAplicar, escribe: true },
  'fuenteMes.omitir': { fn: accionFuenteMesOmitir, escribe: true },
  'fuenteMes.quitar': { fn: accionFuenteMesQuitar, escribe: true },
  'caja.guardar': { fn: accionCajaGuardar, escribe: true },
  'caja.eliminar': { fn: accionCajaEliminar, escribe: true },
  'caja.reordenar': { fn: accionCajaReordenar, escribe: true },
  'cajaMes.aplicar': { fn: accionCajaMesAplicar, escribe: true },
  'cajaMes.omitir': { fn: accionCajaMesOmitir, escribe: true },
  'cajaMes.quitar': { fn: accionCajaMesQuitar, escribe: true },
  'mes.copiarDeAnterior': { fn: accionMesCopiarDeAnterior, escribe: true },

  'plantilla.guardar': { fn: accionPlantillaGuardar, escribe: true },
  'plantilla.eliminar': { fn: accionPlantillaEliminar, escribe: true },
  'plantilla.reordenar': { fn: accionPlantillaReordenar, escribe: true },
  'plantilla.aplicarMes': { fn: accionPlantillaAplicarMes, escribe: true },
  'compromiso.guardar': { fn: accionCompromisoGuardar, escribe: true },
  'compromiso.eliminar': { fn: accionCompromisoEliminar, escribe: true },
  'compromiso.vincular': { fn: accionCompromisoVincular, escribe: true },
  'compromiso.desvincular': { fn: accionCompromisoDesvincular, escribe: true },

  'revision.guardar': { fn: accionRevisionGuardar, escribe: true },
  'conciliacion.verificar': { fn: accionConciliacionVerificar, escribe: true },
  'conciliacion.seguimiento': { fn: accionConciliacionSeguimiento, escribe: true },
  'grupoFondos.guardar': { fn: accionGrupoFondosGuardar, escribe: true },
  'planificacion.guardar': { fn: accionPlanificacionGuardar, escribe: true },
  'config.guardar': { fn: accionConfigGuardar, escribe: true },

  'setup': { fn: function () { return setup(); }, escribe: true },
  'repararHoja': { fn: accionRepararHoja, escribe: true },
  'respaldo.crear': { fn: accionRespaldoCrear, escribe: true },
  'respaldo.carpeta': { fn: accionRespaldoCarpeta, escribe: true },
  'importar.ejecutar': { fn: accionImportarEjecutar, escribe: true },
  'datosPrueba.generar': { fn: accionDatosPruebaGenerar, escribe: true },
  'datosPrueba.borrar': { fn: accionDatosPruebaBorrar, escribe: true },
  'atajo.tokenCrear': { fn: accionAtajoTokenCrear, escribe: true },
  'atajo.tokenRevocar': { fn: accionAtajoTokenRevocar, escribe: true },
  'atajo.gasto': { fn: accionAtajoGasto, escribe: true }
};

function respuestaError(err, t0, sinGeneracion) {
  var code = 'SERVER_ERROR', message = 'Ocurrió un error interno. Intenta de nuevo en unos segundos.', campo, detalle;
  if (err instanceof ApiError) {
    code = err.code; message = err.message; campo = err.campo; detalle = err.detalle;
  } else {
    var texto = String(err && err.message ? err.message : err);
    console.error('SERVER_ERROR: ' + (err && err.stack ? err.stack : texto)); // el detalle queda solo en los logs
    if (/quota|too many times|service invoked too many/i.test(texto)) { code = 'QUOTA'; message = 'Se alcanzó el límite de uso de Google. Espera unos minutos.'; }
  }
  var r = { ok: false, error: { code: code, message: message }, ms: Date.now() - t0, version: VERSION };
  if (campo) r.error.campo = campo;
  if (detalle !== undefined) r.error.detalle = detalle;
  if (!sinGeneracion && CTX) { try { r.generacion = generacion(); } catch (e) { /* sin generación */ } }
  return r;
}

function procesar(req) {
  var t0 = Date.now();
  var esAuth = false;
  try {
    if (!esObjeto(req)) invalido('', 'Cuerpo de la petición inválido.');
    var accion = typeof req.action === 'string' ? req.action : '';
    esAuth = true;
    var tipoToken = autenticar(req.token, accion);
    esAuth = false;
    limitarVelocidad();
    var def = Object.prototype.hasOwnProperty.call(ACCIONES, accion) ? ACCIONES[accion] : null;
    if (!def) invalido('action', 'Acción desconocida.');
    var payload = req.payload === undefined || req.payload === null ? {} : req.payload;
    if (!esObjeto(payload)) invalido('payload', 'El payload debe ser un objeto.');
    nuevoCtx(tipoToken === 'atajo' ? 'atajo' : 'web');
    CTX.requestId = typeof req.requestId === 'string' ? req.requestId : '';
    if (!def.escribe) {
      if (PropertiesService.getScriptProperties().getProperty('OP_EN_CURSO')) recuperarConBloqueo();
      var data = def.fn(payload);
      return { ok: true, data: data, ms: Date.now() - t0, version: VERSION, generacion: generacion() };
    }
    var rid = req.requestId;
    if (typeof rid !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(rid)) invalido('requestId', 'Falta el identificador de la petición (requestId).');
    var huella = huellaPeticion(accion, payload);
    var previa = idemObtener(rid);
    if (previa) return repetida(huella, previa);
    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch (e) { fallar('BUSY', 'El sistema está ocupado. Reintenta en unos segundos.'); }
    try {
      recuperarSiHaceFalta();
      previa = idemObtener(rid);
      if (previa) return repetida(huella, previa);
      var dur = buscarOperacion(rid);
      if (dur && dur.cab && dur.cab.s === 'ok') {
        var guardada = { h: dur.cab.h, r: dur.cab.r };
        idemGuardar(rid, guardada.h, guardada.r);
        return repetida(huella, guardada);
      }
      CTX.op = { rid: rid, huella: huella, accion: accion, t: ahoraIso(), entradas: [], texto: '', filasU: [], preparada: false, filaCab: dur ? dur.fila : 0 };
      var resultado, gen, resp;
      try {
        resultado = def.fn(payload);
        volcarAuditoria();
        gen = CTX.escribio ? nuevaGeneracion() : generacion();
        resp = { ok: true, data: resultado, ms: Date.now() - t0, version: VERSION, generacion: gen };
        diarioConfirmar(resp); // punto de commit: si falla, se revierte y el cliente recibe un error
      } catch (err) {
        if (CTX.op && CTX.op.preparada) {
          try { revertirOperacion(err); } catch (e2) {
            // Si ni la reversión pudo completarse, OP_EN_CURSO sigue marcado: la próxima petición la termina.
            console.error('No se pudo revertir ' + accion + ': ' + (e2 && e2.message));
          }
        }
        throw err;
      }
      try { idemGuardar(rid, huella, resp); } catch (e3) { /* la caché es opcional: queda el registro durable */ }
      try { rotarAuditoria(); recortarOperaciones(); } catch (e4) { console.error('Mantenimiento posterior: ' + (e4 && e4.message)); }
      return resp;
    } finally {
      CTX.op = null;
      lock.releaseLock();
    }
  } catch (err) {
    return respuestaError(err, t0, esAuth || (err instanceof ApiError && err.code === 'AUTH'));
  }
}
/** Las lecturas no bloquean, salvo que una ejecución anterior haya muerto a mitad de una operación. */
function recuperarConBloqueo() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { fallar('BUSY', 'El sistema está terminando de recuperar una operación interrumpida. Reintenta en unos segundos.'); }
  try { recuperarSiHaceFalta(); } finally { lock.releaseLock(); }
}

function salidaJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  return salidaJson({ ok: true, ping: true, version: VERSION });
}
function doPost(e) {
  var t0 = Date.now();
  var cuerpo = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
  if (!cuerpo || cuerpo.length > 1000000) return salidaJson({ ok: false, error: { code: 'VALIDATION', message: 'Cuerpo de la petición vacío o demasiado grande.' }, ms: Date.now() - t0, version: VERSION });
  var req;
  try { req = JSON.parse(cuerpo); } catch (err) { return salidaJson({ ok: false, error: { code: 'VALIDATION', message: 'El cuerpo no es JSON válido.' }, ms: Date.now() - t0, version: VERSION }); }
  return salidaJson(procesar(req));
}
