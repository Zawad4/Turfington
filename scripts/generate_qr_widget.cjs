const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

async function main() {
  const artifactDir = 'C:/Users/mdzaw/.gemini/antigravity/brain/216cb4eb-115e-4660-a477-9838078b2979';
  const wifiIp = '172.20.10.2';
  const hotspotIp = '192.168.137.1';
  
  const wifiUrl = `exp://${wifiIp}:8081`;
  const hotspotUrl = `exp://${hotspotIp}:8081`;

  const wifiQr = await QRCode.toDataURL(wifiUrl, { width: 340, margin: 2 });
  const hotspotQr = await QRCode.toDataURL(hotspotUrl, { width: 340, margin: 2 });

  await QRCode.toFile(path.join(artifactDir, 'expo_qr_wifi.png'), wifiUrl, { width: 450, margin: 2 });
  await QRCode.toFile(path.join(artifactDir, 'expo_qr_hotspot.png'), hotspotUrl, { width: 450, margin: 2 });
  await QRCode.toFile('d:/PDD DRAFT 1/expo_qr.png', wifiUrl, { width: 450, margin: 2 });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-3 font-sans">
  <div class="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-2xl p-6 shadow-md max-w-md mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between pb-4 border-b border-[var(--border)]">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
        <h2 class="text-base font-bold text-[var(--foreground)]">Expo Go Scanner (Active)</h2>
      </div>
      <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
        Ready :8081
      </span>
    </div>

    <!-- Network Switcher Tabs -->
    <div class="mt-4 flex bg-[var(--background)] p-1 rounded-xl border border-[var(--border)] gap-1">
      <button id="btn-wifi" onclick="switchTab('wifi')" class="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-[var(--card)] text-[var(--foreground)] shadow-sm transition-all">
        📶 Wi-Fi (${wifiIp})
      </button>
      <button id="btn-hotspot" onclick="switchTab('hotspot')" class="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all">
        📱 Hotspot (${hotspotIp})
      </button>
    </div>

    <!-- QR Container -->
    <div class="mt-5 flex flex-col items-center">
      <div class="p-3 bg-white rounded-2xl shadow-inner border border-gray-200">
        <img id="qr-image" src="${wifiQr}" alt="Expo Go QR Code" class="w-60 h-60 object-contain block" />
      </div>
      
      <!-- Deep Link & Copy -->
      <div class="mt-4 w-full flex items-center justify-between gap-2 px-3 py-2 bg-[var(--background)] rounded-xl border border-[var(--border)]">
        <code id="qr-url" class="text-xs text-[var(--foreground)] font-mono truncate select-all font-semibold">${wifiUrl}</code>
        <button onclick="copyUrl()" id="copy-btn" class="text-xs font-medium px-2.5 py-1 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 active:scale-95 transition-all whitespace-nowrap">
          Copy Link
        </button>
      </div>
    </div>

    <!-- Step by Step Instructions -->
    <div class="mt-5 pt-4 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)] space-y-2">
      <div class="flex items-start gap-2">
        <span class="font-bold text-[var(--foreground)]">1.</span>
        <span>Open <strong class="text-[var(--foreground)]">Expo Go</strong> on your Android or the <strong class="text-[var(--foreground)]">Camera app</strong> on iOS.</span>
      </div>
      <div class="flex items-start gap-2">
        <span class="font-bold text-[var(--foreground)]">2.</span>
        <span>Make sure your phone is connected to the same network: <strong class="text-[var(--foreground)]">${wifiIp}</strong>.</span>
      </div>
      <div class="flex items-start gap-2">
        <span class="font-bold text-[var(--foreground)]">3.</span>
        <span>Scan the QR code above to immediately launch the app!</span>
      </div>
    </div>
  </div>

  <script>
    const wifiUrl = '${wifiUrl}';
    const wifiQr = '${wifiQr}';
    const hotspotUrl = '${hotspotUrl}';
    const hotspotQr = '${hotspotQr}';
    let currentUrl = wifiUrl;

    function switchTab(type) {
      const btnWifi = document.getElementById('btn-wifi');
      const btnHotspot = document.getElementById('btn-hotspot');
      const qrImg = document.getElementById('qr-image');
      const urlText = document.getElementById('qr-url');

      if (type === 'wifi') {
        currentUrl = wifiUrl;
        qrImg.src = wifiQr;
        urlText.textContent = wifiUrl;
        btnWifi.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-[var(--card)] text-[var(--foreground)] shadow-sm transition-all';
        btnHotspot.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all';
      } else {
        currentUrl = hotspotUrl;
        qrImg.src = hotspotQr;
        urlText.textContent = hotspotUrl;
        btnHotspot.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-[var(--card)] text-[var(--foreground)] shadow-sm transition-all';
        btnWifi.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all';
      }
    }

    function copyUrl() {
      navigator.clipboard.writeText(currentUrl).then(() => {
        const btn = document.getElementById('copy-btn');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1800);
      });
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(artifactDir, 'qr_widget.html'), html, 'utf8');
  console.log('QR codes and qr_widget.html regenerated with active IP: ' + wifiIp);
}

main().catch(console.error);
