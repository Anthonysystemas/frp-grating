export type CategoriaProducto = 'frp' | 'ducha' | 'clips';

export interface Product {
  id: string;
  categoria: CategoriaProducto;
  nombre: string;
  detalle: string;
  precioUnitario: number; // En dólares (US$)
}

export const CATALOG: Product[] = [
  // --- REJILLAS FRP ---
  { id: '1000x4038-H38', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1000x4038mm · Espesor: 38mm', precioUnitario: 310 },
  { id: '1220x2440-H38', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1220x2440mm · Espesor: 38mm', precioUnitario: 230 },
  { id: '1000x4038-H25', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1000x4038mm · Espesor: 25mm', precioUnitario: 230 },
  { id: '1000x3000-H38', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1000x3000mm · Espesor: 38mm', precioUnitario: 230 },
  { id: '1000x3000-H25', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1000x3000mm · Espesor: 25mm', precioUnitario: 180 },
  { id: '1000x2000-H38', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1000x2000mm · Espesor: 38mm', precioUnitario: 150 },
  
  // --- DUCHAS Y LAVAOJOS ---
  { id: 'PT04', categoria: 'ducha', nombre: 'Ducha Lavaojos de Emergencia', detalle: 'Modelo PT04', precioUnitario: 21 },
  { id: 'PT10', categoria: 'ducha', nombre: 'Ducha Lavaojos de Emergencia', detalle: 'Modelo PT10', precioUnitario: 19.5 },
  { id: 'PT21', categoria: 'ducha', nombre: 'Ducha Lavaojos de Emergencia', detalle: 'Modelo PT21', precioUnitario: 18 },
  { id: 'PT02', categoria: 'ducha', nombre: 'Ducha Lavaojos de Emergencia', detalle: 'Modelo PT02', precioUnitario: 19.5 },
  { id: 'PT09', categoria: 'ducha', nombre: 'Ducha Lavaojos de Emergencia', detalle: 'Modelo PT09', precioUnitario: 21 },
  { id: 'PT20', categoria: 'ducha', nombre: 'Ducha Lavaojos de Emergencia', detalle: 'Modelo PT20', precioUnitario: 21 },

  // --- CLIPS DE FIJACIÓN ---
  { id: 'clip-38mm', categoria: 'clips', nombre: 'M Clips SS304', detalle: 'Compatible con FRP espesor 38mm', precioUnitario: 0.79 },
  { id: 'clip-25mm', categoria: 'clips', nombre: 'M Clips SS304', detalle: 'Compatible con FRP espesor 25mm', precioUnitario: 0.78 },
];

export function findProduct(id: string): Product | undefined {
  return CATALOG.find(p => p.id === id);
}