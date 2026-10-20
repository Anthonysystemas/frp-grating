import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import path from 'node:path';

export interface PdfItemCotizacion {
  descripcion: string;
  detalle: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
}

export interface PdfCotizacionData {
  numero: string;
  fecha: string;
  clienteNombre: string;
  clienteRazonSocial: string;
  clienteRuc?: string;
  clienteCorreo?: string;
  clienteCelular?: string;
  items: PdfItemCotizacion[];
  subtotal: number;
  igv: number;
  flete?: number;
  total: number;
  incluyeIgv?: boolean;
  moneda?: string;
}

// Compilador de Typst reutilizado entre invocaciones de la misma instancia
// serverless ("warm"). Crearlo recarga las fuentes desde disco (~500ms en frío),
// así que se crea una sola vez de forma perezosa y se reutiliza.
let compiladorPdf: NodeCompiler | null = null;

function obtenerCompiladorPdf(): NodeCompiler {
  if (!compiladorPdf) {
    const pdfDir = path.join(process.cwd(), 'src', 'pdf');
    compiladorPdf = NodeCompiler.create({
      workspace: pdfDir,
      fontArgs: [{ fontPaths: [path.join(pdfDir, 'fonts')] }],
    });
  }
  return compiladorPdf;
}

/**
 * Compila la plantilla Typst compartida por /api/cotizacion y /api/admin/aprobar.
 * Cada compilación pasa sus propios `inputs`; la instancia compartida no
 * conserva datos de la cotización anterior.
 */
export async function generarPdfCotizacion(datos: PdfCotizacionData): Promise<Buffer> {
  const pdfDir = path.join(process.cwd(), 'src', 'pdf');
  const compiler = obtenerCompiladorPdf();
  const compilado = compiler.compile({
    mainFilePath: path.join(pdfDir, 'plantilla.typ'),
    inputs: {
      numero: datos.numero,
      fecha: datos.fecha,
      moneda: datos.moneda ?? 'USD',
      cliente_nombre: datos.clienteNombre,
      cliente_razon_social: datos.clienteRazonSocial,
      cliente_ruc: datos.clienteRuc || '—',
      cliente_correo: datos.clienteCorreo || '—',
      cliente_celular: datos.clienteCelular || '—',
      productos: JSON.stringify(datos.items),
      subtotal_usd: datos.subtotal.toFixed(2),
      igv_usd: datos.igv.toFixed(2),
      flete_usd: (datos.flete ?? 0).toFixed(2),
      total_usd: datos.total.toFixed(2),
      incluye_igv: datos.incluyeIgv === false ? 'false' : 'true',
      logo_path: 'logo.png',
    },
  });

  if (compilado.hasError() || !compilado.result) {
    throw new Error(compilado.takeError()?.shortDiagnostics?.join('\n') || 'No se pudo compilar el PDF');
  }

  return compiler.pdf(compilado.result);
}
