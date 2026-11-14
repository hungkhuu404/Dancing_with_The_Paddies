# Tài liệu dự án

## Nguồn hiện hành

- [README sản phẩm](../README.md): mục đích, thiết kế và hướng dẫn dự kiến của Flood Calendar.
- [CONTRACT-001 2.0.0](data-contract.md): nguồn chuẩn về file, khóa và ý nghĩa dữ liệu trong repo này.
- [Hướng dẫn làm việc](../AGENTS.md): phạm vi sửa đổi và bảo toàn dữ liệu.
- [Kế hoạch migration](plans/migration-plan.md), [kết quả đợt 1](plans/migration-batch-01.md).
- [Manifest kế thừa](provenance/migration-manifest.md), [hash tài liệu đợt 1](provenance/batch-01-sha256.md).
- [Bản đồ tích hợp MAP-UX-001](plans/integrated-map.md): thiết kế, module hiện hành, phạm vi dữ liệu và kết quả kiểm tra UI sau migration. [Chạy web local](../web/README.md).

## Cấu trúc hiện hành

| Đường dẫn | Hiện trạng |
| --- | --- |
| `pipeline/{catalog,core,export,validate}/` | S0, S1–S5 pixel processing, offline Tân Hội S6 comparison and S7 export |
| `config/sites/`, `schema/`, `tests/` | Site configuration and JSON Schema are present; frontend tests are in web/test/ |
| `data/` | Tân Hội v2 pixel export with 20 acquisitions and post-hoc S6 comparison; no Bang Rakam or H7 export |
| `docs/data-contract.md` | Contract 2.0.0 for the pixel export |
| `docs/plans/`, `docs/provenance/` | Bổ sung trong đợt 1 |
| `web/` | Vite, Three.js và MapLibre; 3D và map tích hợp cùng tab, có route `/map/` độc lập; test trong `web/test/` |

Các tài liệu đợt migration là snapshot lịch sử. Web cài từ lockfile và chạy local. Code S6 được tích hợp ở task BANG-6; [hướng dẫn chạy](s6-comparison.md) và [nguồn/bằng chứng](provenance/bang6-s6.md) ghi phạm vi của task này. Liên kết live site trong README có trước migration, không phải bằng chứng deploy từ checkout này. Kết quả kiểm tra local được tách khỏi trạng thái CI và production.

## Local location-entrance migration

[MIG-WEB-ENTRANCE-003](plans/location-entrance.md) records the regional entry, compact controls, module map, local checks and open-PR integration limits. [Source and per-file hashes](provenance/location-entrance.md) distinguish the pinned import from the one product adaptation. The integration branch now includes current main data tools; PR checks and merge state are tracked on GitHub. No deploy is configured by this migration.

## Scientific views

[SCIENCE-UI-001](plans/calendar-method.md) documents the hamlet water calendar, Method and limits, calculation rules, module map and verification. The views are available as /calendar/ and /method/ and open inside landscape/map exploration.

## Guided-tour audio migration

[MIG-TOUR-AUDIO-004](plans/tour-audio.md) records the narrated tour, audible scene score, compact captions and independent Calendar/Method entries. [Pinned source and file hashes](provenance/tour-audio.md) cover the selected import from Nasa_prep main. No source hosting workflow or data files are migrated.
