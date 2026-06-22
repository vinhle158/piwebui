import { formatUptime } from '../utils.js';

export function initDashboard(container) {
    container.innerHTML = getDashboardHTML();

    const handleStats = (e) => {
        const stats = e.detail;
        updateStats(stats);
    };

    // Listen to global system stats event
    document.addEventListener('systemstats', handleStats);

    // Return cleanup to remove event listener
    return () => {
        document.removeEventListener('systemstats', handleStats);
    };
}

function getDashboardHTML() {
    return `
        <div class="page-enter">
            <div class="page-header">
                <h1>Ứng dụng Hệ thống</h1>
            </div>
            
            <div style="display: flex; flex-direction: row; gap: var(--sp-6); flex-wrap: wrap;">
                <!-- Main Apps Grid -->
                <div style="flex: 2 1 500px;">
                    <div class="app-grid">
                        <!-- Services Manager -->
                        <a class="app-card" href="#services">
                            <div class="app-icon-wrapper" style="background: linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%);">
                                <svg class="app-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <use href="assets/icons/icons.svg#server"></use>
                                </svg>
                            </div>
                            <div class="app-name">Dịch vụ</div>
                            <div class="app-desc">Quản lý và theo dõi các tiến trình systemd</div>
                        </a>
                        
                        <!-- File Manager -->
                        <a class="app-card" href="#files">
                            <div class="app-icon-wrapper" style="background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);">
                                <svg class="app-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <use href="assets/icons/icons.svg#folder"></use>
                                </svg>
                            </div>
                            <div class="app-name">Tệp tin</div>
                            <div class="app-desc">Duyệt, chỉnh sửa và truyền tải file hệ thống</div>
                        </a>
                        
                        <!-- Web Terminal -->
                        <a class="app-card" href="#terminal">
                            <div class="app-icon-wrapper" style="background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);">
                                <svg class="app-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <use href="assets/icons/icons.svg#terminal"></use>
                                </svg>
                            </div>
                            <div class="app-name">Terminal</div>
                            <div class="app-desc">Kết nối dòng lệnh SSH trực tuyến nhanh chóng</div>
                        </a>
                        
                        <!-- Network Configurations -->
                        <a class="app-card" href="#network">
                            <div class="app-icon-wrapper" style="background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);">
                                <svg class="app-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <use href="assets/icons/icons.svg#globe"></use>
                                </svg>
                            </div>
                            <div class="app-name">Mạng & VPN</div>
                            <div class="app-desc">Cấu hình mạng IP và quản lý VPN WireGuard</div>
                        </a>
                    </div>
                </div>
                
                <!-- Detailed Info Card -->
                <div style="flex: 1 1 280px;">
                    <div class="card widget">
                        <h3 class="widget__title">
                            <svg class="nav-icon" style="width: 18px; height: 18px; color: var(--primary);" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <use href="assets/icons/icons.svg#info"></use>
                            </svg>
                            Trạng thái chi tiết
                        </h3>
                        <div class="widget__content">
                            <div class="info-line">
                                <span class="info-line__label">Uptime</span>
                                <span class="info-line__value" id="uptime-value">—</span>
                            </div>
                            <div class="info-line">
                                <span class="info-line__label">Load Average</span>
                                <span class="info-line__value" id="load-value">—</span>
                            </div>
                            <div class="info-line">
                                <span class="info-line__label">Tần số CPU</span>
                                <span class="info-line__value" id="freq-value">—</span>
                            </div>
                            <div class="info-line">
                                <span class="info-line__label">Cảnh báo</span>
                                <span class="info-line__value" id="alert-value">—</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateStats(stats) {
    setText('uptime-value', formatUptime(stats.uptime_seconds));
    setText('load-value', stats.load_avg.map(n => n.toFixed(2)).join(' · '));
    setText('freq-value', stats.cpu.freq_mhz ? `${Math.round(stats.cpu.freq_mhz)} MHz` : '—');
    
    const alertValueEl = document.getElementById('alert-value');
    if (alertValueEl) {
        alertValueEl.textContent = stats.alert_level.toUpperCase();
        alertValueEl.className = 'info-line__value'; // Reset alert level classes
        if (stats.alert_level === 'danger') {
            alertValueEl.style.color = 'var(--danger)';
        } else if (stats.alert_level === 'warning') {
            alertValueEl.style.color = 'var(--warning)';
        } else {
            alertValueEl.style.color = 'var(--success)';
        }
    }
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
