# Deploy Private Diary với các gói miễn phí

Hướng dẫn cho **mã nguồn hiện tại**: Vue trên Cloudflare Pages, Pages Function chuyển tiếp `/api`, Express trên Render Free, PostgreSQL trên Neon Free, ảnh trong Cloudflare R2 private. Dùng tên miền `pages.dev` và `onrender.com` được cấp sẵn, không cần mua domain.

Backend dùng Node.js 24+, Argon2 native, Prisma/pg và background jobs; **chưa chạy trực tiếp trên Workers**. Pages Function trong repo chỉ là proxy, không thay thế backend. Nếu muốn toàn bộ compute ở Cloudflare, cần chuyển đổi runtime backend rồi kiểm thử riêng.

Tài liệu đối chiếu ngày **26/10/2026**. Miễn phí khi nằm trong quota; đây không phải cam kết không phát sinh phí trong mọi trường hợp. Chưa có tài nguyên cloud nào được tạo bởi hướng dẫn này.

## 1. Kiến trúc và hạn mức

```mermaid
flowchart LR
    Browser[Trình duyệt] --> Pages[Cloudflare Pages: Vue]
    Browser --> Proxy[Pages Function: /api/v1/*]
    Proxy --> API[Render Free: Express / Node 24]
    API --> DB[Neon Free: PostgreSQL]
    API --> Images[Cloudflare R2: bucket private]
```

| Dịch vụ | Cấu hình | Giới hạn cần biết |
| --- | --- | --- |
| Cloudflare Pages | Free, Git integration | Static requests miễn phí; build Free tối đa 500 lần/tháng. |
| Pages Functions | Workers Free | 100.000 request/ngày dùng chung quota Workers của tài khoản; `_routes.json` chỉ cho `/api/*` chạy Function. |
| Render | Web Service, instance Free | 750 giờ instance/workspace/tháng; ngủ sau 15 phút không có request, lần truy cập tiếp theo phải chờ khởi động. |
| Neon | Project Free | Hiện có 1 GB PostgreSQL và 100 CU-hours/project/tháng; theo dõi quota trong dashboard. |
| R2 | Standard, private | 10 GB-month storage, 1 triệu Class A và 10 triệu Class B/tháng; egress từ R2 miễn phí. Phần vượt quota tính phí. |

