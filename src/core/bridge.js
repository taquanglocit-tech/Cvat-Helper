// src/core/bridge.js - Client phía Content Script để giao tiếp với bridge-main.js
// Cung cấp API dạng Promise mượt mà và không giật lag

(() => {
  const PD = (globalThis.PointDetect ||= {});

  const REQ = 'point-detect:req';
  const RES = 'point-detect:res';
  const EVT = 'point-detect:evt';

  let reqId = 0;
  const pending = new Map();
  const listeners = new Set();

  document.addEventListener(RES, (e) => {
    let msg = null;
    try { msg = JSON.parse(e.detail); } catch { return; }
    const { id, ok, result, error } = msg;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(result);
    else p.reject(new Error(error || 'Lỗi không xác định'));
  });

  document.addEventListener(EVT, (e) => {
    let data = null;
    try { data = JSON.parse(e.detail); } catch { return; }
    listeners.forEach((fn) => {
      try { fn(data); } catch (err) { console.error('[PointDetect Bridge Event Error]', err); }
    });
  });

  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++reqId;
      pending.set(id, { resolve, reject });
      document.dispatchEvent(new CustomEvent(REQ, {
        detail: JSON.stringify({ id, method, params }),
      }));
      // Timeout an toàn sau 5s nếu bridge-main chưa phản hồi
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timeout khi gọi phương thức ${method}`));
        }
      }, 5000);
    });
  }

  function onEvent(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  PD.bridge = {
    call,
    onEvent,
    getState: () => call('getState'),
    getScenePoints: () => call('getScenePoints'),
    activateObject: (clientID) => call('activateObject', { clientID }),
    flipHeading: (clientID) => call('flipHeading', { clientID }),
    applyPresetDimensions: (clientID, length, width, height) =>
      call('applyPresetDimensions', { clientID, length, width, height }),
    adjustZ: (clientID, deltaZ) => call('adjustZ', { clientID, deltaZ }),
    snapToGround: (clientID) => call('snapToGround', { clientID }),
    changeLabel: (clientID, labelId) => call('changeLabel', { clientID, labelId }),
    setVisualOptions: (opts) => call('setVisualOptions', opts),
    refresh: () => call('refresh'),
  };
})();
