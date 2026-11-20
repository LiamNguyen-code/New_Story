// Nút "Đăng lên site" trên header admin: đếm số lần lưu chưa đăng, bấm để build 1 lần cho tất cả.
import type { Backend } from './backend';
import { h, toast } from './dom';

let backend: Backend | null = null;
let slot: HTMLElement | null = null;
let publishing = false;

export function mountPublish(b: Backend) {
  backend = b;
  slot = document.getElementById('publish-slot');
  if (!slot) return;
  if (!b.publisher) {
    // Local: nội dung lên site khi git push
    slot.replaceChildren(h('span', { class: 'hidden text-xs text-zinc-500 md:inline', title: 'Đang sửa trên máy. Dùng git push để đưa lên site.' }, '💻 Local'));
    return;
  }
  // Sau mỗi lần lưu thì cập nhật số thay đổi chờ đăng
  const apply = b.apply.bind(b);
  b.apply = async (changes, message) => {
    await apply(changes, message);
    refreshPublish();
  };
  refreshPublish();
}

export async function refreshPublish() {
  if (!backend?.publisher || !slot || publishing) return;
  let n = 0;
  try {
    n = await backend.publisher.pending();
  } catch (e) {
    console.warn(e);
    return;
  }
  render(n);
}

function render(n: number) {
  if (!slot) return;
  if (n === 0) {
    slot.replaceChildren(h('span', { class: 'hidden whitespace-nowrap text-xs text-emerald-700 md:inline', title: 'Mọi thay đổi đã được đăng lên site' }, '✓ Đã đăng hết'));
    return;
  }
  slot.replaceChildren(
    h(
      'button',
      {
        type: 'button',
        class: 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-60',
        title: `${n} lần lưu chưa hiện trên site`,
        onclick: () => publish(n),
      },
      '🚀 Đăng lên site',
      h('span', { class: 'rounded-full bg-white/25 px-1.5' }, n),
    ),
  );
}

async function publish(n: number) {
  if (!backend?.publisher || publishing) return;
  if (!confirm(`Đăng ${n} thay đổi lên site?\nSite sẽ cập nhật sau khoảng 1–2 phút.`)) return;
  publishing = true;
  slot?.querySelector('button')?.setAttribute('disabled', '');
  try {
    await backend.publisher.publish();
    toast('Đã gửi lệnh đăng. Site sẽ cập nhật sau khoảng 1–2 phút.');
    render(0);
  } catch (e) {
    toast((e as Error).message, false);
    slot?.querySelector('button')?.removeAttribute('disabled');
  } finally {
    publishing = false;
  }
}
