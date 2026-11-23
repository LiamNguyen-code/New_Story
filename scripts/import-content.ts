// Chuyển truyện/chương/tác giả/tin tức từ file markdown mẫu (src/seed) vào database SQLite.
// Dùng: npm run db:import            (bỏ qua truyện/tin đã có trong DB)
//       npm run db:import -- --force (ghi đè)
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/lib/server/db';
import { saveCover, deleteCover, saveInlineImage } from '../src/lib/server/images';
import { wordCount } from '../src/lib/server/admin';

const ROOT = 'src/seed';
const force = process.argv.includes('--force');
const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseMd(text: string) {
  const m = text.match(FM);
  return m ? { data: (YAML.parse(m[1]) ?? {}) as Record<string, any>, body: m[2].trim() } : { data: {}, body: text.trim() };
}
const dateOnly = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
// Bài nhập vào được gán cho tài khoản admin đầu tiên (= tác giả hiển thị trên site)
const ownerId = db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, 'admin')).orderBy(schema.users.id).get()?.id ?? null;
const list = async (dir: string, ext: string) => (existsSync(dir) ? (await readdir(dir)).filter((f) => f.endsWith(ext)).sort() : []);

// ---- Tác giả
for (const f of await list(`${ROOT}/authors`, '.json')) {
  const a = JSON.parse(await readFile(`${ROOT}/authors/${f}`, 'utf8'));
  const id = f.replace(/\.json$/, '');
  db.insert(schema.authors)
    .values({ id, name: a.name, bio: a.bio ?? '' })
    .onConflictDoUpdate({ target: schema.authors.id, set: { name: a.name, bio: a.bio ?? '' } })
    .run();
  console.log(`✓ tác giả ${id}`);
}

// ---- Truyện + chương
let imported = 0;
for (const f of await list(`${ROOT}/stories`, '.md')) {
  const { data: d, body } = parseMd(await readFile(`${ROOT}/stories/${f}`, 'utf8'));
  const slug: string = d.slug || f.replace(/\.md$/, '');
  const existing = db.select().from(schema.stories).where(eq(schema.stories.slug, slug)).get();
  if (existing && !force) {
    console.log(`- bỏ qua ${slug} (đã có trong DB, thêm --force để ghi đè)`);
    continue;
  }

  // cover trong file là đường dẫn tương đối với thư mục stories
  const coverFile = resolve(`${ROOT}/stories`, String(d.cover ?? ''));
  if (!d.cover || !existsSync(coverFile)) {
    console.warn(`! ${slug}: không thấy ảnh bìa ${coverFile}, bỏ qua`);
    continue;
  }
  const cover = await saveCover(await readFile(coverFile), slug);

  const chapterDir = `${ROOT}/chapters/${slug}`;
  const chapters: Omit<typeof schema.chapters.$inferInsert, 'storyId'>[] = [];
  for (const cf of await list(chapterDir, '.md')) {
    const { data: c, body: text } = parseMd(await readFile(`${chapterDir}/${cf}`, 'utf8'));
    chapters.push({ number: Number(c.number), title: String(c.title ?? ''), body: text, wordCount: wordCount(text), draft: !!c.draft, seoDescription: c.seoDescription ?? null });
  }

  const values = {
    slug,
    title: String(d.title),
    description: String(d.description ?? ''),
    summary: body,
    cover,
    coverAlt: d.coverAlt ?? null,
    genres: d.genres ?? [],
    tags: (d.tags ?? []).map(String),
    authorId: d.author && db.select().from(schema.authors).where(eq(schema.authors.id, d.author)).get() ? d.author : null,
    publishDate: dateOnly(d.publishDate) ?? new Date().toISOString().slice(0, 10),
    updatedDate: dateOnly(d.updatedDate),
    status: d.status === 'ongoing' ? ('ongoing' as const) : ('completed' as const),
    featured: !!d.featured,
    draft: !!d.draft,
    ownerId,
    seoTitle: d.seoTitle ?? null,
    seoDescription: d.seoDescription ?? null,
  };

  db.transaction((tx) => {
    if (existing) tx.delete(schema.stories).where(eq(schema.stories.id, existing.id)).run();
    const { id } = tx.insert(schema.stories).values(values).returning({ id: schema.stories.id }).get();
    if (chapters.length) tx.insert(schema.chapters).values(chapters.map((c) => ({ ...c, storyId: id }))).run();
  });
  if (existing) await deleteCover(existing.cover);
  imported++;
  console.log(`✓ truyện ${slug} (${chapters.length} chương)`);
}

// ---- Tin tức (ảnh chèn trong bài cũng được upload và đổi đường dẫn)
let newsCount = 0;
for (const f of await list(`${ROOT}/news`, '.md')) {
  const { data: d, body } = parseMd(await readFile(`${ROOT}/news/${f}`, 'utf8'));
  const slug = f.replace(/\.md$/, '');
  const existing = db.select().from(schema.news).where(eq(schema.news.slug, slug)).get();
  if (existing && !force) {
    console.log(`- bỏ qua tin ${slug} (đã có trong DB)`);
    continue;
  }
  const coverFile = resolve(`${ROOT}/news`, String(d.cover ?? ''));
  if (!d.cover || !existsSync(coverFile)) {
    console.warn(`! tin ${slug}: không thấy ảnh bìa ${coverFile}, bỏ qua`);
    continue;
  }
  const cover = await saveCover(await readFile(coverFile), `news-${slug}`);

  let text = body;
  for (const m of body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    const file = resolve(`${ROOT}/news`, m[2]);
    if (/^https?:|^\//.test(m[2]) || !existsSync(file)) continue;
    text = text.replace(m[0], `![${m[1]}](${await saveInlineImage(await readFile(file))})`);
  }

  const values = {
    slug,
    title: String(d.title),
    description: d.description ?? null,
    body: text,
    cover,
    coverAlt: d.coverAlt ?? null,
    category: d.category ?? null,
    publishDate: dateOnly(d.publishDate) ?? new Date().toISOString().slice(0, 10),
    updatedDate: dateOnly(d.updatedDate),
    draft: !!d.draft,
    ownerId,
    seoTitle: d.seoTitle ?? null,
  };
  if (existing) {
    db.update(schema.news).set(values).where(eq(schema.news.id, existing.id)).run();
    await deleteCover(existing.cover);
  } else db.insert(schema.news).values(values).run();
  newsCount++;
  console.log(`✓ tin ${slug}`);
}

console.log(`\nXong: ${imported} truyện, ${newsCount} tin được nhập vào ${resolve(process.env.DATA_DIR || 'data', 'app.db')}`);
