---
name: frontend-engineering-standards
description: Chuẩn xây dựng Frontend Vanilla JS/CSS cho Pi WebUI — offline-first, CSS Variables design tokens, ES Modules, WebSocket/SSE integration, không dùng CDN.
---

# Frontend Engineering Standards — Vanilla JS

## Quy tắc Nền tảng

1. **KHÔNG dùng CDN** — Font, icon, library đều phải có trong `frontend/assets/`
2. **Dùng ES Modules** — `import/export` native, không cần bundler
3. **Không dùng inline style** — Toàn bộ styling trong CSS files
4. **CSS Variables ở :root** — Mọi màu sắc, spacing đều là token

---

## Design System — CSS Tokens

```css
/* frontend/css/main.css */
:root {
    /* === Color Palette === */
    --color-bg-base:       hsl(222, 20%, 9%);
    --color-bg-surface:    hsl(222, 18%, 13%);
    --color-bg-elevated:   hsl(222, 16%, 18%);
    --color-border:        hsl(222, 15%, 25%);

    --color-primary:       hsl(210, 100%, 60%);
    --color-primary-hover: hsl(210, 100%, 70%);
    --color-success:       hsl(142, 70%, 50%);
    --color-warning:       hsl(38, 95%, 55%);
    --color-danger:        hsl(0, 80%, 60%);

    --color-text-primary:  hsl(210, 20%, 95%);
    --color-text-secondary:hsl(210, 15%, 65%);
    --color-text-muted:    hsl(210, 10%, 45%);

    /* === Typography === */
    --font-family: 'Inter', system-ui, -apple-system, sans-serif;
    --font-mono:   'JetBrains Mono', 'Fira Code', monospace;

    /* === Spacing (8px base) === */
    --space-1: 4px;   --space-2: 8px;   --space-3: 12px;
    --space-4: 16px;  --space-6: 24px;  --space-8: 32px;

    /* === Border Radius === */
    --radius-sm: 6px;  --radius-md: 10px;  --radius-lg: 16px;

    /* === Shadows === */
    --shadow-sm: 0 1px 3px hsl(0 0% 0% / 0.3);
    --shadow-md: 0 4px 16px hsl(0 0% 0% / 0.4);
    --shadow-glow-primary: 0 0 20px hsl(210 100% 60% / 0.25);

    /* === Transitions === */
    --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## Component CSS Pattern — Glassmorphism Card

```css
/* frontend/css/components.css */
.card {
    background: hsl(222 18% 13% / 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    box-shadow: var(--shadow-md);
    transition: transform var(--transition-fast), 
                box-shadow var(--transition-fast);
}
.card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md), var(--shadow-glow-primary);
}

/* Status badge */
.badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border-radius: 100px;
    font-size: 12px;
    font-weight: 600;
}
.badge--active  { background: hsl(142 70% 50% / 0.15); color: var(--color-success); }
.badge--stopped { background: hsl(0 80% 60% / 0.15);   color: var(--color-danger);  }
.badge--warning { background: hsl(38 95% 55% / 0.15);  color: var(--color-warning); }
```

---

## JavaScript Module Pattern

```javascript
// frontend/js/components/dashboard.js
import { apiFetch } from '../api.js';
import { SSEClient } from '../sse.js';
import { formatBytes, formatTemp } from '../utils.js';

export function initDashboard() {
    const sse = new SSEClient('/api/system/stream', renderStats);
    sse.connect();
    
    // Cleanup khi rời trang
    return () => sse.disconnect();
}

function renderStats(stats) {
    // Cập nhật DOM — chỉ cập nhật phần tử thực sự thay đổi
    updateProgressBar('cpu-bar', stats.cpu_percent);
    updateProgressBar('ram-bar', stats.ram_percent);
    
    const tempEl = document.getElementById('cpu-temp');
    if (tempEl && stats.cpu_temp_celsius !== null) {
        tempEl.textContent = formatTemp(stats.cpu_temp_celsius);
        tempEl.className = getTempClass(stats.cpu_temp_celsius);
    }
}

function updateProgressBar(id, value) {
    const bar = document.getElementById(id);
    if (!bar) return;
    bar.style.setProperty('--progress', `${value}%`);
    bar.setAttribute('aria-valuenow', value);
}

function getTempClass(temp) {
    if (temp >= 80) return 'temp temp--danger';
    if (temp >= 65) return 'temp temp--warning';
    return 'temp temp--normal';
}
```

---

## HTML Semantic Structure

```html
<!-- frontend/index.html -->
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pi WebUI — Bảng điều khiển</title>
    <link rel="stylesheet" href="css/main.css">
    <link rel="stylesheet" href="css/components.css">
    <!-- Font Inter — lưu local, không CDN -->
    <link rel="stylesheet" href="assets/fonts/inter.css">
</head>
<body>
    <div id="app">
        <nav class="sidebar" role="navigation" aria-label="Menu chính">
            <!-- Navigation -->
        </nav>
        <main class="main-content" role="main">
            <!-- Pages rendered by JS router -->
        </main>
    </div>
    <!-- Script dùng type="module" — hỗ trợ import/export -->
    <script type="module" src="js/app.js"></script>
</body>
</html>
```

---

## Animations — CSS Only, Không JS

```css
/* frontend/css/animations.css */
@keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.6; transform: scale(0.85); }
}
@keyframes slide-up {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
}
@keyframes shimmer {
    from { background-position: -200% 0; }
    to   { background-position: 200% 0; }
}

/* Skeleton loading */
.skeleton {
    background: linear-gradient(
        90deg,
        var(--color-bg-elevated) 25%,
        hsl(222 16% 22%) 50%,
        var(--color-bg-elevated) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: var(--radius-sm);
}

/* Page enter animation */
.page-enter { animation: slide-up 250ms ease-out; }
```

---

## Checklist Responsive

- [ ] Layout dùng CSS Grid / Flexbox — không dùng float
- [ ] Breakpoint: `768px` (tablet), `1024px` (desktop)
- [ ] Touch target tối thiểu 44×44px cho mobile
- [ ] Font size tối thiểu 14px cho body text
- [ ] Sidebar collapse thành bottom-nav trên màn hình nhỏ
