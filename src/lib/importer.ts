// Logic tách chương khi dán cả truyện / nhiều chương (chạy trên trình duyệt).

export interface ParsedChapter {
  number: number;
  title: string;
  body: string;
}

// "Chapter 1 - Title", "## Chapter 2: Title", "**Chương 3. Tên**", "CHAPTER 4"
const HEADING =
  /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:chapter|chương|chuong|chap\.?|part)\s+(\d+)\s*(?:[:.\-–—|]\s*)?(.*?)\s*(?:\*\*)?\s*$/i;

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Từ nối tiếng Anh không mang nghĩa tìm kiếm, bỏ cho URL ngắn gọn
const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is', 'are', 'was', 'were', 'by', 'from']);

/**
 * Slug chuẩn SEO từ tiêu đề: chữ thường không dấu, nối bằng "-", bỏ từ nối,
 * tối đa ~60 ký tự (cắt theo từ, không cắt giữa chữ), không trùng slug đã có (thêm -2, -3…).
 */
export function seoSlug(title: string, taken: Set<string> = new Set(), max = 60) {
  const words = slugify(title).split('-').filter(Boolean);
  // Tiêu đề tiếng Việt (có dấu) giữ nguyên mọi từ: "an", "to", "a"... bỏ dấu đi là từ có nghĩa
  const vietnamese = /[^\x00-\x7F]/.test(title.normalize('NFC'));
  const meaningful = vietnamese ? words : words.filter((w) => !STOP_WORDS.has(w));
  let out = '';
  for (const w of meaningful.length >= 2 ? meaningful : words) {
    if (out && out.length + 1 + w.length > max) break;
    out = out ? `${out}-${w}` : w.slice(0, max);
  }
  if (!out) return '';
  let slug = out;
  for (let i = 2; taken.has(slug); i++) slug = `${out}-${i}`;
  return slug;
}

export function splitChapters(text: string, lineParagraphs: boolean): ParsedChapter[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const chapters: { number: number; title: string; lines: string[] }[] = [];
  let current: (typeof chapters)[number] | null = null;

  for (const line of lines) {
    const m = line.match(HEADING);
    if (m && line.trim().length < 150) {
      current = { number: Number(m[1]), title: m[2].trim(), lines: [] };
      chapters.push(current);
    } else {
      if (!current) {
        if (!line.trim()) continue;
        current = { number: 1, title: '', lines: [] };
        chapters.push(current);
      }
      current.lines.push(line);
    }
  }

  // Có tiêu đề chương → phần chữ trước chương đầu (thường là tên truyện) bị bỏ
  if (chapters.length > 1 && chapters[0].title === '' && !HEADING.test(chapters[0].lines[0] ?? '')) chapters.shift();

  return chapters
    .map((c, i) => {
      let body = c.lines.join('\n').trim();
      body = lineParagraphs
        ? body
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .join('\n\n')
        : body.replace(/\n{3,}/g, '\n\n');
      return { number: i + 1, title: c.title || `Chapter ${i + 1}`, body };
    })
    .filter((c) => c.body.length > 0);
}
