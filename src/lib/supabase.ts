import { createClient } from '@supabase/supabase-js';

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
// cambiar estados). Usa la service role key si está configurada; si no,
// recurre al cliente anónimo y quedará sujeto a las políticas RLS.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : supabase;