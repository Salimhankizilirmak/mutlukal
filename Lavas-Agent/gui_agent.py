import os
import customtkinter as ctk
from tkinter import filedialog, messagebox
import requests
import json
import threading

# --- AYARLAR ---
API_URL = "https://mutlukal.novexistech.com/api/agent"
API_TASK_URL = "https://mutlukal.novexistech.com/api/agent/task"
API_AUTH_URL = "https://mutlukal.novexistech.com/api/agent/auth"

# Masaüstü yolunu güvenle bul
DESKTOP = os.path.join(os.path.expanduser("~"), "Desktop")
if not os.path.exists(DESKTOP):
    DESKTOP = os.path.join(os.path.expanduser("~"), "Masaüstü")
if not os.path.exists(DESKTOP):
    DESKTOP = os.path.expanduser("~")

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Lavas_Config.json")

FOLDERS = ["Is_Emri", "Arsiv", "Raporlar"]
for f in FOLDERS:
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f)
    os.makedirs(path, exist_ok=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IS_EMRI_DIR = os.path.join(BASE_DIR, "Is_Emri")
ARSIV_DIR = os.path.join(BASE_DIR, "Arsiv")
RAPORLAR_DIR = os.path.join(BASE_DIR, "Raporlar")

# Tema
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("green")


def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def save_config(data):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class SetupWindow(ctk.CTkToplevel):
    def __init__(self, parent, on_success):
        super().__init__(parent)
        self.title("İlk Kurulum - Lavaş Trace")
        self.geometry("400x300")
        self.resizable(False, False)
        self.attributes("-topmost", True)
        self.on_success = on_success

        ctk.CTkLabel(self, text="LAVAŞ TRACE", font=("Arial", 22, "bold"), text_color="#10b981").pack(pady=20)
        ctk.CTkLabel(self, text="İlk kurulum için web panelinden aldığınız\n6 haneli PIN kodunu girin.", font=("Arial", 13), text_color="#a1a1aa").pack()

        self.pin_entry = ctk.CTkEntry(self, placeholder_text="PIN Kodu", font=("Arial", 28), width=200,
                                      justify="center", height=55)
        self.pin_entry.pack(pady=20)

        self.btn = ctk.CTkButton(self, text="Cihazı Kaydet", font=("Arial", 14, "bold"),
                                 height=45, fg_color="#059669", hover_color="#047857",
                                 command=self.authenticate)
        self.btn.pack(pady=5)

        self.lbl_err = ctk.CTkLabel(self, text="", text_color="#ef4444", font=("Arial", 12))
        self.lbl_err.pack(pady=5)

    def authenticate(self):
        pin = self.pin_entry.get().strip()
        if not pin:
            self.lbl_err.configure(text="PIN kodu boş olamaz.")
            return

        self.btn.configure(state="disabled", text="Doğrulanıyor...")
        self.lbl_err.configure(text="")

        def do_auth():
            try:
                res = requests.post(API_AUTH_URL, json={"pinCode": pin}, timeout=10)
                data = res.json()
                if res.status_code == 200 and data.get("id"):
                    config = {
                        "deviceId": data["id"],
                        "deviceSecret": data["deviceSecret"],
                        "deviceName": data["name"]
                    }
                    save_config(config)
                    self.after(0, lambda: self.on_success(config))
                    self.after(0, self.destroy)
                else:
                    self.after(0, lambda: self.lbl_err.configure(text="PIN yanlış veya sunucu yanıt vermiyor."))
                    self.after(0, lambda: self.btn.configure(state="normal", text="Cihazı Kaydet"))
            except Exception as e:
                self.after(0, lambda: self.lbl_err.configure(text=f"Bağlantı hatası: {e}"))
                self.after(0, lambda: self.btn.configure(state="normal", text="Cihazı Kaydet"))

        threading.Thread(target=do_auth, daemon=True).start()


class LavasAgent(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Lavaş Trace - Makine Paneli")
        self.geometry("620x520")
        self.resizable(False, False)
        self.configure(fg_color="#09090b")

        self.config = None
        self.current_batch_id = None

        self.setup_ui()
        self.after(300, self.check_auth)

    def setup_ui(self):
        # Başlık
        header = ctk.CTkFrame(self, fg_color="#18181b", corner_radius=0, height=70)
        header.pack(fill="x")
        header.pack_propagate(False)
        ctk.CTkLabel(header, text="⚙  LAVAŞ TRACE", font=("Arial", 20, "bold"), text_color="#10b981").pack(side="left", padx=20, pady=15)
        self.lbl_device = ctk.CTkLabel(header, text="Cihaz bağlanıyor...", font=("Arial", 12), text_color="#71717a")
        self.lbl_device.pack(side="right", padx=20)

        # Durum
        self.lbl_status = ctk.CTkLabel(self, text="⏳ Bağlantı kontrol ediliyor...",
                                        text_color="#eab308", font=("Arial", 15, "bold"))
        self.lbl_status.pack(pady=20)

        # İndir Butonu
        self.btn_download = ctk.CTkButton(
            self, text="⬇   YENİ İŞ EMRİNİ İNDİR",
            font=("Arial", 22, "bold"), height=90, width=450,
            fg_color="#059669", hover_color="#047857",
            command=self.download_task
        )
        self.btn_download.pack(pady=10)

        # Rapor Gönder Butonu
        self.btn_report = ctk.CTkButton(
            self, text="📤  RAPORU SEÇ VE GÖNDER",
            font=("Arial", 17, "bold"), height=65, width=450,
            fg_color="#3f3f46", hover_color="#52525b",
            command=self.send_report
        )
        self.btn_report.pack(pady=10)

        # Klasörü Aç Butonu
        self.btn_open = ctk.CTkButton(
            self, text="📁  İş Emri Klasörünü Aç",
            font=("Arial", 13), height=40, width=300,
            fg_color="#27272a", hover_color="#3f3f46",
            command=lambda: os.startfile(IS_EMRI_DIR)
        )
        self.btn_open.pack(pady=5)

        # Log Alanı
        self.log_box = ctk.CTkTextbox(self, height=80, width=560, fg_color="#18181b",
                                       text_color="#a1a1aa", font=("Consolas", 11))
        self.log_box.pack(pady=10)
        self.log("Sistem başlatılıyor...")

        # İş Aktarma Butonu (sağ alt)
        self.btn_transfer = ctk.CTkButton(
            self, text="🔄 İş Emrini Aktar",
            font=("Arial", 12), height=32, width=160,
            fg_color="#b45309", hover_color="#92400e",
            command=self.open_transfer_dialog
        )
        self.btn_transfer.place(relx=0.97, rely=0.97, anchor="se")

    def log(self, msg):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", f"» {msg}\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def check_auth(self):
        self.config = load_config()
        if self.config and self.config.get("deviceSecret"):
            self.on_auth_success(self.config)
        else:
            SetupWindow(self, self.on_auth_success)

    def on_auth_success(self, config):
        self.config = config
        self.lbl_device.configure(text=f"📟  {config['deviceName']}")
        self.lbl_status.configure(text="🟢  SİSTEME BAĞLI", text_color="#10b981")
        self.log(f"Cihaz: {config['deviceName']} - Bağlantı başarılı.")

    def download_task(self):
        if not self.config:
            messagebox.showwarning("Uyarı", "Önce cihaz kaydı yapmalısınız.")
            return

        self.lbl_status.configure(text="⏳ Merkez sorgulanıyor...", text_color="#eab308")
        self.btn_download.configure(state="disabled", text="⏳  İndiriliyor...")
        self.log("İş emri sorgulanıyor...")

        def do_download():
            try:
                res = requests.get(API_TASK_URL,
                                   headers={"Authorization": f"Bearer {self.config['deviceSecret']}"},
                                   timeout=15)
                if res.status_code == 200:
                    data = res.json()
                    if data.get("downloadUrl"):
                        self.current_batch_id = data.get("id")
                        file_name = data.get("fileName", f"{data.get('workOrderNo', 'isemri')}.xlsx")
                        save_path = os.path.join(IS_EMRI_DIR, file_name)

                        # Mevcut dosyaları arşive taşı
                        for f in os.listdir(IS_EMRI_DIR):
                            try:
                                os.rename(os.path.join(IS_EMRI_DIR, f),
                                          os.path.join(ARSIV_DIR, f"{os.path.splitext(f)[0]}_{int(__import__('time').time())}{os.path.splitext(f)[1]}"))
                            except Exception:
                                pass

                        file_res = requests.get(data["downloadUrl"], timeout=30)
                        with open(save_path, "wb") as f:
                            f.write(file_res.content)

                        self.after(0, lambda: self.lbl_status.configure(text=f"🟢  İŞ EMRİ ALINDI: {file_name}", text_color="#10b981"))
                        self.after(0, lambda: self.log(f"İndirildi: {file_name}"))
                        self.after(0, lambda: os.startfile(IS_EMRI_DIR))
                    else:
                        self.after(0, lambda: self.lbl_status.configure(text="🟡  Atanmış iş emri yok", text_color="#eab308"))
                        self.after(0, lambda: self.log("Atanmış bekleyen iş emri bulunamadı."))
                else:
                    self.after(0, lambda: self.lbl_status.configure(text="🔴  Sunucu hatası", text_color="#ef4444"))
                    self.after(0, lambda: self.log(f"Sunucu hatası: {res.status_code}"))
            except Exception as e:
                self.after(0, lambda: self.lbl_status.configure(text="🔴  Bağlantı hatası", text_color="#ef4444"))
                self.after(0, lambda: self.log(f"Hata: {e}"))
            finally:
                self.after(0, lambda: self.btn_download.configure(state="normal", text="⬇   YENİ İŞ EMRİNİ İNDİR"))

        threading.Thread(target=do_download, daemon=True).start()

    def send_report(self):
        if not self.config:
            messagebox.showwarning("Uyarı", "Önce cihaz kaydı yapmalısınız.")
            return
        if not self.current_batch_id:
            messagebox.showwarning("Uyarı", "Önce bir iş emri indirmelisiniz.")
            return

        file_path = filedialog.askopenfilename(
            initialdir=RAPORLAR_DIR,
            title="Gönderilecek Raporu Seçin",
            filetypes=(("Desteklenen Dosyalar", "*.pdf *.xlsx *.docx *.xls"), ("Tüm Dosyalar", "*.*"))
        )
        if not file_path:
            return

        file_name = os.path.basename(file_path)
        self.log(f"Rapor gönderiliyor: {file_name}")

        def do_upload():
            try:
                # 1. Sunucudan yükleme URL'i al
                url_res = requests.post(API_URL, json={
                    "action": "get_report_upload_url",
                    "deviceSecret": self.config["deviceSecret"],
                    "fileName": file_name
                }, timeout=15)
                
                if url_res.status_code != 200:
                    self.after(0, lambda: messagebox.showerror("Hata", "Yükleme URL'i alınamadı."))
                    return
                
                url_data = url_res.json()
                if not url_data.get("success"):
                    self.after(0, lambda: messagebox.showerror("Hata", url_data.get("message", "URL hatası.")))
                    return
                
                upload_url = url_data["uploadUrl"]
                report_url = url_data["reportUrl"]

                # 2. S3'e doğrudan yükle
                self.after(0, lambda: self.log("Dosya buluta aktarılıyor..."))
                with open(file_path, "rb") as f:
                    s3_res = requests.put(upload_url, data=f, headers={
                        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    }, timeout=60)
                
                if s3_res.status_code != 200:
                    self.after(0, lambda: messagebox.showerror("Hata", "Bulut yükleme hatası."))
                    return

                # 3. Yüklemeyi sunucuya onayla
                self.after(0, lambda: self.log("Rapor kaydediliyor..."))
                confirm_res = requests.post(API_URL, json={
                    "action": "upload_report",
                    "deviceSecret": self.config["deviceSecret"],
                    "batchId": self.current_batch_id,
                    "reportUrl": report_url,
                    "fileName": file_name
                }, timeout=15)

                if confirm_res.status_code == 200 and confirm_res.json().get("success"):
                    self.after(0, lambda: messagebox.showinfo("Başarılı", f"'{file_name}' merkeze iletildi!"))
                    self.after(0, lambda: self.log(f"Rapor iletildi: {file_name}"))
                    self.after(0, lambda: self.lbl_status.configure(text="🟢  RAPOR GÖNDERİLDİ", text_color="#10b981"))
                    self.current_batch_id = None
                else:
                    msg = confirm_res.json().get("message", "Sunucu raporu onaylamadı.")
                    self.after(0, lambda: messagebox.showerror("Hata", msg))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Hata", f"İşlem sırasında hata: {e}"))
            finally:
                self.after(0, lambda: self.btn_report.configure(state="normal", text="📤  RAPORU SEÇ VE GÖNDER"))

        threading.Thread(target=do_upload, daemon=True).start()

    def open_transfer_dialog(self):
        if not self.config:
            messagebox.showwarning("Uyarı", "Önce cihaz kaydı yapmalısınız.")
            return

        dialog = ctk.CTkToplevel(self)
        dialog.geometry("320x280")
        dialog.title("İş Emri Aktar")
        dialog.configure(fg_color="#18181b")
        dialog.attributes("-topmost", True)
        dialog.resizable(False, False)

        ctk.CTkLabel(dialog, text="🔄  İş Emrini Aktar", font=("Arial", 16, "bold"), text_color="#f59e0b").pack(pady=15)
        ctk.CTkLabel(dialog, text="Aktarılacak cihazı seçin:", font=("Arial", 12), text_color="#a1a1aa").pack()

        device_names = ctk.StringVar(value="Yükleniyor...")
        device_map = {}

        combo = ctk.CTkComboBox(dialog, variable=device_names, width=260, height=40, font=("Arial", 13))
        combo.pack(pady=15)

        def load_devices():
            try:
                res = requests.post(API_URL, json={
                    "action": "get_devices",
                    "deviceSecret": self.config["deviceSecret"]
                }, timeout=10)
                devs = res.json()
                if isinstance(devs, list) and devs:
                    for d in devs:
                        device_map[d["name"]] = d["id"]
                    names = list(device_map.keys())
                    dialog.after(0, lambda: combo.configure(values=names))
                    dialog.after(0, lambda: device_names.set(names[0]))
                else:
                    dialog.after(0, lambda: device_names.set("Cihaz bulunamadı"))
            except Exception as e:
                dialog.after(0, lambda: device_names.set(f"Hata: {e}"))

        threading.Thread(target=load_devices, daemon=True).start()

        def confirm():
            selected = device_names.get()
            target_id = device_map.get(selected)
            if not target_id or not self.current_batch_id:
                messagebox.showwarning("Uyarı", "Cihaz veya iş emri seçilmedi.", parent=dialog)
                return

            def do_transfer():
                try:
                    res = requests.post(API_URL, json={
                        "action": "transfer_batch",
                        "deviceSecret": self.config["deviceSecret"],
                        "batchId": self.current_batch_id,
                        "targetDeviceId": target_id
                    }, timeout=10)
                    if res.status_code == 200:
                        self.after(0, lambda: messagebox.showinfo("Başarılı", f"İş emri '{selected}' cihazına aktarıldı!"))
                        self.after(0, lambda: self.log(f"İş emri aktarıldı → {selected}"))
                        self.current_batch_id = None
                    else:
                        self.after(0, lambda: messagebox.showerror("Hata", "Aktarım başarısız."))
                except Exception as e:
                    self.after(0, lambda: messagebox.showerror("Hata", str(e)))
                dialog.after(0, dialog.destroy)

            threading.Thread(target=do_transfer, daemon=True).start()

        ctk.CTkButton(dialog, text="✔  Aktarımı Onayla", font=("Arial", 13, "bold"),
                      height=45, width=260, fg_color="#b45309", hover_color="#92400e",
                      command=confirm).pack(pady=15)


if __name__ == "__main__":
    app = LavasAgent()
    app.mainloop()
