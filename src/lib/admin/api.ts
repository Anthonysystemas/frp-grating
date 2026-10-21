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

/** Convierte cualquier error a un mensaje legible, nunca a "[object Object]". */
export function mensajeError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const mensaje = error.message.trim();
    if (mensaje) return mensaje;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object") {
    const objeto = error as Record<string, unknown>;
    for (const candidato of [objeto.error, objeto.message, objeto.detail, objeto.hint]) {
      if (typeof candidato === "string" && candidato.trim()) {
        return candidato.trim();
      }
      if (candidato && typeof candidato === "object") {
        const anidado = mensajeError(candidato, "");
        if (anidado) return anidado;
      }
    }

    try {
      const serializado = JSON.stringify(error);
      if (serializado && serializado !== "{}") return serializado;
    } catch {
      /* El objeto no se puede serializar. */
    }

    const textoObjeto = String(error);
    if (textoObjeto && textoObjeto !== "[object Object]") return textoObjeto;
  } else if (error !== null && error !== undefined) {
    const texto = String(error).trim();
    if (texto) return texto;
  }

  return fallback;
}

function mensajeDesdeRespuesta(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return typeof data === "string" && data.trim() ? data.trim() : undefined;
  }

  const objeto = data as Record<string, unknown>;
  if (typeof objeto.error === "string" && objeto.error.trim()) {
    return objeto.error.trim();
  }
  if (objeto.error && typeof objeto.error === "object") {
    const anidado = mensajeError(objeto.error, "");
    if (anidado) return anidado;
  }
  if (typeof objeto.message === "string" && objeto.message.trim()) {
    return objeto.message.trim();
  }
  if (typeof objeto.detail === "string" && objeto.detail.trim()) {
    return objeto.detail.trim();
  }

  return undefined;
}

async function leerJson(respuesta: Response): Promise<unknown> {
  const texto = await respuesta.text().catch(() => "");
  if (!texto) return {};

  try {
    return JSON.parse(texto);
  } catch {
    // Si el servidor devuelve HTML/texto (por ejemplo, un 500 de Vercel),
    // conservamos un fragmento para mostrarlo en el panel.
    return { error: texto.slice(0, 300) };
  }
}

export async function fetchCotizaciones(): Promise<Cotizacion[]> {
  let respuesta: Response;

  try {
    respuesta = await fetch(API_LISTA, { headers: { Accept: "application/json" } });
  } catch (error) {
    throw new Error(mensajeError(error, "No se pudo conectar con el servidor"));
  }

  const data = await leerJson(respuesta);
  const dataLista = data as ListaResponse;

  if (!respuesta.ok || dataLista?.ok !== true) {
    throw new Error(
      mensajeDesdeRespuesta(data) ||
        `No se pudieron cargar las cotizaciones (HTTP ${respuesta.status})`,
    );
  }

  return Array.isArray(dataLista.cotizaciones) ? dataLista.cotizaciones : [];
}

export async function aprobarCotizacion(payload: AprobarPayload): Promise<AprobarResponse> {
  let respuesta: Response;

  try {
    respuesta = await fetch(API_APROBAR, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(mensajeError(error, "No se pudo conectar con el servidor"));
  }

  const data = await leerJson(respuesta);
  const dataAprobar = data as AprobarResponse;

  if (!respuesta.ok || dataAprobar?.ok !== true || !dataAprobar.version_oficial) {
    throw new Error(
      mensajeDesdeRespuesta(data) ||
        `No se pudo aprobar la cotización (HTTP ${respuesta.status})`,
    );
  }

  return dataAprobar;
}
