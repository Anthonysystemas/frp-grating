import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findProduct } from '../src/data/catalog';

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
      precioUnitario: product.precioUnitario,
      subtotal: subtotalCentavos // Céntimos de dólar
    });
  }

  // --- LOG LIMPIO ---
  console.log(`[Cotización Generada] Ítems: ${validatedItems.length} | Total (Centavos): ${totalCentavos}`);

  // --- RESPUESTA FINAL (Lista para el futuro PDF) ---
  return res.status(200).json({ 
    ok: true, 
    items: validatedItems, 
    total: totalCentavos 
  });
}