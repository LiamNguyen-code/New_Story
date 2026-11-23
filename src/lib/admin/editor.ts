// Trình soạn thảo trực quan (Tiptap) cho nội dung tin. Nội dung vẫn lưu dạng Markdown:
// mở: Markdown → HTML (renderMarkdown), lưu: HTML → Markdown (htmlToMarkdown).
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { NodeSelection } from '@tiptap/pm/state';
import { renderMarkdown } from '../markdown';
import { htmlToMarkdown } from './html-to-md';
import { h, icon, toast } from './dom';

export interface RichEditor {
  /** Thanh công cụ + vùng soạn thảo */
  element: HTMLElement;
  getMarkdown(): string;
  getText(): string;
  focus(): void;
  destroy(): void;
}

export function createEditor(opts: { markdown: string; onChange: () => void; upload: (file: File) => Promise<string> }): RichEditor {
  const area = h('div');
  const editor = new Editor({
    element: area,
    content: renderMarkdown(opts.markdown),
    extensions: [
      // Chỉ bật định dạng Markdown biểu diễn được
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        underline: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: 'Viết nội dung tin ở đây… (dán từ Word / Google Docs cũng được)' }),
    ],
    editorProps: {
      attributes: { class: 'news-body rich-editor min-h-[60vh] px-4 py-3 outline-none sm:px-5' },
      // Dán / kéo thả file ảnh → upload rồi chèn
      // Copy từ Word / Excel có kèm 1 ảnh chụp vùng chọn: có chữ thì dán chữ, không upload ảnh
      handlePaste: (_view, e) => (e.clipboardData?.getData('text/plain').trim() ? false : uploadFiles(e.clipboardData?.files)),
      handleDrop: (_view, e) => uploadFiles((e as DragEvent).dataTransfer?.files),
    },
    onUpdate: opts.onChange,
  });

  function uploadFiles(files?: FileList | null) {
    const images = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!images.length) return false;
    images.reduce((p, f) => p.then(() => insertImage(f)), Promise.resolve());
    return true;
  }

  async function insertImage(file: File) {
    imageLabel.textContent = 'Đang tải ảnh…';
    try {
      const src = await opts.upload(file);
      const alt = (prompt('Mô tả ảnh (hiện khi ảnh không tải được, tốt cho SEO):', '') ?? '').replace(/[\[\]]/g, '');
      editor.chain().focus().setImage({ src, alt }).run();
      // Ảnh vừa chèn đang được chọn: gõ tiếp sẽ thay mất ảnh → đưa con trỏ xuống đoạn mới bên dưới
      if (editor.state.selection instanceof NodeSelection) editor.commands.createParagraphNear();
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      imageLabel.textContent = 'Ảnh';
    }
  }

  // ---- Thanh công cụ
  const buttons: { el: HTMLButtonElement; active?: () => boolean; enabled?: () => boolean }[] = [];
  const tool = (label: string, title: string, run: () => void, active?: () => boolean, extraCls = '', enabled?: () => boolean) => {
    const el = h(
      'button',
      {
        type: 'button',
        title,
        class: `inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-30 ${extraCls}`,
        onmousedown: (e: Event) => e.preventDefault(), // giữ vùng chọn trong trình soạn thảo
        onclick: run,
      },
      label,
    );
    buttons.push({ el, active, enabled });
    return el;
  };
  const sep = () => h('span', { class: 'mx-1 h-5 w-px bg-zinc-200' });
  const c = () => editor.chain().focus();

  const blockType = h(
    'select',
    {
      class: 'h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm',
      title: 'Kiểu đoạn',
      onchange: () => {
        const v = blockType.value;
        if (v === 'p') c().setParagraph().run();
        else c().setHeading({ level: Number(v) as 2 | 3 }).run();
      },
    },
    h('option', { value: 'p' }, 'Đoạn văn'),
    h('option', { value: '2' }, 'Tiêu đề lớn'),
    h('option', { value: '3' }, 'Tiêu đề nhỏ'),
  );

  const setLink = () => {
    const prev = editor.getAttributes('link').href ?? '';
    const url = prompt('Địa chỉ liên kết (để trống = bỏ liên kết):', prev);
    if (url === null) return;
    if (!url.trim()) return c().extendMarkRange('link').unsetLink().run();
    if (!/^(https?:\/\/|mailto:|\/|#)/i.test(url.trim()) && /^[\w.-]+\.\w{2,}/.test(url.trim())) {
      return c().extendMarkRange('link').setLink({ href: 'https://' + url.trim() }).run();
    }
    c().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const imageInput = h('input', { type: 'file', accept: 'image/*', class: 'sr-only' });
  const imageLabel = h('span', {}, 'Ảnh');
  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    imageInput.value = '';
    if (file) insertImage(file);
  });
  const imageBtn = h('label', { class: 'inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-sm text-zinc-700 hover:bg-zinc-100', title: 'Chèn ảnh (hoặc dán / kéo thả ảnh vào bài)' }, icon('image', 'h-4 w-4'), imageLabel, imageInput);

  const inTable = () => editor.isActive('table');
  const tableTools = h(
    'div',
    { class: 'flex flex-wrap items-center gap-0.5 border-t border-zinc-100 px-2 py-1 text-xs' },
    h('span', { class: 'mr-1 text-xs font-medium text-zinc-500' }, 'Bảng:'),
    tool('+ Hàng', 'Thêm hàng bên dưới', () => c().addRowAfter().run(), undefined, 'text-xs'),
    tool('+ Cột', 'Thêm cột bên phải', () => c().addColumnAfter().run(), undefined, 'text-xs'),
    tool('− Hàng', 'Xoá hàng đang chọn', () => c().deleteRow().run(), undefined, 'text-xs'),
    tool('− Cột', 'Xoá cột đang chọn', () => c().deleteColumn().run(), undefined, 'text-xs'),
    tool('Xoá bảng', 'Xoá cả bảng', () => c().deleteTable().run(), undefined, 'text-xs text-red-600'),
  );

  const toolbar = h(
    'div',
    { class: 'z-20 rounded-t-lg border-b border-zinc-200 bg-white/95 backdrop-blur sm:sticky sm:top-[8.6rem]' },
    h(
      'div',
      { class: 'flex flex-wrap items-center gap-0.5 px-2 py-1.5' },
      blockType,
      sep(),
      tool('B', 'In đậm (Ctrl+B)', () => c().toggleBold().run(), () => editor.isActive('bold'), 'font-bold'),
      tool('I', 'In nghiêng (Ctrl+I)', () => c().toggleItalic().run(), () => editor.isActive('italic'), 'italic font-serif'),
      tool('S', 'Gạch ngang', () => c().toggleStrike().run(), () => editor.isActive('strike'), 'line-through'),
      tool('Link', 'Chèn / sửa liên kết (chọn chữ trước)', setLink, () => editor.isActive('link'), 'underline'),
      sep(),
      tool('• Danh sách', 'Danh sách dấu chấm', () => c().toggleBulletList().run(), () => editor.isActive('bulletList')),
      tool('1. Danh sách', 'Danh sách đánh số', () => c().toggleOrderedList().run(), () => editor.isActive('orderedList')),
      tool('❝ Trích dẫn', 'Trích dẫn', () => c().toggleBlockquote().run(), () => editor.isActive('blockquote')),
      tool('― Kẻ ngang', 'Đường kẻ ngang', () => c().setHorizontalRule().run()),
      sep(),
      imageBtn,
      tool('Bảng', 'Chèn bảng 3×3', () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), undefined, '', () => !inTable()),
      sep(),
      tool('↶', 'Hoàn tác (Ctrl+Z)', () => c().undo().run(), undefined, '', () => editor.can().undo()),
      tool('↷', 'Làm lại (Ctrl+Y)', () => c().redo().run(), undefined, '', () => editor.can().redo()),
    ),
    tableTools,
  );

  const refresh = () => {
    for (const b of buttons) {
      const on = b.active?.() ?? false;
      b.el.classList.toggle('bg-zinc-200', on);
      b.el.classList.toggle('text-zinc-950', on);
      if (b.enabled) b.el.disabled = !b.enabled();
    }
    blockType.value = editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : 'p';
    tableTools.classList.toggle('hidden', !inTable());
  };
  editor.on('transaction', refresh);
  refresh();

  const element = h('div', { class: 'rounded-lg border border-zinc-300 bg-white focus-within:border-zinc-500' }, toolbar, area);
  return {
    element,
    getMarkdown: () => htmlToMarkdown(editor.getHTML()),
    getText: () => editor.getText(),
    focus: () => editor.commands.focus(),
    destroy: () => editor.destroy(),
  };
}
