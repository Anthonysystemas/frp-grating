import type { VercelRequest, VercelResponse } from '@vercel/node';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import path from 'node:path';
import { findProduct } from '../src/data/catalog.js';
import { validarCliente } from '../src/lib/cotizacion.js';

interface CotizacionItem {
  id: string;
  qty: number;
}

interface CotizacionPayload {
  contacto: {
    nombre: string;
    empresa: string;
    ruc?: string;
    correo: string;
    celular: string;
  };
  items: CotizacionItem[];
}

function generarIdentificadores() {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora).reduce<Record<string, string>>((resultado, parte) => {
    resultado[parte.type] = parte.value;
    return resultado;
  }, {});

  const codigo = `MSK-${partes.year}${partes.month}${partes.day}-${partes.hour}${partes.minute}${partes.second}`;
  const fecha = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(ahora);

  return { codigo, fecha: `Lima, ${fecha}` };
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

async function generarPdf(inputs: Record<string, string>) {
  const pdfDir = path.join(process.cwd(), 'src', 'pdf');
  // Cada compilación pasa sus propios `inputs` (sys.inputs); la instancia
  // compartida no conserva datos de la cotización anterior.
  const compiler = obtenerCompiladorPdf();
  const compilado = compiler.compile({
    mainFilePath: path.join(pdfDir, 'plantilla.typ'),
    inputs,
  });

  if (compilado.hasError() || !compilado.result) {
    throw new Error(compilado.takeError()?.shortDiagnostics?.join('\n') || 'No se pudo compilar el PDF');
  }

  return compiler.pdf(compilado.result);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const { contacto, items } = (req.body || {}) as CotizacionPayload;

  // --- VALIDACIONES DE CONTACTO (compartidas con /api/enviar-correo) ---
  const validacion = validarCliente(contacto);
  if (!validacion.ok) {
    return res.status(400).json({ ok: false, error: validacion.error });
  }
  const { nombre, empresa, ruc, correo, celular } = validacion.cliente;

  // --- VALIDACIONES DE ÍTEMS Y CÁLCULO ESTRICTO ---
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Debe incluir al menos un ítem' });
  }
  
  if (items.length > 30) {
    return res.status(400).json({ ok: false, error: 'Máximo 30 ítems permitidos por cotización' });
  }

  const validatedItems = [];
  let subtotalCentavos = 0;

  for (const item of items) {
    // Buscar id seguro en nuestro catálogo
    const product = findProduct(item.id);
    if (!product) {
      return res.status(400).json({ ok: false, error: `Producto no válido: ${item.id}` });
    }

    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10000) {
      return res.status(400).json({ ok: false, error: `Cantidad inválida para el producto: ${item.id}` });
    }

    // Cálculo seguro en centavos (evita errores de JavaScript como 0.1 + 0.2 = 0.30000000000000004)
    const precioCentavos = Math.round(product.precioUnitario * 100);
    const subtotalItemCentavos = precioCentavos * item.qty;
    subtotalCentavos += subtotalItemCentavos;

    validatedItems.push({
      id: product.id,
      nombre: product.nombre,
      detalle: product.detalle,
      qty: item.qty,
      precioUnitarioCentavos: precioCentavos,
      subtotalCentavos: subtotalItemCentavos,
    });
  }

  const igvCentavos = Math.round(subtotalCentavos * 0.18);
  const totalCentavos = subtotalCentavos + igvCentavos;

  const { codigo, fecha } = generarIdentificadores();
  const total = (totalCentavos / 100).toFixed(2);
  const pdfItems = validatedItems.map((item) => {
    const product = findProduct(item.id)!;
    return {
      descripcion: product.nombre,
      detalle: product.detalle,
      unidad: product.categoria === 'frp' ? 'panel' : 'unidad',
      cantidad: item.qty,
      precio_unitario: item.precioUnitarioCentavos / 100,
    };
  });

  let pdf: Buffer;
  try {
    pdf = await generarPdf({
      numero: codigo,
      fecha,
      moneda: 'USD',
      cliente_nombre: nombre,
      cliente_razon_social: empresa,
      cliente_ruc: ruc || '—',
      cliente_correo: correo,
      cliente_celular: celular,
      productos: JSON.stringify(pdfItems),
      subtotal_usd: (subtotalCentavos / 100).toFixed(2),
      igv_usd: (igvCentavos / 100).toFixed(2),
      total_usd: (totalCentavos / 100).toFixed(2),
      incluye_igv: 'true',
      logo_path: 'logo.png',
    });
  } catch (error) {
    console.error('[Cotización PDF] Error de compilación', error);
    return res.status(500).json({ ok: false, error: 'No se pudo generar el PDF de la cotización' });
  }

  // --- LOG LIMPIO ---
  console.log(`[Cotización Generada] Ítems: ${validatedItems.length} | Total (Centavos): ${totalCentavos}`);

  // --- RESPUESTA FINAL ---
  return res.status(200).json({
    ok: true,
    codigo,
    items: validatedItems,
    subtotalCentavos,
    igvCentavos,
    totalCentavos,
    total,
    pdfBase64: pdf.toString('base64'),
  });
}