# PointDetect 3D – Trợ Lý Gán Nhãn 3D LiDAR Bounding Box Cho CVAT (Detection)

**PointDetect 3D** là tiện ích mở rộng (Chrome Extension Manifest V3) được thiết kế chuyên biệt cho bài toán **3D Object Detection** (gán nhãn Bounding Box trên từng frame độc lập). Khác với các công cụ Tracking nặng về timeline/nội suy, PointDetect tập trung giải quyết 2 bài toán nhức nhối nhất của người gán nhãn:
1. **Khắc phục tình trạng "khó nhìn":** Điểm thưa, mặt đất gây nhiễu, điểm LiDAR tối tăm, khó xác định ranh giới mép hộp.
2. **Tối ưu tốc độ vẽ & căn chỉnh hộp:** Preset kích thước chuẩn ADAS quốc tế 1-chạm, đảo đầu 180°, tự động hút đáy sát mặt đất và bộ 3 góc chiếu trực giao sắc nét.

---

## 1. Các Tính Năng Nâng Cao Thị Giác (Nhìn Rõ Gấp Nhiều Lần)

- **Lọc thông minh mặt đất (Ground Isolation Filter - 1 click):** Ẩn tức thì lớp điểm mặt đường phẳng, làm nổi bật toàn bộ các khối xe cộ, người đi bộ và chướng ngại vật nhô lên.
- **Bảng màu Turbo-LiDAR & Night Vision tương phản cao:** Tận dụng tối đa giá trị cường độ phản xạ (LiDAR Intensity) để làm bừng sáng biển số xe, đèn xe, vạch sơn đường và phản quang của người đi bộ.
- **Thanh chỉnh Dynamic Point Size:** Phóng to/thu nhỏ hạt điểm mượt mà (1.0px đến 8.0px) giúp dễ dàng nhìn thấy các chùm tia thưa thớt ở cự ly xa (30m - 70m).
- **Bộ 3 góc chiếu trực giao cắt lớp cục bộ (Top/BEV, Side, Front):** Tự động crop biên hẹp quanh vật thể đang chọn (`Crop Margin`), loại bỏ cây cối và chướng ngại vật ở xa để soi từng milimet cạnh hộp.
- **Bộ đếm mật độ điểm (Point Density Counter):** Đếm chính xác số điểm LiDAR nằm trong hộp ($N$ points) và cảnh báo ngay lập tức nếu vẽ phải "Hộp rỗng / Phantom Box" ($N = 0$).

---

## 2. Công Cụ CAD & Preset Chuẩn ADAS (Thao Tác 1 Chạm)

- **Preset kích thước chuẩn quốc tế (Neo đáy - Bottom Anchor):**
  - `[1]` **Sedan:** 4.60m x 1.85m x 1.50m
  - `[2]` **SUV:** 4.90m x 1.95m x 1.75m
  - `[3]` **Truck:** 7.20m x 2.45m x 3.10m
  - `[4]` **Bus:** 11.50m x 2.55m x 3.20m
  - `[5]` **Người đi bộ (Pedestrian):** 0.65m x 0.65m x 1.75m
  - `[6]` **Xe đạp (Cyclist):** 1.75m x 0.70m x 1.55m
  - `[7]` **Xe máy (Motorcycle):** 1.95m x 0.80m x 1.30m
  *(Khi bấm preset, kích thước được áp dụng ngay lập tức nhưng đáy hộp vẫn giữ cố định trên mặt đất, không bị thụt hay bay lên trời).*
- **Đảo đầu xe 180° `[F]`:** Xoay ngược hướng đầu xe chỉ với 1 phím bấm.
- **Hút đáy sát mặt đất `[G]`:** Tự động quét phân vị điểm mặt đất bên dưới đáy xe và kéo đáy hộp chạm đất chuẩn xác.
- **Điều chỉnh cao độ Z `Alt + Lăn chuột`:** Tăng giảm cao độ $\pm 5\text{cm}$ nhanh chóng.
- **Duyệt kiểm tra vật thể `[Tab]` / `[Shift + Tab]`:** Tự động chuyển vùng chọn sang đối tượng tiếp theo/trước đó để kiểm tra chất lượng (QA).
- **Phát hiện trùng lặp (Single-frame 3D IoU):** Cảnh báo đỏ nếu có 2 hộp bị đè lấn lên nhau trong cùng 1 frame (> 8% thể tích).

---

## 3. Bảng Phím Tắt Thao Tác Nhanh

| Phím tắt | Ngữ cảnh | Chức năng |
| :--- | :--- | :--- |
| **`Alt + D`** | Toàn cục | Mở / Thu nhỏ thanh công cụ PointDetect 3D |
| **`F`** | Khi chọn vật thể | Đảo đầu xe 180° tức thời |
| **`G`** | Khi chọn vật thể | Hút đáy hộp sát mặt đất |
| **`1` - `7`** | Khi chọn vật thể | Áp kích thước chuẩn ADAS (Sedan, SUV, Truck, Bus, Người,...) |
| **`Tab`** | Toàn cục | Chuyển sang vật thể tiếp theo |
| **`Shift + Tab`** | Toàn cục | Chuyển về vật thể trước đó |
| **`Alt + Lăn chuột`** | Trên Canvas 3D | Tăng / giảm cao độ Z ($\pm 5\text{cm}$) |

---

## 4. Hướng Dẫn Cài Đặt Vào Trình Duyệt

1. Mở Chrome / Edge / Brave và truy cập đường dẫn: `chrome://extensions/`
2. Bật công tắc **Developer mode (Chế độ cho nhà phát triển)** ở góc trên bên phải.
3. Bấm nút **Load unpacked (Tải tiện ích đã giải nén)**.
4. Chọn thư mục dự án:
   `c:\oD\Project\javis-os\brains\Brain Default\attachments\Cvat-Helper`
5. Mở tab CVAT 3D đang làm việc, bấm vào biểu tượng tiện ích **PointDetect 3D** trên thanh công cụ trình duyệt, chọn **Kích hoạt trên trang này**.
6. Công cụ sẽ xuất hiện ngay ở góc dưới màn hình và sẵn sàng hỗ trợ bạn làm việc!
