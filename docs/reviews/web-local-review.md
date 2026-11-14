# Review migration/web-local trước commit

Ngày: 14/11/2026, giờ Việt Nam. Task: REVIEW-WEB-LOCAL-003. Actor/reviewer kỹ thuật: Codex. Người dùng yêu cầu review và hai commit local; không push/deploy. Tài khoản dùng cho author/committer: `AIVIETNAM-AIO-QP09`.

## Phạm vi và kết luận

Review toàn bộ file dự kiến đưa vào hai commit trên branch `migration/web-local`, từ baseline `aa262910fd8c73877a88688a4ee7b8c6c09e57e4`. Giữ nguyên 6 tài liệu đợt 1. README gốc được cập nhật ở đợt 2 để phản ánh đúng trạng thái, không giữ các tuyên bố tính năng chưa được migrate.

Không phát hiện secret, dữ liệu riêng, output build hoặc cấu hình deploy cũ trong tập file dự kiến commit. Cách kiểm gồm rà danh sách file, đối chiếu blob/hash nguồn, quét mẫu credential/private key/signed URL và đường dẫn máy trong bytes toàn bộ file; kiểm GLB không tham chiếu file/URL ngoài qua buffer/image URI. Đây là kết luận trong phạm vi kiểm tra, không phải bảo đảm mọi chuỗi tùy ý đều không thể là secret.

## Đối chiếu nguồn và provenance

- Snapshot duy nhất: `963333cb68e773706d68a4251d83eeb4daab5bb8`; `git cat-file` xác nhận commit tồn tại trong snapshot tách biệt; tree `0ba62247ccea7305437adb68bc90da6347b8a95c`.
- Kiểm lại từng dòng của bảng 303 file với `git ls-tree` và bytes `git cat-file blob` ở snapshot. Git blob, SHA-256 nguồn và hash đích khớp provenance; không lấy working tree hoặc origin/main cũ làm căn cứ.
- Sau các chỉnh sửa review: **293 file nguyên trạng, 10 file điều chỉnh**, có lý do trong [manifest](../provenance/migration-web-local.md). Lockfile nguyên trạng. Bảng cũng ghi hash của 3 file web viết mới và README gốc được sửa.
- Sáu tài liệu đợt 1 giữ nguyên bytes; các file baseline khác ngoài README giữ nguyên. Bộ hash đợt 1 vẫn là snapshot trước sửa README, không bị sửa để che khác biệt.
- Danh sách được chọn chỉ có source/test/config web, notice/manifest, tài nguyên minh họa và 27 file xuất công khai Tân Hội. Không có gói H* local, raw HDF5, private/heldout, secret hay lịch sử Git từ nguồn.
- `web/node_modules/`, `web/dist/`, `web/public/data/` được tạo local và ignore. Không stage chúng; kiểm lại index trước từng commit. Không có `.github/workflows/`, file cấu hình wrangler hoặc script deploy trong tập thay đổi. Wrangler trong lock/dependency tree được giữ để không thay lock, không được thực thi.

## validation.json có bắt buộc không?

**Không bắt buộc cho hai luồng web hiện đang dùng; vẫn thiếu so với contract dữ liệu hoàn chỉnh.**

- `web/src/data/load.js` đọc sites, meta, series và cells cho 3D; không đọc validation.
- `web/src/map/main.js` đọc sites, meta, cells, aoi, places, summary và lazy-load series; không đọc validation. Các hàm trạng thái/khoảng ngày không dùng số agreement/kappa.
- `docs/data-contract.md` mục 6 liệt kê validation cho bộ xuất đầy đủ và mục 6.7 mô tả kết quả S6. Không sửa contract để hợp thức hóa file thiếu.
- Allowlist sync chỉ gồm 27 file công khai có trong snapshot. Không tạo validation rỗng, điểm giả, file có các giá trị mặc định hay kết quả độc lập giả.
- Giữ cảnh báo khi build/sync; Sources của 3D và notice bản đồ thông báo kết quả validation chưa có. Không công bố số agreement hoặc gọi kết quả hiệu chỉnh là kiểm chứng độc lập.
- Phần Method and limits chưa hoàn chỉnh; không coi việc chạy được 3D/map là hoàn thành S6 hoặc bộ dữ liệu cuối.

## Sửa sau review

