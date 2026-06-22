/**
 * Terminal Component for Pi WebUI
 * Uses xterm.js to provide an interactive pseudo-terminal interface.
 */

function loadScript(src, checkGlobal) {
    return new Promise((resolve) => {
        if (checkGlobal && window[checkGlobal]) {
            resolve();
            return;
        }
        
        // Find if script tag already exists
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === "true") {
                resolve();
            } else {
                existing.addEventListener('load', resolve);
                existing.addEventListener('error', () => resolve());
            }
            return;
        }
        
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            script.dataset.loaded = "true";
            resolve();
        };
        script.onerror = () => resolve();
        document.head.appendChild(script);
    });
}

function loadStyle(href) {
    if (document.querySelector(`link[href="${href}"]`)) {
        return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

export function initTerminal(container) {
    container.innerHTML = `
        <div class="page-enter">
            <div class="page-header">
                <h1>Terminal</h1>
                <span class="badge badge--inactive" id="term-status">Đang kết nối...</span>
            </div>
            <div class="card" style="padding: var(--sp-4); background-color: #0d1117; min-height: 500px; display: flex; flex-direction: column; overflow: hidden; border-color: var(--border-color);">
                <div id="terminal-wrapper" style="flex-grow: 1; width: 100%; height: 480px;"></div>
            </div>
        </div>
    `;

    let term = null;
    let fitAddon = null;
    let ws = null;
    let handleResize = null;

    // Load assets dynamically
    Promise.all([
        loadStyle('/assets/xterm/xterm.css'),
        loadScript('/assets/xterm/xterm.js', 'Terminal')
    ]).then(() => {
        return loadScript('/assets/xterm/xterm-addon-fit.js', 'FitAddon');
    }).then(() => {
        if (!window.Terminal || !window.FitAddon) {
            container.querySelector('#terminal-wrapper').innerHTML = `
                <div style="color: var(--danger); padding: var(--sp-4);">
                    <h3>Lỗi tải thư viện Terminal</h3>
                    <p>Không thể khởi tạo xterm.js từ thư mục assets local.</p>
                </div>
            `;
            return;
        }

        // Initialize terminal instance
        term = new window.Terminal({
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            theme: {
                background: '#0d1117',
                foreground: '#e6edf3',
                cursor: '#58a6ff',
                selectionBackground: 'rgba(88, 166, 255, 0.3)',
                black: '#21262d',
                red: '#ff7b72',
                green: '#3fb950',
                yellow: '#d29922',
                blue: '#58a6ff',
                magenta: '#bc8cff',
                cyan: '#39c5cf',
                white: '#b1bac4',
                brightBlack: '#484f58',
                brightRed: '#ff9088',
                brightGreen: '#56d364',
                brightYellow: '#e3b341',
                brightBlue: '#79c0ff',
                brightMagenta: '#d4bbff',
                brightCyan: '#56d4dd',
                brightWhite: '#ffffff'
            },
            cursorBlink: true,
            allowTransparency: false
        });

        // Initialize fit addon
        fitAddon = new window.FitAddon.FitAddon();
        term.loadAddon(fitAddon);

        // Open terminal in wrapper
        const wrapper = document.getElementById('terminal-wrapper');
        term.open(wrapper);
        
        // Initial fit
        try {
            fitAddon.fit();
        } catch (e) {
            console.error("Initial fit failed:", e);
        }

        // Setup WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;
        ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        const statusEl = document.getElementById('term-status');

        ws.onopen = () => {
            if (statusEl) {
                statusEl.className = 'badge badge--active';
                statusEl.textContent = '● Đã kết nối';
            }
            
            // Trigger size adjustment once connected
            try {
                fitAddon.fit();
                ws.send(JSON.stringify({
                    type: "resize",
                    cols: term.cols,
                    rows: term.rows
                }));
            } catch (e) {
                console.error("Fit on connection open failed:", e);
            }
        };

        ws.onclose = () => {
            if (statusEl) {
                statusEl.className = 'badge badge--failed';
                statusEl.textContent = '○ Mất kết nối';
            }
        };

        ws.onerror = () => {
            if (statusEl) {
                statusEl.className = 'badge badge--failed';
                statusEl.textContent = '○ Lỗi kết nối';
            }
        };

        ws.onmessage = async (e) => {
            if (e.data instanceof ArrayBuffer) {
                term.write(new Uint8Array(e.data));
            } else if (typeof e.data === 'string') {
                term.write(e.data);
            }
        };

        // Forward user key inputs to backend
        term.onData((data) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(new TextEncoder().encode(data));
            }
        });

        // Listen for terminal resize events and forward to backend
        term.onResize((size) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "resize",
                    cols: size.cols,
                    rows: size.rows
                }));
            }
        });

        // Fit terminal on window resize
        handleResize = () => {
            try {
                if (fitAddon) {
                    fitAddon.fit();
                }
            } catch (err) {
                console.error("Window resize fit failed:", err);
            }
        };
        window.addEventListener('resize', handleResize);
    });

    // Teardown function to clean up when route changes
    return () => {
        if (handleResize) {
            window.removeEventListener('resize', handleResize);
        }
        if (ws) {
            try {
                ws.close();
            } catch (e) {}
        }
        if (term) {
            try {
                term.dispose();
            } catch (e) {}
        }
    };
}
