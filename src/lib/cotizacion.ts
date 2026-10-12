import { Resend } from 'resend';

export class EnvioError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'EnvioError';
    this.status = status;
  }
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
  if (empresa.length > 120) return { ok: false, error: 'Empresa excede los 120 caracteres' };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!correo || !emailRegex.test(correo) || correo.length > 120) {
    return { ok: false, error: 'El correo electrónico no es válido' };
  }

  const celularRegex = /^9\d{8}$/;
  if (!celular || !celularRegex.test(celular)) {
    return { ok: false, error: 'El celular no es válido. Debe tener 9 dígitos y empezar con 9' };
  }

  if (ruc) {
    const rucRegex = /^(10|15|17|20)\d{9}$/;
    if (!rucRegex.test(ruc)) {
      return { ok: false, error: 'RUC inválido. Debe tener 11 dígitos y empezar con 10, 15, 17 o 20' };
    }
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
  const { error } = await resend.emails.send({
    from,
    to: 'ventas@maskelperu.com',
    subject: `Cotización ${codigo} – ${empresaSinSaltos}`,
    html,
    attachments: [{ filename: `${codigo}.pdf`, content: pdfBase64 }],
  });

  if (error) {
    throw new EnvioError(error.message || 'Resend rechazó el envío', 502);
  }
}