1. README gốc ghi rõ Bang Rakam, H7, pipeline S0–S7, schema và sonification chưa migrate. Bỏ lệnh cài pipeline trỏ requirements chưa có; sửa thông tin live site thành link đã có, không phải kết quả deploy của branch này.
2. Thêm thông báo chưa có validation trong HTML 3D/map; không thay logic phân loại hay payload dữ liệu.
3. Cập nhật provenance và báo cáo đợt 2 theo các hash sau review; giữ nguyên source revision và lockfile.

## Kiểm chứng

- Test sau sửa: **83/83 đạt**. Gồm ba ca sync: input thiếu không xóa output cũ, file ngoài danh sách không được copy, đường dẫn vượt phạm vi bị từ chối.
- Production build đạt. Còn cảnh báo JS chunk lớn hơn 500 kB; chưa tối ưu bundle trong tác vụ này.
- Smoke Edge desktop sau review đạt cho 3D và `/map/`: đổi mode/ngày, chọn ô/biểu đồ, thông báo validation nhìn thấy được; không có request đọc validation.json, pageerror hoặc HTTP local thất bại. Giả lập thiếu sites trên cả hai trang hiển thị lỗi, không sinh dữ liệu thay thế. Chờ hộp thoại đóng trước khi thử phím Home/End để không nhầm việc khôi phục focus bất đồng bộ với lỗi ứng dụng.
- Kiểm payload xuất: 2.344 cell ID duy nhất, 20 acquisition; chuỗi và các mảng cùng độ dài, đường dẫn backdrop tồn tại và tổng diện tích nhất quán. Không phải kiểm chứng khoa học độc lập hay kiểm tra schema đầy đủ.
- Không cài lại dependency vì lock không đổi; kiểm bằng dependency đã cài đúng lockfile từ đợt 2.
- Kiểm whitespace phát hiện một dòng trắng cuối `web/src/world/structures.js` đã có nguyên trạng trong blob nguồn. Giữ để bảo toàn provenance; không ảnh hưởng runtime và không là lỗi chặn commit. Không có lỗi whitespace khác khi loại riêng cảnh báo EOF này.

## Danh tính và cách tạo commit

`gh api user` xác nhận tài khoản đang đăng nhập là `AIVIETNAM-AIO-QP09`, ID `214236901`. GitHub API của commit nguồn `f9a6528403d7a8979d45a5865f98a69daa364c54` liên kết author đó với email `quoc.phamilovebk@hcmut.edu.vn`. Đây là đối chiếu tài khoản/email qua GitHub, không phải tuyên bố commit có chữ ký GPG.

Dùng danh tính đã đối chiếu qua cấu hình riêng của từng lệnh commit; không đổi Git global, không dùng danh tính coordinator hoặc agent. Không đặt `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`, không lùi ngày về thời gian source. Commit message ghi revision kế thừa và actor Codex riêng, không thêm agent vào author/committer hoặc Co-authored-by.

Commit 1 chỉ gồm 6 tài liệu đợt 1. Commit 2 gồm ứng dụng/tài nguyên công khai, test, tài liệu đợt 2/review và sửa README. Hash/thời gian chính xác được Git ghi khi tạo, không tự tham chiếu hash commit trong tài liệu nằm trong chính commit đó.

Commit tài liệu đợt 1: `91fc92d3514536f1e783b57e219d7adc8fe7ab94`, author/committer time thực tế `2026-11-14T13:12:12+07:00`; index đã kiểm chỉ có đúng 6 tài liệu và bytes staged trùng bản chuẩn bị.

## Giới hạn còn lại

Chưa có validation.json, Bang Rakam, H7, pipeline S0–S7, schema/pipeline tests, công cụ tái tạo asset, sonification dữ liệu hay narration tùy chọn. Chưa nghiệm thu mobile/mọi GPU, hiệu năng chuẩn hoặc ghi video/âm thanh hoàn chỉnh. Ảnh nền vector có thể cần OpenFreeMap; 3D là minh họa. Chưa push hoặc deploy.

Kết luận review: đạt phạm vi migration web local để tạo hai commit đã được giao; không còn phát hiện chặn commit trong phạm vi kiểm tra. Các giới hạn trên được giữ công khai và không được diễn giải là tính năng đã hoàn tất.
