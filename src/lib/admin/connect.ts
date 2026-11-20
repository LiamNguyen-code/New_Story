// Màn hình kết nối dùng chung cho các trang admin.
// - Site đã deploy: tự dùng API /api/admin (đăng nhập email qua Cloudflare Access) → không cần làm gì.
// - Local: chọn thư mục dự án. Dự phòng: token GitHub cá nhân.
import { connectGitHub, connectLocal, disconnect, isLocalhost, regrantLocal, restoreBackend, type Backend } from './backend';
import { btn, h, input } from './dom';
import { mountPublish } from './publish';

function setStatus(b: Backend | null) {
  const el = document.getElementById('conn-status');
  if (!el) return;
  el.textContent = b ? `● ${b.label}` : '';
  el.title = b?.label ?? '';
  el.classList.toggle('text-emerald-600', !!b);
}

function ready(b: Backend) {
  setStatus(b);
  mountPublish(b);
  return b;
}

/** Trả về Backend đã kết nối; nếu chưa có thì hiện form kết nối trong `root` và chờ người dùng. */
export async function ensureBackend(root: HTMLElement): Promise<Backend> {
  const restored = await restoreBackend();
  if (restored.status === 'ready') return ready(restored.backend);

  return new Promise((resolve) => {
    const local = isLocalhost();
    const error = h('p', { class: 'mt-4 text-sm font-medium text-red-600', role: 'alert' });
    const done = (b: Backend) => {
      root.replaceChildren();
      resolve(ready(b));
    };
    const attempt = async (fn: () => Promise<Backend | null>) => {
      error.textContent = '';
      try {
        const b = await fn();
        if (b) done(b);
        else error.textContent = 'Chưa được cấp quyền truy cập thư mục.';
      } catch (e) {
        if ((e as Error).name !== 'AbortError') error.textContent = (e as Error).message;
      }
    };

    const repo = h('input', { class: input, placeholder: 'username/repo' });
    const branch = h('input', { class: input, value: 'main' });
    const token = h('input', { class: input, type: 'password', placeholder: 'github_pat_…' });

    root.replaceChildren(
      h(
        'div',
        { class: 'mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8' },
        h('h1', { class: 'text-2xl font-bold' }, local ? 'Kết nối dữ liệu truyện' : 'Không vào được trang quản trị'),

        restored.status === 'server-error' &&
          h(
            'div',
            { class: 'mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900' },
            h('p', { class: 'font-semibold' }, 'Không kết nối được API quản trị của site:'),
            h('p', { class: 'mt-1 font-mono text-xs' }, restored.message),
            h(
              'ul',
              { class: 'mt-3 list-disc space-y-1 pl-5' },
              h('li', {}, 'Cộng tác viên: tải lại trang để đăng nhập lại bằng email được mời.'),
              h('li', {}, 'Chủ site: kiểm tra Cloudflare Access và biến môi trường (xem README, mục "Mời cộng tác viên").'),
            ),
            h('button', { type: 'button', class: btn.primary + ' mt-3', onclick: () => location.reload() }, 'Tải lại trang'),
          ),

        local && h('p', { class: 'mt-2 text-sm text-zinc-600' }, 'Chọn nơi lưu truyện. Lựa chọn được nhớ lại cho lần sau.'),

        restored.status === 'needs-permission' &&
          h(
            'button',
            { type: 'button', class: btn.primary + ' mt-6 w-full', onclick: () => attempt(regrantLocal) },
            `🔓 Tiếp tục với thư mục "${restored.name}"`,
          ),

        h(
          'details',
          { class: 'mt-6 rounded-xl border border-zinc-200 p-5', open: local },
          h('summary', { class: 'cursor-pointer font-semibold' }, '💻 Thư mục dự án trên máy (local)'),
          h('p', { class: 'mt-1 text-xs text-zinc-500' }, 'Chrome/Edge. Chọn thư mục gốc dự án, ví dụ C:\\Working\\New_Story.'),
          h('button', { type: 'button', class: btn.primary + ' mt-3', onclick: () => attempt(connectLocal) }, 'Chọn thư mục dự án…'),
        ),

        h(
          'details',
          { class: 'mt-4 rounded-xl border border-zinc-200 p-5' },
          h('summary', { class: 'cursor-pointer font-semibold' }, '🐙 Dùng token GitHub cá nhân (dự phòng)'),
          h('p', { class: 'mt-1 text-xs text-zinc-500' }, 'Token fine-grained, chỉ cấp quyền repo này: Contents → Read and write. Token chỉ lưu trên trình duyệt này.'),
          h('label', { class: 'mt-3 block text-sm' }, 'Repository', repo),
          h('label', { class: 'mt-2 block text-sm' }, 'Branch', branch),
          h('label', { class: 'mt-2 block text-sm' }, 'Token', token),
          h(
            'button',
            {
              type: 'button',
              class: btn.secondary + ' mt-3',
              onclick: () => attempt(() => connectGitHub({ repo: repo.value.trim(), branch: branch.value.trim() || 'main', token: token.value.trim() })),
            },
            'Kết nối GitHub',
          ),
        ),
        error,
      ),
    );
  });
}

/** Đổi kết nối (local/GitHub) hoặc đăng xuất (Cloudflare Access) */
export async function disconnectAndReload(b?: Backend) {
  if (b?.kind === 'server') {
    location.href = '/cdn-cgi/access/logout';
    return;
  }
  await disconnect();
  location.reload();
}
