// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import settings from './src/data/settings.json' with { type: 'json' };
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Trang /admin/ chỉ có trong bản build khi đặt ENABLE_ADMIN=true (biến môi trường trên Cloudflare).
 * `npm run dev` luôn có admin.
 * @type {import('astro').AstroIntegration}
 */
const adminToggle = {
  name: 'admin-toggle',
  hooks: {
    'astro:build:done': async ({ dir, logger }) => {
      if (process.env.ENABLE_ADMIN === 'true') return;
      await rm(new URL('admin/', dir), { recursive: true, force: true });
      logger.info(`Admin không có trong bản build (đặt ENABLE_ADMIN=true để bật): đã xoá ${fileURLToPath(new URL('admin/', dir))}`);
    },
  },
};

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || settings.url,
  trailingSlash: 'always',
  build: { format: 'directory' },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  integrations: [
    sitemap({
      // Trang tag có thể noindex (ít truyện) nên không đưa vào sitemap
      filter: (page) => !/\/(admin|search|tag)\//.test(page),
    }),
    adminToggle,
  ],
  vite: {
    // @ts-ignore -- kiểu Vite của @tailwindcss/vite lệch phiên bản với Vite trong Astro, chạy vẫn đúng
    plugins: [tailwindcss()],
  },
});
