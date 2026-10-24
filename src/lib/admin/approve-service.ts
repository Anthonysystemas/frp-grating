import { findProduct } from '../../data/catalog.js';
import { generarPdfCotizacion } from '../pdf.js';
import { obtenerSupabaseAdmin } from '../supabase.js';

export class AprobarError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AprobarError';
    this.status = status;
  }
}

export interface ItemEntrada {
  id?: string;
  nombre?: string;
  detalle?: string;
  unidad?: string;
  precio_unitario?: number;
  precioUnitario?: number;
  precioUnitarioCentavos?: number;
  cantidad?: number;
  qty?: number;
}

export interface AprobarPayload {
  cotizacion_id?: string;
  items?: ItemEntrada[];
  flete?: number;
  administrador?: unknown;
}

interface ItemVersion {
  id: string;
  nombre: string;
  detalle: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  unidad: string;
}

interface VersionCotizacion {
  id: string;
  cotizacion_id: string;
  version_numero: number;
  es_oficial: boolean;
  items: unknown;
  subtotal: number;
  igv: number;
  total: number;
  flete?: number;
  created_at: string;
}

export interface AprobarResultado {
  cotizacion: Record<string, unknown> & { estado: string };
  version_oficial: VersionCotizacion;
  administrador: unknown;
  pdfBase64: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esNumeroFinito(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function leerPrecio(item: ItemEntrada): number | null {
  if (esNumeroFinito(item.precio_unitario)) return item.precio_unitario;
  if (esNumeroFinito(item.precioUnitario)) return item.precioUnitario;
  if (esNumeroFinito(item.precioUnitarioCentavos)) return item.precioUnitarioCentavos / 100;
  return null;
}

function unidadDeProducto(id: string): string {
  return findProduct(id)?.categoria === 'frp' ? 'panel' : 'unidad';
}

type ResultadoItem =
  | { ok: true; item: ItemVersion }
  | { ok: false; error: string };

/**
 * Normaliza un ítem de la nueva versión. Los ítems nuevos pueden no traer id:
 * en ese caso se genera uno. Si faltan precio/cantidad/nombre, se reutilizan
 * los valores de la versión anterior cuando el id coincide.
 */
function normalizarItem(
  raw: unknown,
  index: number,
  existentes: Map<string, ItemVersion>,
): ResultadoItem {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: `El ítem ${index + 1} no es válido` };
  }

  const item = raw as Record<string, unknown>;
  const entrada = item as ItemEntrada;

  const idOriginal = typeof item.id === 'string' ? item.id.trim() : '';
  const id = idOriginal || `manual-${Date.now()}-${index + 1}`;
  const anterior = idOriginal ? existentes.get(idOriginal) : undefined;

  const nombreBruto = typeof item.nombre === 'string' ? item.nombre.trim() : '';
  const nombre = nombreBruto || anterior?.nombre || findProduct(id)?.nombre || '';
  if (!nombre) {
    return { ok: false, error: `El ítem ${index + 1} debe tener un nombre` };
  }
  if (nombre.length > 200) {
    return { ok: false, error: `El nombre del ítem ${index + 1} es demasiado largo` };
  }

  const detalleBruto = typeof item.detalle === 'string' ? item.detalle.trim() : '';
  const detalle = detalleBruto || anterior?.detalle || findProduct(id)?.detalle || '';
  if (detalle.length > 500) {
    return { ok: false, error: `El detalle del ítem ${index + 1} es demasiado largo` };
  }

  const cantidadRaw = item.cantidad ?? item.qty ?? anterior?.cantidad;
  const cantidad = Number(cantidadRaw);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100000) {
    return { ok: false, error: `Cantidad inválida para el ítem ${index + 1}` };
  }

  const precio = leerPrecio(entrada) ?? anterior?.precio_unitario ?? null;
  if (precio === null || !esNumeroFinito(precio) || precio < 0) {
    return { ok: false, error: `Precio inválido para el ítem ${index + 1}` };
  }

  const unidad =
    (typeof item.unidad === 'string' && item.unidad.trim() ? item.unidad.trim() : '') ||
    anterior?.unidad ||
    unidadDeProducto(id);

  const precioCentavos = Math.round(precio * 100);

  return {
    ok: true,
    item: {
      id,
      nombre,
      detalle,
      cantidad,
      precio_unitario: precioCentavos / 100,
      subtotal: (precioCentavos * cantidad) / 100,
      unidad,
    },
  };
}

function fechaLima(): string {
  const fecha = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  return `Lima, ${fecha}`;
}

