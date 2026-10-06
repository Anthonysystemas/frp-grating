import type { VercelRequest, VercelResponse } from '@vercel/node';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import path from 'node:path';
import { findProduct } from '../src/data/catalog.js';

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

async function generarPdf(inputs: Record<string, string>) {
  const pdfDir = path.join(process.cwd(), 'src', 'pdf');
  const compiler = NodeCompiler.create({
    workspace: pdfDir,
    fontArgs: [{ fontPaths: [path.join(pdfDir, 'fonts')] }],
  });
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

  if (!contacto || typeof contacto !== 'object') {
    return res.status(400).json({ ok: false, error: 'Datos de contacto inválidos' });
  }

  // --- VALIDACIONES DE TEXTO Y LONGITUD ---
  const nombre = (contacto.nombre || '').trim();
  const empresa = (contacto.empresa || '').trim();
  const ruc = (contacto.ruc || '').trim();
  const correo = (contacto.correo || '').trim();

  if (!nombre) return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' });
  if (nombre.length > 100) return res.status(400).json({ ok: false, error: 'Nombre excede los 100 caracteres' });

  if (!empresa) return res.status(400).json({ ok: false, error: 'La empresa es obligatoria' });
  if (empresa.length > 120) return res.status(400).json({ ok: false, error: 'Empresa excede los 120 caracteres' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!correo || !emailRegex.test(correo) || correo.length > 120) {
    return res.status(400).json({ ok: false, error: 'El correo electrónico no es válido' });
  }

  if (ruc) {
    const rucRegex = /^(10|15|17|20)\d{9}$/;
    if (!rucRegex.test(ruc)) {
      return res.status(400).json({ ok: false, error: 'RUC inválido. Debe tener 11 dígitos y empezar con 10, 15, 17 o 20' });
    }
  }

  // --- VALIDACIONES DE ÍTEMS Y CÁLCULO ESTRICTO ---
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Debe incluir al menos un ítem' });
  }
  
  if (items.length > 30) {
    return res.status(400).json({ ok: false, error: 'Máximo 30 ítems permitidos por cotización' });
  }

  const validatedItems = [];
  let totalCentavos = 0;

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
    const subtotalCentavos = precioCentavos * item.qty;
    totalCentavos += subtotalCentavos;

    validatedItems.push({
      id: product.id,
      nombre: product.nombre,
      detalle: product.detalle,
      qty: item.qty,
      precioUnitarioCentavos: precioCentavos,
      subtotalCentavos,
    });
  }

  const { codigo, fecha } = generarIdentificadores();
  const total = (totalCentavos / 100).toFixed(2);
  const pdfItems = validatedItems.map((item) => {
    const product = findProduct(item.id)!;
    return {
      descripcion: product.nombre,
      detalle: product.detalle,
      unidad: 'unidad',
      cantidad: item.qty,
      precio_unitario: item.precioUnitarioCentavos / 100,
    };
  });

  let pdfBase64: string;
  try {
    const pdf = await generarPdf({
      numero: codigo,
      fecha,
      moneda: 'USD',
      cliente_nombre: nombre,
      cliente_razon_social: empresa,
      cliente_ruc: ruc || '—',
      cliente_correo: correo,
      productos: JSON.stringify(pdfItems),
      incluye_igv: 'false',
      logo_path: 'logo.png',
    });
    pdfBase64 = pdf.toString('base64');
  } catch (error) {
    console.error('[Cotización PDF] Error de compilación', error);
    return res.status(500).json({ ok: false, error: 'No se pudo generar el PDF de la cotización' });
  }

  // --- LOG LIMPIO ---
  console.log(`[Cotización Generada] Ítems: ${validatedItems.length} | Total (Centavos): ${totalCentavos}`);

  // --- RESPUESTA FINAL (Lista para el futuro PDF) ---
  return res.status(200).json({
    ok: true,
    codigo,
    items: validatedItems,
    totalCentavos,
    total,
    pdfBase64,
  });
}