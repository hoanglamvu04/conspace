# CONSPACE — Gate 1 Engineering Skeleton

CONSPACE là cổng tri thức và cộng đồng ngành xây dựng. Dự án khởi động lại bằng React + Vite + JSX, Express + Node.js 22.23.2 và PostgreSQL 16 + PostGIS trên VPS hiện có.

**Trạng thái:** Codebase kỹ thuật Gate 1. Trang frontend hiện chỉ là trang kiểm thử kỹ thuật; chưa phải giao diện hoặc nội dung CONSPACE chính thức.

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

Base: `bootstrap/gate1-base`; nhánh chat: `work/backend`, `work/frontend`, `work/ops`. **Không 3 chat cùng push main.** Mỗi chat chỉ sửa phạm vi thư mục mình sở hữu, mở PR hướng về `bootstrap/gate1-base`. Xem `docs/WORKSTREAMS.md`, `docs/API_CONTRACT.md`.

## Hạ tầng production

Trên VPS hiện hữu, không chạy ngay bộ khung mới lên `conspace.vn` nếu chưa kiểm thử build, API DB, PM2 và cấu hình Nginx. Trang Gate 0 hiện đang hoạt động trên HTTPS; nhóm Ops có trách nhiệm chuyển từ holding page sang build sau khi kiểm tra và có rollback.

**Không chạy `pm2 update`, `pm2 kill`, `pm2 restart all` hoặc reboot VPS chỉ để thử CONSPACE.**
