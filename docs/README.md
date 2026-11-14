# Tài liệu dự án

## Nguồn hiện hành

- [README sản phẩm](../README.md): mục đích, thiết kế và hướng dẫn dự kiến của Flood Calendar.
- [CONTRACT-001 1.0.0](data-contract.md): nguồn chuẩn về file, khóa và ý nghĩa dữ liệu trong repo này.
- [Hướng dẫn làm việc](../AGENTS.md): phạm vi sửa đổi và bảo toàn dữ liệu.
- [Kế hoạch migration](plans/migration-plan.md), [kết quả đợt 1](plans/migration-batch-01.md).
- [Manifest kế thừa](provenance/migration-manifest.md), [hash tài liệu đợt 1](provenance/batch-01-sha256.md).

## Cấu trúc thực tế sau đợt 1

| Đường dẫn | Hiện trạng |
| --- | --- |
| `pipeline/{catalog,core,export,validate}/` | Khung có `.gitkeep`, chưa chuyển implementation |
| `config/sites/`, `schema/`, `tests/`, `data/` | Khung có `.gitkeep`; chưa chuyển cấu hình site, schema, test hoặc dữ liệu |
| `docs/data-contract.md` | Hợp đồng đã có từ baseline, giữ nguyên |
| `docs/plans/`, `docs/provenance/` | Bổ sung trong đợt 1 |
| `web/` | Chưa có trong checkout này |

README gốc mô tả sản phẩm và lệnh cho các phần chưa được chuyển vào checkout; đợt này giữ nguyên README theo phạm vi bảo toàn nội dung. Chưa có `requirements.txt` hoặc `web/package.json`, vì vậy chưa xác nhận quick start của ứng dụng chạy được tại đích. Liên kết live site trong README có trước đợt này, không phải kết quả deploy của migration.