Nguồn: [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Render Free](https://render.com/docs/free), [Neon pricing](https://neon.com/pricing), [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

R2 yêu cầu hoàn tất bước đăng ký/checkout subscription trong Cloudflare; không coi đây là phương án “không cần thông tin thanh toán”. Free tier chỉ áp dụng storage class **Standard**. Theo dõi usage/billing của từng dịch vụ; cảnh báo chi phí không phải giới hạn chi tiêu cứng. [Kích hoạt R2](https://developers.cloudflare.com/r2/get-started/).

Ảnh đi từ R2 qua Render rồi Pages nên vẫn tiêu thụ outbound bandwidth của Render. Render có quota bandwidth/build riêng; vượt mức có thể bị tính phí hoặc tạm dừng tùy cấu hình tài khoản. Free Render phù hợp demo/cá nhân thử nghiệm, không có bảo đảm luôn sẵn sàng.

## 2. Chuẩn bị

- Repo đã push lên GitHub hoặc GitLab; dùng repo private nếu muốn giữ kín source. Repo private không làm website trở thành private: dữ liệu vẫn được bảo vệ bằng đăng nhập.
- Tài khoản Cloudflare, Render và Neon; chọn rõ **Free** khi tạo dịch vụ.
- Chọn tên Pages, ví dụ `mot-chut-diary`; URL cuối cùng do dashboard cấp mới là giá trị chính xác.
- Không commit `.env`, không dùng lại `JWT_SECRET` minh họa trong `api/.env.example`.

Các file đã chuẩn bị:

| File | Vai trò |
| --- | --- |
| `web/functions/api/[[path]].js` | Chuyển `/api/v1/*` tới `API_ORIGIN`; giữ Origin/CSRF, cookie và dữ liệu ảnh; không cache. |
| `web/public/_routes.json` | Chỉ gọi Function cho `/api/*`. |
| `web/public/_redirects` | SPA fallback cho các route giao diện như `/calendar`. |
| `web/.env.example` | Biến frontend mẫu; production Pages vẫn dùng `/api/v1`. |

## 3. Tạo database Neon

1. Tạo project **Free**, chọn region gần region Render sẽ dùng.
2. Mở **Connect**, chọn database/role của project này; lấy hai connection string PostgreSQL có SSL: pooled cho runtime, direct/unpooled cho migration. Ví dụ định dạng:

   ```text
   postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
   ```

3. Lưu URL pooled vào `DATABASE_URL`, URL direct vào `DATABASE_URL_UNPOOLED` của Render ở bước 5. Không đặt vào Pages hoặc biến `VITE_*`.

Repo đã tách hai luồng: Prisma/pg dùng `DATABASE_URL` cho app, `prisma.config.js` dùng `DATABASE_URL_UNPOOLED` cho migration. Neon CLI có thể lấy cả hai biến bằng quy trình trong [thiết lập Neon](neon-setup.md). [Kết nối Neon](https://neon.com/docs/connect/connect-from-any-app).

Không chọn Render PostgreSQL Free làm database lâu dài: gói database miễn phí của Render có thời hạn 30 ngày. Neon Free không phải trial 30 ngày. [Render database limits](https://render.com/docs/free#free-postgres), [Neon plans](https://neon.com/pricing).

## 4. Tạo bucket ảnh R2

Trong Cloudflare, mở **Storage & databases → R2**, hoàn tất đăng ký R2 rồi:

1. Tạo bucket `private-diary-images`, storage class **Standard**.
2. Giữ **Public Development URL / r2.dev disabled**, không gắn public custom domain.
3. Tạo R2 API token quyền **Object Read & Write**, chỉ áp dụng cho bucket này.
4. Lưu **Access Key ID**, **Secret Access Key**, tên bucket và **S3 endpoint** do dashboard cung cấp. Endpoint thông thường:

   ```text
   https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

   Nếu dùng jurisdiction riêng, dùng đúng endpoint được Cloudflare hiển thị.

Các giá trị này chỉ đưa vào backend Render. Trình duyệt tải ảnh qua API có xác thực, nên không cần mở bucket public hay cấu hình R2 CORS cho browser. [Hướng dẫn tạo credentials R2](https://developers.cloudflare.com/r2/api/tokens/).

## 5. Deploy API trên Render Free

Trong Render chọn **New → Web Service**, kết nối repo và điền:

| Trường | Giá trị |
| --- | --- |
| Name | Ví dụ `mot-chut-diary-api` |
| Runtime | Node |
| Branch | Branch production của bạn |
| Root Directory | `api` |
| Build Command | `npm ci --include=dev && npm run db:generate` |
| Start Command | `npm run db:migrate && npm run db:seed && npm start` |
| Instance Type | **Free** |
| Health Check Path | `/health` |

`GET /health` không cần đăng nhập, chạy `SELECT 1` qua Prisma để kiểm tra DB. Trả `200` với `{"status":"ok","database":"up"}` khi thành công; trả `503` với `{"status":"unavailable","database":"down"}` khi truy vấn lỗi hoặc chưa phản hồi sau 3 giây. Response không cache và không chứa chi tiết lỗi/credentials. Endpoint này không kiểm tra R2 hoặc schema migration. Gọi trực tiếp trên origin Render, ví dụ `https://mot-chut-diary-api.onrender.com/health`.

Server chỉ bắt đầu listen sau khi kết nối DB và truy vấn bảng mood thành công. Start command migrate/seed trước khi phục vụ; migrate deploy chỉ áp dụng migration chưa chạy, seed upsert 5 mood hệ thống. Không dùng `prisma migrate dev` hoặc `db push` trên production.

Không đặt migration ở Pre-deploy Command trong hướng dẫn Free. Prisma CLI nằm trong devDependencies, nên build cần `--include=dev` để start command có thể gọi migration/seed.

Thêm environment variables trong Render:

| Biến | Giá trị |
| --- | --- |
| `NODE_VERSION` | `24` |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://mot-chut-diary.pages.dev` — sửa thành URL thật ở bước 6 |
| `DATABASE_URL` | Connection string Neon pooled ở bước 3 |
| `DATABASE_URL_UNPOOLED` | Connection string Neon direct ở bước 3 |
| `JWT_SECRET` | Chuỗi ngẫu nhiên mới, tối thiểu 32 bytes |
| `COOKIE_SECURE` | `true` |
| `STORAGE_DRIVER` | `r2` |
| `R2_ENDPOINT` | S3 endpoint ở bước 4 |
| `R2_BUCKET` | `private-diary-images` |
| `R2_ACCESS_KEY_ID` | Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key |
| `TRUST_PROXY` | `false` |

Để Render cấp `PORT`; server hiện đọc biến này và listen trên interface mặc định. `FRONTEND_URL` phải là origin HTTPS chính xác, không có `/` cuối, không có `/api/v1`. [Chọn Node trên Render](https://render.com/docs/node-version).

Tạo JWT secret trên máy cá nhân, rồi dán kết quả vào Render:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Không dùng `TRUST_PROXY=true`. Với `false`, các giới hạn theo IP ở auth có thể dùng chung IP proxy; phù hợp thử nghiệm ít người, nhưng cần cấu hình allowlist proxy và kiểm tra đường đi IP trước khi phục vụ nhiều người. Không lấy dải outbound của Render làm allowlist inbound proxy.

Bấm deploy; chờ log có `Private Diary API listening on port ...` rồi lưu URL Render thật, ví dụ `https://mot-chut-diary-api.onrender.com`.

## 6. Deploy web trên Cloudflare Pages

Trong **Workers & Pages**, chọn tạo **Pages** từ Git, kết nối repo. Đây là dự án Pages với Functions, không chọn luồng tạo Worker thông thường.

| Trường | Giá trị |
| --- | --- |
| Project name | Ví dụ `mot-chut-diary` |
| Production branch | Branch production của bạn |
| Framework preset | Vue hoặc None |
| Root directory | `web` |
| Build command | `npm run build` |
| Build output directory | `dist` |

Thêm biến cho môi trường **Production**:

| Biến | Giá trị | Nơi sử dụng |
| --- | --- | --- |
| `NODE_VERSION` | `24` | Máy build Pages |
| `VITE_API_BASE_URL` | `/api/v1` | Nhúng vào bundle Vue lúc build |
| `API_ORIGIN` | `https://mot-chut-diary-api.onrender.com` | Binding server-side của Pages Function |

`API_ORIGIN` chỉ có scheme + host, không có `/api/v1`, query hay credentials. Đặt trong **Settings → Variables and Secrets**, để Function đọc `env.API_ORIGIN`; không đổi tên thành `VITE_API_ORIGIN`. Không đưa database URL, JWT secret hay R2 keys lên Pages.

Cloudflare tự cài dependency và build trong `web`. Thư mục `functions` nằm tại `web/functions`, cùng cấp với `package.json`, không nằm trong `dist`. `public/_routes.json` được Vite copy vào `dist`. [Vue on Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vue-site/), [Functions setup](https://developers.cloudflare.com/pages/functions/get-started/), [bindings](https://developers.cloudflare.com/pages/functions/bindings/).

Sau deploy:

1. Lấy URL production thật, ví dụ `https://mot-chut-diary.pages.dev`.
2. Sửa `FRONTEND_URL` trên Render cho khớp hoàn toàn, lưu và redeploy API.
3. Nếu đổi biến Pages sau lần build đầu, tạo deployment mới để áp dụng; đặc biệt `VITE_*` chỉ được nhúng lúc build.
4. Mở website qua URL production này.

Không dùng kéo-thả thư mục `dist` trong dashboard để deploy bản này: cần Git integration để build cả Pages Function. Không dùng URL preview ngẫu nhiên để kiểm tra đăng nhập production; Origin đó chưa được backend cho phép. Nếu cần staging, dùng DB/bucket/API riêng và cấu hình môi trường Preview tương ứng.

### Vì sao phải giữ `/api/v1`?

Cookie hiện tại là `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`, không có `Domain`. Khi Pages proxy trả `Set-Cookie`, trình duyệt lưu cookie cho domain Pages. Refresh/logout sau reload vẫn gọi cùng origin Pages.

Nếu đặt `VITE_API_BASE_URL=https://...onrender.com/api/v1`, request từ `pages.dev` sang `onrender.com` là cross-site; cookie Lax sẽ không được gửi trong các fetch đó. CORS riêng lẻ không sửa được vấn đề. Proxy giữ nguyên Origin thực để backend tiếp tục kiểm tra CSRF; không cần đổi cookie thành `SameSite=None`.

Proxy không theo redirect từ backend, chỉ chuyển request tới một `API_ORIGIN` do bạn cấu hình. Nó không trả nội dung lỗi kết nối nội bộ và luôn đặt `Cache-Control: private, no-store`.

## 7. Kiểm tra sau deploy

Chờ API thức dậy nếu lần đầu tải chậm, rồi:

1. Mở `/register`, tạo tài khoản thử và đăng nhập.
2. Reload `/dashboard`; kiểm tra phiên vẫn đăng nhập. DevTools phải thấy cookie `__Secure-diary_refresh` thuộc domain Pages, HttpOnly/Secure, path `/api/v1/auth`.
3. Viết nhật ký, thêm ảnh, mở lại nhật ký và ảnh sau reload.
4. Truy cập trực tiếp `/calendar` bằng URL rồi refresh để kiểm tra SPA fallback.
5. Đăng xuất rồi mở lại URL nhật ký: phải yêu cầu đăng nhập.
6. Thử tài khoản thứ hai: không được đọc nhật ký/ảnh của tài khoản trước.

Probe proxy bằng endpoint có sẵn, không cần token:

```sh
curl -i https://mot-chut-diary.pages.dev/api/v1/moods
```

Kỳ vọng `401`, JSON `success: false`, header `Cache-Control: private, no-store`. `401` ở đây xác nhận request tới API bảo vệ, không phải lỗi deploy. Nếu nhận HTML, Function chưa được deploy hoặc route cấu hình sai.

Kiểm tra local trước khi push:

```sh
cd web
npm ci
npm run test:unit
npm run build
```

`vite dev` vẫn proxy tới localhost bằng `API_PROXY_TARGET`; nó không chạy Pages Function. Các unit test proxy kiểm tra stream, cookie, CSRF, lỗi và redirect bằng upstream giả lập. Chúng không thay thế việc xác nhận credentials R2, Neon và smoke test trên cloud.

## 8. Vận hành và xử lý lỗi

### Render báo database reached but timed out / Prisma P1002

Đọc phần `Context:` trong log. Nếu có `pg_advisory_lock` và timeout `10000ms`, Prisma đang chờ khóa migration; tăng timeout kết nối không giải quyết khóa này. Prisma giữ giới hạn chờ khóa 10 giây. [Prisma advisory locking](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production#advisory-locking).

1. Trong **Render → Environment**, đặt đủ hai biến của **cùng Neon branch/database/role**:
   - `DATABASE_URL`: URL pooled, hostname có `-pooler`.
   - `DATABASE_URL_UNPOOLED`: lấy trong Neon **Connect** khi tắt **Connection pooling**, hostname không có `-pooler`.
2. Giữ tham số SSL do Neon cung cấp. Các file `.env.local` trên máy cá nhân không tự được đưa lên Render. Prisma config hiện báo lỗi ngay nếu URL migration trỏ tới Neon pooler; điều này cũng áp dụng khi build chạy `db:generate`.
3. Lưu biến và redeploy; tránh chạy nhiều lệnh migration đồng thời. Giữ start command ở bước 5.
4. Nếu vẫn chờ khóa dù URL đã direct, kiểm tra `pg_locks`/`pg_stat_activity`. Một phiên pooler từ lần migrate trước có thể còn giữ khóa sau khi migration kết thúc. Chỉ kết thúc đúng phiên giữ khóa sau khi xác nhận nó idle, không có transaction và không có migration đang chạy; không restart cả database hoặc tắt advisory locking để bỏ qua lỗi.

Neon khuyến nghị kết nối direct cho migration và các tác vụ cần session state. [Neon connection errors](https://neon.com/docs/connect/connection-errors).

| Triệu chứng | Kiểm tra |
| --- | --- |
| `API_NOT_CONFIGURED` / 503 | `API_ORIGIN` có trong binding Production của Pages không; origin có đúng HTTPS và chỉ chứa host không; đã redeploy chưa. |
| 502 / lần đầu mở chậm | Render đang ngủ, restart hoặc API chưa chạy; xem Render logs, đợi khởi động rồi thử lại. |
| `CSRF_FAILED` / 403 | URL đang mở có trùng `FRONTEND_URL` không; proxy có giữ `Origin` và `X-CSRF-Protection` không; có đang dùng URL preview không. |
| Đăng nhập được nhưng reload mất phiên | `VITE_API_BASE_URL` phải là `/api/v1`, API production dùng secure cookie, Function trả nguyên `Set-Cookie`. |
| API khởi động thất bại | Đủ biến R2/JWT/DB; Node 24; đã generate Prisma và migrate/seed; Neon còn quota. |
| Prisma CLI không tồn tại | Build dùng `npm ci --include=dev`; không prune devDependencies trước start. |
| `STORAGE_UNAVAILABLE` | Endpoint/key/bucket R2 đúng, token có quyền trên bucket, subscription còn hoạt động. |
| 429 khi nhiều người đăng nhập | Quota auth có thể chia sẻ IP proxy khi `TRUST_PROXY=false`; không sửa bằng cách tin mọi forwarded header. |

Background cleanup chạy mỗi phút và reconciliation mỗi giờ **khi API còn chạy**. Khi Render ngủ, các job này cũng dừng; khi thức sẽ tiếp tục xử lý dữ liệu job trong PostgreSQL. Truy vấn cleanup có thể giữ Neon compute hoạt động, vì vậy theo dõi CU-hours và không ping giữ Render thức liên tục chỉ để né cold start.

Giữ bản sao lưu PostgreSQL và ảnh riêng trước các thay đổi migration/dữ liệu. Không coi gói Free là bản sao lưu duy nhất cho nhật ký quan trọng. Khi cập nhật code, Render và Pages có thể deploy độc lập; nếu thay đổi API contract, giữ tương thích trong thời gian hai bản chưa đồng bộ.

Muốn dùng domain riêng sau này, gắn domain vào Pages rồi cập nhật `FRONTEND_URL` của Render cho origin mới; proxy vẫn giữ `/api/v1`. Domain mua riêng không nằm trong chi phí miễn phí của hướng dẫn.
