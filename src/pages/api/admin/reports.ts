// Xuất báo cáo lượt xem chi tiết theo trang ra CSV (mở được bằng Excel). Cùng bộ lọc với /admin/reports/.
import type { APIRoute } from 'astro';
import { SITE } from '../../../site.config';
import { parseFilter, report } from '../../../lib/server/views';

const cell = (v: string | number) => (typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`);

export const GET: APIRoute = ({ url, locals }) => {
  if (locals.user?.role !== 'admin') return new Response(JSON.stringify({ error: 'Chỉ quản trị viên (admin) mới xem được báo cáo.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  const filter = parseFilter(url.searchParams, locals.user!);
  const { byPage, total } = report(filter);
  const rows = [
    ['Trang', 'URL', 'Truyện', 'Người phụ trách', 'Lượt xem', 'Người đọc', 'Tỷ lệ %'],
    ...byPage.map((p) => {
      const path = p.chapter === 0 ? `/story/${p.slug}/` : `/story/${p.slug}/chapter-${p.chapter}/`;
      const owner = p.ownerId === 0 ? 'Chưa gán' : p.ownerName || p.ownerEmail || `Đã xoá (#${p.ownerId})`;
      return [p.chapter === 0 ? 'Giới thiệu' : `Chương ${p.chapter}`, new URL(path, SITE.url).href, p.title, owner, p.views, p.uniques, total.views ? +((p.views / total.views) * 100).toFixed(2) : 0];
    }),
  ];
  // BOM để Excel đọc đúng tiếng Việt
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="luot-xem-${filter.from}_${filter.to}.csv"`,
    },
  });
};
