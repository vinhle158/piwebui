# Pi WebUI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python Version](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%20OS-red.svg)](https://www.raspberrypi.com/software/)
[![Aesthetic](https://img.shields.io/badge/design-CasaOS%20Inspired-brightgreen.svg)]()

A lightweight, modern, secure, and self-hosted control panel designed specifically for Raspberry Pi. Inspired by the clean, desktop-like dashboard layout of **CasaOS**, Pi WebUI provides a premium web interface to monitor hardware stats, manage services, browse files, run interactive terminals, and configure secure VPN access without relying on any external cloud platforms (fully offline-first).

---

## 🖥️ Preview & Design Aesthetics
Pi WebUI is built with a premium dark-mode aesthetic featuring:
* **Glassmorphism UI:** Translucent cards, subtle blurs, and vibrant background glows.
* **Responsive Layout:** Adaptive desktop grid and mobile-friendly layouts.
* **Micro-animations:** Smooth hover transitions and active status glows.
* **System Widgets:** Live-updating circular progress meters for CPU, Memory, Disk, and Temperature.

---

## 🚀 Key Features

* **Real-time System Monitoring:** Live hardware stats (CPU load, clock speed, core temperature, RAM usage, disk space, and network interface statuses) streamed efficiently via Server-Sent Events (SSE).
* **Service Manager:** Safely start, stop, restart, and monitor core systemd services (e.g., SSH, Nginx, WireGuard, Docker) with real-time status updates.
* **Interactive Web Terminal:** Full-featured in-browser terminal powered by **xterm.js** and WebSockets, enabling remote shell access without opening port 22 to the public internet.
* **File Manager:** Fast, native file explorer to browse, download, edit, and upload files. Features **atomic write operations** to prevent filesystem corruption during sudden power losses.
* **Offline-first Accessibility:** Completely independent of external CDNs. All scripts, fonts (Inter), and icons (Lucide SVG) are served locally.
* **Secure Remote Access:** Built-in support guidelines for WireGuard VPN + DuckDNS. Securely connect your mobile device or external PC directly to your home network.

---

## 🛠️ Tech Stack & Rationale

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Backend** | Python 3.11+ / FastAPI | Native Raspberry Pi OS support, low memory footprint, native GPIO access, and async WebSockets. |
| **Frontend** | HTML5, Vanilla CSS, JS (ES Modules) | Zero build steps (no npm/vite builds required on the Pi), blazing fast loading, and offline accessibility. |
| **Database** | SQLite 3 (WAL Mode) | Serverless, zero daemon overhead, and optimized write safety. |
| **Communication** | SSE (Server-Sent Events) & WebSockets | SSE for resource-efficient monitoring telemetry; WebSockets for interactive shell communications. |
| **Process Manager** | systemd | Native Linux service management with automatic crash restarts and resource limiting. |

---

## 📦 Quick Start & Deployment

### 1. Prerequisites
Ensure you are running **Raspberry Pi OS 11 (Bullseye)** or **12 (Bookworm)**.

### 2. Copy Code & Setup Repository
On your Raspberry Pi:
```bash
git clone https://github.com/vinhle158/piwebui.git ~/piwebui
cd ~/piwebui
```

### 3. Download Offline Assets
Fetch the required local web assets (fonts and styling assets) so the UI works offline:
```bash
python3 scripts/download_assets.py
```

### 4. Create Environment Configuration
Initialize the environment configuration:
```bash
cp .env.example backend/.env
```
Edit `backend/.env` if you need to adjust directories or allowed services:
```ini
HOST=0.0.0.0
PORT=8080
DB_PATH=/var/lib/piwebui/data.db
ALLOWED_SERVICES=piwebui,nginx,ssh,bluetooth,cron,networking,wg-quick@wg0
FILE_MANAGER_ROOT=/home/admin   # Replace with your home directory
```

### 5. Run the Automated Installer
Make the installer executable and run it (run as your standard user, **do NOT use `sudo` directly**):
```bash
chmod +x scripts/install.sh
./scripts/install.sh
```
*The script will automatically configure package dependencies, initialize a python virtual environment (`venv`), copy systemd service configurations, register the service to start on boot, and dynamically configure passwordless sudo privileges for selected commands.*

---

## ⚡ Pi-Specific Optimizations (SD Card Protection)

Raspberry Pi SD cards can degrade quickly under constant write loads. Pi WebUI implements strict hardware-saving precautions:

1. **SQLite WAL Mode:** Write-Ahead Logging is used with `PRAGMA synchronous=NORMAL` to batch writes and prevent filesystem corruption on power cuts.
2. **Volatile Logging:** System logs are configured to reside in RAM (`tmpfs`) instead of the SD card.
3. **RAM Mounting:** To apply this, mount write-intensive paths to RAM by adding the following to `/etc/fstab`:
   ```ini
   tmpfs   /tmp              tmpfs  defaults,noatime,nosuid,size=64m     0 0
   tmpfs   /var/log          tmpfs  defaults,noatime,nosuid,size=32m     0 0
   tmpfs   /var/tmp          tmpfs  defaults,noatime,nosuid,size=16m     0 0
   ```
4. **Service Resource Limits:** The `piwebui.service` is restricted to a maximum of `256MB` RAM and `80%` CPU quota to ensure system stability.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Contributing
Contributions are welcome! Please feel free to submit issues, pull requests, or suggestions to make Pi WebUI even better.
