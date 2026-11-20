// Cloudflare Pages Function: API cho trang /admin/ khi site đã deploy.
// Người dùng đăng nhập bằng Cloudflare Access (mã OTP gửi về email); token GitHub chỉ nằm trên server.
//
// Biến môi trường (Pages → Settings → Variables and Secrets):
//   GITHUB_TOKEN        (Secret) token fine-grained, repo này, Contents: Read and write
//   GITHUB_REPO         user/repo
//   GITHUB_BRANCH       main
//   ACCESS_TEAM_DOMAIN  ten-team.cloudflareaccess.com
//   ACCESS_AUD          "Application Audience (AUD) Tag" của Access application bảo vệ /admin và /api/admin
//   DEV_ALLOW_EMAIL     CHỈ dùng khi test local (wrangler pages dev). Không đặt trên production.
//   GITHUB_API          (tuỳ chọn, để test) mặc định https://api.github.com
import { GitRepo, SKIP_BUILD, type GitChange } from '../../../src/lib/admin/github';

interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  DEV_ALLOW_EMAIL?: string;
  GITHUB_API?: string;
}

interface Ctx {
  request: Request;
  env: Env;
  params: { path?: string[] };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// ------------------------------------------------------------ Xác thực Cloudflare Access (JWT RS256)

const b64urlToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const b64urlToJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

let certCache: { at: number; keys: JsonWebKey[] & { kid?: string }[] } | null = null;

async function accessEmail(request: Request, env: Env): Promise<string | null> {
  if (env.DEV_ALLOW_EMAIL) return env.DEV_ALLOW_EMAIL;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;

  const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  const token = request.headers.get('Cf-Access-Jwt-Assertion') ?? cookie;
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const header = b64urlToJson(h);
  const payload = b64urlToJson(p);

  if (!certCache || Date.now() - certCache.at > 3600_000) {
    const res = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    certCache = { at: Date.now(), keys: ((await res.json()) as { keys: any[] }).keys };
  }
  const jwk = certCache.keys.find((k: any) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;

  const aud: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.exp * 1000 < Date.now()) return null;
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
  return payload.email ?? null;
}

// ------------------------------------------------------------ Routes

export const onRequest = async ({ request, env, params }: Ctx): Promise<Response> => {
  const email = await accessEmail(request, env);
  if (!email) return json({ error: 'Chưa đăng nhập (Cloudflare Access) hoặc API chưa được cấu hình.' }, 401);
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ error: 'Thiếu cấu hình GITHUB_TOKEN / GITHUB_REPO trên Cloudflare.' }, 500);

  const repo = new GitRepo({ repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH || 'main', token: env.GITHUB_TOKEN, api: env.GITHUB_API });
  const route = `${request.method} ${(params.path ?? []).join('/')}`;
  const url = new URL(request.url);

  try {
    switch (route) {
      case 'GET me':
        return json({ email, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH || 'main' });

      case 'GET tree': {
        await repo.load();
        return json({ files: Object.fromEntries(repo.tree) });
      }

      case 'GET blob': {
        // Blob theo sha → bất biến, cho phép trình duyệt cache lâu
        const sha = url.searchParams.get('sha') ?? '';
        if (!/^[0-9a-f]{40}$/.test(sha)) return json({ error: 'sha không hợp lệ' }, 400);
        const b64 = await repo.readBlobBase64(sha);
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, max-age=31536000, immutable' } });
      }

      case 'POST commit': {
        const body = (await request.json()) as { changes: GitChange[]; message: string };
        if (!Array.isArray(body.changes) || !body.changes.length) return json({ error: 'Không có thay đổi' }, 400);
        // Chỉ cho phép sửa nội dung truyện, không cho sửa code
        const allowed = /^(src\/content\/|src\/assets\/covers\/)/;
        const bad = body.changes.find((c) => !allowed.test(c.path) || c.path.includes('..'));
        if (bad) return json({ error: `Không được phép sửa: ${bad.path}` }, 403);
        await repo.commit(body.changes, `${String(body.message).slice(0, 200)}\n\nby ${email} ${SKIP_BUILD}`);
        return json({ files: Object.fromEntries(repo.tree) });
      }

      case 'GET pending':
        return json({ pending: await repo.pending() });

      case 'POST publish':
        await repo.publish(`publish: đăng nội dung lên site\n\nby ${email}`);
        return json({ ok: true });

      default:
        return json({ error: 'Not found' }, 404);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
};
