// src/core/views.js - Bộ dựng hình 3 góc nhìn trực giao WebGL2 (Top/BEV, Side, Front) cho Detection
// Tối ưu hóa độ tương phản LiDAR, Lọc mặt đất, Crop hẹp quanh vật thể
// Tác giả: PointDetect Team

(() => {
  const PD = (globalThis.PointDetect ||= {});
  const G = PD.geom;

  const VIEWS = {
    top: { u: 'ex', v: 'ey', d: 'ez', ui: 0, vi: 1, di: 2, label: 'TOP (BEV - Nhìn từ trên)' },
    side: { u: 'ex', v: 'ez', d: 'ey', ui: 0, vi: 2, di: 1, label: 'SIDE (Nhìn ngang hông)' },
    front: { u: 'ey', v: 'ez', d: 'ex', ui: 1, vi: 2, di: 0, label: 'FRONT (Nhìn mặt trước)' },
  };

  const VS = `#version 300 es
    in vec3 aPos;
    in float aIntensity;
    uniform vec3 uC, uU, uV, uD;
    uniform vec2 uScale, uDepth, uPan;
    uniform float uPointSize, uCropMargin, uColorMode, uHideGround, uHeatmapGain;
    uniform vec3 uBC, uBx, uBy, uBz, uBHalf;
    out vec3 vCol;
    out float vAlpha;

    vec3 turboColor(float t) {
      float x = clamp(t, 0.0, 1.0);
      x = pow(x, 0.72);
      if (x < 0.20) {
        return mix(vec3(0.12, 0.05, 0.45), vec3(0.05, 0.52, 0.92), x / 0.20);
      } else if (x < 0.45) {
        return mix(vec3(0.05, 0.52, 0.92), vec3(0.10, 0.88, 0.38), (x - 0.20) / 0.25);
      } else if (x < 0.70) {
        return mix(vec3(0.10, 0.88, 0.38), vec3(0.98, 0.86, 0.10), (x - 0.45) / 0.25);
      } else if (x < 0.88) {
        return mix(vec3(0.98, 0.86, 0.10), vec3(1.00, 0.22, 0.08), (x - 0.70) / 0.18);
      }
      return mix(vec3(1.00, 0.22, 0.08), vec3(1.00, 0.96, 0.96), (x - 0.88) / 0.12);
    }

    void main() {
      vec3 b = aPos - uBC;
      vec3 q = vec3(dot(b, uBx), dot(b, uBy), dot(b, uBz));

      // 1. Cắt bỏ điểm ở xa ngoài lề crop margin
      if (uCropMargin > 0.0 && any(greaterThan(abs(q), uBHalf + vec3(uCropMargin)))) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        return;
      }

      // 2. Ẩn mặt đất theo trục Z cục bộ của đáy hộp (-uBHalf.z)
      if (uHideGround > 0.5 && q.z < -uBHalf.z + 0.08) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        return;
      }

      vec3 w = aPos - uC;
      float d = dot(w, uD);
      if (d < uDepth.x || d > uDepth.y) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        return;
      }

      gl_Position = vec4(dot(w, uU) * uScale.x + uPan.x, dot(w, uV) * uScale.y + uPan.y, 0.0, 1.0);

      // Điểm nằm trong hay ngoài hộp
      bool inside = all(lessThanEqual(abs(q), uBHalf));
      float normI = clamp(aIntensity * uHeatmapGain, 0.0, 1.0);

      if (uColorMode > 0.5) {
        // Mode Turbo-LiDAR
        vec3 heat = turboColor(normI);
        vCol = inside ? heat * 1.15 : heat * 0.75;
        vAlpha = inside ? 1.0 : 0.65;
        gl_PointSize = inside ? uPointSize * 1.15 : uPointSize;
      } else {
        // Mode High Contrast Night Vision (Lục huỳnh quang dạ quang)
        vec3 neon = vec3(0.2, 0.95, 0.4) * (0.5 + 0.5 * normI);
        vCol = inside ? neon : neon * 0.5;
        vAlpha = inside ? 1.0 : 0.6;
        gl_PointSize = uPointSize;
      }
    }
  `;

  const FS = `#version 300 es
    precision mediump float;
    in vec3 vCol;
    in float vAlpha;
    out vec4 outColor;
    void main() {
      outColor = vec4(vCol, vAlpha);
    }
  `;

  function createShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Lỗi compile shader: ' + err);
    }
    return s;
  }

  class ViewRenderer {
    constructor(containerEl, viewKey) {
      this.viewKey = viewKey;
      this.cfg = VIEWS[viewKey];
      this.container = containerEl;
      this.zoom = 1.0;
      this.pan = [0, 0];
      this.isDragging = false;
      this.lastMouse = [0, 0];

      this.initDom();
      this.initGL();
      this.bindEvents();
    }

    initDom() {
      this.wrapper = document.createElement('div');
      this.wrapper.className = `pd-view-cell pd-view-${this.viewKey}`;
      this.wrapper.style.cssText = `
        position: relative; flex: 1; min-height: 140px; background: #0d0d0d;
        border: 1px solid #262626; border-radius: 4px; overflow: hidden;
      `;

      this.badge = document.createElement('div');
      this.badge.style.cssText = `
        position: absolute; top: 6px; left: 8px; z-index: 5;
        font-size: 10px; font-weight: 600; color: #8c8c8c;
        background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 3px;
        pointer-events: none; text-transform: uppercase; letter-spacing: 0.5px;
      `;
      this.badge.textContent = this.cfg.label;

      this.canvasGL = document.createElement('canvas');
      this.canvasGL.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%;';

      this.canvas2D = document.createElement('canvas');
      this.canvas2D.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;';

      this.wrapper.appendChild(this.canvasGL);
      this.wrapper.appendChild(this.canvas2D);
      this.wrapper.appendChild(this.badge);
      this.container.appendChild(this.wrapper);

      this.ctx2d = this.canvas2D.getContext('2d');
    }

    initGL() {
      const gl = this.canvasGL.getContext('webgl2', { antialias: true, alpha: true });
      if (!gl) return;
      this.gl = gl;

      const vs = createShader(gl, gl.VERTEX_SHADER, VS);
      const fs = createShader(gl, gl.FRAGMENT_SHADER, FS);
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);

      this.prog = prog;
      this.posBuf = gl.createBuffer();
      this.intBuf = gl.createBuffer();

      this.locs = {
        aPos: gl.getAttribLocation(prog, 'aPos'),
        aIntensity: gl.getAttribLocation(prog, 'aIntensity'),
        uC: gl.getUniformLocation(prog, 'uC'),
        uU: gl.getUniformLocation(prog, 'uU'),
        uV: gl.getUniformLocation(prog, 'uV'),
        uD: gl.getUniformLocation(prog, 'uD'),
        uScale: gl.getUniformLocation(prog, 'uScale'),
        uDepth: gl.getUniformLocation(prog, 'uDepth'),
        uPan: gl.getUniformLocation(prog, 'uPan'),
        uPointSize: gl.getUniformLocation(prog, 'uPointSize'),
        uCropMargin: gl.getUniformLocation(prog, 'uCropMargin'),
        uColorMode: gl.getUniformLocation(prog, 'uColorMode'),
        uHideGround: gl.getUniformLocation(prog, 'uHideGround'),
        uHeatmapGain: gl.getUniformLocation(prog, 'uHeatmapGain'),
        uBC: gl.getUniformLocation(prog, 'uBC'),
        uBx: gl.getUniformLocation(prog, 'uBx'),
        uBy: gl.getUniformLocation(prog, 'uBy'),
        uBz: gl.getUniformLocation(prog, 'uBz'),
        uBHalf: gl.getUniformLocation(prog, 'uBHalf'),
      };
    }

    bindEvents() {
      this.wrapper.addEventListener('mousedown', (e) => {
        if (e.button === 0 || e.button === 1) {
          this.isDragging = true;
          this.lastMouse = [e.clientX, e.clientY];
          e.preventDefault();
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastMouse[0];
        const dy = e.clientY - this.lastMouse[1];
        this.lastMouse = [e.clientX, e.clientY];

        const w = this.canvasGL.clientWidth || 200;
        const h = this.canvasGL.clientHeight || 150;
        this.pan[0] += (dx / w) * 2;
        this.pan[1] -= (dy / h) * 2;
        this.render();
      });

      window.addEventListener('mouseup', () => { this.isDragging = false; });

      this.wrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        this.zoom = Math.min(Math.max(this.zoom * factor, 0.2), 8.0);
        this.render();
      }, { passive: false });

      this.wrapper.addEventListener('dblclick', () => {
        this.zoom = 1.0;
        this.pan = [0, 0];
        this.render();
      });

      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.wrapper);
    }

    resize() {
      const w = this.wrapper.clientWidth;
      const h = this.wrapper.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;

      this.canvasGL.width = w * dpr;
      this.canvasGL.height = h * dpr;
      this.canvas2D.width = w * dpr;
      this.canvas2D.height = h * dpr;
      this.render();
    }

    setData(pointsArray, intensityArray) {
      if (!this.gl || !pointsArray) return;
      const gl = this.gl;
      this.pointCount = pointsArray.length / 3;

      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pointsArray), gl.DYNAMIC_DRAW);

      const ints = intensityArray && intensityArray.length === this.pointCount
        ? new Float32Array(intensityArray)
        : new Float32Array(this.pointCount).fill(0.5);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.intBuf);
      gl.bufferData(gl.ARRAY_BUFFER, ints, gl.DYNAMIC_DRAW);
    }

    render(activeBox, options = {}) {
      if (!this.gl || !this.prog) return;
      const gl = this.gl;
      const w = this.canvasGL.width;
      const h = this.canvasGL.height;
      if (!w || !h) return;

      gl.viewport(0, 0, w, h);
      gl.clearColor(0.05, 0.05, 0.05, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      this.ctx2d.clearRect(0, 0, w, h);

      if (!activeBox || !this.pointCount) return;

      const ax = G.axes(activeBox.r);
      const uVec = ax[this.cfg.u];
      const vVec = ax[this.cfg.v];
      const dVec = ax[this.cfg.d];

      const aspect = w / h;
      const maxDim = Math.max(activeBox.size[0], activeBox.size[1], activeBox.size[2]) * 1.5;
      const baseScale = 2.0 / maxDim;

      const scaleX = (baseScale * this.zoom) / aspect;
      const scaleY = baseScale * this.zoom;

      gl.useProgram(this.prog);

      // Nạp uniforms
      gl.uniform3fv(this.locs.uC, activeBox.c);
      gl.uniform3fv(this.locs.uU, uVec);
      gl.uniform3fv(this.locs.uV, vVec);
      gl.uniform3fv(this.locs.uD, dVec);
      gl.uniform2f(this.locs.uScale, scaleX, scaleY);
      gl.uniform2f(this.locs.uPan, this.pan[0], this.pan[1]);
      gl.uniform2f(this.locs.uDepth, -100, 100);

      gl.uniform1f(this.locs.uPointSize, (options.pointSize || 3.0) * (window.devicePixelRatio || 1));
      gl.uniform1f(this.locs.uCropMargin, options.cropMargin !== undefined ? options.cropMargin : 1.2);
      gl.uniform1f(this.locs.uColorMode, options.colorMode === 'night' ? 0.0 : 1.0);
      gl.uniform1f(this.locs.uHideGround, options.hideGround ? 1.0 : 0.0);
      gl.uniform1f(this.locs.uHeatmapGain, options.intensityGain || 1.3);

      gl.uniform3fv(this.locs.uBC, activeBox.c);
      gl.uniform3fv(this.locs.uBx, ax.ex);
      gl.uniform3fv(this.locs.uBy, ax.ey);
      gl.uniform3fv(this.locs.uBz, ax.ez);
      gl.uniform3f(this.locs.uBHalf, activeBox.size[0] / 2, activeBox.size[1] / 2, activeBox.size[2] / 2);

      // Kích hoạt buffers
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.enableVertexAttribArray(this.locs.aPos);
      gl.vertexAttribPointer(this.locs.aPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.intBuf);
      gl.enableVertexAttribArray(this.locs.aIntensity);
      gl.vertexAttribPointer(this.locs.aIntensity, 1, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, this.pointCount);

      // Vẽ viền hộp 2D trên Canvas 2D
      this.drawBox2D(activeBox, scaleX, scaleY, w, h);
    }

    drawBox2D(box, scaleX, scaleY, w, h) {
      const ctx = this.ctx2d;
      const cx = (w / 2) + (this.pan[0] * w / 2);
      const cy = (h / 2) - (this.pan[1] * h / 2);

      let boxW = 0, boxH = 0;
      if (this.viewKey === 'top') {
        boxW = box.size[0] * scaleX * (w / 2);
        boxH = box.size[1] * scaleY * (h / 2);
      } else if (this.viewKey === 'side') {
        boxW = box.size[0] * scaleX * (w / 2);
        boxH = box.size[2] * scaleY * (h / 2);
      } else if (this.viewKey === 'front') {
        boxW = box.size[1] * scaleX * (w / 2);
        boxH = box.size[2] * scaleY * (h / 2);
      }

      ctx.save();
      ctx.translate(cx, cy);

      // Viền hộp nét đứt dạ quang
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5 * (window.devicePixelRatio || 1);
      ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

      // Mũi tên chỉ hướng trước (Head arrow) cho Top và Side view
      if (this.viewKey === 'top' || this.viewKey === 'side') {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        const arrowX = boxW / 2;
        ctx.moveTo(arrowX + 8, 0);
        ctx.lineTo(arrowX, -5);
        ctx.lineTo(arrowX, 5);
        ctx.closePath();
        ctx.fill();
      }

      // Tâm chữ thập nhỏ
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
      ctx.moveTo(0, -6); ctx.lineTo(0, 6);
      ctx.stroke();

      ctx.restore();
    }
  }

  PD.views = {
    ViewRenderer,
  };
})();
