# QUAN-6 — dữ liệu bản 1

Ngày 14/11/2026, Asia/Ho_Chi_Minh. Owner Quân, actor Codex. Consumer Quốc/Quang. Đã chuẩn bị và kiểm local; người dùng thực hiện commit/push/PR/merge theo quyền hiện hành trong phiên.

## Git và phiên bản đích

Commit code `a47d171` đã push và được merge vào main qua PR #2, merge commit `da256bf`. Branch local/remote `quan-config-schema-s0-s7` vẫn ở `a47d171`. Main hiện dùng CONTRACT-001 1.0.0 và chưa có web. Web được kiểm bằng snapshot nguyên trạng `migration/web-local` tại `d881de3`, với dữ liệu lấy từ checkout sản phẩm.

Bản 1 lấy từ H4 đã tái xuất và kiểm bằng S7 1.0.0. Có 27 file công khai gồm sites, meta, cells, series, summary, aoi, places và 20 WebP. Đặt tại `data/` làm nguồn theo contract, đồng thời đã chép vào `web/public/data/` theo yêu cầu lượt này. Hai bộ và bản build giống nhau từng byte. Khi tích hợp web, `predev/prebuild` sẽ tái tạo `web/public/data/` từ `data/`; commit nguồn `data/` để khớp cơ chế đó.

## Đối chiếu nhánh Tân

`migration/tan-s1-s5` tại `37ca8aa` gồm `15e602f`, chưa vào main. Các thay đổi sau ảnh hưởng việc chuyển lên phương pháp pixel.

| File | Chủ trì phối hợp | Khác biệt và ảnh hưởng |
| --- | --- | --- |
| `docs/data-contract.md` | Hưng, Tân, Quân, Quốc/Bằng | Đề xuất 2.0.0 thay phân loại trung bình ô bằng tỷ lệ pixel 75%, lọc hai mức 50%, phương pháp post-hoc. Cần thống nhất phiên bản trước tích hợp |
| `pipeline/export/s7.py` | Tân + Quân | Thêm method_metadata yêu cầu freeze pixel, xuất 2.0.0; kiểm flag_gt30 thay vì tính lại. H4 cũ thiếu metadata pixel nên bị từ chối |
| `schema/meta.schema.json` | Quân + Tân | const 2.0.0, bắt buộc classification, water_fraction, fill_min_fraction, joint_valid_fraction, selection_status. Từ chối metadata H4 1.0.0 |
| Bảy Schema còn lại | Quân | Đổi comment phiên bản, không đổi cấu trúc validation |
| `web/scripts/sync-data.mjs` trên nhánh web | Quốc + Quân | Hiện chỉ nhận 1.0.0. Nếu merge Tân và xuất 2.0.0 thì predev/prebuild bị chặn cho đến khi web được cập nhật |
| Kết quả S6/validation | Bằng + Tân | Phải tính lại cho phương pháp pixel; không gắn số kiểm chứng phương pháp cũ vào dữ liệu mới |

`common.py`, `backdrop.py`, `verify.py` không đổi giữa main và nhánh Tân. Đây là khác biệt phương pháp/contract cần điều phối, chưa phải kết quả chạy git merge. Lượt này giữ đúng contract 1.0.0 đang ở main. Khi chuyển 2.0.0 phải dùng đầu ra xử lý pixel tương ứng và xuất lại S7.

## Kiểm thực tế

- S7 verify trên `web/public/data/` đạt Schema của 7 file hiện có, strict JSON, 2.344 cell ID, 20 acquisition, chuỗi, metrics, totals, as-of, geometry và giới hạn dung lượng.
- Tổng 14.650 ha; mỗi nhóm status_ha và gt30_ha cộng đúng tổng. 20 WebP 888×813 pixel, 138.866–252.752 byte/ảnh. Site khoảng 6,22 MB.
- Web snapshot `d881de3`: npm ci theo lockfile, 83/83 test đạt, npm run build thành công. Build cảnh báo chunk lớn hơn 500 kB.
- Đã chạy Vite và mở Chromium trang `/map/?debug`. Bản đồ hiện tên Tân Hội, 24 tên ấp, 20 lựa chọn ngày và số trạng thái khớp summary. Đã click ngày 11/8/2026 track 148D; snapshot kiểm cuối lại ghi ngày 27/10, nên chưa xác nhận trạng thái chuyển ngày được giữ ổn định. Browser tải cells/series/meta và 20 ảnh nền từ server local. Có 404 favicon.ico và Vite ghi ResizeObserver loop completed with undelivered notifications; cần Quốc rà giao diện. Các thao tác dữ liệu/bản đồ đã kiểm vẫn hoàn tất.
- Dữ liệu trong checkout, thư mục public phục vụ và dist khớp SHA-256. Thử nghiệm ở snapshot web tách riêng vì web chưa merge vào main; chưa gọi đây là nghiệm thu main tích hợp.
- `validation.json` chưa có, web hiện thông báo kết quả validation chưa sẵn sàng. Thuộc S6/QUAN-7. Chưa đo ngân sách tải đầu hoặc nghiệm thu mọi thiết bị.

Bằng chứng local giữ ở workspace chuẩn bị `runtime/QUAN-6-CODE-REVIEW/evidence/`: `v1-public-verify.json`, `v1-data-hashes.json`, `web-v1-tests.log`, `web-v1-build.log`, `web-v1-browser.log`, `web-v1-map.png`. Token/cache/venv/GCOV và bằng chứng nội bộ nằm ngoài tập file bàn giao.

## Bước Git người dùng thực hiện

Từ checkout sản phẩm, kiểm trạng thái trước khi chạy. `docs/quan-6-code.md` là snapshot lượt chuẩn bị trước đó; trạng thái dữ liệu mới theo tài liệu này.

```sh
git merge --ff-only origin/main
git add data/sites.json data/tan_hoi docs/quan-6-data-v1.md
git diff --cached --stat
git diff --cached --check
git commit -m "Add verified Tan Hoi v1 data for QUAN-6"
git push origin quan-config-schema-s0-s7
```

Dùng danh tính GitHub người dùng đã xác minh cho commit. Tạo PR mới từ `quan-config-schema-s0-s7` vào `main`, vì PR #2 đã merge trước commit dữ liệu. Review rồi merge PR dữ liệu. Khi tích hợp `migration/web-local`, giữ bộ dữ liệu bản 1 và chạy lại test/build/kiểm trình duyệt trên main kết hợp. Nếu conflict ở meta do generated_utc, giữ metadata của bộ dữ liệu được chọn cùng các file đồng bộ, không trộn phiên bản phương pháp. Chưa thực hiện stage/commit/push/PR mới/merge trong lượt này.
