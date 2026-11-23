// Dữ liệu ban đầu cho trang admin: tài khoản đang đăng nhập, danh sách truyện (biên tập viên: chỉ truyện của mình), thể loại.
import type { APIRoute } from 'astro';
import settings from '../../../data/settings.json';
import { listStories } from '../../../lib/server/admin';
import { handle, ok } from '../../../lib/server/http';

export const GET: APIRoute = ({ locals }) =>
  handle(() =>
    ok({
      user: locals.user,
      stories: listStories(locals.user!),
      genres: settings.genres,
    }),
  );
