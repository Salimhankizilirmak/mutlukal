const fs = require('fs');
const path = require('path');
const axios = require('axios');
const notifier = require('node-notifier');
const express = require('express');
const { exec } = require('child_process');

const app = express();
app.use(express.json({ limit: '50mb' }));

const API_BASE_URL = "https://mutlukal.novexistech.com/api/agent";
const API_TASK_URL = "https://mutlukal.novexistech.com/api/agent/task";
const API_AUTH_URL = "https://mutlukal.novexistech.com/api/agent/auth";

const BASE_DIR = process.pkg ? path.dirname(process.execPath) : process.cwd();
const CONFIG_FILE = path.join(BASE_DIR, 'Lavas_Config.json');
const IS_EMRI_DIR = path.join(BASE_DIR, 'Is_Emri');
const ARSIV_DIR = path.join(BASE_DIR, 'Arsiv');
const RAPORLAR_DIR = path.join(BASE_DIR, 'Raporlar');

[IS_EMRI_DIR, ARSIV_DIR, RAPORLAR_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); }
        catch (e) { console.error(dir + " oluşturulamadı:", e.message); }
    }
});

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
        catch (e) { return null; }
    }
    return null;
}

let config = loadConfig();

function cleanIsEmriFolder() {
    const files = fs.readdirSync(IS_EMRI_DIR);
    for (const file of files) {
        try {
            const ext = path.extname(file);
            const base = path.basename(file, ext);
            fs.renameSync(
                path.join(IS_EMRI_DIR, file),
                path.join(ARSIV_DIR, `${base}_${Date.now()}${ext}`)
            );
        } catch (err) {
            return { success: false, message: `${file} dosyası açık! Lütfen kapatın.` };
        }
    }
    return { success: true };
}

