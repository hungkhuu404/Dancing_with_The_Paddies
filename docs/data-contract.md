# Hợp đồng dữ liệu (CONTRACT-001, bản 2.0.0)

Hợp đồng giữa nhóm dữ liệu và nhóm giao diện. Bản 2.0.0 thay nghĩa phân loại và lọc ở mục 4, đồng thời bổ sung metadata phương pháp. Bộ dữ liệu web hiện hành dùng phương pháp pixel; snapshot H3 cũ được giữ trong lịch sử Git để đối chiếu, không gọi bản pixel là H3.

## Tóm tắt

| Nhóm | Nội dung |
| --- | --- |
| Interface | File tĩnh, UTF-8, không cần máy chủ: `data/sites.json` và thư mục `data/{site}/` (mục 6) |
| Bên ghi | S1–S5 (`pipeline/core/`), S6 (`pipeline/validate/`), S7 xuất cho web (`pipeline/export/`). Chỉ người phụ trách S7 commit vào `data/` |
| Bên đọc | Web (`web/`), âm thanh (`web/src/sound/`), video, slide, trang Project |
| Ô và mã | Ô vuông 250 m, mã `E{x}N{y}` theo góc tây nam trong hệ UTM của site; mỗi feature có thêm `id` số nguyên |
| Đơn vị | Tên khóa tiếng Anh `snake_case`, đơn vị nằm trong tên (`_db`, `_ha`, `_days`). HH, HV trong `series.json` là dB nhân 10, làm tròn |
| Thời gian | `acq_utc` theo UTC; `date_local` theo giờ địa phương của site, là ngày web và video hiển thị |
| Thiếu dữ liệu | `null`. Không dùng `NaN`, `-9999` hay chuỗi rỗng. Web không hiện "null" hay "NaN"; file tải lỗi thì hiện một dòng báo |
| Cấu hình | Pipeline: một file TOML cho mỗi site trong `config/sites/`, không viết cứng tọa độ hay ngưỡng. Web: đọc `data/sites.json`; thêm site không sửa code |
| Secret | Token Earthdata nằm trong file ngoài repo; code đọc đường dẫn từ biến môi trường `EARTHDATA_TOKEN_FILE`. Không in, không ghi log, không commit |
| Kiểm tương thích | JSON Schema cho mọi file trong `schema/`; giới hạn dung lượng ở mục 7 |

## 1. Nguyên tắc chung

- File tĩnh, UTF-8, không cần máy chủ.
- Tên khóa bằng tiếng Anh, kiểu `snake_case`. Đơn vị nằm trong tên khóa: `_db`, `_ha`, `_days`.
- Giá trị thiếu ghi `null`. Không dùng `NaN`, `-9999` hay chuỗi rỗng. Khi ghi JSON bằng Python phải đặt `allow_nan=False`.
- Tên file viết thường, không dấu. Ngày trong tên file viết `YYYYMMDD` theo giờ địa phương của site.
- Mã site: `tan_hoi`, `bang_rakam`.

## 2. Lưới và mã ô

- **Hệ tọa độ tính toán:** UTM của site. Tân Hội dùng EPSG:32648; Bang Rakam dùng EPSG:32647.
- **Ô:** vuông 250 m, tức 6,25 ha. Góc tây nam của mỗi ô nằm ở bội số của 250 m theo cả hai trục.
- **Ô thuộc vùng thử** khi tâm ô nằm trong ranh xã. Tân Hội có 2.344 ô, tức 14.650 ha (đếm trên ranh OSM).
- **Mã ô:** `E{x}N{y}`, với x và y là tọa độ góc tây nam tính bằng mét. Ví dụ `E519250N1121000`. Mã không đổi khi chạy lại.
- **Tọa độ xuất cho web:** EPSG:4326, thứ tự kinh độ rồi vĩ độ, 6 chữ số thập phân.

## 3. Thời gian và múi giờ

- **`acq_utc`:** thời điểm chụp theo UTC, dạng `2026-10-27T11:23:21Z`.
- **`date_local`:** ngày theo giờ địa phương của site, dạng `2026-10-27`. Tân Hội: Asia/Ho_Chi_Minh (UTC+07:00). Bang Rakam: Asia/Bangkok (UTC+07:00). Web và video hiển thị ngày này.
- **Lưu ý track 083 A:** `date_local` trễ một ngày so với ngày UTC.
- **Khoảng thời gian:** tính từ hiệu hai `acq_utc`, đơn vị ngày, giữ 1 chữ số thập phân.

