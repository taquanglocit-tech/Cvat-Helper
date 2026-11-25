// src/core/ui.js - Tiện ích khởi tạo DOM và định dạng giao diện chuẩn Dark CAD
// Tác giả: PointDetect Team

(() => {
  const PD = (globalThis.PointDetect ||= {});

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'class') {
        el.className = v;
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (k in el && typeof v !== 'string') {
        el[k] = v;
      } else {
        el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function kbd(text) {
    return h('kbd', {
      style: {
        background: '#262626',
        border: '1px solid #404040',
        borderRadius: '3px',
        padding: '1px 5px',
        fontSize: '10px',
        lineHeight: '14px',
        color: '#a3a3a3',
        fontFamily: 'monospace',
        fontWeight: '600',
        marginLeft: '4px',
        userSelect: 'none',
      },
    }, text);
  }

  function fmtNum(n, decimals = 2) {
    if (n === null || n === undefined || isNaN(n)) return '--';
    return Number(n).toFixed(decimals);
  }

  PD.ui = {
    h,
    kbd,
    fmtNum,
  };
})();
