import { money } from "./format";
import type { Cotizacion, ItemCotizacion, Linea, VersionCotizacion } from "./types";

export const precioDeItem = (item: ItemCotizacion): number => {
  if (typeof item.precio_unitario === "number" && Number.isFinite(item.precio_unitario)) {
    return item.precio_unitario;
  }
  if (typeof item.precioUnitario === "number" && Number.isFinite(item.precioUnitario)) {
    return item.precioUnitario;
  }
  if (typeof item.precioUnitarioCentavos === "number" && Number.isFinite(item.precioUnitarioCentavos)) {
    return item.precioUnitarioCentavos / 100;
  }
  return 0;
};

export const cantidadDeItem = (item: ItemCotizacion): number => {
  const cantidad = Number(item.cantidad ?? item.qty ?? 0);
  return Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 0;
};

export const lineasDeVersion = (version?: VersionCotizacion | null): Linea[] => {
  if (!version || !Array.isArray(version.items)) return [];
  return version.items
    .map((item, index) => {
      const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `item-${index}`;
      return {
        id,
        nombre: item.nombre?.trim() || id,
        detalle: item.detalle?.trim() || "",
        cantidad: cantidadDeItem(item),
        precio_unitario: precioDeItem(item),
        unidad: item.unidad?.trim() || "",
      };
    })
    .filter((item) => item.cantidad > 0);
};

export const subtotalLinea = (linea: Linea): number =>
  (Math.round(linea.precio_unitario * 100) * linea.cantidad) / 100;

export const totalesDeVersion = (version?: VersionCotizacion | null) => {
  const lineas = lineasDeVersion(version);
  const subtotalCalculado = lineas.reduce((suma, linea) => suma + subtotalLinea(linea), 0);
  const subtotal = Number.isFinite(Number(version?.subtotal)) ? Number(version?.subtotal) : subtotalCalculado;
  const igv = Number.isFinite(Number(version?.igv)) ? Number(version?.igv) : Math.round(subtotal * 18) / 100;
  const flete = Number.isFinite(Number(version?.flete)) ? Number(version?.flete) : 0;
  const total = Number.isFinite(Number(version?.total)) ? Number(version?.total) : subtotal + igv + flete;
  return { subtotal, igv, flete, total };
};

export const numeroWhatsApp = (cotizacion: Cotizacion): string => {
  const digitos = String(cotizacion.cliente_celular ?? "").replace(/\D/g, "");
  if (digitos.length === 9 && digitos.startsWith("9")) return `51${digitos}`;
  if (digitos.length === 11 && digitos.startsWith("51")) return digitos;
  if (digitos.length > 0) return digitos;
  return "51984649227";
};

export const enlaceWhatsApp = (cotizacion: Cotizacion): string => {
  const total = cotizacion.version_actual ? money(cotizacion.version_actual.total) : "";
  const mensaje = [
    `Hola ${cotizacion.cliente_nombre || ""}, le escribimos de Maskel Perú por su cotización ${cotizacion.codigo}.`,
    total ? `Total referencial: ${total}.` : "",
    "¿Podemos ayudarle con alguna consulta?",
  ]
    .filter(Boolean)
    .join(" ");
  return `https://wa.me/${numeroWhatsApp(cotizacion)}?text=${encodeURIComponent(mensaje)}`;
};
