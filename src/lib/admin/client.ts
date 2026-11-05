import { CATALOG, categorias } from "../../data/catalog";
import { escapeHtml, fechaCorta, fechaLegible, money } from "./format";
import { lineasDeVersion, normalizarRuc, totalesDeVersion } from "./quote";
import {
  actualizarCorreoCliente,
  aprobarCotizacion,
  cambiarEstadoCotizacion,
  cerrarSesionAdmin,
  enviarCotizacionCliente,
  fetchCotizaciones,
  importarCotizacion,
  mensajeError,
} from "./api";
import {
  parseWhatsAppMessage,
  type ConfianzaItem,
  type ParsedItem,
} from "../importar/parse";
import {
  badgeEstado,
  filaModal,
  opcionesCategoria,
  opcionesProducto,
  tarjeta,
  tarjetaNuevaCotizacion,
} from "./render";
import { obtenerEstado } from "./states";
import { initNuevaCotizacion } from "./nueva-cotizacion";
import { validarCorreo } from "../utils/validation";
import type {
  CatalogoCategoria,
  CatalogoOpcion,
  Cotizacion,
  Linea,
  VersionCotizacion,
} from "./types";

const getRequiredElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    const message = `[Admin] No se encontró el elemento requerido #${id}`;
    console.warn(message);
    throw new Error(message);
  }
  return element as T;
};

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

  const list = getRequiredElement<HTMLElement>("list");
  const loading = getRequiredElement<HTMLElement>("loading");
  const errorState = getRequiredElement<HTMLElement>("error-state");
  const errorMessage = getRequiredElement<HTMLElement>("error-message");
  const emptyState = getRequiredElement<HTMLElement>("empty-state");
  const emptyDetail = getRequiredElement<HTMLElement>("empty-detail");
  const refreshBtn = getRequiredElement<HTMLButtonElement>("refresh");
  const logoutBtn = getRequiredElement<HTMLButtonElement>("logout");
  const retryBtn = getRequiredElement<HTMLButtonElement>("retry");
  const searchInput = getRequiredElement<HTMLInputElement>("search");
  const filters = getRequiredElement<HTMLElement>("filters");

  const modal = getRequiredElement<HTMLDialogElement>("approve-modal");
  const modalTitle = getRequiredElement<HTMLElement>("approve-title");
  const modalClient = getRequiredElement<HTMLElement>("modal-client");
  const modalStatus = getRequiredElement<HTMLElement>("modal-status");
  const modalDate = getRequiredElement<HTMLElement>("modal-date");
  const modalTotalSummary = getRequiredElement<HTMLElement>("modal-total-summary");
  const modalItemsHint = getRequiredElement<HTMLElement>("modal-items-hint");
  const modalFleteWrapper = getRequiredElement<HTMLElement>("modal-flete-wrapper");
  const modalAdminBlock = getRequiredElement<HTMLElement>("modal-admin-block");
  const modalClienteCorreo = getRequiredElement<HTMLInputElement>("modal-cliente-correo");
  const modalGuardarCorreo = getRequiredElement<HTMLButtonElement>("modal-guardar-correo");
  const modalCorreoError = getRequiredElement<HTMLElement>("modal-correo-error");
  const modalEnvioStatus = getRequiredElement<HTMLElement>("modal-envio-status");
  const modalEnvioBlock = getRequiredElement<HTMLDetailsElement>("modal-envio-block");
  const modalEnviarCliente = getRequiredElement<HTMLButtonElement>("modal-enviar-cliente");
  const modalEnviarSpinner = getRequiredElement<HTMLElement>("modal-enviar-spinner");
  const modalEnviarLabel = getRequiredElement<HTMLElement>("modal-enviar-label");
  const modalItems = getRequiredElement<HTMLElement>("modal-items");
  const modalItemsEmpty = getRequiredElement<HTMLElement>("modal-items-empty");
  const toggleCatalogBtn = getRequiredElement<HTMLButtonElement>("toggle-catalog");
  const catalogPanel = getRequiredElement<HTMLElement>("catalog-panel");
  const catalogCategory = getRequiredElement<HTMLSelectElement>("catalog-category");
  const catalogProduct = getRequiredElement<HTMLSelectElement>("catalog-product");
  const catalogQty = getRequiredElement<HTMLInputElement>("catalog-qty");
  const catalogPrice = getRequiredElement<HTMLInputElement>("catalog-price");
  const catalogAddBtn = getRequiredElement<HTMLButtonElement>("catalog-add");
  const modalFlete = getRequiredElement<HTMLInputElement>("modal-flete");
  const modalSubtotal = getRequiredElement<HTMLElement>("modal-subtotal");
  const modalIgv = getRequiredElement<HTMLElement>("modal-igv");
  const modalFleteLabel = getRequiredElement<HTMLElement>("modal-flete-label");
  const modalTotal = getRequiredElement<HTMLElement>("modal-total");
  const modalError = getRequiredElement<HTMLElement>("modal-error");
  const modalSubmit = getRequiredElement<HTMLButtonElement>("modal-submit");
  const modalSubmitOnly = getRequiredElement<HTMLButtonElement>("modal-submit-only");
  const modalForm = getRequiredElement<HTMLFormElement>("approve-form");
  const modalFormView = getRequiredElement<HTMLElement>("modal-form-view");
  const modalFormActions = getRequiredElement<HTMLElement>("modal-form-actions");
  const modalSuccess = getRequiredElement<HTMLElement>("modal-success");
  const modalSuccessDetail = getRequiredElement<HTMLElement>("modal-success-detail");
  const downloadPdf = getRequiredElement<HTMLAnchorElement>("download-pdf");
  const adminName = getRequiredElement<HTMLInputElement>("modal-admin-name");
  const adminEmail = getRequiredElement<HTMLInputElement>("modal-admin-email");
  const modalClose = getRequiredElement<HTMLButtonElement>("modal-close");
  const modalCancel = getRequiredElement<HTMLButtonElement>("modal-cancel");
  const successClose = getRequiredElement<HTMLButtonElement>("success-close");
  const toast = getRequiredElement<HTMLElement>("toast");

  const importOpenBtn = document.getElementById("import-open") as HTMLButtonElement | null;
  const importModal = document.getElementById("import-modal") as HTMLDialogElement | null;
  const importForm = document.getElementById("import-form") as HTMLFormElement | null;
  const importText = document.getElementById("import-text") as HTMLTextAreaElement | null;
  const importStepPaste = document.getElementById("import-step-paste") as HTMLElement | null;
  const importStepReview = document.getElementById("import-step-review") as HTMLElement | null;
  const importPasteError = document.getElementById("import-paste-error") as HTMLElement | null;
  const importAnalyzeBtn = document.getElementById("import-analyze") as HTMLButtonElement | null;
  const importBackBtn = document.getElementById("import-back") as HTMLButtonElement | null;
  const importCreateBtn = document.getElementById("import-create") as HTMLButtonElement | null;
  const importCreateManualBtn = document.getElementById("import-create-manual") as HTMLButtonElement | null;
  const importItems = document.getElementById("import-items") as HTMLElement | null;
  const importItemsEmpty = document.getElementById("import-items-empty") as HTMLElement | null;
  const importSubtotal = document.getElementById("import-subtotal") as HTMLElement | null;
  const importIgv = document.getElementById("import-igv") as HTMLElement | null;
  const importTotal = document.getElementById("import-total") as HTMLElement | null;
  const importTotalWrap = document.getElementById("import-total-wrap") as HTMLElement | null;
  const importLeftoverWrap = document.getElementById("import-leftover-wrap") as HTMLElement | null;
  const importLeftover = document.getElementById("import-leftover") as HTMLElement | null;
  const importError = document.getElementById("import-error") as HTMLElement | null;
  const importCloseBtn = document.getElementById("import-close") as HTMLButtonElement | null;
  const importCancelBtn = document.getElementById("import-cancel") as HTMLButtonElement | null;
  const importNombre = document.getElementById("import-nombre") as HTMLInputElement | null;
  const importEmpresa = document.getElementById("import-empresa") as HTMLInputElement | null;
  const importRuc = document.getElementById("import-ruc") as HTMLInputElement | null;
  const importCorreo = document.getElementById("import-correo") as HTMLInputElement | null;
  const importTelefono = document.getElementById("import-telefono") as HTMLInputElement | null;
  const importCiudad = document.getElementById("import-ciudad") as HTMLInputElement | null;

  let cotizaciones: Cotizacion[] = [];
  let filtro: "pendiente_revision" | "aprobada" | "historial" | "eliminada" = "pendiente_revision";
  let busqueda = "";
  let cotizacionModal: Cotizacion | null = null;
  let modoModal: "gestion" | "detalle" = "gestion";
  let pdfObjectUrl: string | null = null;
  let toastTimer: number | undefined;
  let contadorItemsNuevos = 0;
  let pasoImportacion: "pegar" | "revision" = "revision";
  let leftoverImportacion: string[] = [];
  let cargaId = 0;
  let modalTrigger: HTMLElement | null = null;
  let importTrigger: HTMLElement | null = null;

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
  // Importación desde WhatsApp
  // ---------------------------------------------------------------------
  const CONFIANZA_UI: Record<ConfianzaItem, { label: string; clase: string }> = {
    exacta: {
      label: "Exacta",
      clase: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    },
    aproximada: {
      label: "Aproximada",
      clase: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    },
    manual: {
      label: "Manual",
      clase: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    },
  };

  const filaImportacion = (item: ParsedItem): string => {
    const esCatalogo = Boolean(item.producto_id);
    const badge = CONFIANZA_UI[item.confianza];
    const nombreSeguro = escapeHtml(item.nombre);
    const detalleSeguro = escapeHtml(item.detalle ?? "");
    const unidadSeguro = escapeHtml(item.unidad);

    return `
      <div
        data-import-item
        data-producto-id="${escapeHtml(item.producto_id ?? "")}"
        data-unidad="${unidadSeguro}"
        data-nombre="${nombreSeguro}"
        data-detalle="${detalleSeguro}"
        data-catalogo="${esCatalogo}"
        data-precio="${item.precio_unitario}"
        class="rounded-xl border border-slate-800 bg-[#0B1120] p-3"
      >
        <div class="flex items-start justify-between gap-2">
          <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.clase}">${badge.label}</span>
          <button
            type="button"
            data-import-remove
            class="-mr-1 -mt-1 rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            aria-label="Quitar ítem"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" d="M18 6 6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_5rem_7rem] sm:items-end">
          <div class="min-w-0">
            ${
              esCatalogo
                ? `<p class="truncate text-sm font-bold text-white" title="${nombreSeguro}">${nombreSeguro}</p>
                   ${detalleSeguro ? `<p class="mt-0.5 text-xs text-slate-400">${detalleSeguro}</p>` : ""}`
                : `<label class="block">
                     <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Producto</span>
                     <input
                       data-import-nombre
                       type="text"
                       value="${nombreSeguro}"
                       class="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-2.5 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                     />
                   </label>`
            }
            <p class="mt-1 text-[10px] uppercase tracking-wide text-slate-500">${unidadSeguro}</p>
          </div>

          <label class="block">
            <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Cant.</span>
            <input
              data-import-cantidad
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              value="${item.cantidad}"
              class="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-2 py-2 text-center font-mono text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>

          <div>
            <span class="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">P. unit.</span>
            ${
              esCatalogo
                ? `<div class="mt-1 rounded-lg border border-slate-800 bg-[#070B14] px-2 py-2 text-right font-mono text-sm text-slate-300">US$ ${item.precio_unitario.toFixed(2)}</div>`
                : `<input
                     data-import-precio
                     type="number"
                     min="0"
                     step="0.01"
                     inputmode="decimal"
                     value="${item.precio_unitario.toFixed(2)}"
                     class="mt-1 w-full rounded-lg border border-slate-700 bg-[#070B14] px-2 py-2 text-right font-mono text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                   />`
            }
          </div>
        </div>
      </div>`;
  };

  const filasImportacion = (): HTMLElement[] =>
    Array.from(importItems?.querySelectorAll<HTMLElement>("[data-import-item]") ?? []);

  const cantidadFilaImportacion = (fila: HTMLElement): number => {
    const input = fila.querySelector<HTMLInputElement>("[data-import-cantidad]");
    return Math.max(1, Math.floor(Number(input?.value) || 1));
  };

  const precioFilaImportacion = (fila: HTMLElement): number =>
    Number(fila.dataset.precio) || 0;

  const actualizarTotalImportacion = (): void => {
    const filas = filasImportacion();
    const subtotalCentavos = filas.reduce((suma, fila) => {
      const precioCentavos = Math.round(precioFilaImportacion(fila) * 100);
      return suma + precioCentavos * cantidadFilaImportacion(fila);
    }, 0);
    const igvCentavos = Math.round(subtotalCentavos * 0.18);
    const totalCentavos = subtotalCentavos + igvCentavos;

    if (importSubtotal) importSubtotal.textContent = money(subtotalCentavos / 100);
    if (importIgv) importIgv.textContent = money(igvCentavos / 100);
    if (importTotal) importTotal.textContent = money(totalCentavos / 100);
    importTotalWrap?.classList.toggle("hidden", filas.length === 0);
    importItemsEmpty?.classList.toggle("hidden", filas.length > 0);
    if (importCreateBtn) importCreateBtn.disabled = filas.length === 0;
    importCreateManualBtn?.classList.toggle("hidden", filas.length > 0);
  };

  const limpiarErroresImportacion = (): void => {
    importPasteError?.classList.add("hidden");
    if (importPasteError) importPasteError.textContent = "";
    importError?.classList.add("hidden");
    if (importError) importError.textContent = "";
  };

  const mostrarErrorImportacion = (mensaje: string): void => {
    if (importError) {
      importError.textContent = mensaje;
      importError.classList.remove("hidden");
    }
  };

  const actualizarVistaImportacion = (): void => {
    const enRevision = pasoImportacion === "revision";

    if (importStepPaste) importStepPaste.hidden = enRevision;
    if (importStepReview) importStepReview.hidden = !enRevision;
    if (importAnalyzeBtn) importAnalyzeBtn.hidden = enRevision;
    if (importBackBtn) importBackBtn.hidden = !enRevision;
    if (importCreateBtn) importCreateBtn.hidden = !enRevision;

    const mostrarLeftover = leftoverImportacion.length > 0;
    importLeftoverWrap?.classList.toggle("hidden", !mostrarLeftover);
    if (importLeftover) {
      importLeftover.textContent = mostrarLeftover ? leftoverImportacion.join("\n") : "";
    }
  };

  const abrirImportacion = (): void => {
    if (!importModal) return;

    importTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    importForm?.reset();
    limpiarErroresImportacion();
    if (importText) importText.value = "";
    if (importItems) importItems.innerHTML = "";
    if (importLeftover) importLeftover.textContent = "";
    leftoverImportacion = [];

    actualizarTotalImportacion();
    pasoImportacion = "pegar";
    actualizarVistaImportacion();

    importModal.showModal();
    window.setTimeout(() => importText?.focus(), 50);
  };

  const analizarImportacion = (): void => {
    const texto = importText?.value.trim() ?? "";
    limpiarErroresImportacion();

    if (!texto) {
      if (importPasteError) {
        importPasteError.textContent = "Pega el mensaje de WhatsApp antes de analizar.";
        importPasteError.classList.remove("hidden");
      }
      importText?.focus();
      return;
    }

    const parsed = parseWhatsAppMessage(texto);

    if (importNombre) importNombre.value = parsed.cliente.nombre ?? "";
    if (importEmpresa) importEmpresa.value = parsed.cliente.empresa ?? "";
    if (importRuc) importRuc.value = parsed.cliente.ruc_dni ?? "";
    if (importCorreo) importCorreo.value = parsed.cliente.correo ?? "";
    if (importTelefono) importTelefono.value = parsed.cliente.telefono ?? "";
    if (importCiudad) importCiudad.value = parsed.cliente.ciudad ?? "";

    if (importItems) importItems.innerHTML = parsed.items.map(filaImportacion).join("");
    leftoverImportacion = parsed.textoNoReconocido;

    actualizarTotalImportacion();
    pasoImportacion = "revision";
    actualizarVistaImportacion();

    if (parsed.items.length === 0) {
      if (importItemsEmpty) {
        importItemsEmpty.querySelector("p")!.textContent =
          "No se encontraron productos en el texto. ¿Deseas crear la cotización desde cero?";
      }
    }
  };

  const crearImportacion = async (): Promise<void> => {
    const filas = filasImportacion();
    if (filas.length === 0) return;

    limpiarErroresImportacion();

    const items = filas.map((fila) => ({
      producto_id: fila.dataset.productoId || undefined,
      nombre: (fila.dataset.nombre ?? "").trim(),
      detalle: (fila.dataset.detalle ?? "").trim() || undefined,
      cantidad: cantidadFilaImportacion(fila),
      unidad: fila.dataset.unidad || "unidad",
      precio_unitario: precioFilaImportacion(fila),
    }));

    const indiceInvalido = items.findIndex((item) => !item.nombre || item.cantidad < 1);
    if (indiceInvalido !== -1) {
      mostrarErrorImportacion(
        `Revisa el ítem ${indiceInvalido + 1}: nombre obligatorio y cantidad mayor a 0.`,
      );
      return;
    }

    const cliente = {
      nombre: importNombre?.value.trim() || "Cliente manual",
      empresa: importEmpresa?.value.trim() || undefined,
      ruc_dni: importRuc?.value.replace(/\D/g, "") || undefined,
      correo: importCorreo?.value.trim() || undefined,
      telefono: importTelefono?.value.trim() || undefined,
      ciudad: importCiudad?.value.trim() || undefined,
    };

    if (importCreateBtn) {
      importCreateBtn.disabled = true;
      importCreateBtn.textContent = "Creando…";
    }

    try {
      const data = await importarCotizacion({
        cliente,
        items,
        origen: "whatsapp",
        texto_original: importText?.value.trim() ?? "",
      });

      importModal?.close();
      mostrarToast(`Cotización ${data.codigo ?? ""} creada como pendiente.`, "ok");

      filtro = "pendiente_revision";
      filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((boton) => {
        boton.setAttribute("aria-pressed", String(boton.dataset.filter === filtro));
      });

      await cargar();

      if (data.id && cotizaciones.some((cotizacion) => cotizacion.id === data.id)) {
        abrirModal(data.id, "gestion");
      }
    } catch (error) {
      console.error("[Admin] Error al crear la cotización:", error);
      mostrarErrorImportacion(mensajeError(error, "No se pudo crear la cotización"));
    } finally {
      if (importCreateBtn) importCreateBtn.textContent = "Crear Cotización Pendiente";
      actualizarTotalImportacion();
    }
  };

  // ---------------------------------------------------------------------
  // Render del listado
  // ---------------------------------------------------------------------
  const render = (): void => {
    const activas = cotizaciones.filter((cotizacion) => cotizacion.estado !== "eliminada");
    const pendientes = activas.filter((cotizacion) => cotizacion.estado === "pendiente_revision").length;
    const aprobadas = activas.filter((cotizacion) => cotizacion.estado === "aprobada").length;
    const pagadas = activas.filter((cotizacion) => cotizacion.estado === "pagada").length;
    const eliminadas = cotizaciones.filter((cotizacion) => cotizacion.estado === "eliminada").length;

    const conteos = {
      pendiente_revision: pendientes,
      aprobada: aprobadas,
      historial: pagadas,
      eliminada: eliminadas,
    };

    filters.querySelectorAll<HTMLElement>("[data-count]").forEach((elemento) => {
      const clave = elemento.dataset.count as keyof typeof conteos | undefined;
      if (clave && clave in conteos) {
        elemento.textContent = `(${conteos[clave]})`;
      }
    });

    const termino = busqueda.trim().toLowerCase();
    const terminoRuc = termino.replace(/\D/g, "");

    const visibles = cotizaciones.filter((cotizacion) => {
      if (filtro === "eliminada") {
        if (cotizacion.estado !== "eliminada") return false;
      } else {
        if (cotizacion.estado === "eliminada") return false;
        if (filtro === "historial") {
          if (cotizacion.estado !== "pagada") return false;
        } else if (cotizacion.estado !== filtro) {
          return false;
        }
      }

      if (!termino) return true;

      const coincideTexto = [
        cotizacion.codigo,
        cotizacion.cliente_nombre,
        cotizacion.nombre,
        cotizacion.cliente_empresa,
        cotizacion.empresa,
        cotizacion.cliente?.nombre,
        cotizacion.cliente?.empresa,
        cotizacion.cliente_correo,
        cotizacion.cliente_celular,
      ]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(termino));

      const coincideRuc =
        terminoRuc.length > 0 &&
        normalizarRuc(cotizacion.cliente_ruc_dni).includes(terminoRuc);

      return coincideTexto || coincideRuc;
    });

    const mostrarCrear =
      !termino && (filtro === "pendiente_revision" || filtro === "aprobada");

    list.innerHTML =
      (mostrarCrear ? tarjetaNuevaCotizacion() : "") + visibles.map(tarjeta).join("");
    list.classList.toggle("hidden", visibles.length === 0 && !mostrarCrear);
    emptyState.classList.toggle("hidden", visibles.length > 0 || mostrarCrear);
    if (visibles.length === 0) {
      const mensajes: Record<typeof filtro, string> = {
        pendiente_revision: "No hay cotizaciones pendientes.",
        aprobada: "No hay cotizaciones aprobadas.",
        historial: "No hay cotizaciones pagadas.",
        eliminada: "No hay cotizaciones en la papelera.",
      };
      emptyDetail.textContent = mensajes[filtro];
    }
  };

  const filtroParaEstado = (estado?: string): typeof filtro => {
    if (estado === "aprobada") return "aprobada";
    if (estado === "pagada") return "historial";
    if (estado === "eliminada") return "eliminada";
    return "pendiente_revision";
  };

  // ---------------------------------------------------------------------
  // Carga de datos
  // ---------------------------------------------------------------------
  const setCargando = (cargando: boolean): void => {
    refreshBtn.disabled = cargando;
    refreshBtn.classList.toggle("opacity-50", cargando);
    loading.classList.toggle("hidden", !cargando);
    if (cargando) {
      list.classList.add("hidden");
      emptyState.classList.add("hidden");
      errorState.classList.add("hidden");
    }
  };

  const cargar = async (): Promise<void> => {
    const idActual = ++cargaId;
    setCargando(true);
    try {
      const [activas, eliminadas] = await Promise.all([
        fetchCotizaciones(),
        fetchCotizaciones("eliminada"),
      ]);
      if (idActual !== cargaId) return;
      cotizaciones = [...activas, ...eliminadas];
      errorState.classList.add("hidden");
      render();
    } catch (error) {
      if (idActual !== cargaId) return;
      console.error("[Admin] Error al cargar cotizaciones:", error);
      const mensaje = mensajeError(error, "No se pudieron cargar las cotizaciones");
      errorMessage.textContent = mensaje;
      errorState.classList.remove("hidden");
      list.classList.add("hidden");
      emptyState.classList.add("hidden");
    } finally {
      if (idActual === cargaId) setCargando(false);
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
    const esSoloLectura = modoModal === "detalle";
    const editable = !esSoloLectura && cotizacionModal?.estado === "pendiente_revision";

    modalItemsEmpty.textContent = editable
      ? "No hay ítems en esta cotización. Agrega al menos uno para poder aprobarla."
      : "Esta cotización no tiene ítems registrados.";
    modalItemsEmpty.classList.toggle("hidden", hayItems);
    modalSubmit.disabled = editable ? !hayItems : false;
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
    if (modoModal === "detalle") return;

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
    modalFormActions.classList.remove("hidden");
    modalSuccess.classList.add("hidden");
    modalSubmit.classList.remove("hidden");
    modalSubmit.disabled = false;
    modalSubmit.textContent = "Aprobar y Enviar al Cliente";
    modalSubmitOnly.classList.add("hidden");
    modalSubmitOnly.disabled = false;
    modalSubmitOnly.textContent = "Aprobar sin enviar";
    modalStatus.innerHTML = "";
    modalDate.textContent = "";
    modalTotalSummary.textContent = "";
    modalItems.innerHTML = "";
    modalFlete.value = "0";
    modalClienteCorreo.value = "";
    modalCorreoError.classList.add("hidden");
    modalCorreoError.textContent = "";
    modalEnvioStatus.textContent = "";
    modalEnvioBlock.open = false;
    modalEnviarCliente.classList.add("hidden");
    modalEnviarCliente.classList.remove("inline-flex");
    modalEnviarCliente.disabled = false;
    modalEnviarSpinner.classList.add("hidden");
    modalEnviarLabel.textContent = "Enviar cotización final al cliente";
    modalGuardarCorreo.disabled = false;
    modalGuardarCorreo.textContent = "Guardar";
    modalClienteCorreo.disabled = false;
    modalClienteCorreo.readOnly = false;
    modalGuardarCorreo.style.display = "";
    catalogPanel.style.display = "";
    toggleCatalogBtn.style.display = "";
    modalFlete.disabled = false;
    catalogCategory.disabled = false;
    catalogProduct.disabled = false;
    catalogQty.disabled = false;
    catalogPrice.disabled = false;
    catalogAddBtn.disabled = false;
    adminName.disabled = false;
    adminEmail.disabled = false;
    modalCancel.textContent = "Cancelar";
    catalogPanel.classList.add("hidden");
    toggleCatalogBtn.setAttribute("aria-expanded", "false");
    catalogQty.value = "1";
    renderProductosCatalogo();
    downloadPdf.classList.remove("hidden");
    limpiarPdfUrl();
    actualizarEstadoModal();
  };

  const abrirModal = (
    id: string,
    modo: "gestion" | "detalle" = "gestion",
  ): void => {
    const cotizacion = cotizaciones.find((item) => item.id === id);
    if (!cotizacion) return;

    const version = cotizacion.version_actual;
    if (!version) {
      mostrarToast("Esta cotización no tiene versiones para aprobar.", "error");
      return;
    }

    const esSoloLectura = modo === "detalle";
    modoModal = modo;

    const lineas = lineasDeVersion(version);
    const editable = !esSoloLectura && cotizacion.estado === "pendiente_revision";
    const configEstado = obtenerEstado(cotizacion.estado);
    const totales = totalesDeVersion(version);
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

    cotizacionModal = cotizacion;
    resetModal();

    modalTitle.textContent = esSoloLectura ? "Detalle de cotización" : "Gestionar cotización";
    modalClient.textContent = [
      cotizacion.codigo,
      empresa ? `${nombre} — ${empresa}` : nombre,
      cotizacion.cliente_ruc_dni ? `RUC ${cotizacion.cliente_ruc_dni}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    modalStatus.innerHTML = badgeEstado(cotizacion.estado);
    modalDate.textContent = fechaCorta(cotizacion.created_at);
    modalTotalSummary.textContent = money(totales.total);
    modalItemsHint.textContent = editable ? "Edita precios o elimina" : "Solo lectura";
    modalFlete.value = String(Number(version.flete ?? 0));

    modalClienteCorreo.value = cotizacion.cliente_correo ?? "";
    modalClienteCorreo.disabled = esSoloLectura;
    modalClienteCorreo.readOnly = esSoloLectura;
    modalFlete.disabled = esSoloLectura;
    catalogCategory.disabled = esSoloLectura;
    catalogProduct.disabled = esSoloLectura;
    catalogQty.disabled = esSoloLectura;
    catalogPrice.disabled = esSoloLectura;
    catalogAddBtn.disabled = esSoloLectura;
    adminName.disabled = esSoloLectura;
    adminEmail.disabled = esSoloLectura;
    modalCorreoError.classList.add("hidden");
    modalCorreoError.textContent = "";
    modalEnvioStatus.textContent =
      cotizacion.ultimo_envio_at && cotizacion.ultimo_envio_correo
        ? `Enviado el ${fechaLegible(cotizacion.ultimo_envio_at)} a ${cotizacion.ultimo_envio_correo}`
        : "";
    modalEnvioBlock.open = editable;
    modalEnviarCliente.classList.toggle(
      "hidden",
      esSoloLectura ||
        (cotizacion.estado !== "aprobada" && cotizacion.estado !== "pagada"),
    );
    modalEnviarCliente.classList.toggle(
      "inline-flex",
      !esSoloLectura &&
        (cotizacion.estado === "aprobada" || cotizacion.estado === "pagada"),
    );

    modalGuardarCorreo.classList.toggle("hidden", editable || esSoloLectura);
    modalGuardarCorreo.style.display = esSoloLectura ? "none" : "";
    toggleCatalogBtn.classList.toggle("hidden", !editable);
    toggleCatalogBtn.style.display = esSoloLectura ? "none" : "";
    modalFleteWrapper.classList.toggle("hidden", !editable);
    modalAdminBlock.classList.toggle("hidden", !editable);
    catalogPanel.classList.add("hidden");
    catalogPanel.style.display = esSoloLectura ? "none" : "";
    modalCancel.textContent = esSoloLectura ? "Cerrar" : "Cancelar";

    modalItems.innerHTML = lineas.map((linea) => filaModal(linea, editable)).join("");
    actualizarEstadoModal();

    if (editable) {
      recalcular();
    } else {
      modalSubtotal.textContent = money(totales.subtotal);
      modalIgv.textContent = money(totales.igv);
      modalFleteLabel.textContent = money(totales.flete);
      modalTotal.textContent = money(totales.total);
    }

    modalSubmit.textContent = editable ? "Aprobar y Enviar al Cliente" : configEstado.accionPrincipal;
    modalSubmit.className = `rounded-lg px-5 py-2.5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-wait disabled:opacity-60 ${configEstado.btnBg}`;
    modalSubmit.classList.toggle(
      "hidden",
      esSoloLectura || cotizacion.estado === "pagada",
    );

    modalSubmitOnly.classList.toggle("hidden", !editable);
    modalSubmitOnly.disabled = false;
    modalSubmitOnly.textContent = "Aprobar sin enviar";

    if (!modal.open) {
      modalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modal.showModal();
    }
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

    // Mostramos la cotización recién aprobada en su nueva pestaña.
    filtro = "aprobada";
    filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item.dataset.filter === "aprobada"));
    });
    render();
  };

  const guardarCorreoCliente = async (): Promise<void> => {
    if (modoModal === "detalle") return;

    const cotizacion = cotizacionModal;
    if (!cotizacion) return;

    const correo = modalClienteCorreo.value.trim();
    modalCorreoError.classList.add("hidden");
    modalCorreoError.textContent = "";

    if (!correo || !validarCorreo(correo)) {
      modalCorreoError.textContent = "Ingresa un correo electrónico válido.";
      modalCorreoError.classList.remove("hidden");
      modalClienteCorreo.focus();
      return;
    }

    const etiquetaOriginal = modalGuardarCorreo.textContent;
    modalGuardarCorreo.disabled = true;
    modalGuardarCorreo.textContent = "Guardando…";

    try {
      const actualizada = await actualizarCorreoCliente(cotizacion.id, correo);
      cotizacion.cliente_correo = actualizada?.cliente_correo ?? correo;
      modalClienteCorreo.value = cotizacion.cliente_correo;
      mostrarToast("Correo actualizado correctamente.", "ok");
    } catch (error) {
      console.error("[Admin] Error al actualizar el correo:", error);
      modalCorreoError.textContent = mensajeError(error, "No se pudo actualizar el correo");
      modalCorreoError.classList.remove("hidden");
    } finally {
      modalGuardarCorreo.disabled = false;
      modalGuardarCorreo.textContent = etiquetaOriginal || "Guardar";
    }
  };

  const enviarCotizacionFinal = async (): Promise<void> => {
    if (modoModal === "detalle") return;

    const cotizacion = cotizacionModal;
    if (!cotizacion) return;

    if (cotizacion.estado !== "aprobada" && cotizacion.estado !== "pagada") {
      modalCorreoError.textContent = "La cotización debe estar aprobada o pagada para enviarse.";
      modalCorreoError.classList.remove("hidden");
      return;
    }

    const correo = modalClienteCorreo.value.trim();
    modalCorreoError.classList.add("hidden");
    modalCorreoError.textContent = "";

    if (!correo || !validarCorreo(correo)) {
      modalCorreoError.textContent = "Ingresa un correo electrónico válido.";
      modalCorreoError.classList.remove("hidden");
      modalClienteCorreo.focus();
      return;
    }

    modalEnviarCliente.disabled = true;
    modalGuardarCorreo.disabled = true;
    modalEnviarSpinner.classList.remove("hidden");
    modalEnviarLabel.textContent = "Enviando…";

    try {
      if (correo !== cotizacion.cliente_correo) {
        const actualizada = await actualizarCorreoCliente(cotizacion.id, correo);
        cotizacion.cliente_correo = actualizada?.cliente_correo ?? correo;
      }

      const resultado = await enviarCotizacionCliente(cotizacion.id, correo);
      const correoEnviado = resultado.correo ?? correo;

      if (resultado.iniciado) {
        modalEnvioStatus.textContent = `${resultado.message ?? "Envío iniciado"} a ${correoEnviado}.`;
        mostrarToast("Envío de cotización iniciado.", "ok");
      } else {
        const enviadoAt = resultado.enviado_at ?? new Date().toISOString();
        cotizacion.ultimo_envio_at = enviadoAt;
        cotizacion.ultimo_envio_correo = correoEnviado;
        modalEnvioStatus.textContent = `Enviado el ${fechaLegible(enviadoAt)} a ${correoEnviado}`;
        render();

        mostrarToast(
          resultado.advertencia
            ? "Cotización enviada. No se pudo registrar el envío."
            : "Cotización enviada al cliente.",
          resultado.advertencia ? "error" : "ok",
        );
      }
    } catch (error) {
      console.error("[Admin] Error al enviar la cotización:", error);
      modalCorreoError.textContent = mensajeError(
        error,
        "No se pudo enviar la cotización al cliente",
      );
      modalCorreoError.classList.remove("hidden");
    } finally {
      modalEnviarCliente.disabled = false;
      modalGuardarCorreo.disabled = false;
      modalEnviarSpinner.classList.add("hidden");
      modalEnviarLabel.textContent = "Enviar cotización final al cliente";
    }
  };

  const cambiarEstadoDesdeModal = async (
    cotizacion: Cotizacion,
    estadoDestino: "pagada" | "pendiente_revision",
  ): Promise<void> => {
    if (modoModal === "detalle") return;

    modalError.classList.add("hidden");
    modalError.textContent = "";

    const configEstado = obtenerEstado(cotizacion.estado);
    modalSubmit.disabled = true;
    modalSubmit.textContent = estadoDestino === "pagada" ? "Marcando…" : "Restaurando…";

    try {
      const actualizada = await cambiarEstadoCotizacion(cotizacion.id, estadoDestino);
      cotizacion.estado = actualizada?.estado ?? estadoDestino;
      filtro = filtroParaEstado(cotizacion.estado);
      filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item.dataset.filter === filtro));
      });
      render();
      modal.close();
      mostrarToast(
        estadoDestino === "pagada"
          ? "Cotización marcada como pagada. Movida a Pagadas."
          : "Cotización restaurada correctamente.",
        "ok",
      );
    } catch (error) {
      console.error("[Admin] Error al cambiar el estado:", error);
      modalError.textContent = mensajeError(error, "No se pudo actualizar la cotización");
      modalError.classList.remove("hidden");
      modalSubmit.disabled = false;
      modalSubmit.textContent = configEstado.accionPrincipal;
    }
  };

