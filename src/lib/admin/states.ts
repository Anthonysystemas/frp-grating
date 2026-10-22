export interface EstadoConfig {
  label: string;
  badgeBg: string;
  accionPrincipal: string;
  btnBg: string;
}

export const ESTADOS = {
  pendiente_revision: {
    label: "Pendiente",
    badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    accionPrincipal: "Aprobar",
    btnBg: "bg-blue-600 hover:bg-blue-500 text-white",
  },
  aprobada: {
    label: "Aprobada",
    badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    accionPrincipal: "Marcar pagada",
    btnBg: "bg-emerald-600 hover:bg-emerald-500 text-white",
  },
  pagada: {
    label: "Pagada",
    badgeBg: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    accionPrincipal: "Ver detalle",
    btnBg: "bg-slate-700 hover:bg-slate-600 text-slate-200",
  },
  eliminada: {
    label: "Eliminada",
    badgeBg: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    accionPrincipal: "Restaurar",
    btnBg: "bg-amber-600/80 hover:bg-amber-500 text-white",
  },
} as const satisfies Record<string, EstadoConfig>;

export type EstadoCotizacion = keyof typeof ESTADOS;

const ESTADO_DESCONOCIDO: EstadoConfig = {
  label: "Sin estado",
  badgeBg: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  accionPrincipal: "Ver detalle",
  btnBg: "bg-slate-700 hover:bg-slate-600 text-slate-200",
};

export const esEstadoValido = (estado: unknown): estado is EstadoCotizacion =>
  typeof estado === "string" && Object.prototype.hasOwnProperty.call(ESTADOS, estado);

export const obtenerEstado = (estado?: string): EstadoConfig =>
  esEstadoValido(estado) ? ESTADOS[estado] : ESTADO_DESCONOCIDO;
