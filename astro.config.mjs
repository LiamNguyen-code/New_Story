// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import settings from './src/data/settings.json' with { type: 'json' };

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || settings.url,
  // Trang được render trên server mỗi request (dữ liệu từ SQLite). Trang tin tức vẫn build sẵn (prerender).
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Kiểm tra Origin tự làm trong src/middleware.ts (cách của Astro báo lỗi nhầm khi chạy sau Nginx + HTTPS)
  security: { checkOrigin: false },
  trailingSlash: 'always',
  build: { format: 'directory' },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: {
    // @ts-ignore -- kiểu Vite của @tailwindcss/vite lệch phiên bản với Vite trong Astro, chạy vẫn đúng
    plugins: [tailwindcss()],
    ssr: { external: ['better-sqlite3'] },
  },
});
