import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findProduct } from '../src/data/catalog.js';
import { enviarAlertaLead, validarCliente } from '../src/lib/cotizacion.js';
import { generarPdfCotizacion } from '../src/lib/pdf.js';
import { supabase } from '../src/lib/supabase.js';

interface CotizacionItem {
  id: string;
  qty: number;
}

interface CotizacionPayload {
  contacto: {
    nombre: string;
    empresa: string;
    ruc?: string;
    correo: string;
    celular: string;
  };
  items: CotizacionItem[];
}

interface ItemValidado {
  id: string;
  nombre: string;
  detalle: string;
  qty: number;
  precioUnitarioCentavos: number;
  subtotalCentavos: number;
}

interface ItemVersionGuardada {
  id?: string;
  nombre?: string;
  descripcion?: string;
  detalle?: string;
  unidad?: string;
  cantidad?: number;
  qty?: number;
  precio_unitario?: number;
  precioUnitario?: number;
  precioUnitarioCentavos?: number;
  subtotal?: number;
}

interface VersionGuardada {
  id: string;
  cotizacion_id: string;
  version_numero: number;
  es_oficial: boolean;
  items: unknown;
  subtotal: number;
  igv: number;
  total: number;
  flete?: number;
  created_at?: string;
}

interface CotizacionGuardada {
  id: string;
  codigo: string;
  cliente_nombre?: string | null;
  cliente_empresa?: string | null;
  cliente_ruc_dni?: string | null;
  cliente_correo?: string | null;
  cliente_celular?: string | null;
  estado?: string | null;
  created_at?: string | null;
}

interface ResultadoCotizacion {
  status: number;
  body: Record<string, unknown>;
}

interface DatosProcesamiento {
  firma: string;
  nombre: string;
  empresa: string;
  ruc: string;
  correo: string;
  celular: string;
  validatedItems: ItemValidado[];
  subtotalCentavos: number;
  igvCentavos: number;
  totalCentavos: number;
}

const VENTANA_IDEMPOTENCIA_MS = 2 * 60 * 1000;

// Evita que dos peticiones idénticas que llegan al mismo proceso compilen el
// PDF y guarden una cotización duplicada. La consulta a Supabase cubre además
// las peticiones ya completadas dentro de la ventana de idempotencia.
const solicitudesEnProceso = new Map<string, Promise<ResultadoCotizacion>>();

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function fechaLima(iso?: string | null): string {
  const fecha = iso ? new Date(iso) : new Date();
  const formateada = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(Number.isNaN(fecha.getTime()) ? new Date() : fecha);
  return `Lima, ${formateada}`;
}

function generarIdentificadores() {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora).reduce<Record<string, string>>((resultado, parte) => {
    resultado[parte.type] = parte.value;
    return resultado;
  }, {});

  // Sufijo aleatorio para evitar colisiones cuando dos solicitudes coinciden
  // en el mismo segundo.
  const sufijo = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, '0');
  const codigo = `MSK-${partes.year}${partes.month}${partes.day}-${partes.hour}${partes.minute}${partes.second}-${sufijo}`;
  return { codigo, fecha: fechaLima(ahora.toISOString()) };
}

function firmaItems(
  items: Array<{ id?: string; qty?: number; cantidad?: number }>,
): string {
  return items
    .map((item) => `${String(item.id ?? '')}:${numero(item.qty ?? item.cantidad)}`)
    .sort()
    .join('|');
}

function firmaSolicitud(
  correo: string,
  items: Array<{ id?: string; qty?: number; cantidad?: number }>,
): string {
  return `${correo.trim().toLowerCase()}::${firmaItems(items)}`;
}

function firmaVersion(items: unknown): string {
  if (!Array.isArray(items)) return '';
  return firmaItems(items as ItemVersionGuardada[]);
}

