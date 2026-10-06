// ============================================================
// PLANTILLA DE COTIZACIÓN — MASKEL PERÚ S.A.C.
// ============================================================
// Se compila pasando datos por sys.inputs (ver pdf_service.py):
//   typst.compile("plantilla.typ", sys_inputs = {
//       "numero": "COT-2026-0045",
//       "fecha": "Lima, 21 de setiembre de 2026",
//       "validez_dias": "15",
//       "moneda": "USD",
//       "cliente_razon_social": "...",
//       "cliente_ruc": "...",
//       "cliente_nombre": "...",
//       "cliente_correo": "...",
//       "productos": "[{...}, {...}]"   <- JSON string, ver estructura abajo
//       "forma_pago": "...",
//       "tiempo_entrega": "...",
//       "logo_path": "logo_maskel.png"  <- opcional
//   })
//
// Estructura esperada de cada producto en el JSON de "productos":
//   {
//     "tipo": "catalogo" | "a_medida",
//     "descripcion": "M Clips SS304, compatible con FRP 38x38x38mm",
//     "detalle": "Medida: 1000x4038mm · Espesor: 38mm · Resina: Vinilester",  <- opcional, solo a_medida
//     "unidad": "plancha",   <- opcional, default "unidad". Ej: plancha, unidad, par, kg, m
//     "cantidad": 200,
//     "precio_unitario": 151.84
//   }
// ============================================================

// ---------- Datos fijos de la empresa (no cambian por cotización) ----------
#let EMPRESA = (
  nombre: "MAKSEL PERU S.A.C.",
  ruc: "20548480303",
  direccion: "Av. Huarangal Parcela 42, Lote 25, Carabayllo, Lima",
  telefono: "(+51) 984 649 227",
  correo: "ventas@maskelperu.com",
  web: "www.maskelperu.com",
)

#let AZUL = rgb("#0B2A4A")
#let AZUL_CLARO = rgb("#EDF2F7")
#let GRIS = rgb("#5B6472")

// ---------- Lectura de datos variables (con valores de ejemplo por defecto) ----------
#let numero = sys.inputs.at("numero", default: "—")
#let fecha = sys.inputs.at("fecha", default: "—")
#let validez_dias = sys.inputs.at("validez_dias", default: "15")
#let moneda = sys.inputs.at("moneda", default: "USD")
#let simbolo = if moneda == "USD" { "US$" } else { "S/" }

#let cliente_razon_social = sys.inputs.at("cliente_razon_social", default: "—")
#let cliente_ruc = sys.inputs.at("cliente_ruc", default: "—")
#let cliente_nombre = sys.inputs.at("cliente_nombre", default: "—")
#let cliente_correo = sys.inputs.at("cliente_correo", default: "—")

#let forma_pago = sys.inputs.at("forma_pago", default: "50% adelanto, 50% contra entrega")
#let tiempo_entrega = sys.inputs.at("tiempo_entrega", default: "A coordinar según disponibilidad de stock")
#let lugar_entrega = sys.inputs.at("lugar_entrega", default: "Lima Metropolitana / Coordinar interior del país")

#let incluye_igv = sys.inputs.at("incluye_igv", default: "true") == "true"

#let productos_json = sys.inputs.at("productos", default: "[]")
#let productos = json(bytes(productos_json))

#let logo_path = sys.inputs.at("logo_path", default: "")

// ---------- Configuración de página ----------
#set page(
  paper: "a4",
  margin: (top: 2.2cm, bottom: 2cm, left: 1.8cm, right: 1.8cm),
  footer: context [
    #set text(size: 8pt, fill: GRIS)
    #line(length: 100%, stroke: 0.5pt + AZUL_CLARO)
    #v(2pt)
    #grid(
      columns: (1fr, 1fr),
      [#EMPRESA.web #h(6pt) · #h(6pt) #EMPRESA.correo],
      align(right)[Página #counter(page).display() de #context counter(page).final().first()]
    )
  ]
)
#set text(font: "Arial", size: 10.2pt, fill: rgb("#1A1A1A"))
#set par(justify: false, leading: 0.72em)

