import type { APIRoute } from 'astro';
import { SESSION_COOKIE, checkLogin, createSession } from '../../../lib/server/auth';
import { bad, ok } from '../../../lib/server/http';

// Chặn dò mật khẩu: tối đa 10 lần sai / 15 phút cho mỗi IP
const failures = new Map<string, { count: number; until: number }>();
const WINDOW = 15 * 60_000;

export const POST: APIRoute = async ({ request, cookies, clientAddress, url }) => {
  const ip = request.headers.get('X-Real-IP') ?? clientAddress;
  const f = failures.get(ip);
  if (f && f.until > Date.now() && f.count >= 10) return bad('Sai mật khẩu quá nhiều lần. Thử lại sau 15 phút.', 429);

  const { email, password } = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const user = email && password ? await checkLogin(email, password) : null;
  if (!user) {
    const cur = f && f.until > Date.now() ? f : { count: 0, until: Date.now() + WINDOW };
    failures.set(ip, { ...cur, count: cur.count + 1 });
    return bad('Email hoặc mật khẩu không đúng.', 401);
  }
  failures.delete(ip);

  const { token, expiresAt } = createSession(user.id);
  // Sau Nginx, app nhận http; Nginx báo giao thức thật qua X-Forwarded-Proto
  const https = url.protocol === 'https:' || request.headers.get('X-Forwarded-Proto') === 'https';
  cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: https, expires: expiresAt });
  return ok({ user });
};
