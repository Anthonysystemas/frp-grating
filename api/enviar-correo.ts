import type { VercelRequest, VercelResponse } from '@vercel/node';
import { EnvioError, enviarCotizacion, validarCliente } from '../src/lib/cotizacion.js';

const CODIGO_REGEX = /^MSK-\d{6}-\d{6}$/;

interface EnviarCorreoItem {
  id?: string;
  qty?: number;
}

interface EnviarCorreoPayload {
  codigo?: string;
  cliente?: {
    nombre?: string;
    empresa?: string;
    ruc?: string;
    correo?: string;
    celular?: string;
  };
  items?: EnviarCorreoItem[];
  subtotalCentavos?: number;
  igvCentavos?: number;
  totalCentavos?: number;
  pdfBase64?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const { codigo, cliente, items, subtotalCentavos, igvCentavos, totalCentavos, pdfBase64 } =
    (req.body || {}) as EnviarCorreoPayload;

  // --- HONEYPOT ANTI-SPAM ---
  // Mismo criterio que /api/cotizacion: si el campo oculto `website` llega con
  // contenido, la petición es de un bot (o un POST directo) y se rechaza.
  const honeypot = ((cliente as any)?.website || '').toString().trim();
  if (honeypot) {
    return res.status(400).json({ ok: false, error: 'Solicitud rechazada' });
  }

  // --- VALIDACIÓN DE CÓDIGO ---
  const codigoLimpio = (codigo || '').trim();
  if (!codigoLimpio || !CODIGO_REGEX.test(codigoLimpio)) {
    return res.status(400).json({ ok: false, error: 'El código de cotización no es válido' });
  }

  // --- VALIDACIÓN DE CLIENTE (misma lógica que /api/cotizacion) ---
  const validacion = validarCliente(cliente);
  if (!validacion.ok) {
    return res.status(400).json({ ok: false, error: validacion.error });
  }
  const { empresa, celular } = validacion.cliente;

  // --- VALIDACIÓN DE ÍTEMS ---
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Debe incluir al menos un ítem' });
  }
  for (const item of items) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      !Number.isInteger(item.qty) ||
      (item.qty ?? 0) < 1
    ) {
      return res.status(400).json({ ok: false, error: 'Los ítems de la cotización no son válidos' });
    }
  }

  // --- VALIDACIÓN DE TOTALES ---
  if (
    typeof subtotalCentavos !== 'number' || !Number.isFinite(subtotalCentavos) || subtotalCentavos < 0 ||
    typeof igvCentavos !== 'number' || !Number.isFinite(igvCentavos) || igvCentavos < 0 ||
    typeof totalCentavos !== 'number' || !Number.isFinite(totalCentavos) || totalCentavos < 0
  ) {
    return res.status(400).json({ ok: false, error: 'Los totales de la cotización no son válidos' });
  }

  // --- VALIDACIÓN DE PDF ---
  const pdf = (pdfBase64 || '').trim();
  if (!pdf) {
    return res.status(400).json({ ok: false, error: 'El PDF de la cotización es obligatorio' });
  }

  // --- ENVÍO POR CORREO (await: Vercel corta la ejecución al responder) ---
  try {
    await enviarCotizacion({
      codigo: codigoLimpio,
      empresa,
      celular,
      subtotal: (subtotalCentavos / 100).toFixed(2),
      igv: (igvCentavos / 100).toFixed(2),
      total: (totalCentavos / 100).toFixed(2),
      pdfBase64: pdf,
    });
  } catch (error) {
    const status = error instanceof EnvioError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'No se pudo enviar la cotización por correo';
    console.error('[Enviar correo] Error al enviar', message);
    return res.status(status).json({ ok: false, error: message });
  }

  return res.status(200).json({ ok: true });
}
