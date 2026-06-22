/**
 * Formats a size in bytes to a human-readable string.
 * @param {number} bytes 
 * @param {number} decimals 
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Formats uptime in seconds to a human-readable days/hours/minutes string.
 * @param {number} seconds 
 * @returns {string}
 */
export function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0 || d > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);

    return parts.join(' ');
}

/**
 * Displays a toast notification on the screen.
 * @param {string} message 
 * @param {'success' | 'error' | 'warning' | 'info'} type 
 * @param {number} duration 
 */
export function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    
    // Add corresponding icon or layout if desired, here just text
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Trigger transition
    setTimeout(() => {
        toast.classList.add('toast--visible');
    }, 10);
    
    // Auto remove
    setTimeout(() => {
        toast.classList.remove('toast--visible');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        });
    }, duration);
}

/**
 * Renders a custom confirmation modal overlay instead of blocking window.confirm.
 * @param {string} message 
 * @param {string} [title="Xác nhận"]
 * @returns {Promise<boolean>} Resolves to true if approved, false if cancelled.
 */
export function showConfirm(message, title = "Xác nhận") {
    return new Promise((resolve) => {
        // Create modal DOM structure
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        overlay.innerHTML = `
            <div class="modal">
                <h3 class="modal__title">${title}</h3>
                <div class="modal__body">${message}</div>
                <div class="modal__footer">
                    <button class="btn btn--secondary btn--sm" id="confirm-btn-cancel">Hủy</button>
                    <button class="btn btn--primary btn--sm" id="confirm-btn-ok">Xác nhận</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Trigger transition
        setTimeout(() => {
            overlay.classList.add('open');
        }, 10);
        
        const cleanup = (value) => {
            overlay.classList.remove('open');
            overlay.addEventListener('transitionend', () => {
                overlay.remove();
                resolve(value);
            });
        };
        
        overlay.querySelector('#confirm-btn-cancel').addEventListener('click', () => cleanup(false));
        overlay.querySelector('#confirm-btn-ok').addEventListener('click', () => cleanup(true));
        
        // Close on clicking overlay outside the modal
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup(false);
            }
        });
    });
}
