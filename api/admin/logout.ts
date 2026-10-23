import type { VercelRequest, VercelResponse } from '@vercel/node';

const ADMIN_SESSION_COOKIE = 'admin_session';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
  );
  res.setHeader('Cache-Control', 'no-store');

  return res.status(200).json({ ok: true });
}
