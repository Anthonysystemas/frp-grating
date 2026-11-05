import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findProduct } from '../../../src/data/catalog.js';
import { generarCodigoCotizacion } from '../../../src/lib/codigo.js';
import { obtenerSupabaseAdmin } from '../../../src/lib/supabase.js';
import { validarCorreo } from '../../../src/lib/utils/validation.js';

interface ImportItemPayload {
  producto_id?: unknown;
  nombre?: unknown;
  detalle?: unknown;
  cantidad?: unknown;
  unidad?: unknown;
  precio_unitario?: unknown;
}

interface ImportPayload {
  cliente?: {
    nombre?: unknown;
    empresa?: unknown;
    ruc_dni?: unknown;
    correo?: unknown;
    telefono?: unknown;
    ciudad?: unknown;
  };
  items?: unknown;
  texto_original?: unknown;
  origen?: unknown;
}

interface ItemPreparado {
  id: string;
  nombre: string;
  detalle: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  unidad: string;
}

interface ErrorSupabase {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const MAX_ITEMS = 60;
const MAX_TEXTO = 20000;

const texto = (valor: unknown, max = 200): string =>
  typeof valor === 'string' ? valor.trim().slice(0, max) : '';

const soloDigitos = (valor: unknown, max = 15): string =>
  typeof valor === 'string' ? valor.replace(/\D/g, '').slice(0, max) : '';

/** Detecta qué columna opcional no existe para reintentar el insert sin ella. */
function columnaFaltante(error: ErrorSupabase): string | null {
  const detalle = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`;
  const porCache = detalle.match(/Could not find the '([^']+)' column/i);
  if (porCache) return porCache[1];
  const porPostgres = detalle.match(/column "([^"]+)" does not exist/i);
  if (porPostgres) return porPostgres[1];
  return null;
}

function prepararItems(raw: unknown): { items: ItemPreparado[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Debe incluir al menos un ítem' };
  }
  if (raw.length > MAX_ITEMS) {
    return { error: `Máximo ${MAX_ITEMS} ítems por cotización` };
  }

  const items: ItemPreparado[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const entrada = raw[index] as ImportItemPayload;
    if (!entrada || typeof entrada !== 'object') {
      return { error: `El ítem ${index + 1} no es válido` };
    }

    const cantidad = Number(entrada.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100000) {
      return { error: `Cantidad inválida para el ítem ${index + 1}` };
    }

    const productoId = texto(entrada.producto_id, 120);
    const producto = productoId ? findProduct(productoId) : undefined;

    if (!producto) {
      return {
        error: `El ítem ${index + 1} debe ser un producto válido del catálogo oficial`,
      };
    }

    const precioCentavos = Math.round(producto.precioUnitario * 100);
    items.push({
      id: producto.id,
      nombre: producto.nombre,
      detalle: producto.detalle,
      cantidad,
      precio_unitario: precioCentavos / 100,
      subtotal: (precioCentavos * cantidad) / 100,
      unidad: producto.categoria === 'frp' ? 'panel' : 'unidad',
    });
  }

  return { items };
}

function prepararCliente(raw: ImportPayload['cliente'], origen: 'manual' | 'whatsapp') {
  const nombre = texto(raw?.nombre, 200);
  const empresa = texto(raw?.empresa, 200);
  const rucDni = soloDigitos(raw?.ruc_dni, 11);
  const correo = texto(raw?.correo, 200);
  const telefono = soloDigitos(raw?.telefono, 15);

  if (correo && !validarCorreo(correo)) {
    return { error: 'El correo electrónico del cliente no es válido' } as const;
  }

  return {
    cliente: {
      nombre: nombre || (origen === 'manual' ? 'Cliente manual' : 'Cliente WhatsApp'),
      empresa: empresa || '',
      ruc_dni: rucDni || '',
      correo: correo || '',
      celular: telefono || '',
    },
  } as const;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // El middleware de /api/admin/* ya valida la cookie de sesión y el correo
  // autorizado. Aquí solo se comprueba el método y se procesa el payload.
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  let supabase: ReturnType<typeof obtenerSupabaseAdmin>;
  try {
    supabase = obtenerSupabaseAdmin();
  } catch (error) {
    console.error('[Admin importar] Error de configuración', error);
    return res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Configuración administrativa incompleta',
    });
  }

  const body = (req.body || {}) as ImportPayload;
  const origen = body.origen === 'manual' ? 'manual' : 'whatsapp';

  const clientePreparado = prepararCliente(body.cliente, origen);
  if ('error' in clientePreparado) {
    return res.status(400).json({ ok: false, error: clientePreparado.error });
  }

  const itemsPreparados = prepararItems(body.items);
  if ('error' in itemsPreparados) {
    return res.status(400).json({ ok: false, error: itemsPreparados.error });
  }

  const textoOriginal = texto(body.texto_original, MAX_TEXTO);

  let subtotalCentavos = 0;
  for (const item of itemsPreparados.items) {
    subtotalCentavos += Math.round(item.precio_unitario * 100) * item.cantidad;
  }
  const igvCentavos = Math.round(subtotalCentavos * 0.18);
  const totalCentavos = subtotalCentavos + igvCentavos;

  // Columnas opcionales: el esquema puede o no tenerlas. Si Supabase avisa
  // que no existen, se reintenta sin ellas (el texto cae a `notas` si existe).
  const opcionales: Record<string, unknown> = {
    origen,
    texto_original: origen === 'manual' ? null : textoOriginal || '',
  };
  const base = {
    cliente_nombre: clientePreparado.cliente.nombre,
    cliente_empresa: clientePreparado.cliente.empresa,
    cliente_ruc_dni: clientePreparado.cliente.ruc_dni,
    cliente_correo: clientePreparado.cliente.correo,
    cliente_celular: clientePreparado.cliente.celular,
    estado: 'pendiente_revision',
  };

  let cotizacion: { id: string; codigo: string } | null = null;
  let ultimoError: ErrorSupabase | null = null;

  for (let intento = 0; intento < 6; intento += 1) {
    const codigo = generarCodigoCotizacion();
    const payload = { ...base, codigo, ...opcionales };
    const { data, error } = await supabase
      .from('cotizaciones')
      .insert(payload)
      .select('id, codigo')
      .single();

    if (!error && data) {
      cotizacion = data as { id: string; codigo: string };
      break;
    }

    const errorSupabase = (error ?? {}) as ErrorSupabase;
    ultimoError = errorSupabase;

    const mensaje = `${errorSupabase.message ?? ''} ${errorSupabase.details ?? ''}`;
    const codigoDuplicado =
      errorSupabase.code === '23505' || /duplicate key|already exists/i.test(mensaje);
    if (codigoDuplicado) {
      // Código repetido: se genera otro y se reintenta.
      continue;
    }

    const columna = columnaFaltante(errorSupabase);
    if (columna && columna in opcionales) {
      delete opcionales[columna];
      if (columna === 'texto_original') opcionales.notas = textoOriginal;
      continue;
    }

    break;
  }

  if (!cotizacion) {
    console.error('[Admin importar] Error al crear la cotización', ultimoError);
    return res.status(500).json({ ok: false, error: 'No se pudo crear la cotización' });
  }

  const { error: errorVersion } = await supabase.from('cotizacion_versiones').insert({
    cotizacion_id: cotizacion.id,
    version_numero: 1,
    es_oficial: false,
    items: itemsPreparados.items,
    subtotal: Number((subtotalCentavos / 100).toFixed(2)),
    igv: Number((igvCentavos / 100).toFixed(2)),
    total: Number((totalCentavos / 100).toFixed(2)),
  });

  if (errorVersion) {
    console.error('[Admin importar] Error al guardar la versión inicial', errorVersion);
    const { error: errorLimpieza } = await supabase
      .from('cotizaciones')
      .delete()
      .eq('id', cotizacion.id);
    if (errorLimpieza) {
      console.error('[Admin importar] No se pudo revertir la cotización huérfana', errorLimpieza);
    }
    return res.status(500).json({ ok: false, error: 'No se pudo guardar la cotización' });
  }

  return res.status(200).json({
    success: true,
    ok: true,
    id: cotizacion.id,
    codigo: cotizacion.codigo,
  });
}
