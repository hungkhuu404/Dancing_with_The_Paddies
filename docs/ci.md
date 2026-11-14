# CI web chỉ kiểm thử và build

Task: CI-WEB-001. Actor: Codex. Consumer: người review PR và nhóm web. Workflow: `.github/workflows/web-ci.yml`.

- Chạy khi mở, cập nhật hoặc mở lại PR vào `main`, và khi push vào `main`. Không lọc path để thay đổi dữ liệu, lockfile hoặc tài liệu đều có kết quả check.
- Ubuntu runner, Node.js 24, cài bằng `npm ci --ignore-scripts` theo `web/package-lock.json`, rồi chạy `npm test` và `npm run build`. Actions checkout/setup-node được cố định bằng SHA đã đối chiếu với repo chính thức.
- Chỉ cấp `contents: read`; không lưu credential checkout, không dùng cache, environment, secret, artifact upload hoặc deploy. Không dùng `pull_request_target` hay tự merge.
- Trước test/build, `web/scripts/verify-public-data.mjs` xác nhận từng input trong danh sách 27 file công khai là regular file tracked và khớp blob `HEAD` theo quy tắc text của Git. Không đọc từ repo nguồn hoặc đường dẫn máy cá nhân.
- Sau build, cùng script kiểm danh sách và SHA-256 của cả `public/data/` và `dist/data/` trùng chính xác input đã kiểm; phát hiện file thừa, thiếu hoặc nội dung thay đổi. Script chỉ đọc, không tạo dataset.
- `validation.json` vẫn chưa có. CI in thông báo thiếu, không tạo điểm hoặc dữ liệu validation giả. Bang Rakam, H7 và pipeline chưa migrate; check web xanh không chứng minh các phần này hoàn tất.

Chạy kiểm tương đương từ thư mục `web/`:

```sh
npm ci --ignore-scripts
node scripts/verify-public-data.mjs
npm test
npm run build
node scripts/verify-public-data.mjs --output public/data --output dist/data
```

CI không dùng output local có trước: checkout của runner chỉ chứa file tracked, npm cài dependency mới và prebuild đồng bộ lại bộ công khai được phép. Test/build ở checkout sạch local và kết quả GitHub Actions được kiểm riêng; trạng thái CI thực tế xem check của PR.

## Kiểm local trước commit

Đã tạo checkout tách biệt từ commit `870d587`, không có node_modules/dist/public-data có trước; chỉ bổ sung script kiểm tra mới. Node 24.19.0, cài mới 79 package từ lock qua npm ci, **83/83 test đạt**, production build đạt. Cả 27 input đều khớp Git HEAD; hai thư mục output khớp danh sách và bytes của input. Không cần thư mục Nasa_prep hay đường dẫn máy cá nhân.

Trên bản kiểm thử tách biệt, đã thử đổi input chưa commit, đổi nội dung file output và thêm file output ngoài danh sách: cả ba bị từ chối, sau khôi phục thì kiểm tra đạt. Không sửa dataset trong checkout sản phẩm để thử các ca này. Build vẫn có cảnh báo bundle lớn; không phải lỗi CI hoặc xác nhận phần dữ liệu còn thiếu đã hoàn tất.