## 4. Trạng thái của một ô ở một lần chụp

| Ký hiệu | Nghĩa | Điều kiện |
| --- | --- | --- |
| `W` | Tín hiệu nước theo quy tắc pixel | Ô hợp lệ, ít nhất 75% pixel hợp lệ đồng thời có HH và HV thấp hơn ngưỡng của ảnh |
| `N` | Không thấy nước mặt | Ô hợp lệ và không thỏa điều kiện `W` |
| `-` | Không có dữ liệu | Ô không hợp lệ ở lần chụp đó (ngoài dải quét hoặc bị che) |

- **Ngưỡng mặc định (quy tắc Q0):** HH < −14 dB và HV < −20 dB, áp cho mọi track.
- **Ngưỡng dự phòng (quy tắc Q1):** ngưỡng của mỗi track bằng mực nước tham chiếu của chính track đó cộng 3 dB, cho cả hai kênh. Chỉ dùng cho track không đạt phép kiểm P1.
- **Ba phép kiểm ở S3**, ghi vào `reference.json` cho từng track, kể cả khi không đạt:
  - P1: trung vị mực nước tham chiếu thấp hơn ngưỡng ít nhất 2 dB ở cả HH và HV. Track không đạt chuyển sang Q1.
  - P2: độ lệch chuẩn theo thời gian của vùng ổn định không quá 0,5 dB.
  - P3: trên vùng ổn định, ảnh bản P05036 lệch không quá 3 lần độ lệch chuẩn so với trung bình các ảnh P05023 cùng track. Không đạt thì ảnh P05036 dùng ngưỡng Q1 tính riêng.
- **Quy tắc pixel:** HH và HV phải hợp lệ cùng vị trí, hữu hạn, dương; GCOV `mask` phải từ 1 đến 254 (0 không fully focused, 255 ngoài ảnh). So từng pixel với ngưỡng HH/HV của ảnh, trên công suất tuyến tính. Ô 250 m cần đủ lưới 25×25 vị trí và tối thiểu 438/625 pixel hợp lệ. Tính tỷ lệ pixel cùng dưới hai ngưỡng trên tổng pixel hợp lệ; tỷ lệ ≥75% là `W`, còn lại là `N`. Không đủ điều kiện là `-`. HH/HV trung bình ô vẫn xuất để tham khảo, không dùng trực tiếp để suy ra `W`. Bản Tân Hội v2 20 ảnh trước đây chưa áp GCOV mask; đây là sửa lỗi định nghĩa hợp lệ và cần được review cùng dữ liệu xuất lại.
- **Lọc hai mức:** xếp các lần chụp hợp lệ theo thời gian, gộp mọi track và lọc singleton trên chuỗi thô 75%. Với `W-N-W`, chỉ đổi `N` thành `W` nếu lần giữa có tỷ lệ pixel nước ≥50%; nếu dưới 50% giữ `N`. Với `N-W-N`, vẫn đổi `W` thành `N`. Lần đầu, cuối và thiếu giữ nguyên.
  - **Luôn so trên chuỗi thô, xét mọi vị trí cùng lúc.** Không sửa tại chỗ rồi dùng giá trị vừa sửa để xét vị trí kế tiếp. Với các `N` có tỷ lệ ≥50%, ví dụ `NNWNWW` thành `NNNWWW`.
- File xuất có cả chuỗi thô 75% (`s_raw`) và chuỗi đã lọc hai mức (`s`). Chỉ số tính trên chuỗi đã lọc. Phương pháp chọn sau khi đã xem DSWx, vì vậy là **post-hoc**, không phải kiểm chứng độc lập. DSWx không phải ground truth; ảnh thưa không chứng minh ngập liên tục.

## 5. Chỉ số mỗi ô

**Đợt ngập** là một dãy liên tiếp các lần chụp hợp lệ có trạng thái `W`. **Đợt chính** là đợt bắt đầu muộn nhất.

