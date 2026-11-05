import { CATALOG, findProduct, type Product } from "../../data/catalog";

export type ConfianzaItem = "exacta" | "aproximada" | "manual";

export interface ParsedItem {
  producto_id?: string;
  nombre: string;
  detalle?: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  confianza: ConfianzaItem;
}

export interface ParsedQuote {
  cliente: {
    nombre?: string;
    empresa?: string;
    ruc_dni?: string;
    correo?: string;
    telefono?: string;
    ciudad?: string;
  };
  items: ParsedItem[];
  textoNoReconocido: string[];
}

const MAX_LINEAS = 400;

const sinTildes = (valor: string): string =>
  valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalizar = (valor: string): string =>
  sinTildes(valor)
    .toLowerCase()
    .replace(/[×✕✖]/g, "x")
    .replace(/\s+/g, " ")
    .trim();

const aNumero = (valor: string): number => Number(valor.replace(",", "."));

/** Convierte metros a milímetros cuando el valor parece expresado en metros. */
const aMilimetros = (valor: number): number => {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return valor < 50 ? Math.round(valor * 1000) : Math.round(valor);
};

const DIMENSION_REGEX =
  /(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:mm)?\s*[x×*]\s*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:mm)?/i;
const DIMENSION_GLOBAL = new RegExp(DIMENSION_REGEX.source, "gi");
const ESPESOR_REGEX = /\b(?:espesor|e)\s*:?\s*(25|38)\s*(?:mm)?\b|\b(25|38)\s*mm\b|\bh\s*-?\s*(25|38)\b/i;
const ESPESOR_GLOBAL = new RegExp(ESPESOR_REGEX.source, "gi");
const PT_REGEX = /\bpt\s*[-_]?\s*0*(\d{1,2})\b/i;
const PT_GLOBAL = new RegExp(PT_REGEX.source, "gi");

const esEtiquetaCliente =
  /^\s*[-•*]?\s*(nombre(?:\s+completo)?|cliente|empresa|razon\s+social|compania|ruc(?:\s*\/\s*dni)?|dni|documento|correo(?:\s+electronico)?|email|e-mail|celular|telefono|whatsapp|tel|movil|ciudad|distrito|ubicacion)\s*:/i;

const ETIQUETAS_CLIENTE: Array<{
  campo: keyof ParsedQuote["cliente"];
  etiquetas: RegExp;
}> = [
  { campo: "nombre", etiquetas: /^(nombre(?:\s+completo)?|cliente)$/ },
  { campo: "empresa", etiquetas: /^(empresa|razon\s+social|compania|compania)$/ },
  { campo: "ruc_dni", etiquetas: /^(ruc(?:\s*\/\s*dni)?|dni|documento)$/ },
  { campo: "correo", etiquetas: /^(correo(?:\s+electronico)?|email|e-mail)$/ },
  { campo: "telefono", etiquetas: /^(celular|telefono|whatsapp|tel|movil)$/ },
  { campo: "ciudad", etiquetas: /^(ciudad|distrito|ubicacion)$/ },
];

const esRuido = (linea: string): boolean => {
  const n = normalizar(linea);
  if (!n) return true;
  if (
    /^(codigo|cod|total|subtotal|igv|flete|moneda|fecha|validez|vigencia|precio|precios|us\$|s\/)\b/.test(
      n,
    )
  ) {
    return true;
  }
  if (/^(productos?|datos?( de contacto)?|items?|detalle de (la )?cotizacion)\s*:?\s*$/.test(n)) {
    return true;
  }
  if (
    /^(hola|buenos dias|buenas tardes|buenas noches|gracias|saludos|quedo atento|atentamente|adjunto)\b/.test(
      n,
    )
  ) {
    return true;
  }
  return false;
};

const esBullet = (linea: string): boolean =>
  /^\s*[-•*]\s+/.test(linea) || /^\s*\d+[.)]\s+/.test(linea);

const limpiarBullet = (linea: string): string =>
  linea.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim();

const PRODUCTO_KEYWORDS =
  /\b(rejillas?|grating|frp|duchas?|clips?|grapas?|paneles?|planchas?|placas?|parrillas?|mallas?)\b/;

function extraerCantidad(resto: string): number {
  const texto = ` ${normalizar(resto)} `;

  const cantidadExplicita = texto.match(/\bcant(?:idad)?\s*:?\s*(\d{1,5})\b/);
  if (cantidadExplicita) return Number(cantidadExplicita[1]);

  const porX = texto.match(/\bx\s*(\d{1,5})\b/);
  if (porX) return Number(porX[1]);

  const porUnidad = texto.match(
    /\b(\d{1,5})\s*(?:unidades?|unds?|uds?|pzas?|piezas?|paneles?|planchas?|placas?|clips?|grapas?|juegos?)\b/,
  );
  if (porUnidad) return Number(porUnidad[1]);

  const sueltos = Array.from(texto.matchAll(/(?:^|\s)(\d{1,5})(?=\s|$)/g)).map((match) =>
    Number(match[1]),
  );
  if (sueltos.length === 1 && sueltos[0] >= 1 && sueltos[0] <= 100000) return sueltos[0];

  return 1;
}

