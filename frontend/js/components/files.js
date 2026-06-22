import { api } from '../api.js';
import { formatBytes, showToast, showConfirm } from '../utils.js';

let currentPath = '';
let parentPath = null;

export function initFiles(container) {
    container.innerHTML = `
        <div class="page-enter">
            <div class="page-header">
                <h1>Quản lý Files</h1>
                <div class="file-manager__action-group">
                    <button class="btn btn--secondary btn--sm" id="btn-refresh-files">
                        <svg class="btn-icon" style="width:14px;height:14px;"><use href="assets/icons/icons.svg#refresh-cw"></use></svg>
                        Làm mới
                    </button>
                </div>
            </div>
            
            <div class="file-manager">
                <!-- Breadcrumbs & Directory Action bar -->
                <div class="file-manager__actions">
                    <div class="breadcrumbs" id="breadcrumbs">
                        <!-- Breadcrumbs dynamically rendered -->
                    </div>
                    
                    <div class="file-manager__action-group">
                        <button class="btn btn--secondary btn--sm" id="btn-new-folder">
                            <svg class="btn-icon" style="width:14px;height:14px;stroke-width:2.5;"><use href="assets/icons/icons.svg#plus"></use></svg>
                            Thư mục mới
                        </button>
                        <button class="btn btn--secondary btn--sm" id="btn-new-file">
                            <svg class="btn-icon" style="width:14px;height:14px;stroke-width:2.5;"><use href="assets/icons/icons.svg#plus"></use></svg>
                            Tạo file mới
                        </button>
                        <button class="btn btn--primary btn--sm" id="btn-upload-file">
                            <svg class="btn-icon" style="width:14px;height:14px;"><use href="assets/icons/icons.svg#upload"></use></svg>
                            Tải lên File
                        </button>
                        <input type="file" id="file-upload-input" style="display: none;">
                    </div>
                </div>
                
                <!-- File Listing Table -->
                <table class="file-table">
                    <thead>
                        <tr>
                            <th>Tên</th>
                            <th style="width: 120px;">Dung lượng</th>
                            <th style="width: 200px;">Ngày cập nhật</th>
                            <th style="width: 150px; text-align: right;">Hành động</th>
                        </tr>
                    </thead>
                    <tbody id="file-list-body">
                        <!-- Dynamic file list rows -->
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Event listeners
    document.getElementById('btn-refresh-files')?.addEventListener('click', () => loadFiles(currentPath));
    document.getElementById('btn-new-folder')?.addEventListener('click', handleNewFolder);
    document.getElementById('btn-new-file')?.addEventListener('click', handleNewFile);
    
    const fileUploadInput = document.getElementById('file-upload-input');
    document.getElementById('btn-upload-file')?.addEventListener('click', () => fileUploadInput?.click());
    fileUploadInput?.addEventListener('change', handleFileUpload);

    // Initial load
    loadFiles();

    // Return cleanup (none required for this component as it does not hold persistent streams)
    return () => {};
}

async function loadFiles(path = '') {
    const listBody = document.getElementById('file-list-body');
    if (!listBody) return;

    // Render skeleton loading
    listBody.innerHTML = Array(4).fill(`
        <tr class="skeleton-row">
            <td colspan="4">
                <div class="skeleton" style="height: 48px; width: 100%; margin: var(--sp-1) 0;"></div>
            </td>
        </tr>
    `).join('');

    try {
        const queryPath = path ? `?path=${encodeURIComponent(path)}` : '';
        const data = await api.get(`/files${queryPath}`);
        
        currentPath = data.path;
        parentPath = data.parent;
        
        renderBreadcrumbs();
        renderFileList(data.entries);
    } catch (e) {
        showToast(`Lỗi tải thư mục: ${e.message}`, 'error');
        listBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-placeholder">
                    <svg class="icon-danger" fill="none" stroke="currentColor"><use href="assets/icons/icons.svg#info"></use></svg>
                    <p style="color: var(--danger);">Không thể truy cập thư mục: ${e.message}</p>
                </td>
            </tr>
        `;
    }
}

