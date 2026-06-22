# Architecture & Design Whitepaper: Pi WebUI

## 1. Executive Summary

Headless Raspberry Pi administration often requires users to choose between complex command-line interfaces (SSH) or heavy, resource-intensive control panels (such as Webmin, Cockpit, or cloud-tethered dashboards). 

**Pi WebUI** introduces a self-hosted, lightweight, and modern alternative. Inspired by the clean, desktop-like dashboard of **CasaOS**, it targets high visual refinement while running under tight resource budgets (less than 256MB RAM). It strictly follows an offline-first philosophy, utilizing local assets to avoid external cloud dependencies and CDNs.

This whitepaper details the architectural design, security mechanisms, hardware optimization strategies, and communication protocols implemented in Pi WebUI.

---

## 2. Architectural Design & Philosophy

```
  ┌────────────────────────────────────────────────────────┐
  │                   Web Browser (Client)                  │
  │  ┌──────────────────┐ ┌──────────┐ ┌────────────────┐  │
  │  │ Vanilla JS / CSS │ │ xterm.js │ │ EventSource/WS │  │
  │  └────────┬─────────┘ └────┬─────┘ └───────▲────────┘  │
  └───────────┼────────────────┼───────────────┼───────────┘
              │ HTTP Requests  │ WebSocket     │ SSE / WS
              │ (APIs / files) │ (Terminal)    │ (Telemetry)
  ┌───────────┼────────────────┼───────────────┼───────────┐
  │           ▼                ▼               │           │
  │       FastAPI (Async Python Web Server)    │           │
  │       ┌────────────────────────────────────┴┐          │
  │       │       lifespan / event loop         │          │
  │       └──────┬──────────────────────┬───────┘          │
  │              │                      │                  │
  │              ▼                      ▼                  │
  │       SQLite 3 (WAL)         System Services           │
  │       (Data Persistence)     (procfs, systemctl, PTY)  │
  │                                                        │
  │                   Raspberry Pi Hardware                │
  └────────────────────────────────────────────────────────┘
```

The system is split into two cleanly separated layers:
1. **Frontend Dashboard:** A single-page application (SPA) built using native HTML5, modern CSS Variables (Design Tokens), and Vanilla JavaScript (ES Modules). No build tools, preprocessors, or node dependencies are required.
2. **Backend Daemon:** An asynchronous Python service powered by **FastAPI** and **Uvicorn**, serving as the system control agent. It interfaces directly with Linux kernel endpoints, systemd, and virtual PTY terminals.

### Design Principles:
* **Zero Cloud Lock-in:** The device should remain 100% functional without internet connectivity.
* **Low-overhead Telemetry:** System monitoring must not introduce CPU overhead or wear down the boot storage device.
* **Privilege Minimization:** The backend service runs under a standard user account (`admin` or `pi`) rather than `root`, invoking elevated permissions only when strictly necessary.

---

## 3. Communication Model & Telemetry

### 3.1. Telemetry Stream (Server-Sent Events)
Instead of relying on heavy HTTP polling (which floods the network and spikes CPU cycles), Pi WebUI utilizes a uni-directional **Server-Sent Events (SSE)** channel to stream telemetry data.
* **Uptime, CPU Load, Temperature, RAM, Disk, and Network Interface Stats** are collected at the backend level via `psutil` and direct `/proc` / `/sys` queries.
* These metrics are serialized to JSON and broadcasted to listening clients via an `EventSource` stream every 1–2 seconds.
* This architecture maintains a single persistent TCP connection, saving energy and preserving network cycles on low-power devices.

### 3.2. Real-Time Terminal (WebSockets + PTY)
To support a fully functional, interactive terminal over the web:
* The frontend uses **xterm.js** to handle terminal emulation, layout rendering, and keystroke capture.
* Communication is handled via full-duplex **WebSockets** (`/ws/terminal`).
* On the backend, Python's native `os.forkpty()` creates a pseudo-terminal (PTY) running `bash` under the host user shell.
* Bidirectional asynchronous loops read data from the PTY and pipe it to the WebSocket, and vice-versa, offering near-zero latency.

