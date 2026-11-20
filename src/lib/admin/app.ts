// Ứng dụng quản trị: Truyện → Chương (hash routing, không framework).
//   #/                                   danh sách truyện
//   #/story/<slug>                       chi tiết truyện + danh sách chương
//   #/story/<slug>/edit                  sửa thông tin truyện
//   #/story/<slug>/chapter/new           thêm 1 chương
//   #/story/<slug>/chapter/<file>        sửa chương
//   #/story/<slug>/bulk                  dán thêm nhiều chương
import type { Backend } from './backend';
import { disconnectAndReload, ensureBackend } from './connect';
import {
  chapterFileName,
  countChapters,
  coverPath,
  dateOnly,
  deleteChapter,
  deleteStory,
  loadAuthors,
  loadChapters,
  loadSettings,
  loadStories,
  saveChapter,
  saveStory,
  wordCount,
  type ChapterRec,
  type Settings,
  type StoryRec,
} from './content';
import { btn, coverPicker, h, icon, input, pageBar, toast, type Child } from './dom';
import { splitChapters } from '../importer';

let b: Backend;
let root: HTMLElement;
let stories: StoryRec[] = [];
let counts = new Map<string, number>();
let settings: Settings = { genres: [] };
let authors: { id: string; name: string }[] = [];
let dirty = false;
let skipNextRoute = false;
const thumbCache = new Map<string, string>();
const listState = { q: '', filter: 'all' };

export async function startApp(el: HTMLElement) {
  root = el;
  b = await ensureBackend(root);
  addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });
  addEventListener('hashchange', (e) => {
    if (skipNextRoute) {
      skipNextRoute = false;
      return;
    }
    if (dirty && !confirm('Bạn có thay đổi chưa lưu. Rời trang?')) {
      skipNextRoute = true;
      location.hash = new URL(e.oldURL).hash;
      return;
    }
    dirty = false;
    route();
  });
  show(h('p', { class: 'py-10 text-center text-sm text-zinc-500' }, 'Đang tải danh sách truyện…'));
  await reload();
  route();
}

async function reload() {
  [stories, settings, authors] = await Promise.all([loadStories(b), loadSettings(b), loadAuthors(b)]);
  counts = new Map(await Promise.all(stories.map(async (s) => [s.slug, await countChapters(b, s.slug)] as const)));
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  window.scrollTo(0, 0);
  document.onkeydown = null;
  if (parts[0] !== 'story') return void listView();
  const story = stories.find((s) => s.slug === parts[1]);
  if (!story) return show(pageBar({ crumbs: [['Truyện', '#/']], title: 'Không tìm thấy truyện' }), h('a', { href: '#/', class: btn.secondary }, '← Về danh sách truyện'));
  if (parts[2] === 'edit') return void storyEdit(story);
  if (parts[2] === 'bulk') return void bulkAdd(story);
  if (parts[2] === 'chapter') return void chapterEdit(story, parts[3]);
  return void storyView(story);
}

const go = (hash: string) => (location.hash = hash);
const storyHash = (s: StoryRec) => `#/story/${encodeURIComponent(s.slug)}`;
const chapterHash = (s: StoryRec, c: ChapterRec) => `${storyHash(s)}/chapter/${encodeURIComponent(c.file)}`;
const show = (...nodes: (Node | false | null | undefined)[]) => root.replaceChildren(...nodes.filter((n): n is Node => !!n));
const today = () => new Date().toISOString().slice(0, 10);
const genreName = (id: string) => settings.genres.find((g) => g.id === id)?.name ?? id;

// ------------------------------------------------------------ helpers

async function busy(button: HTMLButtonElement, label: string, fn: () => Promise<void>) {
  const old = [...button.childNodes];
  button.disabled = true;
  button.textContent = label;
  try {
    await fn();
  } catch (e) {
    toast((e as Error).message, false);
  } finally {
    button.disabled = false;
    button.replaceChildren(...old);
  }
}

const badge = (text: string, cls: string) => h('span', { class: `inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}` }, text);

function statusBadges(s: StoryRec) {
  const date = dateOnly(s.data.publishDate);
  return [
    s.data.draft
      ? badge('Nháp', 'bg-yellow-100 text-yellow-800')
      : date > today()
        ? badge(`Hẹn giờ ${date}`, 'bg-purple-100 text-purple-700')
        : badge('Đã đăng', 'bg-emerald-100 text-emerald-700'),
    s.data.featured && badge('Nổi bật', 'bg-blue-100 text-blue-700'),
    s.data.status === 'ongoing' && badge('Đang ra', 'bg-orange-100 text-orange-700'),
  ];
}

