// POST: upload 1 ảnh để chèn vào nội dung tin (multipart: file). Trả về { url } dùng trong markdown.
import type { APIRoute } from 'astro';
import { saveInlineImage } from '../../../lib/server/images';
import { InputError, handle, ok } from '../../../lib/server/http';
import { readImage } from '../../../lib/server/news';

export const POST: APIRoute = ({ request }) =>
  handle(async () => {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    const buf = await readImage(file instanceof File ? file : null);
    if (!buf) throw new InputError('Chưa chọn ảnh.');
    try {
      return ok({ url: await saveInlineImage(buf) }, 201);
    } catch {
      throw new InputError('File không phải ảnh hợp lệ.');
    }
  });