// ============================================================
// ENCABEZADO
// ============================================================
// NOTA sobre el logo: es horizontal (ancho ≈ 2.6x el alto) y ya trae el
// nombre "MASKEL PERÚ S.A.C." escrito dentro de la imagen. Por eso:
//  - se dimensiona por ANCHO (no por alto), para no deformarlo ni dejarlo diminuto.
//  - NO se repite el nombre de la empresa en texto al lado, para evitar
//    redundancia visual (el logo ya lo dice).
//  - usa la versión con fondo transparente (logo_maskel_transparente.png);
//    el archivo original tiene un rectángulo azul marino de fondo que,
//    puesto sobre el header blanco, se vería como una caja oscura pegada.
#grid(
  columns: (auto, 1fr, auto),
  column-gutter: 12pt,
  align: (left + top, left + top, right + top),

  // Logo — ancho fijo, alto proporcional automático
  if logo_path != "" { image(logo_path, width: 3.5cm, height: 1.35cm, fit: "cover") } else { box(width: 3.5cm, height: 1.35cm) },

  // Datos de contacto (sin repetir el nombre, ya está en el logo)
  align(left + top)[
    #text(size: 8.2pt, fill: GRIS)[
      RUC #EMPRESA.ruc · #EMPRESA.direccion \
      #EMPRESA.telefono · #EMPRESA.correo
    ]
  ],

  // Bloque de cotización
  block(
    fill: AZUL,
    inset: 10pt,
    radius: 3pt,
  )[
    #set text(fill: white)
    #text(size: 11pt, weight: "bold")[COTIZACIÓN] \
    #text(size: 9pt)[N° #numero] \
    #text(size: 9pt)[#fecha]
  ]
)

#v(8pt)
#line(length: 100%, stroke: 1.2pt + AZUL)
#v(8pt)

