# MIG-01 — Cấu trúc, tài liệu và provenance

Ngày: 14/11/2026, giờ Việt Nam. Actor: Codex. Human owner/reviewer: chưa xác định. Consumer: nhóm phát triển Flood Calendar. Đầu ra: tài liệu local trong checkout để review; không commit.

## Đối chiếu trước thay đổi

- Root Git là checkout `repository` trong workspace; branch `main`, HEAD `aa262910fd8c73877a88688a4ee7b8c6c09e57e4`, remote `origin` fetch/push `https://github.com/hungkhuu404/Dancing_with_The_Paddies.git`. `git status --short` ban đầu rỗng và thành công.
- Đọc README, `docs/data-contract.md`, ignore và cấu hình text. Chưa có AGENTS trong checkout lúc bắt đầu. Không di chuyển checkout hoặc đổi branch.
- Nasa_prep giữ ở root checkout cũ, branch `quoc/real-data`, HEAD `6880147`. Kiểm tra chỉ đọc thành công: không có staged/unstaged tracked changes, nhưng có 5 mục untracked (bốn gói H* và một đề xuất 3D). Không đọc payload hay nhập các mục này. Repo nguồn không được coi là hoàn toàn sạch.
- Main thực tế trên GitHub là `963333c`, gồm PR #15 đã merge lúc 12:02:17 ngày 14/11/2026 giờ Việt Nam. Local `origin/main` vẫn ở `608a248`. Chọn revision remote đã merge; không fetch vào hay sửa repo nguồn.

## Thực hiện

Chỉ bổ sung `AGENTS.md`, `docs/README.md`, `docs/plans/` và `docs/provenance/`. README, LICENSE, `docs/data-contract.md`, cấu hình gốc và các `.gitkeep` được giữ nguyên. Không tạo `web/`, schema, fixture, script hoặc pipeline giả.

Không chuyển bộ tài liệu chuẩn bị nguyên trạng: loại đường dẫn máy, trạng thái checkout đã lỗi thời và tránh tạo contract thứ hai. [Kế hoạch](migration-plan.md) phản ánh cây thực tế của đích; [manifest](../provenance/migration-manifest.md) ghi nguồn và lựa chọn revision.

## Kiểm chứng và giới hạn

- So SHA-256 từng file trong 14 file tracked ban đầu với trước thay đổi; mọi file giữ nguyên byte.
- Kiểm liên kết local của các tài liệu mới, đường dẫn được Git nhận và phạm vi file bổ sung; kiểm whitespace bằng diff trên từng file mới.
- Hash các tài liệu mới ở [bảng SHA-256](../provenance/batch-01-sha256.md); bảng không hash chính nó để tránh vòng tự tham chiếu.
- Không chạy test/build ứng dụng hoặc khẳng định kết quả QA của nguồn áp dụng cho repo đích. Chưa có code ứng dụng trong checkout.

Trạng thái: đợt tài liệu đã thực hiện local, còn review người và mọi thao tác commit/push/deploy. Không có process ứng dụng nền. Bước tiếp theo: review tài liệu và giao riêng đợt logic/schema nếu phù hợp; human owner chưa xác định.
