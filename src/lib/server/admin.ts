// Thao tác dữ liệu cho trang admin: kiểm tra đầu vào + đọc/ghi truyện, chương, tài khoản.
import { and, asc, count, desc, eq, ne } from 'drizzle-orm';
import settings from '../../data/settings.json';
import { hashPassword, normalizeEmail, validatePassword, type User } from './auth';
import { db, schema } from './db';
import { InputError } from './http';
import { deleteCover, saveCover } from './images';

const { stories: S, chapters: C, authors: A, users: U } = schema;

// ------------------------------------------------------------ Kiểu dữ liệu gửi cho trình duyệt

export interface StoryDTO {
  slug: string;
  chapterCount: number;
  /** Tóm tắt (markdown) */
  body: string;
  data: {
    title: string;
    description: string;
    cover: string;
    coverAlt: string;
    genres: string[];
    tags: string[];
    author: string;
    publishDate: string;
    updatedDate: string;
    status: 'ongoing' | 'completed';
    featured: boolean;
    draft: boolean;
    seoTitle: string;
    seoDescription: string;
  };
}

export interface ChapterDTO {
  id: number;
  data: { number: number; title: string; draft: boolean; seoDescription: string };
  body: string;
}

const toDTO = (r: typeof S.$inferSelect, chapterCount: number): StoryDTO => ({
  slug: r.slug,
  chapterCount,
  body: r.summary,
  data: {
    title: r.title,
    description: r.description,
    cover: r.cover,
    coverAlt: r.coverAlt ?? '',
    genres: r.genres,
    tags: r.tags,
    author: r.authorId ?? '',
    publishDate: r.publishDate,
    updatedDate: r.updatedDate ?? '',
    status: r.status,
    featured: r.featured,
    draft: r.draft,
    seoTitle: r.seoTitle ?? '',
    seoDescription: r.seoDescription ?? '',
  },
});

export function listStories(): StoryDTO[] {
  const counts = new Map(
    db
      .select({ storyId: C.storyId, n: count() })
      .from(C)
      .groupBy(C.storyId)
      .all()
      .map((r) => [r.storyId, r.n]),
  );
  return db
    .select()
    .from(S)
    .orderBy(desc(S.publishDate), desc(S.id))
    .all()
    .map((r) => toDTO(r, counts.get(r.id) ?? 0));
}

export const listAuthors = () => db.select({ id: A.id, name: A.name }).from(A).orderBy(asc(A.name)).all();

function findStory(slug: string) {
  const story = db.select().from(S).where(eq(S.slug, slug)).get();
  if (!story) throw new InputError('Không tìm thấy truyện.', 404);
  return story;
}

export function listChapters(slug: string): ChapterDTO[] {
  const story = findStory(slug);
  return db
    .select()
    .from(C)
    .where(eq(C.storyId, story.id))
    .orderBy(asc(C.number))
    .all()
    .map((c) => ({ id: c.id, body: c.body, data: { number: c.number, title: c.title, draft: c.draft, seoDescription: c.seoDescription ?? '' } }));
}

// ------------------------------------------------------------ Kiểm tra đầu vào

const str = (v: unknown, max = 100_000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 100)).filter(Boolean) : []);
const today = () => new Date().toISOString().slice(0, 10);
const GENRE_IDS = new Set(settings.genres.map((g) => g.id));
export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

