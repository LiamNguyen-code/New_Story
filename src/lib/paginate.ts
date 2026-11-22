/** Chia trang cho các trang render trên server. null = số trang không hợp lệ / vượt quá (trả 404). */
export function paginate<T>(items: T[], param: string | undefined, pageSize: number, url: (n: number) => string) {
  if (!/^[1-9]\d*$/.test(param ?? '')) return null;
  const currentPage = Number(param);
  const lastPage = Math.max(1, Math.ceil(items.length / pageSize));
  if (currentPage > lastPage) return null;
  return {
    data: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    currentPage,
    lastPage,
    total: items.length,
    prev: currentPage > 1 ? url(currentPage - 1) : undefined,
    next: currentPage < lastPage ? url(currentPage + 1) : undefined,
  };
}