Mỗi track chụp lại sau 12 ngày, nên không biết chính xác ngày nước vào hay ngày nước rút. Hợp đồng ghi **hai mốc chặn** thay cho một ngày:

| Khóa | Nghĩa |
| --- | --- |
| `onset_after_local` | Ngày chụp cuối cùng còn chưa thấy nước, ngay trước đợt chính. `null` nếu ô đã có nước từ ảnh đầu |
| `onset_by_local` | Ngày chụp đầu tiên thấy nước của đợt chính. Nước vào trong khoảng sau `onset_after_local` và không muộn hơn ngày này |
| `end_after_local` | Ngày chụp cuối cùng còn thấy nước của đợt chính. `null` nếu ô còn nước ở ảnh cuối |
| `end_by_local` | Ngày chụp đầu tiên không còn thấy nước sau đợt chính. `null` nếu ô còn nước ở ảnh cuối |
| `flood_days_min` | Khoảng ngày giữa lần W đầu và cuối của đợt chính. Cách diễn giải là ngập liên tục phụ thuộc giả định giữa các ảnh; quan sát thưa không tự chứng minh liên tục |
| `flood_days_max` | Số ngày ngập nhiều nhất: từ `onset_after` đến `end_by`. Nếu còn nước thì tính đến ảnh cuối của ô. `null` nếu không có `onset_after` |
| `ongoing` | `true` nếu ô còn nước ở ảnh cuối. Khi đó hai số ngày ngập là "tính đến ảnh cuối" |
| `status` | Một trong 5 giá trị ở bảng dưới |
| `status_confirmed` | `true` nếu trạng thái ở ảnh cuối của ô trùng với ảnh hợp lệ ngay trước. `false` nghĩa là mới thấy ở một lần chụp |
| `flag_gt30` | Một trong 4 giá trị ở bảng dưới |
| `last_obs_local` | Ngày chụp hợp lệ cuối cùng của ô |
| `n_obs`, `n_tracks`, `max_gap_days` | Số lần chụp hợp lệ, số track, khoảng trống dài nhất giữa hai lần chụp hợp lệ |
| `n_episodes` | Số đợt ngập trong cửa sổ quan sát |
| `cropland` | `true` nếu ít nhất 50% ô là đất canh tác theo ESA WorldCover 2021 |
| `nearest_hamlet` | Tên ấp gần nhất theo điểm trên OSM. Chỉ là nhãn, không phải ranh |

**Giá trị của `status`:**

| Giá trị | Điều kiện | Câu hiển thị gợi ý |
| --- | --- | --- |
| `never_water` | Không lần chụp nào là `W` | No open water seen |
| `flooded` | Lần chụp hợp lệ cuối là `W`, trước đó có ít nhất một lần `N` | Still under water as of (ngày ảnh cuối) |
| `water_gone` | Có đợt ngập, lần chụp hợp lệ cuối là `N` | Open water no longer seen since (khoảng ngày) |
| `always_water` | Mọi lần chụp hợp lệ đều là `W` | Water in every image (canal, pond, or flooded all season) |
| `no_data` | Ít hơn 4 lần chụp hợp lệ | Not enough images |

**Thứ tự xét `status`:** `no_data` trước, rồi `never_water`, `always_water`, `flooded`, `water_gone`. Ô có 3 lần chụp hợp lệ, cả 3 là `W`, vẫn là `no_data`.

**Giá trị của `flag_gt30`** (ngập trên 30 ngày trước vụ; chỉ xét ô `cropland`):

| Giá trị | Điều kiện |
| --- | --- |
| `yes` | `flood_days_min` lớn hơn 30 |
| `possible` | Chưa đạt `yes`, nhưng ô còn nước, hoặc `flood_days_max` lớn hơn 30 hoặc là `null` |
| `no` | Đợt ngập đã kết thúc và `flood_days_max` không quá 30 |
| `na` | `status` là `never_water`, `always_water`, `no_data`, hoặc ô không phải đất canh tác |

**Cách nói về lớp trên 30 ngày:**

