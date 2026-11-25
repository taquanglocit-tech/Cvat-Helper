// src/core/bridge-main.js - Cầu nối chạy trong ngữ cảnh window (world: MAIN)
// Đăng ký trực tiếp với window.cvatUI của CVAT để đọc/ghi annotation và can thiệp Three.js Scene
// Tối ưu hóa đặc thù cho bài toán 3D LiDAR Object Detection

(() => {
  if (window.__pointDetectBridge) return;
  window.__pointDetectBridge = true;

  const REQ = 'point-detect:req';
  const RES = 'point-detect:res';
  const EVT = 'point-detect:evt';

  let ctx = null; // { core, store, dispatch, actionCreators }
  let internalOp = false;
  let storeUnsubscribe = null;

  function emitEvt(payload) {
    document.dispatchEvent(new CustomEvent(EVT, { detail: JSON.stringify(payload) }));
  }

  function getJob() {
    return ctx?.store?.getState?.()?.annotation?.job?.instance || null;
  }

  function getCanvasInstance() {
    return ctx?.store?.getState?.()?.annotation?.canvas?.instance || null;
  }

  function getCurrentFrame() {
    return ctx?.store?.getState?.()?.annotation?.player?.frame?.number ?? 0;
  }

  // Lấy Three.js Scene từ perspective canvas của CVAT
  function getThreeScene() {
    const ci = getCanvasInstance();
    if (!ci) return null;
    const views = typeof ci.views === 'function' ? ci.views() : ci.views;
    return views?.perspective?.scene || null;
  }

  // Quét toàn bộ điểm LiDAR từ Three.js Points trong Scene hiện tại (0ms RAM)
  function extractScenePoints() {
    const scene = getThreeScene();
    let bestArr = null;
    let bestColors = null;
    let maxLen = 0;

    if (scene) {
      scene.traverse((obj) => {
        if (obj.isPoints && obj.geometry?.attributes?.position) {
          const pos = obj.geometry.attributes.position.array;
          if (pos && pos.length > maxLen) {
            maxLen = pos.length;
            bestArr = pos;
            bestColors = obj.geometry.attributes.color?.array || null;
          }
        }
      });
    }

    if (!bestArr) {
      // Tìm trong các views phụ (Top/Side/Front) nếu perspective chưa mount
      const ci = getCanvasInstance();
      const views = typeof ci?.views === 'function' ? ci.views() : ci?.views;
      if (views) {
        for (const k of ['top', 'side', 'front']) {
          const sc = views[k]?.scene;
          if (sc) {
            sc.traverse((obj) => {
              if (obj.isPoints && obj.geometry?.attributes?.position) {
                const pos = obj.geometry.attributes.position.array;
                if (pos && pos.length > maxLen) {
                  maxLen = pos.length;
                  bestArr = pos;
                  bestColors = obj.geometry.attributes.color?.array || null;
                }
              }
            });
            if (bestArr) break;
          }
        }
      }
    }

    return {
      points: bestArr ? Array.from(bestArr) : [],
      colors: bestColors ? Array.from(bestColors) : [],
      count: bestArr ? Math.floor(bestArr.length / 3) : 0
    };
  }

  // Quét đối tượng trong frame hiện tại
  async function getFrameStates() {
    const job = getJob();
    if (!job) return [];
    const frame = getCurrentFrame();
    const st = ctx.store.getState().annotation;
    const filters = st.annotations?.filters || [];
    const states = await job.annotations.get(frame, true, filters);
    return states || [];
  }

  const methods = {
    // 1. Lấy toàn bộ trạng thái gán nhãn của frame hiện tại
    async getState() {
      if (!ctx) return { ready: false };
      const job = getJob();
      if (!job) return { ready: false };

      const frame = getCurrentFrame();
      const st = ctx.store.getState().annotation;
      const states = await getFrameStates();
      const activeId = st.annotations?.activatedStateID ?? st.canvas?.activeElement?.clientID ?? null;

      // Danh mục nhãn (Labels) được cấu hình trong CVAT
      const labels = (job.labels || []).map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        attributes: (l.attributes || []).map((a) => ({
          id: a.id,
          name: a.name,
          inputType: a.inputType,
          values: a.values,
          defaultValue: a.defaultValue,
        })),
      }));

      // Lọc các bounding box 3D (cuboid) trong frame này
      const cuboids = states
        .filter((s) => s.shapeType === 'cuboid' && !s.outside)
        .map((s) => ({
          clientID: s.clientID,
          serverID: s.serverID ?? null,
          label: { id: s.label.id, name: s.label.name, color: s.label.color },
          points: Array.from(s.points), // [x, y, z, rx, ry, rz, lx, ly, lz, ...]
          occluded: s.occluded,
          lock: s.lock,
          attributes: s.attributes ? { ...s.attributes } : {},
        }));

      const activeCuboid = cuboids.find((c) => c.clientID === Number(activeId)) || null;

      return {
        ready: true,
        jobId: job.id,
        frame,
        totalFrames: job.stopFrame - job.startFrame + 1,
        labels,
        cuboids,
        activeId: activeId !== null ? Number(activeId) : null,
        activeCuboid,
      };
    },

    // 2. Lấy dữ liệu đám mây điểm của Scene hiện tại
    async getScenePoints() {
      return extractScenePoints();
    },

    // 3. Kích hoạt chọn đối tượng (Select/Activate)
    async activateObject({ clientID }) {
      if (!ctx) return false;
      const ci = getCanvasInstance();
      if (ci && typeof ci.activate === 'function') {
        ci.activate(Number(clientID), null);
      }
      ctx.dispatch({
        type: 'ACTIVATE_OBJECT',
        payload: {
          activatedStateID: Number(clientID),
          activatedElementID: null,
        },
      });
      return true;
    },

    // 4. Đảo đầu xe 180 độ (Flip Heading)
    async flipHeading({ clientID }) {
      const states = await getFrameStates();
      const target = states.find((s) => s.clientID === Number(clientID));
      if (!target) return false;

      const pts = Array.from(target.points);
      // CVAT 3D: pts[3], pts[4], pts[5] là Euler góc quay radian [rx, ry, rz]
      // Đảo đầu 180 độ quanh trục thẳng đứng Z
      pts[5] = (pts[5] + Math.PI) % (2 * Math.PI);
      target.points = pts;
      await target.save();
      await methods.refresh();
      return true;
    },

    // 5. Áp kích thước chuẩn ADAS Preset (Giữ nguyên mặt đáy - Bottom Anchor)
    async applyPresetDimensions({ clientID, length, width, height }) {
      const states = await getFrameStates();
      const target = states.find((s) => s.clientID === Number(clientID));
      if (!target) return false;

      const pts = Array.from(target.points);
      // pts[6]: L (dài), pts[7]: W (rộng), pts[8]: H (cao)
      const oldH = pts[8];
      const newH = Number(height);
      const deltaH = newH - oldH;

      // Neo đáy: Khi tăng chiều cao thêm deltaH, tâm Z của box phải nâng lên deltaH / 2
      // để đáy hộp (chạm đất) không bị lún hoặc nhấc lên
      pts[2] += deltaH / 2;
      pts[6] = Number(length);
      pts[7] = Number(width);
      pts[8] = newH;

      target.points = pts;
      await target.save();
      await methods.refresh();
      return true;
    },

    // 6. Tinh chỉnh độ cao Z (Delta Z)
    async adjustZ({ clientID, deltaZ }) {
      const states = await getFrameStates();
      const target = states.find((s) => s.clientID === Number(clientID));
      if (!target) return false;

      const pts = Array.from(target.points);
      pts[2] += Number(deltaZ);
      target.points = pts;
      await target.save();
      await methods.refresh();
      return true;
    },

    // 7. Hút đáy sát mặt đất (Snap Ground)
    async snapToGround({ clientID }) {
      const states = await getFrameStates();
      const target = states.find((s) => s.clientID === Number(clientID));
      if (!target) return false;

      const pts = Array.from(target.points);
      const [cx, cy, cz, , , , l, w, h] = pts;

      // Lấy toàn bộ điểm trong scene để tìm cao độ mặt đất cục bộ quanh xe
      const { points } = extractScenePoints();
      if (!points || !points.length) return false;

      // Tìm các điểm nằm trong phạm vi footprint của xe mở rộng một chút (+0.3m)
      const groundCandidates = [];
      const halfL = (l / 2) + 0.3;
      const halfW = (w / 2) + 0.3;
      const currentBottomZ = cz - (h / 2);

      for (let i = 0; i < points.length; i += 3) {
        const px = points[i];
        const py = points[i + 1];
        const pz = points[i + 2];

        // Lọc trong bán kính XY gần xe
        if (Math.abs(px - cx) <= halfL && Math.abs(py - cy) <= halfW) {
          // Điểm mặt đất thường nằm ở nửa dưới hoặc sát đáy hiện tại (-0.8m đến +0.4m)
          if (pz >= currentBottomZ - 0.8 && pz <= currentBottomZ + 0.4) {
            groundCandidates.push(pz);
          }
        }
      }

      if (groundCandidates.length >= 3) {
        // Lấy phân vị thứ 15-20% (tránh các điểm nhiễu âm rớt dưới lòng đất)
        groundCandidates.sort((a, b) => a - b);
        const groundZ = groundCandidates[Math.floor(groundCandidates.length * 0.15)];
        // Đặt đáy box tại groundZ -> tâm Z mới = groundZ + h / 2
        pts[2] = groundZ + (h / 2);
        target.points = pts;
        await target.save();
        await methods.refresh();
        return { success: true, groundZ };
      }

      return { success: false, reason: 'Không đủ điểm mặt đất bên dưới vật thể' };
    },

    // 8. Đổi nhãn nhanh (Change Label)
    async changeLabel({ clientID, labelId }) {
      const states = await getFrameStates();
      const target = states.find((s) => s.clientID === Number(clientID));
      if (!target) return false;

      const job = getJob();
      const targetLabel = (job.labels || []).find((l) => l.id === Number(labelId));
      if (!targetLabel) return false;

      target.label = targetLabel;
      await target.save();
      await methods.refresh();
      return true;
    },

    // 9. Điều khiển thị giác Three.js trên Scene chính của CVAT
    async setVisualOptions({ pointSize, hideGround, groundZThreshold }) {
      const scene = getThreeScene();
      if (!scene) return false;

      scene.traverse((obj) => {
        if (obj.isPoints && obj.material) {
          if (pointSize !== undefined) {
            obj.material.size = Number(pointSize);
            obj.material.needsUpdate = true;
          }
        }
      });
      return true;
    },

    // 10. Làm mới giao diện CVAT trong RAM mà không cần tải lại trang
    async refresh() {
      if (!ctx) return false;
      const job = getJob();
      if (!job) return false;
      const frame = getCurrentFrame();
      const st = ctx.store.getState().annotation;
      const filters = st.annotations?.filters || [];
      const states = await job.annotations.get(frame, true, filters);
      const activeId = st.annotations?.activatedStateID ?? null;

      ctx.dispatch({
        type: 'FETCH_ANNOTATIONS_SUCCESS',
        payload: {
          states,
          history: {},
          minZ: 0,
          maxZ: 0,
        },
      });

      const ci = getCanvasInstance();
      if (ci && typeof ci.setup === 'function') {
        const frameData = st.player?.frame?.data;
        if (frameData) {
          ci.setup(frameData, states.filter((s) => s.objectType !== 'tag'));
        }
        if (activeId !== null && typeof ci.activate === 'function') {
          ci.activate(Number(activeId), null);
        }
      }
      return true;
    },
  };

  // Đăng ký với window.cvatUI
  function register() {
    if (ctx || !window.cvatUI || typeof window.cvatUI.registerComponent !== 'function') return !!ctx;
    window.cvatUI.registerComponent((args) => {
      ctx = args;
      setupStoreWatcher();
      return {
        name: 'PointDetect 3D Assistant',
        destructor: () => {
          if (storeUnsubscribe) storeUnsubscribe();
          ctx = null;
        },
      };
    });
    return !!ctx;
  }

  function setupStoreWatcher() {
    if (!ctx?.store?.subscribe) return;
    let prevFrame = -1;
    let prevActive = null;

    storeUnsubscribe = ctx.store.subscribe(() => {
      const state = ctx.store.getState().annotation;
      const curFrame = state.player?.frame?.number;
      const curActive = state.annotations?.activatedStateID;

      if (curFrame !== prevFrame || curActive !== prevActive) {
        prevFrame = curFrame;
        prevActive = curActive;
        emitEvt({
          type: 'cvat-state-changed',
          frame: curFrame,
          activeId: curActive,
        });
      }
    });
  }

  if (!register()) {
    document.addEventListener('plugins.ready', register);
    let count = 0;
    const t = setInterval(() => {
      if (register() || ++count > 100) clearInterval(t);
    }, 600);
  }

  // Lắng nghe yêu cầu từ Content Script qua CustomEvent
  document.addEventListener(REQ, async (e) => {
    let msg = null;
    try { msg = JSON.parse(e.detail); } catch { return; }
    const { id, method, params } = msg;

    if (typeof methods[method] === 'function') {
      try {
        const result = await methods[method](params || {});
        document.dispatchEvent(new CustomEvent(RES, {
          detail: JSON.stringify({ id, ok: true, result }),
        }));
      } catch (err) {
        console.error('[PointDetect Bridge Error]', err);
        document.dispatchEvent(new CustomEvent(RES, {
          detail: JSON.stringify({ id, ok: false, error: err.message }),
        }));
      }
    } else {
      document.dispatchEvent(new CustomEvent(RES, {
        detail: JSON.stringify({ id, ok: false, error: `Phương thức ${method} không tồn tại` }),
      }));
    }
  });

  console.log('[PointDetect 3D] Bridge-main đã nạp thành công!');
})();
