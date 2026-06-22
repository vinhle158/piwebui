import { api } from '../api.js';
import { showToast } from '../utils.js';

export function initNetwork(container) {
    container.innerHTML = `
        <div class="page-enter">
            <div class="page-header" role="heading" aria-level="1">
                <h1>Mạng & VPN</h1>
                <button class="btn btn--sm btn--secondary" id="btn-refresh-network" aria-label="Làm mới thông tin mạng">
                    <svg class="nav-icon net-refresh-icon" aria-hidden="true"><use href="assets/icons/icons.svg#refresh-cw"></use></svg> Làm mới
                </button>
            </div>
            
            <div class="widget-grid">
                <!-- WireGuard Card -->
                <section class="card widget" id="vpn-card" aria-labelledby="vpn-title">
                    <div class="widget__title" id="vpn-title">
                        <svg class="brand-icon net-widget-icon" aria-hidden="true"><use href="assets/icons/icons.svg#activity"></use></svg>
                        <span>Trạng thái WireGuard VPN</span>
                    </div>
                    <div class="widget__content" id="vpn-content">
                        <!-- Skeleton loading -->
                        <div class="skeleton net-skeleton-widget"></div>
                    </div>
                </section>

                <!-- Network Summary Card -->
                <section class="card widget" id="net-summary-card" aria-labelledby="summary-title">
                    <div class="widget__title" id="summary-title">
                        <svg class="brand-icon net-widget-icon" aria-hidden="true"><use href="assets/icons/icons.svg#info"></use></svg>
                        <span>Thông tin Chung</span>
                    </div>
                    <div class="widget__content" id="net-summary-content">
                        <!-- Skeleton loading -->
                        <div class="skeleton net-skeleton-widget"></div>
                    </div>
                </section>
            </div>

            <!-- Interfaces Card -->
            <section class="card net-card-spacing" aria-labelledby="interfaces-title">
                <div class="widget__title" id="interfaces-title">
                    <svg class="brand-icon net-widget-icon" aria-hidden="true"><use href="assets/icons/icons.svg#server"></use></svg>
                    <span>Giao tiếp Mạng (Interfaces)</span>
                </div>
                <div id="interfaces-container">
                    <!-- Skeleton loading -->
                    <div class="service-list">
                        ${Array(3).fill('<div class="service-card skeleton net-skeleton-row"></div>').join('')}
                    </div>
                </div>
            </section>
        </div>
    `;

    loadNetworkData();

    const refreshBtn = document.getElementById('btn-refresh-network');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const svg = refreshBtn.querySelector('svg');
            if (svg) {
                // Toggle rotation style
                svg.style.transform = svg.style.transform === 'rotate(360deg)' ? 'rotate(0deg)' : 'rotate(360deg)';
            }
            loadNetworkData();
        });
    }

    // Return cleanup function to maintain consistency with router lifecycle
    return () => {};
}

async function loadNetworkData() {
    const vpnContent = document.getElementById('vpn-content');
    const netSummaryContent = document.getElementById('net-summary-content');
    const interfacesContainer = document.getElementById('interfaces-container');

    try {
        const data = await api.get('/network');
        
        if (!vpnContent || !netSummaryContent || !interfacesContainer) return;

        // Render WireGuard VPN Card
        const vpnStatusClass = data.wireguard_active ? 'active' : 'inactive';
        const vpnStatusText = data.wireguard_active ? 'Đang hoạt động (Active)' : 'Không hoạt động (Inactive)';
        vpnContent.innerHTML = `
            <div class="info-line">
                <span class="info-line__label">Trạng thái VPN</span>
                <span class="info-line__value vpn-status-wrapper">
                    <span class="status-dot status-dot--${vpnStatusClass}" aria-hidden="true"></span>
                    <span class="badge badge--${vpnStatusClass}">${vpnStatusText}</span>
                </span>
            </div>
            <div class="info-line">
                <span class="info-line__label">Thiết bị Kết nối (Peers)</span>
                <span class="info-line__value mono-bold">
                    ${data.wireguard_peers} peers
                </span>
            </div>
            <div class="info-line">
                <span class="info-line__label">Kiểu kết nối</span>
                <span class="info-line__value">Direct P2P VPN</span>
            </div>
        `;

        // Render Network Summary Card
        const upCount = data.interfaces.filter(i => i.is_up).length;
        netSummaryContent.innerHTML = `
            <div class="info-line">
                <span class="info-line__label">Tổng số giao tiếp</span>
                <span class="info-line__value">${data.interfaces.length} interfaces</span>
            </div>
            <div class="info-line">
                <span class="info-line__label">Giao tiếp đang hoạt động</span>
                <span class="info-line__value net-success-bold">
                    ${upCount} UP
                </span>
            </div>
            <div class="info-line">
                <span class="info-line__label">WireGuard Driver</span>
                <span class="info-line__value">Kernel module / wg-quick</span>
            </div>
        `;

        // Render Interfaces list
        if (data.interfaces.length === 0) {
            interfacesContainer.innerHTML = `
                <div class="empty-placeholder">
                    <svg class="file-icon net-widget-icon" aria-hidden="true"><use href="assets/icons/icons.svg#info"></use></svg>
                    <p>Không tìm thấy giao tiếp mạng nào.</p>
                </div>
            `;
        } else {
            interfacesContainer.innerHTML = `
                <div class="service-list">
                    ${data.interfaces.map(iface => renderInterfaceCard(iface)).join('')}
                </div>
            `;
        }
    } catch (e) {
        showToast(`Lỗi tải dữ liệu mạng: ${e.message}`, 'error');
    }
}

function renderInterfaceCard(iface) {
    const statusClass = iface.is_up ? 'active' : 'inactive';
    const statusText = iface.is_up ? 'UP' : 'DOWN';
    const speedText = iface.speed_mbps ? `${iface.speed_mbps} Mbps` : '—';
    const ipText = iface.ip_address || 'Chưa gán IP';
    const macText = iface.mac_address || 'Không khả dụng';

    return `
        <div class="service-card net-interface-card">
            <div class="service-card__info net-interface-info">
                <div class="net-interface-header">
                    <span class="status-dot status-dot--${statusClass}" aria-hidden="true"></span>
                    <span class="service-card__name mono-bold">${iface.name}</span>
                    <span class="badge badge--${statusClass} net-interface-badge">${statusText}</span>
                </div>
                <div class="net-interface-details">
                    <div>
                        <span class="net-detail-label">IP Address:</span>
                        <div class="net-detail-value-primary">${ipText}</div>
                    </div>
                    <div>
                        <span class="net-detail-label">MAC Address:</span>
                        <div class="net-detail-value-secondary">${macText}</div>
                    </div>
                    <div>
                        <span class="net-detail-label">Tốc độ tối đa:</span>
                        <div class="net-detail-value-secondary">${speedText}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
