# BANG-1 — regression theo spec H3 ban đầu

59 ca nghiệp vụ và 3 ca kiểm fixture của Bằng, được chuẩn bị theo spec dữ liệu 5.4, 5.5, 7. Chạy với adapter của core để kiểm các hàm phân loại cũ, lọc singleton và chỉ số; không tự xác nhận quy tắc pixel 75%/guard 50%.

```sh
python -I -m pytest -p no:cacheprovider -q tests/bang1/tests \
  --bang1-adapter pipeline/core/bang1_adapter.py --bang1-require-adapter
```

Không có adapter thì các ca nghiệp vụ skip; chế độ require thiếu adapter phải lỗi. Kết quả kiểm pixel hiện hành nằm trong `tests/core/test_pixel_dual.py`.
