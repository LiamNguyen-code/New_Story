// Dữ liệu ban đầu cho trang admin: tài khoản đang đăng nhập, danh sách truyện, tác giả, thể loại, tài khoản (admin).
import type { APIRoute } from 'astro';
import settings from '../../../data/settings.json';
import { listAuthors, listStories, listUsers } from '../../../lib/server/admin';
import { handle, ok } from '../../../lib/server/http';

export const GET: APIRoute = ({ locals }) =>
  handle(() =>
    ok({
      user: locals.user,
      stories: listStories(),
      authors: listAuthors(),
      genres: settings.genres,
      // Danh sách người phụ trách chỉ admin cần (để gán truyện)
      users: locals.user?.role === 'admin' ? listUsers().map(({ id, name, email }) => ({ id, name, email })) : [],
    }),
  );
