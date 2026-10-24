import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ADMIN_SESSION_COOKIE = 'admin_session';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const { email, password } = (req.body || {}) as {
    email?: unknown;
    password?: unknown;
  };

  const correo = typeof email === 'string' ? email.trim() : '';
  const clave = typeof password === 'string' ? password : '';

  if (!correo || !clave) {
    return res.status(400).json({ ok: false, error: 'Ingresa tu correo y contraseña' });
  }

  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Admin login] Faltan variables de entorno de Supabase');
    return res.status(500).json({ ok: false, error: 'Configuración de Supabase incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: clave,
  });

  if (error) {
    console.error('[Admin login] Error de Supabase Auth', {
      message: error.message,
      status: error.status,
      code: error.code,
    });
  }

  if (error || !data.session) {
    return res.status(401).json({ ok: false, error: 'Correo o contraseña incorrectos' });
  }

  const correosAutorizados = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((correoAutorizado) => correoAutorizado.trim().toLowerCase())
    .filter(Boolean);

  if (correosAutorizados.length === 0) {
    console.error('[Admin login] ADMIN_EMAILS no está configurada');
    return res.status(403).json({ ok: false, error: 'Correo no autorizado' });
  }

  const correoUsuario = (data.user?.email ?? correo).trim().toLowerCase();
  if (!correoUsuario || !correosAutorizados.includes(correoUsuario)) {
    console.error('[Admin login] Correo no autorizado', correoUsuario);
    return res.status(403).json({ ok: false, error: 'Correo no autorizado' });
  }

  const maxAge = data.session.expires_in ?? 3600;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(data.session.access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  );
  res.setHeader('Cache-Control', 'no-store');

  return res.status(200).json({
    ok: true,
    usuario: {
      id: data.user?.id ?? null,
      email: data.user?.email ?? correo,
    },
  });
}
