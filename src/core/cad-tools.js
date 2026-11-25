// src/core/cad-tools.js - Bộ công cụ thao tác nhanh CAD cho 3D LiDAR Detection
// Preset kích thước chuẩn ADAS, Đảo đầu, Hút đất, Quét va chạm IoU và Điều hướng kiểm tra
// Tác giả: PointDetect Team

(() => {
  const PD = (globalThis.PointDetect ||= {});
  const G = PD.geom;

  // Thư viện kích thước chuẩn quốc tế (KITTI, Waymo, nuScenes)
  const ADAS_PRESETS = [
    { id: 'sedan', name: 'Sedan', l: 4.60, w: 1.85, h: 1.50, shortcut: '1' },
    { id: 'suv', name: 'SUV', l: 4.90, w: 1.95, h: 1.75, shortcut: '2' },
    { id: 'truck', name: 'Truck', l: 7.20, w: 2.45, h: 3.10, shortcut: '3' },
    { id: 'bus', name: 'Bus', l: 11.50, w: 2.55, h: 3.20, shortcut: '4' },
    { id: 'pedestrian', name: 'Người', l: 0.65, w: 0.65, h: 1.75, shortcut: '5' },
    { id: 'cyclist', name: 'Xe đạp', l: 1.75, w: 0.70, h: 1.55, shortcut: '6' },
    { id: 'motorcycle', name: 'Xe máy', l: 1.95, w: 0.80, h: 1.30, shortcut: '7' },
  ];

  class CadTools {
    constructor() {
      this.presets = ADAS_PRESETS;
    }

    // Áp kích thước tiêu chuẩn cho đối tượng đang chọn
    async applyPreset(clientID, presetId) {
      const p = this.presets.find((x) => x.id === presetId);
      if (!p) return false;
      return await PD.bridge.applyPresetDimensions(clientID, p.l, p.w, p.h);
    }

    // Đảo đầu 180 độ
    async flipHeading(clientID) {
      return await PD.bridge.flipHeading(clientID);
    }

    // Hút mặt đất
    async snapToGround(clientID) {
      return await PD.bridge.snapToGround(clientID);
    }

    // Nâng hạ Z bằng con lăn chuột (Alt + Scroll)
    async adjustZ(clientID, deltaZ) {
      return await PD.bridge.adjustZ(clientID, deltaZ);
    }

    // Đổi nhãn class nhanh
    async changeLabel(clientID, labelId) {
      return await PD.bridge.changeLabel(clientID, labelId);
    }

    // Quét phát hiện các cặp Bounding Box bị đè / trùng lặp (Overlap) trong frame hiện tại
    findOverlaps(cuboids) {
      if (!cuboids || cuboids.length < 2) return [];
      const overlaps = [];

      for (let i = 0; i < cuboids.length; i++) {
        const boxA = G.pointsToBox(cuboids[i].points);
        if (!boxA) continue;

        for (let j = i + 1; j < cuboids.length; j++) {
          const boxB = G.pointsToBox(cuboids[j].points);
          if (!boxB) continue;

          // Kiểm tra khoảng cách tâm trước để lọc nhanh
          const dx = boxA.c[0] - boxB.c[0];
          const dy = boxA.c[1] - boxB.c[1];
          const dz = boxA.c[2] - boxB.c[2];
          const dist = Math.hypot(dx, dy, dz);
          const maxExtent = (Math.max(...boxA.size) + Math.max(...boxB.size)) / 2;

          if (dist > maxExtent) continue;

          const iou = G.compute3dIoU(boxA, boxB);
          if (iou > 0.08) { // Cảnh báo khi có hơn 8% thể tích giao nhau
            overlaps.push({
              clientIDA: cuboids[i].clientID,
              clientIDB: cuboids[j].clientID,
              labelA: cuboids[i].label?.name || 'Vật thể A',
              labelB: cuboids[j].label?.name || 'Vật thể B',
              iou: Number(iou.toFixed(3)),
            });
          }
        }
      }
      return overlaps;
    }

    // Điều hướng chuyển sang vật thể tiếp theo hoặc trước đó
    getNextObject(cuboids, currentActiveId, forward = true) {
      if (!cuboids || !cuboids.length) return null;
      if (currentActiveId === null || currentActiveId === undefined) {
        return cuboids[0];
      }
      const idx = cuboids.findIndex((c) => c.clientID === Number(currentActiveId));
      if (idx === -1) return cuboids[0];

      let nextIdx = forward ? idx + 1 : idx - 1;
      if (nextIdx >= cuboids.length) nextIdx = 0;
      if (nextIdx < 0) nextIdx = cuboids.length - 1;
      return cuboids[nextIdx];
    }
  }

  PD.cadTools = new CadTools();
})();
