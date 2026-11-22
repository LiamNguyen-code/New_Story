// Ghi 1 lượt xem. Trình duyệt gửi bằng navigator.sendBeacon sau khi người đọc mở trang được vài giây.
import type { APIRoute } from 'astro';
import { recordView } from '../../lib/server/views';

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|curl|wget|python|axios/i;
const noContent = () => new Response(null, { status: 204 });

export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  // Không đếm người quản trị đang đăng nhập và bot
  if (locals.user || BOT.test(request.headers.get('User-Agent') ?? '')) return noContent();
  const body = (await request.json().catch(() => null)) as { s?: unknown; c?: unknown; u?: unknown } | null;
  if (!body || typeof body.s !== 'string' || body.s.length > 200) return noContent();
  recordView({ slug: body.s, chapter: Number(body.c ?? 0), unique: body.u === 1, ip: request.headers.get('X-Real-IP') ?? clientAddress });
  return noContent();
};
