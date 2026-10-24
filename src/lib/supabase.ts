import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Estas variables se leen en funciones serverless de Vercel, donde
// `import.meta.env` no existe. Acceder a `import.meta.env.X` directamente
// provoca un TypeError en producción si falta la variable.
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
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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