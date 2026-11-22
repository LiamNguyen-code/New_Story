// Sitemap tạo động từ database (truyện, chương, thể loại) + tin tức + trang tĩnh.
import type { APIRoute } from 'astro';
import { SITE } from '../site.config';
import { GENRES, chapterUrl, genreUrl, getChapters, getNews, getStories, newsUrl, storyUrl } from '../lib/content';

const STATIC = ['/', '/news/', '/genres/', '/about/', '/contact/', '/privacy/', '/terms/', '/dmca/'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const day = (d?: Date) => d?.toISOString().slice(0, 10);

export const GET: APIRoute = async () => {
  const [stories, news] = await Promise.all([getStories(), getNews()]);
  const urls: { loc: string; lastmod?: string }[] = STATIC.map((loc) => ({ loc }));

  for (const g of GENRES) if (stories.some((s) => s.data.genres.includes(g.id))) urls.push({ loc: genreUrl(g.id) });
  for (const s of stories) {
    const lastmod = day(s.data.updatedDate ?? s.data.publishDate);
    urls.push({ loc: storyUrl(s.id), lastmod });
    for (const c of await getChapters(s)) urls.push({ loc: chapterUrl(s.id, c.data.number), lastmod });
  }
  for (const n of news) urls.push({ loc: newsUrl(n.id), lastmod: day(n.data.updatedDate ?? n.data.publishDate) });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(new URL(u.loc, SITE.url).href)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
