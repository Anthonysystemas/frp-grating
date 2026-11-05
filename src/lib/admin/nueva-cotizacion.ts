import { importarCotizacion, mensajeError } from "./api";
import { escapeHtml, money } from "./format";
import { opcionesCategoria, opcionesProducto } from "./render";
import type { CatalogoCategoria, CatalogoOpcion } from "./types";

const getRequiredElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    const message = `[Admin] No se encontró el elemento requerido #${id}`;
    console.warn(message);
    throw new Error(message);
  }
  return element as T;
};

export interface NuevaCotizacionCreada {
  id?: string;
  codigo?: string;
}

const filaProducto = (
  opcion: CatalogoOpcion,
  categoria: CatalogoCategoria,
  cantidad: number,
): string => {
  const nombreSeguro = escapeHtml(opcion.name);
  const detalleSeguro = escapeHtml(opcion.label);
  const unidad = opcion.unidad || categoria.unit || "unidad";

  return `
    <div
      data-nueva-item
      data-producto-id="${escapeHtml(opcion.code)}"
      data-precio="${opcion.price}"
      data-nombre="${nombreSeguro}"
      data-detalle="${detalleSeguro}"
      data-unidad="${escapeHtml(unidad)}"
      class="rounded-xl border border-slate-800 bg-[#0B1120] p-3"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <span class="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Catálogo</span>
          <p class="mt-1.5 truncate text-sm font-bold text-white" title="${nombreSeguro}">${nombreSeguro}</p>
          ${detalleSeguro ? `<p class="mt-0.5 text-xs text-slate-400">${detalleSeguro}</p>` : ""}
          <p class="mt-1 text-[10px] uppercase tracking-wide text-slate-500">${escapeHtml(unidad)}</p>
        </div>
        <button
          type="button"
          data-nueva-remove
          class="-mr-1 -mt-1 rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          aria-label="Quitar ${nombreSeguro}"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" d="M18 6 6 18M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[5rem_1fr_7rem] sm:items-end">
        <label class="block">
          <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Cant.</span>
          <input
            data-nueva-cantidad
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            value="${cantidad}"
            class="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-2 py-2 text-center font-mono text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>

        <div>
          <span class="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">P. unitario</span>
          <div class="mt-1 rounded-lg border border-slate-800 bg-[#070B14] px-2 py-2 text-right font-mono text-sm text-slate-300">${money(opcion.price)}</div>
        </div>

        <div>
          <span class="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Subtotal</span>
          <div data-nueva-linea-subtotal class="mt-1 rounded-lg border border-slate-800 bg-[#070B14] px-2 py-2 text-right font-mono text-sm font-bold text-slate-200">${money(opcion.price * cantidad)}</div>
        </div>
      </div>
    </div>`;
};

