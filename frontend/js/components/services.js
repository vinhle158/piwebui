import { api } from '../api.js';
import { showToast } from '../utils.js';

export function initServices(container) {
    container.innerHTML = `
        <div class="page-enter">
            <div class="page-header">
                <h1>Quản lý Dịch vụ</h1>
                <button class="btn btn--sm btn--secondary" id="btn-refresh-services">
                    ↻ Làm mới
                </button>
            </div>
            <div class="service-list" id="service-list">
                <!-- Skeleton loading -->
                ${Array(4).fill('<div class="service-card skeleton" style="height:80px"></div>').join('')}
            </div>
        </div>`;

    loadServices();
    
    const refreshBtn = document.getElementById('btn-refresh-services');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadServices);
    }

    // Return cleanup function to maintain consistency with router lifecycle
    return () => {};
}

async function loadServices() {
    const list = document.getElementById('service-list');
    if (!list) return;

    try {
        const data = await api.get('/services');
        if (!list) return; // Guard against navigation while fetching
        
        list.innerHTML = data.services.map(s => renderServiceCard(s)).join('');
        
        // Bind event listeners to control buttons
        list.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => handleServiceAction(
                btn.dataset.service, btn.dataset.action, btn
            ));
        });
    } catch (e) {
        showToast(`Lỗi tải services: ${e.message}`, 'error');
    }
}

function renderServiceCard(service) {
    const statusClass = service.active ? 'active' : (service.status === 'failed' ? 'failed' : 'inactive');
    return `
        <div class="service-card" id="svc-${service.name}">
            <div class="service-card__info">
                <span class="status-dot status-dot--${statusClass}"></span>
                <div>
                    <div class="service-card__name">${service.name}</div>
                    <div class="service-card__desc">${service.description || service.status}</div>
                </div>
                <span class="badge badge--${statusClass}">${service.status}</span>
            </div>
            <div class="service-card__actions">
                <button class="btn btn--sm btn--success" data-service="${service.name}" data-action="start" ${service.active ? 'disabled' : ''}>Start</button>
                <button class="btn btn--sm btn--danger"  data-service="${service.name}" data-action="stop"  ${!service.active ? 'disabled' : ''}>Stop</button>
                <button class="btn btn--sm btn--primary" data-service="${service.name}" data-action="restart">Restart</button>
            </div>
        </div>`;
}

async function handleServiceAction(name, action, btn) {
    const card = document.getElementById(`svc-${name}`);
    if (card) card.classList.add('loading');
    
    // Disable all action buttons on the card during processing
    const buttons = card ? card.querySelectorAll('.btn') : [btn];
    buttons.forEach(b => b.disabled = true);
    
    try {
        await api.post(`/services/${name}/${action}`);
        showToast(`${action.toUpperCase()} dịch vụ '${name}' thành công`, 'success');
        await loadServices(); // Reload list to update statuses
    } catch (e) {
        showToast(`Lỗi: ${e.message}`, 'error');
        if (card) card.classList.remove('loading');
        // Re-enable buttons if action failed
        await loadServices(); // Re-sync ui state
    }
}
