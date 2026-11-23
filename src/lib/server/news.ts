// Thêm / sửa / xoá tin tức cho trang admin. Tin đăng ngay khi tạo; tác giả = người đăng.
import { desc, eq, ne } from 'drizzle-orm';
import type { User } from './auth';
import { assertCanEdit, userNames } from './admin';
import { db, schema } from './db';
import { InputError } from './http';
import { deleteCover, deleteInlineImages, deleteOrphanInlineImages, inlineImagesOf, saveCover } from './images';
import { vnDay } from './views';

const N = schema.news;

export interface NewsDTO {
  slug: string;
  body: string;
  /** Người đăng = tác giả hiển thị trên site */
  ownerId: number | null;
  ownerName: string;
  data: {
    title: string;
    description: string;
    cover: string;
    coverAlt: string;
    publishDate: string;
    updatedDate: string;
    seoTitle: string;
  };
}

const toDTO = (r: typeof N.$inferSelect, names: Map<number, string>): NewsDTO => ({
  slug: r.slug,
  body: r.body,
  ownerId: r.ownerId,
  ownerName: r.ownerId === null ? '' : (names.get(r.ownerId) ?? ''),
  data: {
    title: r.title,
    description: r.description ?? '',
    cover: r.cover,
    coverAlt: r.coverAlt ?? '',
    publishDate: r.publishDate,
    updatedDate: r.updatedDate ?? '',
    seoTitle: r.seoTitle ?? '',
  },
});

/** Admin thấy tất cả, biên tập viên chỉ thấy tin của mình. Mới nhất trước. */
export function listNews(user: User) {
  const names = userNames();
  return db
    .select()
    .from(N)
    .where(user.role === 'admin' ? undefined : eq(N.ownerId, user.id))
    .orderBy(desc(N.publishDate), desc(N.id))
    .all()
    .map((r) => toDTO(r, names));
}

/** Slug của mọi tin (kể cả của người khác): để slug tự tạo không bị trùng */
export const listNewsSlugs = () => db.select({ slug: N.slug }).from(N).all().map((r) => r.slug);

function find(slug: string, user: User) {
  const row = db.select().from(N).where(eq(N.slug, slug)).get();
  if (!row) throw new InputError('Không tìm thấy tin.', 404);
  assertCanEdit(row.ownerId, user);
  return row;
}

export const getNewsItem = (slug: string, user: User) => toDTO(find(slug, user), userNames());

const str = (v: unknown, max = 200_000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function values(input: Record<string, any>) {
  const d = (input.data ?? {}) as Record<string, unknown>;
  const v = {
    title: str(d.title, 300),
    description: str(d.description) || null,
    body: str(input.body).replace(/\r\n?/g, '\n'),
    coverAlt: str(d.coverAlt, 300) || null,
    seoTitle: str(d.seoTitle) || null,
  };
  if (!v.title) throw new InputError('Chưa nhập tiêu đề.');
  if (!v.body) throw new InputError('Chưa nhập nội dung.');
  if ((v.description?.length ?? 0) > 200) throw new InputError('Mô tả ngắn tối đa 200 ký tự.');
  if ((v.seoTitle?.length ?? 0) > 70) throw new InputError('Tiêu đề SEO tối đa 70 ký tự.');
  return v;
}

async function readImage(file: File | null) {
  if (!file || !file.size) return null;
  if (file.size > 15 * 1024 * 1024) throw new InputError('Ảnh quá lớn (tối đa 15MB).');
  return Buffer.from(await file.arrayBuffer());
}
export { readImage };

/** Ảnh trong bài không còn được tin nào dùng */
function unusedImages(candidates: Set<string>, exceptId: number) {
  if (!candidates.size) return [];
  const used = new Set<string>();
  for (const r of db.select({ body: N.body }).from(N).where(ne(N.id, exceptId)).all()) for (const n of inlineImagesOf(r.body)) used.add(n);
  return [...candidates].filter((n) => !used.has(n));
}

/** Dọn ảnh chèn rồi bỏ mà không lưu (không tin nào dùng, đã quá 1 ngày) */
function cleanupOrphanImages() {
  const used = new Set<string>();
  for (const r of db.select({ body: N.body }).from(N).all()) for (const n of inlineImagesOf(r.body)) used.add(n);
  deleteOrphanInlineImages(used).catch((e) => console.error('Dọn ảnh thừa lỗi:', e));
}

export async function createNews(input: Record<string, any>, coverFile: File | null, user: User) {
  const slug = str(input.slug, 100);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new InputError('Slug chỉ gồm chữ thường a-z, số và dấu gạch ngang.');
  if (db.select({ id: N.id }).from(N).where(eq(N.slug, slug)).get()) throw new InputError(`Slug "${slug}" đã có tin khác dùng.`, 409);
  const v = values(input);
  const cover = await readImage(coverFile);
  if (!cover) throw new InputError('Chưa chọn ảnh bìa.');
  const coverName = await saveCover(cover, `news-${slug}`);
  try {
    db.insert(N)
      .values({ ...v, slug, cover: coverName, ownerId: user.id, publishDate: vnDay(), draft: false })
      .run();
  } catch (e) {
    await deleteCover(coverName);
    throw e;
  }
  cleanupOrphanImages();
  return slug;
}

export async function updateNews(slug: string, input: Record<string, any>, coverFile: File | null, user: User) {
  const row = find(slug, user);
  const v = values(input);
  const cover = await readImage(coverFile);
  const coverName = cover ? await saveCover(cover, `news-${slug}`) : row.cover;
  // Tin cũ còn nháp / hẹn giờ thì đăng luôn (không còn tuỳ chọn này trong admin)
  const publishDate = row.publishDate > vnDay() ? vnDay() : row.publishDate;
  db.update(N)
    .set({ ...v, publishDate, draft: false, cover: coverName, updatedDate: vnDay(), updatedAt: new Date() })
    .where(eq(N.id, row.id))
    .run();
  if (cover) await deleteCover(row.cover);
  // Xoá ảnh đã bị gỡ khỏi bài
  const after = inlineImagesOf(v.body);
  const removed = new Set([...inlineImagesOf(row.body)].filter((n) => !after.has(n)));
  await deleteInlineImages(unusedImages(removed, row.id));
  cleanupOrphanImages();
}

export async function deleteNews(slug: string, user: User) {
  const row = find(slug, user);
  const images = unusedImages(inlineImagesOf(row.body), row.id);
  db.delete(N).where(eq(N.id, row.id)).run();
  await Promise.all([deleteCover(row.cover), deleteInlineImages(images)]);
  cleanupOrphanImages();
}
