'use client';
import { useState } from 'react';
import { Download, RefreshCw, X, Loader2, FileDown, FileJson } from 'lucide-react';
import { getBatchDownloadUrl } from '@/actions/batch';
import * as XLSX from 'xlsx';

interface ConvertModalProps {
  workOrderNo: string;
  onClose: () => void;
}

function ConvertModal({ workOrderNo, onClose }: ConvertModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [orderNo, setOrderNo] = useState(workOrderNo);
  const [gtin, setGtin] = useState('');
  const [productName, setProductName] = useState('');
  const [productionDate, setProductionDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [hasExistingHierarchy, setHasExistingHierarchy] = useState(false);
  const [itemsPerCarton, setItemsPerCarton] = useState('30');
  const [cartonsPerPallet, setCartonsPerPallet] = useState('84');
  const [startingSerial, setStartingSerial] = useState(() => String(Math.floor(Math.random() * 8999999) + 1000000));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const calculateCheckDigit = (number: string) => {
    const digits = number.split('').map(Number);
    let total = 0;
    const reverse = digits.reverse();
    for (let i = 0; i < reverse.length; i++) {
      if (i % 2 === 0) total += reverse[i] * 3;
      else total += reverse[i];
    }
    return (10 - (total % 10)) % 10;
  };

  const generateSSCC = (extension: string, gln: string, serial: number) => {
    const serialStr = String(serial).padStart(7, '0');
    const base = extension + gln + serialStr;
    const check = calculateCheckDigit(base);
    return '00' + base + check; // (00) prefix restored as requested by partner
  };

  const cleanAndFormat = (val: string, type: 'gtin' | 'sscc') => {
    if (!val) return '';
    // Only strip invisible unicode junk from start/end — preserve internal GS (\u001D) and all payload chars
    let v = String(val).replace(/^[\u200B-\u200D\uFEFF\s]+|[\u200B-\u200D\uFEFF\s]+$/g, '');
    
    // Attempt to fix scientific notation if present (e.g. 8.69E+16)
    if (/^[\d.]+e[+\-]\d+$/i.test(v)) {
      try { v = BigInt(Math.round(Number(v))).toString(); } catch {}
    }
    
    if (v.startsWith('(01)')) v = v.substring(4);
    if (v.startsWith('(00)')) v = v.substring(4);
    
    if (type === 'gtin') {
      // Restore dropped leading zero from Excel (13-digit all-numeric GTIN becomes 14-digit)
      if (/^\d{13}$/.test(v)) v = '0' + v;

      // Restore GS (\u001D) separators for Russian crypto tails (AI 91 and AI 92).
      // Scanners often omit the GS or replace it with a space. 
      // We look for the 91[4chars]92 pattern and ensure proper \u001D prefixes.
      // This handles: " 91XXXX 92", "91XXXX92", and already correct "\u001D91XXXX\u001D92"
      v = v.replace(/[ \u001D]?91([A-Za-z0-9]{4})[ \u001D]?92/g, '\u001D91$1\u001D92');
      
      // Remove any double GS that might have been created if one was already there
      v = v.replace(/\u001D\u001D/g, '\u001D');
    }
    
    if (type === 'sscc') {
      // Partner requires exactly 20-digit SSCC prefixed with 00
      // Strip any non-digit characters first, then pad to 20 digits
      const digitsOnly = v.replace(/\D/g, '');
      v = digitsOnly.padStart(20, '0').slice(-20);
    }
    
    return v;
  };

  const handleConvert = async () => {
    if (!file) { setError('Lütfen rapor dosyasını seçin.'); return; }
    setError(''); setSuccess(''); setLoading(true);
    try {
      let data: string[][] = [];
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      
      // If it's an Excel file, try to find the "Okunanlar" sheet, otherwise use the first sheet
      let ws = wb.Sheets[wb.SheetNames[0]];
      if (!file.name.toLowerCase().endsWith('.csv')) {
        const targetSheetName = wb.SheetNames.find(s =>
          s.toLowerCase().includes('okunan') || s.toLowerCase().includes('read') || s.toLowerCase().includes('scan') ||
          s.toLowerCase().includes('aksiyon') || s.toLowerCase().includes('action') || s.toLowerCase().includes('kod')
        ) || wb.SheetNames[0];
        ws = wb.Sheets[targetSheetName];
      }

      data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as string[][];

      if (!data || data.length === 0) throw new Error("Dosyada veri bulunamadı.");

      const csvLines: string[] = [];
      let quantity = 0;

      if (hasExistingHierarchy) {
        const headerRow = data[0] || [];
        let markaIdx = headerRow.findIndex(h => String(h).toLowerCase().includes('barkod') || String(h).toLowerCase().includes('kod') || String(h).toLowerCase().includes('marka') || String(h).toLowerCase().includes('gtin'));
        let koliIdx = headerRow.findIndex(h => String(h).toLowerCase().includes('koli'));
        let paletIdx = headerRow.findIndex(h => String(h).toLowerCase().includes('palet'));

        if (markaIdx === -1) markaIdx = 0;
        if (koliIdx === -1) koliIdx = 1;
        if (paletIdx === -1) paletIdx = 2;

        let startIdx = 1;
        if (data[0] && (String(data[0][markaIdx] || '').startsWith('01') || String(data[0][markaIdx] || '').startsWith('(01)'))) {
          startIdx = 0;
        }

        const processedRows: { marka: string, koli: string, palet: string }[] = [];
        
        for (let i = startIdx; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length === 0) continue;
          
          const rawMarka = String(row[markaIdx] || '').trim();
          const koli = cleanAndFormat(row[koliIdx], 'sscc');
          const palet = cleanAndFormat(row[paletIdx], 'sscc');

          // If this row doesn't start with '01' and we have a previous row, 
          // it's likely a continuation of a split barcode.
          if (processedRows.length > 0 && !rawMarka.startsWith('01') && !rawMarka.startsWith('(01)')) {
            const lastRow = processedRows[processedRows.length - 1];
            // Only merge if SSCCs match or the current row has no SSCCs (pure continuation)
            if (!koli || koli === lastRow.koli) {
              lastRow.marka = cleanAndFormat(lastRow.marka + rawMarka, 'gtin');
              continue;
            }
          }

          const marka = cleanAndFormat(rawMarka, 'gtin');
          if (!marka && !koli && !palet) continue;
          
          processedRows.push({ marka, koli, palet });
        }

        for (const row of processedRows) {
          csvLines.push(`${row.marka}\t${row.koli}\t${row.palet}`);
          quantity++;
        }

        if (quantity === 0) throw new Error('Dönüştürülecek veri bulunamadı. Lütfen sütunların doğruluğundan emin olun.');
      } else {
        const headerRow = data[0] || [];
        const barcodeColIdx = headerRow.findIndex(h => String(h).toLowerCase().includes('barkod') || String(h).toLowerCase().includes('kod') && !String(h).toLowerCase().includes('koli') && !String(h).toLowerCase().includes('palet'));
        const barcodeIdx = barcodeColIdx >= 0 ? barcodeColIdx : 1;

        const markalar: string[] = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i]) continue;
          const val = String(data[i][barcodeIdx] || '').trim();
          if (val.startsWith('01') || val.startsWith('(01)') || val.length >= 13) {
            const cleaned = cleanAndFormat(val, 'gtin');
            if (cleaned) markalar.push(cleaned);
          }
        }

        if (markalar.length === 0) throw new Error('Geçerli markalama kodu (01...) bulunamadı.');

        const GLN = "869882938";
        const EXTENSION = "2";
        const ipc = parseInt(itemsPerCarton) || 30;
        const cpp = parseInt(cartonsPerPallet) || 84;
        let serial = parseInt(startingSerial) || 1000000;

        let currentKoliSSCC = "";
        let currentPaletSSCC = "";

        for (let i = 0; i < markalar.length; i++) {
          const isNewKoli = i % ipc === 0;
          const cartonNo = Math.floor(i / ipc) + 1;
          const isNewPalet = isNewKoli && ((cartonNo - 1) % cpp === 0);

          if (isNewKoli) {
            if (isNewPalet) {
              currentPaletSSCC = generateSSCC(EXTENSION, GLN, serial);
              serial++;
            }
            currentKoliSSCC = generateSSCC(EXTENSION, GLN, serial);
            serial++;
          }

          csvLines.push(`${markalar[i]}\t${currentKoliSSCC}\t${currentPaletSSCC}`);
        }
        quantity = markalar.length;
      }

      // Dosyanın Windows Notepad'de düzgün görünmesi için \r\n ile birleştirildi
      const csvContent = csvLines.join('\r\n');
      const dateStr = productionDate || new Date().toLocaleDateString('tr-TR').replace(/\./g, '.');
      const fileName = `${orderNo}, GTIN, ${quantity}, ${productName}, ${dateStr}.csv`;

      // Excel'in Türkçe karakterleri ve UTF-8'i sorunsuz tanıması için BOM (\uFEFF) eklendi
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);

      setSuccess(`✔ "${fileName}" oluşturuldu!`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bilinmeyen hata.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#18181b] border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/50 sticky top-0 z-10">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <FileJson size={18} className="text-amber-400" />
            Triton Sevkiyat Dönüştürücü (Python Mode)
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">Rapor Dosyası</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-300 text-xs file:mr-3 file:bg-zinc-800 file:border-0 file:text-zinc-300 file:text-[10px] file:py-1 file:px-2 file:rounded" />
            
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={hasExistingHierarchy} onChange={e => setHasExistingHierarchy(e.target.checked)} 
                className="w-4 h-4 rounded border-zinc-700 bg-[#09090b] accent-amber-500" />
              <span className="text-xs text-zinc-400 font-medium">Dosyada koli ve palet kodları zaten mevcut (Sadece tarihleri ekle)</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">İş Emri No</label>
              <input value={orderNo} onChange={e => setOrderNo(e.target.value)}
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">GTIN</label>
              <input value={gtin} onChange={e => setGtin(e.target.value)} placeholder="086988..."
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none focus:border-amber-500/50" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">Ürün Adı</label>
              <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Urun"
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">Üretim Tarihi</label>
              <input value={productionDate} onChange={e => setProductionDate(e.target.value)} placeholder="01.01.2024"
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">Son K. Tarihi</label>
              <input value={expiryDate} onChange={e => setExpiryDate(e.target.value)} placeholder="01.01.2025"
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none focus:border-amber-500/50" />
            </div>
          </div>

          {!hasExistingHierarchy && (
            <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4">
               <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Agregasyon Ayarları (SSCC)</p>
               <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[9px] uppercase text-zinc-500 mb-1 block">Koli/Şişe</label>
                    <input type="number" value={itemsPerCarton} onChange={e => setItemsPerCarton(e.target.value)}
                      className="w-full bg-black/50 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200" />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase text-zinc-500 mb-1 block">Palet/Koli</label>
                    <input type="number" value={cartonsPerPallet} onChange={e => setCartonsPerPallet(e.target.value)}
                      className="w-full bg-black/50 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200" />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase text-zinc-500 mb-1 block">Seri No</label>
                    <input type="number" value={startingSerial} onChange={e => setStartingSerial(e.target.value)}
                      className="w-full bg-black/50 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200" />
                  </div>
               </div>
            </div>
          )}

          {error && <p className="text-red-400 text-[10px] bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-emerald-400 text-[10px] bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2">{success}</p>}

          <button onClick={handleConvert} disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all text-sm shadow-lg shadow-emerald-900/20">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Dönüştür ve İndir (.CSV)
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReportActionsProps {
  workOrderNo: string;
  downloadUrl: string; // Job order URL
  reportUrl: string;   // Real report URL
}

export default function ReportActions({ workOrderNo, downloadUrl, reportUrl }: ReportActionsProps) {
  const [showModal, setShowModal] = useState(false);
  const [dlJob, setDlJob] = useState(false);
  const [dlRep, setDlRep] = useState(false);

  const handleDownload = async (url: string, type: 'job' | 'report') => {
    if (type === 'job') setDlJob(true); else setDlRep(true);
    try {
      const signedUrl = await getBatchDownloadUrl(url);
      if (signedUrl) {
        const a = document.createElement('a');
        a.href = signedUrl;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 100);
      }
    } catch {
      alert('Hata oluştu.');
    } finally {
      if (type === 'job') setDlJob(false); else setDlRep(false);
    }
  };

  return (
    <>
      <div className="flex justify-end gap-2">
        {/* RAPOR İNDİR (Ana Aksiyon) */}
        <button
          onClick={() => handleDownload(reportUrl, 'report')}
          disabled={dlRep}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition-all shadow-lg shadow-blue-900/20"
        >
          {dlRep ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Raporu İndir
        </button>

        {/* SAF HALİNİ İNDİR (Yan Aksiyon) */}
        <button
          onClick={() => handleDownload(downloadUrl, 'job')}
          disabled={dlJob}
          title="Orijinal İş Emri Dosyası"
          className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-[11px] font-bold px-3 py-2 rounded-lg transition-all border border-zinc-700"
        >
          {dlJob ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
          İş Emrini İndir
        </button>

        {/* DÖNÜŞTÜR */}
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-amber-600/10 border border-amber-600/30 hover:bg-amber-600 hover:text-white text-amber-500 text-[11px] font-bold px-3 py-2 rounded-lg transition-all"
        >
          <RefreshCw size={13} /> Dönüştür
        </button>
      </div>

      {showModal && <ConvertModal workOrderNo={workOrderNo} onClose={() => setShowModal(false)} />}
    </>
  );
}