﻿  const ejecutarAprobacion = async (enviarAlCliente: boolean): Promise<void> => {
    if (modoModal === "detalle") return;

    const cotizacionActual = cotizacionModal;
    if (!cotizacionActual || cotizacionActual.estado !== "pendiente_revision") return;

    modalError.classList.add("hidden");
    modalError.textContent = "";
    modalCorreoError.classList.add("hidden");
    modalCorreoError.textContent = "";

    const correo = modalClienteCorreo.value.trim();
    if (enviarAlCliente && (!correo || !validarCorreo(correo))) {
      modalCorreoError.textContent = "Ingresa un correo electrónico válido.";
      modalCorreoError.classList.remove("hidden");
      modalClienteCorreo.focus();
      return;
    }

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
    modalSubmitOnly.disabled = true;
    modalSubmit.textContent = enviarAlCliente ? "Aprobando y enviando…" : "Aprobando…";
    modalSubmitOnly.textContent = "Aprobando…";

    try {
      if (enviarAlCliente && correo !== cotizacionActual.cliente_correo) {
        const actualizada = await actualizarCorreoCliente(cotizacionActual.id, correo);
        cotizacionActual.cliente_correo = actualizada?.cliente_correo ?? correo;
      }

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

      const detalleVersion = `${cotizacionActual.codigo} · Versión ${version.version_numero} · ${money(version.total)}`;
      modalSuccessDetail.textContent = detalleVersion;
      modalFormView.classList.add("hidden");
      modalFormActions.classList.add("hidden");
      modalSuccess.classList.remove("hidden");
      modalSuccess.scrollIntoView({ behavior: "smooth", block: "start" });

      if (enviarAlCliente) {
        try {
          modalSubmit.textContent = "Enviando correo…";
          const envio = await enviarCotizacionCliente(cotizacionActual.id, correo);
          const correoEnviado = envio.correo ?? correo;

          if (envio.iniciado) {
            modalSuccessDetail.textContent = `${detalleVersion} · Envío iniciado a ${correoEnviado}`;
            mostrarToast("Cotización aprobada. Envío iniciado.", "ok");
          } else {
            const enviadoAt = envio.enviado_at ?? new Date().toISOString();
            cotizacionActual.ultimo_envio_at = enviadoAt;
            cotizacionActual.ultimo_envio_correo = correoEnviado;
            modalSuccessDetail.textContent = `${detalleVersion} · Enviada a ${correoEnviado}`;
            render();
            mostrarToast("Cotización aprobada y enviada al cliente.", "ok");
          }
        } catch (error) {
          console.error("[Admin] Error al enviar la cotización aprobada:", error);
          modalSuccessDetail.textContent = `${detalleVersion} · Aprobada, pero no se pudo enviar el correo.`;
          mostrarToast(
            mensajeError(error, "Cotización aprobada, pero no se pudo enviar el correo"),
            "error",
          );
        }
      } else {
        mostrarToast("Cotización aprobada correctamente.", "ok");
      }
    } catch (error) {
      console.error("[Admin] Error al aprobar cotización:", error);
      modalError.textContent = mensajeError(error, "No se pudo aprobar la cotización");
      modalError.classList.remove("hidden");
      modalFormActions.classList.remove("hidden");
      modalSubmit.disabled = false;
      modalSubmitOnly.disabled = false;
      modalSubmit.textContent = "Aprobar y Enviar al Cliente";
      modalSubmitOnly.textContent = "Aprobar sin enviar";
      actualizarEstadoModal();
    }
  };

  modalSubmit.addEventListener("click", () => {
    const cotizacion = cotizacionModal;
    if (!cotizacion) return;

    if (cotizacion.estado === "pendiente_revision") {
      void ejecutarAprobacion(true);
    } else if (cotizacion.estado === "aprobada") {
      void cambiarEstadoDesdeModal(cotizacion, "pagada");
    } else if (cotizacion.estado === "eliminada") {
      void cambiarEstadoDesdeModal(cotizacion, "pendiente_revision");
    }
  });

  modalSubmitOnly.addEventListener("click", () => {
    if (cotizacionModal?.estado === "pendiente_revision") {
      void ejecutarAprobacion(false);
    }
  });

  modalForm.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  const eliminarCotizacionDesdeLista = async (id: string): Promise<void> => {
    const cotizacion = cotizaciones.find((item) => item.id === id);
    if (!cotizacion) return;

    if (!window.confirm(`¿Deseas eliminar esta cotización?\n\n${cotizacion.codigo}`)) {
      return;
    }

    try {
      const actualizada = await cambiarEstadoCotizacion(cotizacion.id, "eliminada");
      cotizacion.estado = actualizada?.estado ?? "eliminada";
      render();
      mostrarToast("Cotización eliminada correctamente.", "ok");
    } catch (error) {
      console.error("[Admin] Error al eliminar cotización:", error);
      mostrarToast(mensajeError(error, "No se pudo eliminar la cotización"), "error");
    }
  };

  const restaurarCotizacionDesdeLista = async (id: string): Promise<void> => {
    const cotizacion = cotizaciones.find((item) => item.id === id);
    if (!cotizacion) return;

    try {
      const actualizada = await cambiarEstadoCotizacion(id, "pendiente_revision");
      cotizacion.estado = actualizada?.estado ?? "pendiente_revision";
      filtro = filtroParaEstado(cotizacion.estado);
      filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item.dataset.filter === filtro));
      });
      render();
      mostrarToast("Cotización restaurada correctamente.", "ok");
    } catch (error) {
      console.error("[Admin] Error al restaurar cotización:", error);
      mostrarToast(mensajeError(error, "No se pudo restaurar la cotización"), "error");
    }
  };

  const marcarComoPagada = async (id: string): Promise<void> => {
    const cotizacion = cotizaciones.find((item) => item.id === id);
    if (!cotizacion) return;

    try {
      const actualizada = await cambiarEstadoCotizacion(id, "pagada");
      cotizacion.estado = actualizada?.estado ?? "pagada";
      filtro = filtroParaEstado(cotizacion.estado);
      filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item.dataset.filter === filtro));
      });
      render();
      mostrarToast("Cotización marcada como pagada. Movida a Pagadas.", "ok");
    } catch (error) {
      console.error("[Admin] Error al marcar como pagada:", error);
      mostrarToast(mensajeError(error, "No se pudo marcar la cotización como pagada"), "error");
    }
  };

  // ---------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------
  const abrirNuevaCotizacion = initNuevaCotizacion(catalogo, async (data) => {
    mostrarToast(`Cotización ${data.codigo ?? ""} creada como pendiente.`, "ok");

    filtro = "pendiente_revision";
    filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((boton) => {
      boton.setAttribute("aria-pressed", String(boton.dataset.filter === filtro));
    });

    await cargar();

    if (data.id && cotizaciones.some((cotizacion) => cotizacion.id === data.id)) {
      abrirModal(data.id, "gestion");
    }
  });

  document.addEventListener("click", (event) => {
    if ((event.target as Element).closest("[data-card-menu]")) return;
    list.querySelectorAll<HTMLDetailsElement>("details[data-card-menu][open]").forEach((menu) => {
      menu.open = false;
    });
  });

  refreshBtn.addEventListener("click", () => void cargar());
  retryBtn.addEventListener("click", () => void cargar());

  importOpenBtn?.addEventListener("click", abrirImportacion);
  importAnalyzeBtn?.addEventListener("click", analizarImportacion);
  importBackBtn?.addEventListener("click", () => {
    pasoImportacion = "pegar";
    actualizarVistaImportacion();
    importText?.focus();
  });
  importCreateBtn?.addEventListener("click", () => void crearImportacion());
  importCreateManualBtn?.addEventListener("click", () => {
    importModal?.close();
    abrirNuevaCotizacion();
  });
  importCloseBtn?.addEventListener("click", () => importModal?.close());
  importCancelBtn?.addEventListener("click", () => importModal?.close());
  importModal?.addEventListener("click", (event) => {
    if (event.target === importModal) importModal.close();
  });
  importModal?.addEventListener("close", () => {
    limpiarErroresImportacion();
    pasoImportacion = "revision";
    actualizarVistaImportacion();
    importTrigger?.focus();
    importTrigger = null;
  });
  importForm?.addEventListener("submit", (event) => event.preventDefault());

  importItems?.addEventListener("click", (event) => {
    const boton = (event.target as Element).closest<HTMLElement>("[data-import-remove]");
    if (!boton) return;
    boton.closest<HTMLElement>("[data-import-item]")?.remove();
    actualizarTotalImportacion();
  });

  importItems?.addEventListener("input", () => {
    actualizarTotalImportacion();
  });

  logoutBtn?.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    await cerrarSesionAdmin();
    window.location.replace("/admin/login");
  });

  searchInput.addEventListener("input", () => {
    busqueda = searchInput.value;
    render();
  });

  filters.addEventListener("click", (event) => {
    const boton = (event.target as Element).closest<HTMLButtonElement>("[data-filter]");
    if (!boton) return;
    const valor = boton.dataset.filter;
    if (
      valor !== "pendiente_revision" &&
      valor !== "aprobada" &&
      valor !== "historial" &&
      valor !== "eliminada"
    ) {
      return;
    }
    filtro = valor;
    filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === boton));
    });
    render();
  });

  list.addEventListener("click", (event) => {
    const objetivo = event.target as Element;

    const botonCrear = objetivo.closest<HTMLElement>("[data-create-quote]");
    if (botonCrear) {
      abrirNuevaCotizacion();
      return;
    }

    if (!objetivo.closest("summary")) {
      list.querySelectorAll<HTMLDetailsElement>("details[data-card-menu][open]").forEach((menu) => {
        menu.open = false;
      });
    }

    const tarjeta = objetivo.closest<HTMLElement>("[data-card-open]");
    const elementoInteractivo = objetivo.closest(
      "button, a, summary, input, select, textarea, details",
    );
    if (tarjeta && !elementoInteractivo) {
      const id = tarjeta.getAttribute("data-card-open");
      if (id) {
        const cotizacion = cotizaciones.find((item) => item.id === id);
        abrirModal(id, cotizacion?.estado === "pagada" ? "detalle" : "gestion");
      }
      return;
    }

    const botonDetalle = objetivo.closest<HTMLButtonElement>("[data-detail]");
    if (botonDetalle) {
      const id = botonDetalle.dataset.detail;
      if (id) abrirModal(id, "detalle");
      return;
    }

    const botonAprobar = objetivo.closest<HTMLButtonElement>("[data-approve]");
    if (botonAprobar) {
      const id = botonAprobar.dataset.approve;
      if (id) abrirModal(id, "gestion");
      return;
    }

    const botonEnviarCliente = objetivo.closest<HTMLButtonElement>("[data-enviar-cliente]");
    if (botonEnviarCliente) {
      const id = botonEnviarCliente.getAttribute("data-enviar-cliente");
      if (id) {
        abrirModal(id);
        modalEnviarCliente.focus();
      }
      return;
    }

    const botonEliminar = (event.target as Element).closest<HTMLButtonElement>("[data-delete]");
    if (botonEliminar) {
      const id = botonEliminar.getAttribute("data-delete");
      if (id) void eliminarCotizacionDesdeLista(id);
      return;
    }

    const botonRestaurar = (event.target as Element).closest<HTMLButtonElement>("[data-restore]");
    if (botonRestaurar) {
      const id = botonRestaurar.getAttribute("data-restore");
      if (id) void restaurarCotizacionDesdeLista(id);
      return;
    }

    const botonPagar = (event.target as Element).closest<HTMLButtonElement>("[data-mark-paid]");
    if (botonPagar) {
      const id = botonPagar.getAttribute("data-mark-paid");
      if (id) void marcarComoPagada(id);
    }
  });

  list.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    const objetivo = event.target as Element;
    if (objetivo.closest("button, a, summary, input, select, textarea, details")) return;

    const tarjeta = objetivo.closest<HTMLElement>("[data-card-open]");
    if (!tarjeta) return;

    event.preventDefault();
    const id = tarjeta.getAttribute("data-card-open");
    if (id) {
      const cotizacion = cotizaciones.find((item) => item.id === id);
      abrirModal(id, cotizacion?.estado === "pagada" ? "detalle" : "gestion");
    }
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
    if (modoModal === "detalle") return;

    const boton = (event.target as Element).closest<HTMLButtonElement>("[data-remove-item]");
    if (!boton) return;
    boton.closest("[data-modal-item]")?.remove();
    actualizarEstadoModal();
    recalcular();
  });

  modalGuardarCorreo.addEventListener("click", () => void guardarCorreoCliente());
  modalEnviarCliente.addEventListener("click", () => void enviarCotizacionFinal());

  modalClose.addEventListener("click", () => modal.close());
  modalCancel.addEventListener("click", () => modal.close());
  successClose.addEventListener("click", () => modal.close());

  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });

  modal.addEventListener("close", () => {
    cotizacionModal = null;
    modoModal = "gestion";
    resetModal();
    modalTrigger?.focus();
    modalTrigger = null;
  });

  // Inicializa los selectores del catálogo oficial.
  renderCatalogo();

  // Al cargar la página se consulta el endpoint administrativo.
  void cargar();

}
