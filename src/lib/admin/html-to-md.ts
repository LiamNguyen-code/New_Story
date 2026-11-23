// HTML (từ trình soạn thảo trực quan) → Markdown để lưu. Ngược lại dùng renderMarkdown (../markdown).
// Chỉ các định dạng Markdown biểu diễn được mới có trên thanh công cụ, nên chuyển qua lại không mất dữ liệu.
import TurndownService from 'turndown';

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**', hr: '---' });

td.addRule('strike', { filter: ['s', 'del', 'strike'] as any, replacement: (content) => (content.trim() ? `~~${content}~~` : content) });

// Ô trống trong trình soạn thảo là <p></p>: bỏ qua
td.addRule('emptyParagraph', { filter: (node) => node.nodeName === 'P' && !node.textContent?.trim() && !(node as Element).querySelector?.('img'), replacement: () => '' });

// Trình soạn thảo bọc mỗi mục danh sách trong <p>: giữ danh sách gọn, không cách dòng
td.addRule('listParagraph', { filter: (node) => node.nodeName === 'P' && node.parentNode?.nodeName === 'LI', replacement: (content, node) => (node.nextSibling ? `${content}\n` : content) });

const childElements = (el: Node, names: string[]) => [...el.childNodes].filter((n): n is HTMLElement => names.includes(n.nodeName));

/** Bảng GFM: dòng đầu là tiêu đề cột. Xuống dòng trong ô → khoảng trắng, | → \| */
td.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows = childElements(node, ['THEAD', 'TBODY', 'TFOOT']).flatMap((g) => childElements(g, ['TR'])).concat(childElements(node, ['TR']));
    const cells = rows.map((tr) =>
      childElements(tr, ['TH', 'TD']).map((c) =>
        td
          .turndown(c.innerHTML)
          .replace(/\s*\n+\s*/g, ' ')
          .replace(/\|/g, '\\|')
          .trim(),
      ),
    );
    if (!cells.length) return '';
    const cols = Math.max(...cells.map((r) => r.length));
    const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' | ')} |`;
    return `\n\n${[line(cells[0]), `|${' --- |'.repeat(cols)}`, ...cells.slice(1).map(line)].join('\n')}\n\n`;
  },
});

export const htmlToMarkdown = (html: string) =>
  td
    .turndown(html)
    .replace(/^(\s*)-\s{2,}/gm, '$1- ') // "-   mục" → "- mục"
    .replace(/^(\s*\d+\.)\s{2,}/gm, '$1 ')
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(\s*(?:-|\d+\.) .*)\n\n(?=\s*(?:-|\d+\.) )/gm, '$1\n') // các mục danh sách liền nhau, không cách dòng
    .trim();