- Luôn kèm "nếu áp dụng hệ số IPCC". Theo IPCC 2019, Bảng 5.13: ngập trước vụ trên 30 ngày có hệ số 2,41 (khoảng 2,13–2,73); không ngập dưới 180 ngày là 1,00; thiếu dữ liệu thì dùng số gộp 1,22.
- Hệ số này áp cho phát thải trong vụ lúa kế tiếp. IPCC ghi rõ nó không dùng để tính phát thải trong chính thời gian ngập.
- Dữ liệu không cho biết ô đó có gieo vụ kế tiếp ngay sau hay không.

## 6. Danh sách file

Mọi file nằm trong `data/{site}/`, trừ `data/sites.json`. Dữ liệu cho web đặt ở `data/` gốc repo, không đặt ở `web/public/data/`: `web/scripts/sync-data.mjs` xóa và tạo lại thư mục đó mỗi lần `dev` hoặc `build`.

| File | Nội dung | Ai dùng |
| --- | --- | --- |
| `data/sites.json` | Danh sách site: mã, tên, khung, tâm bản đồ, EPSG | Web (đổi site) |
| `meta.json` | Phiên bản, thời điểm tạo, danh sách lần chụp (mỗi lần kèm ngưỡng đã dùng và tên ảnh nền), bốn góc của ảnh nền, nguồn dữ liệu | Web, trang Project |
| `cells.geojson` | Mỗi ô một polygon, thuộc tính là các chỉ số ở mục 5 | Bản đồ |
| `series.json` | Chuỗi trạng thái và HH, HV của từng ô theo từng lần chụp | Biểu đồ một ô, nút "nghe", chế độ xem theo lần chụp, bảng lịch nước |
| `summary.json` | Số gộp toàn xã theo từng lần chụp (`passes`) và số tổng của bản dữ liệu (`totals`) | Âm thanh, chú giải, video, slide, trang Project |
| `validation.json` | Số so với DSWx-S1 (S6) | Web, slide, trang Project |
| `aoi.geojson`, `places.geojson` | Ranh xã và điểm tên ấp, lấy từ OSM. Thuộc tính `name` của mỗi điểm phải trùng từng ký tự với `nearest_hamlet` trong `cells.geojson` | Bản đồ |
| `backdrop/{YYYYMMDD}_{track}_hh.webp` | Ảnh HH thang xám, thang cố định từ −25 đến −5 dB, ô lưới 20 m, WebP chất lượng 75, vùng không có dữ liệu để trong suốt. `{track}` viết thường, ví dụ `20261027_047d_hh.webp` | Nền bản đồ, video |

### 6.1. `data/sites.json`

`bounds` theo thứ tự tây, nam, đông, bắc.

```json
{"sites": [{"id": "tan_hoi", "name": "Tân Hội", "region": "An Giang, Vietnam", "epsg": 32648,
            "center": [105.186, 10.143], "bounds": [105.105, 10.069, 105.267, 10.216], "default": true}]}
```

### 6.2. `meta.json` (rút gọn)

```json
{
  "contract_version": "2.0.0",
  "site": "tan_hoi",
  "generated_utc": "2026-11-14T03:10:00Z",
  "timezone": "Asia/Ho_Chi_Minh",
  "grid": {"epsg": 32648, "cell_m": 250, "n_cells": 2344},
  "method": {"rule": "Q0", "hh_db_max": -14.0, "hv_db_max": -20.0, "single_flip_filter": true,
             "frozen_utc": null, "classification": "pixel_fraction_75_dual_50",
             "water_fraction": 0.75, "fill_min_fraction": 0.5, "joint_valid_fraction": 0.7,
              "selection_status": "post_hoc", "valid_mask": "gcov_fully_focused_1_254"},
  "acquisitions": [
    {"i": 0, "acq_utc": "2026-08-11T11:31:41Z", "date_local": "2026-08-11", "track": "148D",
     "frame": "083", "crid": "P05023", "valid_share": 0.86,
     "rule": "Q0", "hh_db_max": -14.0, "hv_db_max": -20.0,
     "backdrop": "backdrop/20260811_148d_hh.webp"}
  ],
  "backdrop": {"db_min": -25.0, "db_max": -5.0,
               "corners": [[105.099978, 10.210066], [105.260124, 10.209978],
                           [105.260019, 10.079919], [105.099937, 10.080007]]},
  "sources": ["NISAR L2 GCOV (NASA/ISRO), ASF DAAC", "OPERA DSWx-S1 (NASA JPL)",
              "ESA WorldCover 2021", "OpenStreetMap contributors (ODbL)"]
}
```

