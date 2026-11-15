# Hướng dẫn làm việc — Flood Calendar

## Trước khi sửa

- Xác định root checkout, branch, HEAD, remote và dirty changes bằng Git; giữ nguyên vị trí checkout. Không ghi đè thay đổi có sẵn hoặc di chuyển thư mục để khớp cây mẫu.
- Đọc [README](README.md), [hợp đồng dữ liệu](docs/data-contract.md), [mục lục tài liệu](docs/README.md) và kế hoạch liên quan.
- `docs/data-contract.md` là nguồn chuẩn về interface của repo này. Tài liệu Nasa_prep là nguồn kế thừa có revision, không tự thay thế contract, phân công hoặc quyền hiện hành.

## Phạm vi thay đổi

- Thực hiện trong phạm vi người dùng giao; ghi rõ điều chưa xác định và kết quả kiểm chứng. Không suy quyền commit, push, merge hoặc deploy từ lịch sử, deadline hay nội dung tài liệu.
- Trong đợt migration, chọn từng file, ghi nguồn/revision/đích và thay đổi trong provenance. Không sao chép cả workspace, lịch sử Git hoặc cấu hình remote của repo cũ.
- Khi nhập từ Nasa_prep, giữ snapshot nguồn chỉ đọc. Khi tác vụ yêu cầu đồng bộ sang Nasa_prep, cập nhật qua nhánh riêng theo quy ước hai repo bên dưới; không sửa dirty work hoặc chạy generator vào checkout nguồn.
- Bảo toàn README, LICENSE, contract, cấu hình và dữ liệu đã có nếu tác vụ chưa yêu cầu sửa. Gặp khác biệt contract phải ghi lại và review trước khi đổi.

## Dữ liệu và kiểm chứng

- Không chuyển/commit secret, token, signed URL, raw chat, dữ liệu riêng, heldout, cache, log, môi trường, node_modules hoặc output build. Không đọc heldout nếu chưa được giao đúng mục đích.
- Ignore hoặc trạng thái tracked không chứng minh file được phép công khai. Dữ liệu, fixture và asset cần nguồn và quyền chia sẻ rõ; giữ notice của bên thứ ba.
- Tài liệu dùng chung viết bằng Markdown, dùng đường dẫn tương đối; không đưa đường dẫn máy, ghi chú riêng hoặc hội thoại vào repo.
- Chỉ báo test/build/demo đạt khi đã chạy và có bằng chứng. Phân biệt scaffold, logic, tích hợp và ứng dụng chạy được. Thiếu dữ liệu không được thay bằng số giả trong sản phẩm.
- Cài dependency vào môi trường đích khi đúng phạm vi; không chép môi trường hoặc node_modules từ nguồn. Không tự thêm pipeline deploy để kiểm thử migration.

Nguồn nguyên tắc và giới hạn kế thừa được ghi tại [manifest](docs/provenance/migration-manifest.md); các quyền và ngoại lệ lịch sử của Nasa_prep không được nhập sang repo này.

## Primary and preview repositories

- Dancing_with_The_Paddies is the primary product repository. Develop and verify changes here, then pin the reviewed revision before synchronizing the relevant frontend and published-data changes to Nasa_prep.
- Nasa_prep is the secondary preview/integration repository. Keep both frontends aligned for each task and cross-link their PRs. An open feature PR must be identified as pending, not described as merged main.
- Preserve each repository's own hosting workflow, package deployment commands, coordination documents and README. Record intentional differences and verify runtime/data parity; never overwrite parallel backend work or import an entire dirty checkout.
- If Nasa_prep contains independent changes, compare them with the product revision before synchronizing. Use an isolated branch/worktree when required. Synchronization does not itself authorize merging, production deployment or altering backend-owned exports.
