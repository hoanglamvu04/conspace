# CONSPACE — Information Architecture & Editorial Governance v1.0

**Trạng thái:** APPROVED — Product baseline (chuẩn sản phẩm chung cho BE / FE / Ops).  
**Ngày chốt:** 12/11/2026 · **Đơn vị vận hành:** Công ty Cổ phần XSPACE Việt Nam.  
**Phạm vi:** Website công khai, cơ chế ba góc nhìn, phân loại nội dung, cấu trúc CMS và chính sách biên tập, phân kỳ triển khai.  
**Không phải:** tuyên bố rằng tất cả trang/API dưới đây đã được lập trình; mỗi hạng mục được đánh dấu hiện tại hoặc mục tiêu.

## 0. Thứ bậc tài liệu và nguồn

- **Quy chuẩn chức năng/biên tập:** tài liệu này. Nếu thay đổi, cần chủ dự án xác nhận và tăng phiên bản.
- **Hợp đồng payload, URL API hiện tại:** `docs/API_CONTRACT.md` v0.3; BE và FE phải cùng cập nhật có tương thích ngược khi thay đổi.
- **Quy trình làm việc:** `docs/WORKSTREAMS.md` (ba chat, một `main`).
- **Hạ tầng:** `docs/ARCHITECTURE.md` và runbook ở `ops/`.
- **Nguồn nội dung gốc:** `CONSPACE-Dac-ta-Web.pdf` (03/09/2026), chủ yếu tr. 2–10; `CONSPACE-Brief-Doi-Noi-Dung.pdf` (03/09/2026), chủ yếu tr. 2–13. Không tự điền những thông tin mà tài liệu không cung cấp.

Quy ước: **MUST** = bắt buộc; **SHOULD** = nên; **FUTURE** = không thuộc vòng triển khai hiện tại. Khi tài liệu gốc có xung đột về thời điểm triển khai, mục 11 nêu lựa chọn sản phẩm v1.0.

## 1. Định vị và ranh giới

**CONSPACE — Sự thật ngành Xây:** nơi ba phía của cùng một công trình đọc được câu chuyện của nhau: chủ nhà, kiến trúc sư, nhà thầu. Một sự việc có thể có ba mối bận tâm khác nhau. CONSPACE kể đủ ba, không chỉ đứng về một phía.

- Là **tòa soạn tri thức**, KHÔNG phải kênh quảng cáo hoặc bộ phận bán hàng của XSPACE / MULTI SPACE / FULLHOUSE.
- Mọi khẳng định kỹ thuật, đơn giá, định mức, thời hạn, pháp lý phải có nguồn kiểm tra được và kiểm tra tính hiện hành.
- Không bài PR trả tiền, xếp hạng "top nhà thầu", banner quảng cáo ở trang ngách, CTA chen giữa bài, gỡ bài vì lợi ích khách hàng, bịa số liệu, viết hàng loạt bằng AI, giật gân hoặc nêu đích danh bên bị phân tích về hành vi xấu.
- Có thể đặt **một dòng liên kết trung tính ở cuối** trang trụ/ngách hoặc câu trả lời hỏi đáp nếu tính năng mạng lưới đã thật sự vận hành; không biến nội dung thành trang dịch vụ.
- KPI của tòa soạn: người quay lại trong 30 ngày, câu hỏi/tuần, lượt tải checklist, thời gian đọc trang ngách; **không lấy số lead/doanh thu làm KPI nội dung**.
- Trang "Về CONSPACE" và "Quy tắc nội dung" phải nói rõ XSPACE là đơn vị vận hành nhưng **không kiểm soát kết luận biên tập bằng mục tiêu kinh doanh**.

## 2. BA GÓC NHÌN — QUY TẮC BẮT BUỘC

### 2.1 Ba trục độc lập, không được trộn

