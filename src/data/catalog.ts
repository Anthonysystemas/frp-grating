export type CategoriaProducto = 'frp' | 'ducha' | 'clips';

export interface Product {
  id: string;
  categoria: CategoriaProducto;
  nombre: string;
  detalle: string;
  precioUnitario: number; // En dólares (US$)
  medida?: string;
  imagen?: string;
}

export interface Categoria {
  id: CategoriaProducto;
  titulo: string;
  descripcion: string;
  imagen: string;
  badge: string;
  etiqueta: string;
  especificaciones: string[];
  ruta: string;
}

export const CATALOG: Product[] = [
  // --- REJILLAS FRP ---
  { id: '1000x4038-H38', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1000x4038mm · Espesor: 38mm', precioUnitario: 310 },
  { id: '1220x2440-H38', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1220x2440mm · Espesor: 38mm', precioUnitario: 230 },
  { id: '1000x4038-H25', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1000x4038mm · Espesor: 25mm', precioUnitario: 230 },
  { id: '1000x3000-H38', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1000x3000mm · Espesor: 38mm', precioUnitario: 230 },
  { id: '1000x3000-H25', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1000x3000mm · Espesor: 25mm', precioUnitario: 180 },
  { id: '1000x2000-H38', categoria: 'frp', nombre: 'Rejilla FRP Moldeada', detalle: '1000x2000mm · Espesor: 38mm', precioUnitario: 150 },

  // --- REJILLAS DE DUCHA LINEALES ---
  { id: 'rejilla-ducha-pt02', categoria: 'ducha', nombre: 'Rejilla de Ducha Lineal PT02', detalle: '800mm, acabado lineal', precioUnitario: 52.75, imagen: '/productos/rejilla-ducha/PT02.jpg' },
  { id: 'rejilla-ducha-pt04', categoria: 'ducha', nombre: 'Rejilla de Ducha Lineal PT04', detalle: '800mm, acabado lineal', precioUnitario: 56.50, imagen: '/productos/rejilla-ducha/PT04.jpg' },
  { id: 'rejilla-ducha-pt09', categoria: 'ducha', nombre: 'Rejilla de Ducha Lineal PT09', detalle: '800mm, acabado lineal', precioUnitario: 56.50, imagen: '/productos/rejilla-ducha/PT09.jpg' },
  { id: 'rejilla-ducha-pt10', categoria: 'ducha', nombre: 'Rejilla de Ducha Lineal PT10', detalle: '800mm, acabado lineal', precioUnitario: 52.75, imagen: '/productos/rejilla-ducha/PT10.jpg' },
  { id: 'rejilla-ducha-pt20', categoria: 'ducha', nombre: 'Rejilla de Ducha Lineal PT20', detalle: '800mm, acabado lineal', precioUnitario: 56.50, imagen: '/productos/rejilla-ducha/PT20.jpg' },
  { id: 'rejilla-ducha-pt21', categoria: 'ducha', nombre: 'Rejilla de Ducha Lineal PT21', detalle: '800mm, acabado lineal', precioUnitario: 49.00, imagen: '/productos/rejilla-ducha/PT21.png' },

  // --- CLIPS DE FIJACIÓN ---
  { id: 'clip-38mm', categoria: 'clips', nombre: 'M Clips SS304', detalle: 'Compatible con FRP espesor 38mm', precioUnitario: 0.79 },
  { id: 'clip-25mm', categoria: 'clips', nombre: 'M Clips SS304', detalle: 'Compatible con FRP espesor 25mm', precioUnitario: 0.78 },
];

export const categorias: Categoria[] = [
  {
    id: 'frp',
    titulo: 'Rejilla FRP Moldeada',
    descripcion: 'Rejillas moldeadas de fibra de vidrio para ambientes corrosivos, áreas eléctricas y superficies que requieren alta tracción.',
    imagen: '/images/rejilla-frp.jpg',
    badge: 'Resina Isoftalica',
    etiqueta: 'Producto Principal',
    especificaciones: ['Malla 38x38mm', 'Superficie arenada (Gritted)'],
    ruta: '/grating-frp',
  },
  {
    id: 'ducha',
    titulo: 'Ducha Lavaojos de Emergencia',
    descripcion: 'Seis modelos lineales de 800 mm para una evacuación limpia, resistente y de instalación empotrada.',
    imagen: '/images/rejilladucha.jpg',
    badge: 'Acero Inoxidable',
    etiqueta: 'Producto Principal',
    especificaciones: ['Tipo Fold Edge (borde plegado)', 'Instalación empotrada en piso'],
    ruta: '/rejilla-ducha',
  },
  {
    id: 'clips',
    titulo: 'M Clips SS304',
    descripcion: 'Grapas tipo M para fijación de FRP grating.',
    imagen: '/images/grapa.jpg',
    badge: 'Acero Inox SS 304',
    etiqueta: 'Accesorio',
    especificaciones: ['Fijación segura para rejillas FRP'],
    ruta: '#catalogo',
  },
];

export function findProduct(id: string): Product | undefined {
  return CATALOG.find(p => p.id === id);
}

export function productosPorCategoria(categoria: CategoriaProducto): Product[] {
  return CATALOG.filter(p => p.categoria === categoria);
}