function unidadDeTexto(texto: string, porDefecto: string): string {
  const n = normalizar(texto);
  if (/\b(paneles?|planchas?|placas?)\b/.test(n)) return "panel";
  return porDefecto;
}

function extraerEspesor(texto: string): 25 | 38 | null {
  const match = texto.match(ESPESOR_REGEX);
  if (!match) return null;
  const valor = Number(match[1] ?? match[2] ?? match[3]);
  return valor === 25 || valor === 38 ? valor : null;
}

function dimensionesTexto(texto: string): { ancho: number; largo: number } | null {
  const match = texto.match(DIMENSION_REGEX);
  if (!match) return null;
  const ancho = aMilimetros(aNumero(match[1]));
  const largo = aMilimetros(aNumero(match[2]));
  if (!ancho || !largo) return null;
  return { ancho, largo };
}

function medidasDeProducto(producto: Product): { ancho: number; largo: number; espesor: number } | null {
  const match = /^(\d+)x(\d+)-H(\d+)$/i.exec(producto.id);
  if (!match) return null;
  return {
    ancho: Number(match[1]),
    largo: Number(match[2]),
    espesor: Number(match[3]),
  };
}

function itemDesdeProducto(
  producto: Product,
  cantidad: number,
  confianza: ConfianzaItem,
  unidadTexto: string,
): ParsedItem {
  const unidad =
    producto.categoria === "frp"
      ? "panel"
      : producto.categoria === "clips"
        ? unidadDeTexto(unidadTexto, "unidad")
        : "unidad";

  return {
    producto_id: producto.id,
    nombre: producto.nombre,
    detalle: producto.detalle,
    cantidad,
    unidad,
    precio_unitario: producto.precioUnitario,
    confianza,
  };
}

function matchFrp(
  texto: string,
): { producto: Product; confianza: ConfianzaItem } | null {
  const medidas = dimensionesTexto(texto);
  if (!medidas) return null;

  const espesor = extraerEspesor(texto);
  const parBuscado = [medidas.ancho, medidas.largo].sort((a, b) => a - b);

  const candidatos = CATALOG.filter((producto) => {
    if (producto.categoria !== "frp") return false;
    const medidasProducto = medidasDeProducto(producto);
    if (!medidasProducto) return false;
    const parProducto = [medidasProducto.ancho, medidasProducto.largo].sort((a, b) => a - b);
    return parProducto[0] === parBuscado[0] && parProducto[1] === parBuscado[1];
  });

  if (candidatos.length === 0) return null;

  if (espesor !== null) {
    const exacto = candidatos.find((producto) => medidasDeProducto(producto)?.espesor === espesor);
    if (!exacto) return null;
    return { producto: exacto, confianza: "exacta" };
  }

  // Sin espesor: si solo hay una variante, la medida identifica al producto.
  if (candidatos.length === 1) {
    return { producto: candidatos[0], confianza: "exacta" };
  }

  // Hay varias variantes (25/38 mm): se asume 38 mm, la más común.
  const porDefecto = candidatos.find((producto) => medidasDeProducto(producto)?.espesor === 38);
  return { producto: porDefecto ?? candidatos[0], confianza: "aproximada" };
}

function matchDucha(texto: string): Product | null {
  const modelo = PT_REGEX.exec(texto);
  if (!modelo) return null;
  const numero = modelo[1].padStart(2, "0");
  return findProduct(`rejilla-ducha-pt${numero}`) ?? null;
}

function matchClips(texto: string): { producto: Product; confianza: ConfianzaItem } | null {
  const n = normalizar(texto);
  if (!/\b(clips?|grapas?|m\s*clips?)\b/.test(n)) return null;

  const espesor = extraerEspesor(texto);
  if (espesor === 25) {
    const producto = findProduct("clip-25mm");
    return producto ? { producto, confianza: "exacta" } : null;
  }
  if (espesor === 38) {
    const producto = findProduct("clip-38mm");
    return producto ? { producto, confianza: "exacta" } : null;
  }

  // Sin espesor se asume la variante de 38 mm.
  const producto = findProduct("clip-38mm");
  return producto ? { producto, confianza: "aproximada" } : null;
}

function matchPorId(texto: string): Product | null {
  const n = normalizar(texto);
  for (const producto of CATALOG) {
    if (n.includes(normalizar(producto.id))) return producto;
  }
  return null;
}

