import { CATALOG, categorias } from "../../data/catalog";
import { fechaCorta, fechaLegible, money } from "./format";
import { lineasDeVersion, normalizarRuc, totalesDeVersion } from "./quote";
import {
  actualizarCorreoCliente,
  aprobarCotizacion,
  cambiarEstadoCotizacion,
  cerrarSesionAdmin,
  enviarCotizacionCliente,
  fetchCotizaciones,
  mensajeError,
} from "./api";
import {
  badgeEstado,
  filaModal,
  opcionesCategoria,
  opcionesProducto,
  tarjeta,
} from "./render";
import { obtenerEstado } from "./states";
import { validarCorreo } from "../utils/validation";
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
  const logoutBtn = document.getElementById("logout") as HTMLButtonElement;
  const retryBtn = document.getElementById("retry") as HTMLButtonElement;
  const searchInput = document.getElementById("search") as HTMLInputElement;
  const filters = document.getElementById("filters") as HTMLElement;

  const modal = document.getElementById("approve-modal") as HTMLDialogElement;
  const modalTitle = document.getElementById("approve-title") as HTMLElement;
  const modalClient = document.getElementById("modal-client") as HTMLElement;
  const modalStatus = document.getElementById("modal-status") as HTMLElement;
  const modalDate = document.getElementById("modal-date") as HTMLElement;
  const modalTotalSummary = document.getElementById("modal-total-summary") as HTMLElement;
  const modalItemsHint = document.getElementById("modal-items-hint") as HTMLElement;
  const modalFleteWrapper = document.getElementById("modal-flete-wrapper") as HTMLElement;
  const modalAdminBlock = document.getElementById("modal-admin-block") as HTMLElement;
  const modalClienteCorreo = document.getElementById("modal-cliente-correo") as HTMLInputElement;
  const modalGuardarCorreo = document.getElementById("modal-guardar-correo") as HTMLButtonElement;
  const modalCorreoError = document.getElementById("modal-correo-error") as HTMLElement;
  const modalEnvioStatus = document.getElementById("modal-envio-status") as HTMLElement;
  const modalEnviarCliente = document.getElementById("modal-enviar-cliente") as HTMLButtonElement;
  const modalEnviarSpinner = document.getElementById("modal-enviar-spinner") as HTMLElement;
  const modalEnviarLabel = document.getElementById("modal-enviar-label") as HTMLElement;
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
  const modalSubmitOnly = document.getElementById("modal-submit-only") as HTMLButtonElement;
  const modalForm = document.getElementById("approve-form") as HTMLFormElement;
  const modalFormView = document.getElementById("modal-form-view") as HTMLElement;
  const modalFormActions = document.getElementById("modal-form-actions") as HTMLElement;
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
  let filtro: "pendiente_revision" | "aprobada" | "historial" | "eliminada" = "pendiente_revision";
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

    list.innerHTML = visibles.map(tarjeta).join("");
    list.classList.toggle("hidden", visibles.length === 0);
    emptyState.classList.toggle("hidden", visibles.length > 0);
    if (visibles.length === 0) {
      const mensajes: Record<typeof filtro, string> = {
        pendiente_revision: "No hay cotizaciones pendientes.",
        aprobada: "No hay cotizaciones aprobadas.",
        historial: "No hay cotizaciones en el historial.",
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
      const [activas, eliminadas] = await Promise.all([
        fetchCotizaciones(),
        fetchCotizaciones("eliminada"),
      ]);
      cotizaciones = [...activas, ...eliminadas];
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
    const editable = cotizacionModal?.estado === "pendiente_revision";

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
    modalSubmitOnly.textContent = "Solo Aprobar";
    modalStatus.innerHTML = "";
    modalDate.textContent = "";
    modalTotalSummary.textContent = "";
    modalItems.innerHTML = "";
    modalFlete.value = "0";
    modalClienteCorreo.value = "";
    modalCorreoError.classList.add("hidden");
    modalCorreoError.textContent = "";
    modalEnvioStatus.textContent = "";
    modalEnviarCliente.classList.add("hidden");
    modalEnviarCliente.classList.remove("inline-flex");
    modalEnviarCliente.disabled = false;
    modalEnviarSpinner.classList.add("hidden");
    modalEnviarLabel.textContent = "Enviar cotización final al cliente";
    modalGuardarCorreo.disabled = false;
    modalGuardarCorreo.textContent = "Guardar";
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
    const editable = cotizacion.estado === "pendiente_revision";
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

    modalTitle.textContent = "Gestionar cotización";
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
    modalCorreoError.classList.add("hidden");
    modalCorreoError.textContent = "";
    modalEnvioStatus.textContent =
      cotizacion.ultimo_envio_at && cotizacion.ultimo_envio_correo
        ? `Enviado el ${fechaLegible(cotizacion.ultimo_envio_at)} a ${cotizacion.ultimo_envio_correo}`
        : "";
    modalEnviarCliente.classList.toggle(
      "hidden",
      cotizacion.estado !== "aprobada" && cotizacion.estado !== "pagada",
    );
    modalEnviarCliente.classList.toggle(
      "inline-flex",
      cotizacion.estado === "aprobada" || cotizacion.estado === "pagada",
    );

    modalGuardarCorreo.classList.toggle("hidden", editable);
    toggleCatalogBtn.classList.toggle("hidden", !editable);
    modalFleteWrapper.classList.toggle("hidden", !editable);
    modalAdminBlock.classList.toggle("hidden", !editable);
    catalogPanel.classList.add("hidden");

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
    modalSubmit.classList.toggle("hidden", cotizacion.estado === "pagada");

    modalSubmitOnly.classList.toggle("hidden", !editable);
    modalSubmitOnly.disabled = false;
    modalSubmitOnly.textContent = "Solo Aprobar";

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

    // Mostramos la cotización recién aprobada en su nueva pestaña.
    filtro = "aprobada";
    filters.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item.dataset.filter === "aprobada"));
    });
    render();
  };

  const guardarCorreoCliente = async (): Promise<void> => {
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
      const enviadoAt = resultado.enviado_at ?? new Date().toISOString();
      const correoEnviado = resultado.correo ?? correo;

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
          ? "Cotización marcada como pagada."
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
          const enviadoAt = envio.enviado_at ?? new Date().toISOString();
          const correoEnviado = envio.correo ?? correo;

          cotizacionActual.ultimo_envio_at = enviadoAt;
          cotizacionActual.ultimo_envio_correo = correoEnviado;
          modalSuccessDetail.textContent = `${detalleVersion} · Enviada a ${correoEnviado}`;
          render();
          mostrarToast("Cotización aprobada y enviada al cliente.", "ok");
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
      modalSubmitOnly.textContent = "Solo Aprobar";
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
      mostrarToast("Cotización marcada como pagada.", "ok");
    } catch (error) {
      console.error("[Admin] Error al marcar como pagada:", error);
      mostrarToast(mensajeError(error, "No se pudo marcar la cotización como pagada"), "error");
    }
  };

  // ---------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------
  document.addEventListener("click", (event) => {
    if ((event.target as Element).closest("[data-card-menu]")) return;
    list.querySelectorAll<HTMLDetailsElement>("details[data-card-menu][open]").forEach((menu) => {
      menu.open = false;
    });
  });

  refreshBtn.addEventListener("click", () => void cargar());
  retryBtn.addEventListener("click", () => void cargar());

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
      if (id) abrirModal(id);
      return;
    }

    const botonAprobar = objetivo.closest<HTMLButtonElement>("[data-approve]");
    if (botonAprobar) {
      const id = botonAprobar.dataset.approve;
      if (id) abrirModal(id);
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
    resetModal();
  });

  // Inicializa los selectores del catálogo oficial.
  renderCatalogo();

  // Al cargar la página se consulta el endpoint administrativo.
  void cargar();

}