function itemsDeVersion(version: VersionGuardada): ItemValidado[] {
  if (!Array.isArray(version.items)) return [];

  return (version.items as ItemVersionGuardada[])
    .map((item) => {
      const id = String(item.id ?? '');
      const qty = numero(item.cantidad ?? item.qty);
      const precio = numero(
        item.precio_unitario ??
          item.precioUnitario ??
          (typeof item.precioUnitarioCentavos === 'number'
            ? item.precioUnitarioCentavos / 100
            : 0),
      );
      const precioCentavos = Math.round(precio * 100);
      const subtotalCentavos = Math.round(
        numero(item.subtotal ?? (precioCentavos * qty) / 100) * 100,
      );

      return {
        id,
        nombre: String(item.nombre ?? item.descripcion ?? findProduct(id)?.nombre ?? 'Producto'),
        detalle: String(item.detalle ?? findProduct(id)?.detalle ?? ''),
        qty,
        precioUnitarioCentavos: precioCentavos,
        subtotalCentavos,
      };
    })
    .filter((item) => item.qty > 0);
}

async function buscarCotizacionReciente(
  correo: string,
  firma: string,
): Promise<{ cotizacion: CotizacionGuardada; version: VersionGuardada } | null> {
  const desde = new Date(Date.now() - VENTANA_IDEMPOTENCIA_MS).toISOString();

  const { data: recientes, error: errorRecientes } = await supabase
    .from('cotizaciones')
    .select(
      'id, codigo, cliente_nombre, cliente_empresa, cliente_ruc_dni, cliente_correo, cliente_celular, estado, created_at',
    )
    .ilike('cliente_correo', correo)
    .gte('created_at', desde)
    .neq('estado', 'eliminada')
    .order('created_at', { ascending: false })
    .limit(10);

  if (errorRecientes || !Array.isArray(recientes) || recientes.length === 0) {
    if (errorRecientes) {
      console.error('[Cotización] Error al buscar duplicados recientes', errorRecientes);
    }
    return null;
  }

  const ids = recientes.map((cotizacion) => cotizacion.id as string);
  const { data: versiones, error: errorVersiones } = await supabase
    .from('cotizacion_versiones')
    .select('*')
    .in('cotizacion_id', ids)
    .order('version_numero', { ascending: false });

  if (errorVersiones || !Array.isArray(versiones)) {
    if (errorVersiones) {
      console.error('[Cotización] Error al consultar versiones recientes', errorVersiones);
    }
    return null;
  }

  const versionesPorCotizacion = new Map<string, VersionGuardada[]>();
  for (const version of versiones as VersionGuardada[]) {
    const grupo = versionesPorCotizacion.get(version.cotizacion_id) ?? [];
    grupo.push(version);
    versionesPorCotizacion.set(version.cotizacion_id, grupo);
  }

  for (const cotizacion of recientes as CotizacionGuardada[]) {
    const versionesCotizacion = versionesPorCotizacion.get(cotizacion.id) ?? [];
    const version = versionesCotizacion.find((item) => firmaVersion(item.items) === firma);
    if (version) return { cotizacion, version };
  }

  return null;
}

async function respuestaReutilizada(
  cotizacion: CotizacionGuardada,
  version: VersionGuardada,
): Promise<ResultadoCotizacion> {
  const items = itemsDeVersion(version);
  const subtotalCalculado = items.reduce((total, item) => total + item.subtotalCentavos, 0);
  const subtotalCentavos = Number.isFinite(Number(version.subtotal))
    ? Math.round(Number(version.subtotal) * 100)
    : subtotalCalculado;
  const igvCentavos = Number.isFinite(Number(version.igv))
    ? Math.round(Number(version.igv) * 100)
    : Math.round(subtotalCentavos * 0.18);
  const fleteCentavos = Number.isFinite(Number(version.flete))
    ? Math.round(Number(version.flete) * 100)
    : 0;
  const totalCentavos = Number.isFinite(Number(version.total))
    ? Math.round(Number(version.total) * 100)
    : subtotalCentavos + igvCentavos + fleteCentavos;

  let pdf: Buffer;
  try {
    pdf = await generarPdfCotizacion({
      numero: cotizacion.codigo,
      fecha: fechaLima(cotizacion.created_at),
      moneda: 'USD',
      clienteNombre: cotizacion.cliente_nombre ?? '',
      clienteRazonSocial: cotizacion.cliente_empresa ?? cotizacion.cliente_nombre ?? '',
      clienteRuc: cotizacion.cliente_ruc_dni ?? undefined,
      clienteCorreo: cotizacion.cliente_correo ?? undefined,
      clienteCelular: cotizacion.cliente_celular ?? undefined,
      items: items.map((item) => ({
        descripcion: item.nombre,
        detalle: item.detalle,
        unidad:
          item.id && findProduct(item.id)?.categoria === 'frp' ? 'panel' : 'unidad',
        cantidad: item.qty,
        precio_unitario: item.precioUnitarioCentavos / 100,
      })),
      subtotal: subtotalCentavos / 100,
      igv: igvCentavos / 100,
      flete: fleteCentavos / 100,
      total: totalCentavos / 100,
    });
  } catch (error) {
    console.error('[Cotización PDF] Error al regenerar una cotización reutilizada', error);
    return {
      status: 500,
      body: { ok: false, error: 'No se pudo regenerar el PDF de la cotización' },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      reutilizada: true,
      id: cotizacion.id,
      codigo: cotizacion.codigo,
      items,
      subtotalCentavos,
      igvCentavos,
      totalCentavos,
      total: (totalCentavos / 100).toFixed(2),
      pdfBase64: pdf.toString('base64'),
    },
  };
}