1. **Reader lens** (`homeowner` / `architect` / `contractor`) = sở thích đọc trên website, KHÔNG phải tài khoản, vai trò RBAC, gói trả tiền hay quyền truy cập.
2. **Content taxonomy** = 30 ngách **thi công** theo nghề + 8 mảng **kiến trúc** theo loại công trình. Không phải ba nhóm độc giả.
3. **CMS staff role** = ADMIN / EDITOR / TECHNICAL_REVIEWER / EDITOR_IN_CHIEF. Chỉ những vai trò nội bộ này mới được thao tác CMS có xác thực.

### 2.2 Chọn góc nhìn thay đổi gì?

| Hành vi | Chủ nhà (`homeowner`) | Kiến trúc sư (`architect`) | Nhà thầu (`contractor`) |
|---|---|---|---|
| Lối vào / thông điệp | "Tôi sắp xây nhà"; diễn giải dễ hiểu, điều cần hỏi/kiểm tra | "Tôi là kiến trúc sư"; thiết kế, phối hợp, bản vẽ, điểm dừng nghiệm thu | "Tôi là nhà thầu"; thi công, áp lực, tiêu chuẩn, rủi ro nghề |
| Danh sách bài / gợi ý | **Ưu tiên xếp trên** bài cho chủ nhà | Ưu tiên bài cho KTS | Ưu tiên bài cho nhà thầu |
| Trang ngách **cùng URL** | Mở sẵn accordion lớp chủ nhà | Mở sẵn lớp KTS | Mở sẵn lớp nhà thầu |
| Truy cập bài, tìm kiếm, gửi câu hỏi, đọc sách | **Giống nhau ở cả ba**; không khóa tính năng theo lens | Giống nhau | Giống nhau |

**MUST:** Không đổi URL trang ngách khi chuyển lens, không nhân bản ba nội dung thành ba trang SEO, không hạn chế xem bài của phía khác. Chỉ **ưu tiên thứ tự**, không lọc cứng mất bài; người dùng mở hai lớp còn lại bất cứ lúc nào. Một bài viết có **đối tượng chính** rõ ràng, nhưng luôn đọc được từ các góc nhìn khác.

**Lưu trạng thái:** cookie `conspace_reader` chứa đúng một trong ba giá trị, `Path=/`, `SameSite=Lax`; lựa chọn ở khối đầu trang và thay đổi được trong header. Mặc định chủ nhà nếu chưa chọn; không dùng cookie như cơ chế phân quyền. Backend không bao giờ dùng reader lens để phân quyền dữ liệu. Khi người dùng đổi lens, danh sách gợi ý/accordion cập nhật mà không làm mất thao tác đang đọc.

**Lưu ý kỹ thuật:** API hiện có `GET /api/v1/articles?role=...` có thể đang lọc cứng. BE+FE phải sửa đồng bộ sang ưu tiên xếp hạng trên **toàn bộ bài PUBLISHED**, giữ khả năng xử lý tham số cũ trong quá trình chuyển tiếp, thêm kiểm thử "không biến mất nội dung khác lens". Điều kiện PUBLISHED là kiểm soát xuất bản, hoàn toàn khác với reader lens.

### 2.3 Trang ngách 12 khối, ba lớp

Template A (30 ngách thi công) bao gồm:
1. Làm gì/không làm; ai làm
2. Vị trí trong trình tự công trường
3. Nhu cầu thị trường (cần nguồn; viết mới)
4. Cấu trúc giá và câu hỏi cần hỏi (không bịa con số)
5. Rẻ hơn mặt bằng thì cắt ở đâu (phân tích có nguồn)
6. Mặt trái ngành: cơ chế, không nêu tên; **bắt buộc lý giải vì sao người làm tử tế không làm thế**
7. Nỗi đau chủ nhà
8. Nỗi đau nhà thầu ngách
9. Điểm giao/xung đột
10. Giải pháp và mốc ngăn ngừa
11. Dấu hiệu người biết việc, checklist nghiệm thu/bảo hành
12. Ghi chép hiện trường có xác nhận

