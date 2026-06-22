#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

# Define colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Pi WebUI Installation Script ===${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Error: Please do not run this script as root directly.${NC}"
    echo -e "Run it as user 'pi' (or your main user) using: ./install.sh"
    exit 1
fi

# Resolve directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
DATA_DIR="/var/lib/piwebui"

echo -e "${YELLOW}Step 1: Preparing directories...${NC}"
sudo mkdir -p "$DATA_DIR"
sudo chown -R "$USER:$USER" "$DATA_DIR"
echo -e "Data directory created at: $DATA_DIR"

echo -e "${YELLOW}Step 2: Installing dependencies...${NC}"
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip wireguard-tools

echo -e "${YELLOW}Step 3: Setting up python virtual environment...${NC}"
cd "$BACKEND_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Virtual environment created."
fi

source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo -e "Dependencies installed successfully."

echo -e "${YELLOW}Step 4: Configuring sudoers for passwordless system control...${NC}"
# Copy sudoers file safely
if [ -f "$PROJECT_ROOT/systemd/sudoers_piwebui" ]; then
    sudo cp "$PROJECT_ROOT/systemd/sudoers_piwebui" /etc/sudoers.d/piwebui
    
    # Adjust username if not running as user 'pi'
    if [ "$USER" != "pi" ]; then
        echo "Adjusting sudoers file for user: $USER"
        sudo sed -i "s|^pi |$USER |g" /etc/sudoers.d/piwebui
    fi
    
    sudo chmod 440 /etc/sudoers.d/piwebui
    sudo chown root:root /etc/sudoers.d/piwebui
    
    # Verify sudoers file syntax
    if sudo visudo -c >/dev/null 2>&1; then
        echo -e "Sudoers config copied and verified."
    else
        echo -e "${RED}Warning: Sudoers verification failed! Removing unsafe file.${NC}"
        sudo rm -f /etc/sudoers.d/piwebui
        exit 1
    fi
else
    echo -e "${RED}Error: systemd/sudoers_piwebui not found!${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 5: Registering systemd service...${NC}"
if [ -f "$PROJECT_ROOT/systemd/piwebui.service" ]; then
    sudo cp "$PROJECT_ROOT/systemd/piwebui.service" /etc/systemd/system/
    
    # Adjust service file if the installation directory is different from /home/pi/piwebui
    if [ "$PROJECT_ROOT" != "/home/pi/piwebui" ]; then
        echo "Adjusting paths in systemd service file to point to $PROJECT_ROOT"
        sudo sed -i "s|/home/pi/piwebui|$PROJECT_ROOT|g" /etc/systemd/system/piwebui.service
    fi
    
    # Adjust User and Group in systemd service file if user is not 'pi'
    if [ "$USER" != "pi" ]; then
        echo "Adjusting systemd service user and group to: $USER"
        sudo sed -i "s|User=pi|User=$USER|g" /etc/systemd/system/piwebui.service
        sudo sed -i "s|Group=pi|Group=$USER|g" /etc/systemd/system/piwebui.service
    fi
    
    sudo systemctl daemon-reload
    sudo systemctl enable piwebui.service
    sudo systemctl restart piwebui.service
    echo -e "Systemd service registered and started."
else
    echo -e "${RED}Error: systemd/piwebui.service not found!${NC}"
    exit 1
fi

echo -e "${GREEN}=== Installation Completed successfully! ===${NC}"
echo -e "Pi WebUI is now running."
echo -e "Check status: ${YELLOW}sudo systemctl status piwebui${NC}"
echo -e "View logs:    ${YELLOW}journalctl -u piwebui -f${NC}"
echo -e "Access panel: ${GREEN}http://localhost:8080${NC} (or your Pi IP address)"
