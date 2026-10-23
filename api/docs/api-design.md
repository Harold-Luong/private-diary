# Thiết kế API Private Diary — MVP

Trạng thái: **đã có bản triển khai JavaScript/Node.js** trong `api/src`.
Hướng dẫn chạy và kiểm thử: [API README](../README.md). Tài liệu này
cụ thể hóa mục 3, 6, 7, 9, 10 và 12 của [README dự án](../../README.md).
Contract máy đọc được nằm tại [openapi.yaml](./openapi.yaml), sử dụng
[OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html).
Các giới hạn và mặc định dưới đây được dùng cho MVP. Bản Node local dùng
cookie `diary_refresh` khi chạy HTTP và private filesystem khi chưa cấu hình
R2; production dùng cookie Secure và R2. Chưa có adapter chạy Cloudflare Workers.

## 1. Quy ước chung

- Base path: `/api/v1`. Production dùng HTTPS.
- JSON dùng `camelCase`, ID dùng UUID; datetime trả ISO 8601 UTC.
- `diaryDate`, `fromDate`, `toDate` là ngày lịch hợp lệ `YYYY-MM-DD`,
  trong khoảng năm 0001–9999; không chuyển thành timestamp phía frontend.
- JSON request phải là object; từ chối trường không khai báo, bao gồm
  `userId`, `deletedAt`, `objectKey`. Query lạ, query lặp và kiểu sai trả `400`.
- JSON body tối đa 1 MiB (1,048,576 bytes), keyword tối đa 200 ký tự,
  content tối đa 100,000 ký tự. Vượt kích thước body trả `413`; vượt độ dài
  một trường trả `400`.
- `PATCH`: trường bị bỏ qua giữ nguyên; `null` chỉ xóa trường nullable;
  mảng thay thế toàn bộ. Object PATCH rỗng trả `400`.
- Response JSON thành công: `{ "success": true, "data": ... }`;
  `meta` chỉ xuất hiện với danh sách phân trang. `204` không có body.
- Tất cả response có `X-Request-Id` do server sinh và
  `Cache-Control: private, no-store`; áp dụng cả lỗi và stream ảnh.
- Các endpoint cần xác thực dùng `Authorization: Bearer <accessToken>`,
  trừ refresh/logout dùng cookie. `GET /moods` cũng cần xác thực.
- ID đúng định dạng nhưng không tồn tại, thuộc người khác hoặc tài nguyên
  cha đã bị xóa đều trả `404 RESOURCE_NOT_FOUND`. ID sai định dạng trả `400`.
- Không có endpoint đọc toàn bộ dữ liệu người dùng, restore hoặc hard delete
  trong MVP. Không trả password hash, refresh token hay R2 object key.

