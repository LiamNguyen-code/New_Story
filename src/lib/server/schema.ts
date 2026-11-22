// Cấu trúc database SQLite (Drizzle ORM).
// Sửa file này rồi chạy `npm run db:generate` để tạo migration mới trong thư mục drizzle/.
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
};

export const authors = sqliteTable('authors', {
  id: text('id').primaryKey(), // slug, ví dụ "editorial-team"
  name: text('name').notNull(),
  bio: text('bio').notNull().default(''),
});

export const stories = sqliteTable(
  'stories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    /** Tóm tắt (markdown), hiện ở đầu trang giới thiệu truyện */
    summary: text('summary').notNull().default(''),
    /** Tên gốc ảnh bìa trong uploads/covers (không có hậu tố kích thước) */
    cover: text('cover').notNull(),
    coverAlt: text('cover_alt'),
    genres: text('genres', { mode: 'json' }).$type<string[]>().notNull().default([]),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    authorId: text('author_id').references(() => authors.id, { onDelete: 'set null' }),
    /** YYYY-MM-DD. Ngày trong tương lai = hẹn giờ đăng */
    publishDate: text('publish_date').notNull(),
    updatedDate: text('updated_date'),
    status: text('status', { enum: ['ongoing', 'completed'] }).notNull().default('completed'),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    draft: integer('draft', { mode: 'boolean' }).notNull().default(false),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    ...timestamps,
  },
  (t) => [index('stories_publish_idx').on(t.draft, t.publishDate)],
);

export const chapters = sqliteTable(
  'chapters',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    storyId: integer('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    /** Nội dung markdown */
    body: text('body').notNull(),
    wordCount: integer('word_count').notNull().default(0),
    draft: integer('draft', { mode: 'boolean' }).notNull().default(false),
    seoDescription: text('seo_description'),
    ...timestamps,
  },
  (t) => [uniqueIndex('chapters_story_number_idx').on(t.storyId, t.number)],
);

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default(''),
  passwordHash: text('password_hash').notNull(),
  /** admin: quản lý tài khoản · editor: chỉ sửa truyện */
  role: text('role', { enum: ['admin', 'editor'] }).notNull().default('editor'),
  ...timestamps,
});

export const sessions = sqliteTable('sessions', {
  /** sha256 của token trong cookie (lộ DB cũng không dùng được token) */
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});