function thumb(s: StoryRec, cls: string) {
  const img = h('img', { class: cls + ' bg-zinc-200 object-cover', alt: '' });
  const path = coverPath(s.data.cover);
  if (path) {
    const cached = thumbCache.get(path);
    if (cached) img.src = cached;
    else
      b.readBlob(path).then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        thumbCache.set(path, url);
        img.src = url;
      });
  }
  return img;
}

function field(label: string, control: HTMLElement, hint?: Child) {
  return h(
    'label',
    { class: 'block text-sm font-medium text-zinc-800' },
    label,
    control,
    hint && h('span', { class: 'mt-1 block text-xs font-normal text-zinc-500' }, hint),
  );
}

const card = (...children: Child[]) => h('section', { class: 'space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5' }, ...children);

/** Ctrl/Cmd + S để lưu form đang mở */
function bindSave(button: HTMLButtonElement) {
  document.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      button.click();
    }
  };
}

// ------------------------------------------------------------ Danh sách truyện

const FILTERS: [string, string][] = [
  ['all', 'Tất cả'],
  ['published', 'Đã đăng'],
  ['scheduled', 'Hẹn giờ'],
  ['draft', 'Nháp'],
  ['featured', 'Nổi bật'],
  ['ongoing', 'Đang ra'],
];

function matchFilter(s: StoryRec, filter: string) {
  const date = dateOnly(s.data.publishDate);
  switch (filter) {
    case 'draft':
      return !!s.data.draft;
    case 'published':
      return !s.data.draft && date <= today();
    case 'scheduled':
      return !s.data.draft && date > today();
    case 'featured':
      return !!s.data.featured;
    case 'ongoing':
      return s.data.status === 'ongoing';
    default:
      return true;
  }
}

