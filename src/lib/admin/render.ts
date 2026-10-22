import { escapeHtml, fechaCorta, money } from "./format";
import { enlaceWhatsApp, subtotalLinea, totalesDeVersion } from "./quote";
import { obtenerEstado } from "./states";
import type { CatalogoCategoria, Cotizacion, Linea } from "./types";

export const badgeEstado = (estado?: string): string => {
  const config = obtenerEstado(estado);
  return `<span class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${config.badgeBg}"><span class="h-1.5 w-1.5 rounded-full bg-current"></span>${escapeHtml(config.label)}</span>`;
};

/**
 * Tarjeta compacta tipo ticket para móvil. No muestra el desglose de ítems:
 * el detalle, la edición y la aprobación viven en el modal.
 */
export const tarjeta = (cotizacion: Cotizacion): string => {
  const version = cotizacion.version_actual;
  const totales = totalesDeVersion(version);
  const celular = cotizacion.cliente_celular ? `Cel. ${cotizacion.cliente_celular}` : "";
  const documento = cotizacion.cliente_ruc_dni ? `RUC ${cotizacion.cliente_ruc_dni}` : "";
  const contacto = [celular, documento].filter(Boolean).join(" · ") || "Sin contacto";
  const nombre =
    cotizacion.cliente_nombre?.trim() ||
    cotizacion.cliente?.nombre?.trim() ||
    cotizacion.nombre?.trim() ||
    "—";
  const empresa =
    cotizacion.cliente_empresa?.trim() ||
    cotizacion.empresa?.trim() ||
    cotizacion.cliente?.empresa?.trim() ||
    "";
  const nombreCompleto = empresa ? `${nombre} — ${empresa}` : nombre;
  const total = version ? money(totales.total) : "—";
  const configEstado = obtenerEstado(cotizacion.estado);
  const esEliminada = cotizacion.estado === "eliminada";
  const accionAttr = esEliminada
    ? `data-restore="${escapeHtml(cotizacion.id)}"`
    : cotizacion.estado === "aprobada"
      ? `data-mark-paid="${escapeHtml(cotizacion.id)}"`
      : `data-approve="${escapeHtml(cotizacion.id)}"`;

  return `
    <article class="flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-sm shadow-black/20 transition hover:border-slate-700">
      <div class="flex items-center justify-between gap-2">
        <h2 class="min-w-0 truncate font-mono text-xs font-semibold text-slate-200">${escapeHtml(cotizacion.codigo)}</h2>
        ${badgeEstado(cotizacion.estado)}
      </div>

      <p class="mt-2 truncate text-sm font-semibold text-white" title="${escapeHtml(nombreCompleto)}">
        ${escapeHtml(nombre)}${empresa ? `<span class="text-slate-300"> — ${escapeHtml(empresa)}</span>` : ""}
      </p>

      <p class="mt-0.5 truncate text-xs text-slate-400">${escapeHtml(contacto)}</p>

      <div class="mt-3 flex items-end justify-between gap-3">
        <p class="text-[11px] text-slate-500">${escapeHtml(fechaCorta(cotizacion.created_at))}</p>
        <p class="shrink-0 text-lg font-bold text-emerald-400">${total}</p>
      </div>

      <div class="mt-auto flex items-center gap-2 pt-3">
        <button
          type="button"
          ${accionAttr}
          class="min-w-0 flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${configEstado.btnBg}"
        >
          ${escapeHtml(configEstado.accionPrincipal)}
        </button>

        <details class="relative shrink-0" data-card-menu>
          <summary
            class="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 text-lg leading-none text-slate-300 transition hover:border-slate-600 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 [&::-webkit-details-marker]:hidden"
            aria-label="Más acciones"
          >
            ⋯
          </summary>
          <div class="absolute right-0 top-full z-30 mt-2 w-40 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-2xl">
            <button
              type="button"
              data-approve="${escapeHtml(cotizacion.id)}"
              class="block w-full px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-slate-800"
            >
              Ver detalle
            </button>
            <a
              href="${escapeHtml(enlaceWhatsApp(cotizacion))}"
              target="_blank"
              rel="noopener noreferrer"
              class="block px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
            >
              WhatsApp
            </a>
            ${
              esEliminada
                ? `<button
              type="button"
              data-restore="${escapeHtml(cotizacion.id)}"
              class="block w-full px-3 py-2 text-left text-xs font-medium text-amber-300 transition hover:bg-amber-500/10"
            >
              Restaurar
            </button>`
                : `<button
              type="button"
              data-delete="${escapeHtml(cotizacion.id)}"
              class="block w-full px-3 py-2 text-left text-xs font-medium text-red-300 transition hover:bg-red-500/10"
            >
              Eliminar
            </button>`
            }
          </div>
        </details>
      </div>
    </article>`;
};

