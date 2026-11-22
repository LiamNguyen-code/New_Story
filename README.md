# Midnight Tales: website đọc truyện theo chương

Astro 5 (render trên server, adapter Node) + Tailwind 4 + **SQLite** (Drizzle ORM). Chuẩn SEO, có trang admin
đăng nhập bằng email + mật khẩu cho nhiều người, tối ưu cho AdSense. Chạy trên 1 VPS (DigitalOcean...).

## Chạy local

```bash
npm install
npm run db:import                                  # lần đầu: nhập truyện mẫu từ src/content vào database
npm run user:create -- you@example.com matkhau123 "Tên bạn"   # tạo tài khoản admin
npm run dev                                        # http://localhost:4321 · admin: http://localhost:4321/admin/
```

Bản production chạy thử ở máy:
```bash
npm run build
npm start          # http://localhost:4321 (đổi cổng: PORT=3000 npm start)
```

## Dữ liệu

| Nội dung | Lưu ở |
|---|---|
| Truyện, chương, tác giả, tài khoản, phiên đăng nhập | `data/app.db` (SQLite) |
| Ảnh bìa (tự tạo 240/480/800/1200px WebP + ảnh OG JPG) | `data/uploads/covers/` |
| Tin tức (`/news/`) | `src/content/news/*.md` (build sẵn thành HTML) |
| Tên site, GA, AdSense, thể loại | `src/data/settings.json` |

Thư mục `data/` **không** nằm trong git. Đổi vị trí bằng biến môi trường `DATA_DIR` (xem `.env.example`).
Backup = copy `data/app.db` + `data/uploads/` (dùng `sqlite3 data/app.db ".backup backup.db"` khi site đang chạy).

Đổi cấu trúc bảng: sửa `src/lib/server/schema.ts` → `npm run db:generate` → commit thư mục `drizzle/`.
Server tự áp migration mới khi khởi động.

File markdown cũ trong `src/content/stories|chapters|authors` và ảnh `src/assets/covers` chỉ dùng cho `npm run db:import`;
sau khi đã nhập vào database có thể xoá.

## Quản trị truyện (/admin/)

Đăng nhập ở `/admin/login/`. Lưu xong là site cập nhật **ngay**, không cần build. Truyện hẹn giờ (ngày đăng trong tương lai)
tự hiện khi tới ngày.

| Màn hình | Chức năng |
|---|---|
| `/admin/` **Truyện** | Danh sách truyện: tìm kiếm, tab lọc (Đã đăng / Hẹn giờ / Nháp / Nổi bật / Đang ra), sửa, xem, xoá |
| Bấm vào 1 truyện | Thông tin truyện + **danh sách chương**: thêm 1 chương, **dán nhiều chương**, sửa, xoá |
| Sửa thông tin | Tên, mô tả, tóm tắt, ảnh bìa (tự cắt 1200×630), thể loại, tag, tác giả, ngày đăng, SEO |
| `/admin/import/` **Thêm truyện** | Dán cả truyện để tự tách chương, hoặc tạo truyện trống rồi thêm chương sau |
| `/admin/users/` **Tài khoản** | Đổi mật khẩu của mình. Admin: thêm/xoá người, đặt lại mật khẩu, đổi quyền |

Quyền: **Biên tập** (sửa truyện) và **Admin** (thêm cả quản lý tài khoản).
Quên mật khẩu admin: chạy lại `npm run user:create -- <email> <mật khẩu mới>` trên server.

Phím tắt: **Ctrl + S** để lưu. Rời trang khi chưa lưu sẽ được hỏi lại.

## Cấu hình (src/data/settings.json)

| Khoá | Ý nghĩa |
|---|---|
| `url` | Domain thật, ví dụ `https://yourdomain.com` (dùng cho canonical, sitemap, OG). Biến môi trường `PUBLIC_SITE_URL` ghi đè giá trị này |
| `gaId` | Google Analytics 4 (`G-XXXX`) |
| `adsenseClient`, `adSlots` | `ca-pub-XXXX` và ID các ô quảng cáo (top / inContent / bottom) |
| `inContentAdAfterParagraph` | Chèn quảng cáo sau đoạn thứ N trong chương |
| `web3formsKey` | Key miễn phí từ web3forms.com cho form liên hệ |
| `genres` | Danh sách thể loại (`id`, `name`, `description`) |

Khi được duyệt AdSense, sửa `public/ads.txt` (bỏ dấu `#`, điền pub-ID).
Ở chế độ dev, các ô quảng cáo hiện khung nét đứt để xem vị trí; bản build thật không hiện khung này.

## Bảo mật admin
- Mật khẩu băm bằng scrypt; cookie phiên `httpOnly`, `SameSite=Lax`, `Secure` khi chạy HTTPS; hết hạn sau 30 ngày.
- Sai mật khẩu 10 lần / 15 phút từ 1 IP thì bị chặn tạm.
- `/admin/*` và `/api/admin/*` bắt buộc đăng nhập (`src/middleware.ts`); request ghi dữ liệu phải có Origin của chính site.
- HTML thô trong nội dung truyện bị escape, người sửa truyện không chèn được script vào site.

## SEO đã có sẵn
- HTML render đầy đủ trên server; title, description, canonical, robots riêng cho từng trang
- Open Graph và Twitter Card (ảnh OG JPG 1200×630 tạo lúc upload ảnh bìa)
- JSON-LD: `WebSite` + `SearchAction`, `Book` (truyện, có `hasPart`), `Chapter` (chương), `BreadcrumbList`
- `sitemap.xml` (tạo động từ database), `robots.txt`, `rss.xml`, `rel=prev/next`, 404 chuẩn
- Trang tag ít truyện được gắn `noindex`; `/admin`, `/api` và `/search` bị chặn index
- Ảnh WebP responsive, lazy load; AdSense chỉ tải khi ô quảng cáo sắp hiện, khung quảng cáo giữ sẵn chiều cao (không gây CLS)

## Cấu trúc thư mục
```
src/
  pages/            # route: index, page/[page], story/[slug], story/[slug]/chapter-[n], genre, tag, search, admin...
  pages/api/        # API: auth/login|logout, admin/* (truyện, chương, tài khoản)
  middleware.ts     # bắt đăng nhập cho /admin + phục vụ /uploads
  components/       # SEO, AdSlot, Cover, StoryCard, ChapterToc, ShareButtons, Breadcrumbs...
  layouts/          # BaseLayout, PageLayout, AdminLayout
  lib/content.ts    # đọc truyện/chương cho trang công khai
  lib/server/       # db (SQLite), schema, auth, admin (ghi dữ liệu), images (ảnh bìa)
  lib/admin/        # app admin chạy trên trình duyệt (gọi /api/admin)
  content/news/     # tin tức (markdown)
  data/settings.json
drizzle/            # migration SQL (tự áp khi server khởi động)
scripts/            # import-content (markdown → DB), create-user
data/               # app.db + uploads/ (không commit)
```
