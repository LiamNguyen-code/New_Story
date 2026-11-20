// Tạo ảnh bìa mẫu 1200x630 (WebP) cho truyện + og-default.jpg.
// Dùng: npm run gen:covers   (ghi đè ảnh trong src/assets/covers/)
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const covers = [
  { file: 'deaf-mother-hands', title: 'Her Hands Spoke the Truth', from: '#1e1b4b', to: '#be185d' },
  { file: 'stray-dog-24-nights', title: 'Twenty-Four Nights', from: '#0f172a', to: '#b45309' },
  { file: 'navy-daughter-black-hawk', title: 'The Daughter He Mocked', from: '#022c22', to: '#0369a1' },
  { file: 'billionaire-silent-daughter', title: 'The Name in Her Hands', from: '#3b0764', to: '#0f766e' },
];

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function svg({ title, from, to }, w = 1200, h = 630) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${w * 0.82}" cy="${h * 0.2}" r="220" fill="#fff" opacity="0.06"/>
  <circle cx="${w * 0.12}" cy="${h * 0.9}" r="160" fill="#fff" opacity="0.05"/>
  <text x="60" y="${h - 90}" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="#fff">${escape(title)}</text>
  <rect x="60" y="${h - 60}" width="120" height="6" fill="#fff" opacity="0.8"/>
</svg>`;
}

await mkdir('src/assets/covers', { recursive: true });
for (const c of covers) {
  await sharp(Buffer.from(svg(c))).webp({ quality: 82 }).toFile(`src/assets/covers/${c.file}.webp`);
  console.log('✓', c.file);
}
await sharp(Buffer.from(svg({ title: 'Midnight Tales', from: '#1c1917', to: '#be185d' })))
  .jpeg({ quality: 82 })
  .toFile('public/og-default.jpg');
console.log('✓ public/og-default.jpg');
