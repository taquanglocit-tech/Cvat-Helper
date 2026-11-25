// register.js - Quản lý đăng ký Content Scripts theo Origin cho PointDetect 3D
// Cơ chế Zero-API / RAM-over-ROM

const CONTENT_SCRIPT_ID = 'point-detect-3d';
const BRIDGE_SCRIPT_ID = 'point-detect-3d-bridge';

const CONTENT_SCRIPT_FILES = [
  'src/core/ui.js',
  'src/core/geom.js',
  'src/core/pcd.js',
  'src/core/bridge.js',
  'src/core/visual-enhancer.js',
  'src/core/views.js',
  'src/core/cad-tools.js',
  'src/core/app.js',
];

function normalizeOrigin(raw) {
  const url = new URL(String(raw).trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Chỉ hỗ trợ giao thức http:// hoặc https://');
  }
  return url.origin;
}

function originToPermission(origin) {
  return `${origin}/*`;
}

async function getOrigins() {
  const { origins } = await chrome.storage.local.get('point_detect_origins');
  return Array.isArray(origins) ? origins : [];
}

async function syncContentScripts() {
  const origins = await getOrigins();
  const granted = [];
  for (const origin of origins) {
    if (await chrome.permissions.contains({ origins: [originToPermission(origin)] })) {
      granted.push(origin);
    }
  }

  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID, BRIDGE_SCRIPT_ID] });
  if (existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  }
  if (!granted.length) return granted;

  const matches = [...new Set(granted.map(originToPermission))];
  await chrome.scripting.registerContentScripts([
    {
      id: CONTENT_SCRIPT_ID,
      matches,
      js: CONTENT_SCRIPT_FILES,
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
    {
      // Chạy trong ngữ cảnh trang (world: MAIN) để kết nối trực tiếp với window.cvatUI
      id: BRIDGE_SCRIPT_ID,
      matches,
      js: ['src/core/bridge-main.js'],
      world: 'MAIN',
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
  return granted;
}