export const filaModal = (linea: Linea, editable = true): string => `
  <div
    class="rounded-lg border border-slate-800 bg-[#0B1120] p-3"
    data-modal-item
    data-id="${escapeHtml(linea.id)}"
    data-unidad="${escapeHtml(linea.unidad)}"
    data-nombre="${escapeHtml(linea.nombre)}"
    data-detalle="${escapeHtml(linea.detalle)}"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-slate-200">
          ${escapeHtml(linea.nombre || "Producto sin nombre")}
        </p>
        <p class="mt-0.5 text-xs leading-relaxed text-slate-500">
          ${escapeHtml(linea.detalle || "Sin detalle")}
        </p>
        <span class="mt-1 inline-flex rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          ${escapeHtml(linea.unidad || "unidad")}
        </span>
      </div>
      ${
        editable
          ? `<button
        type="button"
        data-remove-item
        class="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
        aria-label="Eliminar ${escapeHtml(linea.nombre || "ítem")}"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"></path>
        </svg>
      </button>`
          : ""
      }
    </div>

    <div class="mt-2.5 flex flex-wrap items-end gap-2">
      ${
        editable
          ? `<label class="w-20">
        <span class="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Cant.</span>
        <input
          type="number"
          min="1"
          step="1"
          inputmode="numeric"
          data-qty
          value="${escapeHtml(linea.cantidad)}"
          class="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-2 py-2 text-center font-mono text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          aria-label="Cantidad de ${escapeHtml(linea.nombre || "ítem")}"
        />
      </label>

      <label class="min-w-[8.5rem] flex-1">
        <span class="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Precio unitario</span>
        <div class="mt-1 flex items-center rounded-lg border border-slate-700 bg-[#070B14] focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
          <span class="pl-2.5 text-xs font-semibold text-slate-500">US$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            data-price
            value="${linea.precio_unitario.toFixed(2)}"
            class="w-full bg-transparent px-2 py-2 text-right font-mono text-sm text-white outline-none"
            aria-label="Precio unitario de ${escapeHtml(linea.nombre || "ítem")}"
          />
        </div>
      </label>`
          : `<p class="text-xs text-slate-400">
        ${escapeHtml(linea.cantidad)} ${escapeHtml(linea.unidad || "unidad")}(s) × ${money(linea.precio_unitario)}
      </p>`
      }

      <p class="ml-auto pb-1.5 text-right">
        <span class="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Subtotal</span>
        <span data-line-subtotal class="font-mono text-sm font-bold text-slate-200">${money(subtotalLinea(linea))}</span>
      </p>
    </div>
  </div>`;

export const opcionesCategoria = (catalogo: CatalogoCategoria[]): string =>
  catalogo
    .map(
      (categoria) =>
        `<option value="${escapeHtml(categoria.id)}">${escapeHtml(categoria.label)}</option>`,
    )
    .join("");

export const opcionesProducto = (categoria: CatalogoCategoria | null): string =>
  (categoria?.options ?? [])
    .map(
      (opcion) =>
        `<option value="${escapeHtml(opcion.code)}">${escapeHtml(opcion.name)} — ${escapeHtml(opcion.label)} — ${money(opcion.price)}</option>`,
    )
    .join("");
