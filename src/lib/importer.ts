// Logic tách chương và sinh file cho công cụ Quick import (chạy trên trình duyệt).

export interface ParsedChapter {
  number: number;
  title: string;
  body: string;
}

export interface StoryInput {
  slug: string;
  title: string;
  description: string;
  summary: string;
  coverAlt: string;
  genres: string[];
  tags: string[];
  author: string;
  publishDate: string;
  status: string;
  featured: boolean;
  draft: boolean;
  chapters: ParsedChapter[];
  cover: Blob;
}

export interface OutFile {
  path: string;
  content: string | Blob;
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

// Chuỗi YAML an toàn: JSON string cũng là YAML double-quoted hợp lệ
const q = (s: string) => JSON.stringify(s);

export function buildFiles(s: StoryInput): OutFile[] {
  const pad = s.chapters.length > 99 ? 3 : 2;
  // Hậu tố phiên bản: đổi ảnh = đổi URL, trình duyệt/CDN không giữ ảnh cũ
  const coverName = `${s.slug}-${Date.now().toString(36)}.webp`;
  const story = [
    '---',
    `slug: ${s.slug}`,
    `title: ${q(s.title)}`,
    `description: ${q(s.description)}`,
    `cover: ../../assets/covers/${coverName}`,
    ...(s.coverAlt ? [`coverAlt: ${q(s.coverAlt)}`] : []),
    `genres: ${JSON.stringify(s.genres)}`,
    `tags: ${JSON.stringify(s.tags)}`,
    `author: ${s.author}`,
    `publishDate: ${s.publishDate}`,
    `status: ${s.status}`,
    `featured: ${s.featured}`,
    `draft: ${s.draft}`,
    '---',
    '',
    s.summary || s.description,
    '',
  ].join('\n');

  return [
    { path: `src/assets/covers/${coverName}`, content: s.cover },
    { path: `src/content/stories/${s.slug}.md`, content: story },
    ...s.chapters.map((c) => ({
      path: `src/content/chapters/${s.slug}/chapter-${String(c.number).padStart(pad, '0')}.md`,
      content: ['---', `story: ${s.slug}`, `number: ${c.number}`, `title: ${q(c.title)}`, '---', '', c.body, ''].join('\n'),
    })),
  ];
}