- **`contract_version` chỉ nằm trong `meta.json`**, không lặp ở các file khác.
- **`acquisitions` xếp theo `acq_utc` tăng dần.** `i` là vị trí trong danh sách này; mọi chuỗi trong `series.json` và `summary.json` dùng cùng thứ tự. Web lấy số lần chụp và danh sách track từ đây, không viết cứng số lần chụp hay số track.
- **`valid_share`:** tỉ lệ ô của xã hợp lệ ở lần chụp đó.
- **`rule`, `hh_db_max`, `hv_db_max` của từng lần chụp:** ngưỡng thật đã dùng cho lần đó. Khối `method` chỉ ghi mặc định. Cần vậy vì Q1 đặt ngưỡng riêng cho một track, và ảnh bản P05036 có thể có ngưỡng riêng (phép kiểm P3). Web vẽ đường ngưỡng theo từng lần chụp.
- **`method.valid_mask`:** `gcov_fully_focused_1_254` khi bộ xuất đã áp mask GCOV. Metadata v2 cũ không có trường này không chứng minh mask đã được áp.
- **`backdrop` của từng lần chụp:** đường dẫn ảnh nền, tính từ `data/{site}/`. Web không tự ghép tên file.
- **`backdrop.corners`:** bốn góc của ảnh nền theo kinh độ, vĩ độ, thứ tự trên trái, trên phải, dưới phải, dưới trái. Đây là thứ tự MapLibre cần để đặt ảnh lên bản đồ. Mọi ảnh nền của một site dùng chung một khung. Khung UTM lệch so với hướng bắc khoảng 10 m trên 17,5 km, nên đặt ảnh theo bốn góc là đủ.
- **`skipped`:** danh sách lần chụp có trong `catalog.csv` nhưng không đưa vào `acquisitions`. Không có lần nào bị loại thì ghi `[]`. Mỗi phần tử gồm:
  - `acq_utc`, `track`, `frame`, `crid`: như trong `acquisitions`.
  - `granule`: tên file `.h5`, không kèm link.
  - `reason`: một trong ba giá trị `read_error` (đọc lỗi sau khi đã thử lại), `missing_hv` (ảnh thiếu HV, ví dụ chế độ SHSH), `other`.
  - `detail`: chỉ ghi tên loại lỗi, ví dụ `TimeoutError`. Không ghi link hay thông báo lỗi gốc, vì có thể chứa link đã ký.
  - Ví dụ: `{"acq_utc": "2026-11-08T11:23:20Z", "track": "047D", "frame": "083", "crid": "P05036", "granule": "NISAR_L2_PR_GCOV_…_001.h5", "reason": "read_error", "detail": "TimeoutError"}`.

### 6.3. `cells.geojson` (phần `properties` của một ô)

```json
{
  "cell_id": "E519250N1121000",
  "status": "flooded", "status_confirmed": true, "ongoing": true,
  "onset_after_local": "2026-09-09", "onset_by_local": "2026-09-12",
  "end_after_local": null, "end_by_local": null,
  "flood_days_min": 45.5, "flood_days_max": 48.0,
  "flag_gt30": "yes", "cropland": true,
  "last_obs_local": "2026-10-27", "n_obs": 20, "n_tracks": 3, "max_gap_days": 5.0,
  "n_episodes": 1, "nearest_hamlet": "Tân Tiến"
}
```

Mỗi feature có thêm `id` là số nguyên (thứ tự của ô sau khi xếp theo `cell_id`), đặt ở cấp feature. Web cần nó để đổi màu từng ô mà không tải lại lớp bản đồ. `cell_id` vẫn là khóa ổn định giữa các file.

### 6.4. `aoi.geojson` và `places.geojson`

Tọa độ theo EPSG:4326, như mọi file xuất cho web.

