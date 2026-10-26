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
| `/calendar` | Lịch tháng dương/âm Việt Nam, chọn ngày để mở nhật ký hoặc viết mới |
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

Xem [hướng dẫn deploy miễn phí](../docs/deploy-cloudflare.md) cho Cloudflare Pages + Pages Function proxy, Render API, Neon và R2. Repo đã có `functions/api/[[path]].js`; trên Pages giữ `VITE_API_BASE_URL=/api/v1` và đặt binding `API_ORIGIN` tới origin HTTPS của backend.

```sh
npm run build
```

Kết quả ở `dist/`. `public/_redirects` cung cấp SPA fallback cho Cloudflare Pages khi reload đường dẫn sâu. Với host khác, cấu hình fallback về `index.html` tương ứng.

Proxy Vite chỉ phục vụ development. Pages dùng Function riêng cho `/api/*`; các route tĩnh không chạy Function. Chỉ gọi API trực tiếp bằng `VITE_API_BASE_URL=https://<api-host>/api/v1` khi frontend/API cùng site và đã cấu hình HTTPS, `FRONTEND_URL`, cookie phù hợp. Hai domain `pages.dev` và `onrender.com` cần proxy để refresh cookie SameSite=Lax hoạt động. Không đặt JWT secret hoặc khóa storage trong biến `VITE_*`.

## Âm lịch Việt Nam

Trang lịch hiển thị ngày âm dưới ngày dương, đánh dấu mùng 1/ngày rằm và ghi `N` cho tháng nhuận. Phần ngày được chọn có đủ ngày, tháng, năm âm và tên năm Can Chi. Dữ liệu nhật ký và liên kết viết/lọc vẫn dùng ngày dương.

Chuyển đổi tại frontend bằng [@nghiavuive/lunar_date_vi](https://github.com/nacana22/lunar-date), dùng bảng âm lịch Việt Nam của Hồ Ngọc Đức. Truyền các thành phần ngày/tháng/năm thay vì timestamp UTC để giữ nguyên ngày nhật ký khi người dùng đổi múi giờ. Phạm vi hiển thị âm lịch: 1800–2199; ngoài phạm vi này vẫn xem lịch dương bình thường.

Chạy kiểm tra chuyển đổi (Tết, Trung thu, tháng nhuận, múi giờ và giới hạn ngày):

```sh
npm run test:unit
```

## Kiểm thử trình duyệt

```sh
npx playwright install chromium
npm run test:e2e
```

Cần dependencies/Prisma client của `api/` và PostgreSQL binaries local (có thể chỉ định thư mục bằng `PG_BIN`). Test tự mở API cổng `4180`, Vite cổng `4173` và PostgreSQL tạm, migrate/seed, rồi dọn dữ liệu tạm sau khi chạy. Không dùng database trong `api/.env`. Có thể dùng `TEST_DATABASE_URL` trỏ đến database trống, dùng riêng cho test, tên kết thúc `_test`; database này cần được làm trống trước lần chạy tiếp theo.

Nếu Chromium đã cài ngoài Playwright, đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` đến executable. Các test bao phủ luồng desktop và mobile: auth/refresh, CRUD, ảnh, thẻ, tìm kiếm, lịch, thống kê, theme, cảnh báo chưa lưu, lỗi mạng và retry. Test âm lịch dùng dữ liệu giả lập để kiểm tra Tết, tháng nhuận, chọn ngày, lọc trạng thái và bố cục màn hình nhỏ. Ảnh kiểm tra giao diện ở `test-results/` (đã ignore).
