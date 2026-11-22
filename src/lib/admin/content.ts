// Gọi API /api/admin từ trang admin (chạy trên trình duyệt). Dữ liệu nằm trong SQLite trên server.
import type { ChapterDTO, StoryDTO } from '../server/admin';

export type StoryRec = StoryDTO;
/** id không có = chương mới chưa lưu */
export type ChapterRec = Omit<ChapterDTO, 'id'> & { id?: number };

export interface Settings {
  genres: { id: string; name: string; description: string }[];
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'editor';
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const json = typeof init.body === 'string';
  // trailingSlash: 'always' áp dụng cả cho API → luôn có dấu / ở cuối
  const res = await fetch(`/api/${path}/`, {
    credentials: 'same-origin',
    ...init,
    headers: json ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (res.status === 401 && path.startsWith('admin/')) {
    location.href = `/admin/login/?next=${encodeURIComponent(location.pathname + location.hash)}`;
  }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

const send = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

/** Gửi multipart: data (JSON) + cover (ảnh, nếu có) */
function form(data: unknown, cover?: Blob | null) {
  const fd = new FormData();
  fd.set('data', JSON.stringify(data));
  if (cover) fd.set('cover', cover, 'cover.webp');
  return fd;
}

export const loadData = () =>
  api<{
    user: AdminUser;
    stories: StoryRec[];
    authors: { id: string; name: string }[];
    genres: Settings['genres'];
    /** Chỉ có khi đăng nhập bằng admin */
    users: { id: number; name: string; email: string }[];
  }>('admin/data');

export async function loadChapters(slug: string): Promise<ChapterDTO[]> {
  return (await api<{ chapters: ChapterDTO[] }>(`admin/stories/${encodeURIComponent(slug)}/chapters`)).chapters;
}

export interface NewStory {
  slug: string;
  overwrite?: boolean;
  body: string;
  data: Omit<StoryRec['data'], 'cover' | 'updatedDate' | 'seoTitle' | 'seoDescription'>;
  chapters: { number: number; title: string; body: string }[];
}

export const createStory = (story: NewStory, cover: Blob) => api('admin/stories', { method: 'POST', body: form(story, cover) });

export const saveStory = (story: StoryRec, cover?: Blob | null) =>
  api(`admin/stories/${encodeURIComponent(story.slug)}`, { method: 'PUT', body: form({ data: story.data, body: story.body, ownerId: story.ownerId }, cover) });

export const deleteStory = (story: StoryRec) => api(`admin/stories/${encodeURIComponent(story.slug)}`, { method: 'DELETE' });

export function saveChapter(slug: string, ch: ChapterRec) {
  const payload = { data: ch.data, body: ch.body };
  return ch.id ? api(`admin/chapters/${ch.id}`, send('PUT', payload)) : addChapters(slug, [payload]);
}

export const addChapters = (slug: string, chapters: Omit<ChapterRec, 'id'>[]) => api(`admin/stories/${encodeURIComponent(slug)}/chapters`, send('POST', { chapters }));

export const deleteChapter = (ch: ChapterDTO) => api(`admin/chapters/${ch.id}`, { method: 'DELETE' });

export const logout = async () => {
  await api('auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/admin/login/';
};

/** Ảnh bìa đã upload (bản rộng 480px, đủ cho ảnh nhỏ trong admin) */
export const coverThumb = (name: string, width = 480) => (name ? `/uploads/covers/${name}-${width}.webp` : '');

/** Ngày dạng YYYY-MM-DD dù lưu kiểu Date, ISO hay chuỗi ngày. */
export function dateOnly(v: unknown) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
