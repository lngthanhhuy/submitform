# QA Matrix

> Các kết quả automated test bên dưới là lịch sử xác nhận trước khi test source
> được xóa khỏi repository. Repository hiện không còn Vitest hoặc Deno test files.

## 1. Acceptance criteria

| AC | Kịch bản | Kết quả mong đợi | Kết quả lịch sử |
| --- | --- | --- | --- |
| AC-01 | Dữ liệu và CV hợp lệ | Gọi function một lần, chỉ thành công với `APPLICATION_SUBMITTED` | Đã pass |
| AC-02 | Email trống | `Vui lòng nhập email`, không request | Đã pass |
| AC-03 | Email sai định dạng | `Email không hợp lệ`, không request | Đã pass |
| AC-04 | Chưa chọn CV | `Vui lòng đính kèm CV`, không request | Đã pass |
| AC-05 | CV PNG | Thông báo chỉ hỗ trợ PDF/DOC/DOCX | Đã pass |
| AC-06 | CV trên 5MB | Thông báo file không vượt quá 5MB | Đã pass |
| AC-07 | HR email thất bại | Không báo thành công; hiển thị lỗi server | Đã pass |
| AC-08 | Bấm submit nhiều lần | Disable button, chỉ có một request | Đã pass |

## 2. Kết quả module backend trước khi xóa test

| Module | Số test | Nội dung |
| --- | ---: | --- |
| Application persistence | 5 | Upload, insert, trạng thái và rollback |
| CV validation | 13 | PDF/DOC/DOCX, MIME, magic bytes, size, filename |
| HR email | 6 | Success, timeout, retry, terminal failure |
| Rate limit | 5 | Window, count, Retry-After, IP hashing |
| Turnstile | 6 | Token, API result, timeout và hostname |
| Tổng | 35 | Deno tests |

Frontend từng có 8 acceptance tests tương ứng AC-01 đến AC-08.

## 3. Edge cases

| Edge case | Kỳ vọng | Trạng thái |
| --- | --- | --- |
| PDF/DOC/DOCX hợp lệ | Chấp nhận | Implemented |
| PNG/ZIP đổi extension | Backend chặn bằng nội dung thực | Implemented |
| File trên 5MB | Frontend và backend chặn | Implemented |
| Tên file trên 255 ký tự | Chặn trước upload | Implemented |
| Email không hợp lệ | Lỗi tại field | Implemented |
| Toàn khoảng trắng | Trim rồi validate | Implemented |
| Cover letter trên 1000 ký tự | Chặn | Implemented |
| Mất kết nối | Hiển thị lỗi chung, cho submit lại | Implemented |
| Resend timeout | Timeout 10s, retry một lần | Implemented |
| Upload xong nhưng insert lỗi | Xóa object CV | Implemented |
| Script spam | Turnstile + rate limit | Implemented |
| Malware trong tài liệu hợp lệ | Antivirus scan | Chưa triển khai |
| Domain email production | Verified sender/domain | Chưa triển khai |

## 4. Verification commands

Chạy từ thư mục `ui`:

```powershell
npm run build
npm run lint
.\node_modules\deno\deno.exe check supabase/functions/submit-application/index.ts
.\node_modules\deno\deno.exe lint supabase/functions
```

Lệnh Vitest và Deno test không còn áp dụng sau khi test source được xóa.

Kết quả xác nhận ngày 15/06/2026:

| Kiểm tra | Kết quả |
| --- | --- |
| Frontend acceptance tests | 8 pass, 0 fail |
| Backend Deno tests | 35 pass, 0 fail |
| Production build | Pass |
| ESLint | Pass |
| Deno check | Pass |
| Deno lint | Pass |
| Migration remote | Applied |
| Anonymous active positions read | HTTP 200 |
| Anonymous applications read/insert | HTTP 401 |
| Anonymous Storage upload | Bị chặn bởi RLS |

## 5. Manual E2E checklist

- Mở form trên hostname staging.
- Xác nhận Turnstile dùng site key staging, không dùng test key.
- Chọn `Developer` và `Designer`.
- Gửi PDF, DOC và DOCX hợp lệ.
- Kiểm tra object CV nằm trong private bucket.
- Kiểm tra application có trạng thái `accepted`.
- Kiểm tra HR nhận email và signed URL mở được CV.
- Thử file giả extension và file trên 5MB.
- Thử lỗi Resend để chắc chắn frontend không báo thành công.
- Thử request thứ sáu trong 15 phút để xác nhận HTTP 429.
- Xác nhận webhook cũ không gửi email thứ hai.

## 6. Residual risk

- Chưa có browser E2E tự động chạy trên staging.
- Chưa scan virus.
- Resend `accepted` không chứng minh inbox delivery.
- Docker local chưa chạy nên chưa xác nhận `supabase db reset` hoàn chỉnh.
- Production cutover chưa hoàn tất.
