// Chuyển truyện/chương/tác giả từ file markdown cũ (src/content) vào database SQLite.
// Dùng: npm run db:import            (bỏ qua truyện đã có trong DB)
//       npm run db:import -- --force (ghi đè truyện đã có)
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/lib/server/db';
import { saveCover, deleteCover } from '../src/lib/server/images';
import { wordCount } from '../src/lib/server/admin';

const ROOT = 'src/content';
const force = process.argv.includes('--force');
const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseMd(text: string) {
  const m = text.match(FM);
  return m ? { data: (YAML.parse(m[1]) ?? {}) as Record<string, any>, body: m[2].trim() } : { data: {}, body: text.trim() };
}
const dateOnly = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
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

console.log(`\nXong: ${imported} truyện được nhập vào ${resolve(process.env.DATA_DIR || 'data', 'app.db')}`);
