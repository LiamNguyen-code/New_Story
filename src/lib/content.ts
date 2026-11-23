import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import settings from '../data/settings.json';
import { db, schema } from './server/db';
import { vnDay } from './server/views';

const { stories: S, chapters: C, authors: A, users: U } = schema;

export interface StoryData {
  title: string;
  description: string;
  /** Tên gốc ảnh bìa, xem coverUrl() */
  cover: string;
  coverAlt?: string;
  genres: string[];
  tags: string[];
  author?: string;
  publishDate: Date;
  updatedDate?: Date;
  status: 'ongoing' | 'completed';
  featured: boolean;
  draft: boolean;
  seoTitle?: string;
  seoDescription?: string;
}

/** Truyện: id = slug, body = tóm tắt (markdown). */
export interface Story {
  id: string;
  dbId: number;
  /** Tài khoản đăng truyện (tác giả) */
  ownerId: number | null;
  data: StoryData;
  body: string;
}

/** Chương: body chỉ có khi lấy 1 chương (getChapter). */
export interface Chapter {
  id: number;
  data: { number: number; title: string; draft: boolean; seoDescription?: string };
  wordCount: number;
  body?: string;
}

// Ngày đăng lưu theo giờ Việt Nam (vnDay) nên so sánh cũng theo giờ Việt Nam,
// nếu dùng ngày UTC thì bài đăng từ 0h–7h sáng bị ẩn tới 7h
const today = () => vnDay();
// Dev hiện cả nháp; truyện hẹn giờ chỉ hiện khi tới ngày
const storyVisible = () => (import.meta.env.DEV ? lte(S.publishDate, today()) : and(eq(S.draft, false), lte(S.publishDate, today())));
const chapterVisible = () => (import.meta.env.DEV ? undefined : eq(C.draft, false));

const toStory = (r: typeof S.$inferSelect): Story => ({
  id: r.slug,
  dbId: r.id,
  ownerId: r.ownerId,
  body: r.summary,
  data: {
    title: r.title,
    description: r.description,
    cover: r.cover,
    coverAlt: r.coverAlt || undefined,
    genres: r.genres,
    tags: r.tags,
    author: r.authorId ?? undefined,
    publishDate: new Date(r.publishDate),
    updatedDate: r.updatedDate ? new Date(r.updatedDate) : undefined,
    status: r.status,
    featured: r.featured,
    draft: r.draft,
    seoTitle: r.seoTitle || undefined,
    seoDescription: r.seoDescription || undefined,
  },
});

/** Truyện đã xuất bản (bỏ nháp và truyện hẹn giờ chưa tới ngày), mới nhất trước. */
export async function getStories(): Promise<Story[]> {
  return db.select().from(S).where(storyVisible()).orderBy(desc(S.publishDate), desc(S.id)).all().map(toStory);
}


export async function getStory(slug: string): Promise<Story | null> {
  const row = db.select().from(S).where(and(eq(S.slug, slug), storyVisible())).get();
  return row ? toStory(row) : null;
}

/** Danh sách chương đã xuất bản của 1 truyện (không kèm nội dung), theo số chương. */
export async function getChapters(story: Story): Promise<Chapter[]> {
  return db
    .select({ id: C.id, number: C.number, title: C.title, draft: C.draft, seoDescription: C.seoDescription, wordCount: C.wordCount })
    .from(C)
    .where(and(eq(C.storyId, story.dbId), chapterVisible()))
    .orderBy(asc(C.number))
    .all()
    .map((r) => ({ id: r.id, wordCount: r.wordCount, data: { number: r.number, title: r.title, draft: r.draft, seoDescription: r.seoDescription || undefined } }));
}

export async function getChapterBody(chapter: Chapter): Promise<string> {
  return db.select({ body: C.body }).from(C).where(eq(C.id, chapter.id)).get()?.body ?? '';
}