export async function aprobarCotizacion(payload: AprobarPayload): Promise<AprobarResultado> {
  let supabase: ReturnType<typeof obtenerSupabaseAdmin>;

  try {
    supabase = obtenerSupabaseAdmin();
  } catch (error) {
    throw new AprobarError(
      error instanceof Error ? error.message : 'Configuración administrativa incompleta',
      500,
    );
  }

  const { cotizacion_id, items: ajustes, flete: fleteRaw, administrador } = payload;

  // --- VALIDACIONES DE ENTRADA ---
  const cotizacionId = typeof cotizacion_id === 'string' ? cotizacion_id.trim() : '';
  if (!cotizacionId || !UUID_REGEX.test(cotizacionId)) {
    throw new AprobarError('El cotizacion_id no es válido', 400);
  }

  if (ajustes !== undefined && !Array.isArray(ajustes)) {
    throw new AprobarError('El campo items debe ser una lista', 400);
  }

  const flete = fleteRaw ?? 0;
  if (!esNumeroFinito(flete) || flete < 0) {
    throw new AprobarError('El flete debe ser un número mayor o igual a 0', 400);
  }

  if (
    administrador !== undefined &&
    administrador !== null &&
    typeof administrador !== 'string' &&
    typeof administrador !== 'object'
  ) {
    throw new AprobarError('Los datos del administrador no son válidos', 400);
  }

  // --- COTIZACIÓN Y ÚLTIMA VERSIÓN ---
  const { data: cotizacion, error: errorCotizacion } = await supabase
    .from('cotizaciones')
    .select('*')
    .eq('id', cotizacionId)
    .maybeSingle();

  if (errorCotizacion) {
    console.error('[Admin aprobar] Error al consultar la cotización', errorCotizacion);
    throw new AprobarError('No se pudo consultar la cotización', 500);
  }
  if (!cotizacion) {
    throw new AprobarError('La cotización no existe', 404);
  }

  if (cotizacion.estado !== 'pendiente_revision') {
    throw new AprobarError(
      'Solo se pueden aprobar cotizaciones en estado pendiente de revisión',
      409,
    );
  }

  const { data: ultimaVersion, error: errorUltimaVersion } = await supabase
    .from('cotizacion_versiones')
    .select('*')
    .eq('cotizacion_id', cotizacionId)
    .order('version_numero', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorUltimaVersion) {
    console.error('[Admin aprobar] Error al consultar versiones', errorUltimaVersion);
    throw new AprobarError('No se pudo consultar las versiones de la cotización', 500);
  }
  if (!ultimaVersion) {
    throw new AprobarError('La cotización no tiene ninguna versión para aprobar', 409);
  }

  // Ítems de la última versión: se usan como respaldo si el administrador no
  // envía la lista completa (compatibilidad) o si algún ítem reutiliza su id.
  const itemsBrutos: unknown[] = Array.isArray(ultimaVersion.items) ? ultimaVersion.items : [];
  const existentes = new Map<string, ItemVersion>();
  itemsBrutos.forEach((raw, index) => {
    const resultado = normalizarItem(raw, index, new Map());
    if (resultado.ok) existentes.set(resultado.item.id, resultado.item);
  });

  // La lista enviada es la nueva cotización completa: puede agregar, quitar o
  // reemplazar ítems respecto de la versión anterior.
  const itemsEntrada: unknown[] = ajustes !== undefined ? ajustes : itemsBrutos;

  if (itemsEntrada.length === 0) {
    throw new AprobarError('La cotización debe incluir al menos un ítem para aprobarla', 400);
  }

  let subtotalCentavos = 0;
  const itemsFinales: ItemVersion[] = [];
  const idsFinales = new Set<string>();

  for (let index = 0; index < itemsEntrada.length; index += 1) {
    const resultado = normalizarItem(itemsEntrada[index], index, existentes);
    if (resultado.ok === false) {
      throw new AprobarError(resultado.error, 400);
    }

    const item = resultado.item;

    // Un producto puede aparecer varias veces en la cotización. Se conserva
    // cada línea y se le asigna una clave única sin agrupar precios distintos.
    if (idsFinales.has(item.id)) {
      const idBase = item.id;
      let sufijo = 2;
      let idUnico = `${idBase}#${sufijo}`;
      while (idsFinales.has(idUnico)) {
        sufijo += 1;
        idUnico = `${idBase}#${sufijo}`;
      }
      item.id = idUnico;
    }
    idsFinales.add(item.id);

    const precioCentavos = Math.round(item.precio_unitario * 100);
    subtotalCentavos += precioCentavos * item.cantidad;
    itemsFinales.push(item);
  }

  const igvCentavos = Math.round(subtotalCentavos * 0.18);
  const fleteCentavos = Math.round(flete * 100);
  const totalCentavos = subtotalCentavos + igvCentavos + fleteCentavos;

  const numeroVersion = Number(ultimaVersion.version_numero);
  const siguienteVersion = Number.isInteger(numeroVersion) && numeroVersion > 0 ? numeroVersion + 1 : 2;

  // --- PDF OFICIAL (antes de persistir, para no aprobar sin documento) ---
  let pdf: Buffer;
  try {
    pdf = await generarPdfCotizacion({
      numero: cotizacion.codigo,
      fecha: fechaLima(),
      moneda: 'USD',
      clienteNombre: cotizacion.cliente_nombre ?? '',
      clienteRazonSocial: cotizacion.cliente_empresa ?? cotizacion.cliente_nombre ?? '',
      clienteRuc: cotizacion.cliente_ruc_dni ?? undefined,
      clienteCorreo: cotizacion.cliente_correo ?? undefined,
      clienteCelular: cotizacion.cliente_celular ?? undefined,
      items: itemsFinales.map((item) => ({
        descripcion: item.nombre,
        detalle: item.detalle,
        unidad: item.unidad,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
      })),
      subtotal: subtotalCentavos / 100,
      igv: igvCentavos / 100,
      flete: fleteCentavos / 100,
      total: totalCentavos / 100,
    });
  } catch (error) {
    console.error('[Admin aprobar] Error al compilar el PDF oficial', error);
    throw new AprobarError('No se pudo generar el PDF oficial de la cotización', 500);
  }

  // --- NUEVA VERSIÓN OFICIAL ---
  // Solo puede quedar una versión oficial por cotización.
  const { data: oficialAnterior, error: errorOficialAnterior } = await supabase
    .from('cotizacion_versiones')
    .select('id')
    .eq('cotizacion_id', cotizacionId)
    .eq('es_oficial', true)
    .limit(1)
    .maybeSingle();

  if (errorOficialAnterior) {
    console.error('[Admin aprobar] Error al consultar la versión oficial anterior', errorOficialAnterior);
    throw new AprobarError('No se pudo consultar la versión oficial anterior', 500);
  }

  const restaurarOficialAnterior = async () => {
    if (!oficialAnterior?.id) return;
    const { error } = await supabase
      .from('cotizacion_versiones')
      .update({ es_oficial: true })
      .eq('id', oficialAnterior.id);
    if (error) {
      console.error('[Admin aprobar] No se pudo restaurar la versión oficial anterior', error);
    }
  };

  const { error: errorOficiales } = await supabase
    .from('cotizacion_versiones')
    .update({ es_oficial: false })
    .eq('cotizacion_id', cotizacionId)
    .eq('es_oficial', true);

  if (errorOficiales) {
    console.error('[Admin aprobar] Error al desmarcar la versión oficial anterior', errorOficiales);
    throw new AprobarError('No se pudo actualizar la versión oficial anterior', 500);
  }

  const { data: versionOficial, error: errorVersion } = await supabase
    .from('cotizacion_versiones')
    .insert({
      cotizacion_id: cotizacionId,
      version_numero: siguienteVersion,
      es_oficial: true,
      items: itemsFinales,
      subtotal: Number((subtotalCentavos / 100).toFixed(2)),
      igv: Number((igvCentavos / 100).toFixed(2)),
      flete: Number((fleteCentavos / 100).toFixed(2)),
      total: Number((totalCentavos / 100).toFixed(2)),
    })
    .select('*')
    .single();

  if (errorVersion || !versionOficial) {
    console.error('[Admin aprobar] Error al guardar la versión oficial', errorVersion);
    await restaurarOficialAnterior();
    throw new AprobarError('No se pudo guardar la versión oficial', 500);
  }

  // --- ESTADO DE LA CARÁTULA ---
  const { error: errorEstado } = await supabase
    .from('cotizaciones')
    .update({ estado: 'aprobada' })
    .eq('id', cotizacionId);

  if (errorEstado) {
    console.error('[Admin aprobar] Error al actualizar el estado de la cotización', errorEstado);
    // Revierte la versión recién insertada para no dejar una aprobación a medias.
    const { error: errorRollback } = await supabase
      .from('cotizacion_versiones')
      .delete()
      .eq('id', versionOficial.id);
    if (errorRollback) {
      console.error('[Admin aprobar] No se pudo revertir la versión oficial', errorRollback);
    } else {
      await restaurarOficialAnterior();
    }
    throw new AprobarError('No se pudo actualizar el estado de la cotización', 500);
  }

  console.log(
    `[Admin aprobar] Cotización ${cotizacion.codigo} aprobada | Versión ${siguienteVersion} | Total: ${(totalCentavos / 100).toFixed(2)} USD`,
  );

  return {
    cotizacion: {
      ...cotizacion,
      estado: 'aprobada',
    },
    version_oficial: versionOficial as VersionCotizacion,
    administrador: administrador ?? null,
    pdfBase64: pdf.toString('base64'),
  };
}
