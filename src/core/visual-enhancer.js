// src/core/visual-enhancer.js - Bộ xử lý nâng cao thị giác LiDAR cho Detection
// Lọc mặt đất, chuẩn hóa Intensity, Colormaps tương phản cao cho mắt người
// Tác giả: PointDetect Team

(() => {
  const PD = (globalThis.PointDetect ||= {});

  // 1. Thuật toán ước tính mặt phẳng mặt đất (Ground Plane Estimation)
  // Chia lưới không gian XY thành các ô vuông và tìm cao độ tối thiểu của mỗi ô
  function estimateGroundElevation(pointsArray) {
    if (!pointsArray || pointsArray.length < 9) return 0;

    const zValues = [];
    // Lấy mẫu nhanh cách quãng để tối ưu tốc độ tính toán trong RAM (<5ms)
    const step = Math.max(1, Math.floor(pointsArray.length / 3 / 4000)) * 3;

    for (let i = 0; i < pointsArray.length; i += step) {
      const z = pointsArray[i + 2];
      // Bỏ các điểm nhiễu cực âm hoặc trên trời
      if (z > -5.0 && z < 2.0) {
        zValues.push(z);
      }
    }

    if (!zValues.length) return 0;
    zValues.sort((a, b) => a - b);
    // Điểm mặt đất thường nằm ở phân vị 10% - 15% thấp nhất
    const groundZ = zValues[Math.floor(zValues.length * 0.12)];
    return groundZ;
  }

  // 2. Các hàm Colormap tính màu sắc (RGB [0..1]) từ giá trị chuẩn hóa t [0..1]
  const ColorMaps = {
    // Turbo LiDAR: Phân cấp tương phản cao, làm bừng sáng biển số, đèn, vạch sơn
    turbo(t) {
      let x = Math.min(Math.max(t, 0.0), 1.0);
      x = Math.pow(x, 0.75); // Tăng cường vùng giá trị thấp
      if (x < 0.20) {
        const f = x / 0.20;
        return [0.12 + 0.0 * f, 0.05 + 0.45 * f, 0.45 + 0.45 * f]; // Tím sẫm -> Xanh biển
      } else if (x < 0.45) {
        const f = (x - 0.20) / 0.25;
        return [0.05 + 0.05 * f, 0.50 + 0.40 * f, 0.90 - 0.50 * f]; // Xanh biển -> Xanh lá
      } else if (x < 0.70) {
        const f = (x - 0.45) / 0.25;
        return [0.10 + 0.88 * f, 0.90 - 0.05 * f, 0.40 - 0.30 * f]; // Xanh lá -> Vàng tươi
      } else if (x < 0.88) {
        const f = (x - 0.70) / 0.18;
        return [0.98 + 0.02 * f, 0.85 - 0.65 * f, 0.10 - 0.02 * f]; // Vàng tươi -> Đỏ cam
      }
      const f = (x - 0.88) / 0.12;
      return [1.00, 0.20 + 0.75 * f, 0.08 + 0.85 * f]; // Đỏ cam -> Trắng rực rỡ
    },

    // Viridis: Dịu mắt, chuẩn đồ họa khoa học
    viridis(t) {
      const x = Math.min(Math.max(t, 0.0), 1.0);
      return [
        0.267 + x * (0.993 - 0.267),
        0.004 + Math.sin(x * Math.PI) * 0.8,
        0.329 + (1.0 - x) * 0.4,
      ];
    },

    // Night Vision / High Contrast: Tương phản cực cao cho người mắt mỏi
    nightVision(t) {
      const x = Math.min(Math.max(t, 0.0), 1.0);
      const intensity = Math.pow(x, 0.6);
      return [intensity * 0.4, intensity, intensity * 0.5]; // Ánh lục dạ quang
    },

    // Z-Elevation: Màu theo chiều cao từ chân lên đỉnh
    elevation(z, groundZ, maxHeight = 3.0) {
      const relZ = Math.min(Math.max((z - groundZ) / maxHeight, 0.0), 1.0);
      return ColorMaps.turbo(relZ);
    },
  };

  PD.visualEnhancer = {
    estimateGroundElevation,
    ColorMaps,
  };
})();
