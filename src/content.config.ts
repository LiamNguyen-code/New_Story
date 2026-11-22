import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Truyện, chương, tác giả nằm trong database SQLite (src/lib/server/). Tin tức vẫn là file markdown.

// Mỗi tin: src/content/news/<slug>.md  (body = nội dung bài, hỗ trợ ## tiêu đề, ảnh, bảng)
const news = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/news' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().max(200).optional(),
      cover: image(),
      coverAlt: z.string().optional(),
      category: z.string().optional(),
      publishDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      draft: z.boolean().default(false),
      seoTitle: z.string().max(70).optional(),
    }),
});

export const collections = { news };
