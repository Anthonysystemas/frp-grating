import { createClient } from '@supabase/supabase-js';

const ADMIN_SESSION_COOKIE = 'admin_session';

function obtenerCookie(request: Request, nombre: string): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  for (const parte of cookieHeader.split(';')) {
    const [clave, ...valor] = parte.trim().split('=');
    if (clave === nombre) return decodeURIComponent(valor.join('='));
  }

  return null;
}

function noAutorizado(request: Request, pathname: string): Response {
  if (pathname.startsWith('/api/admin')) {
    return new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return Response.redirect(new URL('/admin/login', request.url), 307);
}

export default async function middleware(request: Request) {
  const { pathname } = new URL(request.url);

  // El login debe ser accesible sin sesión.
  if (pathname === '/admin/login' || pathname === '/api/admin/login') {
    return;
  }

  const token = obtenerCookie(request, ADMIN_SESSION_COOKIE);
  if (!token) {
    return noAutorizado(request, pathname);
  }

  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Middleware admin] Faltan variables de entorno de Supabase');
    return noAutorizado(request, pathname);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return noAutorizado(request, pathname);
  }

  return;
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
};
