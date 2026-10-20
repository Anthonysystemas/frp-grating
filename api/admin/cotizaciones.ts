import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase } from '../../src/lib/supabase.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  // 1. Carátulas de cotizaciones, de la más reciente a la más antigua.
  const { data: cotizaciones, error: errorCotizaciones } = await supabase
    .from('cotizaciones')
    .select('*')
    .order('created_at', { ascending: false });

  if (errorCotizaciones) {
    console.error('[Admin cotizaciones] Error al consultar cotizaciones', errorCotizaciones);
    return res.status(500).json({ ok: false, error: 'No se pudieron obtener las cotizaciones' });
  }

  const lista = cotizaciones ?? [];

  if (lista.length === 0) {
    return res.status(200).json({ ok: true, total: 0, cotizaciones: [] });
  }

  // 2. Todas las versiones de esas cotizaciones en una sola consulta (evita N+1).
  const ids = lista.map((cotizacion) => cotizacion.id);
  const { data: versiones, error: errorVersiones } = await supabase
    .from('cotizacion_versiones')
    .select('*')
    .in('cotizacion_id', ids)
    .order('version_numero', { ascending: false });

  if (errorVersiones) {
    console.error('[Admin cotizaciones] Error al consultar versiones', errorVersiones);
    return res.status(500).json({ ok: false, error: 'No se pudieron obtener las versiones de las cotizaciones' });
  }

  // 3. Agrupar versiones por cotización. El orden descendente deja la más
  // reciente en la primera posición de cada grupo.
  const versionesPorCotizacion = new Map<string, VersionCotizacion[]>();
  for (const version of (versiones ?? []) as VersionCotizacion[]) {
    const grupo = versionesPorCotizacion.get(version.cotizacion_id) ?? [];
    grupo.push(version);
    versionesPorCotizacion.set(version.cotizacion_id, grupo);
  }

  const resultado = lista.map((cotizacion) => {
    const versionesCotizacion = versionesPorCotizacion.get(cotizacion.id) ?? [];
    return {
      ...cotizacion,
      versiones: versionesCotizacion,
      version_actual: versionesCotizacion[0] ?? null,
    };
  });

  return res.status(200).json({
    ok: true,
    total: resultado.length,
    cotizaciones: resultado,
  });
}
