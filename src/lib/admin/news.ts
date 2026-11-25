// Quản lý tin tức (hash routing, cùng kiểu với app.ts):
//   #/              danh sách tin
//   #/new           thêm tin
//   #/edit/<slug>   sửa tin
import { coverThumb, createNews, dateOnly, deleteNews, loadNews, saveNews, uploadImage, wordCount, type NewsRec } from './content';
import { btn, coverPicker, h, icon, input, markFresh, pageBar, takeFresh, toast, urlBox, type Child } from './dom';
import { createEditor, type RichEditor } from './editor';
import { seoSlug } from '../importer';

let root: HTMLElement;
let items: NewsRec[] = [];
/** Slug của mọi tin, kể cả tin người khác (biên tập viên không thấy trong danh sách) */
let allSlugs: string[] = [];
let dirty = false;
let skipNextRoute = false;
let editor: RichEditor | null = null;
const listState = { q: '' };
/** Tài khoản đang đăng nhập: tác giả của tin mới */
let me = { name: '', isAdmin: false };

export async function startNewsApp(el: HTMLElement) {
  root = el;
  me = { name: el.dataset.author ?? '', isAdmin: el.dataset.admin === '1' };
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
  show(h('p', { class: 'py-10 text-center text-sm text-zinc-500' }, 'Đang tải tin tức…'));
  try {
    ({ news: items, slugs: allSlugs } = await loadNews());
  } catch (e) {
    return show(h('p', { class: 'py-10 text-center text-sm font-medium text-red-600' }, (e as Error).message));
  }
  route();
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  window.scrollTo(0, 0);
  document.onkeydown = null;
  editor?.destroy();
  editor = null;
  if (parts[0] === 'new') return editView(null);
  if (parts[0] === 'edit') {
    const item = items.find((n) => n.slug === parts[1]);
    if (!item) return show(pageBar({ crumbs: [['Tin tức', '#/']], title: 'Không tìm thấy tin' }), h('a', { href: '#/', class: btn.secondary }, '← Về danh sách tin'));
    return editView(item);
  }
  listView();
}

const go = (hash: string) => (location.hash = hash);
const show = (...nodes: (Node | false | null | undefined)[]) => root.replaceChildren(...nodes.filter((n): n is Node => !!n));
const editHash = (n: NewsRec) => `#/edit/${encodeURIComponent(n.slug)}`;

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

function field(label: string, control: HTMLElement, hint?: Child) {
  return h('label', { class: 'block text-sm font-medium text-zinc-800' }, label, control, hint && h('span', { class: 'mt-1 block text-xs font-normal text-zinc-500' }, hint));
}

const card = (...children: Child[]) => h('section', { class: 'space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5' }, ...children);

// ------------------------------------------------------------ Danh sách tin

function listView() {
  const list = h('div', { class: 'overflow-hidden rounded-xl border border-zinc-200 bg-white' });

  const renderRows = () => {
    const q = listState.q.trim().toLowerCase();
    const rows = items.filter((n) => !q || `${n.data.title} ${n.slug} ${n.ownerName}`.toLowerCase().includes(q));
    if (!rows.length) {
      list.replaceChildren(
        h(
          'div',
          { class: 'p-10 text-center' },
          h('p', { class: 'text-sm text-zinc-500' }, items.length ? 'Không có tin nào khớp từ khoá.' : 'Chưa có tin nào.'),
          !items.length && h('a', { href: '#/new', class: btn.primary + ' mt-4' }, '+ Viết tin đầu tiên'),
        ),
      );
      return;
    }
    list.replaceChildren(
      ...rows.map((n) =>
        h(
          'div',
          { class: 'group relative flex items-center gap-3 border-b border-zinc-100 px-3 py-3 last:border-0 hover:bg-blue-50/40 sm:gap-4 sm:px-4' },
          h('img', { src: coverThumb(n.data.cover, 240), alt: '', loading: 'lazy', class: 'h-12 w-20 shrink-0 rounded-md bg-zinc-200 object-cover sm:h-14 sm:w-[106px]' }),
          h(
            'div',
            { class: 'min-w-0 flex-1' },
            h('a', { href: editHash(n), class: 'line-clamp-2 font-semibold leading-snug text-slate-900 after:absolute after:inset-0 group-hover:text-accent' }, n.data.title),
            h(
              'div',
              { class: 'mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500' },
              h('span', {}, dateOnly(n.data.publishDate)),
              me.isAdmin && h('span', {}, `· 👤 ${n.ownerName || 'Chưa gán'}`),
              h('span', { class: 'hidden sm:inline' }, `· ${wordCount(n.body).toLocaleString()} chữ`),
            ),
          ),
          h(
            'div',
            { class: 'relative z-10 flex shrink-0 items-center' },
            h('a', { href: editHash(n), class: btn.icon, title: 'Sửa tin', 'aria-label': 'Sửa' }, icon('edit')),
            h('a', { href: `/news/${n.slug}/`, target: '_blank', class: btn.icon.replace('inline-flex', 'hidden sm:inline-flex'), title: 'Xem trên site', 'aria-label': 'Xem trên site' }, icon('external')),
            h('button', { type: 'button', class: btn.iconDanger, title: 'Xoá tin', 'aria-label': 'Xoá', onclick: () => confirmDelete(n) }, icon('trash')),
          ),
        ),
      ),
    );
  };

  const search = h('input', {
    class: input.replace('mt-1 ', '') + ' sm:w-72',
    type: 'search',
    placeholder: me.isAdmin ? 'Tìm theo tiêu đề, slug, tác giả…' : 'Tìm theo tiêu đề, slug…',
    value: listState.q,
    oninput: (e: Event) => {
      listState.q = (e.target as HTMLInputElement).value;
      renderRows();
    },
  });

  show(
    pageBar({
      title: h('span', {}, 'Tin tức ', h('span', { class: 'text-base font-normal text-zinc-400' }, `(${items.length})`)),
      actions: [h('a', { href: '#/new', class: btn.primary }, '+ Viết tin')],
    }),
    h('div', { class: 'mb-4' }, search),
    list,
  );
  renderRows();
}