function renderBreadcrumbs() {
    const container = document.getElementById('breadcrumbs');
    if (!container) return;

    // We can parse the currentPath
    // On Linux paths are split by '/', on Windows they could be split by '\' or '/'
    // Let's normalize backslashes to forward slashes first
    const normalizedPath = currentPath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(p => p !== '');
    
    let html = `
        <span class="breadcrumbs__item" id="breadcrumb-root">
            <svg class="breadcrumbs__home"><use href="assets/icons/icons.svg#home"></use></svg>
            <span>Home</span>
        </span>
    `;

    let accumulatedPath = '';
    // Determine path separator and drive prefix if Windows
    const isWindowsAbsolute = /^[A-Za-z]:/.test(normalizedPath);
    
    parts.forEach((part, index) => {
        if (index === 0 && isWindowsAbsolute) {
            // For Windows drives (e.g. C:), it will be C:
            accumulatedPath = part;
        } else {
            accumulatedPath += (accumulatedPath ? '/' : '') + part;
        }
        
        // Ensure drive has trailing slash in Windows if it's just the drive
        let targetPath = accumulatedPath;
        if (isWindowsAbsolute && accumulatedPath.length === 2) {
            targetPath += '/';
        }

        html += `
            <svg class="breadcrumbs__separator"><use href="assets/icons/icons.svg#chevron-right"></use></svg>
            <span class="breadcrumbs__item" data-path="${targetPath}">
                <span>${part}</span>
            </span>
        `;
    });

    container.innerHTML = html;

    // Bind event listeners to breadcrumbs
    container.querySelector('#breadcrumb-root')?.addEventListener('click', () => loadFiles(''));
    container.querySelectorAll('.breadcrumbs__item[data-path]').forEach(item => {
        item.addEventListener('click', () => loadFiles(item.dataset.path));
    });

    // Make the last item active (disabled click)
    const items = container.querySelectorAll('.breadcrumbs__item');
    if (items.length > 0) {
        items[items.length - 1].classList.add('active');
    }
}

