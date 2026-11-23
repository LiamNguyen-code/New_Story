// Markdown → HTML, dùng chung cho site (server) và phần "Xem trước" trong admin (trình duyệt).
import { Marked } from 'marked';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Chỉ cho link/ảnh http(s), mailto, đường dẫn trong site, #anchor (chặn javascript:, data:...)
const safeUrl = (href: string) => (/^(https?:\/\/|mailto:|\/|#)/i.test(href.trim()) ? href : '#');

// HTML thô trong nội dung bị escape: người sửa không chèn được script vào site
const md = new Marked({ gfm: true, breaks: false });
md.use({
  renderer: { html: ({ text }) => escape(text) },
  walkTokens: (token) => {
    if (token.type === 'link' || token.type === 'image') token.href = safeUrl(token.href);
  },
});

export const renderMarkdown = (text: string) => md.parse(text, { async: false });

/**
 * JSON cho thẻ <script type="application/ld+json">. Mã hoá "<" thành \u003c để nội dung do người dùng nhập
 * (VD mô tả chứa "</script><script>…") không đóng được thẻ script rồi chạy mã độc. Google đọc vẫn như cũ.
 */
export const safeJson = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
