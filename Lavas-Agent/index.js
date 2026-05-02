const fs = require('fs');
const path = require('path');
const axios = require('axios');
const notifier = require('node-notifier');
const express = require('express');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const API_BASE_URL = "http://localhost:3000/api/agent"; 

// pkg ile derlendiğinde process.execPath bize .exe'nin kendi yolunu verir.
// Böylece exe neredeyse (Masaüstü, İndirilenler vb.) klasörler onun yanına açılır.
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : process.cwd();

const CONFIG_FILE = path.join(BASE_DIR, 'Lavas_Config.json');
const IS_EMRI_DIR = path.join(BASE_DIR, 'Is_Emri');
const ARSIV_DIR = path.join(BASE_DIR, 'Arsiv');

[IS_EMRI_DIR, ARSIV_DIR].forEach(dir => { 
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
            console.error(dir + " klasörü oluşturulamadı:", e.message);
        }
    } 
});

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (e) {
            return null;
        }
    }
    return null;
}

let config = loadConfig();

function cleanIsEmriFolder() {
    const files = fs.readdirSync(IS_EMRI_DIR);
    for (const file of files) {
        try {
            fs.renameSync(path.join(IS_EMRI_DIR, file), path.join(ARSIV_DIR, `${Date.now()}_${file}`));
        } catch (err) {
            return { success: false, message: `${file} dosyası açık! Lütfen Excel veya barkod programını kapatın.` };
        }
    }
    return { success: true };
}

async function downloadTask() {
    if (!config) return { success: false, message: 'Cihaz kimlik doğrulaması yapılmadı.' };

    try {
        const res = await axios.get(`${API_BASE_URL}/task`, { 
            headers: { Authorization: `Bearer ${config.deviceSecret}` },
            timeout: 10000 
        });
        
        if (res.data && res.data.downloadUrl) {
            const cleanCheck = cleanIsEmriFolder();
            if (!cleanCheck.success) return cleanCheck;
            
            const fileRes = await axios.get(res.data.downloadUrl, { 
                responseType: 'stream',
                timeout: 30000 
            });
            
            const writer = fs.createWriteStream(path.join(IS_EMRI_DIR, res.data.fileName));
            fileRes.data.pipe(writer);
            
            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    notifier.notify({
                        title: 'Lavaş Trace',
                        message: 'İŞ EMRİ GELDİ!',
                        sound: true,
                        wait: false
                    });
                    resolve({ success: true, message: `İş Emri (${res.data.workOrderNo}) başarıyla indirildi!` });
                });
                writer.on('error', (err) => {
                    resolve({ success: false, message: `Dosya yazma hatası: ${err.message}` });
                });
            });
        }
    } catch (error) {
        if(error.response && error.response.status === 404) {
            return { success: false, message: "Şu an size atanmış yeni bir iş emri yok." };
        } else if (error.code === 'ECONNABORTED') {
            return { success: false, message: "Bağlantı zaman aşımına uğradı." };
        } else {
            return { success: false, message: `Bağlantı hatası: ${error.message}` };
        }
    }
    return { success: false, message: "Bilinmeyen bir hata oluştu." };
}