// ============================================================
// DATOS DEL CLIENTE
// ============================================================
#block(
  fill: AZUL_CLARO,
  inset: 10pt,
  radius: 3pt,
  width: 100%,
)[
  #text(size: 9pt, weight: "bold", fill: AZUL)[CLIENTE]
  #v(4pt)
  #grid(
    columns: (1fr, 1fr),
    row-gutter: 4pt,
    [#text(size: 9.2pt)[#text(weight: "bold")[Nombre:] #cliente_nombre]],
    [#text(size: 9.2pt)[#text(weight: "bold")[Empresa:] #cliente_razon_social]],
    [#text(size: 9.2pt)[#text(weight: "bold")[RUC:] #cliente_ruc]],
    [#text(size: 9.2pt)[#text(weight: "bold")[Correo:] #cliente_correo]],
  )
]

#v(10pt)

// ============================================================
// TABLA DE PRODUCTOS
// ============================================================
#let fmt_moneda(x) = {
  // Siempre 2 decimales + separador de miles, ej: US$ 30,368.00
  let redondeado = calc.round(x, digits: 2)
  let partes = str(redondeado).split(".")
  let entero = partes.at(0)
  let decimales = if partes.len() > 1 { partes.at(1) } else { "0" }
  decimales = decimales + "00"
  decimales = decimales.slice(0, count: 2)

  // Insertar separador de miles en la parte entera
  let neg = entero.starts-with("-")
  if neg { entero = entero.slice(1) }
  let digitos = entero.clusters()
  let con_comas = ()
  let n = digitos.len()
  for (i, d) in digitos.enumerate() {
    if i > 0 and calc.rem(n - i, 3) == 0 {
      con_comas.push(",")
    }
    con_comas.push(d)
  }
  let entero_fmt = con_comas.join()
  if neg { entero_fmt = "-" + entero_fmt }

  simbolo + " " + entero_fmt + "." + decimales
}

#let fila_producto(item, idx) = {
  let desc = item.at("descripcion", default: "")
  let detalle = item.at("detalle", default: "")
  let unidad = item.at("unidad", default: "unidad")
  let cant = item.at("cantidad", default: 0)
  let pu = item.at("precio_unitario", default: 0)
  let total_linea = cant * pu

  (
    align(center)[#str(idx)],
    [
      #text(weight: "medium")[#desc]
      #if detalle != "" {
        v(2pt)
        text(size: 7.8pt, fill: GRIS)[#detalle]
      }
    ],
    align(center)[#text(size: 8.5pt, fill: GRIS)[#unidad]],
    align(center)[#str(cant)],
    align(right)[#fmt_moneda(pu)],
    align(right)[#text(weight: "bold")[#fmt_moneda(total_linea)]],
  )
}

#table(
  columns: (5%, 1fr, 11%, 10%, 16%, 16%),
  stroke: 0.5pt + rgb("#D0D5DD"),
  inset: 7pt,
  align: horizon,

  table.header(
    table.cell(fill: AZUL)[#text(fill: white, size: 8.5pt, weight: "bold")[N°]],
    table.cell(fill: AZUL)[#text(fill: white, size: 8.5pt, weight: "bold")[Descripción]],
    table.cell(fill: AZUL)[#text(fill: white, size: 8.5pt, weight: "bold")[Unidad]],
    table.cell(fill: AZUL)[#text(fill: white, size: 8.5pt, weight: "bold")[Cant.]],
    table.cell(fill: AZUL)[#text(fill: white, size: 8.5pt, weight: "bold")[P. Unit.]],
    table.cell(fill: AZUL)[#text(fill: white, size: 8.5pt, weight: "bold")[Total]],
  ),

  ..productos.enumerate().map(((idx, item)) => fila_producto(item, idx + 1)).flatten()
)

// ============================================================
// TOTALES
// ============================================================
#let subtotal = productos.map(p => p.at("cantidad", default: 0) * p.at("precio_unitario", default: 0)).sum(default: 0)
#let igv = if incluye_igv { subtotal * 0.18 } else { 0 }
#let total = subtotal + igv

#v(8pt)
#align(right)[
  #block(width: 45%)[
    #table(
      columns: (1fr, auto),
      stroke: none,
      inset: (x: 6pt, y: 5pt),
      align: (left, right),

      [Subtotal], [#fmt_moneda(subtotal)],
      ..if incluye_igv { ([IGV (18%)], [#fmt_moneda(igv)]) } else { () },
      table.hline(stroke: 1pt + AZUL),
      [#text(weight: "bold")[TOTAL]], [#text(weight: "bold", size: 11pt, fill: AZUL)[#fmt_moneda(total)]],
    )
  ]
]

#v(14pt)

// ============================================================
// CONDICIONES COMERCIALES
// ============================================================
#block(
  stroke: 0.5pt + rgb("#D0D5DD"),
  inset: 10pt,
  radius: 3pt,
  width: 100%,
)[
  #text(size: 8.5pt, weight: "bold", fill: AZUL)[CONDICIONES COMERCIALES]
  #v(6pt)
  #set text(size: 8.8pt)
  #grid(
    columns: (1fr, 1fr),
    row-gutter: 6pt,
    [*Forma de pago:* #forma_pago],
    [*Tiempo de entrega:* #tiempo_entrega],
    [*Lugar de entrega:* #lugar_entrega],
    [*Validez de la cotización:* #validez_dias días calendario],
  )
]

#v(10pt)

#text(size: 8pt, fill: GRIS, style: "italic")[
  Los precios no incluyen instalación salvo indicación expresa. Cotización sujeta a disponibilidad de stock al momento de la confirmación del pedido.
]

#v(22pt)

// ============================================================
// FIRMA / CONTACTO
// ============================================================
#grid(
  columns: (1fr, 1fr),
  [
    #line(length: 60%, stroke: 0.5pt + GRIS)
    #v(2pt)
    #text(size: 8.5pt)[Atendido por: #EMPRESA.nombre]
  ],
  align(right)[
    #text(size: 8.5pt, fill: GRIS)[
      ¿Consultas sobre esta cotización? \
      Escríbenos por WhatsApp o al correo indicado arriba.
    ]
  ]
)
