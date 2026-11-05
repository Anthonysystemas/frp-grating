const SUFIJO_ALEATORIO = (): string =>
  Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, "0");

/**
 * Genera un código de cotización con el formato MSK-YYYYMMDD-XXX.
 * La fecha se calcula en la zona horaria de Lima para que el código
 * coincida con el día comercial aunque el servidor esté en UTC.
 */
export function generarCodigoCotizacion(fecha: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(fecha)
    .reduce<Record<string, string>>((resultado, parte) => {
      resultado[parte.type] = parte.value;
      return resultado;
    }, {});

  return `MSK-${partes.year}${partes.month}${partes.day}-${SUFIJO_ALEATORIO()}`;
}
