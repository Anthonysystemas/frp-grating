import type { EstadoCotizacion } from "./states";
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

function redirigirSesionExpirada(): void {
  if (typeof window !== "undefined") {
    window.location.replace("/admin/login?expired=true");
  }
}

function redirigirNoAutorizado(): void {
  if (typeof window !== "undefined") {
    window.location.replace("/admin/login?unauthorized=true");
  }
}

async function fetchAdmin(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const respuesta = await fetch(input, init);

  if (respuesta.status === 401) {
    redirigirSesionExpirada();
    throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
  }

  if (respuesta.status === 403) {
    redirigirNoAutorizado();
    throw new Error("Tu correo no está autorizado para acceder al panel.");
  }

  return respuesta;
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

export async function fetchCotizaciones(estado?: "eliminada"): Promise<Cotizacion[]> {
  let respuesta: Response;

  const url = estado ? `${API_LISTA}?estado=${encodeURIComponent(estado)}` : API_LISTA;

  try {
    respuesta = await fetchAdmin(url, { headers: { Accept: "application/json" } });
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

export async function cambiarEstadoCotizacion(
  id: string,
  estado: EstadoCotizacion,
): Promise<Cotizacion | null> {
  let respuesta: Response;

  try {
    respuesta = await fetchAdmin(API_LISTA, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id, estado }),
    });
  } catch (error) {
    throw new Error(mensajeError(error, "No se pudo conectar con el servidor"));
  }

  const data = await leerJson(respuesta);
  const dataEstado = data as { ok?: boolean; error?: string; cotizacion?: Cotizacion };

  if (!respuesta.ok || dataEstado?.ok !== true) {
    throw new Error(
      mensajeDesdeRespuesta(data) ||
        `No se pudo actualizar el estado de la cotización (HTTP ${respuesta.status})`,
    );
  }

  return dataEstado.cotizacion ?? null;
}

export async function cerrarSesionAdmin(): Promise<void> {
  try {
    await fetch("/api/admin/logout", {
      method: "POST",
      headers: { Accept: "application/json" },
    });
  } catch {
    /* Si falla, igual redirigimos al login */
  }
}

export interface EnviarCotizacionResponse {
  ok: boolean;
  success?: boolean;
  iniciado?: boolean;
  message?: string;
  mensaje?: string;
  correo?: string;
  enviado_at?: string;
  registro_actualizado?: boolean;
  advertencia?: string;
}

export async function actualizarCorreoCliente(
  id: string,
  clienteCorreo: string,
): Promise<Cotizacion | null> {
  let respuesta: Response;

  try {
    respuesta = await fetchAdmin(API_LISTA, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id, cliente_correo: clienteCorreo }),
    });
  } catch (error) {
    throw new Error(mensajeError(error, "No se pudo conectar con el servidor"));
  }

  const data = await leerJson(respuesta);
  const dataCorreo = data as { ok?: boolean; error?: string; cotizacion?: Cotizacion };

  if (!respuesta.ok || dataCorreo?.ok !== true) {
    throw new Error(
      mensajeDesdeRespuesta(data) ||
        `No se pudo actualizar el correo (HTTP ${respuesta.status})`,
    );
  }

  return dataCorreo.cotizacion ?? null;
}

export async function enviarCotizacionCliente(
  id: string,
  correo: string,
): Promise<EnviarCotizacionResponse> {
  let respuesta: Response;

  try {
    respuesta = await fetchAdmin(`${API_LISTA}/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ cotizacion_id: id, correo }),
    });
  } catch (error) {
    throw new Error(mensajeError(error, "No se pudo conectar con el servidor"));
  }

  const data = await leerJson(respuesta);
  const dataEnvio = data as Partial<EnviarCotizacionResponse> & { error?: string };

  if (!respuesta.ok || dataEnvio?.ok !== true) {
    throw new Error(
      mensajeDesdeRespuesta(data) ||
        `No se pudo enviar la cotización al cliente (HTTP ${respuesta.status})`,
    );
  }

  return dataEnvio as EnviarCotizacionResponse;
}

export async function aprobarCotizacion(payload: AprobarPayload): Promise<AprobarResponse> {
  let respuesta: Response;

  try {
    respuesta = await fetchAdmin(API_APROBAR, {
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
