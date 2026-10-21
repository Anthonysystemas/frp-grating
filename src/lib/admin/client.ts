import { CATALOG, categorias } from "../../data/catalog";
import { money } from "./format";
import { lineasDeVersion } from "./quote";
import { aprobarCotizacion, fetchCotizaciones, mensajeError } from "./api";
import { filaModal, opcionesCategoria, opcionesProducto, tarjeta } from "./render";
import type {
  CatalogoCategoria,
  CatalogoOpcion,
  Cotizacion,
  Linea,
  VersionCotizacion,
} from "./types";

export function initAdmin(): void {
  const catalogo: CatalogoCategoria[] = categorias.map((categoria) => ({
    id: categoria.id,
    label: categoria.titulo,
    unit: categoria.id === "frp" ? "panel" : "unidad",
    options: CATALOG.filter((producto) => producto.categoria === categoria.id).map((producto) => ({
      code: producto.id,
      name: producto.nombre,
      label: producto.detalle,
      price: producto.precioUnitario,
      unidad: categoria.id === "frp" ? "panel" : "unidad",
    })),
  }));

  const list = document.getElementById("list") as HTMLElement;
  const loading = document.getElementById("loading") as HTMLElement;
  const errorState = document.getElementById("error-state") as HTMLElement;
  const errorMessage = document.getElementById("error-message") as HTMLElement;
  const emptyState = document.getElementById("empty-state") as HTMLElement;
  const emptyDetail = document.getElementById("empty-detail") as HTMLElement;
  const refreshBtn = document.getElementById("refresh") as HTMLButtonElement;
  const retryBtn = document.getElementById("retry") as HTMLButtonElement;
  const searchInput = document.getElementById("search") as HTMLInputElement;
  const filters = document.getElementById("filters") as HTMLElement;
  const statTotal = document.getElementById("stat-total") as HTMLElement;
  const statPendientes = document.getElementById("stat-pendientes") as HTMLElement;
  const statAprobadas = document.getElementById("stat-aprobadas") as HTMLElement;
  const stats = [statTotal, statPendientes, statAprobadas];

  const modal = document.getElementById("approve-modal") as HTMLDialogElement;
  const modalTitle = document.getElementById("approve-title") as HTMLElement;
  const modalClient = document.getElementById("modal-client") as HTMLElement;
  const modalItems = document.getElementById("modal-items") as HTMLElement;
  const modalItemsEmpty = document.getElementById("modal-items-empty") as HTMLElement;
  const toggleCatalogBtn = document.getElementById("toggle-catalog") as HTMLButtonElement;
  const catalogPanel = document.getElementById("catalog-panel") as HTMLElement;
  const catalogCategory = document.getElementById("catalog-category") as HTMLSelectElement;
  const catalogProduct = document.getElementById("catalog-product") as HTMLSelectElement;
  const catalogQty = document.getElementById("catalog-qty") as HTMLInputElement;
  const catalogPrice = document.getElementById("catalog-price") as HTMLInputElement;
  const catalogAddBtn = document.getElementById("catalog-add") as HTMLButtonElement;
  const modalFlete = document.getElementById("modal-flete") as HTMLInputElement;
  const modalSubtotal = document.getElementById("modal-subtotal") as HTMLElement;
  const modalIgv = document.getElementById("modal-igv") as HTMLElement;
  const modalFleteLabel = document.getElementById("modal-flete-label") as HTMLElement;
  const modalTotal = document.getElementById("modal-total") as HTMLElement;
  const modalError = document.getElementById("modal-error") as HTMLElement;
  const modalSubmit = document.getElementById("modal-submit") as HTMLButtonElement;
  const modalForm = document.getElementById("approve-form") as HTMLFormElement;
  const modalFormView = document.getElementById("modal-form-view") as HTMLElement;
  const modalSuccess = document.getElementById("modal-success") as HTMLElement;
  const modalSuccessDetail = document.getElementById("modal-success-detail") as HTMLElement;
  const downloadPdf = document.getElementById("download-pdf") as HTMLAnchorElement;
  const adminName = document.getElementById("modal-admin-name") as HTMLInputElement;
  const adminEmail = document.getElementById("modal-admin-email") as HTMLInputElement;
  const modalClose = document.getElementById("modal-close") as HTMLButtonElement;
  const modalCancel = document.getElementById("modal-cancel") as HTMLButtonElement;
  const successClose = document.getElementById("success-close") as HTMLButtonElement;
  const toast = document.getElementById("toast") as HTMLElement;

  let cotizaciones: Cotizacion[] = [];
  let filtro: "todas" | "pendiente_revision" | "aprobada" = "todas";
  let busqueda = "";
  let cotizacionModal: Cotizacion | null = null;
  let pdfObjectUrl: string | null = null;
  let toastTimer: number | undefined;
  let contadorItemsNuevos = 0;

  // ---------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------
  const mostrarToast = (mensaje: string, tipo: "ok" | "error"): void => {
    toast.textContent = mensaje;
    toast.className = `pointer-events-none fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border px-4 py-3 text-sm font-semibold shadow-2xl ${
      tipo === "ok"
        ? "border-emerald-500/40 bg-emerald-950/95 text-emerald-200"
        : "border-red-500/40 bg-red-950/95 text-red-200"
    }`;
    toast.classList.remove("hidden");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.add("hidden"), 3200);
  };

  // ---------------------------------------------------------------------
  // Render del listado
  // ---------------------------------------------------------------------
  const render = (): void => {
    const total = cotizaciones.length;
    const pendientes = cotizaciones.filter((cotizacion) => cotizacion.estado === "pendiente_revision").length;
    const aprobadas = cotizaciones.filter((cotizacion) => cotizacion.estado === "aprobada").length;

    stats.forEach((element) => element.classList.remove("animate-pulse"));
    statTotal.textContent = String(total);
    statPendientes.textContent = String(pendientes);
    statAprobadas.textContent = String(aprobadas);

    const termino = busqueda.trim().toLowerCase();
    const visibles = cotizaciones.filter((cotizacion) => {
      if (filtro !== "todas" && cotizacion.estado !== filtro) return false;
      if (!termino) return true;
      return [
        cotizacion.codigo,
        cotizacion.cliente_nombre,
        cotizacion.cliente_ruc_dni,
        cotizacion.cliente_correo,
        cotizacion.cliente_celular,
      ]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(termino));
    });

    list.innerHTML = visibles.map(tarjeta).join("");
    list.classList.toggle("hidden", visibles.length === 0);
    emptyState.classList.toggle("hidden", visibles.length > 0);
    if (visibles.length === 0) {
      emptyDetail.textContent =
        total === 0
          ? "Cuando se genere una cotización desde la web aparecerá aquí."
          : "No hay cotizaciones que coincidan con el filtro o la búsqueda.";
    }
  };

  // ---------------------------------------------------------------------
  // Carga de datos
  // ---------------------------------------------------------------------
  const setCargando = (cargando: boolean): void => {
    refreshBtn.disabled = cargando;
    loading.classList.toggle("hidden", !cargando);
    if (cargando) {
      list.classList.add("hidden");
      emptyState.classList.add("hidden");
      errorState.classList.add("hidden");
    }
  };

  const cargar = async (): Promise<void> => {
    setCargando(true);
    try {
      cotizaciones = await fetchCotizaciones();
      errorState.classList.add("hidden");
      render();
    } catch (error) {
      console.error("[Admin] Error al cargar cotizaciones:", error);
      const mensaje = mensajeError(error, "No se pudieron cargar las cotizaciones");
      errorMessage.textContent = mensaje;
      errorState.classList.remove("hidden");
      list.classList.add("hidden");
      emptyState.classList.add("hidden");
    } finally {
      setCargando(false);
    }
  };

  // ---------------------------------------------------------------------
  // Modal: abrir y calcular
  // ---------------------------------------------------------------------
  const limpiarPdfUrl = (): void => {
    if (pdfObjectUrl) {
      URL.revokeObjectURL(pdfObjectUrl);
      pdfObjectUrl = null;
    }
    downloadPdf.removeAttribute("href");
  };

  const actualizarEstadoModal = (): void => {
    const hayItems = modalItems.querySelectorAll("[data-modal-item]").length > 0;
    modalItemsEmpty.classList.toggle("hidden", hayItems);
    modalSubmit.disabled = !hayItems;
  };

  const categoriaCatalogoActual = (): CatalogoCategoria | null =>
    catalogo.find((categoria) => categoria.id === catalogCategory.value) ?? null;

  const opcionCatalogoActual = (): CatalogoOpcion | null => {
    const categoria = categoriaCatalogoActual();
    return categoria?.options.find((opcion) => opcion.code === catalogProduct.value) ?? null;
  };

  const actualizarPrecioCatalogo = (): void => {
    const opcion = opcionCatalogoActual();
    if (opcion) catalogPrice.value = opcion.price.toFixed(2);
  };

  const renderProductosCatalogo = (): void => {
    const categoria = categoriaCatalogoActual();
    catalogProduct.innerHTML = opcionesProducto(categoria);
    actualizarPrecioCatalogo();
  };

  const renderCatalogo = (): void => {
    catalogCategory.innerHTML = opcionesCategoria(catalogo);
    renderProductosCatalogo();
  };

  const toggleCatalogo = (): void => {
    const abrir = catalogPanel.classList.contains("hidden");
    catalogPanel.classList.toggle("hidden", !abrir);
    toggleCatalogBtn.setAttribute("aria-expanded", String(abrir));
    if (abrir) {
      if (!catalogCategory.options.length) renderCatalogo();
      catalogCategory.focus();
    }
  };

  const agregarDesdeCatalogo = (): void => {
    modalError.classList.add("hidden");
    modalError.textContent = "";

    const categoria = categoriaCatalogoActual();
    const opcion = opcionCatalogoActual();
    if (!categoria || !opcion) {
      modalError.textContent = "Selecciona un producto del catálogo.";
      modalError.classList.remove("hidden");
      return;
    }

    const cantidad = Number(catalogQty.value);
    const precio = Number(catalogPrice.value);

    if (!Number.isInteger(cantidad) || cantidad < 1) {
      modalError.textContent = "La cantidad debe ser un número entero mayor a 0.";
      modalError.classList.remove("hidden");
      return;
    }
    if (!Number.isFinite(precio) || precio < 0) {
      modalError.textContent = "El precio unitario debe ser un número mayor o igual a 0.";
      modalError.classList.remove("hidden");
      return;
    }

    const idsActuales = new Set(
      Array.from(modalItems.querySelectorAll<HTMLElement>("[data-modal-item]")).map(
        (fila) => fila.dataset.id ?? "",
      ),
    );

    let id = opcion.code;
    if (idsActuales.has(id)) {
      contadorItemsNuevos += 1;
      id = `${opcion.code}-${Date.now()}-${contadorItemsNuevos}`;
    }

    const linea: Linea = {
      id,
      nombre: opcion.name,
      detalle: opcion.label,
      cantidad,
      precio_unitario: Math.round(precio * 100) / 100,
      unidad: opcion.unidad || categoria.unit || "unidad",
    };

    modalItems.insertAdjacentHTML("beforeend", filaModal(linea));
    actualizarEstadoModal();
    recalcular();

    catalogQty.value = "1";
    actualizarPrecioCatalogo();

    const filas = modalItems.querySelectorAll<HTMLElement>("[data-modal-item]");
    filas[filas.length - 1]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const resetModal = (): void => {
    modalForm.reset();
    modalError.classList.add("hidden");
    modalError.textContent = "";
    modalFormView.classList.remove("hidden");
    modalSuccess.classList.add("hidden");
    modalSubmit.textContent = "Aprobar cotización";
    modalItems.innerHTML = "";
    modalFlete.value = "0";
    catalogPanel.classList.add("hidden");
    toggleCatalogBtn.setAttribute("aria-expanded", "false");
    catalogQty.value = "1";
    renderProductosCatalogo();
    downloadPdf.classList.remove("hidden");
    limpiarPdfUrl();
    actualizarEstadoModal();
  };

  const abrirModal = (id: string): void => {
    const cotizacion = cotizaciones.find((item) => item.id === id);
    if (!cotizacion) return;

    const version = cotizacion.version_actual;
    if (!version) {
      mostrarToast("Esta cotización no tiene versiones para aprobar.", "error");
      return;
    }

    const lineas = lineasDeVersion(version);

    cotizacionModal = cotizacion;
    resetModal();

    modalTitle.textContent = cotizacion.codigo;
    modalClient.textContent = [cotizacion.cliente_nombre, cotizacion.cliente_ruc_dni]
      .filter(Boolean)
      .join(" · ");
    modalFlete.value = String(Number(version.flete ?? 0));

    modalItems.innerHTML = lineas.map(filaModal).join("");
    actualizarEstadoModal();
    recalcular();
    if (!modal.open) modal.showModal();
  };

  const recalcular = (): void => {
    let subtotalCentavos = 0;

    modalItems.querySelectorAll<HTMLElement>("[data-modal-item]").forEach((fila) => {
      const inputPrecio = fila.querySelector<HTMLInputElement>("[data-price]");
      const inputCantidad = fila.querySelector<HTMLInputElement>("[data-qty]");
      const cantidad = Math.max(0, Math.floor(Number(inputCantidad?.value) || 0));
      const precio = Math.max(0, Number(inputPrecio?.value) || 0);
      const precioCentavos = Math.round(precio * 100);
      const subtotalItemCentavos = precioCentavos * cantidad;
      subtotalCentavos += subtotalItemCentavos;

      const etiqueta = fila.querySelector<HTMLElement>("[data-line-subtotal]");
      if (etiqueta) etiqueta.textContent = money(subtotalItemCentavos / 100);
    });

    const igvCentavos = Math.round(subtotalCentavos * 0.18);
    const fleteCentavos = Math.round(Math.max(0, Number(modalFlete.value) || 0) * 100);
    const totalCentavos = subtotalCentavos + igvCentavos + fleteCentavos;

    modalSubtotal.textContent = money(subtotalCentavos / 100);
    modalIgv.textContent = money(igvCentavos / 100);
    modalFleteLabel.textContent = money(fleteCentavos / 100);
    modalTotal.textContent = money(totalCentavos / 100);
  };

  // ---------------------------------------------------------------------
  // Envío de aprobación
  // ---------------------------------------------------------------------
  const actualizarCotizacionAprobada = (cotizacion: Cotizacion, version: VersionCotizacion): void => {
    cotizacion.estado = "aprobada";
    cotizacion.versiones = [
      version,
      ...(cotizacion.versiones ?? []).filter((item) => item.id !== version.id).map((item) => ({
        ...item,
        es_oficial: false,
      })),
    ];
    cotizacion.version_actual = version;

    // Si el filtro activo era "Pendientes", volvemos a "Todas" para que la
    // tarjeta siga visible mostrando de inmediato su nuevo estado.
    filtro = "todas";
    filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item.dataset.filter === "todas"));
    });
    render();
  };

  modalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cotizacionActual = cotizacionModal;
    if (!cotizacionActual) return;

    modalError.classList.add("hidden");
    modalError.textContent = "";

    const filas = Array.from(modalItems.querySelectorAll<HTMLElement>("[data-modal-item]"));
    const items = filas.map((fila) => {
      const inputCantidad = fila.querySelector<HTMLInputElement>("[data-qty]");
      const inputPrecio = fila.querySelector<HTMLInputElement>("[data-price]");

      const cantidad = Number(inputCantidad?.value);
      const precio = Number(inputPrecio?.value);

      return {
        id: fila.dataset.id ?? "",
        nombre: (fila.dataset.nombre ?? "").trim(),
        detalle: (fila.dataset.detalle ?? "").trim(),
        cantidad: Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 0,
        precio_unitario: Number.isFinite(precio) && precio >= 0 ? Math.round(precio * 100) / 100 : -1,
        unidad: fila.dataset.unidad || "",
      };
    });

    if (items.length === 0) {
      modalError.textContent = "Agrega al menos un ítem para aprobar la cotización.";
      modalError.classList.remove("hidden");
      return;
    }

    const indiceInvalido = items.findIndex(
      (item) => !item.nombre || item.cantidad < 1 || item.precio_unitario < 0,
    );
    if (indiceInvalido !== -1) {
      modalError.textContent = `Revisa el ítem ${indiceInvalido + 1}: nombre obligatorio, cantidad mayor a 0 y precio válido.`;
      modalError.classList.remove("hidden");
      return;
    }

    const flete = Number(modalFlete.value);
    if (!Number.isFinite(flete) || flete < 0) {
      modalError.textContent = "El flete debe ser un número mayor o igual a 0.";
      modalError.classList.remove("hidden");
      return;
    }

    const administrador: Record<string, string> = {};
    if (adminName.value.trim()) administrador.nombre = adminName.value.trim();
    if (adminEmail.value.trim()) administrador.correo = adminEmail.value.trim();

    modalSubmit.disabled = true;
    modalSubmit.textContent = "Aprobando…";

    try {
      const data = await aprobarCotizacion({
        cotizacion_id: cotizacionActual.id,
        items,
        flete: Math.round(flete * 100) / 100,
        ...(Object.keys(administrador).length ? { administrador } : {}),
      });

      const version = data.version_oficial;
      if (!version) {
        throw new Error("La aprobación no devolvió la versión oficial");
      }

      actualizarCotizacionAprobada(cotizacionActual, version);

      const pdfBase64 = data.pdfBase64 ?? "";
      if (pdfBase64) {
        const binario = window.atob(pdfBase64);
        const bytes = new Uint8Array(binario.length);
        for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        pdfObjectUrl = URL.createObjectURL(blob);
        downloadPdf.href = pdfObjectUrl;
        downloadPdf.download = `${cotizacionActual.codigo}.pdf`;
        downloadPdf.classList.remove("hidden");
      } else {
        downloadPdf.classList.add("hidden");
      }

      modalSuccessDetail.textContent = `${cotizacionActual.codigo} · Versión ${version.version_numero} · ${money(version.total)}`;
      modalFormView.classList.add("hidden");
      modalSuccess.classList.remove("hidden");
      modalSuccess.scrollIntoView({ behavior: "smooth", block: "start" });
      mostrarToast("Cotización aprobada correctamente.", "ok");
    } catch (error) {
      console.error("[Admin] Error al aprobar cotización:", error);
      const mensaje = mensajeError(error, "No se pudo aprobar la cotización");
      modalError.textContent = mensaje;
      modalError.classList.remove("hidden");
      modalSubmit.textContent = "Aprobar cotización";
      actualizarEstadoModal();
    }
  });

  // ---------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------
  refreshBtn.addEventListener("click", () => void cargar());
  retryBtn.addEventListener("click", () => void cargar());

  searchInput.addEventListener("input", () => {
    busqueda = searchInput.value;
    render();
  });

  filters.addEventListener("click", (event) => {
    const boton = (event.target as Element).closest<HTMLButtonElement>("[data-filter]");
    if (!boton) return;
    const valor = boton.dataset.filter;
    if (valor !== "todas" && valor !== "pendiente_revision" && valor !== "aprobada") return;
    filtro = valor;
    filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === boton));
    });
    render();
  });

  list.addEventListener("click", (event) => {
    const boton = (event.target as Element).closest<HTMLButtonElement>("[data-approve]");
    if (!boton) return;
    const id = boton.dataset.approve;
    if (id) abrirModal(id);
  });

  modalItems.addEventListener("input", recalcular);
  modalFlete.addEventListener("input", recalcular);
  toggleCatalogBtn.addEventListener("click", toggleCatalogo);
  catalogCategory.addEventListener("change", renderProductosCatalogo);
  catalogProduct.addEventListener("change", actualizarPrecioCatalogo);
  catalogAddBtn.addEventListener("click", agregarDesdeCatalogo);
  catalogPanel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    agregarDesdeCatalogo();
  });

  modalItems.addEventListener("click", (event) => {
    const boton = (event.target as Element).closest<HTMLButtonElement>("[data-remove-item]");
    if (!boton) return;
    boton.closest("[data-modal-item]")?.remove();
    actualizarEstadoModal();
    recalcular();
  });

  modalClose.addEventListener("click", () => modal.close());
  modalCancel.addEventListener("click", () => modal.close());
  successClose.addEventListener("click", () => modal.close());

  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });

  modal.addEventListener("close", () => {
    cotizacionModal = null;
    resetModal();
  });

  // Inicializa los selectores del catálogo oficial.
  renderCatalogo();

  // Al cargar la página se consulta el endpoint administrativo.
  void cargar();

}