function listView() {
  const list = h('div', { class: 'overflow-hidden rounded-xl border border-zinc-200 bg-white' });
  const tabs = h('div', { class: 'flex gap-1 overflow-x-auto pb-1' });

  const renderTabs = () =>
    tabs.replaceChildren(
      ...FILTERS.map(([v, l]) => {
        const n = stories.filter((s) => matchFilter(s, v)).length;
        const active = listState.filter === v;
        return h(
          'button',
          {
            type: 'button',
            class: `whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${active ? 'bg-slate-900 font-semibold text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100'}`,
            onclick: () => {
              listState.filter = v;
              renderTabs();
              renderRows();
            },
          },
          `${l} `,
          h('span', { class: active ? 'text-zinc-300' : 'text-zinc-400' }, n),
        );
      }),
    );

  const renderRows = () => {
    const q = listState.q.trim().toLowerCase();
    const rows = stories.filter(
      (s) => matchFilter(s, listState.filter) && (!q || `${s.data.title} ${s.slug} ${(s.data.tags ?? []).join(' ')}`.toLowerCase().includes(q)),
    );
    if (!rows.length) {
      list.replaceChildren(
        h(
          'div',
          { class: 'p-10 text-center' },
          h('p', { class: 'text-sm text-zinc-500' }, stories.length ? 'Không có truyện nào khớp bộ lọc.' : 'Chưa có truyện nào.'),
          !stories.length && h('a', { href: '/admin/import/', class: btn.primary + ' mt-4' }, '+ Thêm truyện đầu tiên'),
        ),
      );
      return;
    }
    list.replaceChildren(
      ...rows.map((s) =>
        h(
          'div',
          { class: 'group relative flex items-center gap-3 border-b border-zinc-100 px-3 py-3 last:border-0 hover:bg-blue-50/40 sm:gap-4 sm:px-4' },
          thumb(s, 'h-12 w-20 shrink-0 rounded-md sm:h-14 sm:w-[106px]'),
          h(
            'div',
            { class: 'min-w-0 flex-1' },
            // Link phủ cả dòng: bấm vào đâu cũng mở truyện
            h('a', { href: storyHash(s), class: 'line-clamp-2 font-semibold leading-snug text-slate-900 after:absolute after:inset-0 group-hover:text-accent' }, s.data.title ?? s.slug),
            h(
              'div',
              { class: 'mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500' },
              statusBadges(s),
              h('span', {}, `${counts.get(s.slug) ?? 0} chương`),
              h('span', { class: 'hidden sm:inline' }, `· ${dateOnly(s.data.publishDate)}`),
              h('span', { class: 'hidden md:inline' }, `· ${(s.data.genres ?? []).map(genreName).join(', ')}`),
            ),
          ),
          h(
            'div',
            { class: 'relative z-10 flex shrink-0 items-center' },
            h('a', { href: `${storyHash(s)}/edit`, class: btn.icon, title: 'Sửa thông tin truyện', 'aria-label': 'Sửa' }, icon('edit')),
            h('a', { href: `/story/${s.slug}/`, target: '_blank', class: btn.icon.replace('inline-flex', 'hidden sm:inline-flex'), title: 'Xem trên site', 'aria-label': 'Xem trên site' }, icon('external')),
            h('button', { type: 'button', class: btn.iconDanger, title: 'Xoá truyện', 'aria-label': 'Xoá', onclick: () => confirmDeleteStory(s) }, icon('trash')),
          ),
        ),
      ),
    );
  };

  const search = h('input', {
    class: input.replace('mt-1 ', '') + ' sm:w-72',
    type: 'search',
    placeholder: 'Tìm theo tên, slug, tag…',
    value: listState.q,
    oninput: (e: Event) => {
      listState.q = (e.target as HTMLInputElement).value;
      renderRows();
    },
  });

  show(
    pageBar({
      title: h('span', {}, 'Truyện ', h('span', { class: 'text-base font-normal text-zinc-400' }, `(${stories.length})`)),
      actions: [h('a', { href: '/admin/import/', class: btn.primary }, '+ Thêm truyện')],
    }),
    h('div', { class: 'mb-4 flex flex-col gap-3 sm:flex-row sm:items-center' }, search, tabs),
    list,
    h(
      'p',
      { class: 'mt-6 text-xs text-zinc-500' },
      `${b.label}. `,
      h('button', { type: 'button', class: 'text-accent underline', onclick: () => disconnectAndReload(b) }, b.kind === 'server' ? 'Đăng xuất' : 'Đổi kết nối'),
      b.kind === 'local'
        ? ' · Thay đổi được ghi thẳng vào thư mục dự án; dùng git push để đưa lên site.'
        : ' · Lưu xong, bấm "🚀 Đăng lên site" trên thanh trên cùng để site cập nhật (1–2 phút). Nếu quên, site tự đăng mỗi ngày.',
    ),
  );
  renderTabs();
  renderRows();
  if (matchMedia('(min-width: 640px)').matches) search.focus();
}

async function confirmDeleteStory(s: StoryRec) {
  const n = counts.get(s.slug) ?? 0;
  const typed = prompt(`Xoá truyện "${s.data.title}" cùng ${n} chương?\nKhông thể hoàn tác.\n\nGõ slug để xác nhận: ${s.slug}`);
  if (typed === null) return;
  if (typed.trim() !== s.slug) return toast('Slug không khớp, chưa xoá gì.', false);
  try {
    await deleteStory(b, s, stories);
    await reload();
    toast('Đã xoá truyện.');
    if (location.hash === '' || location.hash === '#/') route();
    else go('#/');
  } catch (e) {
    toast((e as Error).message, false);
  }
}

// ------------------------------------------------------------ Chi tiết truyện + danh sách chương

