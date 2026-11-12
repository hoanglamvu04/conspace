# CONSPACE — ADR-0001 / Hạ tầng trước, code sau

## Quyết định đã chốt

- Frontend: React, Vite, JavaScript JSX; **không dùng TypeScript/TSX** cho dự án mới.
- Backend: Node.js, Express REST API, JavaScript ESM.
- Runtime mục tiêu: Node.js **22.23.2**, khớp phiên bản các PM2 API Bandohoalac và X-HUB đã kiểm tra trên VPS. Không nâng cấp Node toàn hệ thống.
- Database: dùng PostgreSQL cluster hiện có (PostgreSQL 16.15), không cài thêm server/cluster. Mỗi ứng dụng có database và role riêng; CONSPACE dự kiến dùng database `conspace`, role `conspace_app`.
- PostGIS 3.4.2 đã có trên VPS và đang được bật trong `hola_maps` và `x_hub`. Chỉ bật extension trong database CONSPACE nếu nhu cầu nghiệp vụ cần dữ liệu địa lý.
- Database driver: `pg`; input validation: Zod; bảo vệ API về sau với Helmet, CORS được giới hạn, rate limiting, xác thực và phân quyền đúng ở server.
- Production: VPS do chủ sở hữu vận hành, Nginx reverse proxy/serve static, PM2 cho API, Let's Encrypt TLS.
- Domain: `conspace.vn` và `www.conspace.vn`; DNS, Nginx, HTTPS và endpoint edge health đã được kiểm tra hoạt động trên VPS.
- Production dùng một origin HTTPS: web ở /, backend API ở /api/ khi triển khai xong. API chỉ bind 127.0.0.1 trên cổng riêng, cần xác minh cổng chưa được dùng trước khi chọn.
- Không dùng chung database/schema nghiệp vụ với `hola_maps` hoặc `x_hub`. Không dùng chung role hoặc credential.
- Không cài Next.js, FastAPI, WordPress hoặc Ghost vào codebase mới.

## Hạ tầng VPS đã xác minh

- PostgreSQL 16.15 đang hoạt động trên cổng 5432.
- PostGIS 3.4.2 có sẵn; đã cài extension trong `hola_maps` và `x_hub`.
- PM2 đang quản lý các API hiện có; Bandohoalac và X-HUB được báo cáo chạy Node.js 22.23.2.
- Nginx phục vụ `conspace.vn` và `www.conspace.vn`; cả hai endpoint `/__infra/health` trả HTTP 200.
- Chứng chỉ `conspace.vn` bao gồm cả hai hostname; Certbot dry-run riêng chứng chỉ CONSPACE đã thành công.
- Certbot dry-run toàn hệ thống từng báo lỗi riêng `auto.xspace.vn`; không xử lý bằng cách thay đổi chứng chỉ hoặc cấu hình website khác trong phạm vi CONSPACE.

## Tổ chức repo SAU khi hoàn tất kiểm thử hạ tầng

~~~
frontend/                 # React + Vite + JSX, public pages, admin CMS
backend/                  # Express, REST, src/routes/controllers/services
backend/src/database/     # PostgreSQL migrations and queries
ops/                      # VPS and domain configurations
docs/                     # Architecture, deployment, editorial policies
~~~

Repo hiện vẫn có prototype TSX ở root. Chỉ xử lý việc xóa/chuyển đổi prototype sau gate hạ tầng.

## Điều kiện qua Gate 0

1. Đã biết rõ Ubuntu/Debian release, CPU/RAM/disk, tình trạng Nginx/PM2/PostgreSQL và cổng đang nghe trên VPS; không ảnh hưởng ứng dụng có sẵn.
2. Git clone đúng nhánh môi trường từ repository CONSPACE trên VPS.
3. Node.js 22.23.2/npm và PM2 sẵn sàng; PostgreSQL cluster hiện có kết nối được; database và role CONSPACE riêng được tạo và xác minh.
4. DNS `conspace.vn` và `www.conspace.vn` trỏ đúng hệ thống.
5. Trang HOLDING của CONSPACE chạy được trên hai hostname; HTTP chuyển hướng sang HTTPS, TLS hợp lệ, `/__infra/health` trả JSON từ Nginx.
6. Certbot dry-run riêng chứng chỉ CONSPACE thành công.
7. Máy chủ khởi động lại trong maintenance window đã thống nhất vẫn phục vụ site; không có xung đột Nginx, port hoặc lỗi trong system logs.

**Chưa cần API health endpoint ở giai đoạn 0.** `/__infra/health` là health của web edge, không phải lời khẳng định ứng dụng Node.js đã chạy. Sau Gate 0 mới viết app tối thiểu và kiểm thử `/api/health`.
