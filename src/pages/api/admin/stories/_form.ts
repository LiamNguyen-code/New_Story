import { InputError } from '../../../../lib/server/http';

/** Đọc form multipart gồm trường `data` (JSON) và `cover` (file ảnh, tuỳ chọn). */
export async function readForm(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) throw new InputError('Dữ liệu gửi lên không hợp lệ.');
  let data: Record<string, any>;
  try {
    data = JSON.parse(String(form.get('data') ?? '{}'));
  } catch {
    throw new InputError('Dữ liệu gửi lên không hợp lệ.');
  }
  const cover = form.get('cover');
  return { data, cover: cover instanceof File ? cover : null };
}
