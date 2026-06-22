import psutil
from fastapi import APIRouter
from ..services.process_mgr import run_command
from ..models.schemas import NetworkStatsResponse, NetworkInterface

router = APIRouter()

@router.get("", response_model=NetworkStatsResponse)
async def get_network():
    addrs  = psutil.net_if_addrs()
    stats  = psutil.net_if_stats()
    ifaces = []
    
    for name, addr_list in addrs.items():
        ipv4 = None
        mac  = None
        for a in addr_list:
            try:
                family_name = getattr(a.family, "name", "")
                if family_name == "AF_INET":
                    ipv4 = a.address
                elif family_name in ("AF_PACKET", "AF_LINK"):
                    mac = a.address
            except Exception:
                pass
                
        st = stats.get(name)
        is_up = st.isup if st else False
        speed = st.speed if (st and st.speed > 0) else None
        
        ifaces.append(NetworkInterface(
            name=name,
            ip_address=ipv4,
            mac_address=mac,
            is_up=is_up,
            speed_mbps=speed,
        ))

    # Safe wireguard check
    try:
        code, wg_out, _ = await run_command(["sudo", "wg", "show"])
        wg_active = (code == 0 and "interface:" in wg_out)
        wg_peers = wg_out.count("peer:") if wg_active else 0
    except Exception:
        wg_active = False
        wg_peers = 0
        
    return NetworkStatsResponse(
        interfaces=ifaces,
        wireguard_active=wg_active,
        wireguard_peers=wg_peers,
    )

