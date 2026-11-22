// Ghi và tổng hợp lượt xem trang (truyện + chương), theo ngày giờ Việt Nam.
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db, schema } from './db';

const { pageViews: V, stories: S, users: U } = schema;

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Ngày YYYY-MM-DD theo giờ Việt Nam */
export const vnDay = (d = new Date()) => dayFmt.format(d);

// Cùng 1 IP xem lại cùng 1 trang trong 30 phút chỉ tính 1 lượt (chống F5 / bot đơn giản)
const recent = new Map<string, number>();
const REPEAT_WINDOW = 30 * 60_000;

export function recordView(input: { slug: string; chapter: number; unique: boolean; ip: string }) {
  const { slug, chapter, unique, ip } = input;
  if (!Number.isInteger(chapter) || chapter < 0 || chapter > 100_000) return false;

  const now = Date.now();
  const key = `${ip}|${slug}|${chapter}`;
  if ((recent.get(key) ?? 0) > now - REPEAT_WINDOW) return false;
  recent.set(key, now);
  if (recent.size > 50_000) for (const [k, t] of recent) if (t < now - REPEAT_WINDOW) recent.delete(k);

  const story = db.select({ id: S.id, ownerId: S.ownerId, draft: S.draft }).from(S).where(eq(S.slug, slug)).get();
  if (!story || story.draft) return false;
  if (chapter > 0) {
    const ch = db.select({ id: schema.chapters.id }).from(schema.chapters).where(and(eq(schema.chapters.storyId, story.id), eq(schema.chapters.number, chapter))).get();
    if (!ch) return false;
  }

  db.insert(V)
    .values({ day: vnDay(), storyId: story.id, chapter, ownerId: story.ownerId ?? 0, views: 1, uniques: unique ? 1 : 0 })
    .onConflictDoUpdate({
      target: [V.day, V.storyId, V.chapter, V.ownerId],
      set: { views: sql`${V.views} + 1`, uniques: sql`${V.uniques} + ${unique ? 1 : 0}` },
    })
    .run();
  return true;
}

// ------------------------------------------------------------ Báo cáo

export interface ReportFilter {
  from: string;
  to: string;
  /** null = tất cả người phụ trách */
  ownerId: number | null;
}

const where = (f: ReportFilter) => and(gte(V.day, f.from), lte(V.day, f.to), f.ownerId === null ? undefined : eq(V.ownerId, f.ownerId));
const totals = { views: sql<number>`sum(${V.views})`.mapWith(Number), uniques: sql<number>`sum(${V.uniques})`.mapWith(Number) };

export function report(f: ReportFilter) {
  const byDay = db
    .select({ day: V.day, ...totals })
    .from(V)
    .where(where(f))
    .groupBy(V.day)
    .orderBy(V.day)
    .all();

  const byOwner = db
    .select({ ownerId: V.ownerId, name: U.name, email: U.email, stories: sql<number>`count(distinct ${V.storyId})`.mapWith(Number), ...totals })
    .from(V)
    .leftJoin(U, eq(U.id, V.ownerId))
    .where(where(f))
    .groupBy(V.ownerId)
    .orderBy(sql`sum(${V.views}) desc`)
    .all();

  const byStory = db
    .select({ storyId: V.storyId, slug: S.slug, title: S.title, ownerId: V.ownerId, ownerName: U.name, ownerEmail: U.email, ...totals })
    .from(V)
    .innerJoin(S, eq(S.id, V.storyId))
    .leftJoin(U, eq(U.id, V.ownerId))
    .where(where(f))
    .groupBy(V.storyId, V.ownerId)
    .orderBy(sql`sum(${V.views}) desc`)
    .all();

  const byPage = db
    .select({ storyId: V.storyId, slug: S.slug, title: S.title, chapter: V.chapter, ownerId: V.ownerId, ownerName: U.name, ownerEmail: U.email, ...totals })
    .from(V)
    .innerJoin(S, eq(S.id, V.storyId))
    .leftJoin(U, eq(U.id, V.ownerId))
    .where(where(f))
    .groupBy(V.storyId, V.chapter, V.ownerId)
    .orderBy(sql`sum(${V.views}) desc`)
    .all();

  // Điền đủ mọi ngày trong khoảng (ngày không có lượt xem = 0) cho biểu đồ
  const map = new Map(byDay.map((d) => [d.day, d]));
  const days: { day: string; views: number; uniques: number }[] = [];
  for (let d = new Date(f.from + 'T00:00:00Z'); d <= new Date(f.to + 'T00:00:00Z') && days.length < 1000; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    days.push(map.get(day) ?? { day, views: 0, uniques: 0 });
  }

  const total = byDay.reduce((a, d) => ({ views: a.views + d.views, uniques: a.uniques + d.uniques }), { views: 0, uniques: 0 });
  return { days, byOwner, byStory, byPage, total };
}

/** Đọc bộ lọc từ query string; biên tập viên luôn bị khoá vào số liệu của chính mình. */
export function parseFilter(params: URLSearchParams, user: { id: number; role: string }): ReportFilter {
  const isDay = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  const to = isDay(params.get('to')) ? params.get('to')! : vnDay();
  const defFrom = new Date(to + 'T00:00:00Z');
  defFrom.setUTCDate(defFrom.getUTCDate() - 29);
  let from = isDay(params.get('from')) ? params.get('from')! : defFrom.toISOString().slice(0, 10);
  if (from > to) from = to;
  const owner = params.get('owner');
  const ownerId = user.role === 'admin' ? (owner && /^\d+$/.test(owner) ? Number(owner) : null) : user.id;
  return { from, to, ownerId };
}
