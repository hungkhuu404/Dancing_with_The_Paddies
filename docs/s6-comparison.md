# S6 — so sánh Tân Hội từ snapshot có sẵn

BANG-6 đưa code S6 của Bằng vào repo. Phép tính so sánh và S5 giữ nguyên; phương pháp pixel đã chọn sau khi xem DSWx nên đây là mức khớp hậu kiểm, không phải kiểm chứng độc lập hoặc độ chính xác thực địa. Không sửa contract, cấu hình site hay dữ liệu web trong task này.

## Môi trường

Python 3.11 trở lên, trong môi trường riêng:

```sh
python -m pip install -r requirements-s6.txt
python -I -m pytest -p no:cacheprovider -q tests/core tests/validate
```

`requirements-s6.txt` thêm dependency raster/biểu đồ đã pin trên nền `requirements.txt`. Runner S6 không gọi mạng hoặc cần token; reader DSWx là bước riêng, có cấu hình và Earthdata token riêng.

## Chạy lại S6 pixel

Chuẩn bị ngoài Git:

- Cube NISAR pixel NPZ và metrics CSV của cùng snapshot.
- NPZ DSWx có `cell_id`, `TD_utc`, `TD`, `valid`, `water`, `water13`; mã ô phải cùng tập với cube, có thể khác thứ tự. Nếu vẽ hình cần thêm `cell_bounds`.
- CSV BANG-2 có `cell_id`, `cropland_share`, `builtup_share`.
- `gate.json` lịch sử ghi mốc H3 và lần đầu đọc DSWx. Đây là bằng chứng lịch sử, không phải xác nhận độc lập cho phương pháp pixel.
- Entry PH-01 và validation H3 trước hiệu chỉnh nếu cần tái tạo đầy đủ lịch sử post-hoc.

Ví dụ từ gốc repo, với đầu vào local trong `runtime/`:

```sh
python -I pipeline/validate/run_s6.py \
  --cube runtime/pixel/tan_hoi_cube.npz \
  --metrics runtime/pixel/tan_hoi_metrics.csv \
  --dswx runtime/dswx/dswx_tan_hoi.npz \
  --landcover runtime/tan_hoi_landcover.csv \
  --gate runtime/h3/gate.json \
  --stable-cell-id E520000N1122500 \
  --posthoc-entry runtime/pixel/posthoc_PH-01.json \
  --before-validation runtime/h3/validation.json \
  --output-dir runtime/s6-check \
  --figures
```

Thư mục đầu ra phải mới hoặc rỗng. Runner từ chối ghi vào `data/` và `web/public/`, từ chối trùng mã ô, sai lưới, sai shape/mã trạng thái hoặc metrics không khớp cube/S5. Hai tham số post-hoc phải được dùng cùng nhau; không cung cấp thì `posthoc` rỗng, không tự khẳng định so sánh là độc lập. Mã ô đối chứng là tham số tùy chọn; không tự chọn ô khi chưa được xác nhận.

Đầu ra: `validation.json`, `input_snapshot.json` chứa SHA-256 của toàn bộ đầu vào và source runner/S5; thêm hai hình nội bộ khi có `--figures`. Timestamp được xuất UTC đuôi Z và giữ giây lẻ. Không ghi đè mốc gate gốc. Chỉ S7 ghép kết quả đã review vào `data/`; runner này không tự publish.

Kiểm bản tái tạo với bản đang dùng:

```sh
python -c "import json,pathlib; p=pathlib.Path; assert json.loads(p('runtime/s6-check/validation.json').read_text()) == json.loads(p('data/tan_hoi/validation.json').read_text())"
```

## Công cụ đọc dữ liệu và nội dung

- `dswx.py`: reader OPERA DSWx-S1; `landcover.py`: công cụ BANG-2. Các hàm tính và test được nhập từ code đã dùng local. Chúng nhận TOML reader riêng theo cấu trúc bàn giao Bằng (`site`, `grid`/`worldcover`, `search`, `thresholds`, `output`); không truyền trực tiếp TOML S1–S5 thiếu các trường reader. Trong bản tích hợp, đường dẫn cache, ranh và output của reader tính từ thư mục chứa TOML. Khi chuyển cấu hình cũ của Bằng cần cập nhật các đường dẫn tương đối, giữ nguyên tham số nghiệp vụ.
- `add_posthoc.py`: thêm entry và before/after, không cắt mất giây lẻ của mốc H3.
- `make_limits_text.py validation.json limits.md`: mặc định xuất Limits công khai không có điểm khớp DSWx. `--internal` xuất số cho nhóm; số thiếu hiển thị không có dữ liệu.
- Launcher zsh `run_bang7.sh` và gate tải cũ không được nhập: chúng gắn với cây thư mục máy riêng và phương pháp H3 cũ. Dùng CLI explicit-input ở trên cho snapshot pixel.

## Test BANG-1 lịch sử

```sh
python -I -m pytest -p no:cacheprovider -q tests/bang1/tests \
  --bang1-adapter pipeline/core/bang1_adapter.py --bang1-require-adapter
```

BANG-1 này kiểm các hàm theo spec H3 ban đầu. Nó không thay thế test phân loại pixel mới trong `tests/core/test_pixel_dual.py`. Test CSV BANG-2 thật chỉ chạy khi có cấu hình và dữ liệu local; một test bị skip khi chúng không có trong bản checkout. Không dùng fixture giả làm đầu ra web.

Bang Rakam vẫn cần thống nhất khung và snapshot NISAR tương ứng; runner hiện ghi các trường/bối cảnh Tân Hội, không được dùng để công bố kết quả Bang Rakam.
