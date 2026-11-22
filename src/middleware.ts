// - /uploads/*: trả ảnh từ <DATA_DIR>/uploads (trên VPS nên để Nginx phục vụ thẳng thư mục này)
// - /admin/*, /api/admin/*: bắt buộc đăng nhập
import { defineMiddleware } from 'astro:middleware';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { SESSION_COOKIE, getSessionUser } from './lib/server/auth';
import { UPLOAD_DIR } from './lib/server/db';

const MIME: Record<string, string> = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

async function serveUpload(pathname: string) {
  const file = resolve(UPLOAD_DIR, decodeURIComponent(pathname.slice('/uploads/'.length)));
  const type = MIME[extname(file).toLowerCase()];
  if (!file.startsWith(UPLOAD_DIR + sep) || !type) return new Response('Not found', { status: 404 });
  try {
    return new Response(await readFile(file), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

const json = (data: unknown, status: number) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  if (pathname.startsWith('/uploads/')) return serveUpload(pathname);

  const isApi = pathname.startsWith('/api/');
  if (isApi && !['GET', 'HEAD'].includes(ctx.request.method)) {
    // Chống CSRF: request ghi dữ liệu phải đến từ chính site.
    // So theo host (không so giao thức): sau Nginx, app nhận http dù trình duyệt dùng https.
    const origin = ctx.request.headers.get('Origin');
    const host = ctx.request.headers.get('X-Forwarded-Host') ?? ctx.request.headers.get('Host') ?? ctx.url.host;
    if (origin && URL.canParse(origin) && new URL(origin).host !== host) return json({ error: 'Origin không hợp lệ.' }, 403);
  }

  if (ctx.isPrerendered) return next();
  ctx.locals.user = getSessionUser(ctx.cookies.get(SESSION_COOKIE)?.value);

  const isAdminPage = pathname.startsWith('/admin/') && pathname !== '/admin/login/';
  if (isAdminPage && !ctx.locals.user) return ctx.redirect(`/admin/login/?next=${encodeURIComponent(pathname + ctx.url.search)}`);
  if (pathname.startsWith('/api/admin/') && !ctx.locals.user) return json({ error: 'Phiên đăng nhập đã hết hạn. Hãy tải lại trang để đăng nhập.' }, 401);

  const res = await next();
  if (isAdminPage || isApi) res.headers.set('Cache-Control', 'no-store');
  return res;
});