async function confirmDelete(n: NewsRec) {
  if (!confirm(`Xoá tin "${n.data.title}"?\nẢnh bìa và ảnh trong bài cũng bị xoá. Không thể hoàn tác.`)) return;
  try {
    await deleteNews(n);
    items = items.filter((x) => x !== n);
    dirty = false;
    toast('Đã xoá tin.');
    if (location.hash === '' || location.hash === '#/') listView();
    else go('#/');
  } catch (e) {
    toast((e as Error).message, false);
  }
}

// ------------------------------------------------------------ Thêm / sửa tin

function editView(item: NewsRec | null) {
  const isNew = !item;
  const d = item?.data;
  const markDirty = () => (dirty = true);
  const text = (value: unknown, extra: Record<string, any> = {}) => h('input', { class: input, value: value ?? '', oninput: markDirty, ...extra });
  const counter = (el: HTMLInputElement | HTMLTextAreaElement, max: number) => {
    const span = h('span', { class: 'font-normal text-zinc-400' });
    const upd = () => (span.textContent = ` ${el.value.length}/${max}`);
    el.addEventListener('input', upd);
    upd();
    return span;
  };

  const title = text(d?.title, { required: true, class: input + ' text-base font-semibold', placeholder: 'VD: New Stories This Week' });
  const slug = text(item?.slug ?? '', { required: !item, disabled: !!item, pattern: '[a-z0-9]+(-[a-z0-9]+)*', class: input + ' font-mono' + (item ? ' bg-zinc-50 text-zinc-500' : '') });
  let slugTouched = false;
  if (isNew) {
    const taken = new Set(allSlugs);
    title.addEventListener('input', () => {
      if (!slugTouched) slug.value = seoSlug(title.value, taken);
    });
    slug.addEventListener('input', () => {
      // Xoá trống ô slug = quay lại tự tạo theo tiêu đề
      slugTouched = slug.value !== '';
      if (!slugTouched) slug.value = seoSlug(title.value, taken);
    });
  }
  const description = h('textarea', { class: input, rows: 3, maxLength: 200, value: d?.description ?? '', oninput: markDirty, placeholder: 'Để trống = tự lấy đoạn đầu bài' });
  const coverAlt = text(d?.coverAlt, { placeholder: 'Mô tả ngắn nội dung ảnh' });
  // Tác giả = người đăng tin (tin mới: tài khoản đang đăng nhập), không đổi được
  const author = h('p', { class: 'mt-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-normal text-zinc-700' }, item ? item.ownerName || 'Chưa gán' : me.name);
  const seoTitle = text(d?.seoTitle, { maxLength: 70 });

  let newCover: Blob | null = null;
  const picker = coverPicker({
    current: item ? h('img', { src: coverThumb(item.data.cover, 800), alt: '' }) : undefined,
    required: isNew,
    onPick: (blob) => {
      newCover = blob;
      dirty = true;
    },
  });

  // ---- Nội dung: trình soạn thảo trực quan (lưu dạng Markdown)
  const words = h('span', { class: 'text-xs font-normal text-zinc-500' });
  const updateWords = () => (words.textContent = `${wordCount(body.getText()).toLocaleString()} chữ`);
  editor?.destroy();
  const body = (editor = createEditor({
    markdown: item?.body ?? '',
    upload: uploadImage,
    onChange: () => {
      markDirty();
      updateWords();
    },
  }));
  updateWords();

  const save = h('button', { class: btn.primary, type: 'submit', form: 'news-form' }, isNew ? 'Đăng tin' : 'Lưu');
  document.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save.click();
    }
  };

  const form = h(
    'form',
    {
      id: 'news-form',
      class: 'grid gap-5 lg:grid-cols-[1fr_340px]',
      novalidate: true,
      onsubmit: (e: Event) => {
        e.preventDefault();
        if (!title.value.trim()) return toast('Chưa nhập tiêu đề.', false);
        if (isNew && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug.value)) return toast('Slug chỉ gồm chữ thường a-z, số và dấu gạch ngang.', false);
        if (isNew && allSlugs.includes(slug.value)) return toast('Slug này đã có tin khác dùng.', false);
        const markdown = body.getMarkdown();
        if (!markdown) return toast('Chưa nhập nội dung.', false);
        if (isNew && !newCover) return toast('Chưa chọn ảnh bìa.', false);
        busy(save, 'Đang lưu…', async () => {
          // Ngày đăng, tác giả do server đặt (hôm nay, người đăng)
          const rec: NewsRec = {
            slug: item?.slug ?? slug.value,
            body: markdown,
            ownerId: item?.ownerId ?? null,
            ownerName: item?.ownerName ?? me.name,
            data: {
              title: title.value.trim(),
              description: description.value.trim(),
              cover: d?.cover ?? '',
              coverAlt: coverAlt.value.trim(),
              publishDate: d?.publishDate ?? '',
              updatedDate: d?.updatedDate ?? '',
              seoTitle: seoTitle.value.trim(),
            },
          };
          if (isNew) await createNews(rec, newCover!);
          else await saveNews(rec, newCover);
          dirty = false;
          ({ news: items, slugs: allSlugs } = await loadNews());
          toast(isNew ? 'Đã đăng tin.' : 'Đã lưu tin.');
          if (isNew) {
            markFresh('news:' + rec.slug);
            go(editHash(rec));
          }
          else editView(items.find((n) => n.slug === rec.slug) ?? null);
        });
      },
    },
    h(
      'div',
      { class: 'min-w-0 space-y-5' },
      card(
        field('Tiêu đề *', title),
        isNew
          ? field('Slug (URL) *', slug, 'Tự tạo từ tiêu đề (không dấu, bỏ từ nối, ≤ 60 ký tự, không trùng). Có thể sửa; không đổi được sau khi đăng.')
          : urlBox(`/news/${item!.slug}/`, { label: 'Link bài viết' }),
        field('Mô tả ngắn', description, h('span', {}, 'Hiện trên thẻ tin và Google.', counter(description, 200))),
      ),
      card(
        h('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, h('span', { class: 'text-sm font-medium text-zinc-800' }, 'Nội dung * ', words)),
        body.element,
      ),
    ),
    h(
      'aside',
      { class: 'min-w-0 space-y-5' },
      card(h('p', { class: 'text-sm font-medium' }, isNew ? 'Ảnh bìa *' : 'Ảnh bìa'), picker, field('Mô tả ảnh (alt)', coverAlt)),
      card(
        h(
          'div',
          { class: 'text-sm font-medium text-zinc-800' },
          'Tác giả',
          author,
          h('span', { class: 'mt-1 block text-xs font-normal text-zinc-500' }, item ? `Đăng ngày ${dateOnly(d!.publishDate)}.` : 'Tin đăng ngay khi bấm "Đăng tin" và lên đầu danh sách.'),
        ),
      ),
      h(
        'details',
        { class: 'rounded-xl border border-zinc-200 bg-white p-4 sm:p-5', open: !!d?.seoTitle },
        h('summary', { class: 'cursor-pointer text-sm font-semibold' }, 'SEO (không bắt buộc)'),
        h('div', { class: 'mt-4' }, field('Tiêu đề SEO', seoTitle, h('span', {}, 'Để trống = dùng tiêu đề.', counter(seoTitle, 70)))),
      ),
      item &&
        card(
          h('button', { type: 'button', class: btn.danger + ' w-full', onclick: () => confirmDelete(item) }, icon('trash'), 'Xoá tin này'),
        ),
      h('p', { class: 'text-xs text-zinc-400' }, 'Mẹo: nhấn Ctrl + S để lưu nhanh.'),
    ),
  );

  show(
    pageBar({
      crumbs: [['Tin tức', '#/']],
      title: isNew ? 'Viết tin mới' : 'Sửa tin',
      actions: [h('a', { href: '#/', class: btn.secondary }, 'Huỷ'), save],
    }),
    item && takeFresh('news:' + item.slug) && h('div', { class: 'mb-5' }, urlBox(`/news/${item.slug}/`, { fresh: '🎉 Đã đăng tin! Copy link để chia sẻ:' })),
    form,
  );
  if (isNew) title.focus();
}
