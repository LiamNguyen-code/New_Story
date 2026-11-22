import type { APIRoute } from 'astro';
import { SITE } from '../site.config';

export const GET: APIRoute = () =>
  new Response(
    `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /search/
Disallow: /api/

Sitemap: ${new URL('/sitemap.xml', SITE.url).href}
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