function storyValues(input: Record<string, any>) {
  const d = (input.data ?? {}) as Record<string, unknown>;
  const v = {
    title: str(d.title, 300),
    description: str(d.description),
    summary: str(input.body),
    coverAlt: str(d.coverAlt, 300) || null,
    genres: strList(d.genres).filter((g) => GENRE_IDS.has(g)),
    tags: [...new Set(strList(d.tags))],
    authorId: str(d.author, 100) || null,
    publishDate: str(d.publishDate, 10),
    status: d.status === 'ongoing' ? ('ongoing' as const) : ('completed' as const),
    featured: !!d.featured,
    draft: !!d.draft,
    seoTitle: str(d.seoTitle) || null,
    seoDescription: str(d.seoDescription) || null,
  };
  if (!v.title) throw new InputError('Chưa nhập tên truyện.');
  if (!v.description) throw new InputError('Chưa nhập mô tả ngắn.');
  if (v.description.length > 200) throw new InputError('Mô tả ngắn tối đa 200 ký tự.');
  if (!v.genres.length) throw new InputError('Chọn ít nhất 1 thể loại.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.publishDate)) throw new InputError('Ngày đăng không hợp lệ.');
  if ((v.seoTitle?.length ?? 0) > 70) throw new InputError('Tiêu đề SEO tối đa 70 ký tự.');
  if ((v.seoDescription?.length ?? 0) > 170) throw new InputError('Mô tả SEO tối đa 170 ký tự.');
  if (v.authorId && !db.select().from(A).where(eq(A.id, v.authorId)).get()) v.authorId = null;
  return v;
}

function chapterValues(d: Record<string, unknown>, body: unknown) {
  const v = {
    number: Number(d.number),
    title: str(d.title, 300),
    body: str(body).replace(/\r\n?/g, '\n'),
    draft: !!d.draft,
    seoDescription: str(d.seoDescription) || null,
  };
  if (!Number.isInteger(v.number) || v.number < 1) throw new InputError('Số chương phải là số nguyên ≥ 1.');
  if (!v.title) throw new InputError(`Chương ${v.number}: chưa có tên chương.`);
  if (!v.body) throw new InputError(`Chương ${v.number}: chưa có nội dung.`);
  if ((v.seoDescription?.length ?? 0) > 170) throw new InputError('Mô tả SEO tối đa 170 ký tự.');
  return { ...v, wordCount: wordCount(v.body) };
}

async function readCover(file: File | null) {
  if (!file || !file.size) return null;
  if (file.size > 15 * 1024 * 1024) throw new InputError('Ảnh bìa quá lớn (tối đa 15MB).');
  return Buffer.from(await file.arrayBuffer());
}

// ------------------------------------------------------------ Truyện

/**
 * Tạo truyện mới (kèm các chương nếu có). overwrite = true: ghi đè truyện cùng slug, xoá chương cũ.
 * Truyện không có chương nào được lưu dạng nháp để không hiện trang trống trên site.
 */
export async function createStory(input: Record<string, any>, coverFile: File | null) {
  const slug = str(input.slug, 100);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new InputError('Slug chỉ gồm chữ thường a-z, số và dấu gạch ngang.');
  const values = storyValues(input);
  const chapters = (Array.isArray(input.chapters) ? input.chapters : []).map((c: any, i: number) => chapterValues({ number: i + 1, ...c }, c.body));
  if (!chapters.length) values.draft = true;
  const existing = db.select().from(S).where(eq(S.slug, slug)).get();
  if (existing && !input.overwrite) throw new InputError(`Slug "${slug}" đã có truyện khác dùng.`, 409);

  const cover = await readCover(coverFile);
  if (!cover) throw new InputError('Chưa chọn ảnh bìa.');
  const coverName = await saveCover(cover, slug);
  try {
    db.transaction((tx) => {
      let id: number;
      if (existing) {
        tx.update(S).set({ ...values, cover: coverName, updatedDate: today(), updatedAt: new Date() }).where(eq(S.id, existing.id)).run();
        tx.delete(C).where(eq(C.storyId, existing.id)).run();
        id = existing.id;
      } else {
        id = tx.insert(S).values({ ...values, slug, cover: coverName }).returning({ id: S.id }).get().id;
      }
      if (chapters.length) tx.insert(C).values(chapters.map((c: ReturnType<typeof chapterValues>) => ({ ...c, storyId: id }))).run();
    });
  } catch (e) {
    await deleteCover(coverName);
    throw e;
  }
  if (existing) await deleteCover(existing.cover);
  return slug;
}

export async function updateStory(slug: string, input: Record<string, any>, coverFile: File | null) {
  const story = findStory(slug);
  const values = storyValues(input);
  const cover = await readCover(coverFile);
  const coverName = cover ? await saveCover(cover, slug) : story.cover;
  db.update(S)
    .set({ ...values, cover: coverName, updatedDate: today(), updatedAt: new Date() })
    .where(eq(S.id, story.id))
    .run();
  if (cover) await deleteCover(story.cover);
}

export async function deleteStory(slug: string) {
  const story = findStory(slug);
  db.delete(S).where(eq(S.id, story.id)).run(); // chương tự xoá theo (ON DELETE CASCADE)
  await deleteCover(story.cover);
}

// ------------------------------------------------------------ Chương

function assertNumberFree(storyId: number, number: number, exceptId?: number) {
  const dupe = db
    .select({ id: C.id })
    .from(C)
    .where(and(eq(C.storyId, storyId), eq(C.number, number), exceptId ? ne(C.id, exceptId) : undefined))
    .get();
  if (dupe) throw new InputError(`Đã có chương số ${number}.`, 409);
}

/** Thêm 1 hoặc nhiều chương vào truyện. */
export function addChapters(slug: string, list: unknown) {
  const story = findStory(slug);
  if (!Array.isArray(list) || !list.length) throw new InputError('Không có chương nào để thêm.');
  const rows = list.map((c: any) => chapterValues(c.data ?? c, c.body));
  const numbers = rows.map((r) => r.number);
  if (new Set(numbers).size !== numbers.length) throw new InputError('Có số chương bị trùng.');
  for (const n of numbers) assertNumberFree(story.id, n);
  const ids = db.transaction((tx) => {
    const out = tx
      .insert(C)
      .values(rows.map((r) => ({ ...r, storyId: story.id })))
      .returning({ id: C.id })
      .all();
    tx.update(S).set({ updatedDate: today(), updatedAt: new Date() }).where(eq(S.id, story.id)).run();
    return out;
  });
  return ids.map((r) => r.id);
}

export function updateChapter(id: number, input: Record<string, any>) {
  const ch = db.select().from(C).where(eq(C.id, id)).get();
  if (!ch) throw new InputError('Không tìm thấy chương.', 404);
  const values = chapterValues(input.data ?? {}, input.body);
  assertNumberFree(ch.storyId, values.number, id);
  db.update(C)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(C.id, id))
    .run();
}

