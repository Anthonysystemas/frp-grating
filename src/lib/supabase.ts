import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// La URL y la anon key se leen de process.env porque estas funciones también
// corren en serverless de Vercel, donde import.meta.env puede no existir.
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno de Supabase en el archivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente para tareas administrativas (leer todas las cotizaciones, aprobar,
// cambiar estados). La service role key es obligatoria: no se debe degradar
// silenciosamente al cliente anónimo, porque las operaciones quedarían
// sujetas a RLS y podrían fallar de forma confusa.
// Se lee de import.meta.env cuando está disponible (entorno Vite/Astro) y se
// usa process.env como respaldo en funciones serverless de Vercel.
const importMetaEnv =
  typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    : undefined;

const serviceRoleKey =
  importMetaEnv?.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
let clienteAdmin: SupabaseClient | null = null;

export function obtenerSupabaseAdmin(): SupabaseClient {
  const urlAdmin = supabaseUrl;
  const claveAdmin = serviceRoleKey;

  if (!urlAdmin) {
    throw new Error('Falta PUBLIC_SUPABASE_URL para usar las funciones administrativas.');
  }

  if (!claveAdmin) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY. Configúrala para usar las funciones administrativas.',
    );
  }

  if (!clienteAdmin) {
    clienteAdmin = createClient(urlAdmin, claveAdmin, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return clienteAdmin;
}