| File | Cấu trúc | Thuộc tính |
| --- | --- | --- |
| `aoi.geojson` | FeatureCollection có đúng 1 feature, Polygon hoặc MultiPolygon | `site` (`tan_hoi`); `name` (`Tân Hội`); `osm_relation` (số nguyên, 15449921); `area_ha` (diện tích tính trong hệ UTM của site, 1 chữ số thập phân) |
| `places.geojson` | FeatureCollection, mỗi ấp một Point. Chỉ giữ điểm nằm trong ranh xã | `name` (trùng từng ký tự với `nearest_hamlet`); `osm_id` (chuỗi dạng `node/123456`) |

- Nguồn điểm ấp: các node OSM có `place=village` hoặc `place=quarter`. Lọc theo ranh xã thì Tân Hội còn đúng 24 điểm (dữ liệu OSM tải ngày 10/11/2026).

### 6.5. `series.json`

Chỉ số `i` trùng với `acquisitions` trong `meta.json`. HH và HV ghi bằng dB nhân 10, làm tròn thành số nguyên.

```json
{
  "cells": {
    "E519250N1121000": {
      "s": "NNNNNNNNWWWWWWWWWWWW",
      "s_raw": "NNNNNNNNWWWWWNWWWWWW",
      "hh": [-91, -88, -95, null],
      "hv": [-172, -168, -180, null]
    }
  }
}
```

### 6.6. `summary.json` (rút gọn)

```json
{
  "passes": [
    {"i": 8, "date_local": "2026-09-12", "track": "083A", "valid_ha": 14650.0,
     "water_ha": 2900.0, "new_water_ha": 1100.0, "water_gone_ha": 0.0,
     "asof_obs_ha": 14650.0, "asof_water_ha": 2900.0}
  ],
  "totals": {
    "n_cells": 2344, "area_ha": 14650.0, "last_obs_local": "2026-10-27",
    "status_ha": {"flooded": 7000.0, "water_gone": 500.0, "never_water": 6000.0,
                  "always_water": 150.0, "no_data": 1000.0},
    "gt30_ha": {"yes": 4000.0, "possible": 2500.0, "no": 300.0, "na": 7850.0}
  }
}
```

**Các khóa của `passes`,** tính trên chuỗi đã lọc `s`. Mỗi ô là 6,25 ha.

| Khóa | Nghĩa |
| --- | --- |
| `valid_ha` | Diện tích các ô hợp lệ ở lần chụp `i` |
| `water_ha` | Diện tích các ô có `s[i]` là `W` |
| `new_water_ha` | Diện tích các ô có `s[i]` là `W`, và lần chụp hợp lệ ngay trước của chính ô đó là `N` |
| `water_gone_ha` | Diện tích các ô có `s[i]` là `N`, và lần chụp hợp lệ ngay trước của chính ô đó là `W` |
| `asof_obs_ha` | Diện tích các ô đã có ít nhất một lần chụp hợp lệ tính đến lần `i` |
| `asof_water_ha` | Trong các ô đó, diện tích các ô mà lần chụp hợp lệ gần nhất tính đến lần `i` là `W` |

- **Vì sao có hai khóa `asof_`:** track 148 D không phủ khoảng 13,5% số ô của xã. Tỉ lệ `water_ha` chia `valid_ha` vì thế nhảy theo vùng phủ của từng track, không chỉ theo nước. Hai khóa `asof_` tính trên cả xã, lấy trạng thái gần nhất của từng ô. Đây cũng là cách bản đồ tô màu ở chế độ xem theo lần chụp, nên âm thanh, chú giải và bản đồ nói cùng một con số.
- **`totals`** là nguồn duy nhất cho mọi con số trên video, slide và trang Project. `status_ha` cộng lại phải bằng `area_ha`; `gt30_ha` cũng vậy.

### 6.7. `validation.json` (rút gọn)

Web và video chỉ đọc khối `filtered`; khối `unfiltered` có cùng các khóa. Ví dụ dưới chỉ minh họa cấu trúc cũ, kể cả timestamp và `posthoc`; **không dùng làm validation của phương pháp pixel**. S6 phải tính và gắn đúng nguồn phương pháp mới trước khi xuất hoặc công bố.

