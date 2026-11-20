// Xoá ảnh bìa không còn truyện nào dùng (src/assets/covers).
// Chạy tự động trước `npm run dev` (predev). Ảnh thừa không bị đưa vào bản build.
import { readdir, readFile, unlink } from 'node:fs/promises';

const STORIES = 'src/content/stories';
const COVERS = 'src/assets/covers';

const used = new Set();
for (const f of await readdir(STORIES)) {
  if (!f.endsWith('.md')) continue;
  const m = (await readFile(`${STORIES}/${f}`, 'utf8')).match(/^cover:\s*['"]?(.+?)['"]?\s*$/m);
  if (m) used.add(m[1].split('/').pop());
}

let removed = 0;
for (const f of await readdir(COVERS)) {
  if (used.has(f) || f.startsWith('.')) continue;
  await unlink(`${COVERS}/${f}`);
  removed++;
  console.log(`[clean-covers] removed unused ${COVERS}/${f}`);
}
if (removed) console.log(`[clean-covers] ${removed} unused cover(s) removed`);
