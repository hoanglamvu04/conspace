# CONSPACE — Infrastructure-first rebuild

CONSPACE là nền tảng tri thức và nội dung ngành xây dựng. Repository này đang được khởi động lại thành dự án full-stack độc lập theo quy trình **hạ tầng trước, sản phẩm sau**.

## Trạng thái

- Giai đoạn 0 (đang thực hiện): kiểm kê VPS, môi trường Node.js/PostgreSQL/PostGIS/Nginx/PM2, DNS, TLS và thử nghiệm tên miền.
- Giai đoạn 1 (chưa bắt đầu): frontend React + Vite + JSX, backend Node.js + Express, PostgreSQL và CMS.
- Các tệp src/*.tsx cùng cấu hình Vite ở thư mục gốc là **prototype V0 cũ**. Không chạy hoặc triển khai prototype này lên tên miền production. Chúng sẽ được thay thế sau khi giai đoạn 0 đạt yêu cầu.

Công nghệ tham chiếu: hoanglamvu04/bandohoalac (Hola Maps). Dùng lại mô hình công nghệ và cách vận hành, KHÔNG sao chép tính năng bản đồ hay cơ sở dữ liệu thật.

## Bắt đầu kiểm tra VPS

1. Đọc ops/VPS_SETUP.md.
2. Kiểm tra VPS, các cổng đang sử dụng và hostname thực tế bằng bash ops/vps-audit.sh.
3. Chỉ khi DNS, Nginx, PostgreSQL, Node.js và chứng chỉ HTTPS sẵn sàng mới chuyển qua phần code ứng dụng.

**Lưu ý:** Không đưa mật khẩu database, SSH private key, API key hoặc file .env thật vào GitHub. Không sửa Nginx/PM2 của các dự án khác để CONSPACE chạy được.

Tài liệu: docs/ARCHITECTURE.md; ops/VPS_SETUP.md.