// ─── HTML ARAYÜZÜ ─────────────────────────────────────────────────────────────
const htmlContent = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lavaş Trace – Makine Paneli</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background:#09090b; color:#f4f4f5; font-family:'Segoe UI',sans-serif; }
    .glass { background:rgba(24,24,27,.85); backdrop-filter:blur(14px); border:1px solid rgba(255,255,255,.06); }
    .btn { transition:all .2s; }
    .log-line { animation: fadein .3s; }
    @keyframes fadein { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    <div class="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/5 rounded-full blur-[100px]"></div>
  </div>

  <div class="glass rounded-2xl w-full max-w-lg shadow-2xl relative z-10" id="app">

    <!-- HEADER -->
    <div class="flex items-center justify-between p-5 border-b border-zinc-800">
      <div>
        <p class="text-xs text-emerald-500 font-bold tracking-widest uppercase">Lavaş Trace</p>
        <p id="deviceLabel" class="text-zinc-100 font-semibold text-sm mt-0.5">Bağlanıyor...</p>
      </div>
      <span id="statusDot" class="w-3 h-3 rounded-full bg-yellow-500 shadow-[0_0_8px_#eab308]"></span>
    </div>

    <!-- AUTH VIEW -->
    <div id="authView" class="hidden p-6">
      <p class="text-zinc-400 text-sm text-center mb-5">Web panelinden aldığınız 6 haneli PIN kodunu girin.</p>
      <input id="pinInput" type="text" maxlength="6" placeholder="● ● ● ● ● ●"
        class="w-full bg-[#09090b] border border-zinc-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-center text-3xl tracking-[.5em] text-zinc-100 outline-none transition mb-4">
      <button onclick="authenticate()" id="authBtn"
        class="btn w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm">
        Cihazı Kaydet
      </button>
      <p id="authErr" class="text-red-400 text-xs text-center mt-3 hidden"></p>
    </div>

    <!-- MAIN VIEW -->
    <div id="mainView" class="hidden p-5 space-y-3">

      <!-- İŞ EMRİ İNDİR -->
      <button onclick="downloadTask()" id="dlBtn"
        class="btn w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-5 rounded-xl text-lg flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(5,150,105,.3)]">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span id="dlBtnText">Yeni İş Emrini İndir</span>
      </button>

      <!-- RAPOR GÖNDER -->
      <label id="reportLabel" class="btn cursor-pointer w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold py-4 rounded-xl text-sm flex items-center justify-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Raporu Seç ve Gönder
        <input type="file" id="reportFile" accept=".pdf,.xlsx,.xls,.docx" class="hidden" onchange="uploadReport(this)">
      </label>

      <!-- KLASÖR AÇ -->
      <button onclick="openFolder()" class="btn w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        İş Emri Klasörünü Aç
      </button>

      <!-- LOG -->
      <div id="logBox" class="bg-[#09090b] border border-zinc-800 rounded-xl p-3 h-28 overflow-y-auto text-xs font-mono text-zinc-400 space-y-1"></div>

      <!-- İŞ AKTAR -->
      <div class="flex justify-end pt-1">
        <button onclick="openTransferDialog()"
          class="btn bg-amber-700/30 hover:bg-amber-700/60 border border-amber-600/40 text-amber-400 text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5">
          🔄 İş Emrini Aktar
        </button>
      </div>
    </div>

    <!-- TRANSFER MODAL -->
    <div id="transferModal" class="hidden fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div class="glass rounded-2xl w-80 p-6 space-y-4">
        <h3 class="font-bold text-amber-400">🔄 İş Emrini Aktar</h3>
        <p class="text-zinc-400 text-xs">Aktarılacak cihazı seçin:</p>
        <select id="deviceSelect" class="w-full bg-[#09090b] border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none"></select>
        <div class="flex gap-2 pt-1">
          <button onclick="closeTransfer()" class="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm py-2 rounded-lg">İptal</button>
          <button onclick="confirmTransfer()" class="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm py-2 rounded-lg">Onayla</button>
        </div>
      </div>
    </div>

  </div>

<script>
let currentBatchId = null;

function log(msg, color = '#a1a1aa') {
  const box = document.getElementById('logBox');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.style.color = color;
  line.textContent = '» ' + msg;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function setStatus(connected) {
  const dot = document.getElementById('statusDot');
  dot.className = connected
    ? 'w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]'
    : 'w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]';
}

async function checkStatus() {
  const res = await fetch('/api/status');
  const data = await res.json();
  if (data.authenticated) {
    document.getElementById('authView').classList.add('hidden');
    document.getElementById('mainView').classList.remove('hidden');
    document.getElementById('deviceLabel').textContent = '📟 ' + data.deviceName;
    setStatus(true);
    log('Bağlantı sağlandı: ' + data.deviceName, '#10b981');
  } else {
    document.getElementById('mainView').classList.add('hidden');
    document.getElementById('authView').classList.remove('hidden');
    document.getElementById('deviceLabel').textContent = 'Kurulum gerekli';
    setStatus(false);
  }
}

async function authenticate() {
  const pin = document.getElementById('pinInput').value.trim();
  const btn = document.getElementById('authBtn');
  const err = document.getElementById('authErr');
  if (!pin) return;
  btn.disabled = true; btn.textContent = 'Doğrulanıyor...'; err.classList.add('hidden');
  try {
    const res = await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pinCode: pin }) });
    const data = await res.json();
    if (data.success) { checkStatus(); }
    else { err.textContent = data.message || 'PIN yanlış.'; err.classList.remove('hidden'); }
  } catch { err.textContent = 'Sunucuya ulaşılamadı.'; err.classList.remove('hidden'); }
  btn.disabled = false; btn.textContent = 'Cihazı Kaydet';
}

async function downloadTask() {
  const btn = document.getElementById('dlBtn');
  const txt = document.getElementById('dlBtnText');
  btn.disabled = true; txt.textContent = 'Sorgulanıyor...';
  log('İş emri merkezdende aranıyor...');
  try {
    const res = await fetch('/api/download', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      currentBatchId = data.batchId || null;
      log('✔ ' + data.message, '#10b981');
    } else {
      log('⚠ ' + data.message, '#eab308');
    }
  } catch { log('✖ Sunucu bağlantı hatası', '#ef4444'); }
  btn.disabled = false; txt.textContent = 'Yeni İş Emrini İndir';
}

