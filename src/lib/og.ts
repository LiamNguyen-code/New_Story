import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

/** Ảnh OG 1200x630 dạng JPG cho tin tức (ảnh trong src/assets). Ảnh bìa truyện dùng ogImageUrl(). */
export async function ogImage(src: ImageMetadata) {
  const img = await getImage({ src, width: 1200, height: 630, format: 'jpg', quality: 80 });
  return img.src;
}
