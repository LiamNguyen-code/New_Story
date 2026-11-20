import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Mỗi truyện: src/content/stories/<slug>.md  (body = tóm tắt truyện)
const stories = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/stories' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().max(200),
      cover: image(),
      coverAlt: z.string().optional(),
      genres: z.array(z.string()).min(1),
      tags: z.array(z.string()).default([]),
      author: reference('authors'),
      publishDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      status: z.enum(['ongoing', 'completed']).default('completed'),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
      seoTitle: z.string().max(70).optional(),
      seoDescription: z.string().max(170).optional(),
    }),
});

// Mỗi chương: src/content/chapters/<story-slug>/chapter-NN.md
const chapters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/chapters' }),
  schema: z.object({
    story: reference('stories'),
    number: z.number().int().positive(),
    title: z.string(),
    draft: z.boolean().default(false),
    seoDescription: z.string().max(170).optional(),
  }),
});

const authors = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/authors' }),
  schema: z.object({
    name: z.string(),
    bio: z.string(),
  }),
});

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

export const collections = { stories, chapters, authors, news };
