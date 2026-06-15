# Deployment Guide

## 1. Yêu cầu

- Node.js và npm.
- Supabase CLI.
- Deno local từ package `deno`.
- Một Supabase project.
- Resend API key.
- Cloudflare Turnstile site key và secret key.

Project demo hiện liên kết với project ref:

```text
rhggiogyynmuomfuxheu
```

## 2. Environment variables

### Frontend: `ui/.env`

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
VITE_TURNSTILE_SITE_KEY=<turnstile-site-key>
```

### Edge Function secrets

```text
RESEND_API_KEY
TURNSTILE_SECRET_KEY
RATE_LIMIT_SALT
TURNSTILE_EXPECTED_HOSTNAME   # khuyến nghị cho staging/production
WEBHOOK_SECRET               # chỉ còn cần cho legacy resend webhook
```

`SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` do hosted Edge Functions cung
cấp. Không đặt secret thật trong Git hoặc tài liệu.

## 3. Cài đặt và kiểm tra

```powershell
cd ui
npm install
npm run build
npm run lint
.\node_modules\deno\deno.exe check supabase/functions/submit-application/index.ts
.\node_modules\deno\deno.exe lint supabase/functions
```

Automated test source đã được xóa theo quyết định dọn repository. Dùng checklist
thủ công trong `qa-matrix.md` cho các lần kiểm tra tiếp theo.

## 4. Database

Link project:

```powershell
npx supabase link --project-ref rhggiogyynmuomfuxheu
```

Áp dụng toàn bộ migration:

```powershell
npx supabase db push --linked --include-all
```

Fresh local database khi Docker đang chạy:

```powershell
npx supabase start
npx supabase db reset
```

`db reset` tự chạy migrations và `supabase/seed.sql`, tạo hai vị trí
`Developer` và `Designer`.

## 5. Secrets

Đặt biến trong shell hoặc secret manager rồi upload:

```powershell
npx supabase secrets set `
  RESEND_API_KEY="$env:RESEND_API_KEY" `
  TURNSTILE_SECRET_KEY="$env:TURNSTILE_SECRET_KEY" `
  RATE_LIMIT_SALT="$env:RATE_LIMIT_SALT" `
  TURNSTILE_EXPECTED_HOSTNAME="$env:TURNSTILE_EXPECTED_HOSTNAME" `
  --project-ref rhggiogyynmuomfuxheu
```

Kiểm tra danh sách tên secret:

```powershell
npx supabase secrets list --project-ref rhggiogyynmuomfuxheu
```

Không in giá trị secret ra terminal hoặc log CI.

## 6. Deploy Edge Function

```powershell
npx supabase functions deploy submit-application `
  --project-ref rhggiogyynmuomfuxheu `
  --no-verify-jwt
```

Function `resend` là luồng webhook cũ. Không deploy lại cho kiến trúc mới trừ
khi cần đối chiếu hoặc rollback có chủ đích.

## 7. Deploy frontend

Build:

```powershell
npm run build
```

Deploy thư mục `ui/dist` lên hosting đã chọn. Cấu hình đúng ba biến `VITE_*`
trước build.

## 8. Staging checklist

- Dùng Supabase project staging riêng.
- Dùng Turnstile key thật và hostname staging.
- Dùng Resend sender/domain phù hợp.
- Chạy migrations và seed.
- Deploy `submit-application`.
- Deploy frontend.
- Chạy toàn bộ manual E2E trong `qa-matrix.md`.
- Kiểm tra Edge Function logs không có secret hoặc PII thừa.
- Kiểm tra rollback bằng một lỗi insert/email có kiểm soát.

## 9. Production cutover

1. Backup database và xác nhận migration history.
2. Rotate các secret demo nếu đã từng chia sẻ.
3. Dùng Turnstile production key và `TURNSTILE_EXPECTED_HOSTNAME`.
4. Dùng Resend domain đã verify và sender production.
5. Deploy function và frontend cùng phiên bản đã test ở staging.
6. Gửi một hồ sơ smoke test.
7. Xác nhận một application, một CV và một email HR.
8. Vô hiệu Database Webhook `send_application_emails`.
9. Gửi lại smoke test để xác nhận không có email trùng.
10. Theo dõi HTTP 5xx, 429, Resend errors và Storage rollback.

Không xóa webhook trước khi staging E2E hoàn tất. Trong production, không để
webhook và direct Edge Function cùng gửi email.

## 10. Rollback

- Frontend: redeploy artifact trước đó.
- Edge Function: deploy lại commit/version ổn định.
- Database: migrations hiện tại chủ yếu additive; tạo migration rollback riêng,
  không dùng reset trên production.
- Webhook: chỉ bật lại nếu đã chuyển frontend về luồng database webhook cũ.
- Secrets: rotate nếu nghi ngờ lộ key.

## 11. Tài liệu nhà cung cấp

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
- [Resend email API](https://resend.com/docs/api-reference/emails/send-email)