async function procesarCotizacion(datos: DatosProcesamiento): Promise<ResultadoCotizacion> {
  const reciente = await buscarCotizacionReciente(datos.correo, datos.firma);
  if (reciente) {
    return respuestaReutilizada(reciente.cotizacion, reciente.version);
  }

  const { codigo, fecha } = generarIdentificadores();

  // --- PERSISTENCIA EN SUPABASE (FASE 1) ---
  // Se registra la cotización y su primera versión antes de compilar el PDF:
  // así la solicitud no se pierde si falla la generación del documento.
  const { data: cotizacionGuardada, error: errorCotizacion } = await supabase
    .from('cotizaciones')
    .insert({
      codigo,
      cliente_nombre: datos.nombre,
      cliente_empresa: datos.empresa,
      cliente_ruc_dni: datos.ruc || null,
      cliente_correo: datos.correo,
      cliente_celular: datos.celular,
      estado: 'pendiente_revision',
    })
    .select('id, codigo')
    .single();

  if (errorCotizacion || !cotizacionGuardada) {
    console.error('[Cotización] Error al guardar la cotización', errorCotizacion);
    return { status: 500, body: { ok: false, error: 'No se pudo guardar la cotización' } };
  }

  const versionItems = datos.validatedItems.map((item) => ({
    id: item.id,
    nombre: item.nombre,
    detalle: item.detalle,
    cantidad: item.qty,
    precio_unitario: item.precioUnitarioCentavos / 100,
    subtotal: item.subtotalCentavos / 100,
  }));

  const { error: errorVersion } = await supabase
    .from('cotizacion_versiones')
    .insert({
      cotizacion_id: cotizacionGuardada.id,
      version_numero: 1,
      es_oficial: false,
      items: versionItems,
      subtotal: Number((datos.subtotalCentavos / 100).toFixed(2)),
      igv: Number((datos.igvCentavos / 100).toFixed(2)),
      total: Number((datos.totalCentavos / 100).toFixed(2)),
    });

  if (errorVersion) {
    console.error('[Cotización] Error al guardar la primera versión', errorVersion);
    // Evita dejar una cotización huérfana si falla la inserción de su versión.
    const { error: errorLimpieza } = await supabase
      .from('cotizaciones')
      .delete()
      .eq('id', cotizacionGuardada.id);
    if (errorLimpieza) {
      console.error('[Cotización] No se pudo revertir la cotización huérfana', errorLimpieza);
    }
    return { status: 500, body: { ok: false, error: 'No se pudo guardar la cotización' } };
  }

  // Alerta interna de nuevo lead. Es best-effort: nunca bloquea la cotización.
  await enviarAlertaLead({
    codigo,
    nombre: datos.nombre,
    empresa: datos.empresa,
    ruc: datos.ruc || '—',
    correo: datos.correo,
    celular: datos.celular,
    total: (datos.totalCentavos / 100).toFixed(2),
    items: datos.validatedItems.length,
  });

  const pdfItems = datos.validatedItems.map((item) => {
    const product = findProduct(item.id)!;
    return {
      descripcion: product.nombre,
      detalle: product.detalle,
      unidad: product.categoria === 'frp' ? 'panel' : 'unidad',
      cantidad: item.qty,
      precio_unitario: item.precioUnitarioCentavos / 100,
    };
  });

  let pdf: Buffer;
  try {
    pdf = await generarPdfCotizacion({
      numero: codigo,
      fecha,
      moneda: 'USD',
      clienteNombre: datos.nombre,
      clienteRazonSocial: datos.empresa,
      clienteRuc: datos.ruc,
      clienteCorreo: datos.correo,
      clienteCelular: datos.celular,
      items: pdfItems,
      subtotal: datos.subtotalCentavos / 100,
      igv: datos.igvCentavos / 100,
      total: datos.totalCentavos / 100,
    });
  } catch (error) {
    console.error('[Cotización PDF] Error de compilación', error);
    return {
      status: 500,
      body: { ok: false, error: 'No se pudo generar el PDF de la cotización' },
    };
  }

  console.log(
    `[Cotización Generada] Ítems: ${datos.validatedItems.length} | Total (Centavos): ${datos.totalCentavos}`,
  );

  return {
    status: 200,
    body: {
      ok: true,
      id: cotizacionGuardada.id,
      codigo,
      items: datos.validatedItems,
      subtotalCentavos: datos.subtotalCentavos,
      igvCentavos: datos.igvCentavos,
      totalCentavos: datos.totalCentavos,
      total: (datos.totalCentavos / 100).toFixed(2),
      pdfBase64: pdf.toString('base64'),
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const { contacto, items } = (req.body || {}) as CotizacionPayload;

  // --- HONEYPOT ANTI-SPAM ---
  // Un humano nunca ve el campo `website` (oculto por CSS). Si llega con
  // contenido, es un bot: se rechaza antes de validar o compilar el PDF.
  const honeypot = ((contacto as any)?.website || '').toString().trim();
  if (honeypot) {
    return res.status(400).json({ ok: false, error: 'Solicitud rechazada' });
  }

  // --- VALIDACIONES DE CONTACTO (compartidas con /api/enviar-correo) ---
  const validacion = validarCliente(contacto);
  if (validacion.ok === false) {
    return res.status(400).json({ ok: false, error: validacion.error });
  }
  const { nombre, empresa, ruc, correo, celular } = validacion.cliente;

  // --- VALIDACIONES DE ÍTEMS Y CÁLCULO ESTRICTO ---
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Debe incluir al menos un ítem' });
  }

  if (items.length > 30) {
    return res.status(400).json({ ok: false, error: 'Máximo 30 ítems permitidos por cotización' });
  }

  const validatedItems: ItemValidado[] = [];
  let subtotalCentavos = 0;

  for (const item of items) {
    // Buscar id seguro en nuestro catálogo
    const product = findProduct(item.id);
    if (!product) {
      return res.status(400).json({ ok: false, error: `Producto no válido: ${item.id}` });
    }

    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10000) {
      return res.status(400).json({ ok: false, error: `Cantidad inválida para el producto: ${item.id}` });
    }

    // Cálculo seguro en centavos (evita errores de JavaScript como 0.1 + 0.2 = 0.30000000000000004)
    const precioCentavos = Math.round(product.precioUnitario * 100);
    const subtotalItemCentavos = precioCentavos * item.qty;
    subtotalCentavos += subtotalItemCentavos;

    validatedItems.push({
      id: product.id,
      nombre: product.nombre,
      detalle: product.detalle,
      qty: item.qty,
      precioUnitarioCentavos: precioCentavos,
      subtotalCentavos: subtotalItemCentavos,
    });
  }

  const igvCentavos = Math.round(subtotalCentavos * 0.18);
  const totalCentavos = subtotalCentavos + igvCentavos;
  const firma = firmaSolicitud(correo, validatedItems);

  const enProceso = solicitudesEnProceso.get(firma);
  if (enProceso) {
    try {
      const resultado = await enProceso;
      return res.status(resultado.status).json(resultado.body);
    } catch (error) {
      console.error('[Cotización] Error al esperar una solicitud idéntica', error);
      return res
        .status(500)
        .json({ ok: false, error: 'No se pudo completar la cotización duplicada' });
    }
  }

  const promesa = procesarCotizacion({
    firma,
    nombre,
    empresa,
    ruc,
    correo,
    celular,
    validatedItems,
    subtotalCentavos,
    igvCentavos,
    totalCentavos,
  });

  solicitudesEnProceso.set(firma, promesa);

  try {
    const resultado = await promesa;
    return res.status(resultado.status).json(resultado.body);
  } finally {
    solicitudesEnProceso.delete(firma);
  }
}
