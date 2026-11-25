// popup.js - Quản lý popup 1-chạm bật/tắt PointDetect 3D trên tab CVAT

document.addEventListener('DOMContentLoaded', async () => {
  const originText = document.getElementById('originText');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const toggleBtn = document.getElementById('toggleBtn');
  const injectBtn = document.getElementById('injectBtn');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    originText.textContent = 'Không nhận diện được tab';
    toggleBtn.disabled = true;
    return;
  }

  let origin = null;
  try {
    const url = new URL(tab.url);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      origin = url.origin;
    }
  } catch { /* URL không hợp lệ */ }

  if (!origin) {
    originText.textContent = 'Trang này không hỗ trợ (chỉ http/https)';
    statusText.textContent = 'Không hỗ trợ';
    toggleBtn.disabled = true;
    return;
  }

  originText.textContent = origin;

  async function checkActive() {
    const origins = await getOrigins();
    const hasInStorage = origins.includes(origin);
    const hasPermission = await chrome.permissions.contains({ origins: [originToPermission(origin)] });
    return hasInStorage && hasPermission;
  }

  async function updateUI() {
    const isActive = await checkActive();
    if (isActive) {
      statusText.textContent = 'Đang hoạt động';
      statusBadge.className = 'status-badge active';
      toggleBtn.textContent = 'Tắt trên trang này';
      toggleBtn.className = 'btn btn-danger';
      injectBtn.style.display = 'flex';
    } else {
      statusText.textContent = 'Chưa kích hoạt';
      statusBadge.className = 'status-badge inactive';
      toggleBtn.textContent = 'Kích hoạt trên trang này';
      toggleBtn.className = 'btn btn-primary';
      injectBtn.style.display = 'none';
    }
  }

  await updateUI();

  toggleBtn.addEventListener('click', async () => {
    const isActive = await checkActive();
    toggleBtn.disabled = true;

    try {
      if (!isActive) {
        // Cấp quyền cho domain hiện tại
        const granted = await chrome.permissions.request({ origins: [originToPermission(origin)] });
        if (!granted) {
          alert('Cần cấp quyền truy cập để PointDetect 3D có thể kết nối với CVAT');
          toggleBtn.disabled = false;
          return;
        }

        const origins = await getOrigins();
        if (!origins.includes(origin)) {
          origins.push(origin);
          await chrome.storage.local.set({ point_detect_origins: origins });
        }
        await syncContentScripts();

        // Kích hoạt ngay vào tab
        await injectIntoTab(tab.id);
      } else {
        // Thu hồi quyền
        let origins = await getOrigins();
        origins = origins.filter((o) => o !== origin);
        await chrome.storage.local.set({ point_detect_origins: origins });
        await chrome.permissions.remove({ origins: [originToPermission(origin)] }).catch(() => {});
        await syncContentScripts();
        alert('Đã tắt PointDetect 3D trên trang này. Hãy tải lại trang (F5) nếu muốn xóa hoàn toàn giao diện.');
      }
    } catch (err) {
      console.error(err);
      alert('Đã xảy ra lỗi: ' + err.message);
    } finally {
      toggleBtn.disabled = false;
      await updateUI();
    }
  });

  injectBtn.addEventListener('click', async () => {
    injectBtn.disabled = true;
    await injectIntoTab(tab.id);
    injectBtn.textContent = '✓ Đã nạp thành công!';
    setTimeout(() => {
      injectBtn.textContent = 'Nạp ngay vào tab (không cần F5)';
      injectBtn.disabled = false;
    }, 1500);
  });

  async function injectIntoTab(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/core/bridge-main.js'],
        world: 'MAIN'
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: CONTENT_SCRIPT_FILES
      });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#10b981' }).catch(() => {});
      await chrome.action.setBadgeText({ tabId, text: 'DET' }).catch(() => {});
    } catch (e) {
      console.warn('[Popup] Nạp script trực tiếp:', e);
    }
  }
});
