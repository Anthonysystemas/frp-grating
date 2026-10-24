import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Endpoint deshabilitado: el flujo público ya no envía correos desde el
 * navegador. El envío oficial se realiza desde /api/admin/cotizaciones/enviar,
 * que reconstruye el PDF y valida la cotización en el servidor.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(410).json({
    ok: false,
    error: 'Este endpoint ya no está disponible. Usa el flujo de cotización o el panel administrativo.',
  });
}
