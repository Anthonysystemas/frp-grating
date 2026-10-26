import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { Resend } from 'resend';
import { escaparHtml } from '../../../src/lib/cotizacion.js';
import { obtenerSupabaseAdmin } from '../../../src/lib/supabase.js';
import { validarCorreo } from '../../../src/lib/utils/validation.js';

export const maxDuration = 15;

interface ItemVersion {
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
}

interface VersionOficial {
  id: string;
  version_numero: number;
  es_oficial: boolean;
  items: unknown;
  subtotal: number;
  igv: number;
  flete?: number;
  total: number;
  created_at?: string;
}

interface CotizacionConVersiones {
  id: string;
  codigo: string;
  cliente_nombre?: string | null;
  cliente_empresa?: string | null;
  cliente_ruc_dni?: string | null;
  cliente_correo?: string | null;
  cliente_celular?: string | null;
  estado?: string | null;
  created_at?: string | null;
  cotizacion_versiones?: VersionOficial[] | null;
}

interface ItemCorreo {
  descripcion: string;
  detalle: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function money(value: unknown): string {
  const numero = Number(value);
  return `US$ ${Number.isFinite(numero) ? numero.toFixed(2) : "0.00"}`;
}

function fechaLima(iso?: string): string {
  const fecha = iso ? new Date(iso) : new Date();
  const formateada = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(Number.isNaN(fecha.getTime()) ? new Date() : fecha);
  return `Lima, ${formateada}`;
}

function normalizarItems(itemsBrutos: ItemVersion[]): ItemCorreo[] {
  return itemsBrutos.map((item, index) => {
    const cantidad = Number(item.cantidad ?? item.qty ?? 0);
    const precio = Number(
      item.precio_unitario ??
        item.precioUnitario ??
        (typeof item.precioUnitarioCentavos === 'number'
          ? item.precioUnitarioCentavos / 100
          : 0),
    );

    if (!Number.isInteger(cantidad) || cantidad < 1 || !Number.isFinite(precio) || precio < 0) {
      throw new Error(`El ítem ${index + 1} de la versión oficial no es válido`);
    }

    return {
      descripcion: String(item.nombre ?? item.descripcion ?? 'Producto'),
      detalle: String(item.detalle ?? ''),
      unidad: String(item.unidad ?? 'unidad'),
      cantidad,
      precio_unitario: precio,
    };
  });
}

async function enviarEnSegundoPlano(params: {
  supabase: ReturnType<typeof obtenerSupabaseAdmin>;
  cotizacion: CotizacionConVersiones;
  version: VersionOficial;
  items: ItemCorreo[];
  correoDestino: string;
}): Promise<void> {
  const { supabase, cotizacion, version, items, correoDestino } = params;

  try {
    const subtotal = Number(version.subtotal ?? 0);
    const igv = Number(version.igv ?? 0);
    const flete = Number(version.flete ?? 0);
    const total = Number(version.total ?? 0);

    // Import dinámico: Typst y sus fuentes no se cargan durante el cold start
    // de la validación inicial; solo cuando realmente se ejecuta el envío.
    const { generarPdfCotizacion } = await import('../../../src/lib/pdf.js');

    const pdf = await generarPdfCotizacion({
      numero: cotizacion.codigo,
      fecha: fechaLima(version.created_at ?? cotizacion.created_at ?? undefined),
      moneda: 'USD',
      clienteNombre: cotizacion.cliente_nombre ?? '',
      clienteRazonSocial: cotizacion.cliente_empresa ?? cotizacion.cliente_nombre ?? '',
      clienteRuc: cotizacion.cliente_ruc_dni ?? undefined,
      clienteCorreo: correoDestino,
      clienteCelular: cotizacion.cliente_celular ?? undefined,
      items,
      subtotal,
      igv,
      flete,
      total,
    });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[Admin enviar] Falta configurar RESEND_API_KEY');
      return;
    }

    const from = process.env.EMAIL_FROM || 'Maskel Perú <onboarding@resend.dev>';
    const copia = (process.env.COPIA_EMAIL || '').trim();
    const empresa = String(cotizacion.cliente_empresa ?? '').replace(/[\r\n]+/g, ' ').trim();
    const nombre = String(cotizacion.cliente_nombre ?? '').trim();
    const subject = `Cotización oficial ${cotizacion.codigo}${empresa ? ` — ${empresa}` : ''}`;

    const filas = items
      .map(
        (item) =>
          `<tr><td style="padding:4pt 8pt;border-bottom:1px solid #e5e7eb">${escaparHtml(item.descripcion)}</td><td style="padding:4pt 8pt;border-bottom:1px solid #e5e7eb;text-align:center">${item.cantidad}</td><td style="padding:4pt 8pt;border-bottom:1px solid #e5e7eb;text-align:right">${money(item.precio_unitario)}</td></tr>`,
      )
      .join('');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.6;font-size:14px;max-width:620px">
        <p>Hola ${escaparHtml(nombre || 'cliente')},</p>
        <p>Adjuntamos la cotización oficial <strong>${escaparHtml(cotizacion.codigo)}</strong>${
          empresa ? ` para ${escaparHtml(empresa)}` : ''
        }.</p>
        <table style="border-collapse:collapse;width:100%;margin:12px 0">
          <thead>
            <tr>
              <th style="padding:4pt 8pt;border-bottom:1px solid #cbd5e1;text-align:left">Producto</th>
              <th style="padding:4pt 8pt;border-bottom:1px solid #cbd5e1;text-align:center">Cant.</th>
              <th style="padding:4pt 8pt;border-bottom:1px solid #cbd5e1;text-align:right">P. Unit.</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        <p style="text-align:right">
          Subtotal: <strong>${money(subtotal)}</strong><br />
          IGV (18%): <strong>${money(igv)}</strong><br />
          Flete: <strong>${money(flete)}</strong><br />
          Total: <strong>${money(total)}</strong>
        </p>
        <p>Quedamos atentos a cualquier consulta.</p>
      </div>`;

    const resend = new Resend(apiKey);
    const { error: errorEnvio } = await resend.emails.send({
      from,
      to: correoDestino,
      ...(copia ? { cc: [copia] } : {}),
      replyTo: 'ventas@maskelperu.com',
      subject,
      html,
      attachments: [{ filename: `${cotizacion.codigo}.pdf`, content: pdf.toString('base64') }],
    });

    if (errorEnvio) {
      console.error('[Admin enviar] Error de Resend', errorEnvio);
      return;
    }

    const enviadoAt = new Date().toISOString();
    const { error: errorRegistro } = await supabase
      .from('cotizaciones')
      .update({
        ultimo_envio_at: enviadoAt,
        ultimo_envio_correo: correoDestino,
      })
      .eq('id', cotizacion.id);

    if (errorRegistro) {
      console.error('[Admin enviar] No se pudo registrar el envío', errorRegistro);
    }
  } catch (error) {
    console.error('[Admin enviar] Error en el envío en segundo plano', error);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const { cotizacion_id, correo } = (req.body || {}) as {
    cotizacion_id?: unknown;
    correo?: unknown;
  };

  const cotizacionId = typeof cotizacion_id === 'string' ? cotizacion_id.trim() : '';
  const correoDestino = typeof correo === 'string' ? correo.trim() : '';

  if (!cotizacionId || !UUID_REGEX.test(cotizacionId)) {
    return res.status(400).json({ ok: false, error: 'El cotizacion_id no es válido' });
  }

  if (!correoDestino || !validarCorreo(correoDestino)) {
    return res.status(400).json({ ok: false, error: 'El correo electrónico no es válido' });
  }

  let supabase: ReturnType<typeof obtenerSupabaseAdmin>;

  try {
    supabase = obtenerSupabaseAdmin();
  } catch (error) {
    console.error('[Admin enviar] Error de configuración', error);
    return res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Configuración administrativa incompleta',
    });
  }

  // Una sola consulta relacional: cotización + todas sus versiones.
  const { data: cotizacionData, error: errorCotizacion } = await supabase
    .from('cotizaciones')
    .select('*, cotizacion_versiones(*)')
    .eq('id', cotizacionId)
    .maybeSingle();

  if (errorCotizacion) {
    console.error('[Admin enviar] Error al consultar la cotización', errorCotizacion);
    return res.status(500).json({ ok: false, error: 'No se pudo consultar la cotización' });
  }

  const cotizacion = cotizacionData as CotizacionConVersiones | null;

  if (!cotizacion) {
    return res.status(404).json({ ok: false, error: 'La cotización no existe' });
  }

  if (cotizacion.estado !== 'aprobada' && cotizacion.estado !== 'pagada') {
    return res.status(409).json({
      ok: false,
      error: 'Solo se puede enviar la cotización oficial si está aprobada o pagada',
    });
  }

  const versiones = Array.isArray(cotizacion.cotizacion_versiones)
    ? cotizacion.cotizacion_versiones
    : [];
  const version = versiones
    .filter((item) => item.es_oficial)
    .sort((a, b) => Number(b.version_numero) - Number(a.version_numero))[0];

  if (!version) {
    return res.status(409).json({ ok: false, error: 'La cotización no tiene una versión oficial' });
  }

  const itemsBrutos: ItemVersion[] = Array.isArray(version.items)
    ? (version.items as ItemVersion[])
    : [];
  if (itemsBrutos.length === 0) {
    return res.status(409).json({ ok: false, error: 'La versión oficial no tiene ítems' });
  }

  let items: ItemCorreo[];
  try {
    items = normalizarItems(itemsBrutos);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'La versión oficial tiene ítems inválidos';
    return res.status(409).json({ ok: false, error: mensaje });
  }

  // El correo, PDF y UPDATE final se ejecutan después de responder.
  const tarea = enviarEnSegundoPlano({
    supabase,
    cotizacion,
    version,
    items,
    correoDestino,
  }).catch((error) => {
    console.error('[Admin enviar] Error no controlado en segundo plano', error);
  });

  try {
    waitUntil(tarea);
  } catch (error) {
    console.error('[Admin enviar] No se pudo registrar la tarea en waitUntil', error);
    void tarea;
  }

  return res.status(200).json({
    ok: true,
    success: true,
    iniciado: true,
    message: 'Envío de cotización iniciado',
    cotizacion_id: cotizacionId,
    correo: correoDestino,
  });
}