async function storyView(s: StoryRec) {
  show(pageBar({ crumbs: [['Truyện', '#/']], title: s.data.title }), h('p', { class: 'text-sm text-zinc-500' }, 'Đang tải chương…'));
  const chapters = await loadChapters(b, s.slug);
  counts.set(s.slug, chapters.length);

  const numbers = chapters.map((c) => Number(c.data.number));
  const dupes = [...new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i))];
  const gaps = numbers.length ? Array.from({ length: Math.max(...numbers) }, (_, i) => i + 1).filter((n) => !numbers.includes(n)) : [];
  const nextNumber = numbers.length ? Math.max(...numbers) + 1 : 1;
  const totalWords = chapters.reduce((sum, c) => sum + wordCount(c.body), 0);

  const addButtons = (extra = '') =>
    h(
      'div',
      { class: 'flex flex-wrap gap-2 ' + extra },
      h('a', { href: `${storyHash(s)}/chapter/new`, class: btn.primary }, `+ Thêm chương ${nextNumber}`),
      h('a', { href: `${storyHash(s)}/bulk`, class: btn.secondary }, 'Dán nhiều chương…'),
    );

  show(
    pageBar({
      crumbs: [['Truyện', '#/']],
      title: s.data.title,
      actions: [
        h('a', { href: `${storyHash(s)}/edit`, class: btn.secondary }, icon('edit'), 'Sửa thông tin'),
        h('a', { href: `/story/${s.slug}/`, target: '_blank', class: btn.secondary }, icon('external'), 'Xem'),
      ],
    }),
    h(
      'section',
      { class: 'flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:p-5' },
      thumb(s, 'aspect-[1200/630] w-full rounded-lg sm:w-64 sm:shrink-0'),
      h(
        'div',
        { class: 'min-w-0 flex-1 space-y-2' },
        h('div', { class: 'flex flex-wrap gap-1' }, statusBadges(s)),
        h('p', { class: 'text-sm text-zinc-700' }, s.data.description),
        h(
          'dl',
          { class: 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-1 text-xs' },
          h('dt', { class: 'text-zinc-500' }, 'Slug'),
          h('dd', { class: 'font-mono text-zinc-700' }, s.slug),
          h('dt', { class: 'text-zinc-500' }, 'Ngày đăng'),
          h('dd', { class: 'text-zinc-700' }, dateOnly(s.data.publishDate)),
          h('dt', { class: 'text-zinc-500' }, 'Thể loại'),
          h('dd', { class: 'text-zinc-700' }, (s.data.genres ?? []).map(genreName).join(', ')),
          (s.data.tags ?? []).length > 0 && [h('dt', { class: 'text-zinc-500' }, 'Tag'), h('dd', { class: 'text-zinc-700' }, s.data.tags.join(', '))],
          h('dt', { class: 'text-zinc-500' }, 'Độ dài'),
          h('dd', { class: 'text-zinc-700' }, `${chapters.length} chương · ${totalWords.toLocaleString()} chữ`),
        ),
      ),
    ),

    h(
      'div',
      { class: 'mb-3 mt-8 flex flex-wrap items-center justify-between gap-3' },
      h('h2', { class: 'text-lg font-bold' }, `Chương (${chapters.length})`),
      addButtons(),
    ),
    (dupes.length > 0 || gaps.length > 0) &&
      h(
        'p',
        { class: 'mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800' },
        dupes.length ? `⚠️ Trùng số chương: ${dupes.join(', ')}. ` : '',
        gaps.length ? `⚠️ Thiếu chương số: ${gaps.join(', ')}.` : '',
      ),
    h(
      'div',
      { class: 'overflow-hidden rounded-xl border border-zinc-200 bg-white' },
      chapters.length === 0
        ? h(
            'div',
            { class: 'p-10 text-center' },
            h('p', { class: 'text-sm text-zinc-500' }, 'Truyện chưa có chương nào.'),
            addButtons('mt-4 justify-center'),
          )
        : h(
            'ol',
            {},
            chapters.map((c) =>
              h(
                'li',
                { class: 'group relative flex items-center gap-3 border-b border-zinc-100 px-3 py-2.5 last:border-0 hover:bg-blue-50/40 sm:px-4' },
                h(
                  'span',
                  { class: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-accent' },
                  String(c.data.number).padStart(2, '0'),
                ),
                h(
                  'div',
                  { class: 'min-w-0 flex-1' },
                  h('a', { href: chapterHash(s, c), class: 'line-clamp-2 text-sm font-medium text-slate-900 after:absolute after:inset-0 group-hover:text-accent' }, c.data.title || '(chưa có tên)'),
                  h(
                    'div',
                    { class: 'mt-0.5 flex items-center gap-2 text-xs text-zinc-500' },
                    `${wordCount(c.body).toLocaleString()} chữ`,
                    c.data.draft && badge('Nháp', 'bg-yellow-100 text-yellow-800'),
                  ),
                ),
                h(
                  'div',
                  { class: 'relative z-10 flex shrink-0 items-center' },
                  h('a', { href: `/story/${s.slug}/chapter-${c.data.number}/`, target: '_blank', class: btn.icon, title: 'Xem trên site', 'aria-label': 'Xem trên site' }, icon('external')),
                  h(
                    'button',
                    {
                      type: 'button',
                      class: btn.iconDanger,
                      title: 'Xoá chương',
                      'aria-label': 'Xoá chương',
                      onclick: async () => {
                        if (!confirm(`Xoá chương ${c.data.number}: "${c.data.title}"?`)) return;
                        try {
                          await deleteChapter(b, s.slug, c);
                          toast('Đã xoá chương.');
                          storyView(s);
                        } catch (e) {
                          toast((e as Error).message, false);
                        }
                      },
                    },
                    icon('trash'),
                  ),
                ),
              ),
            ),
          ),
    ),
    h(
      'div',
      { class: 'mt-10 rounded-xl border border-red-100 bg-white p-4 sm:p-5' },
      h('h2', { class: 'text-sm font-semibold text-red-700' }, 'Vùng nguy hiểm'),
      h('p', { class: 'mt-1 text-xs text-zinc-500' }, 'Xoá truyện sẽ xoá luôn toàn bộ chương. Không thể hoàn tác.'),
      h('button', { type: 'button', class: btn.danger + ' mt-3', onclick: () => confirmDeleteStory(s) }, icon('trash'), 'Xoá truyện này'),
    ),
  );
}

// ------------------------------------------------------------ Sửa thông tin truyện

function storyEdit(s: StoryRec) {
  const d = s.data;
  const markDirty = () => (dirty = true);
  const text = (value: unknown, extra: Record<string, any> = {}) => h('input', { class: input, value: value ?? '', oninput: markDirty, ...extra });
  const area = (value: unknown, rows: number, extra: Record<string, any> = {}) => h('textarea', { class: input, rows, value: value ?? '', oninput: markDirty, ...extra });
  const counter = (el: HTMLInputElement | HTMLTextAreaElement, max: number) => {
    const span = h('span', { class: 'font-normal text-zinc-400' });
    const upd = () => (span.textContent = ` ${el.value.length}/${max}`);
    el.addEventListener('input', upd);
    upd();
    return span;
  };

  const title = text(d.title, { required: true });
  const description = area(d.description, 3, { maxLength: 200, required: true });
  const summary = area(s.body, 8);
  const coverAlt = text(d.coverAlt, { placeholder: 'Mô tả ngắn nội dung ảnh' });
  const tags = text((d.tags ?? []).join(', '), { placeholder: 'mafia boss, waitress' });
  const publishDate = text(dateOnly(d.publishDate), { type: 'date', required: true });
  const seoTitle = text(d.seoTitle, { maxLength: 70 });
  const seoDescription = area(d.seoDescription, 2, { maxLength: 170 });
  const status = h('select', { class: input, onchange: markDirty }, h('option', { value: 'completed', selected: d.status !== 'ongoing' }, 'Hoàn thành'), h('option', { value: 'ongoing', selected: d.status === 'ongoing' }, 'Đang ra'));
  const author = h('select', { class: input, onchange: markDirty }, authors.map((a) => h('option', { value: a.id, selected: a.id === d.author }, a.name)));
  const featured = h('input', { type: 'checkbox', class: 'h-4 w-4', checked: !!d.featured, onchange: markDirty });
  const draft = h('input', { type: 'checkbox', class: 'h-4 w-4', checked: !!d.draft, onchange: markDirty });
  const genreBoxes = settings.genres.map((g) => h('input', { type: 'checkbox', class: 'h-4 w-4', value: g.id, checked: (d.genres ?? []).includes(g.id), onchange: markDirty }));

  let newCover: Blob | null = null;
  const picker = coverPicker({
    current: thumb(s, ''),
    onPick: (blob) => {
      newCover = blob;
      dirty = true;
    },
  });

  const save = h('button', { class: btn.primary, type: 'submit', form: 'story-form' }, 'Lưu');
  bindSave(save);

  const form = h(
    'form',
    {
      id: 'story-form',
      class: 'grid gap-5 lg:grid-cols-[1fr_340px]',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const genres = genreBoxes.filter((x) => x.checked).map((x) => x.value);
        if (!genres.length) return toast('Chọn ít nhất 1 thể loại.', false);
        busy(save, 'Đang lưu…', async () => {
          const data: Record<string, any> = {
            ...d,
            title: title.value.trim(),
            description: description.value.trim(),
            coverAlt: coverAlt.value.trim(),
            genres,
            tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean),
            author: author.value,
            publishDate: publishDate.value,
            updatedDate: today(),
            status: status.value,
            featured: featured.checked,
            draft: draft.checked,
            seoTitle: seoTitle.value.trim(),
            seoDescription: seoDescription.value.trim(),
          };
          await saveStory(b, { ...s, data, body: summary.value }, newCover, stories);
          dirty = false;
          await reload();
          toast('Đã lưu truyện.');
          go(storyHash(s));
        });
      },
    },
    h(
      'div',
      { class: 'min-w-0 space-y-5' },
      card(
        field('Tên truyện *', title),
        field('Mô tả ngắn *', description, h('span', {}, 'Hiện trên thẻ truyện và Google.', counter(description, 200))),
        field('Tóm tắt', summary, 'Hiện ở đầu trang giới thiệu truyện. Mỗi đoạn cách nhau 1 dòng trống.'),
      ),
      h(
        'details',
        { class: 'rounded-xl border border-zinc-200 bg-white p-4 sm:p-5', open: !!(d.seoTitle || d.seoDescription) },
        h('summary', { class: 'cursor-pointer text-sm font-semibold' }, 'SEO nâng cao (không bắt buộc)'),
        h(
          'div',
          { class: 'mt-4 space-y-4' },
          field('Tiêu đề SEO', seoTitle, h('span', {}, 'Để trống = dùng tên truyện.', counter(seoTitle, 70))),
          field('Mô tả SEO', seoDescription, h('span', {}, 'Để trống = dùng mô tả ngắn.', counter(seoDescription, 170))),
          field('Slug (URL)', text(s.slug, { disabled: true, class: input + ' bg-zinc-50 font-mono text-zinc-500' }), 'Không đổi được để tránh hỏng link đã chia sẻ.'),
        ),
      ),
    ),
    h(
      'aside',
      { class: 'min-w-0 space-y-5' },
      card(h('p', { class: 'text-sm font-medium' }, 'Ảnh bìa'), picker, field('Mô tả ảnh (alt)', coverAlt)),
      card(
        h('label', { class: 'flex items-center gap-2 text-sm font-medium' }, draft, 'Nháp (ẩn khỏi site)'),
        h('label', { class: 'flex items-center gap-2 text-sm font-medium' }, featured, 'Nổi bật (lên đầu trang chủ)'),
        field('Ngày đăng', publishDate, 'Chọn ngày tương lai để hẹn giờ đăng.'),
        field('Tình trạng', status),
      ),
      card(
        h('fieldset', {}, h('legend', { class: 'text-sm font-medium' }, 'Thể loại *'), genreBoxes.map((box, i) => h('label', { class: 'mt-2 flex items-center gap-2 text-sm' }, box, settings.genres[i].name))),
        field('Tag', tags, 'Phân cách bằng dấu phẩy.'),
        field('Tác giả', author),
      ),
    ),
  );
  show(
    pageBar({
      crumbs: [['Truyện', '#/'], [s.data.title, storyHash(s)]],
      title: 'Sửa thông tin truyện',
      actions: [h('a', { href: storyHash(s), class: btn.secondary }, 'Huỷ'), save],
    }),
    form,
  );
}