Ví dụ lỗi:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu không hợp lệ",
    "details": [{ "field": "content", "code": "REQUIRED_WHEN_PUBLISHED" }]
  },
  "requestId": "a510bb0f-e8ea-4661-ad45-5cf3477e865b"
}
```

`details` tùy chọn; không echo nội dung nhập, token, email hoặc bytes ảnh.
Frontend xử lý theo `code`, không phân tích `message`.

## 2. Danh sách endpoint

Đường dẫn dưới đây đã bỏ tiền tố `/api/v1`. `{id}` là diary ID,
trừ nhóm tags dùng `{tagId}`.

| Method | Path | Thành công | Ý nghĩa |
| --- | --- | --- | --- |
| POST | `/auth/register` | 201 | Tạo tài khoản và phiên |
| POST | `/auth/login` | 200 | Tạo phiên đăng nhập |
| POST | `/auth/refresh` | 200 | Xoay refresh token |
| POST | `/auth/logout` | 204 | Thu hồi phiên hiện tại |
| GET | `/users/me` | 200 | Profile và settings |
| PATCH | `/users/me` | 200 | Sửa profile/settings |
| POST | `/diaries` | 201 | Tạo nháp hoặc bài published |
| GET | `/diaries` | 200 | Danh sách phân trang |
| GET | `/diaries/calendar` | 200 | Số bài theo ngày |
| GET | `/diaries/statistics` | 200 | Thống kê trong khoảng ngày |
| GET | `/diaries/{id}` | 200 | Chi tiết bài |
| PATCH | `/diaries/{id}` | 200 | Sửa/lưu nháp/xuất bản |
| DELETE | `/diaries/{id}` | 204 | Xóa mềm bài |
| GET | `/moods` | 200 | Danh mục mood hệ thống |
| GET | `/tags` | 200 | Tags cá nhân, phân trang |
| POST | `/tags` | 201 | Tạo tag |
| PATCH | `/tags/{tagId}` | 200 | Đổi tên tag |
| DELETE | `/tags/{tagId}` | 204 | Xóa tag và liên kết |
| POST | `/diaries/{id}/images` | 201 | Upload một file |
| GET | `/diaries/{id}/images` | 200 | Metadata các ảnh |
| GET | `/diaries/{id}/images/{imageId}/content` | 200 | Bytes ảnh riêng tư |
| DELETE | `/diaries/{id}/images/{imageId}` | 204 | Xóa ảnh khỏi ứng dụng |
| PATCH | `/diaries/{id}/images/order` | 200 | Sắp xếp toàn bộ ảnh |

Đăng ký các route `calendar`, `statistics`, `images/order` trước route
động tương ứng. Response `201` có `Location` trỏ tới tài nguyên mới;
upload trỏ tới endpoint content, register trỏ tới `/api/v1/users/me`.

## 3. Authentication và phiên

### Request và response

`POST /auth/register`:

```json
{
  "email": "minh@example.com",
  "password": "example-long-password",
  "displayName": "Minh",
  "timezone": "Asia/Ho_Chi_Minh"
}
```

- Bắt buộc email/password; email trim + lowercase, tối đa 255 ký tự,
  kiểm tra email hợp lệ. Không tự xóa dấu chấm hay phần `+suffix` của email.
- Password 12–128 ký tự, không trim/normalize/truncate; ưu tiên Argon2id
  phù hợp runtime. Nếu chọn bcrypt phải xử lý rõ giới hạn bytes, không
  âm thầm cắt password. Đây là điểm cần prototype trước triển khai.
- `displayName` tùy chọn, nullable; giá trị không null sau trim dài 1–150.
- Timezone là IANA identifier hợp lệ, mặc định `Asia/Ho_Chi_Minh`;
  theme mặc định `SYSTEM`. Tạo user/settings/session cùng transaction.
- Email trùng trả `409 EMAIL_ALREADY_EXISTS`. Thiết kế MVP chấp nhận
  việc endpoint đăng ký có thể tiết lộ email đã đăng ký; cần rate limit.

`POST /auth/login`: `{ "email": "minh@example.com", "password": "..." }`.
Email không tồn tại hoặc password sai cùng trả `401 INVALID_CREDENTIALS`.
Login chấp nhận password không rỗng tối đa 128 ký tự để không phụ thuộc
chính sách độ dài tối thiểu tại thời điểm tài khoản được tạo.

Register, login, refresh trả cùng cấu trúc `data`:

```json
{
  "accessToken": "<JWT>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "5d44838c-36b0-44f3-aede-437389cd359f",
    "email": "minh@example.com",
    "displayName": "Minh",
    "settings": { "timezone": "Asia/Ho_Chi_Minh", "theme": "SYSTEM" },
    "createdAt": "2026-10-23T08:00:00Z",
    "updatedAt": "2026-10-23T08:00:00Z"
  }
}
```

### Cookie, CORS và CSRF

- Access token sống 15 phút, chỉ giữ trong memory. JWT chứa `sub`, `sid`,
  `iat`, `exp`, `iss`, `aud`; kiểm tra chữ ký, thuật toán cho phép và claims.
- Refresh token ngẫu nhiên sống trong một phiên tối đa 30 ngày tính từ
  login/register; rotate không gia hạn thời hạn tuyệt đối này. Chỉ lưu hash.
- Production đề xuất hai custom domain cùng site như README. Cookie:
  `__Secure-diary_refresh=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`.
  Không đặt `Domain` (host-only), `Max-Age` bằng thời gian còn lại của phiên.
- Register/login/refresh/logout dùng `credentials: 'include'`. Chúng đều
  bắt buộc `Origin` khớp chính xác allowlist frontend và header
  `X-CSRF-Protection: 1`; thiếu/sai trả `403 CSRF_FAILED`. Đây là custom
  header buộc trình duyệt preflight, không phải CSRF secret.
- CORS chỉ cho origin cụ thể, bật credentials, cho phép `Authorization`,
  `Content-Type`, `X-CSRF-Protection`; expose `X-Request-Id`, `Location`,
  `Retry-After`. `OPTIONS` không yêu cầu JWT. Không dùng wildcard origin.
- CLI/test cũng gửi Origin được phép. Nếu chạy frontend trên `pages.dev`
  và API trên `workers.dev`, cần thiết kế cookie cross-site riêng; không
  mặc định áp dụng cookie production trên. Local ưu tiên HTTPS hoặc proxy
  cùng origin; cookie không Secure chỉ được cấu hình riêng cho local HTTP.

### Refresh và logout

`POST /auth/refresh` không có body, lấy cookie; không yêu cầu access token.
Trong một transaction: kiểm tra phiên còn hiệu lực, đánh dấu token cũ đã
dùng và tạo token mới. Chỉ một request đồng thời có thể rotate thành công.
Token đã dùng bị gửi lại làm thu hồi cả phiên (`401 REFRESH_TOKEN_REUSED`),
không thu hồi các thiết bị khác. Frontend phải gộp refresh đồng thời và
điều phối giữa các tab; nếu mất response refresh thì đăng nhập lại, không
tự retry token cũ. Cookie được xóa khi refresh thất bại với `401`.

`POST /auth/logout` không có body; thu hồi phiên nhận diện qua cookie và xóa
cookie với cùng Path/thuộc tính. Cookie thiếu/không hợp lệ/đã revoke vẫn trả
`204` sau khi CSRF check thành công. Token cũ còn được lưu để nhận diện
phiên và logout khi cần. Logout không ảnh hưởng thiết bị khác.

**Thu hồi có hiệu lực với request mới ngay:** middleware kiểm tra session
`sid` vẫn active ngoài kiểm tra JWT; request đã được chấp nhận trước khi
revoke có thể hoàn tất. Không cache trạng thái session trong MVP.
README cần mở rộng schema phiên như mục 10, vì JWT thuần stateless không
đáp ứng hành vi này.

## 4. User

`GET /users/me` trả User như trong auth response.

`PATCH /users/me` chỉ nhận:

```json
{
  "displayName": "Minh Nguyễn",
  "settings": { "timezone": "Asia/Ho_Chi_Minh", "theme": "DARK" }
}
```

`displayName: null` xóa tên; `settings` được merge theo trường, không nhận
null/object rỗng. Theme: `LIGHT | DARK | SYSTEM`. Không đổi email/password
trong MVP. Trả User mới; mọi thay đổi settings cũng cập nhật `User.updatedAt`.
Đổi timezone không viết lại ngày của bài cũ; chỉ ảnh hưởng cách tính hôm nay,
ngày mặc định và kiểm tra xuất bản ở các request tiếp theo.

## 5. Nhật ký

### Tạo và cập nhật

`POST /diaries` chấp nhận `{}` để tạo nháp rỗng:

| Trường | Mặc định | Validation |
| --- | --- | --- |
| `title` | null | null hoặc trim dài 1–255; chuỗi trắng chuẩn hóa thành null |
| `content` | `""` | Plain text, tối đa 100,000 ký tự; giữ nguyên xuống dòng/khoảng trắng |
| `diaryDate` | Hôm nay theo timezone user | Ngày lịch hợp lệ |
| `status` | `DRAFT` | `DRAFT` hoặc `PUBLISHED` |
| `moodId` | null | UUID mood tồn tại hoặc null |
| `tagIds` | `[]` | Tối đa 20 UUID khác nhau, tất cả thuộc user |

`PATCH /diaries/{id}` nhận cùng các trường, ít nhất một trường.
`tagIds: []` gỡ tất cả tags; `moodId: null` gỡ mood; `content: ""` xóa nội dung.
Không nhận `content: null`, `tagIds: null` hay `status: null`.

Kiểm tra **trạng thái sau merge**, không chỉ các trường trong PATCH:

- `DRAFT`: cho phép nội dung trắng và ngày tương lai.
- `PUBLISHED`: `content.trim()` phải khác rỗng và `diaryDate` không sau
  hôm nay theo timezone hiện tại. Sai trả `400 VALIDATION_ERROR` với
  detail `REQUIRED_WHEN_PUBLISHED` hoặc `FUTURE_DATE_NOT_ALLOWED`.
- Cho phép `DRAFT ↔ PUBLISHED`; không cần endpoint publish riêng.
- Mood không tồn tại: `400 INVALID_MOOD`. Tag không tồn tại/khác user:
  `400 INVALID_TAGS`, không tiết lộ tag nào thuộc người khác.
- Ghi diary và thay thế DiaryTag trong một transaction. Khóa diary khi
  cập nhật để merge lên bản mới nhất. Cùng sửa một trường: lần ghi sau thắng;
  MVP chưa có version/ETag để phát hiện xung đột giao diện.

POST/PATCH/GET chi tiết trả `DiaryDetail`:

```json
{
  "id": "5f32f83e-03dd-4dcd-a1fc-0b94683b1a34",
  "title": "Một ngày đáng nhớ",
  "content": "Hôm nay mình hoàn thành thiết kế API.",
  "diaryDate": "2026-10-23",
  "status": "PUBLISHED",
  "mood": {
    "id": "8accbbcc-412e-4f11-9a6f-ea7b5c523f69",
    "code": "HAPPY", "name": "Vui", "emoji": "😊", "score": 4
  },
  "tags": [],
  "images": [],
  "createdAt": "2026-10-23T08:00:00Z",
  "updatedAt": "2026-10-23T08:00:00Z"
}
```

`mood` nullable; tags trả `{id, name}`, sắp theo name rồi id; images theo
sortOrder. Không trả userId/deletedAt. Content là plain text, frontend render
dưới dạng text, không diễn giải HTML.

### Danh sách và tìm kiếm

`GET /diaries`:

| Query | Mặc định | Quy tắc |
| --- | --- | --- |
| `page` | 1 | Số nguyên 1–10,000 |
| `limit` | 20 | Số nguyên 1–50 |
| `keyword` | Bỏ lọc | Trim, 1–200 ký tự; substring không phân biệt hoa/thường trong title OR content |
| `status` | Cả hai | `DRAFT` hoặc `PUBLISHED` |
| `moodId` | Bỏ lọc | UUID |
| `tagId` | Bỏ lọc | Một UUID |
| `fromDate`, `toDate` | Không chặn đầu tương ứng | Bao gồm hai đầu; nếu có cả hai thì from ≤ to |
| `sort` | `diaryDate:desc` | `diaryDate:asc`, `diaryDate:desc`, `createdAt:asc`, `createdAt:desc`, `updatedAt:asc`, `updatedAt:desc` |

Các filter kết hợp AND. `%`, `_` trong keyword là ký tự thường, không phải
wildcard SQL; không hỗ trợ regex/bỏ dấu. Keyword trắng trả `400`.
Filter ID không tồn tại/khác user trả danh sách rỗng; không xác nhận sự tồn tại.
Luôn thêm `id` cùng chiều sort để thứ tự xác định khi giá trị bằng nhau.
Offset pagination có thể dịch chuyển khi dữ liệu thay đổi giữa hai request.

`data` là mảng DiarySummary: mọi trường DiaryDetail trừ `content`, `images`;
thêm `excerpt` (200 Unicode code points đầu của content, không thêm dấu ba
chấm) và `imageCount`. Không tự tải bytes ảnh trong danh sách.

```json
{
  "success": true,
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

`total` sau mọi filter; page vượt số trang trả mảng rỗng, không phải `404`.
Đọc items/count trong cùng snapshot DB để metadata nhất quán trong response.

### Xóa mềm

`DELETE /diaries/{id}` đặt `deletedAt`; nhật ký lập tức biến mất khỏi list,
detail, calendar, statistics và các route ảnh. Tạo job cleanup ảnh bền vững
trong cùng transaction; không chờ R2 delete để trả `204`.
Lặp DELETE bài đã xóa trả `404`; trạng thái dữ liệu vẫn idempotent.
MVP đề xuất cleanup ảnh ngay qua job sau commit; không có restore API.
Thời hạn purge bản ghi nhật ký/backup cần chốt riêng trước production.

## 6. Mood và tag

`GET /moods` trả mảng `{id, code, name, emoji, score}` theo score tăng dần,
sau đó code. Đề xuất seed `VERY_SAD=1`, `SAD=2`, `NEUTRAL=3`, `HAPPY=4`,
`VERY_HAPPY=5`. ID do DB cấp; frontend không hardcode ID. Không CRUD mood.

`GET /tags` nhận `page`, `limit` giống diaries và `keyword` tùy chọn dài
1–50 sau trim, substring không phân biệt hoa/thường; sort name rồi id tăng dần.
Trả mảng `{id, name}` và meta phân trang, không chứa diary content.

POST/PATCH tag chỉ nhận `{ "name": "gia đình" }`; trim, Unicode NFC,
1–50 ký tự. Tên duy nhất theo user và **phân biệt hoa/thường** để khớp
unique constraint tham chiếu trong README; frontend nên gợi ý tag gần giống.
Tên trùng trả `409 TAG_ALREADY_EXISTS`. PATCH trả tag mới, liên kết giữ nguyên.

DELETE tag hard delete tag và tất cả DiaryTag liên quan trong transaction,
không xóa diary. Khóa/serialize với thao tác gắn tag để không tạo liên kết
treo; ghi tag đã bị xóa trả `400 INVALID_TAGS`. Lặp DELETE trả `404`.
Đổi tên/xóa tag không làm đổi `Diary.updatedAt`; frontend invalidate cache
của tag, diary và thống kê sau thao tác.

## 7. Ảnh riêng tư

`POST /diaries/{id}/images` nhận `multipart/form-data`, đúng **một** field
`file`, không có field khác. Upload nhiều ảnh bằng nhiều request; mỗi file
thành công độc lập, frontend giữ kết quả và retry riêng file thất bại.

- Chốt 10 MB = **10,000,000 bytes/file**, tối đa 10 ảnh/diary theo README.
  Multipart request tối đa 10,100,000 bytes kể cả overhead. Stream đếm bytes,
  không dựa hoàn toàn vào Content-Length; vượt bất kỳ giới hạn nào trả `413`.
- File phải không rỗng; chỉ JPEG/PNG/WebP. MIME khai báo phải khớp chữ ký,
  đuôi file không quyết định loại; sai/không hỗ trợ trả `415`.
- Auth/ownership trước khi đọc toàn bộ body. Đủ 10 ảnh trả
  `409 IMAGE_LIMIT_EXCEEDED`, kể cả khi có nhiều request đồng thời.
- Metadata chỉ xuất hiện sau khi R2 PUT và DB commit thành công.
- MVP giữ bytes gốc đã kiểm tra, **chưa loại EXIF/GPS**; nếu muốn bỏ metadata
  cần pipeline xử lý ảnh riêng. Không tự đổi phần mở rộng thành `.webp`.
- Ảnh mới nối cuối; sortOrder liên tục từ 0. Upload/xóa/reorder cập nhật
  `Diary.updatedAt` để sort theo thời gian phản ánh thay đổi gallery.

Metadata trả trong POST, list, reorder và DiaryDetail:

```json
{
  "id": "efc56b3c-59ae-431b-88e3-3ac170234fe7",
  "diaryId": "5f32f83e-03dd-4dcd-a1fc-0b94683b1a34",
  "originalName": "buoi-chieu.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 248120,
  "sortOrder": 0,
  "contentUrl": "/api/v1/diaries/5f32f83e-03dd-4dcd-a1fc-0b94683b1a34/images/efc56b3c-59ae-431b-88e3-3ac170234fe7/content",
  "createdAt": "2026-10-23T08:05:00Z"
}
```

`originalName` nullable, chỉ lưu basename đã loại ký tự điều khiển và giới
hạn 255 ký tự; không dùng làm object key hoặc ghép trực tiếp vào HTTP header.
`contentUrl` là đường dẫn API, phải resolve theo API origin khi frontend
khác domain. Không phải public URL và không chứa token.

GET content kiểm tra đồng thời `userId`, `diaryId`, `imageId`, diary còn active.
Trả bytes với Content-Type đã xác minh, Content-Length,
`Content-Disposition: inline`, `X-Content-Type-Options: nosniff`.
Không có JSON envelope khi thành công; lỗi vẫn là JSON chuẩn.
MVP không hỗ trợ Range/conditional GET: bỏ qua các header này và trả toàn bộ
file `200` sau auth. Frontend fetch có bearer rồi tạo/revoke Blob URL.
Metadata còn nhưng R2 object thiếu trả `503 STORAGE_UNAVAILABLE`, phát cảnh
báo vận hành không chứa nội dung/bytes ảnh.

`PATCH /diaries/{id}/images/order` nhận `{ "imageIds": ["<uuid>", "<uuid>"] }`.
Danh sách phải chứa **đúng toàn bộ** ảnh hiện tại của diary, mỗi ID một lần;
`[]` chỉ hợp lệ khi diary không có ảnh. ID trùng/sai kiểu trả `400`.
Danh sách khác tập ảnh hiện tại trả `409 IMAGE_ORDER_CONFLICT` với thông báo
chung, kể cả ID của người khác. Khóa diary trong transaction, cập nhật
sortOrder = vị trí, trả danh sách metadata mới; frontend tải lại khi `409`.

DELETE image xóa metadata, đánh lại sortOrder và ghi outbox xóa R2 cùng
transaction, trả `204`; lỗi R2 sau đó được retry bởi worker. Sau commit,
GET content trả `404`. Không có khả năng khôi phục ảnh qua API.

### Nhất quán DB và R2

Không giữ DB transaction mở trong khi stream file sang R2. Luồng đề xuất:

1. Auth/ownership, kiểm tra sơ bộ quota và file; ghi một upload intent bền
   vững với object key ngẫu nhiên và thời hạn xử lý.
2. PUT bytes hợp lệ vào private bucket.
3. Transaction khóa diary, kiểm tra lại ownership/deletedAt và đếm ảnh,
   thêm metadata nếu còn slot, tăng updatedAt, đánh dấu intent hoàn thành.
4. Nếu diary đã xóa/quota hết/DB lỗi, không tạo metadata; intent cho phép
   worker xóa bù cả khi request bị crash. Trả lỗi tương ứng.
5. Job claim intent hết hạn theo transaction; finalize chỉ chấp nhận intent
   còn active. Reconciliation xóa orphan; R2 delete được retry idempotently.

Mọi mutation ảnh và xóa diary dùng cùng cơ chế khóa diary. Như vậy 9 ảnh +
2 upload đồng thời chỉ có một metadata mới được commit. Intent cleanup
phải có khoảng đệm và reconciliation để xử lý PUT kết thúc muộn sau timeout.

## 8. Calendar và statistics

### Calendar

`GET /diaries/calendar?year=2026&month=10&status=PUBLISHED`

- `year` bắt buộc, 1–9999; `month` bắt buộc, 1–12.
- `status` tùy chọn DRAFT/PUBLISHED, bỏ qua nghĩa là cả hai.
- Đếm theo diaryDate, không theo createdAt. Trả mọi ngày trong tháng tăng dần,
  kể cả ngày không có bài. `total = draftCount + publishedCount` sau filter.
- `timezone` là setting hiện tại; đổi timezone không dịch chuyển diaryDate.

```json
{
  "success": true,
  "data": {
    "year": 2026,
    "month": 10,
    "timezone": "Asia/Ho_Chi_Minh",
    "days": [
      { "date": "2026-10-01", "total": 0, "draftCount": 0, "publishedCount": 0 }
    ]
  }
}
```

Ví dụ rút gọn một ngày; response thật tháng 10 có đủ 31 phần tử.

### Statistics

`GET /diaries/statistics?fromDate=2026-10-01&toDate=2026-10-31&status=PUBLISHED`

- Hai ngày phải cùng có hoặc cùng vắng; vắng thì dùng đầu/cuối tháng hiện
  tại theo timezone user. Bao gồm hai đầu, tối đa 366 ngày; from ≤ to.
- `status` là `DRAFT | PUBLISHED | ALL`, mặc định `PUBLISHED` để dashboard
  phản ánh bài đã viết xong. Calendar/list mặc định cả hai, frontend cần
  gửi status rõ ràng nếu muốn số liệu giữa các màn hình đồng nhất.
- Không nhận filter keyword/moodId/tagId trong MVP.
- Mọi số liệu chỉ tính bài active thuộc user sau filter ngày/status.

```json
{
  "success": true,
  "data": {
    "fromDate": "2026-10-01",
    "toDate": "2026-10-31",
    "timezone": "Asia/Ho_Chi_Minh",
    "status": "PUBLISHED",
    "totalEntries": 3,
    "draftCount": 0,
    "publishedCount": 3,
    "activeDays": 2,
    "imageCount": 4,
    "averageMoodScore": 4.5,
    "moodDistribution": [
      { "moodId": "8accbbcc-412e-4f11-9a6f-ea7b5c523f69", "count": 1 },
      { "moodId": "9ec80148-6507-45be-8953-397b7f5ea133", "count": 1 },
      { "moodId": null, "count": 1 }
    ]
  }
}
```

`activeDays = count(distinct diaryDate)`; nhiều bài/ngày vẫn là một ngày.
Average là trung bình mood score theo **bài có mood**, làm tròn hai chữ số;
không có mood thì null. Distribution chỉ gồm nhóm count > 0, theo mood
score/code, nhóm null cuối; tổng count bằng totalEntries. Không có bài thì
mọi count = 0, average null, distribution `[]`. Các aggregate dùng cùng
snapshot, tránh nhân đôi số bài khi join nhiều tags/images. Không có streak
trong MVP để giữ phạm vi thống kê cơ bản.

## 9. Mã lỗi và giới hạn truy cập

| HTTP | error.code | Trường hợp |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | JSON, path/query/body hoặc quy tắc publish không hợp lệ |
| 400 | `INVALID_MOOD`, `INVALID_TAGS` | Tham chiếu không hợp lệ khi ghi diary |
| 401 | `UNAUTHENTICATED` | Bearer thiếu/sai, phiên revoked |
| 401 | `ACCESS_TOKEN_EXPIRED` | JWT hết hạn; có thể refresh một lần |
| 401 | `INVALID_CREDENTIALS` | Login thất bại |
| 401 | `INVALID_REFRESH_TOKEN` | Cookie thiếu/sai/hết hạn/phiên revoked |
| 401 | `REFRESH_TOKEN_REUSED` | Dùng lại token đã rotate |
| 403 | `CSRF_FAILED` | Origin hoặc header chống CSRF sai/thiếu |
| 404 | `RESOURCE_NOT_FOUND` | Không tồn tại, không sở hữu hoặc đã xóa |
| 409 | `EMAIL_ALREADY_EXISTS`, `TAG_ALREADY_EXISTS` | Trùng unique key |
| 409 | `IMAGE_LIMIT_EXCEEDED`, `IMAGE_ORDER_CONFLICT` | Quota hoặc thứ tự ảnh xung đột |
| 413 | `PAYLOAD_TOO_LARGE` | Vượt giới hạn bytes |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content-Type/body/file không hỗ trợ |
| 429 | `RATE_LIMITED` | Quá giới hạn, kèm Retry-After (giây) |
| 500 | `INTERNAL_ERROR` | Lỗi bất ngờ; không lộ stack/SQL |
| 503 | `STORAGE_UNAVAILABLE` | R2 tạm lỗi hoặc thiếu object đã có metadata |

Đề xuất giới hạn khởi đầu, cấu hình server và điều chỉnh sau đo tải:
register 5/giờ/IP; login 10/15 phút theo IP + hash(email chuẩn hóa), thêm
100/15 phút/IP; refresh 30/phút/phiên (cookie không hợp lệ: 30/phút/IP);
upload 30/10 phút/user; các request khác 120/phút/user, fallback IP khi
chưa xác thực. Các cửa sổ là fixed window tính theo UTC; hết quota trả
Retry-After tới thời điểm reset. Request lỗi cũng tiêu thụ quota. Không dùng
bộ đếm trong memory của một Worker làm quota toàn hệ thống.

Frontend chỉ tự refresh khi `ACCESS_TOKEN_EXPIRED`, retry request gốc tối
đa một lần. Không tự retry POST create/upload khi lỗi mạng không biết server
đã commit chưa: MVP chưa có Idempotency-Key; tải lại dữ liệu trước khi người
dùng chọn gửi lại. Backoff khi `429`/`503` cho thao tác đọc an toàn.

## 10. Điều chỉnh schema cần thiết khi triển khai

Giữ logical schema README làm nền; bổ sung rõ để đáp ứng contract:

| Thành phần | Bổ sung/hành vi |
| --- | --- |
| `AuthSession` | id (sid), userId, createdAt, expiresAt, revokedAt; một phiên/thiết bị đăng nhập |
| `RefreshToken` | sessionId FK, usedAt, replacedById nullable; giữ token đã dùng tới hết hạn phiên để phát hiện reuse |
| `ImageUploadIntent` | id, userId, diaryId, objectKey, status, expiresAt, createdAt; dùng cho finalize/cleanup khi crash |
| `StorageDeleteJob` | objectKey, status, attempts, nextAttemptAt; ghi cùng transaction xóa, retry và cảnh báo khi thất bại kéo dài |
| Email | Lưu email đã normalize, unique hiện tại bảo vệ race đăng ký |
| Ownership | Query/ghi ràng buộc userId + deletedAt; ảnh ràng buộc đúng diary/user; FK cho tag/diary |
| Index | Giữ partial index diary active theo user/date; bổ sung index session, token/session, jobs chờ chạy theo truy vấn thực tế |

Không chọn version Prisma, adapter Express/Workers hay PostgreSQL provider
trong contract API. Cần prototype runtime/multipart/password hashing trước
khi chốt các dependency như các điểm mở trong README.

## 11. Checklist nghiệm thu khi có backend

1. Auth: register/login/refresh/logout; cookie đúng thuộc tính; Origin/header
   CSRF sai bị chặn; password/token không xuất hiện trong log.
2. Hai refresh đồng thời không tạo hai token active; reuse revoke phiên;
   access token của phiên revoked bị chặn, thiết bị khác vẫn dùng được.
3. User A không đọc/sửa/xóa bài hoặc ảnh của B; imageId thuộc diary khác bị
   chặn; tag của B không gắn được vào bài của A.
4. Draft rỗng hợp lệ; publish trắng/ngày tương lai lỗi; PATCH trên bài đã
   published vẫn kiểm tra đầy đủ; timezone đổi không dịch ngày cũ.
5. List: filter AND, ngày inclusive, ký tự `%/_` literal, limit/page giới
   hạn, sort có tie-breaker, page rỗng và totalPages=0 đúng.
6. Upload: giả MIME, file rỗng, quá bytes, file thứ 11, nhiều upload đồng
   thời tại quota; R2 thành công/DB thất bại và crash trước finalize có cleanup.
7. Xóa diary đồng thời upload/reorder không làm metadata ảnh sống lại;
   cleanup R2 thất bại vẫn chặn GET và có retry bền vững.
8. Calendar: tháng nhuận, ngày không bài, nhiều bài/ngày, hai trạng thái.
   Statistics: tháng theo timezone, khoảng 366 ngày, mood null, dữ liệu
   rỗng và joins tags/images không đếm trùng.
9. Reorder thiếu/trùng/ID lạ, upload chen giữa trả đúng lỗi; tag rename/delete
   phản ánh trên diary sau refetch; request fields/query lạ bị từ chối.
10. Đối chiếu response thực tế với OpenAPI; chạy integration test trên
    môi trường Workers thực tế trước deployment.
