# Kế hoạch migration từng phần

Cập nhật 14/11/2026, giờ Việt Nam. Task đợt hiện tại: MIG-01. Actor: Codex. Human owner/reviewer: chưa xác định. Consumer: nhóm duy trì repo sản phẩm và nhóm dữ liệu/giao diện.

## Baseline và phạm vi

Checkout đích là repo `hungkhuu404/Dancing_with_The_Paddies`, branch `main`, baseline `aa262910fd8c73877a88688a4ee7b8c6c09e57e4`, sạch trước thay đổi. Không đổi vị trí checkout, branch hoặc remote.

Nguồn đã chọn: Nasa_prep main trên GitHub tại `963333cb68e773706d68a4251d83eeb4daab5bb8`, đã gồm [PR #15](https://github.com/hungkhuu404/Nasa_prep/pull/15). Local `origin/main` ở `608a248`, còn checkout nguồn `quoc/real-data` ở `6880147`; không lấy hai mốc cũ làm phiên bản UI hiện hành. Chi tiết đối chiếu tại [manifest](../provenance/migration-manifest.md).

Kế hoạch này biên tập từ bộ chuẩn bị trước khi có checkout đích. Những kết luận cũ về việc chưa có checkout chỉ là lịch sử; repo đích hiện đã có README, MIT LICENSE, khung pipeline và [contract riêng](../data-contract.md). Không nhập bản tóm tắt `contracts.md` cũ để tạo nguồn chuẩn thứ hai.

Đợt 1 chỉ thêm cấu trúc tài liệu, hướng dẫn và provenance. Không chuyển code ứng dụng, schema/validator, dữ liệu/fixture/asset, dependency, workflow hoặc cấu hình deploy. Giữ nguyên mọi file đã có. Chưa commit, push, merge hoặc deploy.

## Nguồn kế thừa và cách xử lý

Đường dẫn nguồn tính từ Nasa_prep; đích tính từ root repo sản phẩm. Mọi đợt sau phải kiểm lại revision và phạm vi được giao trước khi làm.

| Phần | Nguồn kế thừa | Đích / quyết định |
| --- | --- | --- |
| Quy tắc và tài liệu | `AGENTS.md`, tài liệu contract, bản đồ codebase | Viết chọn lọc `AGENTS.md`, `docs/README.md`, kế hoạch và manifest; không copy quyền, lịch thi, task hoặc dữ liệu điều phối cũ |
| Cấu hình text/ignore | `.editorconfig`, `.gitattributes`, `.gitignore` | Repo đích đã có; giữ nguyên, không ghi đè bằng bản nguồn |
| Contract/schema | `docs/contracts.md`, `docs/specs/spec_backend111126.md` mục 5/5.8; các schema trong H1B là ứng viên local chưa được duyệt | `docs/data-contract.md` hiện có là chuẩn. Đợt schema sau phải đối chiếu từng khóa, dùng `schema/` số ít theo cấu trúc đích; không tự nhập cả H1B |
| Reader và logic | `web/src/map/contract.js`, `web/src/data/`, `web/test/` tại revision đã chọn | Hoãn. Kiểm các phụ thuộc Three.js, thời gian, missing, ánh xạ ô/thửa và test tương ứng |
| Bản đồ và web | `web/package.json`, lock, Vite, `web/src/map/`, `web/map/`, `web/src/main.js` và import graph | Hoãn. Giữ `web/` khi chuyển sau này; không coi vài module rời là ứng dụng chạy được |
| UI sau PR #15 | `web/src/ui/{chrome,motion,blockSummary}.js`, `liquid.css`, các module UI/world/map liên quan | Hoãn. Dùng phiên bản đã merge; `web/src/world/fieldSign.js` đã bị xóa, không khôi phục từ checkout nguồn cũ |
| Scene, asset và generator | `web/public/{scene,models,impostors,licenses}/`, `web/tools/` | Hoãn. Chọn từng file sau kiểm giấy phép/provenance; đầu vào thiếu hoặc riêng không được chuyển. Không chạy generator vào nguồn |
| Dữ liệu xuất web | `data/` ở revision được chọn; gói H* chỉ là ứng viên local | Hoãn. Cần nhóm dữ liệu xác nhận bản khóa và quyền chia sẻ; không mặc định H4 là H7 hoặc số hiệu chỉnh là kiểm chứng độc lập |
| Đồng bộ dữ liệu | `web/scripts/sync-data.mjs`, các script fixture | Hoãn. Không giữ copy toàn khối dữ liệu hoặc fallback giả trong build sản phẩm; thiếu input hợp lệ phải báo rõ |
| CI/deploy | `.github/workflows/web.yml` | Không chuyển đợt 1; sau này thiết kế test/build riêng, không nhập project/host/secret/nhánh preview cũ |

## Các đợt và điều kiện nghiệm thu

| Task | Phụ thuộc | Đầu ra / consumer | Điều kiện hoàn thành |
| --- | --- | --- | --- |
| MIG-00 | Có checkout và truy cập bằng chứng nguồn | Baseline cho nhóm migration | Root/branch/remote/dirty đã kiểm; revision nguồn được chốt. Hoàn tất đối chiếu trong đợt 1 |
| MIG-01 | MIG-00 | Cấu trúc tài liệu và provenance cho cả đội | Thêm tài liệu, ghi hash và nguồn; mọi file baseline giữ nguyên; không lẫn nội dung ngoài phạm vi. Đã thực hiện, chưa commit hoặc review người |
| MIG-02 | Được giao đợt logic/schema; MIG-01 | Reader, validator/schema và test cho hai nhóm | Contract đích được bảo toàn; test null/missing, đơn vị, ngày UTC/site, khoảng ngập và mã ô; không dùng dữ liệu riêng |
| MIG-03 | MIG-02; dependency/lock được rà | `/map/` cho nhóm giao diện | Cài mới từ lock vào đích; test/build và smoke timeline/chọn ô/lỗi tải/bàn phím. Nếu chưa có data được duyệt thì ghi chặn tích hợp, không giả kết quả |
| MIG-04 | MIG-02; người phụ trách dữ liệu duyệt bản xuất | Bộ dữ liệu công khai cho map/3D/âm thanh | Schema, cross-file ID, độ dài chuỗi, đơn vị, ảnh nền và tổng diện tích hợp lệ; manifest từng file, bản khóa rõ ràng. Có thể chuẩn bị song song MIG-03 |
| MIG-05 | MIG-03, MIG-04; asset được duyệt | Root 3D và UI sau PR #15 | Đủ import/asset; test và smoke high/low/reduced motion/WebGL fallback; map/3D cùng nguồn trạng thái. Kết quả QA nguồn chỉ là tham khảo |
| MIG-06 | App và công cụ đã được giao | Tool portable, CI test/build cho người bảo trì | Khai báo input/output; generator chỉ ghi vùng thử, thiếu input ghi rõ. Không deploy hoặc sao chép secret |
| MIG-07 | Các đợt được chọn đã kiểm | Bàn giao cho người review | Diff, hash, attribution/license và giới hạn rõ; không lẫn secret/dữ liệu riêng/cache/dependency vendor |

Owner các đợt tiếp theo chưa được xác định; kế hoạch không tự phân công hoặc cấp quyền thực thi. Stub chỉ dùng khi được giao rõ cho test và không chứa input thật chưa duyệt. Merge, commit, push và deploy cần quyền riêng; đợt này dừng ở thay đổi local để review.

Rollback theo từng file bổ sung/thay đổi đã ghi trong manifest, sau kiểm dirty work mới. Không reset cả repo hoặc can thiệp nguồn cũ. Bước tiếp theo là review đợt 1 và chọn phạm vi đợt 2; chưa chạy cài dependency hoặc test ứng dụng.