**Mapping theo tài liệu nguồn** (tr. 4 Đặc tả):
- Chủ nhà: 1, 3, 4, 5, 7, 11.
- Nhà thầu: 1, 6, 8, 9, 10.
- KTS: 2, 9, 10 **và** hồ sơ bản vẽ, điểm dừng nghiệm thu có nguồn.

Một khối có thể ở nhiều lớp; dữ liệu trùng thì tái sử dụng, không tạo bản sao khác nhau. Khối chưa có chứng cứ thì để trống hoặc ghi "đang biên tập", không sinh nội dung giả.

Template B (8 mảng kiến trúc) khác template A: ranh giới loại công trình; đặc thù; chuỗi ngách; quy chuẩn/pháp lý riêng; rủi ro; KTS chuyên mảng; năng lực/giới hạn giao việc. Tám nhãn xác nhận: **HOUSE, LUXURY, F&B, STAY, OFFICE, PROJECT, FACTORY, SACRED**. Chỉ seed tên và thông tin có nguồn; nội dung sâu 8 mảng là công việc mới (nấc 2).

30 ngách thi công thuộc 5 nhóm **phải lấy từ Cẩm nang Phần 5 đã duyệt**; các PDF hiện tại không có danh mục đủ 30 tên. Không bịa tên hoặc mã chỉ để đạt số 38.

## 3. INFORMATION ARCHITECTURE — PUBLIC SITEMAP ĐÍCH

Đây là **sơ đồ mục tiêu**, không đồng nghĩa các route đã hoạt động. BE/FE phải bảo vệ các đường dẫn cũ bằng alias/redirect và tránh lộ trang trống như đã có nội dung.

| Khu vực | URL chuẩn mong muốn | Nội dung / quy tắc | Giai đoạn |
|---|---|---|---|
| Trang chủ | `/` | Ba cổng, kỳ mới, tra nhanh | 1 |
| Tủ sách | `/tu-sach` | 3 cuốn và nhãn loại nội dung | 1 |
| Cẩm nang | `/cam-nang/{phan}/{muc}` | 9 phần, các mục **đã xuất bản** | 1 |
| Phận nhà thầu | `/phan-nha-thau/chuong-{n}` | 24 chương; kỳ đăng và trước/sau | 1 |
| Quẩn quanh KTS | `/quan-quanh-kts/chuong-{n}` | 25 chương; kỳ đăng và trước/sau | 1 |
| Kho ngách | `/ngach` | Bản đồ 30 ngách/5 nhóm + 8 mảng; hiển thị đúng dữ liệu có thật | 1 |
| Trụ ngách thi công | `/ngach/{ma}-{ten}` | Template A 12 khối, 3 lớp cùng URL | 1 |
| Trang mảng kiến trúc | `/mang/{ten}` | Template B, tránh vỏ trang rỗng | 2 |
| Hiện trường | `/hien-truong`, `/hien-truong/{slug}` | Ca có ảnh, nguyên nhân, điểm nghiệm thu, nguồn | 1 |
| Hỏi đáp | `/hoi-dap`, `/hoi-dap/gui-cau-hoi` | Gửi ẩn danh, trả lời đã duyệt | 1 |
| Tra nhanh | `/tra-nhanh` | "Tôi thấy… → xem mục nào", từ Cẩm nang phần 9 | 1 |
| Kết nối | `/ket-noi/{du-an\|kien-truc-su\|nha-thau\|tham-gia}` | Form riêng tư, người xử lý thủ công; **không public nhu cầu** | 1 (nhận tay) |
| Công nghệ nghề | `/cong-nghe`, `/cong-nghe/{slug}` | Chuyên mục bài về AI/BIM/phần mềm/thiết bị; không phải chatbot | 2 |
| Hồ sơ ngành | `/ho-so/{don-vi}` | Đơn vị đã thẩm định, ngày kiểm; **không sao, điểm, ranking** | 3 |
| Thông tin tổ chức | `/ve-conspace`, `/quy-tac-noi-dung`, `/lien-he` | Pháp nhân, quy tắc biên tập, liên hệ | 1 |
| CMS nội bộ | `/admin/*` | Chỉ nhân sự, có login/RBAC; không là khu public | nội bộ |

