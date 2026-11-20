import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '../site.config';
import { getStories, storyUrl } from '../lib/content';

export async function GET(context: APIContext) {
  const stories = await getStories();
  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items: stories.slice(0, 50).map((s) => ({
      title: s.data.title,
      description: s.data.description,
      pubDate: s.data.publishDate,
      link: storyUrl(s.id),
      categories: s.data.genres,
    })),
    customData: `<language>${SITE.lang}</language>`,
  });
}
