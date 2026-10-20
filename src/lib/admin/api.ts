import type { Cotizacion, VersionCotizacion } from "./types";

const API_LISTA = "/api/admin/cotizaciones";
const API_APROBAR = "/api/admin/aprobar";

interface ListaResponse {
  ok?: boolean;
  cotizaciones?: Cotizacion[];
  error?: string;
}

export interface AprobarItemPayload {
  id: string;
  nombre: string;
  detalle: string;
  cantidad: number;
  precio_unitario: number;
  unidad: string;
}

export interface AprobarPayload {
  cotizacion_id: string;
  items: AprobarItemPayload[];
  flete: number;
  administrador?: Record<string, string>;
}

export interface AprobarResponse {
  ok?: boolean;
  error?: string;
  version_oficial?: VersionCotizacion;
  pdfBase64?: string;
}

export async function fetchCotizaciones(): Promise<Cotizacion[]> {
  const respuesta = await fetch(API_LISTA, { headers: { Accept: "application/json" } });
  const data = (await respuesta.json().catch(() => ({}))) as ListaResponse;

  if (!respuesta.ok || !data.ok) {
    throw new Error(data.error || `No se pudieron cargar las cotizaciones (HTTP ${respuesta.status})`);
  }

  return Array.isArray(data.cotizaciones) ? data.cotizaciones : [];
}

export async function aprobarCotizacion(payload: AprobarPayload): Promise<AprobarResponse> {
  const respuesta = await fetch(API_APROBAR, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await respuesta.json().catch(() => ({}))) as AprobarResponse;

  if (!respuesta.ok || !data.ok || !data.version_oficial) {
    throw new Error(data.error || `No se pudo aprobar la cotización (HTTP ${respuesta.status})`);
  }

  return data;
}
