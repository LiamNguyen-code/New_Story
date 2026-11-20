# Midnight Tales: website đọc truyện theo chương

Site tĩnh (Astro 5 + Tailwind 4), chuẩn SEO, có trang admin cho nhiều người dùng, tối ưu cho AdSense.
Chạy miễn phí trên Cloudflare Pages, không cần server/VPS.

## Chạy local

```bash
npm install
npm run dev          # http://localhost:4321 (tự dọn ảnh bìa thừa trước khi chạy)
npm run build        # build ra dist/ + tạo chỉ mục tìm kiếm Pagefind
npm run preview      # xem bản build (thử tìm kiếm ở /search/)
```

## Quản trị truyện (/admin/)

| Màn hình | Chức năng |
|---|---|
| `/admin/` **Truyện** | Danh sách truyện: tìm kiếm, tab lọc (Đã đăng / Hẹn giờ / Nháp / Nổi bật / Đang ra), sửa, xem, xoá |
| Bấm vào 1 truyện | Thông tin truyện + **danh sách chương**: thêm 1 chương, **dán nhiều chương**, sửa, xoá |
| Sửa thông tin | Tên, mô tả, tóm tắt, ảnh bìa (tự cắt 1200×630 WebP), thể loại, tag, tác giả, ngày đăng, SEO |
| `/admin/import/` **Thêm truyện** | Dán cả truyện để tự tách chương, hoặc tạo truyện trống rồi thêm chương sau |

Phím tắt: **Ctrl + S** để lưu. Rời trang khi chưa lưu sẽ được hỏi lại.

**Admin kết nối với dữ liệu theo 3 cách (tự chọn):**
1. **Site đã deploy:** dùng API `/api/admin` trên Cloudflare. Người dùng đăng nhập bằng email (Cloudflare Access), không cần GitHub.
2. **Chạy local** (`npm run dev`): chọn thư mục dự án (Chrome/Edge), file được ghi thẳng vào máy. Dùng `git push` để đưa lên site.
3. **Dự phòng:** token GitHub cá nhân.

**Đăng lên site:** ở cách 1 và 3, mỗi lần **Lưu** chỉ commit, **không build**. Bấm nút cam **"🚀 Đăng lên site"** trên thanh trên cùng
để build 1 lần cho tất cả thay đổi (site cập nhật sau 1–2 phút). Nếu quên bấm, site tự đăng mỗi ngày lúc 7:00 (giờ Việt Nam).

Dữ liệu là file trong dự án:
```
src/content/stories/<slug>.md                  # thông tin truyện + tóm tắt
src/content/chapters/<slug>/chapter-01.md      # từng chương
src/assets/covers/<slug>-<phiên bản>.webp      # ảnh bìa 1200×630
src/content/authors/<id>.json                  # tác giả
src/data/settings.json                         # tên site, GA, AdSense, thể loại...
```

## Cấu hình (src/data/settings.json)

| Khoá | Ý nghĩa |
|---|---|
| `url` | Domain thật, ví dụ `https://yourdomain.com` (dùng cho canonical, sitemap, OG) |
| `gaId` | Google Analytics 4 (`G-XXXX`) |
| `adsenseClient`, `adSlots` | `ca-pub-XXXX` và ID các ô quảng cáo (top / inContent / bottom) |
| `inContentAdAfterParagraph` | Chèn quảng cáo sau đoạn thứ N trong chương |
| `web3formsKey` | Key miễn phí từ web3forms.com cho form liên hệ |
| `genres` | Danh sách thể loại (`id`, `name`, `description`) |

Khi được duyệt AdSense, sửa `public/ads.txt` (bỏ dấu `#`, điền pub-ID).
Ở chế độ dev, các ô quảng cáo hiện khung nét đứt để xem vị trí; bản build thật không hiện khung này.

## Deploy miễn phí: Cloudflare Pages

### 1. Đưa code lên GitHub
Tạo repo **private** trên https://github.com/new (không tick "Add a README"), rồi:
```bash
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/story-site.git
git push -u origin main
```

### 2. Tạo site trên Cloudflare Pages
Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git** → chọn repo:
- Framework preset: **Astro** · Build command: `npm run build` · Output: `dist`
- Biến môi trường: `PUBLIC_SITE_URL` = `https://<tên-project>.pages.dev` (đổi khi có domain riêng)

Site chạy tại `https://<tên-project>.pages.dev` (miễn phí). Thư mục `functions/` (API admin) được Cloudflare tự triển khai.

### 3. Mời cộng tác viên (đăng nhập bằng email)
**a) Token GitHub cho server** (chỉ chủ site làm, cộng tác viên không cần GitHub):
https://github.com/settings/personal-access-tokens/new → Repository access: **Only select repositories** → chọn repo này →
Permissions: **Contents: Read and write** → tạo token.