// GUI HTML (Glassmorphism, Tailwind via CDN)
const htmlContent = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lavaş Trace - Cihaz Ajanı</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #09090b; color: #f4f4f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .glass { background: rgba(24, 24, 27, 0.8); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.05); }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>
    
    <div class="glass rounded-2xl p-8 max-w-md w-full shadow-[0_0_30px_rgba(16,185,129,0.1)] relative z-10" id="app">
        <h1 class="text-2xl font-bold text-center text-emerald-500 mb-6 tracking-wide">LAVAŞ TRACE<br><span class="text-sm text-zinc-400 font-normal">Cihaz İletişim Ajanı</span></h1>
        
        <div id="authView" class="hidden">
            <p class="text-sm text-zinc-400 mb-4 text-center">Kurulum için web panelindeki 6 haneli parolayı (PIN) girin.</p>
            <input type="text" id="pinInput" placeholder="000000" class="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 text-center text-2xl tracking-[0.5em] mb-4 focus:outline-none focus:border-emerald-500/50">
            <button onclick="authenticate()" id="authBtn" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg transition-all shadow-[0_0_15px_rgba(5,150,105,0.4)]">Cihazı Kaydet</button>
            <p id="authMsg" class="mt-4 text-sm text-center text-red-400 hidden"></p>
        </div>

        <div id="mainView" class="hidden">
            <div class="bg-[#09090b] border border-emerald-500/30 rounded-xl p-4 mb-6 flex items-center justify-between">
                <div>
                    <p class="text-xs text-emerald-500 font-bold mb-1">BAĞLI CİHAZ</p>
                    <p id="deviceName" class="text-lg font-semibold text-zinc-100"></p>
                </div>
                <div class="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]"></div>
            </div>
            
            <button onclick="downloadTask()" id="downloadBtn" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] mb-4 flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                İş Emrini İndir
            </button>
            
            <div id="statusBox" class="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 text-center min-h-[60px] flex items-center justify-center">
                Sistem hazır.
            </div>
        </div>
    </div>

    <script>
        const authView = document.getElementById('authView');
        const mainView = document.getElementById('mainView');
        const pinInput = document.getElementById('pinInput');
        const authBtn = document.getElementById('authBtn');
        const authMsg = document.getElementById('authMsg');
        const deviceName = document.getElementById('deviceName');
        const downloadBtn = document.getElementById('downloadBtn');
        const statusBox = document.getElementById('statusBox');

        async function checkStatus() {
            const res = await fetch('/api/status');
            const data = await res.json();
            if (data.authenticated) {
                authView.classList.add('hidden');
                mainView.classList.remove('hidden');
                deviceName.innerText = data.deviceName;
            } else {
                mainView.classList.add('hidden');
                authView.classList.remove('hidden');
            }
        }

        async function authenticate() {
            const pin = pinInput.value.trim();
            if (!pin) return;
            
            authBtn.innerText = "Doğrulanıyor...";
            authBtn.disabled = true;
            authMsg.classList.add('hidden');

            try {
                const res = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pinCode: pin })
                });
                const data = await res.json();
                
                if (data.success) {
                    checkStatus();
                } else {
                    authMsg.innerText = data.message || "Hata oluştu.";
                    authMsg.classList.remove('hidden');
                }
            } catch (err) {
                authMsg.innerText = "Sunucuya bağlanılamadı.";
                authMsg.classList.remove('hidden');
            }
            authBtn.innerText = "Cihazı Kaydet";
            authBtn.disabled = false;
        }

        async function downloadTask() {
            downloadBtn.innerText = "Sorgulanıyor...";
            downloadBtn.disabled = true;
            statusBox.innerHTML = '<span class="animate-pulse">Merkez ile iletişim kuruluyor...</span>';

            try {
                const res = await fetch('/api/download', { method: 'POST' });
                const data = await res.json();
                
                if (data.success) {
                    statusBox.innerHTML = \`<span class="text-emerald-400">\${data.message}</span>\`;
                } else {
                    statusBox.innerHTML = \`<span class="text-amber-400">\${data.message}</span>\`;
                }
            } catch (err) {
                statusBox.innerHTML = '<span class="text-red-400">Sunucu ile iletişim hatası.</span>';
            }
            downloadBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> İş Emrini İndir';
            downloadBtn.disabled = false;
        }

        // Initialize
        checkStatus();
    </script>
</body>
</html>
`;

// Routes
app.get('/', (req, res) => {
    res.send(htmlContent);
});

app.get('/api/status', (req, res) => {
    if (config) {
        res.json({ authenticated: true, deviceName: config.deviceName });
    } else {
        res.json({ authenticated: false });
    }
});

app.post('/api/auth', async (req, res) => {
    const { pinCode } = req.body;
    try {
        const response = await axios.post(`${API_BASE_URL}/auth`, { pinCode }, { timeout: 10000 });
        config = { deviceId: response.data.id, deviceSecret: response.data.deviceSecret, deviceName: response.data.name };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config));
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: "Parola yanlış veya sunucuya ulaşılamıyor." });
    }
});

app.post('/api/download', async (req, res) => {
    const result = await downloadTask();
    res.json(result);
});

const PORT = 3001; // Next.js is usually 3000
app.listen(PORT, () => {
    console.log(`Lavaş Trace Cihaz Ajanı başlatıldı: http://localhost:${PORT}`);
    console.log(`Tarayıcı otomatik açılmazsa, lütfen şu adrese gidin: http://localhost:${PORT}`);
    console.log(`Bu pencereyi kapatırsanız ajan duracaktır.`);
    
    // Tarayıcıyı otomatik aç (Windows)
    try {
        exec(`start http://localhost:${PORT}`);
    } catch (e) {
        console.error("Tarayıcı açılamadı:", e);
    }
});

// Hataların uygulamayı çökertmesini engelle
process.on('uncaughtException', (err) => {
    console.error('Beklenmeyen Hata:', err);
});
