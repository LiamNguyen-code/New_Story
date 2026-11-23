// Ảnh bìa: lưu ở <DATA_DIR>/uploads/covers, tạo sẵn nhiều kích thước WebP + 1 ảnh OG JPG.
import sharp from 'sharp';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { UPLOAD_DIR } from './db';

const COVER_DIR = resolve(UPLOAD_DIR, 'covers');
export const COVER_WIDTHS = [240, 480, 800, 1200] as const;

/** Lưu ảnh bìa (cắt 1200×630), trả về tên gốc để lưu vào DB. */
export async function saveCover(input: Buffer, slug: string) {
  await mkdir(COVER_DIR, { recursive: true });
  // Hậu tố phiên bản: đổi ảnh = đổi URL, trình duyệt/CDN không giữ ảnh cũ
  const name = `${slug}-${Date.now().toString(36)}`;
  const base = sharp(input).rotate().resize(1200, 630, { fit: 'cover' });
  await Promise.all([
    ...COVER_WIDTHS.map((w) => base.clone().resize(w, Math.round((w * 630) / 1200)).webp({ quality: 80 }).toFile(resolve(COVER_DIR, `${name}-${w}.webp`))),
    base.clone().jpeg({ quality: 80 }).toFile(resolve(COVER_DIR, `${name}-og.jpg`)),
  ]);
  return name;
}

// ------------------------------------------------------------ Ảnh chèn trong nội dung tin tức

const INLINE_DIR = resolve(UPLOAD_DIR, 'news');
/** Đường dẫn ảnh trong bài: /uploads/news/<tên>.webp */
export const INLINE_RE = /\/uploads\/news\/([a-z0-9-]+\.webp)/g;

/** Lưu ảnh chèn trong bài (giữ tỷ lệ, rộng tối đa 1200px), trả về URL dùng trong markdown. */
export async function saveInlineImage(input: Buffer) {
  await mkdir(INLINE_DIR, { recursive: true });
  const name = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}.webp`;
  await sharp(input).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toFile(resolve(INLINE_DIR, name));
  return `/uploads/news/${name}`;
}

export const inlineImagesOf = (markdown: string) => new Set([...markdown.matchAll(INLINE_RE)].map((m) => m[1]));

/**
 * Xoá ảnh trong bài đã upload nhưng không bài nào dùng (chèn rồi bỏ, không lưu tin).
 * Chỉ xoá ảnh cũ hơn 1 ngày: ảnh vừa upload có thể đang nằm trong bài chưa bấm lưu.
 */
export async function deleteOrphanInlineImages(used: Set<string>) {
  const names = await readdir(INLINE_DIR).catch(() => [] as string[]);
  const cutoff = Date.now() - 24 * 3600_000;
  for (const n of names) {
    if (used.has(n) || !/^[a-z0-9-]+\.webp$/.test(n)) continue;
    const st = await stat(resolve(INLINE_DIR, n)).catch(() => null);
    if (st && st.mtimeMs < cutoff) await rm(resolve(INLINE_DIR, n), { force: true });
  }
}

export async function deleteInlineImages(names: Iterable<string>) {
  await Promise.all([...names].filter((n) => /^[a-z0-9-]+\.webp$/.test(n)).map((n) => rm(resolve(INLINE_DIR, n), { force: true })));
}

export async function deleteCover(name: string | null | undefined) {
  if (!name || !/^[a-z0-9-]+$/.test(name)) return;
  await Promise.all([...COVER_WIDTHS.map((w) => `${name}-${w}.webp`), `${name}-og.jpg`].map((f) => rm(resolve(COVER_DIR, f), { force: true })));
}
