# CONSPACE — ADR-0001 / Hạ tầng trước, code sau

## Quyết định đã chốt

- Frontend: React, Vite, JavaScript JSX; **không dùng TypeScript/TSX** cho dự án mới.
- Backend: Node.js, Express REST API, JavaScript ESM.
- Database: PostgreSQL với driver pg; có PostGIS như Hola Maps để sẵn mở rộng dữ liệu theo vùng, nhưng không bật tính năng địa lý nào trong giai đoạn 0.
- Input validation: Zod; bảo vệ API về sau với Helmet, CORS được giới hạn, rate limiting, xác thực và phân quyền đúng ở server.
- Production: VPS do chủ sở hữu vận hành, Nginx reverse proxy/serve static, PM2 cho API, Let's Encrypt TLS.
- Dùng Node.js 24 LTS theo .nvmrc, sau khi đã kiểm tra tương thích và không làm gián đoạn phiên Node đang phục vụ hệ thống khác.
- Domain dự kiến từ hồ sơ CONSPACE: conspace.vn và www.conspace.vn; phải xác nhận quyền DNS trước khi đổi bản ghi.
- Production dùng một origin HTTPS: web ở /, backend API ở /api/ khi triển khai xong. API chỉ bind 127.0.0.1 trên cổng riêng, không mở trực tiếp Internet.
- Database và DB role riêng: conspace / conspace_app, không dùng chung DB hola_maps.
- Không cài Next.js, FastAPI, WordPress hoặc Ghost vào codebase mới.

## Tổ chức repo SAU khi hoàn tất kiểm thử hạ tầng

~~~
frontend/                 # React + Vite + JSX, public pages, admin CMS
backend/                  # Express, REST, src/routes/controllers/services
backend/src/database/     # PostgreSQL/PostGIS migrations and queries
ops/                      # VPS and domain configurations
docs/                     # Architecture, deployment, editorial policies
~~~

Repo hiện vẫn có prototype TSX ở root. Chỉ xử lý việc xóa/chuyển đổi prototype sau gate hạ tầng.

## Điều kiện qua Gate 0

1. Đã biết rõ Ubuntu/Debian release, CPU/RAM/disk, tình trạng Nginx/PM2/PostgreSQL và cổng đang nghe trên VPS; không ảnh hưởng ứng dụng có sẵn.
2. Git clone đúng nhánh môi trường từ repository CONSPACE trên VPS.
3. Node.js 24, npm, PostgreSQL + PostGIS và Nginx sẵn sàng; tài khoản DB và cơ sở dữ liệu conspace riêng có kết nối thành công.
4. DNS conspace.vn và www.conspace.vn trỏ đúng hệ thống cần triển khai (đối chiếu IP nếu không proxy CDN).
5. Trang HOLDING của CONSPACE chạy được trên tên miền; HTTP redirect sang HTTPS, TLS đáng tin cậy, /__infra/health trả JSON từ Nginx.
6. Máy chủ khởi động lại vẫn phục vụ site; không có xung đột Nginx, port hoặc lỗi trong system logs.

**Chưa cần API health endpoint ở giai đoạn 0.** /__infra/health là health của web edge, không phải lời khẳng định ứng dụng Node.js đã chạy. Sau Gate 0 mới viết app tối thiểu và kiểm thử /api/health.
