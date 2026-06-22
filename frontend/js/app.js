import { initDashboard } from './components/dashboard.js';
import { initServices } from './components/services.js';
import { initFiles } from './components/files.js';
import { initTerminal } from './components/terminal.js';
import { initNetwork } from './components/network.js';
import { SSEClient } from './sse.js';
import { api } from './api.js';
import { formatBytes, showConfirm, showToast } from './utils.js';

// Route mapping
const routes = {
    '#dashboard': initDashboard,
    '#services': initServices,
    '#files': initFiles,
    '#terminal': initTerminal,
    '#network': initNetwork,
};

let currentCleanup = null;

function handleRoute() {
    const hash = window.location.hash || '#dashboard';
    const container = document.getElementById('main-content');
    
    if (!container) return;

    // 1. Run cleanup callback of previous active component
    if (typeof currentCleanup === 'function') {
        try {
            currentCleanup();
        } catch (e) {
            console.error("Error during page cleanup:", e);
        }
        currentCleanup = null;
    }

    // 2. Initialize new view
    const initFn = routes[hash];
    if (initFn) {
        currentCleanup = initFn(container);
    } else {
        window.location.hash = '#dashboard';
        return;
    }
}

// Global Live Clock & Greetings
function initClock() {
    const topClock = document.getElementById('topbar-clock');
    const widgetClock = document.getElementById('widget-clock-time');
    const widgetDate = document.getElementById('widget-clock-date');
    const widgetGreet = document.getElementById('widget-clock-greet');

    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

    function update() {
        const now = new Date();
        const hrs = now.getHours().toString().padStart(2, '0');
        const mins = now.getMinutes().toString().padStart(2, '0');
        const secs = now.getSeconds().toString().padStart(2, '0');

        // Topbar simple clock (HH:MM)
        if (topClock) topClock.textContent = `${hrs}:${mins}`;

        // Sidebar widget detailed clock
        if (widgetClock) widgetClock.textContent = `${hrs}:${mins}:${secs}`;

        // Sidebar date
        if (widgetDate) {
            const dayName = days[now.getDay()];
            const dayVal = now.getDate().toString().padStart(2, '0');
            const monthVal = (now.getMonth() + 1).toString().padStart(2, '0');
            widgetDate.textContent = `${dayName}, ngày ${dayVal}/${monthVal}/${now.getFullYear()}`;
        }

        // Greeting
        if (widgetGreet) {
            const h = now.getHours();
            if (h < 5) widgetGreet.textContent = 'Chào đêm muộn, Pi!';
            else if (h < 12) widgetGreet.textContent = 'Chào buổi sáng, Pi!';
            else if (h < 18) widgetGreet.textContent = 'Chào buổi chiều, Pi!';
            else widgetGreet.textContent = 'Chào buổi tối, Pi!';
        }
    }

    update();
    setInterval(update, 1000);
}

// Global System Resource Monitor (SSE)
function initGlobalStats() {
    const sse = new SSEClient('/api/system/stream', updateGlobalWidgets, updateConnectionStatus);
    sse.connect();
}

function updateGlobalWidgets(stats) {
    // 1. Dispatch custom event for active pages (like dashboard system details card)
    document.dispatchEvent(new CustomEvent('systemstats', { detail: stats }));

    // Update global app state container data attribute for alert level pulsing effects
    const appEl = document.getElementById('app');
    if (appEl) {
        appEl.dataset.alertLevel = stats.alert_level;
    }

    // 2. Update Left Panel Gauges
    // CPU
    updateGauge('gauge-cpu', 'gauge-cpu-val', stats.cpu.percent);
    const cpuFreqEl = document.getElementById('sb-cpu-freq');
    if (cpuFreqEl) {
        cpuFreqEl.textContent = stats.cpu.freq_mhz ? `${Math.round(stats.cpu.freq_mhz)} MHz` : '—';
    }

    // RAM
    updateGauge('gauge-ram', 'gauge-ram-val', stats.ram.percent);
    const ramTotalEl = document.getElementById('sb-ram-total');
    if (ramTotalEl) {
        ramTotalEl.textContent = `${formatBytes(stats.ram.used_bytes)} / ${formatBytes(stats.ram.total_bytes)}`;
    }

    // Disk
    updateGauge('gauge-disk', 'gauge-disk-val', stats.disk.percent);
    const diskTotalEl = document.getElementById('sb-disk-total');
    if (diskTotalEl) {
        diskTotalEl.textContent = `${formatBytes(stats.disk.used_bytes)} / ${formatBytes(stats.disk.total_bytes)}`;
    }

    // Temperature
    const tempValEl = document.getElementById('gauge-temp-val');
    const tempContainer = document.getElementById('gauge-temp');
    if (stats.cpu_temp_celsius !== null) {
        updateGauge('gauge-temp', 'gauge-temp-val', stats.cpu_temp_celsius);
        if (tempValEl) tempValEl.textContent = `${Math.round(stats.cpu_temp_celsius)}°C`;
    } else {
        if (tempContainer) tempContainer.style.setProperty('--progress', '0');
        if (tempValEl) tempValEl.textContent = 'N/A';
    }
}

function updateGauge(containerId, valueId, percent) {
    const container = document.getElementById(containerId);
    const valEl = document.getElementById(valueId);
    if (!container) return;

    const roundedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    container.style.setProperty('--progress', roundedPercent);
    if (valEl && containerId !== 'gauge-temp') {
        valEl.textContent = `${roundedPercent}%`;
    }
}

function updateConnectionStatus(status) {
    const dot = document.getElementById('conn-dot');
    const text = document.getElementById('conn-text');
    if (!dot || !text) return;

    if (status === 'connected') {
        dot.className = 'status-dot status-dot--active';
        text.textContent = 'Đã kết nối';
    } else if (status === 'connecting') {
        dot.className = 'status-dot status-dot--inactive';
        text.textContent = 'Đang kết nối...';
    } else {
        dot.className = 'status-dot status-dot--failed';
        text.textContent = 'Mất kết nối';
    }
}

// Global System Controls
function initGlobalControls() {
    const btnReboot = document.getElementById('btn-reboot');
    const btnShutdown = document.getElementById('btn-shutdown');

    if (btnReboot) {
        btnReboot.addEventListener('click', async () => {
            const confirm = await showConfirm(
                'Bạn chắc chắn muốn khởi động lại Raspberry Pi? Quá trình này sẽ làm mất kết nối hiện tại.',
                'Khởi động lại Pi'
            );
            if (confirm) {
                try {
                    showToast('Đang gửi lệnh khởi động lại...', 'warning');
                    const res = await api.post('/system/reboot');
                    showToast(res.message, 'success');
                } catch (err) {
                    showToast(`Lỗi: ${err.message}`, 'error');
                }
            }
        });
    }

    if (btnShutdown) {
        btnShutdown.addEventListener('click', async () => {
            const confirm = await showConfirm(
                'Bạn chắc chắn muốn TẮT Raspberry Pi? Thiết bị sẽ dừng hoạt động và cần được bật lại thủ công bằng phần cứng.',
                'Tắt Pi'
            );
            if (confirm) {
                try {
                    showToast('Đang gửi lệnh tắt thiết bị...', 'danger');
                    const res = await api.post('/system/shutdown');
                    showToast(res.message, 'success');
                } catch (err) {
                    showToast(`Lỗi: ${err.message}`, 'error');
                }
            }
        });
    }
}

// Bind routing and bootstrap listeners
window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', () => {
    initClock();
    initGlobalStats();
    initGlobalControls();
    handleRoute();
});
