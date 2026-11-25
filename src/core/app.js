// src/core/app.js - Giao diện chính của PointDetect 3D
// Thiết kế chuẩn Dark CAD / Clean Engineering, đồng bộ hoàn toàn với CVAT
// Tác giả: PointDetect Team

(() => {
  const PD = (globalThis.PointDetect ||= {});
  if (PD.booted) return;
  PD.booted = true;

  const { h, kbd, fmtNum } = PD.ui;
  const G = PD.geom;

  // Trạng thái thị giác hiện tại
  const visualState = {
    pointSize: 3.0,
    hideGround: false,
    colorMode: 'turbo', // 'turbo' | 'night'
    intensityGain: 1.3,
    cropMargin: 1.2,
  };

  let currentState = null;
  let cachedPoints = null;
  let viewRenderers = {};
  let isPanelOpen = true;

  // CSS phong cách Dark CAD Pro
  const CSS = `
    #point-detect-root {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      color: #e5e5e5;
    }
    #point-detect-root * { box-sizing: border-box; margin: 0; padding: 0; }

    /* Nút khởi chạy thu nhỏ đáy trái màn hình */
    .pd-launcher {
      position: fixed; left: 16px; bottom: 10px; z-index: 2147483640;
      background: #141414; color: #d4d4d4; border: 1px solid #333;
      border-radius: 6px; padding: 6px 12px; font-weight: 600; font-size: 12px;
      cursor: pointer; display: flex; align-items: center; gap: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.6); transition: all 0.15s ease;
      user-select: none;
    }
    .pd-launcher:hover { background: #1f1f1f; border-color: #10b981; color: #fff; }
    .pd-launcher .dot { width: 7px; height: 7px; border-radius: 50%; background: #10b981; }

    /* Bảng điều khiển chính neo đáy */
    .pd-panel {
      position: fixed; left: 12px; right: 12px; bottom: 8px; z-index: 2147483640;
      background: #141414; border: 1px solid #303030; border-radius: 8px;
      box-shadow: 0 -8px 32px rgba(0,0,0,0.75); display: flex; flex-direction: column;
      max-height: 380px; overflow: hidden; transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .pd-panel.pd-collapsed { display: none !important; }

    /* Header của bảng */
    .pd-head {
      background: #1a1a1a; border-bottom: 1px solid #2a2a2a;
      padding: 6px 12px; display: flex; align-items: center; justify-content: space-between;
    }
    .pd-head-left { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 12px; }
    .pd-head-right { display: flex; align-items: center; gap: 8px; }

    .pd-close-btn {
      background: transparent; border: none; color: #888; font-size: 16px;
      cursor: pointer; padding: 2px 6px; border-radius: 4px;
    }
    .pd-close-btn:hover { background: #262626; color: #fff; }

    /* Nội dung bảng gồm 3 cột */
    .pd-body {
      display: grid;
      grid-template-columns: 240px 300px 1fr;
      gap: 12px;
      padding: 10px;
      background: #141414;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    /* Section Card */
    .pd-card {
      background: #1a1a1a; border: 1px solid #262626; border-radius: 6px;
      padding: 8px 10px; display: flex; flex-direction: column; gap: 8px;
      overflow-y: auto;
    }
    .pd-card-title {
      font-size: 11px; font-weight: 700; color: #8c8c8c; text-transform: uppercase;
      letter-spacing: 0.5px; border-bottom: 1px solid #262626; padding-bottom: 4px;
      display: flex; justify-content: space-between; align-items: center;
    }

    /* Điều khiển slider và toggle */
    .pd-field { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11px; }
    .pd-field input[type="range"] {
      flex: 1; accent-color: #10b981; cursor: pointer; height: 4px; background: #333;
    }
    .pd-val { font-family: monospace; font-weight: 600; color: #fff; min-width: 30px; text-align: right; }

    /* Button dạng kỹ thuật */
    .pd-btn {
      background: #242424; color: #e5e5e5; border: 1px solid #383838;
      border-radius: 4px; padding: 5px 8px; font-size: 11px; font-weight: 600;
      cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      gap: 5px; transition: all 0.12s ease; user-select: none;
    }
    .pd-btn:hover { background: #2f2f2f; border-color: #555; color: #fff; }
    .pd-btn.active { background: #064e3b; border-color: #10b981; color: #34d399; }
    .pd-btn-primary { background: #10b981; border-color: #10b981; color: #fff; }
    .pd-btn-primary:hover { background: #059669; border-color: #059669; }

    /* Grid Preset nút */
    .pd-preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }

    /* Khung 3 góc chiếu trực giao */
    .pd-views-container {
      display: flex; gap: 8px; flex: 1; min-height: 0; min-width: 0;
    }

    /* Cảnh báo va chạm / Hộp rỗng */
    .pd-alert-box {
      background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5; border-radius: 4px; padding: 6px 8px; font-size: 11px;
    }
    .pd-badge-green { background: #064e3b; color: #34d399; padding: 2px 6px; border-radius: 3px; font-size: 10px; }
  `;

  // Gắn Shadow DOM hoặc Container vào trang
  const host = document.createElement('div');
  host.id = 'point-detect-root';
  document.body.appendChild(host);

  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  host.appendChild(styleEl);

  // Tạo UI phần tử
  const launcher = h('div', {
    class: 'pd-launcher',
    onClick: () => togglePanel(true),
  },
    h('div', { class: 'dot' }),
    h('span', {}, 'PointDetect 3D'),
    h('span', { id: 'pdLauncherStats', style: { color: '#888', fontWeight: 'normal' } }, 'Đang kết nối...')
  );

  const panel = h('div', { class: 'pd-panel' });
  host.appendChild(launcher);
  host.appendChild(panel);

  function togglePanel(open) {
    isPanelOpen = open !== undefined ? open : !isPanelOpen;
    panel.classList.toggle('pd-collapsed', !isPanelOpen);
    launcher.style.display = isPanelOpen ? 'none' : 'flex';
    if (isPanelOpen) renderAll();
  }

  // Khung nhìn 3 góc trực giao
  const viewsWrapper = h('div', { class: 'pd-views-container' });

  panel.innerHTML = '';
  panel.append(
    // 1. Header
    h('div', { class: 'pd-head' },
      h('div', { class: 'pd-head-left' },
        h('span', { style: { color: '#10b981' } }, '● PointDetect 3D'),
        h('span', { style: { color: '#888', fontWeight: 'normal' } }, '| Trợ lý gán nhãn 3D Detection'),
        kbd('Alt+D')
      ),
      h('div', { class: 'pd-head-right' },
        h('button', {
          class: 'pd-btn',
          onClick: () => navigateObject(false),
          title: 'Vật thể trước [Shift+Tab]',
        }, '◀ Trước', kbd('Shift+Tab')),
        h('button', {
          class: 'pd-btn',
          onClick: () => navigateObject(true),
          title: 'Vật thể tiếp theo [Tab]',
        }, 'Tiếp ▶', kbd('Tab')),
        h('button', {
          class: 'pd-close-btn',
          onClick: () => togglePanel(false),
          title: 'Thu nhỏ',
        }, '✕')
      )
    ),

    // 2. Body
    h('div', { class: 'pd-body' },
      // CỘT 1: THỊ GIÁC (VISUAL CONTROLS)
      h('div', { class: 'pd-card' },
        h('div', { class: 'pd-card-title' },
          h('span', {}, 'Nâng cao Thị giác'),
          h('span', { class: 'pd-badge-green' }, 'LiDAR Boost')
        ),

        // Lọc mặt đất
        h('button', {
          class: `pd-btn ${visualState.hideGround ? 'active' : ''}`,
          id: 'btnHideGround',
          onClick: () => {
            visualState.hideGround = !visualState.hideGround;
            document.getElementById('btnHideGround').classList.toggle('active', visualState.hideGround);
            renderViews();
          },
        }, 'Ẩn điểm mặt đất', visualState.hideGround ? ' [BẬT]' : ' [TẮT]'),

        // Dải màu
        h('div', { class: 'pd-field' },
          h('span', {}, 'Bảng màu:'),
          h('select', {
            style: { background: '#242424', color: '#fff', border: '1px solid #333', borderRadius: '3px', padding: '3px 6px' },
            onChange: (e) => {
              visualState.colorMode = e.target.value;
              renderViews();
            },
          },
            h('option', { value: 'turbo' }, 'Turbo-LiDAR (Rực rỡ)'),
            h('option', { value: 'night' }, 'Night Vision (Dạ quang)')
          )
        ),

        // Cỡ hạt điểm (Point Size)
        h('div', { class: 'pd-field' },
          h('span', {}, 'Cỡ hạt điểm:'),
          h('input', {
            type: 'range', min: '1.0', max: '8.0', step: '0.5', value: visualState.pointSize,
            onInput: (e) => {
              visualState.pointSize = parseFloat(e.target.value);
              document.getElementById('valPointSize').textContent = visualState.pointSize + 'px';
              PD.bridge.setVisualOptions({ pointSize: visualState.pointSize });
              renderViews();
            },
          }),
          h('span', { class: 'pd-val', id: 'valPointSize' }, visualState.pointSize + 'px')
        ),

        // Tăng sáng phản xạ (Intensity Gain)
        h('div', { class: 'pd-field' },
          h('span', {}, 'Tăng sáng:'),
          h('input', {
            type: 'range', min: '0.5', max: '3.0', step: '0.1', value: visualState.intensityGain,
            onInput: (e) => {
              visualState.intensityGain = parseFloat(e.target.value);
              document.getElementById('valGain').textContent = visualState.intensityGain + 'x';
              renderViews();
            },
          }),
          h('span', { class: 'pd-val', id: 'valGain' }, visualState.intensityGain + 'x')
        ),

        // Cắt biên lề (Crop Margin)
        h('div', { class: 'pd-field' },
          h('span', {}, 'Cắt biên:'),
          h('input', {
            type: 'range', min: '0.3', max: '3.0', step: '0.1', value: visualState.cropMargin,
            onInput: (e) => {
              visualState.cropMargin = parseFloat(e.target.value);
              document.getElementById('valMargin').textContent = visualState.cropMargin + 'm';
              renderViews();
            },
          }),
          h('span', { class: 'pd-val', id: 'valMargin' }, visualState.cropMargin + 'm')
        )
      ),

      // CỘT 2: CÔNG CỤ CAD & PRESET CHUẨN ADAS
      h('div', { class: 'pd-card' },
        h('div', { class: 'pd-card-title' },
          h('span', {}, 'Thao tác Nhanh'),
          h('span', { id: 'pdActiveObjText', style: { color: '#10b981', fontWeight: 'bold' } }, 'Chưa chọn vật thể')
        ),

        // Thao tác 1 chạm Đảo đầu & Hút đất
        h('div', { style: { display: 'flex', gap: '6px' } },
          h('button', {
            class: 'pd-btn', style: { flex: 1 },
            onClick: () => executeFlip(),
            title: 'Đảo đầu xe 180 độ [F]',
          }, 'Đảo đầu 180°', kbd('F')),
          h('button', {
            class: 'pd-btn', style: { flex: 1 },
            onClick: () => executeSnapGround(),
            title: 'Hút đáy sát mặt đất [G]',
          }, 'Hút sát đất', kbd('G'))
        ),

        // Thông tin kích thước & số điểm
        h('div', { id: 'pdDimInfo', style: { fontSize: '11px', color: '#aaa', background: '#111', padding: '6px', borderRadius: '4px' } },
          'Kích thước: -- x -- x -- | Điểm LiDAR: --'
        ),

        // Preset kích thước chuẩn ADAS
        h('div', { style: { fontSize: '11px', color: '#888', marginTop: '2px' } }, 'Preset kích thước chuẩn (Neo đáy):'),
        h('div', { class: 'pd-preset-grid' },
          ...PD.cadTools.presets.map((p) =>
            h('button', {
              class: 'pd-btn',
              onClick: () => applyPreset(p.id),
              title: `${p.name}: ${p.l}m x ${p.w}m x ${p.h}m [${p.shortcut}]`,
            }, `${p.name}`, kbd(p.shortcut))
          )
        ),

        // Hộp cảnh báo va chạm IoU (Nếu có)
        h('div', { id: 'pdAlertArea' })
      ),

      // CỘT 3: BỘ 3 GÓC CHIẾU TRỰC GIAO (TOP, SIDE, FRONT)
      h('div', { class: 'pd-card', style: { padding: '4px', overflow: 'hidden' } },
        viewsWrapper
      )
    )
  );

  // Khởi tạo 3 View Renderers
  viewRenderers = {
    top: new PD.views.ViewRenderer(viewsWrapper, 'top'),
    side: new PD.views.ViewRenderer(viewsWrapper, 'side'),
    front: new PD.views.ViewRenderer(viewsWrapper, 'front'),
  };

  async function fetchState() {
    try {
      currentState = await PD.bridge.getState();
      if (!currentState || !currentState.ready) return;

      // Cập nhật điểm LiDAR nếu chưa có
      if (!cachedPoints || !cachedPoints.points.length) {
        cachedPoints = await PD.bridge.getScenePoints();
        if (cachedPoints && cachedPoints.points.length) {
          Object.values(viewRenderers).forEach((v) => v.setData(cachedPoints.points));
        }
      }

      renderAll();
    } catch (err) {
      console.warn('[PointDetect] fetchState:', err);
    }
  }

  function renderAll() {
    if (!currentState || !currentState.ready) return;

    // Cập nhật launcher
    const cuboidCount = currentState.cuboids ? currentState.cuboids.length : 0;
    const launcherStats = document.getElementById('pdLauncherStats');
    if (launcherStats) {
      launcherStats.textContent = `${cuboidCount} vật thể`;
    }

    // Cập nhật active object
    const activeText = document.getElementById('pdActiveObjText');
    const dimInfo = document.getElementById('pdDimInfo');
    const alertArea = document.getElementById('pdAlertArea');

    if (currentState.activeCuboid) {
      const b = G.pointsToBox(currentState.activeCuboid.points);
      const labelName = currentState.activeCuboid.label?.name || 'Vật thể';
      if (activeText) activeText.textContent = `#${currentState.activeId} ${labelName}`;

      if (b && dimInfo) {
        let ptsInBox = 0;
        if (cachedPoints && cachedPoints.points) {
          ptsInBox = G.countPointsInBox(cachedPoints.points, b);
        }
        dimInfo.innerHTML = `L: <b>${fmtNum(b.size[0])}m</b> | W: <b>${fmtNum(b.size[1])}m</b> | H: <b>${fmtNum(b.size[2])}m</b><br>Đám mây điểm: <b style="color:${ptsInBox > 0 ? '#34d399' : '#f87171'}">${ptsInBox} điểm</b>`;
      }
    } else {
      if (activeText) activeText.textContent = 'Chưa chọn vật thể';
      if (dimInfo) dimInfo.textContent = 'Click vào một vật thể để xem chi tiết';
    }

    // Quét cảnh báo va chạm
    if (alertArea && currentState.cuboids) {
      const overlaps = PD.cadTools.findOverlaps(currentState.cuboids);
      if (overlaps.length > 0) {
        alertArea.innerHTML = `
          <div class="pd-alert-box">
            ⚠️ Phát hiện <b>${overlaps.length} cặp vật thể</b> đè lấn nhau (IoU 3D > 8%)
          </div>
        `;
      } else {
        alertArea.innerHTML = '';
      }
    }

    renderViews();
  }

  function renderViews() {
    if (!currentState || !currentState.activeCuboid) {
      Object.values(viewRenderers).forEach((v) => v.render(null));
      return;
    }
    const b = G.pointsToBox(currentState.activeCuboid.points);
    Object.values(viewRenderers).forEach((v) => v.render(b, visualState));
  }

  async function executeFlip() {
    if (!currentState?.activeId) return;
    await PD.cadTools.flipHeading(currentState.activeId);
    await fetchState();
  }

  async function executeSnapGround() {
    if (!currentState?.activeId) return;
    const res = await PD.cadTools.snapToGround(currentState.activeId);
    if (res && res.success) {
      await fetchState();
    } else {
      alert(res?.reason || 'Không thể hút mặt đất (chưa đủ dữ liệu điểm)');
    }
  }

  async function applyPreset(presetId) {
    if (!currentState?.activeId) {
      alert('Vui lòng click chọn 1 vật thể trước khi áp Preset');
      return;
    }
    await PD.cadTools.applyPreset(currentState.activeId, presetId);
    await fetchState();
  }

  async function navigateObject(forward) {
    if (!currentState?.cuboids || !currentState.cuboids.length) return;
    const next = PD.cadTools.getNextObject(currentState.cuboids, currentState.activeId, forward);
    if (next) {
      await PD.bridge.activateObject(next.clientID);
      await fetchState();
    }
  }

  // Quản lý phím tắt
  window.addEventListener('keydown', (e) => {
    // Alt + D: Bật / Tắt panel
    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      togglePanel();
      return;
    }

    // Nếu đang gõ text vào input thì không bắt phím tắt
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

    // Các phím tắt khi panel đang mở
    if (isPanelOpen && currentState?.activeId) {
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        executeFlip();
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        executeSnapGround();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        navigateObject(!e.shiftKey);
      } else if (['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
        const p = PD.cadTools.presets.find((x) => x.shortcut === e.key);
        if (p) {
          e.preventDefault();
          applyPreset(p.id);
        }
      }
    }
  });

  // Lắng nghe thay đổi từ CVAT
  PD.bridge.onEvent((evt) => {
    if (evt.type === 'cvat-state-changed') {
      fetchState();
    }
  });

  // Tinh chỉnh Z nhanh bằng Alt + Lăn chuột trên Perspective Canvas
  window.addEventListener('wheel', (e) => {
    if (e.altKey && currentState?.activeId) {
      e.preventDefault();
      const deltaZ = e.deltaY < 0 ? 0.05 : -0.05;
      PD.cadTools.adjustZ(currentState.activeId, deltaZ).then(fetchState);
    }
  }, { passive: false });

  // Định kỳ cập nhật nhẹ
  setInterval(fetchState, 1500);

  console.log('[PointDetect 3D] Giao diện Pro HUD đã sẵn sàng!');
})();