**b) Cloudflare Access** (Zero Trust, gói Free tới 50 người):
1. Cloudflare → **Zero Trust** → chọn gói Free. Ghi lại **team domain**, ví dụ `ten-team.cloudflareaccess.com`
   (Settings → Custom Pages / Team domain).
2. **Access → Applications → Add an application → Self-hosted**:
   - Application domain: `<tên-project>.pages.dev`, path `admin`
   - Thêm domain thứ 2: cùng domain, path `api/admin`
   - Policy: **Allow** → Include → **Emails** → nhập email của bạn và từng cộng tác viên
3. Mở application vừa tạo → tab Overview → copy **Application Audience (AUD) Tag**.
4. Pages project → **Settings → Build → Preview deployments**: bật Access cho bản preview (để các link preview cũng được khoá).

**c) Biến môi trường** cho Pages project (**Settings → Variables and Secrets**, môi trường Production):
| Tên | Giá trị | Loại |
|---|---|---|
| `GITHUB_TOKEN` | token ở bước a | **Secret** |
| `GITHUB_REPO` | `USERNAME/story-site` | Text |
| `GITHUB_BRANCH` | `main` | Text |
| `ACCESS_TEAM_DOMAIN` | `ten-team.cloudflareaccess.com` | Text |
| `ACCESS_AUD` | AUD tag ở bước b.3 | Text |

Deploy lại (Deployments → Retry deployment). Cộng tác viên mở `https://<tên-project>.pages.dev/admin/`,
nhập email, nhận mã đăng nhập qua email rồi dùng admin ngay. Mỗi commit ghi lại email người sửa.

**Thêm hoặc bớt người:** sửa danh sách email trong Policy của Access application, không phải deploy lại.

### 4. Build tự động hằng ngày (hẹn giờ đăng + đăng các thay đổi bị quên)
Pages → **Settings → Builds → Deploy hooks** → tạo hook, copy URL →
GitHub repo → **Settings → Secrets and variables → Actions** → secret `CF_DEPLOY_HOOK` = URL.
Workflow `.github/workflows/scheduled-build.yml` chạy mỗi ngày (khoảng 30 lần build/tháng; gói Free có 500 lần).

### 5. Domain riêng (để chạy AdSense)
Mua domain (Cloudflare Registrar, `.com` khoảng $10/năm) → Pages → **Custom domains** →
đổi `PUBLIC_SITE_URL` và `url` trong `src/data/settings.json` → thêm domain mới vào Access application →
Google Search Console: gửi `https://yourdomain.com/sitemap-index.xml`.

## Bảo mật admin
- `/api/admin` kiểm tra chữ ký JWT của Cloudflare Access (khoá công khai, AUD, issuer, hạn dùng).
  Thiếu cấu hình thì từ chối mọi request.
- API chỉ cho sửa `src/content/` và `src/assets/covers/`, không sửa được code.
- Token GitHub chỉ nằm trong biến Secret của Cloudflare, người dùng không bao giờ thấy.

## SEO đã có sẵn
- HTML tĩnh; title, description, canonical, robots riêng cho từng trang
- Open Graph và Twitter Card (ảnh OG JPG 1200×630 tự sinh từ ảnh bìa)
- JSON-LD: `WebSite` + `SearchAction`, `Book` (truyện, có `hasPart`), `Chapter` (chương), `BreadcrumbList`
- `sitemap-index.xml`, `robots.txt`, `rss.xml`, `rel=prev/next`, 404 chuẩn
- Trang tag ít truyện được gắn `noindex`; `/admin` và `/search` bị chặn index
- Ảnh WebP responsive, lazy load; AdSense chỉ tải khi ô quảng cáo sắp hiện, khung quảng cáo giữ sẵn chiều cao (không gây CLS)

## Cấu trúc thư mục
```
src/
  pages/            # route: index, page/[n], story/[slug], story/[slug]/chapter-[n], genre, tag, admin...
  components/       # SEO, AdSlot, StoryCard, ChapterToc, ShareButtons, Breadcrumbs...
  layouts/          # BaseLayout, PageLayout, AdminLayout
  lib/              # content helpers, importer (tách chương), og image
  lib/admin/        # app admin: backend (local/GitHub/server), github, publish, connect, content
  content/          # truyện, chương, tác giả (Markdown/JSON)
  data/settings.json
functions/api/admin/  # Cloudflare Pages Function: API admin (đăng nhập email, commit GitHub)
scripts/              # clean-covers (dọn ảnh thừa), gen-covers (ảnh bìa mẫu)
```
