# Web local — snapshot 963333c

Mã nguồn, test và tài nguyên web lấy từ Nasa_prep tại commit `963333cb68e773706d68a4251d83eeb4daab5bb8`, không lấy từ working tree. Danh sách file, blob và hash: [provenance đợt 2](../docs/provenance/migration-web-local.md).

## Chạy local

Yêu cầu Node.js 24 và npm. Trong thư mục `web/`:

```sh
npm ci --ignore-scripts
npm test
npm run dev -- --host 127.0.0.1
```

Mở `/` cho cảnh 3D. Nút Map mở không gian bản đồ trong cùng tab; 3D world đưa về cảnh và camera đã giữ lại. Chọn một ô rồi dùng View this block in 3D để xem vị trí tương ứng. Đường dẫn `/map/` vẫn mở bản đồ trực tiếp. Build thử bằng `npm run build`; xem bản build bằng `npm run preview -- --host 127.0.0.1`. Không có script deploy trong bản migrate này. `dist/`, `node_modules/` và `public/data/` là output local được ignore, không phải file chuyển từ nguồn.

Thiết kế và bản đồ module hiện hành: [MAP-UX-001](../docs/plans/integrated-map.md). Full season đọc tổng kết mùa từ bộ xuất; kéo ngày chuyển sang trạng thái đã quan sát đến ngày đó. Ảnh thiếu dùng lần quan sát hợp lệ trước, có chú thích rõ. Các chỉ số trên thẻ ô luôn được ghi là bản ghi cả mùa.

## Dữ liệu và giới hạn

- Chỉ dùng bộ xuất công khai `data/sites.json` và `data/tan_hoi/` của đúng snapshot: 2.344 ô, 20 lần chụp, ba track, 11/8–27/10/2026. Đây là H4, chưa phải bản khóa cuối H7. Không chuyển raw granule, heldout hoặc dữ liệu private.
- `scripts/public-data-files.json` là danh sách 27 file công khai được phép đồng bộ. `predev`/`prebuild` kiểm đủ input trước khi tạo lại `public/data/`; không quét cả `data/`, không nhận symlink hoặc đường dẫn vượt root, không sinh fixture.
- Thiếu input bắt buộc làm lệnh đồng bộ thất bại. Khi dữ liệu runtime không tải được, 3D/bản đồ hiện lỗi rõ; 3D không dùng trạng thái trong scene thay cho contract.
- Snapshot không có `validation.json`, site Bang Rakam hoặc bản H7. Luồng 3D và `/map/` hiện không đọc `validation.json`, nên file này không chặn khám phá dữ liệu; nó vẫn là phần bắt buộc để hoàn thiện bộ xuất theo [contract đích](../docs/data-contract.md). Build và giao diện báo rõ chưa có kết quả validation. Không sinh số kiểm chứng/thống kê cho phần thiếu; chưa đạt bộ dữ liệu cuối đầy đủ.
- Nhà, cây, người, thời tiết và hạ tầng trong 3D là minh họa theo mô tả nguồn; không phải phép đo radar hay khảo sát thực địa. Giữ các manifest và notice tại `public/licenses/`, `public/models/`, `public/impostors/` và `public/scene/`.
- Ảnh nền vector của `/map/` có thể gọi OpenFreeMap; chức năng lưới và dữ liệu radar dùng file local. About the data trình bày phương pháp và giới hạn. Nút nghe theo ô chưa có implementation đã được bỏ khỏi giao diện. Chưa chuyển công cụ tái tạo asset hoặc pipeline S0–S7.

Lockfile giữ nguyên bytes từ nguồn. Các script deploy và fixture đã bỏ khỏi `package.json`; công cụ wrangler vẫn nằm trong dependency tree khóa sẵn nhưng không được gọi. Không đưa workflow deploy cũ sang repo này.

## Scientific views

/calendar/ shows the published nearest-hamlet water calendar, with keyboard inspection and full PNG export. /method/ reads the current acquisition method and documents limits, AI assistance and sources. Both are reachable inside the landscape/map without navigating away. The calendar groups blocks by nearest hamlet, not official boundaries.
