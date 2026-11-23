# News and Tales: website tin tức và truyện đọc theo chương

Astro 5 (render trên server, adapter Node) + Tailwind 4 + **SQLite** (Drizzle ORM). Chuẩn SEO, có trang admin
đăng nhập bằng email + mật khẩu cho nhiều người, tối ưu cho AdSense. Chạy trên 1 VPS (DigitalOcean...).

## Chạy local

```bash
npm install
npm run db:import                                  # lần đầu: nhập truyện mẫu từ src/seed vào database
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
| Truyện, chương, tác giả, tin tức, tài khoản, lượt xem | `data/app.db` (SQLite) |
| Ảnh bìa truyện + tin (tự tạo 240/480/800/1200px WebP + ảnh OG JPG) | `data/uploads/covers/` |
| Ảnh chèn trong nội dung tin | `data/uploads/news/` |
| Tên site, GA, AdSense, thể loại | `src/data/settings.json` |

Thư mục `data/` **không** nằm trong git. Đổi vị trí bằng biến môi trường `DATA_DIR` (xem `.env.example`).
Backup = copy `data/app.db` + `data/uploads/` (dùng `sqlite3 data/app.db ".backup backup.db"` khi site đang chạy).

Đổi cấu trúc bảng: sửa `src/lib/server/schema.ts` → `npm run db:generate` → commit thư mục `drizzle/`.
Server tự áp migration mới khi khởi động.

File markdown mẫu trong `src/seed/` và ảnh `src/assets/` chỉ dùng cho `npm run db:import`;
sau khi đã nhập vào database có thể xoá.

## Quản trị truyện (/admin/)

Đăng nhập ở `/admin/login/` (nút **Đăng xuất** trên menu). Lưu xong là site cập nhật **ngay**, không cần build.
Truyện / tin đăng ngay khi tạo (ngày đăng = hôm nay) và lên đầu danh sách. **Tác giả = tài khoản đăng bài**
(tên trong mục Tài khoản), không chọn tay. Truyện chưa có chương nào tạm ẩn khỏi site, thêm chương là tự hiện.

| Màn hình | Chức năng |
|---|---|
| `/admin/` **Truyện** | Danh sách truyện: tìm kiếm, tab lọc (Đã đăng / Chưa có chương / Đang ra), sửa, xem, xoá. Nút **+ Thêm truyện** ở đầu danh sách |
| Bấm vào 1 truyện | Thông tin truyện + **danh sách chương**: thêm 1 chương, **dán nhiều chương**, sửa, xoá |
| Sửa thông tin | Tên, mô tả, tóm tắt, ảnh bìa (tự cắt 1200×630), thể loại, tag, tình trạng, SEO |
| `/admin/import/` **Thêm truyện** | Dán cả truyện để tự tách chương, hoặc tạo truyện trống rồi thêm chương sau. Slug tự tạo chuẩn SEO, sửa được |
| `/admin/news/` **Tin tức** | Thêm / sửa / xoá tin bằng trình soạn thảo trực quan (như Word): ảnh bìa, ảnh trong bài, tiêu đề mục, danh sách, bảng |
| `/admin/reports/` **Báo cáo** (chỉ admin) | Lượt xem theo ngày / người phụ trách / truyện / từng trang, chia doanh thu, tải CSV |
| `/admin/users/` **Tài khoản** | Đổi mật khẩu của mình. Admin: thêm/xoá người, đặt lại mật khẩu, đổi quyền |

Quyền: **Biên tập** chỉ thấy và sửa / xoá truyện, tin **do mình đăng**; không xem Báo cáo.
**Admin** thấy và sửa tất cả, xem Báo cáo, quản lý tài khoản.
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
  pages/api/        # API: auth/login|logout, track, admin/* (truyện, chương, tin tức, ảnh, tài khoản, báo cáo)
  middleware.ts     # bắt đăng nhập cho /admin + phục vụ /uploads
  components/       # SEO, AdSlot, Cover, StoryCard, ChapterToc, ShareButtons, Breadcrumbs...
  layouts/          # BaseLayout, PageLayout, AdminLayout
  lib/content.ts    # đọc truyện/chương cho trang công khai
  lib/server/       # db (SQLite), schema, auth, admin + news (ghi dữ liệu), images, views (báo cáo)
  lib/markdown.ts   # Markdown → HTML an toàn (dùng chung site + xem trước trong admin)
  lib/admin/        # app admin chạy trên trình duyệt (gọi /api/admin)
  content/          # markdown cũ, chỉ dùng cho npm run db:import
  data/settings.json
drizzle/            # migration SQL (tự áp khi server khởi động)
scripts/            # import-content (markdown → DB), create-user
data/               # app.db + uploads/ (không commit)
```
