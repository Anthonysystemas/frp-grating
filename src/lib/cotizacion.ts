import { Resend } from 'resend';
import { validarCorreo } from './utils/validation.js';

export class EnvioError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'EnvioError';
    this.status = status;
  }
}

const EMAIL_TIMEOUT_MS = 8000;

/**
 * Limita una llamada externa para que un proveedor lento no consuma todo el
 * tiempo de ejecución de la función serverless.
 */
async function conTimeout<T>(promesa: Promise<T>, ms = EMAIL_TIMEOUT_MS): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => {
      reject(new EnvioError('El servicio de correo excedió el tiempo de espera', 504));
    }, ms);
  });

  return Promise.race([promesa, timeout]).finally(() => {
    if (temporizador) clearTimeout(temporizador);
  });
}

export function escaparHtml(valor: string) {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ClienteCotizacion {
  nombre?: string;
  empresa?: string;
  ruc?: string;
  correo?: string;
  celular?: string;
}

export interface ClienteNormalizado {
  nombre: string;
  empresa: string;
  ruc: string;
  correo: string;
  celular: string;
}

export type ResultadoValidacionCliente =
  | { ok: true; cliente: ClienteNormalizado }
  | { ok: false; error: string };

/**
 * Validaciones de texto y longitud del contacto.
 * Se comparten entre /api/cotizacion y /api/enviar-correo para no divergir.
 */
export function validarCliente(cliente: ClienteCotizacion | undefined | null): ResultadoValidacionCliente {
  if (!cliente || typeof cliente !== 'object') {
    return { ok: false, error: 'Datos de contacto inválidos' };
  }

  const nombre = (cliente.nombre || '').trim();
  const empresa = (cliente.empresa || '').trim();
  const ruc = (cliente.ruc || '').trim();
  const correo = (cliente.correo || '').trim();
  const celular = (cliente.celular || '').trim();

  if (!nombre) return { ok: false, error: 'El nombre es obligatorio' };
  if (nombre.length > 100) return { ok: false, error: 'Nombre excede los 100 caracteres' };

  if (!empresa) return { ok: false, error: 'La empresa es obligatoria' };
  if (empresa.length > 200) return { ok: false, error: 'Empresa excede los 200 caracteres' };

  // Solo se exige la presencia de "@"; no se restringe el dominio.
  if (!correo || !validarCorreo(correo)) {
    return { ok: false, error: 'No es correo válido.' };
  }

  const celularRegex = /^9\d{8}$/;
  if (!celular || !celularRegex.test(celular)) {
    return { ok: false, error: 'No es un número válido.' };
  }

  // RUC obligatorio: exactamente 11 dígitos con prefijo válido.
  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) {
    return { ok: false, error: 'No es RUC válido. Ingrese RUC válido.' };
  }

  return { ok: true, cliente: { nombre, empresa, ruc, correo, celular } };
}

/**
 * Envía la cotización por correo a ventas@ con el PDF adjunto.
 * Lógica de Resend compartida entre /api/cotizacion y /api/enviar-correo.
 */
export async function enviarCotizacion(params: {
  codigo: string;
  empresa: string;
  celular: string;
  subtotal: string;
  igv: string;
  total: string;
  pdfBase64: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) throw new EnvioError('Falta configurar RESEND_API_KEY', 500);

  const { codigo, empresa, celular, subtotal, igv, total, pdfBase64 } = params;
  const from = process.env.EMAIL_FROM || 'Maskel Perú <onboarding@resend.dev>';
  const empresaSinSaltos = empresa.replace(/[\r\n]+/g, ' ').trim();
  const empresaSegura = escaparHtml(empresaSinSaltos);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.6;font-size:14px;max-width:560px">
      <p><strong>Nueva cotización generada</strong></p>
      <p>Código: <strong>${escaparHtml(codigo)}</strong><br />
        Empresa: ${empresaSegura}<br />
        Celular: ${escaparHtml(celular)}<br />
        Subtotal: <strong>US$ ${escaparHtml(subtotal)}</strong><br />
        IGV (18%): <strong>US$ ${escaparHtml(igv)}</strong><br />
        Total: <strong>US$ ${escaparHtml(total)}</strong></p>
    </div>`;

  const resend = new Resend(apiKey);
  const { error } = await conTimeout(
    resend.emails.send({
      from,
      to: 'ventas@maskelperu.com',
      subject: `Cotización ${codigo} – ${empresaSinSaltos}`,
      html,
      attachments: [{ filename: `${codigo}.pdf`, content: pdfBase64 }],
    }),
  );

  if (error) {
    throw new EnvioError(error.message || 'Resend rechazó el envío', 502);
  }
}

/**
 * Notificación interna de nuevo lead. Es best-effort: si falla o falta
 * configuración, no debe romper la cotización pública.
 */
export async function enviarAlertaLead(params: {
  codigo: string;
  nombre: string;
  empresa: string;
  ruc: string;
  correo: string;
  celular: string;
  total: string;
  items: number;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const destinatarios = (process.env.COPIA_EMAIL || '')
    .split(',')
    .map((correo) => correo.trim())
    .filter(Boolean);

  if (!apiKey || destinatarios.length === 0) {
    console.warn('[Cotización] Alerta de lead omitida: falta RESEND_API_KEY o COPIA_EMAIL');
    return false;
  }

  const { codigo, nombre, empresa, ruc, correo, celular, total, items } = params;
  const from = process.env.EMAIL_FROM || 'Maskel Perú <onboarding@resend.dev>';
  const empresaSinSaltos = empresa.replace(/[\r\n]+/g, ' ').trim();

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.6;font-size:14px;max-width:560px">
      <p><strong>Nuevo lead de cotización</strong></p>
      <p>
        Código: <strong>${escaparHtml(codigo)}</strong><br />
        Cliente: ${escaparHtml(nombre)}<br />
        Empresa: ${escaparHtml(empresaSinSaltos || '—')}<br />
        RUC: ${escaparHtml(ruc || '—')}<br />
        Correo: ${escaparHtml(correo)}<br />
        Celular: ${escaparHtml(celular)}<br />
        Ítems: ${items}<br />
        Total estimado: <strong>US$ ${escaparHtml(total)}</strong>
      </p>
    </div>`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await conTimeout(
      resend.emails.send({
        from,
        to: destinatarios,
        subject: `Nuevo lead ${codigo}${empresaSinSaltos ? ` — ${empresaSinSaltos}` : ''}`,
        html,
      }),
    );

    if (error) {
      console.error('[Cotización] Resend rechazó la alerta de lead', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Cotización] Error al enviar la alerta de lead', error);
    return false;
  }
}
