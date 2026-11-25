// src/core/geom.js - Thư viện tính toán hình học 3D, Ma trận quay, 3D IoU và Bounding Box
// Tác giả: PointDetect Team

(() => {
  const PD = (globalThis.PointDetect ||= {});

  // Chuyển mảng points của CVAT cuboid sang cấu trúc Box rõ ràng
  function pointsToBox(points) {
    if (!points || points.length < 9) return null;
    return {
      c: [points[0], points[1], points[2]],         // Tâm X, Y, Z
      r: [points[3], points[4], points[5]],         // Góc quay Euler Roll, Pitch, Yaw (radian)
      size: [points[6], points[7], points[8]],      // Kích thước Length, Width, Height (mét)
    };
  }

  // Chuyển cấu trúc Box thành mảng points lưu vào ObjectState CVAT
  function boxToPoints(box, origPoints = []) {
    const pts = origPoints.length >= 16 ? Array.from(origPoints) : new Array(16).fill(0);
    pts[0] = box.c[0]; pts[1] = box.c[1]; pts[2] = box.c[2];
    pts[3] = box.r[0]; pts[4] = box.r[1]; pts[5] = box.r[2];
    pts[6] = box.size[0]; pts[7] = box.size[1]; pts[8] = box.size[2];
    return pts;
  }

  // Tính 3 vector trục toạ độ đơn vị ex, ey, ez từ Euler [rx, ry, rz] theo quy ước ZYX của CVAT
  function axes(r) {
    const [rx, ry, rz] = r;
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);

    return {
      ex: [cy * cz, cy * sz, -sy],
      ey: [sx * sy * cz - cx * sz, sx * sy * sz + cx * cz, sx * cy],
      ez: [cx * sy * cz + sx * sz, cx * sy * sz - sx * cz, cx * cy],
    };
  }

  // Chuyển toạ độ thế giới (World) sang hệ toạ độ địa phương của Box (Local)
  function worldToLocal(p, c, ax) {
    const dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2];
    return [
      dx * ax.ex[0] + dy * ax.ex[1] + dz * ax.ex[2],
      dx * ax.ey[0] + dy * ax.ey[1] + dz * ax.ey[2],
      dx * ax.ez[0] + dy * ax.ez[1] + dz * ax.ez[2],
    ];
  }

  // Tính 8 đỉnh của Bounding Box trong không gian 3D
  function boxCorners(box) {
    const ax = axes(box.r);
    const hx = box.size[0] / 2;
    const hy = box.size[1] / 2;
    const hz = box.size[2] / 2;
    const corners = [];

    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          corners.push([
            box.c[0] + sx * hx * ax.ex[0] + sy * hy * ax.ey[0] + sz * hz * ax.ez[0],
            box.c[1] + sx * hx * ax.ex[1] + sy * hy * ax.ey[1] + sz * hz * ax.ez[1],
            box.c[2] + sx * hx * ax.ex[2] + sy * hy * ax.ey[2] + sz * hz * ax.ez[2],
          ]);
        }
      }
    }
    return corners;
  }

  // Đếm số điểm LiDAR thực sự nằm trọn vẹn trong Bounding Box
  function countPointsInBox(ptsArray, box, margin = 0.0) {
    if (!ptsArray || !ptsArray.length || !box) return 0;
    const ax = axes(box.r);
    const hx = (box.size[0] / 2) + margin;
    const hy = (box.size[1] / 2) + margin;
    const hz = (box.size[2] / 2) + margin;
    let count = 0;

    for (let i = 0; i < ptsArray.length; i += 3) {
      const p = [ptsArray[i], ptsArray[i + 1], ptsArray[i + 2]];
      const q = worldToLocal(p, box.c, ax);
      if (Math.abs(q[0]) <= hx && Math.abs(q[1]) <= hy && Math.abs(q[2]) <= hz) {
        count++;
      }
    }
    return count;
  }

  // Thuật toán Sutherland-Hodgman cắt đa giác phẳng để tính diện tích giao nhau trên mặt BEV (Bird's Eye View)
  function clipPolygon(subjectPoly, clipPoly) {
    let outputList = subjectPoly;
    for (let i = 0; i < clipPoly.length; i++) {
      const a = clipPoly[i];
      const b = clipPoly[(i + 1) % clipPoly.length];
      const inputList = outputList;
      outputList = [];
      if (!inputList.length) break;

      let s = inputList[inputList.length - 1];
      for (let j = 0; j < inputList.length; j++) {
        const e = inputList[j];
        const isInside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;

        if (isInside(e)) {
          if (!isInside(s)) {
            // Điểm giao
            const d1x = b[0] - a[0], d1y = b[1] - a[1];
            const d2x = e[0] - s[0], d2y = e[1] - s[1];
            const det = d1x * d2y - d1y * d2x;
            if (Math.abs(det) > 1e-6) {
              const t = ((s[0] - a[0]) * d2y - (s[1] - a[1]) * d2x) / det;
              outputList.push([a[0] + t * d1x, a[1] + t * d1y]);
            }
          }
          outputList.push(e);
        } else if (isInside(s)) {
          const d1x = b[0] - a[0], d1y = b[1] - a[1];
          const d2x = e[0] - s[0], d2y = e[1] - s[1];
          const det = d1x * d2y - d1y * d2x;
          if (Math.abs(det) > 1e-6) {
            const t = ((s[0] - a[0]) * d2y - (s[1] - a[1]) * d2x) / det;
            outputList.push([a[0] + t * d1x, a[1] + t * d1y]);
          }
        }
        s = e;
      }
    }
    return outputList;
  }

  function polygonArea(poly) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    }
    return Math.abs(area) / 2;
  }

  // Tính 3D IoU (Intersection over Union) giữa 2 box trong cùng 1 frame
  function compute3dIoU(boxA, boxB) {
    if (!boxA || !boxB) return 0;

    // 1. Kiểm tra giao độ cao trục Z
    const minZa = boxA.c[2] - boxA.size[2] / 2;
    const maxZa = boxA.c[2] + boxA.size[2] / 2;
    const minZb = boxB.c[2] - boxB.size[2] / 2;
    const maxZb = boxB.c[2] + boxB.size[2] / 2;

    const interMinZ = Math.max(minZa, minZb);
    const interMaxZ = Math.min(maxZa, maxZb);
    const interH = Math.max(0, interMaxZ - interMinZ);
    if (interH <= 0) return 0;

    // 2. Tính 4 góc hình chiếu BEV (mặt đất XY)
    const getBevCorners = (box) => {
      const ax = axes(box.r);
      const hx = box.size[0] / 2;
      const hy = box.size[1] / 2;
      return [
        [box.c[0] - hx * ax.ex[0] - hy * ax.ey[0], box.c[1] - hx * ax.ex[1] - hy * ax.ey[1]],
        [box.c[0] + hx * ax.ex[0] - hy * ax.ey[0], box.c[1] + hx * ax.ex[1] - hy * ax.ey[1]],
        [box.c[0] + hx * ax.ex[0] + hy * ax.ey[0], box.c[1] + hx * ax.ex[1] + hy * ax.ey[1]],
        [box.c[0] - hx * ax.ex[0] + hy * ax.ey[0], box.c[1] - hx * ax.ex[1] + hy * ax.ey[1]],
      ];
    };

    const polyA = getBevCorners(boxA);
    const polyB = getBevCorners(boxB);

    const interPoly = clipPolygon(polyA, polyB);
    const interBevArea = polygonArea(interPoly);
    if (interBevArea <= 0) return 0;

    const interVol = interBevArea * interH;
    const volA = boxA.size[0] * boxA.size[1] * boxA.size[2];
    const volB = boxB.size[0] * boxB.size[1] * boxB.size[2];
    const unionVol = volA + volB - interVol;

    return unionVol > 0 ? interVol / unionVol : 0;
  }

  PD.geom = {
    pointsToBox,
    boxToPoints,
    axes,
    worldToLocal,
    boxCorners,
    countPointsInBox,
    compute3dIoU,
  };
})();
