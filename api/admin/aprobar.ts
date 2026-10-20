import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  AprobarError,
  aprobarCotizacion,
  type AprobarPayload,
} from '../../src/lib/admin/approve-service.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const resultado = await aprobarCotizacion((req.body || {}) as AprobarPayload);

    return res.status(200).json({
      ok: true,
      mensaje: 'Cotización aprobada correctamente',
      ...resultado,
    });
  } catch (error) {
    if (error instanceof AprobarError) {
      return res.status(error.status).json({ ok: false, error: error.message });
    }

    console.error('[Admin aprobar] Error inesperado', error);
    return res.status(500).json({ ok: false, error: 'No se pudo aprobar la cotización' });
  }
}
