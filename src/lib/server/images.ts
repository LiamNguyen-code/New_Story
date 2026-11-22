// Ảnh bìa: lưu ở <DATA_DIR>/uploads/covers, tạo sẵn nhiều kích thước WebP + 1 ảnh OG JPG.
import sharp from 'sharp';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
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

export async function deleteCover(name: string | null | undefined) {
  if (!name || !/^[a-z0-9-]+$/.test(name)) return;
  await Promise.all([...COVER_WIDTHS.map((w) => `${name}-${w}.webp`), `${name}-og.jpg`].map((f) => rm(resolve(COVER_DIR, f), { force: true })));
}
