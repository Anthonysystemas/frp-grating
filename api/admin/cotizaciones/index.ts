import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ESTADOS,
  esEstadoValido,
  type EstadoCotizacion,
} from '../../../src/lib/admin/states.js';
import { supabaseAdmin as supabase } from '../../../src/lib/supabase.js';
import { validarCorreo } from '../../../src/lib/utils/validation.js';

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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TRANSICIONES: Record<EstadoCotizacion, EstadoCotizacion[]> = {
  pendiente_revision: ['aprobada', 'eliminada'],
  aprobada: ['pagada', 'eliminada'],
  pagada: ['eliminada'],
  eliminada: ['pendiente_revision'],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- ACTUALIZACIÓN DE ESTADO Y/O CORREO ---
  if (req.method === 'PATCH') {
    const body = (req.body || {}) as {
      id?: unknown;
      estado?: unknown;
      cliente_correo?: unknown;
    };
    const idRaw = typeof body.id === 'string' ? body.id : req.query.id;
    const id = (Array.isArray(idRaw) ? idRaw[0] : idRaw)?.trim() ?? '';

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ ok: false, error: 'El id de la cotización no es válido' });
    }

    const cambios: {
      estado?: EstadoCotizacion;
      estado_previo?: string | null;
      cliente_correo?: string;
    } = {};

    // Se consulta el estado actual para validar la transición y restaurar.
    const { data: estadoActual, error: errorEstadoActual } = await supabase
      .from('cotizaciones')
      .select('id, estado, estado_previo')
      .eq('id', id)
      .maybeSingle();

    if (errorEstadoActual) {
      console.error('[Admin cotizaciones] Error al consultar el estado actual', errorEstadoActual);
      return res.status(500).json({ ok: false, error: 'No se pudo consultar la cotización' });
    }

    if (!estadoActual) {
      return res.status(404).json({ ok: false, error: 'La cotización no existe' });
    }

    if (body.estado !== undefined) {
      if (!esEstadoValido(body.estado)) {
        return res.status(400).json({ ok: false, error: 'El estado solicitado no es válido' });
      }

      const estadoOrigen = estadoActual.estado;
      if (!esEstadoValido(estadoOrigen)) {
        return res.status(400).json({ ok: false, error: 'La cotización tiene un estado inválido' });
      }

      const transicionesPermitidas = TRANSICIONES[estadoOrigen] ?? [];
      if (!transicionesPermitidas.includes(body.estado)) {
        return res.status(400).json({
          ok: false,
          error: `Transición no permitida: ${estadoOrigen} → ${body.estado}`,
        });
      }

      if (estadoOrigen === 'eliminada') {
        // Restauración exacta al estado anterior.
        const previo = estadoActual.estado_previo;
        const destino = esEstadoValido(previo) && previo !== 'eliminada'
          ? previo
          : 'pendiente_revision';

        cambios.estado = destino;
        cambios.estado_previo = null;
      } else if (body.estado === 'eliminada') {
        cambios.estado = 'eliminada';
        cambios.estado_previo = estadoOrigen;
      } else {
        cambios.estado = body.estado;
      }
    }

    if (body.cliente_correo !== undefined) {
      const correo = typeof body.cliente_correo === 'string' ? body.cliente_correo.trim() : '';
      if (!correo || !validarCorreo(correo)) {
        return res.status(400).json({ ok: false, error: 'El correo electrónico no es válido' });
      }
      cambios.cliente_correo = correo;
    }

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Debe enviar estado o cliente_correo para actualizar',
      });
    }

    const { data: cotizacionActualizada, error: errorActualizar } = await supabase
      .from('cotizaciones')
      .update(cambios)
      .eq('id', id)
      .select('id, codigo, estado, estado_previo, cliente_correo')
      .maybeSingle();

    if (errorActualizar) {
      console.error('[Admin cotizaciones] Error al actualizar la cotización', errorActualizar);
      return res.status(500).json({ ok: false, error: 'No se pudo actualizar la cotización' });
    }

    if (!cotizacionActualizada) {
      return res.status(404).json({ ok: false, error: 'La cotización no existe' });
    }

    const mensaje =
      cambios.estado && cambios.cliente_correo
        ? 'Cotización actualizada correctamente'
        : cambios.estado
          ? `Estado actualizado a ${ESTADOS[cambios.estado as keyof typeof ESTADOS].label}`
          : 'Correo actualizado correctamente';

    return res.status(200).json({
      ok: true,
      mensaje,
      cotizacion: cotizacionActualizada,
    });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const estadoRaw = req.query.estado;
  const estadoFiltro = (Array.isArray(estadoRaw) ? estadoRaw[0] : estadoRaw)?.trim();

  // 1. Carátulas de cotizaciones, de la más reciente a la más antigua.
  // Por defecto se excluyen las eliminadas; ?estado=eliminada devuelve solo esas.
  const consultaBase = supabase.from('cotizaciones').select('*');
  const consulta =
    estadoFiltro === 'eliminada'
      ? consultaBase.eq('estado', 'eliminada')
      : consultaBase.neq('estado', 'eliminada');

  const { data: cotizaciones, error: errorCotizaciones } = await consulta.order('created_at', {
    ascending: false,
  });

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