**Đường dẫn hiện hữu cần tôn trọng:** `/tra-cuu`, `/tu-dien` và `/ban-nghe` đang tồn tại trong React. V1 xử lý như sau:
- "Tra nhanh" là hướng nội dung trung tâm. `/tra-cuu` và `/tu-dien` vẫn dùng được; có thể đưa về trang tra cứu thống nhất khi tính năng hoàn thiện, giữ redirect/alias và URL chia sẻ cũ.
- `/ban-nghe` vẫn là dòng bài góc nhìn/đời nghề, không tạo một taxonomy thứ 39, có thể giữ link chuyên mục ở nav phụ/footer. Không gỡ hoặc làm hỏng route đang tồn tại.
- Nav công khai **giai đoạn 1** ưu tiên Tủ sách, Kho 38 ngách, Hiện trường, Hỏi đáp, Tra nhanh, Kết nối (chỉ mở khi có người tiếp nhận). "Công nghệ nghề" lên menu khi có nội dung thật; không nhồi tất cả nav vào một hàng.
- Chỉ index URL có nội dung thật đã được duyệt. Hỗ trợ canonical, redirect 301 khi chắc chắn route đích đã hoạt động; không redirect sang 404.

## 4. CẤU TRÚC TRANG CHỦ (không slider)

1. **Màn hình đầu:** logo/tagline và **ba thẻ lựa chọn lớn** "Tôi sắp xây nhà" / "Tôi là kiến trúc sư" / "Tôi là nhà thầu". Giữ minh họa kiến trúc hiện tại nhưng ba thẻ phải nhìn thấy rõ, không bị đẩy xuống quá xa.
2. **Kỳ mới nhất:** 1 chương sách đang đăng, 2–3 ca hiện trường mới, 1 hỏi đáp nổi bật **nếu đã xuất bản**. Nếu thiếu, hiển thị trạng thái cập nhật, không fake.
3. **Tra nhanh:** ô tìm, đường vào bảng "Tôi thấy…", bản đồ rút gọn 38 ngách theo dữ liệu đã xác minh.

Không carousel, slider, quảng cáo. Người dùng có thể đổi lens ở header. Giữ nguyên thông điệp "Một công trình. Ba góc nhìn." nếu phù hợp bố cục.

## 5. CONTENT TYPES — NGUỒN, QUYỀN VÀ QUAN HỆ

| Loại | Quy chuẩn xuất bản | Quan hệ |
|---|---|---|
| Chapter | 3 sách, nhãn bắt buộc: Cẩm nang = **Tài liệu tra cứu**, Phận nhà thầu = **Phi hư cấu**, Quẩn quanh KTS = **Tự sự, có hư cấu**; chương chưa đến lịch chỉ hiện thông báo/lịch, **không lộ body** | chapter ↔ ngách ↔ bài ↔ ca |
| Niche pillar | Template A 12 khối, theo nguồn Cẩm nang phần 5 + viết mới có chứng cứ; ba lớp trong một URL | niche ↔ liên kết chéo nghề ↔ chapter ↔ case |
| Architectural area | Template B 7 khối riêng; không đóng giả template A | area ↔ các ngách |
| Field note | 600–1.000 chữ: hiện tượng, nguyên nhân gốc, mốc chặn/điểm nghiệm thu, chi phí sửa **nếu có số thật**, tag ngách | case ↔ niche; ảnh có quyền dùng, đơn vị/địa chỉ ẩn danh |
| Q&A | Form ẩn danh, tối đa 5 ảnh; mô tả, ngách phỏng đoán tùy chọn; số điện thoại **tùy chọn và chỉ để trả lời riêng khi người gửi đồng ý**. Không tự tạo câu trả lời | question ↔ answer đã duyệt ↔ niche |
| Từ điển / Tra nhanh | Thuật ngữ có nguồn, bảng "Tôi thấy…" đúng Cẩm nang phần 9; tối ưu điện thoại/3G | term/symptom ↔ niche ↔ article |
| Công nghệ nghề | Bài có nguồn về AI, BIM, phần mềm, thiết bị; nêu cả ưu/nhược | article ↔ niche, không phải tính năng AI |
| Kết nối | Bốn form thu nhu cầu, **riêng tư**, review thủ công/định tuyến theo ngách, vùng; không phải marketplace | intake ↔ staff triage, tách KPI kinh doanh khỏi CMS |