// ------------------------------------------------------------ Sửa / thêm 1 chương

async function chapterEdit(s: StoryRec, file: string | undefined) {
  const chapters = await loadChapters(b, s.slug);
  const isNew = file === 'new';
  const nextNumber = chapters.length ? Math.max(...chapters.map((c) => Number(c.data.number))) + 1 : 1;
  const existing = chapters.find((c) => c.file === file);
  if (!isNew && !existing) return show(pageBar({ crumbs: [['Truyện', '#/'], [s.data.title, storyHash(s)]], title: 'Không tìm thấy chương' }));

  const ch: ChapterRec = existing ?? { file: chapterFileName(nextNumber), data: { story: s.slug, number: nextNumber, title: '' }, body: '' };
  const idx = existing ? chapters.indexOf(existing) : -1;
  const prev = idx > 0 ? chapters[idx - 1] : undefined;
  const next = idx >= 0 ? chapters[idx + 1] : undefined;
  const markDirty = () => (dirty = true);

  const number = h('input', { class: input, type: 'number', min: 1, value: ch.data.number, required: true, oninput: markDirty });
  const title = h('input', { class: input + ' text-base font-semibold', value: ch.data.title ?? '', required: true, placeholder: 'VD: The Warning After Dessert', oninput: markDirty });
  const draft = h('input', { type: 'checkbox', class: 'h-4 w-4', checked: !!ch.data.draft, onchange: markDirty });
  const seo = h('textarea', { class: input, rows: 3, maxLength: 170, value: ch.data.seoDescription ?? '', oninput: markDirty });
  const words = h('span', { class: 'text-xs font-normal text-zinc-500' });
  const body = h('textarea', {
    class: input + ' min-h-[65vh] font-serif text-[16px] leading-7',
    value: ch.body,
    required: true,
    placeholder: 'Dán nội dung chương vào đây.\n\nMỗi đoạn văn cách nhau 1 dòng trống. Hỗ trợ *nghiêng* và **đậm**.',
    oninput: () => {
      markDirty();
      words.textContent = `${wordCount(body.value).toLocaleString()} chữ`;
    },
  });
  words.textContent = `${wordCount(ch.body).toLocaleString()} chữ`;

  const save = h('button', { class: btn.primary, type: 'submit', form: 'chapter-form' }, isNew ? 'Tạo chương' : 'Lưu');
  bindSave(save);

  const form = h(
    'form',
    {
      id: 'chapter-form',
      class: 'grid gap-5 lg:grid-cols-[1fr_280px]',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const n = Number(number.value);
        if (chapters.some((c) => c !== existing && Number(c.data.number) === n)) return toast(`Đã có chương số ${n}.`, false);
        busy(save, 'Đang lưu…', async () => {
          let fileName = ch.file;
          if (isNew) {
            fileName = chapterFileName(n);
            if (chapters.some((c) => c.file === fileName)) fileName = fileName.replace(/\.md$/, `-${Date.now().toString(36)}.md`);
          }
          const text = body.value.replace(/\r\n?/g, '\n').trim();
          await saveChapter(b, s.slug, { file: fileName, data: { ...ch.data, number: n, title: title.value.trim(), draft: draft.checked, seoDescription: seo.value.trim() }, body: text });
          dirty = false;
          if (isNew) {
            toast(`Đã tạo chương ${n}.`);
            go(storyHash(s));
          } else {
            ch.data.number = n;
            toast('Đã lưu chương.');
          }
        });
      },
    },
    h('div', { class: 'min-w-0 space-y-4' }, field('Tên chương *', title), h('label', { class: 'block text-sm font-medium text-zinc-800' }, h('span', { class: 'flex items-baseline justify-between' }, 'Nội dung *', words), body)),
    h(
      'aside',
      { class: 'min-w-0 space-y-5' },
      card(
        field('Số chương *', number),
        h('label', { class: 'flex items-center gap-2 text-sm font-medium' }, draft, 'Nháp (ẩn khỏi site)'),
        field('Mô tả SEO', seo, 'Để trống = tự lấy đoạn đầu chương.'),
      ),
      (prev || next) &&
        card(
          h('p', { class: 'text-xs font-medium uppercase tracking-wide text-zinc-500' }, 'Chuyển chương'),
          h(
            'div',
            { class: 'grid grid-cols-2 gap-2' },
            prev ? h('a', { href: chapterHash(s, prev), class: btn.secondary }, `← Ch. ${prev.data.number}`) : h('span'),
            next ? h('a', { href: chapterHash(s, next), class: btn.secondary }, `Ch. ${next.data.number} →`) : h('span'),
          ),
        ),
      !isNew &&
        card(
          h('a', { href: `/story/${s.slug}/chapter-${ch.data.number}/`, target: '_blank', class: btn.secondary + ' w-full' }, icon('external'), 'Xem trên site'),
          h(
            'button',
            {
              type: 'button',
              class: btn.danger + ' w-full',
              onclick: async () => {
                if (!confirm(`Xoá chương ${ch.data.number}?`)) return;
                try {
                  await deleteChapter(b, s.slug, ch);
                  dirty = false;
                  toast('Đã xoá chương.');
                  go(storyHash(s));
                } catch (err) {
                  toast((err as Error).message, false);
                }
              },
            },
            icon('trash'),
            'Xoá chương',
          ),
        ),
      h('p', { class: 'text-xs text-zinc-400' }, 'Mẹo: nhấn Ctrl + S để lưu nhanh.'),
    ),
  );

  show(
    pageBar({
      crumbs: [['Truyện', '#/'], [s.data.title, storyHash(s)]],
      title: isNew ? `Thêm chương ${nextNumber}` : `Chương ${ch.data.number}`,
      actions: [h('a', { href: storyHash(s), class: btn.secondary }, 'Huỷ'), save],
    }),
    form,
  );
  (isNew ? title : body).focus({ preventScroll: true });
  if (!isNew) body.setSelectionRange(0, 0);
}

