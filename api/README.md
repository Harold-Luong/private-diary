# Private Diary API

Backend **JavaScript ES modules**, Express 5, Prisma 7, PostgreSQL và ảnh
riêng tư. Chạy trực tiếp bằng Node.js 24+, không dùng TypeScript hoặc bước
compile. Đã triển khai 23 endpoint trong [OpenAPI](docs/openapi.yaml);
[thiết kế API](docs/api-design.md) mô tả quy tắc nghiệp vụ.

## Chạy local

Từ thư mục `api/`, cài dependency và generate Prisma Client:

```sh
npm ci
npm run db:generate
```

Nếu chưa có `.env`, sao chép `.env.example` thành `.env`. Giữ nguyên file
`.env` hiện có nếu bạn đã cấu hình database. Các biến tối thiểu:

```dotenv
PORT=3000
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://diary:diary@localhost:5432/private_diary
STORAGE_DRIVER=local
```

Nếu đã chạy Neon CLI tại root, API đọc `.env.local`/`.env` ở root trước file tương ứng trong `api/`; biến môi trường được truyền từ shell/hosting có ưu tiên cao nhất. Runtime dùng `DATABASE_URL`, Prisma migration dùng `DATABASE_URL_UNPOOLED` (fallback `DATABASE_URL` cho local). Xem [thiết lập Neon](../docs/neon-setup.md).

PostgreSQL phải chạy và database trong `DATABASE_URL` phải tồn tại. Dùng
UTF-8 và locale hỗ trợ Unicode, chẳng hạn `C.UTF-8`, để tìm kiếm tiếng Việt
không phân biệt hoa/thường. Không dùng locale `C` thuần ASCII cho production.
Sau đó:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Base URL: `http://localhost:<PORT>/api/v1`. `npm start` chạy không watch.
Migration chỉ áp dụng file đã lưu trong `prisma/migrations`, không reset
database. Seed mood có thể chạy lại mà không tạo bản ghi trùng.

Local mặc định lưu ảnh trong `.data/images`; đường dẫn này không được mount
static. Mọi request đọc ảnh vẫn phải có bearer token. `.env` và ảnh local
đã được loại khỏi Git.

Nếu không đặt `JWT_SECRET` ở development, server tạo khóa tạm trong memory;
access token cũ không còn hợp lệ sau restart. Để giữ khóa ổn định, sinh một
secret và lưu riêng vào `.env` (không commit):

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Swagger UI

Sau khi chạy server, mở `http://localhost:<PORT>/api-docs/` (mặc định port
3000). UI đọc từ `docs/openapi.yaml`, dùng API trên cùng origin để không phải
sửa URL khi đổi port.

1. Mở `POST /auth/register` hoặc `POST /auth/login`, chọn **Try it out**, nhập
   body rồi **Execute**. Header CSRF được tự thêm; browser tự gửi Origin/cookie.
2. Copy `data.accessToken` trong response, bấm **Authorize**, dán token vào
   `bearerAuth` (không thêm tiền tố `Bearer`).
3. Thử các endpoint cần đăng nhập. Refresh/logout dùng cookie HttpOnly tự
   động; sau refresh, thay access token mới trong Authorize. Reload trang
   sẽ xóa bearer token khỏi UI.

JSON dành cho UI: `/api-docs/openapi.json`. File YAML gốc:
`/api-docs/openapi.yaml`. UI không gửi spec tới validator bên ngoài.

Local mặc định cho phép auth từ `http://localhost:<PORT>`. Nếu mở UI bằng
IP/domain khác, đặt `SWAGGER_ORIGIN` đúng origin đó trong `.env`; production
dùng origin HTTPS, ví dụ `SWAGGER_ORIGIN=https://api.diary.example.com`.
Origin khác vẫn bị chặn; header CSRF vẫn bắt buộc. `SWAGGER_ORIGIN` được thêm
vào allowlist cùng `FRONTEND_URL`.

## Gọi API

Register/login/refresh/logout bắt buộc `Origin` khớp `FRONTEND_URL` và
`X-CSRF-Protection: 1`. Ví dụ đăng ký (thay port theo `.env`):

```sh
curl -i http://localhost:3000/api/v1/auth/register \
  -H 'Origin: http://localhost:5173' \
  -H 'X-CSRF-Protection: 1' \
  -H 'Content-Type: application/json' \
  --data '{"email":"minh@example.com","password":"example-long-password"}'
```

Response trả access token để frontend giữ trong memory. Refresh token được
đặt bằng cookie HttpOnly; browser dùng `credentials: 'include'`. Local HTTP
dùng cookie `diary_refresh`; HTTPS dùng `__Secure-diary_refresh`. Refresh/logout
không gửi body. Các endpoint khác dùng `Authorization: Bearer <accessToken>`.

Ví dụ frontend tạo nháp:

