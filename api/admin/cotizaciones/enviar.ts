import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { escaparHtml } from '../../../src/lib/cotizacion.js';
import { generarPdfCotizacion } from '../../../src/lib/pdf.js';
import { obtenerSupabaseAdmin } from '../../../src/lib/supabase.js';
import { validarCorreo } from '../../../src/lib/utils/validation.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
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

  const { data: cotizacion, error: errorCotizacion } = await supabase
    .from('cotizaciones')
    .select('*')
    .eq('id', cotizacionId)
    .maybeSingle();

  if (errorCotizacion) {
    console.error('[Admin enviar] Error al consultar la cotización', errorCotizacion);
    return res.status(500).json({ ok: false, error: 'No se pudo consultar la cotización' });
  }

  if (!cotizacion) {
    return res.status(404).json({ ok: false, error: 'La cotización no existe' });
  }

  if (cotizacion.estado !== 'aprobada' && cotizacion.estado !== 'pagada') {
    return res.status(409).json({
      ok: false,
      error: 'Solo se puede enviar la cotización oficial si está aprobada o pagada',
    });
  }

  const { data: version, error: errorVersion } = await supabase
    .from('cotizacion_versiones')
    .select('*')
    .eq('cotizacion_id', cotizacionId)
    .eq('es_oficial', true)
    .order('version_numero', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorVersion) {
    console.error('[Admin enviar] Error al consultar la versión oficial', errorVersion);
    return res.status(500).json({ ok: false, error: 'No se pudo consultar la versión oficial' });
  }

  if (!version) {
    return res.status(409).json({ ok: false, error: 'La cotización no tiene una versión oficial' });
  }

  const itemsBrutos: ItemVersion[] = Array.isArray(version.items)
    ? (version.items as ItemVersion[])
    : [];
  if (itemsBrutos.length === 0) {
    return res.status(409).json({ ok: false, error: 'La versión oficial no tiene ítems' });
  }

  let items: Array<{
    descripcion: string;
    detalle: string;
    unidad: string;
    cantidad: number;
    precio_unitario: number;
  }>;

  try {
    items = itemsBrutos.map((item, index) => {
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
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'La versión oficial tiene ítems inválidos';
    return res.status(409).json({ ok: false, error: mensaje });
  }

  const subtotal = Number(version.subtotal ?? 0);
  const igv = Number(version.igv ?? 0);
  const flete = Number(version.flete ?? 0);
  const total = Number(version.total ?? 0);

  let pdf: Buffer;
  try {
    pdf = await generarPdfCotizacion({
      numero: cotizacion.codigo,
      fecha: fechaLima(version.created_at ?? cotizacion.created_at),
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
  } catch (error) {
    console.error('[Admin enviar] Error al compilar el PDF oficial', error);
    return res.status(500).json({ ok: false, error: 'No se pudo generar el PDF oficial' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'Falta configurar RESEND_API_KEY' });
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

  try {
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
      return res.status(502).json({ ok: false, error: 'No se pudo enviar la cotización por correo' });
    }
  } catch (error) {
    console.error('[Admin enviar] Error inesperado de Resend', error);
    return res.status(502).json({ ok: false, error: 'No se pudo enviar la cotización por correo' });
  }

  const enviadoAt = new Date().toISOString();
  const { error: errorRegistro } = await supabase
    .from('cotizaciones')
    .update({
      ultimo_envio_at: enviadoAt,
      ultimo_envio_correo: correoDestino,
    })
    .eq('id', cotizacionId);

  if (errorRegistro) {
    console.error('[Admin enviar] No se pudo registrar el envío', errorRegistro);
  }

  return res.status(200).json({
    ok: true,
    mensaje: 'Cotización oficial enviada correctamente',
    cotizacion_id: cotizacionId,
    correo: correoDestino,
    enviado_at: enviadoAt,
    registro_actualizado: !errorRegistro,
    ...(errorRegistro
      ? { advertencia: 'El correo se envió, pero no se pudo registrar el envío' }
      : {}),
  });
}
