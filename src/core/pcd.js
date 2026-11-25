// src/core/pcd.js - Giải mã dữ liệu PCD (Point Cloud Data)
// Hỗ trợ tọa độ X, Y, Z và Cường độ phản xạ Intensity cho cả ascii, binary, binary_compressed (LZF)
// Tác giả: PointDetect Team

(() => {
  const PD = (globalThis.PointDetect ||= {});

  function lzfDecompress(input, outLength) {
    const out = new Uint8Array(outLength);
    let ip = 0, op = 0;
    while (ip < input.length) {
      let ctrl = input[ip++];
      if (ctrl < 32) {
        ctrl += 1;
        if (op + ctrl > outLength) throw new Error('LZF: dữ liệu hỏng');
        out.set(input.subarray(ip, ip + ctrl), op);
        ip += ctrl; op += ctrl;
      } else {
        let len = ctrl >> 5;
        let ref = op - ((ctrl & 0x1f) << 8) - 1;
        if (len === 7) len += input[ip++];
        ref -= input[ip++];
        len += 2;
        if (ref < 0 || op + len > outLength) throw new Error('LZF: dữ liệu hỏng');
        for (let k = 0; k < len; k++) out[op++] = out[ref++];
      }
    }
    return out;
  }

  function reader(view, type, size) {
    if (type === 'F' && size === 4) return (o) => view.getFloat32(o, true);
    if (type === 'F' && size === 8) return (o) => view.getFloat64(o, true);
    if (type === 'I' && size === 1) return (o) => view.getInt8(o);
    if (type === 'I' && size === 2) return (o) => view.getInt16(o, true);
    if (type === 'I' && size === 4) return (o) => view.getInt32(o, true);
    if (type === 'U' && size === 1) return (o) => view.getUint8(o);
    if (type === 'U' && size === 2) return (o) => view.getUint16(o, true);
    if (type === 'U' && size === 4) return (o) => view.getUint32(o, true);
    return () => 0;
  }

  function parse(bytes) {
    let headerEnd = -1;
    const limit = Math.min(bytes.length, 65536);
    const td = new TextDecoder();
    let lineStart = 0;
    const header = {};

    for (let i = 0; i < limit; i++) {
      if (bytes[i] === 10) {
        const line = td.decode(bytes.subarray(lineStart, i)).trim();
        lineStart = i + 1;
        if (line.startsWith('#') || !line) continue;
        const [k, ...rest] = line.split(/\s+/);
        header[k.toLowerCase()] = rest.join(' ');
        if (k.toLowerCase() === 'data') {
          headerEnd = i + 1;
          break;
        }
      }
    }

    if (headerEnd < 0) throw new Error('PCD: Không tìm thấy header DATA');

    const fields = (header.fields || '').split(/\s+/);
    const size = (header.size || '').split(/\s+/).map(Number);
    const type = (header.type || '').split(/\s+/);
    const count = (header.count || '').split(/\s+/).map(Number);
    const points = Number(header.points || header.width || 0);
    const dataType = (header.data || 'ascii').trim().toLowerCase();

    const xi = fields.indexOf('x');
    const yi = fields.indexOf('y');
    const zi = fields.indexOf('z');
    const ii = fields.indexOf('intensity');

    const xyz = new Float32Array(points * 3);
    const intensity = new Float32Array(points);

    if (dataType === 'binary') {
      const dataView = new DataView(bytes.buffer, bytes.byteOffset + headerEnd);
      let pointStep = 0;
      const offsets = [];
      const readers = [];

      for (let f = 0; f < fields.length; f++) {
        offsets.push(pointStep);
        readers.push(reader(dataView, type[f], size[f]));
        pointStep += size[f] * (count[f] || 1);
      }

      for (let p = 0; p < points; p++) {
        const base = p * pointStep;
        xyz[p * 3] = readers[xi](base + offsets[xi]);
        xyz[p * 3 + 1] = readers[yi](base + offsets[yi]);
        xyz[p * 3 + 2] = readers[zi](base + offsets[zi]);
        if (ii >= 0) intensity[p] = readers[ii](base + offsets[ii]);
      }
    } else if (dataType === 'ascii') {
      const text = td.decode(bytes.subarray(headerEnd));
      const lines = text.trim().split(/\r?\n/);
      for (let p = 0; p < Math.min(points, lines.length); p++) {
        const parts = lines[p].trim().split(/\s+/);
        xyz[p * 3] = parseFloat(parts[xi]);
        xyz[p * 3 + 1] = parseFloat(parts[yi]);
        xyz[p * 3 + 2] = parseFloat(parts[zi]);
        if (ii >= 0) intensity[p] = parseFloat(parts[ii]);
      }
    }

    return { xyz, intensity, points };
  }

  PD.pcd = { parse, lzfDecompress };
})();