```js
const response = await fetch(`${apiBaseUrl}/diaries`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({}),
});
const { data: diary } = await response.json();
```

Upload qua `FormData` với đúng một field `file`; không tự đặt Content-Type
multipart vì browser cần tạo boundary. Đọc ảnh qua fetch bearer rồi tạo
Blob URL. Content nhật ký là plain text; ảnh gốc chưa loại EXIF/GPS.

## R2 và vận hành

Hướng dẫn triển khai bản Node.js này với các gói miễn phí: [Cloudflare Pages + Render + Neon + R2](../docs/deploy-cloudflare.md). Pages proxy giữ cookie đăng nhập cùng origin frontend; backend vẫn chạy trên Render.

Đặt `STORAGE_DRIVER=r2` cùng `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` theo `.env.example`. Bucket phải private, không bật
public domain. Credentials chỉ cấp quyền đọc/ghi/xóa/list trên bucket cần dùng.
Adapter Node sử dụng S3-compatible API của R2.

Production cần `NODE_ENV=production`, `JWT_SECRET` ít nhất 32 bytes,
`COOKIE_SECURE=true`, R2 và frontend origin HTTPS. `FRONTEND_URL` có thể là
danh sách origin ngăn bằng dấu phẩy, không có dấu `/` cuối. Cookie SameSite=Lax
phù hợp frontend/API cùng site như hai subdomain trong thiết kế; cross-site
hosting cần điều chỉnh chiến lược cookie trước khi triển khai.

Nếu đặt sau reverse proxy, cấu hình `TRUST_PROXY` bằng IP/subnet proxy cụ
thể, ngăn client kết nối trực tiếp backend và cấu hình proxy ghi đè forwarded
headers. Không chấp nhận `TRUST_PROXY=true` để tránh giả IP vượt rate limit.
DB lưu bộ đếm rate limit, vì vậy nhiều instance chia sẻ cùng quota.

Server chạy cleanup mỗi phút và reconciliation orphan mỗi giờ. Có thể chạy
tách qua cron:

```sh
npm run jobs:run
```

Cleanup có lease, retry/backoff và ghi việc xóa trong cùng transaction với
metadata. Log chỉ chứa tên sự kiện, request ID hoặc số lần thử, không chứa
nội dung nhật ký/cookie/token/SQL/bytes ảnh. Cần theo dõi sự kiện
`storage_cleanup_failed` và `cleanup_worker_failed` khi vận hành.

Backend hiện chạy **Node.js**. Entry point dùng HTTP server, filesystem local
và thư viện Argon2 native; không phải bundle có thể đưa thẳng lên Cloudflare
Workers. Muốn chạy Workers cần adapter HTTP, password hashing và storage
binding phù hợp, cùng kiểm thử runtime riêng. Frontend vẫn có thể host trên
Cloudflare Pages và gọi backend Node qua HTTPS.

## Kiểm thử

```sh
npm run check
npm test
```

`check` kiểm tra cú pháp JavaScript, không cho `.ts` trong source và validate
OpenAPI. `test` chạy integration test với PostgreSQL thật, migrations thật,
HTTP và storage local. Mặc định bộ test tự tạo cluster tạm dưới `/tmp`, chỉ
mở Unix socket, dọn sau khi chạy; **không dùng database trong `.env`**.

Linux cần PostgreSQL binaries (`initdb`, `pg_ctl`); tự tìm trong
`/usr/lib/postgresql/<version>/bin`, hoặc chỉ định `PG_BIN`. Máy không có
binaries có thể truyền `TEST_DATABASE_URL` trỏ tới database rỗng, chuyên
dùng cho test, tên kết thúc bằng `_test`. Với database ngoài này, test không
xóa database sau khi chạy; bạn tự tạo database rỗng mới cho lần chạy sau.

Các ca kiểm thử bao gồm auth/reuse/logout, quyền sở hữu, publish/timezone,
tags, tìm kiếm tiếng Việt, lịch/thống kê, ảnh riêng tư, upload đồng thời,
cleanup retry và rate limit. Cấu hình R2 thật cần smoke test riêng với bucket
development; test local không xác nhận credentials/bucket production.

## Cấu trúc

```text
src/
  app.js              Express app, middleware, routes
  server.js           Khởi động Node HTTP server
  config.js           Validate environment
  db.js               Prisma + PostgreSQL adapter
  storage.js          Private filesystem/R2 adapters
  common/             Validation, lỗi, DTO, rate limit
  modules/            Khai báo route và gắn middleware/controller
  controllers/        Các hàm xử lý request theo từng nhóm API
  middleware/         Xác thực, CSRF và middleware dùng chung
  jobs/               Cleanup và reconciliation
prisma/
  schema.prisma
  migrations/
  seed.js
tests/                Integration tests PostgreSQL
docs/                 Thiết kế và OpenAPI
```
