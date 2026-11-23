// Thao tác dữ liệu cho trang admin: kiểm tra đầu vào + đọc/ghi truyện, chương, tài khoản.
import { and, asc, count, desc, eq, ne } from 'drizzle-orm';
import settings from '../../data/settings.json';
import { hashPassword, normalizeEmail, validatePassword, type User } from './auth';
import { db, schema } from './db';
import { InputError } from './http';
import { deleteCover, saveCover } from './images';
import { vnDay } from './views';

const { stories: S, chapters: C, authors: A, users: U } = schema;

// ------------------------------------------------------------ Kiểu dữ liệu gửi cho trình duyệt

export interface StoryDTO {
  slug: string;
  chapterCount: number;
  /** Tài khoản đăng truyện = tác giả hiển thị trên site */
  ownerId: number | null;
  ownerName: string;
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

const toDTO = (r: typeof S.$inferSelect, chapterCount: number, names: Map<number, string>): StoryDTO => ({
  slug: r.slug,
  chapterCount,
  ownerId: r.ownerId,
  ownerName: r.ownerId === null ? '' : (names.get(r.ownerId) ?? ''),
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

/** Tên hiển thị của các tài khoản (tên, không có thì email) */
export const userNames = () => new Map(db.select({ id: U.id, name: U.name, email: U.email }).from(U).all().map((u) => [u.id, u.name || u.email]));

/** Biên tập viên chỉ xem / sửa / xoá được bài do mình đăng; admin được tất cả. */
export function assertCanEdit(ownerId: number | null, user: User) {
  if (user.role !== 'admin' && ownerId !== user.id) throw new InputError('Bạn chỉ sửa được bài do mình đăng.', 403);
}

/** Truyện trong admin: admin thấy tất cả, biên tập viên chỉ thấy truyện của mình. */
export function listStories(user: User): StoryDTO[] {
  const names = userNames();
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
    .where(user.role === 'admin' ? undefined : eq(S.ownerId, user.id))
    .orderBy(desc(S.publishDate), desc(S.id))
    .all()
    .map((r) => toDTO(r, counts.get(r.id) ?? 0, names));
}

/** Slug của mọi truyện, hoặc chỉ của 1 người (để form thêm truyện tránh trùng / biết truyện nào được ghi đè) */
export const listSlugs = (ownerId?: number) =>
  db
    .select({ slug: S.slug })
    .from(S)
    .where(ownerId === undefined ? undefined : eq(S.ownerId, ownerId))
    .all()
    .map((r) => r.slug);

export const listAuthors = () => db.select({ id: A.id, name: A.name }).from(A).orderBy(asc(A.name)).all();

function findStory(slug: string, user: User) {
  const story = db.select().from(S).where(eq(S.slug, slug)).get();
  if (!story) throw new InputError('Không tìm thấy truyện.', 404);
  assertCanEdit(story.ownerId, user);
  return story;
}

/** Truyện chưa có chương nào được ẩn khỏi site (tránh trang trống), có chương là tự hiện. */
function syncDraft(storyId: number) {
  const n = db.select({ n: count() }).from(C).where(eq(C.storyId, storyId)).get()?.n ?? 0;
  db.update(S).set({ draft: n === 0 }).where(eq(S.id, storyId)).run();
}

function findChapter(id: number, user: User) {
  const ch = db.select().from(C).where(eq(C.id, id)).get();
  if (!ch) throw new InputError('Không tìm thấy chương.', 404);
  const story = db.select({ ownerId: S.ownerId }).from(S).where(eq(S.id, ch.storyId)).get();
  assertCanEdit(story?.ownerId ?? null, user);
  return ch;
}

export function listChapters(slug: string, user: User): ChapterDTO[] {
  const story = findStory(slug, user);
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
    status: d.status === 'ongoing' ? ('ongoing' as const) : ('completed' as const),
    seoTitle: str(d.seoTitle) || null,
    seoDescription: str(d.seoDescription) || null,
  };
  if (!v.title) throw new InputError('Chưa nhập tên truyện.');
  if (!v.description) throw new InputError('Chưa nhập mô tả ngắn.');
  if (v.description.length > 200) throw new InputError('Mô tả ngắn tối đa 200 ký tự.');
  if (!v.genres.length) throw new InputError('Chọn ít nhất 1 thể loại.');
  if ((v.seoTitle?.length ?? 0) > 70) throw new InputError('Tiêu đề SEO tối đa 70 ký tự.');
  if ((v.seoDescription?.length ?? 0) > 170) throw new InputError('Mô tả SEO tối đa 170 ký tự.');
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
 * Tạo truyện mới (kèm các chương nếu có), đăng ngay với ngày hôm nay; tác giả = người đăng.
 * overwrite = true: ghi đè truyện cùng slug của chính mình, xoá chương cũ.
 * Truyện chưa có chương nào tạm ẩn khỏi site, thêm chương là tự hiện.
 */
export async function createStory(input: Record<string, any>, coverFile: File | null, user: User) {
  const slug = str(input.slug, 100);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new InputError('Slug chỉ gồm chữ thường a-z, số và dấu gạch ngang.');
  const values = storyValues(input);
  const chapters = (Array.isArray(input.chapters) ? input.chapters : []).map((c: any, i: number) => chapterValues({ number: i + 1, ...c }, c.body));
  const draft = !chapters.length;
  const existing = db.select().from(S).where(eq(S.slug, slug)).get();
  if (existing && (!input.overwrite || (user.role !== 'admin' && existing.ownerId !== user.id))) {
    throw new InputError(`Slug "${slug}" đã có truyện khác dùng.`, 409);
  }

  const cover = await readCover(coverFile);
  if (!cover) throw new InputError('Chưa chọn ảnh bìa.');
  const coverName = await saveCover(cover, slug);
  try {
    db.transaction((tx) => {
      let id: number;
      if (existing) {
        // Ghi đè giữ nguyên người đăng và ngày đăng cũ
        tx.update(S).set({ ...values, draft, cover: coverName, updatedDate: vnDay(), updatedAt: new Date() }).where(eq(S.id, existing.id)).run();
        tx.delete(C).where(eq(C.storyId, existing.id)).run();
        id = existing.id;
      } else {
        id = tx
          .insert(S)
          .values({ ...values, draft, slug, cover: coverName, ownerId: user.id, publishDate: vnDay() })
          .returning({ id: S.id })
          .get().id;
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

export async function updateStory(slug: string, input: Record<string, any>, coverFile: File | null, user: User) {
  const story = findStory(slug, user);
  const values = storyValues(input);
  const cover = await readCover(coverFile);
  const coverName = cover ? await saveCover(cover, slug) : story.cover;
  // Người đăng (tác giả) và ngày đăng giữ nguyên. Truyện cũ còn hẹn giờ thì đăng luôn từ hôm nay.
  const publishDate = story.publishDate > vnDay() ? vnDay() : story.publishDate;
  db.update(S)
    .set({ ...values, publishDate, cover: coverName, updatedDate: vnDay(), updatedAt: new Date() })
    .where(eq(S.id, story.id))
    .run();
  syncDraft(story.id);
  if (cover) await deleteCover(story.cover);
}

export async function deleteStory(slug: string, user: User) {
  const story = findStory(slug, user);
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
export function addChapters(slug: string, list: unknown, user: User) {
  const story = findStory(slug, user);
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
    tx.update(S).set({ draft: false, updatedDate: vnDay(), updatedAt: new Date() }).where(eq(S.id, story.id)).run();
    return out;
  });
  return ids.map((r) => r.id);
}

export function updateChapter(id: number, input: Record<string, any>, user: User) {
  const ch = findChapter(id, user);
  const values = chapterValues(input.data ?? {}, input.body);
  assertNumberFree(ch.storyId, values.number, id);
  db.update(C)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(C.id, id))
    .run();
}

export function deleteChapter(id: number, user: User) {
  const ch = findChapter(id, user);
  db.delete(C).where(eq(C.id, id)).run();
  syncDraft(ch.storyId);
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
  db.transaction((tx) => {
    // Truyện của người này thành "chưa gán" (lượt xem cũ vẫn ghi tên họ trong báo cáo)
    tx.update(S).set({ ownerId: null }).where(eq(S.ownerId, id)).run();
    tx.update(schema.news).set({ ownerId: null }).where(eq(schema.news.ownerId, id)).run();
    tx.delete(U).where(eq(U.id, id)).run();
  });
}

function assertNotLastAdmin(id: number) {
  const others = db
    .select({ n: count() })
    .from(U)
    .where(and(eq(U.role, 'admin'), ne(U.id, id)))
    .get();
  if (!others?.n) throw new InputError('Phải còn ít nhất 1 tài khoản admin.');
}