Một bài editorial phải gắn **đối tượng độc giả chính** (`audienceRole`), thể loại, nguồn, tác giả, ngày xuất bản, liên kết chuyên mục. Không sản xuất 3 bản bài chỉ vì có 3 lens. Chỉ content PUBLISHED/được phê duyệt mới có API public và nằm trong sitemap.

## 6. EDITORIAL GOVERNANCE — QUY TRÌNH VÀ PHÂN QUYỀN

### 6.1 Mô hình tổ chức đúng bản chất

- **Chủ bút (`EDITOR_IN_CHIEF`):** quyết định nội dung nhạy cảm, chịu trách nhiệm định hướng và xuất bản.
- **Biên tập viên (`EDITOR`):** nhận nguyên liệu, xác minh nguồn, soạn/sửa, lên lịch, gửi bài đi duyệt.
- **Người trong nghề (`TECHNICAL_REVIEWER`):** kỹ sư/giám sát có kinh nghiệm thực tế; kiểm tra chuyên môn và điểm nghiệm thu.
- **Quản trị hệ thống (`ADMIN`):** tài khoản, cấu hình, bảo mật, backup; **không mặc nhiên là chủ bút hoặc người kiểm định chuyên môn**.
- **Nguồn tư liệu:** ảnh/tình huống từ công trường, PM SPACE / giám sát, sách và nguồn chính thức. Nguồn cung cấp tư liệu **không có quyền quyết định kết luận**.

Đây là **vai trò trong luồng biên tập**, KHÔNG phải sơ đồ cấp bậc công ty; không đặt chủ nhà–KTS–nhà thầu dưới nhau và không đưa bộ phận kinh doanh vào chuỗi phê duyệt bài.

### 6.2 Ma trận quyền mục tiêu

| Hành động | ADMIN | EDITOR | TECHNICAL_REVIEWER | EDITOR_IN_CHIEF |
|---|---|---|---|---|
| Tạo / sửa người dùng, phân quyền | Có | Không | Không | Không (trừ khi được cấp quyền hệ thống riêng) |
| Viết, sửa, gửi nháp | Chỉ khi được **cấp thêm quyền biên tập** | Có | Không mặc định | Theo phân quyền biên tập |
| Duyệt tính đúng kỹ thuật | **Không mặc định** | Không | Có, khi không phải tác giả | Không mặc định; cần quyền chuyên môn riêng |
| Duyệt bài nhạy cảm | **Không mặc định** | Không | Không | Có, khi không phải tác giả |
| Xuất bản / thu hồi | **Không mặc định** | Không | Không | Có hoặc người được ủy quyền xuất bản rõ ràng |
| Xem audit, vận hành hệ thống | Có | Theo nhu cầu kiểm tra bài | Theo hồ sơ bài được giao | Theo phạm vi biên tập |

**Quyết định v1.0:** Bỏ quyền duyệt/xuất bản tự động chỉ vì có `ADMIN`. Code hiện tại **vẫn cho ADMIN duyệt và publish**, do đó đây là **chênh lệch cần BE sửa** bằng thiết kế quyền cụ thể, migration an toàn và tests. Tuyệt đối không tháo quyền giữa chừng trước khi đã có tài khoản chủ bút/người duyệt hợp lệ, tránh khóa tòa soạn. Có thể cho một người nhiều chức danh nhưng phải cấp quyền tường minh và **không bao giờ được duyệt bài do chính mình tạo**; audit theo người thực hiện thực tế.