function parsearLineaProducto(linea: string): ParsedItem | null {
  const original = limpiarBullet(linea);
  const n = normalizar(original);

  let resto = ` ${n} `
    .replace(DIMENSION_GLOBAL, " ")
    .replace(ESPESOR_GLOBAL, " ")
    .replace(PT_GLOBAL, " ");
  const cantidad = extraerCantidad(resto);

  const porId = matchPorId(original);
  if (porId) return itemDesdeProducto(porId, cantidad, "exacta", original);

  const frp = matchFrp(original);
  if (frp) return itemDesdeProducto(frp.producto, cantidad, frp.confianza, original);

  const ducha = matchDucha(original);
  if (ducha) return itemDesdeProducto(ducha, cantidad, "exacta", original);

  const clips = matchClips(original);
  if (clips) return itemDesdeProducto(clips.producto, cantidad, clips.confianza, original);

  // Todo lo que no coincide con el catálogo oficial se descarta como ítem y
  // se informa en `textoNoReconocido`. La importación solo crea productos
  // con `producto_id` válido.
  return null;
}

function extraerValorEtiqueta(linea: string): { etiqueta: string; valor: string } | null {
  const indice = linea.indexOf(":");
  if (indice === -1) return null;
  const etiqueta = normalizar(linea.slice(0, indice)).replace(/^[-•*]\s*/, "");
  const valor = linea.slice(indice + 1).trim();
  return valor ? { etiqueta, valor } : null;
}

function aplicarEtiquetaCliente(cliente: ParsedQuote["cliente"], linea: string): boolean {
  const par = extraerValorEtiqueta(linea);
  if (!par) return false;

  for (const { campo, etiquetas } of ETIQUETAS_CLIENTE) {
    if (!etiquetas.test(par.etiqueta)) continue;
    const valor = par.valor.replace(/^["“”']|["“”']$/g, "").trim();
    if (!valor) return true;

    if (campo === "ruc_dni") {
      const digitos = valor.replace(/\D/g, "");
      if (digitos.length === 8 || digitos.length === 11) cliente.ruc_dni = digitos;
      return true;
    }

    if (campo === "telefono") {
      const telefono = normalizarTelefono(valor);
      if (telefono) cliente.telefono = telefono;
      return true;
    }

    if (campo === "correo") {
      const correo = valor.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      if (correo) cliente.correo = correo[0];
      return true;
    }

    cliente[campo] = valor;
    return true;
  }

  return false;
}

function normalizarTelefono(valor: string): string | null {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length === 9 && digitos.startsWith("9")) return digitos;
  if (digitos.length === 11 && digitos.startsWith("51")) return digitos.slice(2);
  return null;
}

function extraerDatosSueltos(cliente: ParsedQuote["cliente"], texto: string): void {
  if (!cliente.correo) {
    const correo = texto.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    if (correo) cliente.correo = correo[0];
  }

  if (!cliente.telefono) {
    const telefono = texto.match(/(?:\+?51[\s-]*)?(9\d{2}[\s-]?\d{3}[\s-]?\d{3})/);
    if (telefono) cliente.telefono = normalizarTelefono(telefono[1]) ?? undefined;
  }

  if (!cliente.nombre) {
    const nombre = texto.match(
      /(?:^|\n)\s*(?:hola[,.]?\s*)?(?:soy|me llamo|mi nombre es)\s+([^\n,.]{3,60})/i,
    );
    if (nombre) {
      cliente.nombre = nombre[1]
        .replace(/\b(?:de|para)\s+.*$/i, "")
        .trim();
    }
  }
}

/**
 * Parser determinista de mensajes de WhatsApp.
 * Reconoce el formato del panel web y texto libre con medidas/modelos.
 * Solo devuelve ítems que coinciden con el catálogo oficial; el resto queda
 * en `textoNoReconocido`.
 */
export function parseWhatsAppMessage(text: string): ParsedQuote {
  const cliente: ParsedQuote["cliente"] = {};
  const items: ParsedItem[] = [];
  const textoNoReconocido: string[] = [];

  const lineas = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(0, MAX_LINEAS);

  for (const lineaCruda of lineas) {
    const linea = lineaCruda.trim();
    if (!linea) continue;
    const n = normalizar(linea);

    if (esEtiquetaCliente.test(n)) {
      aplicarEtiquetaCliente(cliente, linea);
      continue;
    }

    if (esRuido(linea)) continue;

    const pareceProducto =
      esBullet(linea) ||
      PRODUCTO_KEYWORDS.test(n) ||
      DIMENSION_REGEX.test(n) ||
      /\b\d{1,5}\s*(?:unidades?|paneles?|planchas?|clips?|grapas?)\b/.test(n);

    if (!pareceProducto) {
      textoNoReconocido.push(linea);
      continue;
    }

    const item = parsearLineaProducto(linea);
    if (item) {
      items.push(item);
    } else {
      textoNoReconocido.push(linea);
    }
  }

  extraerDatosSueltos(cliente, text ?? "");

  return { cliente, items, textoNoReconocido };
}
