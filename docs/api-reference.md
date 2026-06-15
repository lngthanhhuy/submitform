# API Reference

## POST `submit-application`

Endpoint production:

```text
https://<project-ref>.supabase.co/functions/v1/submit-application
```

JWT verification đang tắt vì đây là public careers form. Bảo vệ request bằng
backend validation, Turnstile và rate limit.

## Request

`Content-Type: multipart/form-data`

| Field | Type | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `firstname` | string | Có | Tên, đã trim |
| `lastname` | string | Có | Họ, đã trim |
| `email` | string | Có | Email hợp lệ |
| `positionId` | UUID string | Có | Position tồn tại và active |
| `coverletter` | string | Có | Tối đa 1000 ký tự |
| `cv` | File | Có | PDF/DOC/DOCX, tối đa 5MB |
| `turnstileToken` | string | Có | Token Cloudflare Turnstile |

Ví dụ:

```bash
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/submit-application" \
  -F "firstname=An" \
  -F "lastname=Nguyen" \
  -F "email=an@example.com" \
  -F "positionId=<position-uuid>" \
  -F "coverletter=Toi muon ung tuyen vi tri nay." \
  -F "turnstileToken=<token>" \
  -F "cv=@cv.pdf;type=application/pdf"
```

## Success response

HTTP `201 Created`

```json
{
  "success": true,
  "code": "APPLICATION_SUBMITTED",
  "applicationId": "uuid",
  "hrEmailId": "resend-email-id"
}
```

Frontend chỉ hiển thị thành công khi `success = true` và
`code = APPLICATION_SUBMITTED`.

## Error responses

Format chung:

```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Thông báo tiếng Việt",
  "fieldErrors": {
    "email": "Vui lòng nhập email"
  }
}
```

`fieldErrors` chỉ xuất hiện khi có lỗi theo field.

| HTTP | Code | Ý nghĩa |
| ---: | --- | --- |
| 400 | `VALIDATION_ERROR` | Field bắt buộc hoặc định dạng field sai |
| 400 | `CAPTCHA_REQUIRED` | Thiếu Turnstile token |
| 400 | `CAPTCHA_INVALID` | Cloudflare từ chối token |
| 503 | `CAPTCHA_UNAVAILABLE` | Không xác minh được CAPTCHA |
| 400 | `CV_FILE_NAME_TOO_LONG` | Tên file trên 255 ký tự |
| 400 | `INVALID_CV_TYPE` | Extension không phải PDF/DOC/DOCX |
| 413 | `CV_TOO_LARGE` | File lớn hơn 5MB |
| 400 | `INVALID_CV_MIME` | MIME không phù hợp |
| 400 | `INVALID_CV_CONTENT` | Magic bytes/cấu trúc file không hợp lệ |
| 400 | `INVALID_POSITION` | Position không tồn tại hoặc không active |
| 429 | `RATE_LIMITED` | Vượt 5 request trong 15 phút |
| 500 | `POSITION_LOOKUP_FAILED` | Không truy vấn được position |
| 503 | `RATE_LIMIT_UNAVAILABLE` | Rate limiter không hoạt động |
| 500 | `CV_UPLOAD_FAILED` | Không upload được Storage |
| 500 | `APPLICATION_INSERT_FAILED` | Không insert được application |
| 500 | `ROLLBACK_FAILED` | Không dọn được dữ liệu sau lỗi |
| 500 | `CV_LINK_FAILED` | Không tạo được signed URL |
| 502 | `HR_EMAIL_FAILED` | Resend thất bại sau retry |
| 400 | `INVALID_FORM_DATA` | Body không phải multipart hợp lệ |
| 405 | `METHOD_NOT_ALLOWED` | Method không phải POST/OPTIONS |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content-Type không phải multipart |

Response `429` có header `Retry-After`.

## Validation order

1. Method và content type.
2. Parse multipart form.
3. Field bắt buộc và độ dài.
4. Turnstile token.
5. CV tồn tại và không rỗng.
6. Tên file.
7. Extension.
8. Dung lượng.
9. MIME.
10. Magic bytes/cấu trúc.
11. Position active.
12. Rate limit.
13. Storage, database và email pipeline.

## CORS

Function xử lý `OPTIONS` cho browser preflight. Production nên giới hạn
`Access-Control-Allow-Origin` theo domain frontend thay vì wildcard nếu thay đổi
kiến trúc hoặc policy bảo mật.

