# Private Diary — một chút.

Giao diện tiếng Việt theo thiết kế nghiệp vụ trong [README dự án](../README.md), dùng Vue 3, Vite, JavaScript, Vue Router 4 và Pinia. Dữ liệu được đọc/ghi qua API hiện có; giao diện hỗ trợ desktop, mobile và chế độ sáng/tối/theo hệ thống.

## Chạy local

Dùng Node.js 24+ cùng backend. Thiết lập database, migrate và seed theo [hướng dẫn API](../api/README.md), sau đó chạy backend ở terminal riêng:

```sh
cd api
npm run dev
```

Chạy frontend từ thư mục gốc ở terminal khác:

```sh
cd web
npm install
npm run dev
```

Mở **http://localhost:5173**. Vite chuyển tiếp `/api` đến `http://localhost:3000`. Backend cần `FRONTEND_URL=http://localhost:5173` để kiểm tra origin đúng. Có thể sao chép `.env.example` thành `.env.local` và đổi `API_PROXY_TARGET` nếu backend dùng cổng khác. Khởi động lại Vite sau khi đổi env.

## Màn hình

| Đường dẫn | Chức năng |
| --- | --- |
| `/register`, `/login` | Đăng ký, đăng nhập, khôi phục phiên từ refresh cookie |
| `/dashboard` | Tổng quan tháng, cảm xúc, nhật ký gần đây |
| `/diaries` | Tìm kiếm, lọc trạng thái/ngày/cảm xúc/thẻ, sắp xếp, phân trang |
| `/diaries/new`, `/diaries/:id/edit` | Viết/sửa, lưu nháp/hoàn chỉnh, chọn ngày/cảm xúc/thẻ, tải/xóa/sắp xếp ảnh |
| `/diaries/:id` | Đọc nhật ký, ảnh riêng tư, sửa/xóa |
| `/calendar` | Lịch tháng, chọn ngày để mở nhật ký hoặc viết mới |
| `/statistics` | Số bài, ngày viết, hoạt động và phân bố cảm xúc trong tháng |
| `/settings` | Tên, múi giờ, giao diện, quản lý thẻ |

`PUBLISHED` hiển thị là **đã hoàn chỉnh**, nhật ký vẫn riêng tư. Nội dung là văn bản thuần. Chưa có tự lưu; rời trình soạn thảo khi có thay đổi sẽ được cảnh báo. Với nhật ký mới, tải ảnh sẽ tạo bản nháp trước, sau đó tải lần lượt từng ảnh; các ảnh đã tải thành công được giữ nếu một file sau đó lỗi.

## Cấu trúc và xác thực

- `src/views/`: các màn hình; `src/components/`: thành phần dùng chung.
- `src/lib/router.js`: routes và cảnh báo thay đổi chưa lưu.
- `src/lib/api.js`: fetch, xử lý lỗi, refresh phiên, đồng bộ phiên giữa các tab.
- `src/stores/session.js`: Pinia giữ người dùng và access token trong bộ nhớ, không lưu token/nội dung nhật ký vào localStorage.
- `src/components/PrivateImage.vue`: tải ảnh qua request có bearer token, tạo và thu hồi blob URL.

Refresh cookie HttpOnly do backend quản lý. API vẫn chịu trách nhiệm kiểm tra chủ sở hữu; đây không phải mã hóa đầu cuối.

## Build và triển khai

```sh
npm run build
```

Kết quả ở `dist/`. `public/_redirects` cung cấp SPA fallback cho Cloudflare Pages khi reload đường dẫn sâu. Với host khác, cấu hình fallback về `index.html` tương ứng.

Proxy Vite chỉ phục vụ development. Khi deploy, cấu hình reverse proxy cho `/api`, hoặc đặt `VITE_API_BASE_URL=https://<api-host>/api/v1` **trước khi build**; cấu hình HTTPS, `FRONTEND_URL` và cookie trên backend theo domain thực tế. Không đặt JWT secret hoặc khóa storage trong biến `VITE_*`.

## Kiểm thử trình duyệt

```sh
npx playwright install chromium
npm run test:e2e
```

Cần dependencies/Prisma client của `api/` và PostgreSQL binaries local (có thể chỉ định thư mục bằng `PG_BIN`). Test tự mở API cổng `4180`, Vite cổng `4173` và PostgreSQL tạm, migrate/seed, rồi dọn dữ liệu tạm sau khi chạy. Không dùng database trong `api/.env`. Có thể dùng `TEST_DATABASE_URL` trỏ đến database trống, dùng riêng cho test, tên kết thúc `_test`; database này cần được làm trống trước lần chạy tiếp theo.

Nếu Chromium đã cài ngoài Playwright, đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` đến executable. Hai test bao phủ luồng desktop và mobile: auth/refresh, CRUD, ảnh, thẻ, tìm kiếm, lịch, thống kê, theme, cảnh báo chưa lưu, lỗi mạng và retry. Ảnh kiểm tra giao diện ở `test-results/` (đã ignore).
