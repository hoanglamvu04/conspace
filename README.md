# CONSPACE — Gate 1 Engineering Skeleton

CONSPACE là cổng tri thức và cộng đồng ngành xây dựng. Dự án khởi động lại bằng React + Vite + JSX, Express + Node.js 22.23.2 và PostgreSQL 16 + PostGIS trên VPS hiện có.

**Trạng thái:** Codebase kỹ thuật Gate 1. Trang frontend hiện chỉ là trang kiểm thử kỹ thuật; chưa phải giao diện hoặc nội dung CONSPACE chính thức.

## Product baseline v1.0

Tài liệu chuẩn đã chốt: [`docs/INFORMATION_ARCHITECTURE_EDITORIAL_GOVERNANCE_V1.md`](docs/INFORMATION_ARCHITECTURE_EDITORIAL_GOVERNANCE_V1.md). Ba chat BE/FE/Ops phải dùng chung chuẩn này; dùng `main`, làm việc local trước, không tự deploy VPS.

## Kiến trúc

- `frontend/`: React 18 + Vite, JavaScript JSX, sử dụng API cùng origin `/api`.
- `backend/`: Node 22.23.2 + Express 4 + `pg`, endpoint liveness/readiness.
- `ops/`: Nginx + PM2, VPS production. Trang Gate 0 `ops/holding` vẫn được giữ.
- `docs/`: Hợp đồng API, quy tắc cho 3 chat Backend/Frontend/Ops.

Database `conspace` và tài khoản `conspace_app` đã được tạo ở VPS trên PostgreSQL cluster hiện có (không sửa `hola_maps` hoặc `x_hub`). Không đẩy mật khẩu lên Git.

## Chạy thử DEV (trên máy được phép)

Dùng Node 22.23.2. Mỗi thư mục có package.json riêng và sẽ có lockfile riêng sau lần cài đầu.

```bash
cp backend/.env.example backend/.env
# Điền DATABASE_URL thật trong backend/.env tại máy cục bộ, không commit.
npm install --prefix backend
npm install --prefix frontend
npm run dev:backend
# Trong một terminal khác:
npm run dev:frontend
```

Mặc định frontend dev ở http://127.0.0.1:5176, backend ở http://127.0.0.1:5088.
Trong dev, Vite proxy `/api` tới backend 5088. Trong production, Nginx phục vụ frontend dist và reverse proxy `/api`.

```bash
npm run test:backend
npm run build
curl -fsS http://127.0.0.1:5088/api/health
curl -fsS http://127.0.0.1:5088/api/ready
```

Lưu ý: `/api/ready` trả HTTP 503 cho đến khi backend có DATABASE_URL đúng và truy vấn PostgreSQL thành công.

## Quy trình Git cho 3 chat

Nhánh chính duy nhất: `main`. Ba chat Backend, Frontend và DevOps commit/push **trực tiếp vào main** nhưng mỗi chat chỉ sửa phần thư mục được giao và đồng bộ code trước khi push. Không force-push. Xem `docs/WORKSTREAMS.md`, `docs/API_CONTRACT.md`.

## Hạ tầng production

Trên VPS, `git pull --ff-only origin main` chỉ cập nhật source, KHÔNG tự restart PM2, sửa Nginx hoặc chạy DB migrations. Sử dụng `ops/scripts/diagnose-live.sh` để xác định lỗi HTTP 500 và `ops/scripts/go-live.sh` để deploy sau khi kiểm tra tình trạng rollback; tránh chạy lại khi chưa rõ trạng thái.

**Không chạy `pm2 update`, `pm2 kill`, `pm2 restart all` hoặc reboot VPS chỉ để thử CONSPACE.**
