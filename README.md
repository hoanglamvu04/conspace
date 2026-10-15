# ConSpace

**Construction knowledge, built by the field.**

ConSpace là một nền tảng tri thức ngành xây dựng theo hướng bách khoa mở + cộng đồng nghề. Mục tiêu không phải chỉ đăng tin, mà kết nối kiến thức chuẩn với kinh nghiệm hiện trường thực tế.

## V1 hiện có

- Bách khoa theo vòng đời công trình: chuẩn bị/pháp lý → móng/kết cấu → MEP → hoàn thiện → vận hành/sửa chữa.
- Từ điển nghề A–Z với giải thích ngắn, dễ tra cứu.
- “Hiện trường hôm nay”: ca thực tế, ảnh lỗi, cách xử lý, phản biện từ người trong nghề.
- Ngách thầu theo chuyên môn thay vì danh bạ chung chung.
- Bàn nghề / hỏi đáp chuyên môn.
- Tin ngành theo hướng chọn lọc và có tính ứng dụng.
- Tìm kiếm ngay trên hero (demo lọc một số thuật ngữ trong dữ liệu mẫu).
- Responsive desktop / tablet / mobile.

## Hướng sản phẩm tiếp theo

1. Hệ thống tài khoản và hồ sơ nghề nghiệp (kỹ sư, KTS, nhà thầu, đội thợ, sinh viên...).
2. CMS cho bài bách khoa, thuật ngữ, tin ngành.
3. UGC hiện trường: upload ảnh, khoanh vùng, chú thích, tag giai đoạn/hạng mục/lỗi.
4. Hỏi đáp có vote, phản biện, câu trả lời được xác minh bởi cộng đồng.
5. Hồ sơ ngách thầu với khu vực hoạt động, năng lực, dự án, bài chia sẻ và đánh giá.
6. Search toàn văn theo thuật ngữ, lỗi, vật liệu, hạng mục và câu hỏi.
7. Bộ “Mẹo hiện trường” ngắn, checklist, biểu mẫu và bảng tra cứu nhanh.

## Chạy local

```bash
npm install
npm run dev
```

Build production:

```bash
npm run build
npm run preview
```

## Design direction

- Editorial + công trường, tránh cảm giác SaaS/card template.
- Nền concrete sáng, charcoal, safety orange.
- Grid/bản vẽ kỹ thuật dùng như texture, không lạm dụng.
- Ưu tiên typography, phân cấp thông tin, dữ liệu nghề và media thật từ cộng đồng.

---

V0.1 là concept frontend để chốt product direction trước khi tách backend/CMS/community thành các module riêng.
