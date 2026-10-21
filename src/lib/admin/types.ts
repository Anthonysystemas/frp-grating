export interface ItemCotizacion {
  id?: string;
  nombre?: string;
  detalle?: string;
  cantidad?: number;
  qty?: number;
  precio_unitario?: number;
  precioUnitario?: number;
  precioUnitarioCentavos?: number;
  subtotal?: number;
  unidad?: string;
}

export interface VersionCotizacion {
  id: string;
  version_numero: number;
  es_oficial: boolean;
  items?: ItemCotizacion[];
  subtotal?: number;
  igv?: number;
  flete?: number;
  total?: number;
  created_at?: string;
}

export interface Cotizacion {
  id: string;
  codigo: string;
  cliente_nombre?: string;
  nombre?: string;
  cliente_empresa?: string;
  empresa?: string;
  cliente?: {
    nombre?: string;
    empresa?: string;
  };
  cliente_ruc_dni?: string;
  cliente_correo?: string;
  cliente_celular?: string;
  estado?: string;
  created_at?: string;
  versiones?: VersionCotizacion[];
  version_actual?: VersionCotizacion | null;
}

export interface Linea {
  id: string;
  nombre: string;
  detalle: string;
  cantidad: number;
  precio_unitario: number;
  unidad: string;
}

export interface CatalogoOpcion {
  code: string;
  name: string;
  label: string;
  price: number;
  unidad: string;
}

export interface CatalogoCategoria {
  id: string;
  label: string;
  unit: string;
  options: CatalogoOpcion[];
}