async function uploadReport(input) {
  if (!input.files[0]) return;
  const file = input.files[0];
  log('Rapor yükleniyor: ' + file.name);
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      // 1. Sunucudan yükleme URL'i al
      const urlRes = await fetch('/api/report-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name })
      });
      const urlData = await urlRes.json();
      if (!urlData.success) throw new Error(urlData.message || 'Yükleme URL&#39;i alınamadı.');

      // 2. S3'e doğrudan yükle
      log('Dosya buluta aktarılıyor...');
      const uploadRes = await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        body: file
      });
      if (!uploadRes.ok) throw new Error('S3 yükleme hatası.');

      // 3. Yüklemeyi sunucuya onayla
      log('Rapor kaydediliyor...');
      const confirmRes = await fetch('/api/report-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: currentBatchId, reportUrl: urlData.reportUrl })
      });
      const confirmData = await confirmRes.json();

      if (confirmData.success) {
        log('✔ Rapor iletildi: ' + file.name, '#10b981');
        currentBatchId = null;
      } else {
        log('✖ ' + confirmData.message, '#ef4444');
      }
    } catch (err) {
      log('✖ Hata: ' + err.message, '#ef4444');
    }
  };
  reader.readAsArrayBuffer(file);
}

function openFolder() { fetch('/api/open-folder'); }