### 6.3 Workflow bắt buộc

`DRAFT → SUBMITTED → TECHNICAL_REVIEW → (EDITOR_IN_CHIEF_REVIEW nếu nhạy cảm) → APPROVED → SCHEDULED/PUBLISHED`.

- Trả về sửa: `NEEDS_CHANGES`, từ chối: `REJECTED`, thu hồi: `WITHDRAWN`; thay đổi lưu lý do, người và thời điểm.
- **Bước kiểm tra kỹ thuật** phải có trước duyệt nội dung chuyên môn, kể cả khi bài viết dành cho chủ nhà.
- Cờ nhạy cảm bắt buộc chủ bút duyệt: `INDUSTRY_DARK_SIDE`, `PRICE_OR_RATE`, `WARRANTY_PERIOD`, `IDENTIFIABLE_ENTITY_RISK`, `LEGAL_CONTENT`. Không cho người viết tự bỏ cờ để né duyệt khi bài thực sự có nội dung tương ứng.
- Không tự duyệt (tác giả/người tạo không được review/approve chính sản phẩm của mình), kể cả Admin; frontend không chỉ giấu nút, backend bắt buộc enforce.
- Luôn xác minh quyền ảnh, ẩn danh công ty/địa chỉ trong ca hiện trường, nguồn số liệu, sự đồng ý dùng ảnh; có lịch sử phiên bản, audit và nguồn tham chiếu. Nội dung thiếu yêu cầu phải dừng ở draft/review.
- Chỉ bài `PUBLISHED` có thời điểm công bố hợp lệ mới lên public; `DRAFT`, `APPROVED`, `SCHEDULED` chưa đến lịch, `REJECTED`, `WITHDRAWN` không rò qua feed/search/SEO/media.

### 6.4 Không có tài khoản độc giả giai đoạn 1

- `/admin/login` dành cho nhân sự có tài khoản do quản trị cấp; không có public "Đăng ký".
- Công chúng vẫn **đọc cả ba lens** và **gửi câu hỏi ẩn danh** được; không cần lập tài khoản.
- Không lưu số điện thoại nếu người gửi không chọn mục đích liên hệ; không gọi người gửi khi chưa có yêu cầu trả lời riêng. Form kết nối phải có thông báo quyền riêng tư, chính sách lưu giữ, người phụ trách tiếp nhận.
- Tài liệu gốc nói "không đăng nhập năm đầu": áp dụng cho độc giả, **không áp dụng cho CMS nội bộ** mà dự án đã chọn tự xây.

## 7. API, DATA VÀ URL — GIAO ƯỚC GIỮA BA CHAT

- API ổn định theo `docs/API_CONTRACT.md`. Không rename endpoint hoặc trường dữ liệu bởi một chat đơn lẻ; nếu đổi, cùng cập nhật contract, tests và FE.
- Các endpoint công khai hiện có (health, ready, niches, articles, terms, feed, books, field notes, search, Q&A) phải tiếp tục hoạt động; các mục sitemap đích **không suy ra API đã tồn tại**.
- Reader lens = sort/preselect, không phải role bảo mật hoặc điều kiện lọc quyền đọc. Mọi list luôn trả nội dung PUBLISHED có thật.
- 30 construction niches: chỉ seed sau khi chủ nội dung cung cấp bảng mã/tên/nhóm được đối chiếu Cẩm nang; 8 design areas đã xác nhận nhưng nội dung sâu không bịa.
- Tách dữ liệu `conspace` khỏi `hola_maps`, `x_hub`; mỗi migration có đường kiểm tra, backup và rollback khả thi. Media tách public/private, file chưa duyệt không mở public. Không ghi secret vào repo.
- Nén ảnh có alt, sitemap.xml chỉ các route đã xuất bản, canonical theo sitemap đích, schema Article, link hai chiều ngách ↔ sách ↔ hiện trường ↔ Q&A. Không làm trang ảo để tăng chỉ số SEO.