/** Tìm truyện theo tên, mô tả, tóm tắt, tag, tên/nội dung chương. */
export async function searchStories(q: string): Promise<Story[]> {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  const conds = words.map((w) => {
    const like = `%${w.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    return sql`(lower(${S.title} || ' ' || ${S.description} || ' ' || ${S.summary} || ' ' || ${S.tags}) like ${like} escape '\\'
      or exists (select 1 from ${C} where ${C.storyId} = ${S.id} and lower(${C.title} || ' ' || ${C.body}) like ${like} escape '\\'))`;
  });
  return db
    .select()
    .from(S)
    .where(and(storyVisible(), ...conds))
    .orderBy(desc(S.publishDate))
    .limit(50)
    .all()
    .map(toStory);
}

/**
 * Tên tác giả = tên tài khoản đã đăng bài (truyện / tin).
 * Bài của tài khoản đã xoá: dùng tác giả cũ trong bảng authors (nếu có).
 */
export function getAuthorName(ownerId: number | null, legacyAuthorId?: string): string | null {
  if (ownerId !== null) {
    const u = db.select({ name: U.name }).from(U).where(eq(U.id, ownerId)).get();
    if (u?.name) return u.name;
  }
  return legacyAuthorId ? (db.select({ name: A.name }).from(A).where(eq(A.id, legacyAuthorId)).get()?.name ?? null) : null;
}

export { renderMarkdown } from './markdown';

// ------------------------------------------------------------ Ảnh bìa (uploads/covers)

export const coverUrl = (name: string, width: 240 | 480 | 800 | 1200 = 800) => `/uploads/covers/${name}-${width}.webp`;
export const coverSrcset = (name: string, widths: number[]) => widths.map((w) => `/uploads/covers/${name}-${w}.webp ${w}w`).join(', ');
/** Ảnh OG 1200x630 dạng JPG (Facebook/Zalo hiển thị ổn định nhất với JPG). */
export const ogImageUrl = (name: string) => `/uploads/covers/${name}-og.jpg`;

// ------------------------------------------------------------ Tin tức

/** Tin: id = slug, body = nội dung markdown */
export interface News {
  id: string;
  body: string;
  /** Tài khoản đăng tin (tác giả) */
  ownerId: number | null;
  data: {
    title: string;
    description?: string;
    cover: string;
    coverAlt?: string;
    category?: string;
    publishDate: Date;
    updatedDate?: Date;
    draft: boolean;
    seoTitle?: string;
  };
}

const N = schema.news;
const newsVisible = () => (import.meta.env.DEV ? lte(N.publishDate, today()) : and(eq(N.draft, false), lte(N.publishDate, today())));

const toNews = (r: typeof N.$inferSelect): News => ({
  id: r.slug,
  body: r.body,
  ownerId: r.ownerId,
  data: {
    title: r.title,
    description: r.description || undefined,
    cover: r.cover,
    coverAlt: r.coverAlt || undefined,
    category: r.category || undefined,
    publishDate: new Date(r.publishDate),
    updatedDate: r.updatedDate ? new Date(r.updatedDate) : undefined,
    draft: r.draft,
    seoTitle: r.seoTitle || undefined,
  },
});

/** Tin tức đã xuất bản (bỏ nháp và tin hẹn giờ chưa tới ngày), mới nhất trước. */
export async function getNews(): Promise<News[]> {
  return db.select().from(N).where(newsVisible()).orderBy(desc(N.publishDate), desc(N.id)).all().map(toNews);
}

export async function getNewsItem(slug: string): Promise<News | null> {
  const row = db.select().from(N).where(and(eq(N.slug, slug), newsVisible())).get();
  return row ? toNews(row) : null;
}

export const newsUrl = (slug: string) => `/news/${slug}/`;
export const NEWS_PER_PAGE = 10;

export const GENRES = settings.genres;
export const genreName = (id: string) => GENRES.find((g) => g.id === id)?.name ?? id;

export const storyUrl = (slug: string) => `/story/${slug}/`;
export const chapterUrl = (slug: string, n: number) => `/story/${slug}/chapter-${n}/`;
export const genreUrl = (id: string) => `/genre/${id}/`;
export const tagUrl = (tag: string) => `/tag/${slugify(tag)}/`;

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Lấy đoạn trích sạch từ markdown, cắt tại ranh giới câu/từ. */
export function excerpt(markdown: string, max = 155) {
  const text = markdown
    .replace(/[#*_>`\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf('. ');
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

export function readingMinutes(markdown = '') {
  return Math.max(1, Math.round(markdown.split(/\s+/).length / 230));
}

export const minutesFromWords = (words: number) => Math.max(1, Math.round(words / 230));

export const formatLongDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export const formatDate = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
