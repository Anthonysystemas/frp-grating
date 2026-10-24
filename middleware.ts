import { createClient } from '@supabase/supabase-js';
import { next } from '@vercel/functions';

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

function cookieEliminada(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

function respuestaNoAutorizada(
  request: Request,
  pathname: string,
  opciones: { limpiarCookie?: boolean; expirada?: boolean; prohibido?: boolean } = {},
): Response {
  const headers = new Headers();

  if (opciones.limpiarCookie) {
    headers.set('Set-Cookie', cookieEliminada());
  }

  if (pathname.startsWith('/api/admin')) {
    headers.set('Content-Type', 'application/json');
    return new Response(
      JSON.stringify({
        ok: false,
        error: opciones.prohibido ? 'Correo no autorizado' : 'No autorizado',
      }),
      {
        status: opciones.prohibido ? 403 : 401,
        headers,
      },
    );
  }

  const destino = opciones.prohibido
    ? '/admin/login?unauthorized=true'
    : opciones.expirada
      ? '/admin/login?expired=true'
      : '/admin/login';

  headers.set('Location', new URL(destino, request.url).toString());
  return new Response(null, { status: 307, headers });
}

export default async function middleware(request: Request) {
  const { pathname } = new URL(request.url);

  // Login y logout deben ser accesibles sin sesión.
  if (
    pathname === '/admin/login' ||
    pathname === '/api/admin/login' ||
    pathname === '/api/admin/logout'
  ) {
    return next();
  }

  const token = obtenerCookie(request, ADMIN_SESSION_COOKIE);
  if (!token) {
    return respuestaNoAutorizada(request, pathname);
  }

  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Middleware admin] Faltan variables de entorno de Supabase');
    return respuestaNoAutorizada(request, pathname);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return respuestaNoAutorizada(request, pathname, {
      limpiarCookie: true,
      expirada: true,
    });
  }

  const correosAutorizados = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((correo) => correo.trim().toLowerCase())
    .filter(Boolean);

  const correoUsuario = (data.user.email ?? '').trim().toLowerCase();

  if (correosAutorizados.length === 0) {
    console.error('[Middleware admin] ADMIN_EMAILS no está configurada');
    return respuestaNoAutorizada(request, pathname, {
      limpiarCookie: true,
      prohibido: true,
    });
  }

  if (!correoUsuario || !correosAutorizados.includes(correoUsuario)) {
    return respuestaNoAutorizada(request, pathname, {
      limpiarCookie: true,
      prohibido: true,
    });
  }

  return next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
  runtime: 'nodejs',
};