function renderFileList(entries) {
    const listBody = document.getElementById('file-list-body');
    if (!listBody) return;

    if (!entries || entries.length === 0) {
        listBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-placeholder">
                    <svg fill="none" stroke="currentColor"><use href="assets/icons/icons.svg#folder"></use></svg>
                    <p>Thư mục trống</p>
                </td>
            </tr>
        `;
        return;
    }

    listBody.innerHTML = entries.map(item => {
        const iconType = item.is_dir ? 'folder' : 'file';
        const iconClass = item.is_dir ? 'file-icon--dir' : 'file-icon--file';
        const sizeText = item.is_dir ? '—' : formatBytes(item.size_bytes);
        const dateText = formatDate(item.modified_at);

        return `
            <tr class="file-row" id="row-${btoa(encodeURIComponent(item.path)).replace(/=/g, '')}">
                <td>
                    <div class="file-cell--name" data-path="${item.path}" data-isdir="${item.is_dir}">
                        <svg class="file-icon ${iconClass}">
                            <use href="assets/icons/icons.svg#${iconType}"></use>
                        </svg>
                        <span class="file-name-text">${item.name}</span>
                    </div>
                </td>
                <td>
                    <span class="file-cell--size">${sizeText}</span>
                </td>
                <td>
                    <span class="file-cell--date">${dateText}</span>
                </td>
                <td>
                    <div class="file-cell--actions">
                        ${!item.is_dir ? `
                            <button class="btn btn--secondary btn--sm btn-edit-file" data-path="${item.path}">
                                <svg style="width:12px;height:12px;"><use href="assets/icons/icons.svg#edit"></use></svg>
                                Sửa
                            </button>
                        ` : ''}
                        <button class="btn btn--danger btn--sm btn-delete-file" data-path="${item.path}" data-name="${item.name}">
                            <svg style="width:12px;height:12px;"><use href="assets/icons/icons.svg#trash"></use></svg>
                            Xóa
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Bind item click to navigate or edit
    listBody.querySelectorAll('.file-cell--name').forEach(el => {
        el.addEventListener('click', () => {
            const path = el.dataset.path;
            const isDir = el.dataset.isdir === 'true';
            if (isDir) {
                loadFiles(path);
            } else {
                handleEditFile(path);
            }
        });
    });

    // Bind action buttons
    listBody.querySelectorAll('.btn-edit-file').forEach(btn => {
        btn.addEventListener('click', () => handleEditFile(btn.dataset.path));
    });

    listBody.querySelectorAll('.btn-delete-file').forEach(btn => {
        btn.addEventListener('click', () => handleDelete(btn.dataset.path, btn.dataset.name));
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        return d.toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch {
        return dateStr;
    }
}

// Handler functions

async function handleNewFolder() {
    const folderName = await showPrompt('Nhập tên thư mục mới:', '', 'Tạo Thư Mục');
    if (!folderName) return;

    // Build absolute path
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const folderPath = currentPath + (currentPath.endsWith(sep) ? '' : sep) + folderName;

    try {
        await api.post(`/files/folder?path=${encodeURIComponent(folderPath)}`);
        showToast(`Đã tạo thư mục '${folderName}'`, 'success');
        loadFiles(currentPath);
    } catch (e) {
        showToast(`Lỗi tạo thư mục: ${e.message}`, 'error');
    }
}

async function handleNewFile() {
    const fileName = await showPrompt('Nhập tên file mới (ví dụ: config.json):', '', 'Tạo File Mới');
    if (!fileName) return;

    const sep = currentPath.includes('\\') ? '\\' : '/';
    const filePath = currentPath + (currentPath.endsWith(sep) ? '' : sep) + fileName;

    try {
        // Create an empty file using PUT /api/files/content
        await api.put('/files/content', { path: filePath, content: '' });
        showToast(`Đã tạo file '${fileName}'`, 'success');
        loadFiles(currentPath);
        // Open the editor for the newly created file
        handleEditFile(filePath);
    } catch (e) {
        showToast(`Lỗi tạo file: ${e.message}`, 'error');
    }
}

async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const btnUpload = document.getElementById('btn-upload-file');
    const originalText = btnUpload ? btnUpload.innerHTML : 'Tải lên File';
    if (btnUpload) {
        btnUpload.disabled = true;
        btnUpload.textContent = 'Đang tải lên...';
    }

    try {
        await api.post(`/files/upload?path=${encodeURIComponent(currentPath)}`, formData);
        showToast(`Đã tải lên file '${file.name}' thành công`, 'success');
        loadFiles(currentPath);
    } catch (err) {
        showToast(`Lỗi tải lên: ${err.message}`, 'error');
    } finally {
        if (btnUpload) {
            btnUpload.disabled = false;
            btnUpload.innerHTML = originalText;
        }
        // Reset file input value to allow uploading the same file again
        e.target.value = '';
    }
}

async function handleDelete(path, name) {
    if (await showConfirm(`Bạn chắc chắn muốn xóa '${name}'? Thao tác này không thể hoàn tác.`)) {
        const rowId = btoa(encodeURIComponent(path)).replace(/=/g, '');
        const row = document.getElementById(`row-${rowId}`);
        if (row) row.classList.add('loading');

        try {
            await api.delete(`/files?path=${encodeURIComponent(path)}`);
            showToast(`Đã xóa '${name}'`, 'success');
            loadFiles(currentPath);
        } catch (e) {
            showToast(`Lỗi khi xóa: ${e.message}`, 'error');
            if (row) row.classList.remove('loading');
        }
    }
}

async function handleEditFile(path) {
    try {
        const data = await api.get(`/files/content?path=${encodeURIComponent(path)}`);
        openEditor(data.path, data.content);
    } catch (e) {
        showToast(`Lỗi mở file: ${e.message}`, 'error');
    }
}

function openEditor(filePath, initialContent = '') {
    const fileName = filePath.split(/[/\\]/).pop();
    const overlay = document.createElement('div');
    overlay.className = 'editor-modal';
    
    overlay.innerHTML = `
        <div class="editor">
            <div class="editor__header">
                <span class="editor__title">${fileName}</span>
                <span style="font-size:12px; color:var(--text-muted); font-family:var(--font-mono); margin-left:var(--sp-4); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:40%;" title="${filePath}">${filePath}</span>
                <button class="btn btn--secondary btn--sm" id="editor-btn-close" style="margin-left:auto;">Đóng</button>
            </div>
            <div class="editor__content">
                <textarea class="editor__textarea" id="editor-textarea" spellcheck="false"></textarea>
            </div>
            <div class="editor__footer">
                <button class="btn btn--secondary btn--sm" id="editor-btn-cancel">Hủy</button>
                <button class="btn btn--primary btn--sm" id="editor-btn-save">Lưu lại</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    const textarea = overlay.querySelector('#editor-textarea');
    textarea.value = initialContent;
    textarea.focus();
    
    setTimeout(() => {
        overlay.classList.add('open');
    }, 10);
    
    const closeEditor = () => {
        overlay.classList.remove('open');
        overlay.addEventListener('transitionend', () => {
            overlay.remove();
        });
    };
    
    overlay.querySelector('#editor-btn-close').addEventListener('click', closeEditor);
    overlay.querySelector('#editor-btn-cancel').addEventListener('click', closeEditor);
    
    overlay.querySelector('#editor-btn-save').addEventListener('click', async () => {
        const btnSave = overlay.querySelector('#editor-btn-save');
        btnSave.disabled = true;
        btnSave.textContent = 'Đang lưu...';
        try {
            await api.put('/files/content', { path: filePath, content: textarea.value });
            showToast('Lưu file thành công', 'success');
            closeEditor();
            // Refresh list to update file size and date
            loadFiles(currentPath);
        } catch (e) {
            showToast(`Lỗi lưu file: ${e.message}`, 'error');
            btnSave.disabled = false;
            btnSave.textContent = 'Lưu lại';
        }
    });
}

function showPrompt(message, placeholder = '', title = "Nhập dữ liệu") {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        overlay.innerHTML = `
            <div class="modal">
                <h3 class="modal__title">${title}</h3>
                <div class="modal__body">
                    <p style="margin-bottom: var(--sp-2);">${message}</p>
                    <input type="text" class="modal-input" id="prompt-input" value="${placeholder}" autocomplete="off">
                </div>
                <div class="modal__footer">
                    <button class="btn btn--secondary btn--sm" id="prompt-btn-cancel">Hủy</button>
                    <button class="btn btn--primary btn--sm" id="prompt-btn-ok">Xác nhận</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        const input = overlay.querySelector('#prompt-input');
        input.focus();
        
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
        
        overlay.querySelector('#prompt-btn-cancel').addEventListener('click', () => cleanup(null));
        overlay.querySelector('#prompt-btn-ok').addEventListener('click', () => {
            cleanup(input.value.trim());
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                cleanup(input.value.trim());
            } else if (e.key === 'Escape') {
                cleanup(null);
            }
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup(null);
            }
        });
    });
}
