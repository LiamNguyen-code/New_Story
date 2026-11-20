// Helper tạo DOM an toàn (textContent, không innerHTML) + các mảnh UI dùng chung cho trang admin.
export type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && !['list', 'form', 'type'].includes(k)) (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]) {
  for (const c of children.flat(Infinity as 1) as Child[]) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** Cắt ảnh về 1200x630 (kiểu object-fit: cover) và xuất WebP. */
export async function cropCover(file: File, canvas = document.createElement('canvas')): Promise<Blob> {
  canvas.width = 1200;
  canvas.height = 630;
  const img = await createImageBitmap(file);
  const scale = Math.max(1200 / img.width, 630 / img.height);
  const w = img.width * scale;
  const hh = img.height * scale;
  canvas.getContext('2d')!.drawImage(img, (1200 - w) / 2, (630 - hh) / 2, w, hh);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không xuất được ảnh'))), 'image/webp', 0.85));
}

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50',
  secondary:
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50',
  danger:
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50',
  icon: 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900',
  iconDanger: 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600',
};
export const input =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-blue-100';

// Icon SVG nhỏ (stroke)
const ICONS: Record<string, string> = {
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1 1 0 1 0 0-.01',
  chevron: 'M9 6l6 6-6 6',
};
export function icon(name: keyof typeof ICONS | string, cls = 'h-4 w-4') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] ?? '');
  svg.append(path);
  return svg;
}

/** Thanh tiêu đề dính trên cùng: breadcrumb + tiêu đề + nút hành động (luôn thấy nút Lưu). */
export function pageBar(opts: { crumbs?: [string, string?][]; title: Child; actions?: Child[] }) {
  return h(
    'div',
    { class: 'sticky top-14 z-30 -mx-4 mb-6 border-b border-zinc-200 bg-zinc-50/95 px-4 py-3 backdrop-blur' },
    opts.crumbs &&
      h(
        'nav',
        { class: 'mb-1 flex min-w-0 items-center gap-1.5 text-xs text-zinc-500' },
        opts.crumbs.map(([label, href], i) => [
          i > 0 && h('span', { class: 'text-zinc-300' }, '/'),
          href ? h('a', { href, class: 'shrink-0 truncate hover:text-accent', style: 'max-width: 40vw' }, label) : h('span', { class: 'truncate' }, label),
        ]),
      ),
    h(
      'div',
      { class: 'flex flex-wrap items-center gap-x-3 gap-y-2' },
      h('h1', { class: 'mr-auto min-w-0 text-xl font-bold text-slate-900 sm:text-2xl' }, opts.title),
      opts.actions && h('div', { class: 'flex flex-wrap items-center gap-2' }, opts.actions),
    ),
  );
}

/** Ô chọn ảnh bìa: khung xem trước + nút chọn ảnh (thay cho "Choose File" mặc định). */
export function coverPicker(opts: { current?: HTMLImageElement; onPick: (blob: Blob) => void; required?: boolean }) {
  const img = opts.current ?? h('img', { alt: '', class: 'hidden' });
  img.className = 'aspect-[1200/630] w-full rounded-lg bg-zinc-100 object-cover' + (img.getAttribute('src') || opts.current ? '' : ' hidden');
  const empty = h(
    'div',
    { class: 'flex aspect-[1200/630] w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-zinc-300 text-xs text-zinc-500' },
    icon('image', 'h-6 w-6'),
    'Chưa có ảnh bìa',
  );
  if (opts.current) empty.classList.add('hidden');
  const file = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', required: opts.required });
  const label = h('label', { class: btn.secondary + ' mt-2 w-full cursor-pointer' }, icon('image'), opts.current ? 'Đổi ảnh bìa…' : 'Chọn ảnh bìa…', file);
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    const blob = await cropCover(f);
    img.src = URL.createObjectURL(blob);
    img.classList.remove('hidden');
    empty.classList.add('hidden');
    opts.onPick(blob);
  });
  return h(
    'div',
    {},
    img,
    empty,
    label,
    h('p', { class: 'mt-1 text-xs text-zinc-500' }, 'Tự cắt về 1200×630 và nén WebP. Ảnh ngang cho kết quả đẹp nhất.'),
  );
}

export function toast(msg: string, ok = true) {
  const t = h(
    'div',
    {
      class: `fixed bottom-5 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${ok ? 'bg-emerald-600' : 'bg-red-600'}`,
      role: 'status',
    },
    msg,
  );
  document.body.append(t);
  setTimeout(() => t.remove(), ok ? 2500 : 6000);
}
