import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findProduct } from '../src/data/catalog.js';
import { enviarAlertaLead, validarCliente } from '../src/lib/cotizacion.js';
import { generarPdfCotizacion } from '../src/lib/pdf.js';
import { supabase } from '../src/lib/supabase.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const { contacto, items } = (req.body || {}) as CotizacionPayload;

  // --- HONEYPOT ANTI-SPAM ---
  // Un humano nunca ve el campo `website` (oculto por CSS). Si llega con
  // contenido, es un bot: se rechaza antes de validar o compilar el PDF.
  const honeypot = ((contacto as any)?.website || '').toString().trim();
  if (honeypot) {
    return res.status(400).json({ ok: false, error: 'Solicitud rechazada' });
  }

  // --- VALIDACIONES DE CONTACTO (compartidas con /api/enviar-correo) ---
  const validacion = validarCliente(contacto);
  if (validacion.ok === false) {
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

  // --- PERSISTENCIA EN SUPABASE (FASE 1) ---
  // Se registra la cotización y su primera versión antes de compilar el PDF:
  // así la solicitud no se pierde si falla la generación del documento.
  const { data: cotizacionGuardada, error: errorCotizacion } = await supabase
    .from('cotizaciones')
    .insert({
      codigo,
      cliente_nombre: nombre,
      cliente_empresa: empresa,
      cliente_ruc_dni: ruc || null,
      cliente_correo: correo,
      cliente_celular: celular,
      estado: 'pendiente_revision',
    })
    .select('id, codigo')
    .single();

  if (errorCotizacion || !cotizacionGuardada) {
    console.error('[Cotización] Error al guardar la cotización', errorCotizacion);
    return res.status(500).json({ ok: false, error: 'No se pudo guardar la cotización' });
  }

  const versionItems = validatedItems.map((item) => ({
    id: item.id,
    nombre: item.nombre,
    detalle: item.detalle,
    cantidad: item.qty,
    precio_unitario: item.precioUnitarioCentavos / 100,
    subtotal: item.subtotalCentavos / 100,
  }));

  const { error: errorVersion } = await supabase
    .from('cotizacion_versiones')
    .insert({
      cotizacion_id: cotizacionGuardada.id,
      version_numero: 1,
      es_oficial: false,
      items: versionItems,
      subtotal: Number((subtotalCentavos / 100).toFixed(2)),
      igv: Number((igvCentavos / 100).toFixed(2)),
      total: Number((totalCentavos / 100).toFixed(2)),
    });

  if (errorVersion) {
    console.error('[Cotización] Error al guardar la primera versión', errorVersion);
    // Evita dejar una cotización huérfana si falla la inserción de su versión.
    const { error: errorLimpieza } = await supabase
      .from('cotizaciones')
      .delete()
      .eq('id', cotizacionGuardada.id);
    if (errorLimpieza) {
      console.error('[Cotización] No se pudo revertir la cotización huérfana', errorLimpieza);
    }
    return res.status(500).json({ ok: false, error: 'No se pudo guardar la cotización' });
  }

  // Alerta interna de nuevo lead. Es best-effort: nunca bloquea la cotización.
  await enviarAlertaLead({
    codigo,
    nombre,
    empresa,
    ruc: ruc || '—',
    correo,
    celular,
    total: (totalCentavos / 100).toFixed(2),
    items: validatedItems.length,
  });

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
    pdf = await generarPdfCotizacion({
      numero: codigo,
      fecha,
      moneda: 'USD',
      clienteNombre: nombre,
      clienteRazonSocial: empresa,
      clienteRuc: ruc,
      clienteCorreo: correo,
      clienteCelular: celular,
      items: pdfItems,
      subtotal: subtotalCentavos / 100,
      igv: igvCentavos / 100,
      total: totalCentavos / 100,
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
    id: cotizacionGuardada.id,
    codigo,
    items: validatedItems,
    subtotalCentavos,
    igvCentavos,
    totalCentavos,
    total,
    pdfBase64: pdf.toString('base64'),
  });
}