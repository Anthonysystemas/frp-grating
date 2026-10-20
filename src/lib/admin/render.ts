import { escapeHtml, fechaCorta, money } from "./format";
import { enlaceWhatsApp, subtotalLinea, totalesDeVersion } from "./quote";
import type { CatalogoCategoria, Cotizacion, Linea } from "./types";

export const badgeEstado = (estado?: string): string => {
  if (estado === "aprobada") {
    return '<span class="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>Aprobada</span>';
  }
  if (estado === "pendiente_revision") {
    return '<span class="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"><span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>Pendiente</span>';
  }
  return `<span class="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-700/30 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">${escapeHtml(estado || "Sin estado")}</span>`;
};

/**
 * Tarjeta compacta tipo ticket para móvil. No muestra el desglose de ítems:
 * el detalle, la edición y la aprobación viven en el modal.
 */
export const tarjeta = (cotizacion: Cotizacion): string => {
  const version = cotizacion.version_actual;
  const totales = totalesDeVersion(version);
  const celularDigitos = String(cotizacion.cliente_celular ?? "").replace(/\D/g, "");
  const celular = cotizacion.cliente_celular ? `Cel. ${cotizacion.cliente_celular}` : "";
  const documento = cotizacion.cliente_ruc_dni ? `RUC/DNI ${cotizacion.cliente_ruc_dni}` : "";
  const contacto = [celular, documento].filter(Boolean).join(" · ") || "Sin contacto";
  const total = version ? money(totales.total) : "—";

  return `
    <article class="flex h-full flex-col rounded-xl bg-slate-900 border border-slate-800 p-3 shadow-sm shadow-black/20 transition hover:border-slate-700">
      <div class="flex items-center justify-between gap-2">
        <h2 class="min-w-0 truncate font-mono text-xs font-semibold text-slate-200">${escapeHtml(cotizacion.codigo)}</h2>
        ${badgeEstado(cotizacion.estado)}
      </div>

      <p class="mt-1.5 text-base font-bold text-emerald-400">${total}</p>

      <div class="border-t border-dashed border-slate-800 my-2"></div>

      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-slate-100">${escapeHtml(cotizacion.cliente_nombre || "—")}</p>
        ${
          cotizacion.cliente_celular
            ? `<a class="mt-0.5 block truncate text-xs text-slate-400 hover:text-slate-300 hover:underline" href="tel:${escapeHtml(celularDigitos)}">${escapeHtml(contacto)}</a>`
            : `<p class="mt-0.5 truncate text-xs text-slate-400">${escapeHtml(contacto)}</p>`
        }
        <p class="mt-1 text-[11px] text-slate-500">${escapeHtml(fechaCorta(cotizacion.created_at))}</p>
        ${
          totales.flete > 0
            ? `<p class="mt-1 text-[11px] text-slate-500">Incluye flete ${money(totales.flete)}</p>`
            : ""
        }
      </div>

      <div class="mt-auto flex items-center gap-2 pt-3">
        <a
          href="${escapeHtml(enlaceWhatsApp(cotizacion))}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir WhatsApp del cliente"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 p-2 text-emerald-400 transition hover:bg-emerald-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.14h-.01a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.23 8.22Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z" />
          </svg>
        </a>

        <button
          type="button"
          data-approve="${escapeHtml(cotizacion.id)}"
          class="w-full flex-1 rounded-lg bg-blue-600 px-3 py-2 text-center text-xs font-medium text-white transition hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
        >
          Ver / Aprobar
        </button>
      </div>
    </article>`;
};

export const filaModal = (linea: Linea): string => `
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
      <button
        type="button"
        data-remove-item
        class="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
        aria-label="Eliminar ${escapeHtml(linea.nombre || "ítem")}"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"></path>
        </svg>
      </button>
    </div>

    <div class="mt-2.5 flex flex-wrap items-end gap-2">
      <label class="w-20">
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
      </label>

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
