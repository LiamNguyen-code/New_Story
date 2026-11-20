import { getCollection, type CollectionEntry } from 'astro:content';
import settings from '../data/settings.json';

export type Story = CollectionEntry<'stories'>;
export type Chapter = CollectionEntry<'chapters'>;

const isVisible = (draft: boolean, date?: Date) =>
  (import.meta.env.DEV || !draft) && (!date || date.getTime() <= Date.now());

/** Truyện đã xuất bản (bỏ nháp và truyện hẹn giờ chưa tới ngày), mới nhất trước. */
export async function getStories(): Promise<Story[]> {
  const all = await getCollection('stories', ({ data }) => isVisible(data.draft, data.publishDate));
  return all.sort((a, b) => b.data.publishDate.getTime() - a.data.publishDate.getTime());
}

export type News = CollectionEntry<'news'>;

/** Tin tức đã xuất bản, mới nhất trước. */
export async function getNews(): Promise<News[]> {
  const all = await getCollection('news', ({ data }) => isVisible(data.draft, data.publishDate));
  return all.sort((a, b) => b.data.publishDate.getTime() - a.data.publishDate.getTime());
}

export const newsUrl = (slug: string) => `/news/${slug}/`;
export const NEWS_PER_PAGE = 10;

/** Toàn bộ chương đã xuất bản, nhóm theo slug truyện, sắp theo số chương. */
export async function getChaptersByStory(): Promise<Map<string, Chapter[]>> {
  const all = await getCollection('chapters', ({ data }) => isVisible(data.draft));
  const map = new Map<string, Chapter[]>();
  for (const ch of all) {
    const list = map.get(ch.data.story.id) ?? [];
    list.push(ch);
    map.set(ch.data.story.id, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.data.number - b.data.number);
  return map;
}

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

export const formatLongDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export const formatDate = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
