// Kết nối SQLite dùng chung (chỉ chạy phía server). Tự áp migration trong drizzle/ khi khởi động.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as schema from './schema';

export const DATA_DIR = resolve(process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = resolve(DATA_DIR, 'uploads');

function open() {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const sqlite = new Database(resolve(DATA_DIR, 'app.db'));
  sqlite.pragma('journal_mode = WAL'); // đọc song song không bị khoá khi đang ghi
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolve('drizzle') });
  return db;
}

// Giữ 1 kết nối qua các lần hot-reload của dev server
const g = globalThis as unknown as { __storyDb?: ReturnType<typeof open> };
export const db = (g.__storyDb ??= open());
export { schema };
