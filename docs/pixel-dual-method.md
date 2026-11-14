# Phương pháp pixel 75% và lọc hai mức

## Kiến trúc xử lý

```text
NISAR GCOV + danh mục S0 + cấu hình site
             │
             ▼
S1: đọc cửa sổ HH/HV và vùng tham chiếu, lưu cache local
             │
             ▼
S2–S3: dựng ô 250 m, kiểm P1–P3, chọn ngưỡng Q0/Q1 theo ảnh
             │
             ▼
S4: phân loại pixel → tỷ lệ 75% → lọc thời gian có chặn 50%
             │
             ▼
S5: chuỗi s_raw/s + thời điểm + chỉ số từng ô + cờ >30 ngày
             │
             ▼
Snapshot hậu kiểm + hash → S7 kiểm tương thích và xuất dữ liệu web
             │
             └── DSWx-S1: đối chiếu S6 riêng, không là đầu vào phân loại
```

S3 giữ kết quả các phép kiểm gốc và ghi rõ Q1 khi cần; không đổi phép kiểm thất bại thành đạt. Phép kiểm `s4_stable_control` hiện dùng trung bình HH/HV của vùng ổn định; nó không phải đánh giá độc lập của bộ phân loại pixel. Metadata S7 ghi tên phương pháp, tỷ lệ 75% và 50%, tỷ lệ pixel hợp lệ và trạng thái lựa chọn `post_hoc`. Token và cache không nằm trong dữ liệu xuất.

## Mục tiêu và đầu vào

Phương pháp dùng HH/HV từ NISAR GCOV, ngưỡng Q0 hoặc Q1 xác định theo ảnh và mặt nạ đất canh tác. Mỗi ô 250 m gồm 25×25 vị trí pixel 10 m. Một pixel hợp lệ khi HH và HV cùng hữu hạn, dương. Một ô được xét khi có đủ lưới 25×25 vị trí và ít nhất 438/625 pixel hợp lệ.

## Phân loại và lọc

1. Trên từng pixel hợp lệ, so HH và HV công suất tuyến tính với ngưỡng dB của ảnh đã đổi sang công suất. Pixel thỏa khi **cả hai** nhỏ hơn ngưỡng tương ứng.
2. Chia số pixel thỏa cho số pixel hợp lệ trong ô. Nếu tỷ lệ ≥75%, trạng thái thô `W`; thấp hơn là `N`; ô không đủ dữ liệu là `-`. HH/HV trung bình ô là giá trị tham khảo, không phải đại lượng quyết định `W`.
3. Lọc đồng thời trên chuỗi quan sát hợp lệ 75%, bỏ qua thiếu. Mẫu `N-W-N` đổi `W` giữa thành `N`. Với `W-N-W`, chỉ lấp `N` thành `W` khi tỷ lệ pixel nước tại thời điểm giữa ≥50%. Đầu/cuối và missing giữ nguyên.
4. Tính các chỉ số từ chuỗi đã lọc. `flag_gt30=yes` khi khoảng giữa lần `W` đầu và cuối của đợt chính vượt 30 ngày và đủ điều kiện đất canh tác. Các quan sát rời rạc không chứng minh ngập liên tục trong khoảng giữa ảnh.

## Kết quả thăm dò tại Tân Hội

Đối chiếu H5 gồm 1.182 ô, phương pháp này có precision 363/895 = **40,56%**, recall 363/379 = **95,78%**, và khớp `yes/possible/no` 533/1.182 = **45,09%**. Accuracy khi cả hai phía cùng kết luận `yes/no` là 417/548 = **76,09%**, với độ phủ 548/621 = **88,24%** ô DSWx `yes/no`.

Precision tính mọi ô phương pháp gắn `yes`, kể cả ô DSWx `possible`. Recall giữ đủ 379 ô DSWx `yes`. Khớp ba nhãn giữ `na` trong mẫu số nhưng không tính khớp. DSWx `possible` không đồng nghĩa không ngập ngoài thực địa.

Đây là **kết quả hậu kiểm**: nhiều phương án đã được so trên cùng H5 và phương pháp này được chọn sau khi xem kết quả. DSWx-S1 khác cảm biến và thời điểm, không phải ground truth; các số trên không phải kiểm chứng độc lập hoặc độ chính xác thực địa. Ngưỡng HH/HV ban đầu đặt cho trung bình ô, chưa được hiệu chuẩn riêng cho pixel. Cần đánh giá trên nhãn độc lập chưa dùng để chọn phương pháp.

## Tương thích và nghiệm thu

`s_raw`, `s`, các chỉ số và phương pháp metadata mang nghĩa bản 2.0.0 trong [hợp đồng dữ liệu](data-contract.md). BANG-1 cũ kiểm các hàm theo phương pháp cũ, không tự xác nhận phân loại pixel mới. Snapshot H3 giữ nguyên để đối chiếu; không ghi đè hay gắn nhãn bản pixel là H3. S6 và web cần cùng xác nhận dùng phương pháp và schema mới trước khi phát hành.