```json
{
  "reference": "OPERA DSWx-S1, WTR class 1 (open water)",
  "frozen_utc": "2026-11-13T09:00:00Z", "first_dswx_read_utc": "2026-11-13T10:00:00Z",
  "filtered": {
    "n_pairs": 17, "kappa_median": 0.5, "kappa_min": 0.3, "kappa_max": 0.7,
    "by_track": {"047D": {"n_pairs": 6, "kappa_median": 0.5}},
    "by_n_tracks": {"3": {"kappa_median": 0.5}, "2": {"kappa_median": 0.5}},
    "gt30": {"n_cells": 600, "precision": 0.4, "recall": 0.6},
    "onset": {"n_cells": 400, "overlap_share": 0.6, "median_diff_days": -4.0},
    "cropland_share_of_flagged": 1.0, "water_share_on_builtup": 0.01
  },
  "unfiltered": {},
  "pairs": [{"i": 1, "dswx_date_local": "2026-08-18", "gap_days": 2.0, "n_cells": 2000,
             "kappa": 0.5, "precision": 0.6, "recall": 0.6}],
  "posthoc": []
}
```

- Phương pháp pixel được chọn sau khi xem DSWx-S1, nên các số là mức khớp hậu kiểm. Web, video và slide không gọi chúng là kiểm chứng độc lập hoặc độ chính xác thực địa.

**Mỗi phần tử của `posthoc`** là một thay đổi đã ghi trong `posthoc_log.md`, cùng thứ tự. Chưa có thay đổi nào thì ghi `[]`.

| Khóa | Nghĩa |
| --- | --- |
| `id` | `PH-01`, `PH-02`… |
| `changed_utc` | Thời điểm thay đổi, UTC |
| `by` | Tên người thay |
| `what`, `why` | Thay gì, vì sao; mỗi khóa một câu tiếng Anh, vì web hiện nguyên văn |
| `before`, `after` | Số trước và sau khi thay, cùng tên khóa với khối `filtered`. Ít nhất có `kappa_median`, `kappa_min`, `kappa_max`, `n_pairs` |

- Web hiện danh sách này ở trang "Method and limits". Chỉ dùng khối `filtered` được S6 tính lại đúng trên phiên bản phương pháp đang xuất; không gắn số H3 cũ cho kết quả pixel.

Các con số trong mọi ví dụ là số minh họa, không phải kết quả.

## 7. Giới hạn kích thước

| File | Giới hạn |
| --- | --- |
| `cells.geojson` | Tối đa 2 MB chưa nén |
| `series.json` | Tối đa 1,5 MB chưa nén |
| Mỗi ảnh nền `.webp` | Tối đa 300 KB; web chỉ tải ảnh của ngày đang xem |
| Cả thư mục `data/{site}/` | Tối đa 15 MB |
| Lần tải đầu của web (HTML, JS, CSS, `meta.json`, `cells.geojson`) | Tối đa 3 MB khi truyền |

Đo thử với 2.344 ô và 20 lần chụp, giá trị giả nhưng đúng độ dài:

- `cells.geojson` 1,45 MB; `series.json` 0,67 MB, và 0,76 MB nếu có 23 lần chụp.
- Ảnh nền 877 × 719 pixel từ hai file thật, WebP chất lượng 75: 210 KB (047 D) và 135 KB (148 D). Ở chất lượng 85, ảnh 047 D lên 267 KB, sát giới hạn.

Giới hạn cứng của host: Cloudflare Pages cho mỗi file tối đa 25 MiB, tối đa 20.000 file ở gói Free.

## 8. Phiên bản, thiếu dữ liệu

- **Phiên bản:** `contract_version` là `2.0.0` do thay nghĩa `s_raw`, `s` và các chỉ số từ phương pháp trung bình ô sang pixel. Bộ S6 đi kèm là so sánh hậu kiểm; nguồn và hai mốc khóa được mô tả tại [tan-hoi-v2.md](provenance/tan-hoi-v2.md). Sửa file này và `schema/` cùng nhau khi thay đổi hợp đồng.
- **Lần chụp đọc lỗi:** không đưa vào `acquisitions`; ghi vào `skipped` trong `meta.json` kèm lý do.
- **Ô không có dữ liệu ở một lần chụp:** ký tự `-` trong `s`, `null` trong `hh` và `hv`.
- **Không có bộ mẫu giả trong `data/`.** Số trên video, slide và trang Project chỉ lấy từ bản dữ liệu cuối đã khóa.
