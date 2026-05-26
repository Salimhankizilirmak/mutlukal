'use client';

import { useState } from 'react';
import { Scissors, FileMinus, FileCheck, CheckCircle2, AlertCircle, Loader2, Download } from 'lucide-react';
import { FileDropzone } from '@/components/FileDropzone';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { generateNextSSCC, formatAsKoliSSCC, calculateSSCCCheckDigit } from '@/lib/gs1';
import JSZip from 'jszip';

export default function GS1ToolsPage() {
  const [activeTab, setActiveTab] = useState<'split' | 'trim' | 'reconcile'>('split');

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-950/40 via-blue-950/20 to-zinc-950 p-6 sm:p-8 border border-indigo-900/20 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div>
          <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold tracking-wider text-indigo-400 uppercase">
            GS1 OPERASYON MERKEZİ
          </span>
          <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            Gelişmiş Dosya Araçları
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">
            Makine raporlarını bölebilir, kırpabilir veya mükerrer kontrolü yaparak referans dosyalarınızla 100% eşleştirebilirsiniz.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-zinc-900/50 p-1.5 rounded-2xl border border-zinc-800">
        <button
          onClick={() => setActiveTab('split')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === 'split' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
        >
          <Scissors size={16} /> Dosya Bölme (Split)
        </button>
        <button
          onClick={() => setActiveTab('trim')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === 'trim' ? 'bg-amber-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
        >
          <FileMinus size={16} /> Dosya Kırpma (Trim)
        </button>
        <button
          onClick={() => setActiveTab('reconcile')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === 'reconcile' ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
        >
          <FileCheck size={16} /> Eşleştirme & Raporlama
        </button>
      </div>

      {/* Content */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        {activeTab === 'split' && <SplitTab />}
        {activeTab === 'trim' && <TrimTab />}
        {activeTab === 'reconcile' && <ReconcileTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. SPLIT TAB
// ---------------------------------------------------------------------------
function SplitTab() {
  const [file, setFile] = useState<File | null>(null);
  const [splitCount1, setSplitCount1] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSplit = async () => {
    if (!file) return setError('Lütfen dosya seçin.');
    const count1 = parseInt(splitCount1);
    if (!count1 || isNaN(count1)) return setError('Geçerli bir ayırma adedi girin (Örn: 35000).');
    
    setLoading(true); setError(''); setSuccess('');
    try {
      const text = await file.text();
      const cleanText = text.startsWith('\ufeff') ? text.slice(1) : text;
      // We assume single column or TSV, standard format.
      const lines = cleanText.split(/\r?\n/).filter(l => l.trim().length > 0);
      
      const isHeaders = lines[0].toLowerCase().includes('kod') || lines[0].startsWith('01');
      const dataLines = isHeaders && lines[0].length < 50 ? lines.slice(1) : lines; // very rudimentary header skip
      // Actually, standard is just read lines.

      if (count1 >= dataLines.length) throw new Error(`Dosyada sadece ${dataLines.length} satır var. Girdiğiniz değer daha küçük olmalı.`);

      const part1 = dataLines.slice(0, count1);
      const part2 = dataLines.slice(count1);

      const zip = new JSZip();
      const nameNoExt = file.name.replace(/\.[^/.]+$/, "");
      
      zip.file(`${nameNoExt}_PART1_(${part1.length}_adet).csv`, '\ufeff' + part1.join('\r\n'));
      zip.file(`${nameNoExt}_PART2_(${part2.length}_adet).csv`, '\ufeff' + part2.join('\r\n'));
      
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nameNoExt}_BOLUNMUS.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setSuccess(`Dosya başarıyla ${part1.length} ve ${part2.length} adetlik 2 parçaya bölündü ve ZIP olarak indirildi.`);
    } catch (e: any) {
      setError(e.message || 'Bölme hatası.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white">Büyük Dosyayı İkiye Böl</h2>
      <p className="text-xs text-zinc-400">Tek bir CSV veya TXT dosyasını yükleyin, ilk parça için istediğiniz satır sayısını girin.</p>
      
      {!file ? (
         <FileDropzone label="Bölünecek Dosyayı Yükle (.csv, .txt)" accept=".csv,.txt" onFileSelect={setFile} />
      ) : (
        <div className="space-y-4">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-300">{file.name}</span>
            <button onClick={() => setFile(null)} className="text-[10px] text-red-400">İptal</button>
          </div>
          
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">1. Parça İçin Ürün Adedi</label>
              <input type="number" value={splitCount1} onChange={e => setSplitCount1(e.target.value)} placeholder="Örn: 20660" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 mt-1 text-sm text-white outline-none focus:border-indigo-500" />
            </div>
            <div className="flex-1 opacity-50">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">2. Parça</label>
              <input disabled value="Kalan tüm ürünler" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 mt-1 text-sm text-zinc-400 outline-none" />
            </div>
          </div>

          <button onClick={handleSplit} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Scissors size={18} />}
            {loading ? 'Bölünüyor...' : 'Dosyayı Böl ve İndir'}
          </button>

          {error && <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-lg">{error}</p>}
          {success && <p className="text-xs text-emerald-400 bg-emerald-500/10 p-3 rounded-lg flex items-center gap-2"><CheckCircle2 size={16}/> {success}</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. TRIM TAB
// ---------------------------------------------------------------------------
function TrimTab() {
  const [files, setFiles] = useState<File[]>([]);
  const [trimAmounts, setTrimAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleProcess = async () => {
    if (files.length === 0) return setError('Dosya yok.');
    setLoading(true); setError(''); setSuccess('');
    try {
      const zip = new JSZip();

      for (const f of files) {
        const amtStr = trimAmounts[f.name];
        const trimAmt = parseInt(amtStr) || 0;

        const text = await f.text();
        const cleanText = text.startsWith('\ufeff') ? text.slice(1) : text;
        const lines = cleanText.split(/\r?\n/).filter(l => l.trim().length > 0);
        
        let finalLines = lines;
        if (trimAmt > 0 && trimAmt < lines.length) {
          finalLines = lines.slice(0, lines.length - trimAmt);
        } else if (trimAmt >= lines.length) {
          throw new Error(`${f.name} için silinecek miktar dosyadaki tüm ürünlerden fazla olamaz.`);
        }

        const nameNoExt = f.name.replace(/\.[^/.]+$/, "");
        zip.file(`${nameNoExt}_TRIMMED_(${finalLines.length}).csv`, '\ufeff' + finalLines.join('\r\n'));
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Kirpilmis_Dosyalar.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setSuccess(`${files.length} dosya kırpıldı ve indirildi.`);
    } catch (e: any) {
      setError(e.message || 'Kırpma hatası.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white">Dosyaları Kırp (Sondan Sil)</h2>
      <p className="text-xs text-zinc-400">İstediğiniz kadar dosya yükleyin ve her birinin en altından (sondan) kaç satır/ürün silineceğini belirleyin.</p>

      {files.length === 0 ? (
        <label className="border-2 border-dashed border-zinc-700 bg-zinc-900/50 rounded-2xl flex flex-col items-center justify-center py-12 cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-all">
           <FileMinus size={32} className="text-zinc-500 mb-3" />
           <span className="text-sm font-bold text-zinc-300">Birden Fazla Dosya Seçin</span>
           <input type="file" multiple accept=".csv,.txt" className="hidden" onChange={e => {
             if (e.target.files) setFiles(Array.from(e.target.files));
           }} />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end"><button onClick={() => {setFiles([]); setTrimAmounts({});}} className="text-[10px] text-red-400 underline">Temizle</button></div>
          <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
                <div className="flex-1 truncate text-xs font-mono text-zinc-300">{f.name}</div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-zinc-500 whitespace-nowrap">Sondan Silinecek:</label>
                  <input type="number" placeholder="Örn: 420" value={trimAmounts[f.name] || ''} onChange={e => setTrimAmounts({...trimAmounts, [f.name]: e.target.value})} className="w-20 bg-black border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-amber-500" />
                </div>
              </div>
            ))}
          </div>

          <button onClick={handleProcess} disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <FileMinus size={18} />}
            {loading ? 'Kırpılıyor...' : 'Toplu Kırp ve İndir'}
          </button>

          {error && <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-lg">{error}</p>}
          {success && <p className="text-xs text-emerald-400 bg-emerald-500/10 p-3 rounded-lg flex items-center gap-2"><CheckCircle2 size={16}/> {success}</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. RECONCILE TAB
// ---------------------------------------------------------------------------
function ReconcileTab() {
  const [refFile, setRefFile] = useState<File | null>(null);
  const [deviceFiles, setDeviceFiles] = useState<File[]>([]);
  const [targetKoli, setTargetKoli] = useState('');
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [...prev, msg]);

  const handleReconcile = async () => {
    if (!refFile) return alert('Referans CSV dosyasını yükleyin.');
    if (deviceFiles.length === 0) return alert('En az 1 adet Cihaz Raporu (XLSX/CSV) yükleyin.');
    const koliCount = parseInt(targetKoli);
    if (!koliCount || isNaN(koliCount)) return alert('Geçerli bir hedef koli sayısı girin.');

    setLoading(true); setLog([]);
    try {
      const itemsPerKoli = 30;
      const targetCount = koliCount * itemsPerKoli;
      addLog(`Hedef: ${koliCount} koli (${targetCount} ürün)`);

      // 1. Get current SSCC State
      addLog('Global SSCC sayacı sunucudan çekiliyor...');
      const ssccRes = await fetch(`/api/sscc/state?t=${Date.now()}`, { cache: 'no-store' });
      const { state: startSSCC } = await ssccRes.json();
      if (!startSSCC) throw new Error('SSCC sayacı okunamadı!');
      addLog(`Aktif SSCC Sayacı: ${startSSCC}`);

      // 2. Read Reference
      addLog(`Referans okunuyor: ${refFile.name}`);
      const refText = await refFile.text();
      const refLines = refText.replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim() !== '');
      
      const referenceCodes: string[] = [];
      const refStartIdx = (refLines[0].startsWith('01') && refLines[0].length > 20) ? 0 : 1;
      for (let i = refStartIdx; i < refLines.length; i++) {
          // GÜVENLİ PARSİNG: sadece tab (\t) ile böl! Virgül veya noktalı virgül asla!
          const val = refLines[i].split('\t')[0].trim();
          if (val) referenceCodes.push(val);
      }
      
      const refCodesSet = new Set(referenceCodes.map(c => c.replace(/\x1d/g, '').replace(/\s/g, '')));
      addLog(`Referans Havuzu: ${referenceCodes.length} adet kod yüklendi.`);

      // 3. Read Device Files
      const repCodes: string[] = [];
      for (const df of deviceFiles) {
        addLog(`Cihaz raporu okunuyor: ${df.name}`);
        const buffer = await df.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        
        let repSheetName = 'Tamamlanan Kodlar';
        if (!wb.SheetNames.includes(repSheetName)) repSheetName = wb.SheetNames[0];
        
        const repRows = XLSX.utils.sheet_to_json(wb.Sheets[repSheetName], { header: 1 }) as any[][];
        const startIdx = String(repRows[0]?.[0] || '').toLowerCase() === 'kod' ? 1 : 0;
        
        let countForThisFile = 0;
        for (let i = startIdx; i < repRows.length; i++) {
            const val = String(repRows[i][0] || '').trim();
            if (val) {
                repCodes.push(val);
                countForThisFile++;
            }
        }
        addLog(`-> ${df.name} içinden ${countForThisFile} kod çıkarıldı.`);
      }

      // 4. Unique and Validate
      const uniqueRepCodes: string[] = [];
      const seenRep = new Set();
      let dups = 0, unrecog = 0;

      repCodes.forEach(code => {
          const norm = code.replace(/\x1d/g, '').replace(/\s/g, '');
          if (seenRep.has(norm)) { dups++; return; }
          seenRep.add(norm);
          if (!refCodesSet.has(norm)) { unrecog++; } 
          else { uniqueRepCodes.push(code); }
      });

      addLog(`Cihaz toplam: ${repCodes.length} | Eşsiz: ${uniqueRepCodes.length} | Mükerrer: ${dups} | Tanınmayan: ${unrecog}`);
      if (unrecog > 0) addLog(`DİKKAT: ${unrecog} adet kod referans havuzunda bulunamadı!`);

      // 5. Supplement
      const finalCodes = [...uniqueRepCodes];
      const finalSet = new Set(finalCodes.map(c => c.replace(/\x1d/g, '').replace(/\s/g, '')));
      let supp = 0;

      if (finalCodes.length < targetCount) {
          for (const refCode of referenceCodes) {
              const norm = refCode.replace(/\x1d/g, '').replace(/\s/g, '');
              if (!finalSet.has(norm)) {
                  finalCodes.push(refCode);
                  finalSet.add(norm);
                  supp++;
                  if (finalCodes.length === targetCount) break;
              }
          }
      } else if (finalCodes.length > targetCount) {
          finalCodes.splice(targetCount);
      }

      addLog(`Hedefe Ulaşma: ${finalCodes.length} kod tamamlandı. (Referans havuzundan ${supp} adet çekildi)`);

      // 6. Generate outputs with new SSCC Format
      const csvLines: string[] = [];
      const xlsxData: any[][] = [['Kod', 'Koli Barkodu']];
      
      let currentSSCCState = startSSCC;
      let currentFormattedKoli = formatAsKoliSSCC(currentSSCCState);

      for (let i = 0; i < finalCodes.length; i++) {
          if (i > 0 && i % itemsPerKoli === 0) {
              currentSSCCState = generateNextSSCC(currentSSCCState);
              currentFormattedKoli = formatAsKoliSSCC(currentSSCCState);
          }

          let code = finalCodes[i].replace(/\s/g, '\x1d');
          if (!code.includes('\x1d')) {
              code = code.replace(/91(.{4})92/, '\x1d91$1\x1d92');
          }
          
          csvLines.push(`${code}\t${currentFormattedKoli}`);
          xlsxData.push([code, currentFormattedKoli]);
      }

      // 7. Save State
      const nextSSCCState = generateNextSSCC(currentSSCCState);
      await fetch('/api/sscc/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: nextSSCCState })
      });
      addLog(`Global koli sayacı güncellendi. Yeni sayaç: ${nextSSCCState}`);

      // 8. ZIP Download
      const zip = new JSZip();
      const baseName = refFile.name.replace(/\.[^/.]+$/, "");
      const newBaseName = baseName.replace(/ \d+ шт\./, ` ${targetCount} шт.`);
      
      zip.file(`${newBaseName}.csv`, '\ufeff' + csvLines.join('\n'));
      
      const outWb = XLSX.utils.book_new();
      const outWs = XLSX.utils.aoa_to_sheet(xlsxData);
      XLSX.utils.book_append_sheet(outWb, outWs, "Koli Kodları");
      const excelBuffer = XLSX.write(outWb, { bookType: 'xlsx', type: 'array' });
      zip.file(`${newBaseName}.xlsx`, excelBuffer);

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${newBaseName}_TAMAMLANDI.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      addLog(`✅ İşlem başarıyla tamamlandı. ZIP dosyası indiriliyor.`);
    } catch (e: any) {
      addLog(`❌ HATA: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white">Eşleştirme ve Raporlama (Reconcile)</h2>
      <p className="text-xs text-zinc-400">GS1 ayrıştırma hatalarına karşı korumalı. Referans havuzundan eksikleri tamamlayarak koli atamalarını yeni SSCC düzeninize göre gerçekleştirir.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="text-[10px] font-bold text-zinc-500 uppercase mb-2 block">1. Referans Dosya (Ana Havuz)</label>
          {!refFile ? (
            <label className="border-2 border-dashed border-zinc-700 bg-zinc-900/50 rounded-2xl flex flex-col items-center justify-center py-6 cursor-pointer hover:border-emerald-500/50 transition-all">
               <span className="text-xs font-bold text-zinc-300">Referans Seç (CSV)</span>
               <input type="file" accept=".csv,.txt" className="hidden" onChange={e => e.target.files && setRefFile(e.target.files[0])} />
            </label>
          ) : (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-300 truncate max-w-[200px]">{refFile.name}</span>
              <button onClick={() => setRefFile(null)} className="text-[10px] text-red-400">Değiştir</button>
            </div>
          )}
        </div>

        <div>
          <label className="text-[10px] font-bold text-zinc-500 uppercase mb-2 block">2. Cihaz Raporları (Excel / Okunanlar)</label>
          <label className="border-2 border-dashed border-zinc-700 bg-zinc-900/50 rounded-2xl flex flex-col items-center justify-center py-6 cursor-pointer hover:border-emerald-500/50 transition-all">
             <span className="text-xs font-bold text-zinc-300">Cihaz Dosyalarını Yükle (Çoklu)</span>
             <input type="file" multiple accept=".csv,.xlsx,.xls" className="hidden" onChange={e => {
               if (e.target.files) setDeviceFiles(prev => [...prev, ...Array.from(e.target.files as FileList)]);
             }} />
          </label>
          {deviceFiles.length > 0 && (
            <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
              {deviceFiles.map((df, idx) => (
                <div key={idx} className="flex justify-between text-[10px] text-zinc-400 bg-zinc-900 p-1.5 rounded">
                  <span className="truncate">{df.name}</span>
                  <button onClick={() => setDeviceFiles(prev => prev.filter((_, i) => i !== idx))} className="text-red-400">Sil</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold text-zinc-500 uppercase">3. Hedef Koli Miktarı</label>
        <input type="number" value={targetKoli} onChange={e => setTargetKoli(e.target.value)} placeholder="Örn: 2016" className="w-full max-w-xs bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 mt-1 text-sm text-white outline-none focus:border-emerald-500 block" />
      </div>

      <button onClick={handleReconcile} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2">
        {loading ? <Loader2 className="animate-spin" size={18} /> : <FileCheck size={18} />}
        {loading ? 'İşleniyor...' : 'Eşleştir, Koli Ata ve İndir'}
      </button>

      {log.length > 0 && (
        <div className="bg-black border border-zinc-800 rounded-xl p-4 font-mono text-[10px] text-zinc-400 h-48 overflow-y-auto space-y-1">
          {log.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}