## 8. ROADMAP THỰC HIỆN (LOCAL-FIRST)

| Nấc | Mở khi nào | Bắt buộc kiểm thử |
|---|---|---|
| **1 — Nền & nội dung thật** (0–6 tháng) | Trang chủ 3 cổng, 3 sách đăng kỳ, ngách thi công từ dữ liệu có nguồn, hiện trường, hỏi đáp, tra nhanh, nguyên tắc nội dung; cổng kết nối **chỉ form nhận tay** khi đã có người trực | Khách đọc không login; lens đổi không đổi URL; quy trình biên tập xuất bản được một bài thật |
| **2 — Tra cứu sâu** (6–12 tháng) | 8 mảng kiến trúc nội dung sâu, checklist các ngách, thư viện sự cố, Công nghệ nghề, tra cứu ngữ nghĩa **chỉ dẫn nguồn kho riêng** | Không AI trả lời pháp lý/TCVN/báo giá tự do; không công bố trang chưa có nội dung |
| **3 — Mạng lưới thẩm định** (12 tháng+) | Hồ sơ ngành có thẩm định, định tuyến nhu cầu có kiểm tra, mở rộng quy trình kết nối sau khi vận hành tay thành công | Không ranking/sao/đấu thầu/escrow; mô hình thẩm định có tiêu chuẩn và ngày kiểm |

Sự khác nhau trong nguồn về thời điểm mở "Kết nối" được chốt: **nấc 1 chỉ nhận tay, không công khai và có nhân sự xử lý; nấc 3 mới xem xét hệ thống điều phối/hồ sơ quy mô lớn**. "Công nghệ nghề" là **chuyên mục nội dung**, có thể xuất bản bài nguồn thật sớm nhưng không phải lý do xây AI sản phẩm ở nấc 1.

Công nghệ chạy thực tế do chủ dự án chốt: React + Vite + **JSX** (không TSX), Node.js 22.23.2 + Express, PostgreSQL 16 + PostGIS, Docker PostgreSQL local; khác gợi ý WordPress/Ghost trong tài liệu 03/09. Không bắt đầu tính năng mới trên VPS: **local `D:\conspace` trước → CI → deploy sau khi duyệt**.

## 9. DEFINITION OF DONE — TEST CHẤP NHẬN

### Product / Frontend
- Trang chủ có 3 cổng nổi bật trong màn hình đầu, không slider; dropdown header đổi được lens.
- Chọn KTS → vào **cùng** một `/ngach/...`, lớp KTS mở sẵn; hai lớp khác vẫn mở được; URL không đổi khi chuyển Chủ nhà/Nhà thầu.
- Home/feed/search **ưu tiên** bài theo lens nhưng không ẩn bài PUBLISHED của nhóm khác; chưa có nội dung thì hiện empty state đúng.
- Tủ sách hiển thị đủ 3 nhãn; chương chưa công bố không lộ body; hiện trường/FAQ không lộ danh tính riêng tư.
- Nav và URL mục tiêu có alias an toàn cho các route hiện có; không 404 dây chuyền hoặc nội dung placeholder giả.

### Editorial / Backend
- Editor đăng nhập, tạo draft có nguồn, đánh dấu nội dung nhạy cảm, submit.
- Người **khác tác giả** (reviewer có quyền) duyệt kỹ thuật; nhạy cảm bắt buộc Chief duyệt; người có quyền xuất bản mới publish.
- ADMIN thuần túy không được approve/publish; nếu kiêm nhiệm phải có cấp quyền biên tập **tường minh** và vẫn không tự duyệt.
- Từ chối/đòi sửa/withdraw được audit; public API, media và SEO chỉ trả tài nguyên đủ điều kiện.
- Gửi Q&A ẩn danh, tối đa 5 ảnh, số tùy chọn đúng consent; không có đăng ký độc giả.

