// Trả JSON cho các API route.
export const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
export const bad = (error: string, status = 400) => ok({ error }, status);

/** Bắt lỗi kiểm tra dữ liệu (InputError) thành 400, lỗi khác thành 500. */
export async function handle(fn: () => Promise<Response> | Response) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof InputError) return bad(e.message, e.status);
    console.error(e);
    return bad('Lỗi máy chủ: ' + (e as Error).message, 500);
  }
}

export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
