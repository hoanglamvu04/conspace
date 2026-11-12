# CONSPACE — 3 chat, 1 nhánh main

Quyết định của chủ dự án (12/11/2026): **Backend, Frontend và DevOps đều commit trực tiếp lên `main`**, không tạo 3 nhánh mới hay PR cho các việc thông thường.

## Phạm vi bắt buộc

| Chat | Phạm vi được sửa | Không sửa |
|---|---|---|
| Backend | `backend/**` | frontend/**, ops/**, root |
| Frontend | `frontend/**` | backend/**, ops/**, root |
| DevOps | `ops/**`, `.github/workflows/**` | backend/**, frontend/**, root |

Các file hợp đồng chung như `docs/API_CONTRACT.md`, `.nvmrc`, root `package.json` chỉ sửa khi có điều phối thay đổi và đã báo cho các chat liên quan.

## Quy trình mỗi chat

1. Trước khi chỉnh sửa: `git fetch origin && git status --short && git pull --ff-only origin main` nếu chưa có thay đổi local.
2. Chỉ viết code trong phạm vi của mình; chạy lệnh kiểm thử liên quan.
3. `git add <owned-folder>` thay vì `git add -A` toàn repository.
4. `git commit -m "fix(be|fe|ops): ..."`.
5. Đồng bộ commit mới nhất của main trước khi push: nếu có commit mới trên remote, dùng `git fetch origin && git rebase origin/main`, giải quyết conflict trong phần mình sở hữu rồi `git push origin main`. Không force-push.
6. Khi phát hiện thay đổi API contract, phải thông báo cho Backend + Frontend trước khi sửa, không tự ý đổi response fields.

Lưu ý: ba chat dùng cùng máy/local clone và cùng một working tree không thể chạy `git switch` hoặc `git commit` cùng lúc an toàn. Tốt nhất mỗi chat dùng clone/worktree làm việc độc lập nhưng cùng đẩy commit lên main và tuân thủ ownership.

## Hạ tầng production

- VPS: 103.149.170.146; Domain: conspace.vn và www.conspace.vn.
- Runtime: Node.js 22.23.2; Express; React JSX; PostgreSQL 16/PostGIS 3.4.2 (database `conspace`, role `conspace_app`); Nginx HTTPS; PM2 `conspace-api` port loopback 5088.
- **Push main không tự deploy**. DevOps hoặc người vận hành chạy deploy có kiểm tra trên VPS sau khi GitHub Actions PASS.
- Không `pm2 update`, `pm2 kill`, `pm2 restart all`, `git reset --hard`, restart toàn bộ Nginx, reboot VPS, hoặc sửa database của HOLA Maps và X-HUB.
- Nếu site trả HTTP 500, dùng `bash ops/scripts/diagnose-live.sh` trước khi chạy lại go-live.