export function deleteChapter(id: number) {
  const res = db.delete(C).where(eq(C.id, id)).run();
  if (!res.changes) throw new InputError('Không tìm thấy chương.', 404);
}

// ------------------------------------------------------------ Tài khoản

export const listUsers = () => db.select({ id: U.id, email: U.email, name: U.name, role: U.role, createdAt: U.createdAt }).from(U).orderBy(asc(U.id)).all();

export function requireAdmin(user: User | null) {
  if (user?.role !== 'admin') throw new InputError('Chỉ quản trị viên (admin) mới làm được việc này.', 403);
}

export async function createUser(input: Record<string, unknown>) {
  const email = normalizeEmail(str(input.email, 200));
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Email không hợp lệ.');
  const pwError = validatePassword(password);
  if (pwError) throw new InputError(pwError);
  if (db.select().from(U).where(eq(U.email, email)).get()) throw new InputError('Email này đã có tài khoản.', 409);
  const role = input.role === 'admin' ? 'admin' : 'editor';
  return db
    .insert(U)
    .values({ email, name: str(input.name, 100), role, passwordHash: await hashPassword(password) })
    .returning({ id: U.id })
    .get().id;
}

/** Sửa tên / quyền / đặt lại mật khẩu (các trường không gửi thì giữ nguyên). */
export async function updateUser(id: number, input: Record<string, unknown>) {
  const user = db.select().from(U).where(eq(U.id, id)).get();
  if (!user) throw new InputError('Không tìm thấy tài khoản.', 404);
  const set: Partial<typeof U.$inferInsert> = { updatedAt: new Date() };
  if (typeof input.name === 'string') set.name = str(input.name, 100);
  if (input.role === 'admin' || input.role === 'editor') {
    if (user.role === 'admin' && input.role === 'editor') assertNotLastAdmin(id);
    set.role = input.role;
  }
  if (typeof input.password === 'string' && input.password) {
    const pwError = validatePassword(input.password);
    if (pwError) throw new InputError(pwError);
    set.passwordHash = await hashPassword(input.password);
  }
  db.update(U).set(set).where(eq(U.id, id)).run();
}

export function deleteUser(id: number) {
  const user = db.select().from(U).where(eq(U.id, id)).get();
  if (!user) throw new InputError('Không tìm thấy tài khoản.', 404);
  if (user.role === 'admin') assertNotLastAdmin(id);
  db.delete(U).where(eq(U.id, id)).run();
}

function assertNotLastAdmin(id: number) {
  const others = db
    .select({ n: count() })
    .from(U)
    .where(and(eq(U.role, 'admin'), ne(U.id, id)))
    .get();
  if (!others?.n) throw new InputError('Phải còn ít nhất 1 tài khoản admin.');
}
