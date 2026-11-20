// Đọc/ghi truyện, chương, tác giả, cấu hình qua Backend (dùng cho trang admin).
import YAML from 'yaml';
import type { Backend, Change } from './backend';

export const PATHS = {
  stories: 'src/content/stories',
  chapters: 'src/content/chapters',
  covers: 'src/assets/covers',
  authors: 'src/content/authors',
  settings: 'src/data/settings.json',
};

export type Data = Record<string, any>;

export interface StoryRec {
  slug: string;
  file: string;
  data: Data;
  body: string;
}

export interface ChapterRec {
  file: string;
  data: Data;
  body: string;
}

export interface Settings {
  genres: { id: string; name: string; description: string }[];
  [k: string]: any;
}

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseMd(text: string): { data: Data; body: string } {
  const m = text.match(FM);
  if (!m) return { data: {}, body: text.trim() };
  return { data: (YAML.parse(m[1]) as Data) ?? {}, body: m[2].trim() };
}

// Giữ thứ tự khoá dễ đọc; khoá lạ (nếu có) để cuối
const STORY_KEYS = ['slug', 'title', 'description', 'cover', 'coverAlt', 'genres', 'tags', 'author', 'publishDate', 'updatedDate', 'status', 'featured', 'draft', 'seoTitle', 'seoDescription'];
const CHAPTER_KEYS = ['story', 'number', 'title', 'draft', 'seoDescription'];

export function stringifyMd(data: Data, body: string, order: string[]) {
  const ordered: Data = {};
  for (const k of [...order, ...Object.keys(data)]) {
    const v = data[k];
    if (k in ordered || v === undefined || v === null || v === '') continue;
    ordered[k] = v;
  }
  return `---\n${YAML.stringify(ordered, { lineWidth: 0 })}---\n\n${body.trim()}\n`;
}

/** Ngày dạng YYYY-MM-DD dù file lưu kiểu Date, ISO hay chuỗi ngày. */
export function dateOnly(v: unknown) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/** Đường dẫn file ảnh bìa trong repo, tính từ giá trị `cover` (tương đối với file truyện). */
export function coverPath(cover: unknown) {
  if (typeof cover !== 'string' || !cover) return null;
  const parts = PATHS.stories.split('/');
  for (const seg of cover.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export async function loadStories(b: Backend): Promise<StoryRec[]> {
  const files = (await b.listFiles(PATHS.stories)).filter((f) => f.endsWith('.md'));
  const stories = await Promise.all(
    files.map(async (file) => {
      const { data, body } = parseMd((await b.read(`${PATHS.stories}/${file}`)) ?? '');
      return { slug: (data.slug as string) || file.replace(/\.md$/, ''), file, data, body };
    }),
  );
  return stories.sort((a, b) => dateOnly(b.data.publishDate).localeCompare(dateOnly(a.data.publishDate)));
}

export async function countChapters(b: Backend, slug: string) {
  return (await b.listFiles(`${PATHS.chapters}/${slug}`)).filter((f) => f.endsWith('.md')).length;
}

export async function loadChapters(b: Backend, slug: string): Promise<ChapterRec[]> {
  const dir = `${PATHS.chapters}/${slug}`;
  const files = (await b.listFiles(dir)).filter((f) => f.endsWith('.md'));
  const list = await Promise.all(
    files.map(async (file) => {
      const { data, body } = parseMd((await b.read(`${dir}/${file}`)) ?? '');
      return { file, data, body };
    }),
  );
  return list.sort((a, b) => Number(a.data.number) - Number(b.data.number));
}

export async function loadSettings(b: Backend): Promise<Settings> {
  return JSON.parse((await b.read(PATHS.settings)) ?? '{"genres":[]}');
}

export async function loadAuthors(b: Backend) {
  const files = (await b.listFiles(PATHS.authors)).filter((f) => f.endsWith('.json'));
  return Promise.all(
    files.map(async (f) => ({ id: f.replace(/\.json$/, ''), ...(JSON.parse((await b.read(`${PATHS.authors}/${f}`)) ?? '{}') as { name: string }) })),
  );
}

/**
 * Local + dev server đang chạy: Astro giữ danh sách ảnh trong cache (.astro/content-assets.mjs)
 * nên xoá file ảnh sẽ gây lỗi 500 tới khi khởi động lại. Vì vậy ở local không xoá ảnh ngay;
 * scripts/clean-covers.mjs dọn ảnh thừa mỗi lần chạy `npm run dev`.
 */
export const canDeleteImages = (b: Backend) => b.kind !== 'local';

/** Tên file ảnh bìa có hậu tố phiên bản: đổi ảnh = đổi URL, trình duyệt/CDN không giữ ảnh cũ. */
export const coverFileName = (slug: string) => `${slug}-${Date.now().toString(36)}.webp`;

export async function saveStory(b: Backend, story: StoryRec, cover?: Blob | null, all: StoryRec[] = []) {
  const changes: Change[] = [];
  const cleanup: Change[] = [];
  if (cover) {
    const old = coverPath(story.data.cover);
    const name = coverFileName(story.slug);
    changes.push({ path: `${PATHS.covers}/${name}`, content: cover });
    story.data.cover = `../../assets/covers/${name}`;
    // Xoá ảnh cũ nếu không truyện nào khác dùng chung
    const shared = all.some((s) => s.slug !== story.slug && coverPath(s.data.cover) === old);
    if (canDeleteImages(b) && old?.startsWith(PATHS.covers + '/') && !shared) cleanup.push({ path: old, content: null });
  }
  story.data.slug = story.slug;
  changes.push({ path: `${PATHS.stories}/${story.file}`, content: stringifyMd(story.data, story.body, STORY_KEYS) });
  // Xoá ảnh cũ SAU khi file truyện đã trỏ sang ảnh mới (tránh dev server báo thiếu ảnh)
  await b.apply([...changes, ...cleanup], `content: update story "${story.slug}"`);
}

/** Xoá truyện + toàn bộ chương + ảnh bìa (nếu ảnh không dùng chung với truyện khác). */
export async function deleteStory(b: Backend, story: StoryRec, all: StoryRec[]) {
  const changes: Change[] = [
    { path: `${PATHS.stories}/${story.file}`, content: null },
    { path: `${PATHS.chapters}/${story.slug}`, content: null, dir: true },
  ];
  const cover = coverPath(story.data.cover);
  const shared = all.some((s) => s.slug !== story.slug && coverPath(s.data.cover) === cover);
  if (canDeleteImages(b) && cover && !shared) changes.push({ path: cover, content: null });
  await b.apply(changes, `content: delete story "${story.slug}"`);
}

export function chapterFileName(n: number) {
  return `chapter-${String(n).padStart(2, '0')}.md`;
}

export async function saveChapter(b: Backend, slug: string, ch: ChapterRec) {
  ch.data.story = slug;
  await b.apply(
    [{ path: `${PATHS.chapters}/${slug}/${ch.file}`, content: stringifyMd(ch.data, ch.body, CHAPTER_KEYS) }],
    `content: update "${slug}" chapter ${ch.data.number}`,
  );
}

export async function deleteChapter(b: Backend, slug: string, ch: ChapterRec) {
  await b.apply([{ path: `${PATHS.chapters}/${slug}/${ch.file}`, content: null }], `content: delete "${slug}" chapter ${ch.data.number}`);
}

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
