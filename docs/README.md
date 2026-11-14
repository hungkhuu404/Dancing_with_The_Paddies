# Tài liệu dự án

## Nguồn hiện hành

- [README sản phẩm](../README.md): mục đích, thiết kế và hướng dẫn dự kiến của Flood Calendar.
- [CONTRACT-001 1.0.0](data-contract.md): nguồn chuẩn về file, khóa và ý nghĩa dữ liệu trong repo này.
- [Hướng dẫn làm việc](../AGENTS.md): phạm vi sửa đổi và bảo toàn dữ liệu.
- [Kế hoạch migration](plans/migration-plan.md), [kết quả đợt 1](plans/migration-batch-01.md).
- [Manifest kế thừa](provenance/migration-manifest.md), [hash tài liệu đợt 1](provenance/batch-01-sha256.md).
- [Bản đồ tích hợp MAP-UX-001](plans/integrated-map.md): thiết kế, module hiện hành, phạm vi dữ liệu và kết quả kiểm tra UI sau migration. [Chạy web local](../web/README.md).

## Cấu trúc hiện hành

| Đường dẫn | Hiện trạng |
| --- | --- |
| `pipeline/{catalog,core,export,validate}/` | Khung có `.gitkeep`, chưa chuyển implementation |
| `config/sites/`, `schema/`, `tests/` | Khung có `.gitkeep`; chưa chuyển cấu hình site, schema hoặc test pipeline |
| `data/` | Bộ xuất công khai H4 của Tân Hội, 20 lần chụp; chưa có validation, Bang Rakam hoặc H7 |
| `docs/data-contract.md` | Hợp đồng đã có từ baseline, giữ nguyên |
| `docs/plans/`, `docs/provenance/` | Bổ sung trong đợt 1 |
| `web/` | Vite, Three.js và MapLibre; 3D và map tích hợp cùng tab, có route `/map/` độc lập; test trong `web/test/` |

Các tài liệu đợt migration là snapshot lịch sử. Web hiện cài từ lockfile và chạy local; pipeline S0–S7 vẫn chưa được chuyển. Liên kết live site trong README có trước migration, không phải bằng chứng deploy từ checkout này. Kết quả kiểm tra local được tách khỏi trạng thái CI và production trong báo cáo từng tác vụ.

## Local location-entrance migration

[MIG-WEB-ENTRANCE-003](plans/location-entrance.md) records the regional entry, compact controls, module map, local checks and open-PR integration limits. [Source and per-file hashes](provenance/location-entrance.md) distinguish the pinned import from the one product adaptation. The integration branch now includes current main data tools; PR checks and merge state are tracked on GitHub. No deploy is configured by this migration.

## Scientific views

[SCIENCE-UI-001](plans/calendar-method.md) documents the hamlet water calendar, Method and limits, calculation rules, module map and verification. The views are available as /calendar/ and /method/ and open inside landscape/map exploration.