async function openTransferDialog() {
  document.getElementById('transferModal').classList.remove('hidden');
  const sel = document.getElementById('deviceSelect');
  sel.innerHTML = '<option>Yükleniyor...</option>';
  try {
    const res = await fetch('/api/devices');
    const devs = await res.json();
    if (devs.length) {
      sel.innerHTML = devs.map(d => \`<option value="\${d.id}">\${d.name}</option>\`).join('');
    } else {
      sel.innerHTML = '<option>Başka cihaz yok</option>';
    }
  } catch { sel.innerHTML = '<option>Hata</option>'; }
}

function closeTransfer() { document.getElementById('transferModal').classList.add('hidden'); }

async function confirmTransfer() {
  const sel = document.getElementById('deviceSelect');
  const targetId = sel.value;
  const targetName = sel.options[sel.selectedIndex]?.text;
  closeTransfer();
  try {
    const res = await fetch('/api/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDeviceId: targetId, batchId: currentBatchId })
    });
    const data = await res.json();
    if (data.success) { log('✔ İş emri aktarıldı → ' + targetName, '#f59e0b'); currentBatchId = null; }
    else { log('✖ ' + data.message, '#ef4444'); }
  } catch { log('✖ Aktarım hatası', '#ef4444'); }
}

checkStatus();
</script>
</body>
</html>
`;

// ─── API ROUTES ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send(htmlContent));

app.get('/api/status', (req, res) => {
    config = loadConfig();
    if (config?.deviceSecret) res.json({ authenticated: true, deviceName: config.deviceName });
    else res.json({ authenticated: false });
});

app.post('/api/auth', async (req, res) => {
    const { pinCode } = req.body;
    try {
        const response = await axios.post(API_AUTH_URL, { pinCode }, { timeout: 10000 });
        config = { deviceId: response.data.id, deviceSecret: response.data.deviceSecret, deviceName: response.data.name };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config));
        res.json({ success: true });
    } catch {
        res.json({ success: false, message: 'Parola yanlış veya sunucuya ulaşılamıyor.' });
    }
});

app.post('/api/download', async (req, res) => {
    if (!config) return res.json({ success: false, message: 'Önce cihaz kaydı yapılmalı.' });
    try {
        const taskRes = await axios.get(API_TASK_URL, {
            headers: { Authorization: `Bearer ${config.deviceSecret}` },
            timeout: 10000
        });
        const data = taskRes.data;
        if (!data?.downloadUrl) return res.json({ success: false, message: 'Atanmış bekleyen iş emri yok.' });

        const cleanResult = cleanIsEmriFolder();
        if (!cleanResult.success) return res.json(cleanResult);

        const fileRes = await axios.get(data.downloadUrl, { responseType: 'stream', timeout: 30000 });
        const fileName = data.fileName || `${data.workOrderNo}.xlsx`;
        const savePath = path.join(IS_EMRI_DIR, fileName);
        const writer = fs.createWriteStream(savePath);
        fileRes.data.pipe(writer);

        writer.on('finish', () => {
            notifier.notify({ title: 'Lavaş Trace', message: 'İŞ EMRİ GELDİ: ' + fileName, sound: true });
            exec(`explorer "${IS_EMRI_DIR}"`);
            res.json({ success: true, message: `İş emri indirildi: ${fileName}`, batchId: data.id });
        });
        writer.on('error', (e) => res.json({ success: false, message: 'Dosya yazma hatası: ' + e.message }));
    } catch (error) {
        if (error.response?.status === 404) return res.json({ success: false, message: 'Bekleyen iş emri yok.' });
        if (error.code === 'ECONNABORTED') return res.json({ success: false, message: 'Bağlantı zaman aşımı.' });
        res.json({ success: false, message: 'Bağlantı hatası: ' + error.message });
    }
});

app.post('/api/report-url', async (req, res) => {
    if (!config) return res.json({ success: false, message: 'Cihaz kayıtlı değil.' });
    const { fileName } = req.body;
    try {
        const apiRes = await axios.post(API_BASE_URL, {
            action: 'get_report_upload_url',
            deviceSecret: config.deviceSecret,
            fileName
        }, { timeout: 10000 });
        res.json(apiRes.data);
    } catch (e) {
        res.json({ success: false, message: 'URL alınamadı: ' + e.message });
    }
});

app.post('/api/report-confirm', async (req, res) => {
    if (!config) return res.json({ success: false, message: 'Cihaz kayıtlı değil.' });
    const { batchId, reportUrl } = req.body;
    try {
        const apiRes = await axios.post(API_BASE_URL, {
            action: 'upload_report',
            deviceSecret: config.deviceSecret,
            batchId,
            reportUrl
        }, { timeout: 10000 });
        res.json(apiRes.data);
    } catch (e) {
        res.json({ success: false, message: 'Onay hatası: ' + e.message });
    }
});

app.get('/api/devices', async (req, res) => {
    if (!config) return res.json([]);
    try {
        const apiRes = await axios.post(API_BASE_URL, {
            action: 'get_devices',
            deviceSecret: config.deviceSecret
        }, { timeout: 10000 });
        res.json(apiRes.data || []);
    } catch {
        res.json([]);
    }
});

app.post('/api/transfer', async (req, res) => {
    if (!config) return res.json({ success: false, message: 'Cihaz kayıtlı değil.' });
    const { targetDeviceId, batchId } = req.body;
    try {
        const apiRes = await axios.post(API_BASE_URL, {
            action: 'transfer_batch',
            deviceSecret: config.deviceSecret,
            targetDeviceId,
            batchId
        }, { timeout: 10000 });
        res.json(apiRes.data?.success ? { success: true } : { success: false, message: 'Aktarım başarısız.' });
    } catch (e) {
        res.json({ success: false, message: 'Bağlantı hatası: ' + e.message });
    }
});

app.get('/api/open-folder', (req, res) => {
    exec(`explorer "${IS_EMRI_DIR}"`);
    res.json({ ok: true });
});

// ─── START ─────────────────────────────────────────────────────────────────────
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Lavaş Trace başlatıldı → http://localhost:${PORT}`);
    console.log(`Bu pencereyi kapatmayın.`);
    try { exec(`start http://localhost:${PORT}`); } catch {}
});

process.on('uncaughtException', (err) => { console.error('Hata:', err.message); });