export function initNuevaCotizacion(
  catalogo: CatalogoCategoria[],
  onCreada: (data: NuevaCotizacionCreada) => Promise<void> | void,
): () => void {
  const modal = getRequiredElement<HTMLDialogElement>("nueva-modal");
  const openBtn = getRequiredElement<HTMLButtonElement>("nueva-open");
  const form = document.getElementById("nueva-form") as HTMLFormElement | null;
  const closeBtn = document.getElementById("nueva-close") as HTMLButtonElement | null;
  const cancelBtn = document.getElementById("nueva-cancel") as HTMLButtonElement | null;
  const createBtn = document.getElementById("nueva-create") as HTMLButtonElement | null;
  const errorEl = document.getElementById("nueva-error") as HTMLElement | null;
  const nombre = document.getElementById("nueva-nombre") as HTMLInputElement | null;
  const empresa = document.getElementById("nueva-empresa") as HTMLInputElement | null;
  const ruc = document.getElementById("nueva-ruc") as HTMLInputElement | null;
  const correo = document.getElementById("nueva-correo") as HTMLInputElement | null;
  const telefono = document.getElementById("nueva-telefono") as HTMLInputElement | null;
  const ciudad = document.getElementById("nueva-ciudad") as HTMLInputElement | null;
  const catalogCategory = document.getElementById(
    "nueva-catalog-category",
  ) as HTMLSelectElement | null;
  const catalogProduct = document.getElementById("nueva-catalog-product") as HTMLSelectElement | null;
  const catalogQty = document.getElementById("nueva-catalog-qty") as HTMLInputElement | null;
  const catalogPrice = document.getElementById("nueva-catalog-price") as HTMLElement | null;
  const catalogAdd = document.getElementById("nueva-catalog-add") as HTMLButtonElement | null;
  const itemsEl = document.getElementById("nueva-items") as HTMLElement | null;
  const itemsEmpty = document.getElementById("nueva-items-empty") as HTMLElement | null;
  const subtotalEl = document.getElementById("nueva-subtotal") as HTMLElement | null;
  const igvEl = document.getElementById("nueva-igv") as HTMLElement | null;
  const totalEl = document.getElementById("nueva-total") as HTMLElement | null;
  const totalWrap = document.getElementById("nueva-total-wrap") as HTMLElement | null;

  let trigger: HTMLElement | null = null;

  const categoriaActual = (): CatalogoCategoria | null =>
    catalogo.find((categoria) => categoria.id === catalogCategory?.value) ?? null;

  const opcionActual = (): CatalogoOpcion | null =>
    categoriaActual()?.options.find((opcion) => opcion.code === catalogProduct?.value) ?? null;

  const filas = (): HTMLElement[] =>
    Array.from(itemsEl?.querySelectorAll<HTMLElement>("[data-nueva-item]") ?? []);

  const cantidadFila = (fila: HTMLElement): number => {
    const input = fila.querySelector<HTMLInputElement>("[data-nueva-cantidad]");
    return Math.max(1, Math.floor(Number(input?.value) || 1));
  };

  const precioFila = (fila: HTMLElement): number => Number(fila.dataset.precio) || 0;

  const mostrarError = (mensaje: string): void => {
    if (!errorEl) return;
    errorEl.textContent = mensaje;
    errorEl.classList.remove("hidden");
  };

  const limpiarError = (): void => {
    if (!errorEl) return;
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  };

  const actualizarTotales = (): void => {
    const actuales = filas();
    let subtotalCentavos = 0;

    actuales.forEach((fila) => {
      const precioCentavos = Math.round(precioFila(fila) * 100);
      const cantidad = cantidadFila(fila);
      const lineaCentavos = precioCentavos * cantidad;
      subtotalCentavos += lineaCentavos;

      const etiqueta = fila.querySelector<HTMLElement>("[data-nueva-linea-subtotal]");
      if (etiqueta) etiqueta.textContent = money(lineaCentavos / 100);
    });

    const igvCentavos = Math.round(subtotalCentavos * 0.18);
    const totalCentavos = subtotalCentavos + igvCentavos;

    if (subtotalEl) subtotalEl.textContent = money(subtotalCentavos / 100);
    if (igvEl) igvEl.textContent = money(igvCentavos / 100);
    if (totalEl) totalEl.textContent = money(totalCentavos / 100);
    totalWrap?.classList.toggle("hidden", actuales.length === 0);
    itemsEmpty?.classList.toggle("hidden", actuales.length > 0);
    if (createBtn) createBtn.disabled = actuales.length === 0;
  };

  const actualizarPrecio = (): void => {
    const opcion = opcionActual();
    if (catalogPrice) catalogPrice.textContent = money(opcion?.price ?? 0);
  };

  const renderProductos = (): void => {
    if (catalogProduct) {
      catalogProduct.innerHTML = opcionesProducto(categoriaActual());
    }
    actualizarPrecio();
  };

  const renderCatalogo = (): void => {
    if (catalogCategory) catalogCategory.innerHTML = opcionesCategoria(catalogo);
    renderProductos();
  };

  const abrirModal = (): void => {
    trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    form?.reset();
    limpiarError();
    if (itemsEl) itemsEl.innerHTML = "";
    if (catalogQty) catalogQty.value = "1";
    renderCatalogo();
    actualizarTotales();
    modal.showModal();
    window.setTimeout(() => nombre?.focus(), 50);
  };

  const agregarProducto = (): void => {
    limpiarError();

    const categoria = categoriaActual();
    const opcion = opcionActual();
    if (!categoria || !opcion) {
      mostrarError("Selecciona un producto del catálogo.");
      return;
    }

    const cantidad = Math.max(1, Math.floor(Number(catalogQty?.value) || 1));
    itemsEl?.insertAdjacentHTML("beforeend", filaProducto(opcion, categoria, cantidad));
    if (catalogQty) catalogQty.value = "1";
    actualizarTotales();

    const actuales = filas();
    actuales[actuales.length - 1]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const crear = async (): Promise<void> => {
    limpiarError();

    const actuales = filas();
    if (actuales.length === 0) {
      mostrarError("Agrega al menos un producto del catálogo.");
      return;
    }

    const items = actuales.map((fila) => ({
      producto_id: fila.dataset.productoId || undefined,
      nombre: (fila.dataset.nombre ?? "").trim(),
      detalle: (fila.dataset.detalle ?? "").trim() || undefined,
      cantidad: cantidadFila(fila),
      unidad: fila.dataset.unidad || "unidad",
      precio_unitario: precioFila(fila),
    }));

    const cliente = {
      nombre: nombre?.value.trim() || "Cliente manual",
      empresa: empresa?.value.trim() || undefined,
      ruc_dni: ruc?.value.replace(/\D/g, "") || undefined,
      correo: correo?.value.trim() || undefined,
      telefono: telefono?.value.trim() || undefined,
      ciudad: ciudad?.value.trim() || undefined,
    };

    if (createBtn) {
      createBtn.disabled = true;
      createBtn.textContent = "Creando…";
    }

    try {
      const data = await importarCotizacion({
        cliente,
        items,
        origen: "manual",
      });

      modal.close();
      await onCreada(data);
    } catch (error) {
      console.error("[Admin] Error al crear la cotización:", error);
      mostrarError(mensajeError(error, "No se pudo crear la cotización"));
    } finally {
      if (createBtn) createBtn.textContent = "Crear Cotización Pendiente";
      actualizarTotales();
    }
  };

  openBtn.addEventListener("click", abrirModal);
  closeBtn?.addEventListener("click", () => modal.close());
  cancelBtn?.addEventListener("click", () => modal.close());
  createBtn?.addEventListener("click", () => void crear());
  form?.addEventListener("submit", (event) => event.preventDefault());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });
  modal.addEventListener("close", () => {
    trigger?.focus();
    trigger = null;
  });

  catalogCategory?.addEventListener("change", renderProductos);
  catalogProduct?.addEventListener("change", actualizarPrecio);
  catalogAdd?.addEventListener("click", agregarProducto);

  itemsEl?.addEventListener("click", (event) => {
    const boton = (event.target as Element).closest<HTMLElement>("[data-nueva-remove]");
    if (!boton) return;
    boton.closest<HTMLElement>("[data-nueva-item]")?.remove();
    actualizarTotales();
  });

  itemsEl?.addEventListener("input", (event) => {
    if ((event.target as Element).closest("[data-nueva-cantidad]")) {
      actualizarTotales();
    }
  });

  return abrirModal;
}
