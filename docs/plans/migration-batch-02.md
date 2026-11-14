# Đợt 2 — Web local từ snapshot 963333c

Ngày: 14/11/2026, giờ Việt Nam. Task: MIG-WEB-LOCAL-002. Actor: Codex. Human owner/reviewer: chưa xác định. Consumer: nhóm web và người review migration.

## Kết quả

Thực hiện trên branch `migration/web-local`, baseline `aa262910fd8c73877a88688a4ee7b8c6c09e57e4`. Giữ nguyên 6 file tài liệu đợt 1, LICENSE và contract đích. Sau review, README gốc được sửa theo yêu cầu để phản ánh đúng các phần chưa migrate; các file baseline khác giữ nguyên. Hai commit riêng đã được cho phép sau review đạt; hash/thời gian thực tế tra Git. Chưa push hoặc deploy.

Commit nguồn `963333cb68e773706d68a4251d83eeb4daab5bb8` không có trong object store local Nasa_prep khi bắt đầu. Đã tải đúng SHA vào vùng snapshot riêng, xác nhận kiểu commit và tree `0ba62247ccea7305437adb68bc90da6347b8a95c` trước khi chuyển. Mọi file chuyển đọc từ blob của snapshot, không từ working tree hoặc origin/main local. Repo Nasa_prep không bị sửa.

## Danh sách chuyển

| Nhóm | Số file nguồn |
| --- | ---: |
| `web/src/` | 70 |
| `web/test/` | 16 |
| `web/public/` (model, impostor, scene, notice và manifest) | 182 |
| HTML, Vite, package/lock, ignore, script sync và tài liệu web nguồn | 8 |
| Bộ xuất công khai `data/sites.json`, `data/tan_hoi/` | 27 |
| Tổng | 303 |

Trong 303 file, 293 giữ nguyên bytes; 10 chỉnh sửa phục vụ local, an toàn dữ liệu và thông báo validation (hai HTML được cập nhật sau review). Thêm mới danh sách file dữ liệu cho phép, 3 test hồi quy và `web/README.md`. Thêm báo cáo này và [provenance đợt 2](../provenance/migration-web-local.md). Provenance liệt kê **từng file** cùng Git blob, SHA-256 nguồn/đích và lý do khác biệt.

Không chuyển `.git`, workflow, deploy config, bộ sinh fixture, dữ liệu private/heldout, cache, node_modules hoặc dist. Các thư mục dependency/output hiện có là kết quả cài/build mới local, được ignore. Không mang raw NISAR HDF5 hoặc các gói H* local vào repo.

## Điều chỉnh

- Kiểm script trước khi chạy: nguồn copy gần toàn bộ `data/`, xóa output rồi tự tạo fixture khi thiếu input. Đã viết lại để chỉ nhận 27 đường dẫn công khai cố định, kiểm đường dẫn/link và đủ input trước xóa output; lỗi thiếu dữ liệu dừng lệnh, không tạo fixture.
- Loader 3D yêu cầu contract thật; không dùng trạng thái scene hoặc fixture thay cho dữ liệu thiếu. 3D và map có thông báo lỗi thiếu input, không có lỗi JavaScript chưa xử lý trong ca kiểm tra thiếu sites.
- Loại script deploy và fixture khỏi package.json. Lockfile giữ nguyên byte, dependency tree khóa sẵn vẫn có wrangler nhưng không được gọi. Không nhập workflow Cloudflare.
- Test infrastructure đọc `places.geojson` công khai thay cho fixture, so tập tên có sắp xếp vì thứ tự giữa hai bản khác nhau; không đổi tên hoặc payload dữ liệu.
- Kiểm trực quan phát hiện CSS flex của banner ngày ghi đè `hidden`. Đã thêm quy tắc hidden cho map và kiểm banner biến mất khi quay về ảnh mới nhất.
- Review xác nhận 3D/map không đọc `validation.json`; file không cần cho khám phá dữ liệu hiện tại nhưng vẫn thiếu so với bộ contract hoàn chỉnh. Thêm thông báo trong Sources của 3D và notice của map, không tạo file hoặc số validation giả.

## Kiểm chứng đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `npm ci --ignore-scripts` với cache riêng trong workspace | Thành công: 79 package được cài mới; npm báo 0 vulnerability; không chạy lifecycle script cài đặt |
| `npm test` cuối | **83/83 đạt**: 80 test kế thừa và 3 test đồng bộ dữ liệu mới |
| Test sync | Thiếu input thất bại mà không xóa output cũ; không copy file ngoài danh sách; traversal bị từ chối |
| `npm run build` cuối | Thành công, Vite 8.3.5; có cảnh báo chunk lớn hơn 500 kB, không phải lỗi build |
| Đối chiếu dữ liệu xuất | 2.344 cell ID duy nhất, 20 acquisition; chiều dài chuỗi/HH/HV, ký hiệu trạng thái, đường dẫn ảnh nền và tổng diện tích nhất quán; meta không phải fixture |
| Edge desktop 1440×900, bản production local `/` | WebGL thực trên NVIDIA RTX 4050 D3D11; landscape/radar/water arrival, Home/End đổi ngày, chọn field và panel thông tin hoạt động; không fallback |
| Edge `/map/` | Tải đủ nguồn cells/backdrop, 14 layer; đổi câu hỏi, previous/next, về latest ẩn banner cũ, click ô mở record/biểu đồ; không lỗi JavaScript hoặc HTTP local thất bại |
| Mất `data/sites.json` giả lập bằng chặn request | Cả 3D và map hiện thông báo thiếu dữ liệu, không sinh dữ liệu thay thế, không có pageerror |
| Bảo toàn | 14 file baseline và 5 tài liệu có hash đợt 1 khớp; bảng hash đợt 1 cũng không bị sửa. Lockfile khớp blob nguồn |

Kiểm trình duyệt là smoke desktop với reduced motion bật cho 3D; không tuyên bố đã nghiệm thu mobile, mọi GPU/tier, performance chuẩn, âm thanh hoặc video dài. Kết quả QA lịch sử PR #15 không được dùng thay kết quả kiểm ở đích. Lần chạy này không benchmark; FPS tức thời không phải cam kết hiệu năng.

## Phần còn thiếu

- Bộ công khai là H4 (11/8–27/10/2026), chưa phải H7/bản khóa cuối; chưa có hai ảnh bổ sung trong kế hoạch cũ. Không tự thêm ngoài snapshot được giao.
- Snapshot thiếu `data/tan_hoi/validation.json`; sync cảnh báo rõ. Không có số kiểm chứng độc lập hoặc validation giả, chưa đạt đầy đủ contract dữ liệu cuối.
- Chưa có Bang Rakam, pipeline S0–S7, schema dữ liệu hoặc công cụ tái tạo asset trong đợt này.
- Trang Method and limits, nghe theo ô và narration tùy chọn chưa hoàn chỉnh/không có theo snapshot. Âm thanh ambient minh họa không thay cho sonification nghiệp vụ.
- Bản đồ nền vector phụ thuộc OpenFreeMap; lưới/ảnh radar/dữ liệu chính được phục vụ local. Scene 3D có tính minh họa, không phải mô hình khảo sát hay đo độ sâu.

Chạy lại theo [web/README.md](../../web/README.md). Kết quả review trước commit ở [báo cáo review](../reviews/web-local-review.md). Phần dữ liệu cuối/pipeline cần tác vụ riêng; chỉ hai commit local được cho phép trong lượt review, không push/deploy.