### Ops / Security / Release
- Xác thực, CSRF, RBAC, quyền media, backup/restore, data privacy và rate limit đều được kiểm tra.
- Local DB/CI PASS (Node 22.23.2); migration tăng tiến, không chạm DB app khác.
- **Không tự deploy khi push main**. Production giữ nguyên cho đến khi có duyệt + runbook; rollback đã được diễn tập hoặc rà soát.

## 10. CHANGE CONTROL — TRÁNH BA CHAT LỆCH NHAU

1. Ba chat **đọc file này trước khi sửa code** và nhắc version `v1.0` trong báo cáo.
2. **Backend** sở hữu `backend/**` và đề xuất/điều phối chỉnh `docs/API_CONTRACT.md` khi FE được báo; chỉ viết migration không phá dữ liệu, không thay đổi quyền admin âm thầm.
3. **Frontend** sở hữu `frontend/**`, triển khai IA + lens + UI biên tập theo contract; tuyệt đối không làm fake API success hay account public.
4. **DevOps** sở hữu `ops/**` và `.github/workflows/**`, kiểm thử quyền, CI, route/alias, backup; không động vào Nginx VPS vì đang phát triển local.
5. Mỗi chat tự dùng clone/worktree **riêng**, code trực tiếp trên **main**, chỉ `git add` phạm vi mình sửa, `fetch/rebase` trước push, không force-push, không chồng commit trong một working tree.
6. Không tự sửa file này bởi các chat; mọi đề xuất thay đổi v1.0 phải báo chủ dự án, sau khi chấp thuận nâng v1.1.
7. Hoàn thành một ticket = code + test + danh sách thay đổi + bằng chứng kết quả; không tính "đã tạo giao diện" như đã chạy được end-to-end.

## 11. QUYẾT ĐỊNH GIẢI QUYẾT KHÁC BIỆT TÀI LIỆU

| Vấn đề | Quyết định v1.0 |
|---|---|
| 3 góc nhìn là tính năng riêng? | **Không.** Chỉ ưu tiên nội dung, cách dẫn và mở sẵn lớp phù hợp trên cùng URL. Không phải quyền truy cập. |
| Ngách thi công và mảng kiến trúc có một template? | **Không.** 30 ngách dùng template A 12 khối; 8 mảng dùng template B. |
| Public có đăng nhập/đăng ký ngay? | **Không.** Nội bộ có CMS login; công chúng đọc và gửi Q&A không cần tài khoản. |
| Đăng bài từ CMS có được tự duyệt? | **Không.** Tách author/reviewer; Chief duyệt bài nhạy cảm. ADMIN kỹ thuật không mặc nhiên được duyệt. |
| Dùng WordPress/Ghost theo đặc tả 2026? | **Không cho repo hiện tại.** Chủ dự án đã chốt React JSX / Node / PostgreSQL; vẫn giữ nguyên triết lý tối giản của đặc tả. |
| Cổng kết nối sớm hay muộn? | Giai đoạn 1: form **riêng tư, xử lý tay** nếu có người trực. Giai đoạn 3: thẩm định/điều phối mở rộng. |
| Công nghệ nghề có phải chatbot? | **Không.** Là chuyên mục bài; AI ngữ nghĩa chỉ khi có kho nguồn và kiểm soát citation ở nấc 2. |
| "Bàn nghề"/"Từ điển nghề" đang tồn tại thì sao? | Giữ route; Bàn nghề là chuyên mục góc nhìn. Từ điển thuộc hệ Tra nhanh/Tra cứu, không tạo kho nội dung thứ 39. |
| 30 ngách thiếu nguồn thì sao? | Chưa seed/viết giả; chờ bảng từ Cẩm nang được duyệt. |
