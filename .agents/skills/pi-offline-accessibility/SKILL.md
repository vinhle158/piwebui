---
name: pi-offline-accessibility
description: Giải pháp kết nối Pi WebUI từ bên ngoài không cần server trung gian — WireGuard VPN self-hosted + DuckDNS để xử lý IP động. Đã chốt giải pháp.
---

# Pi Offline Accessibility — WireGuard + DuckDNS

## Kiến trúc Đã Chốt

```
[Điện thoại của bạn (4G)]
         │
         │  WireGuard UDP tunnel (mã hóa ChaCha20)
         │
[Internet] ──► [Router nhà] ──► [Raspberry Pi]
                    │
              DuckDNS DDNS
          (resolve IP động nhà)
```

**Tại sao WireGuard?**
- Self-hosted hoàn toàn, không có server cloud trung gian (Tailscale có cloud)
- Cực nhẹ: <1MB RAM, kernel module native trên Pi OS
- Mã hóa ChaCha20-Poly1305 — nhanh trên ARM (Pi không có AES hardware)
- Client app có sẵn cho iOS, Android, Windows, Mac, Linux

---

## Bước 1: Cấu hình DuckDNS

DuckDNS cập nhật tên miền động khi IP nhà thay đổi (ISP đổi IP mỗi vài ngày).

```bash
# Tạo script cập nhật IP
cat > /home/pi/duckdns/duck.sh << 'EOF'
#!/bin/bash
DOMAIN="yourname"     # Subdomain đã đăng ký tại duckdns.org
TOKEN="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Token từ dashboard DuckDNS
echo url="https://www.duckdns.org/update?domains=${DOMAIN}&token=${TOKEN}&ip=" \
    | curl -k -o /tmp/duck.log -K -
EOF

chmod +x /home/pi/duckdns/duck.sh

# Cập nhật mỗi 5 phút qua cron
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/pi/duckdns/duck.sh >/dev/null 2>&1") | crontab -
```

---

## Bước 2: Cài đặt WireGuard trên Pi (Server)

```bash
sudo apt install wireguard -y

# Tạo keypair cho Pi
wg genkey | sudo tee /etc/wireguard/server_private.key | \
    wg pubkey | sudo tee /etc/wireguard/server_public.key

# Tạo keypair cho điện thoại
wg genkey | tee phone_private.key | wg pubkey | tee phone_public.key
```

```ini
# /etc/wireguard/wg0.conf — Server config trên Pi
[Interface]
Address    = 10.8.0.1/24           # IP của Pi trong VPN network
ListenPort = 51820                  # Port UDP (cần mở trên router)
PrivateKey = <server_private.key>   # Nội dung file server_private.key
PostUp     = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown   = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]  # Cấu hình điện thoại của bạn
PublicKey  = <phone_public.key>    # Nội dung file phone_public.key
AllowedIPs = 10.8.0.2/32          # IP của điện thoại trong VPN
```

```bash
# Enable IP forwarding
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Start WireGuard
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
```

---

## Bước 3: Config cho Điện thoại (Client)

```ini
# Import vào WireGuard app trên iOS/Android
[Interface]
PrivateKey = <phone_private.key>
Address    = 10.8.0.2/24
DNS        = 10.8.0.1             # Dùng Pi làm DNS (optional)

[Peer]
PublicKey  = <server_public.key>
Endpoint   = yourname.duckdns.org:51820  # DuckDNS domain:port
AllowedIPs = 10.8.0.0/24         # Chỉ route traffic đến Pi qua VPN (split tunnel)
PersistentKeepalive = 25          # Giữ kết nối qua NAT của nhà mạng
```

---

## Bước 4: Port Forwarding trên Router Nhà

Trong trang admin của router (thường là 192.168.1.1):
```
Protocol : UDP
External Port : 51820
Internal IP   : <IP của Pi trong mạng LAN nhà>
Internal Port : 51820
```

---

## Truy cập WebUI từ ngoài

Sau khi kết nối WireGuard trên điện thoại:
```
http://10.8.0.1:8080    → Truy cập Pi WebUI qua VPN tunnel
```

---

## Frontend phải Offline-Ready hoàn toàn

Vì đây là điều kiện bắt buộc, mọi file sau phải có LOCAL trên Pi:

| File | Nguồn | Lưu tại |
|------|-------|---------|
| Font Inter | fonts.google.com/download | `frontend/assets/fonts/` |
| Lucide Icons | lucide.dev/icons | `frontend/assets/icons/` |
| Không dùng thư viện JS lớn | — | — |

```html
<!-- ✅ Đúng — font local -->
<link rel="stylesheet" href="assets/fonts/inter.css">

<!-- ❌ Sai — CDN, mất kết nối là mất font -->
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
```

---

## Monitoring WireGuard qua WebUI

```python
# backend/services/network.py
async def get_wireguard_status() -> dict:
    """Kiểm tra WireGuard peer có đang kết nối không."""
    code, stdout, _ = await run_command(["sudo", "wg", "show", "wg0"])
    if code != 0:
        return {"active": False, "peers": []}
    
    peers = []
    # Parse output của `wg show` để lấy thông tin peer
    lines = stdout.strip().split("\n")
    # ... parse logic ...
    return {"active": True, "peers": peers}
```

---

## Kiểm tra Kết nối

```bash
# Trên Pi — kiểm tra WireGuard đang chạy
sudo wg show

# Trên điện thoại — sau khi bật WireGuard, ping thử
ping 10.8.0.1

# Nếu thành công → mở http://10.8.0.1:8080 trên browser điện thoại
```