---

## 4. Hardware Optimizations & SD Card Wear Mitigation

A primary failure vector for Raspberry Pi projects is storage corruption due to repetitive write cycles on SD cards. Pi WebUI implements architectural defenses:

### 4.1. SQLite Write-Ahead Logging (WAL)
Standard SQLite transactions write to the main database file and rollback journal, creating heavy synchronous write IO. Pi WebUI overrides this behavior:
* **WAL Mode enabled:** Writes are appended to a separate `.log` file, allowing concurrent reads and sequential, non-blocking disk operations.
* **PRAGMA synchronous = NORMAL:** The database syncs checkpoints to disk instead of syncing on every single transaction, reducing physical SD card wear by orders of magnitude.
* **PRAGMA cache_size = -4000:** Cache size is set to 4MB in RAM, keeping read operations local to memory rather than querying the disk.

### 4.2. Volatile Operations & RAM Mounting
System configuration changes require file writes. To prevent flash memory degradation:
* **Log redirection:** WebUI system logs are directed to `stdout` and handled by `systemd-journald`, which is configured with `Storage=volatile` to store logs solely in RAM.
* **Temporary Directories:** It is strongly recommended to mount `/tmp` and `/var/log` as `tmpfs` RAM-disks.
* **Atomic Writes:** All configuration writes to disk (such as network settings) write first to a temporary file in the target directory, flush buffers to physical disk via `os.fsync()`, and perform an atomic `os.rename()`. This guarantees the filesystem never holds partially written or corrupt files if power fails midway.

---

## 5. Security Architecture

### 5.1. Non-Root Execution Daemon
Running a web panel as `root` exposes the system to catastrophic remote code execution (RCE) vulnerabilities.
* The Pi WebUI daemon runs as a restricted standard user (`pi` or `admin`).
* Restricting commands: The installer configures a custom sudoers file (`/etc/sudoers.d/piwebui`) that explicitly permits passwordless sudo access *only* to a pre-defined set of system operations:
  ```bash
  admin ALL=(ALL) NOPASSWD: /bin/systemctl start *
  admin ALL=(ALL) NOPASSWD: /bin/systemctl stop *
  admin ALL=(ALL) NOPASSWD: /bin/systemctl restart *
  admin ALL=(ALL) NOPASSWD: /sbin/reboot
  admin ALL=(ALL) NOPASSWD: /sbin/shutdown
  admin ALL=(ALL) NOPASSWD: /usr/bin/wg show
  ```

### 5.2. File Manager Path Isolation
The File Manager API prevents directory traversal and restricts access to sensitive directories:
* A configuration value `FILE_MANAGER_ROOT` sets the boundary (e.g., `/home/admin`).
* Path normalization via Python's `pathlib.Path` checks that the requested path is a strict child of the root directory.
* Direct access to system files like `/etc/shadow` or `/etc/sudoers` is blocked at the routing layer.

---

## 6. Remote Accessibility Model

Rather than utilizing proprietary third-party relay clouds (e.g. Tailscale, ngrok, Cloudflare Tunnels) which route private data through external servers and impose bandwidth or API limits, Pi WebUI utilizes a self-hosted tunnel:

1. **DuckDNS:** A lightweight dynamic DNS client runs as a local cron job, resolving home IP changes to a free subdomain (e.g., `mypi.duckdns.org`).
2. **WireGuard VPN:** A secure, kernel-level VPN server runs on the Pi (UDP Port 51820). The admin imports a mobile client config. Once toggled on:
   - Traffic to the Pi's internal subnet (`10.8.0.0/24`) is routed securely.
   - The admin accesses the WebUI securely at `http://10.8.0.1:8080` without exposing port 8080 to the public web.
   - Security is guaranteed by modern ChaCha20-Poly1305 cryptographic handshakes.
