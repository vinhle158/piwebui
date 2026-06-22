import urllib.request
import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
FONTS_DIR = BASE_DIR / "frontend" / "assets" / "fonts"

# Font file URLs (official rsms/inter font files on GitHub pages)
FONT_URLS = {
    "Inter-Regular.woff2": "https://rsms.me/inter/font-files/Inter-Regular.woff2",
    "Inter-Medium.woff2": "https://rsms.me/inter/font-files/Inter-Medium.woff2",
    "Inter-SemiBold.woff2": "https://rsms.me/inter/font-files/Inter-SemiBold.woff2",
    "Inter-Bold.woff2": "https://rsms.me/inter/font-files/Inter-Bold.woff2",
}

def download_fonts():
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading fonts to {FONTS_DIR}...")
    
    headers = {"User-Agent": "Mozilla/5.0"}
    
    for filename, url in FONT_URLS.items():
        dest = FONTS_DIR / filename
        if dest.exists():
            print(f"  {filename} already exists, skipping.")
            continue
            
        print(f"  Downloading {filename} from {url}...")
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req) as response, open(dest, "wb") as out_file:
                out_file.write(response.read())
            print(f"  Saved {filename}")
        except Exception as e:
            print(f"  FAILED to download {filename} from {url}: {e}")
            # Try fallback to raw github
            fallback_url = f"https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/{filename}"
            print(f"  Trying fallback URL: {fallback_url}")
            try:
                req = urllib.request.Request(fallback_url, headers=headers)
                with urllib.request.urlopen(req) as response, open(dest, "wb") as out_file:
                    out_file.write(response.read())
                print(f"  Saved {filename} (fallback)")
            except Exception as fe:
                print(f"  Fallback FAILED for {filename}: {fe}")

if __name__ == "__main__":
    download_fonts()
