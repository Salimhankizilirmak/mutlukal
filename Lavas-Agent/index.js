const fs = require('fs');
const path = require('path');
const axios = require('axios');
const readline = require('readline');
const notifier = require('node-notifier');

const API_BASE_URL = "http://localhost:3000/api/agent"; 
const DESKTOP_DIR = path.join(require('os').homedir(), 'Desktop');
const CONFIG_FILE = path.join(DESKTOP_DIR, 'Lavas_Config.json');
const IS_EMRI_DIR = path.join(DESKTOP_DIR, 'Is_Emri');
const ARSIV_DIR = path.join(DESKTOP_DIR, 'Arsiv');

[IS_EMRI_DIR, ARSIV_DIR].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir); });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return null;
}

async function authenticateDevice() {
    let config = loadConfig();
    if (config && config.deviceSecret) return config;

    console.log("=== LAVAŞ TRACE: İLK CİHAZ KURULUMU ===");
    const pin = await question("Lütfen web panelinden verilen 6 haneli parolayı (PIN) girin: ");
    
    try {
        const res = await axios.post(`${API_BASE_URL}/auth`, { pinCode: pin }, { timeout: 10000 });
        config = { deviceId: res.data.id, deviceSecret: res.data.deviceSecret, deviceName: res.data.name };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config));
        console.log(`\nBAŞARILI! Bu bilgisayar "${config.deviceName}" olarak kaydedildi.\n`);
        return config;
    } catch (error) {
        if (error.response) {
            console.log(`Hata: Sunucu ${error.response.status} yanıtı döndürdü. Parola yanlış olabilir.`);
        } else if (error.request) {
            console.log("Hata: Sunucuya ulaşılamıyor. Lütfen bağlantınızı kontrol edin.");
        } else {
            console.log("Hata: ", error.message);
        }
        process.exit(1);
    }
}

function cleanIsEmriFolder() {
    const files = fs.readdirSync(IS_EMRI_DIR);
    for (const file of files) {
        try {
            fs.renameSync(path.join(IS_EMRI_DIR, file), path.join(ARSIV_DIR, `${Date.now()}_${file}`));
        } catch (err) {
            console.log(`\n!!! UYARI: ${file} dosyası açık! Lütfen Excel veya barkod programını kapatın.`);
            return false; 
        }
    }
    return true;
}

async function downloadTask(config) {
    console.log("\nMerkezden iş emri sorgulanıyor...");
    try {
        const res = await axios.get(`${API_BASE_URL}/task`, { 
            headers: { Authorization: `Bearer ${config.deviceSecret}` },
            timeout: 10000 
        });
        
        if (res.data && res.data.downloadUrl) {
            if (!cleanIsEmriFolder()) return;
            
            console.log(`İş Emri Bulundu: ${res.data.workOrderNo}. İndiriliyor...`);
            
            const fileRes = await axios.get(res.data.downloadUrl, { 
                responseType: 'stream',
                timeout: 30000 // 30 saniye zaman aşımı
            });
            
            const writer = fs.createWriteStream(path.join(IS_EMRI_DIR, res.data.fileName));
            fileRes.data.pipe(writer);
            
            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log("-> İş emri başarıyla 'Is_Emri' klasörüne aktarıldı!");
                    notifier.notify({
                        title: 'Lavaş Trace',
                        message: 'İŞ EMRİ GELDİ!',
                        sound: true,
                        wait: false
                    });
                    resolve();
                });
                writer.on('error', (err) => {
                    console.log("-> Dosya yazma hatası:", err.message);
                    reject(err);
                });
            });
        }
    } catch (error) {
        if(error.response && error.response.status === 404) {
            console.log("Şu an size atanmış yeni bir iş emri yok.");
        } else if (error.code === 'ECONNABORTED') {
            console.log("Bağlantı zaman aşımına uğradı. İnternet bağlantınızı kontrol edin.");
        } else {
            console.log("Bağlantı hatası: Sunucuya veya dosyaya ulaşılamıyor.");
            if (error.message) console.log("Detay:", error.message);
        }
    }
}

async function showMenu(config) {
    console.log(`\n=== AKTİF CİHAZ: ${config.deviceName} ===`);
    console.log("[1] Yeni İş Emrini İndir");
    console.log("[0] Çıkış");
    
    const choice = await question("Seçiminiz: ");
    
    if (choice === '1') {
        await downloadTask(config);
    } else if (choice === '0') {
        process.exit(0);
    } else {
        console.log("Geçersiz seçim.");
    }
    
    setTimeout(() => showMenu(config), 1000);
}

async function init() {
    const config = await authenticateDevice();
    await showMenu(config);
}

init();