// ------------------------------------------------------------ Dán thêm nhiều chương

async function bulkAdd(s: StoryRec) {
  const chapters = await loadChapters(b, s.slug);
  const start = chapters.length ? Math.max(...chapters.map((c) => Number(c.data.number))) + 1 : 1;
  let parsed: { number: number; title: string; body: string }[] = [];

  const lineParas = h('input', { type: 'checkbox', class: 'h-4 w-4', checked: true });
  const text = h('textarea', {
    class: input + ' min-h-[50vh] font-mono text-xs',
    placeholder: `Chapter ${start} - Tên chương\nNội dung chương ${start}...\n\nChapter ${start + 1} - Tên chương\nNội dung chương ${start + 1}...`,
  });
  const preview = h('ol', { class: 'space-y-2' });
  const count = h('span');
  const save = h('button', { class: btn.primary, type: 'button', disabled: true }, 'Lưu các chương');

  const render = () => {
    dirty = !!text.value.trim();
    parsed = splitChapters(text.value, lineParas.checked).map((c, i) => ({ ...c, number: start + i }));
    count.textContent = String(parsed.length);
    save.disabled = !parsed.length;
    preview.replaceChildren(
      ...parsed.map((c) => {
        const wc = wordCount(c.body);
        const t = h('input', { class: 'min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-zinc-300 focus:border-accent focus:outline-none', value: c.title, oninput: () => (c.title = t.value) });
        return h(
          'li',
          { class: 'flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2' },
          h('span', { class: 'w-8 font-mono text-xs text-zinc-400' }, c.number),
          t,
          h('span', { class: `whitespace-nowrap text-xs ${wc < 150 ? 'font-semibold text-red-600' : 'text-zinc-500'}` }, `${wc} chữ`),
        );
      }),
    );
  };
  text.addEventListener('input', render);
  lineParas.addEventListener('change', render);

  save.addEventListener('click', () =>
    busy(save, 'Đang lưu…', async () => {
      const pad = start + parsed.length > 99 ? 3 : 2;
      const taken = new Set(chapters.map((c) => c.file));
      const fileFor = (n: number) => {
        const name = `chapter-${String(n).padStart(pad, '0')}.md`;
        return taken.has(name) ? name.replace(/\.md$/, `-${Date.now().toString(36)}.md`) : name;
      };
      await b.apply(
        parsed.map((c) => ({
          path: `src/content/chapters/${s.slug}/${fileFor(c.number)}`,
          content: `---\nstory: ${s.slug}\nnumber: ${c.number}\ntitle: ${JSON.stringify(c.title)}\n---\n\n${c.body}\n`,
        })),
        `content: add ${parsed.length} chapters to "${s.slug}"`,
      );
      dirty = false;
      toast(`Đã thêm ${parsed.length} chương.`);
      go(storyHash(s));
    }),
  );

  show(
    pageBar({
      crumbs: [['Truyện', '#/'], [s.data.title, storyHash(s)]],
      title: 'Dán nhiều chương',
      actions: [h('a', { href: storyHash(s), class: btn.secondary }, 'Huỷ'), save],
    }),
    h(
      'div',
      { class: 'grid gap-5 lg:grid-cols-[1fr_340px]' },
      card(
        h(
          'p',
          { class: 'text-sm text-zinc-600' },
          'Dán nội dung các chương mới. Mỗi chương bắt đầu bằng một dòng tiêu đề như ',
          h('code', { class: 'rounded bg-zinc-100 px-1' }, 'Chapter 4 - Tên chương'),
          `. Các chương được đánh số tiếp từ chương ${start}.`,
        ),
        text,
        h('label', { class: 'flex items-center gap-2 text-sm' }, lineParas, 'Mỗi dòng xuống hàng là một đoạn văn mới'),
      ),
      h('aside', { class: 'min-w-0' }, card(h('h2', { class: 'text-sm font-semibold' }, 'Xem trước: ', count, ' chương'), h('p', { class: 'text-xs text-zinc-500' }, 'Bấm vào tên chương để sửa.'), preview)),
    ),
  );
  render();
  text.focus();
}
