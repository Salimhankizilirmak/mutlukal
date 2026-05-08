'use client';
import { useState } from 'react';
import { Smartphone, Download, Search, RefreshCw, FileText, CheckCircle2 } from 'lucide-react';
import { GS1ToolCard } from '@/components/GS1ToolCard';
import { FileDropzone } from '@/components/FileDropzone';
import { QRScanner } from '@/components/QRScanner';
import Papa from 'papaparse';

interface CSVRow {
  product: string;
  sscc: string;
  originalIndex: number;
}

export default function MobileAgentPage() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<CSVRow[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [scanMode, setScanMode] = useState<'audit' | 'replace'>('audit');
  const [step, setStep] = useState<'IDLE' | 'SCAN_OLD' | 'SCAN_NEW' | 'CONFIRM' | 'SUCCESS'>('IDLE');
  
  const [foundRow, setFoundRow] = useState<CSVRow | null>(null);
  const [newCode, setNewCode] = useState('');
  const [lastScanned, setLastScanned] = useState('');

  // Helper to clean codes for comparison
  const normalizeCode = (c: string) => {
    return c.replace(/\(01\)|\(00\)|\u001d|\s/g, '').replace(/^0+/, '');
  };

  // Load CSV
  const handleFileSelect = async (f: File) => {
    setFile(f);
    setError('');
    setData([]);
    setLastScanned('');
    setStep('SCAN_OLD');
    
    try {
      const text = await f.text();
      const cleanText = text.startsWith('\ufeff') ? text.slice(1) : text;
      const results = Papa.parse(cleanText, { delimiter: '\t', skipEmptyLines: true });
      if (results.errors.length > 0 && results.data.length === 0) throw new Error('Dosya okunamadı.');

      const rows: CSVRow[] = (results.data as string[][]).map((row, idx) => ({
        product: row[0] || '',
        sscc: row[1] || '',
        originalIndex: idx + 1
      }));

      setData(rows);
      setSuccess(`${rows.length} satır yüklendi.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hata.');
    }
  };

  const handleScan = (text: string) => {
    const cleaned = text.trim();
    setLastScanned(cleaned);

    if (scanMode === 'audit') {
      const normScanned = normalizeCode(cleaned);
      const match = data.find(row => normalizeCode(row.product) === normScanned || normalizeCode(row.product).includes(normScanned));
      if (match) { setFoundRow(match); setSuccess(`Satır ${match.originalIndex}`); }
      else { setFoundRow(null); setError('Bulunamadı.'); }
      return;
    }

    if (step === 'SCAN_OLD') {
      const normScanned = normalizeCode(cleaned);
      const match = data.find(row => normalizeCode(row.product) === normScanned || normalizeCode(row.product).includes(normScanned));
      if (match) {
        setFoundRow(match);
        setStep('SCAN_NEW');
        setSuccess('Eski kod doğrulandı. Şimdi yeni kodu okutun.');
      } else {
        setError('Eski kod listede bulunamadı.');
      }
    } else if (step === 'SCAN_NEW') {
      setNewCode(cleaned);
      setStep('CONFIRM');
    }
  };

  const applyReplacement = () => {
    if (!foundRow || !newCode) return;
    const updatedData = [...data];
    const idx = updatedData.findIndex(r => r.originalIndex === foundRow.originalIndex);
    if (idx !== -1) {
      updatedData[idx] = { ...updatedData[idx], product: newCode };
      setData(updatedData);
      setStep('SUCCESS');
      setSuccess('Değişim başarıyla tamamlandı!');
    }
  };

  const resetReplacement = () => {
    setFoundRow(null);
    setNewCode('');
    setLastScanned('');
    setStep('SCAN_OLD');
    setSuccess('');
    setError('');
  };

  const downloadModified = () => {
    const output = '\ufeff' + data.map(r => `${r.product}\t${r.sscc}`).join('\r\n');
    const blob = new Blob([output], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.replace('.csv', '')}_Guncel.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-md mx-auto py-4 space-y-6">
      <GS1ToolCard
        title="Mobil Agent"
        description="Sahada ürün değişimi ve koli denetimi yapmanızı sağlar."
        icon={Smartphone}
      >
        {!file ? (
          <FileDropzone
            label="Düzenlenecek CSV Dosyasını Seçin"
            accept=".csv,.txt"
            onFileSelect={handleFileSelect}
          />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl">
               <div className="flex items-center gap-2">
                 <FileText size={16} className="text-zinc-500" />
                 <span className="text-xs font-medium text-zinc-300 truncate max-w-[150px]">{file.name}</span>
               </div>
               <button onClick={() => setFile(null)} className="text-[10px] text-amber-500 font-bold hover:underline">Değiştir</button>
            </div>

            <div className="flex gap-2 p-1 bg-black border border-zinc-800 rounded-xl">
              <button
                onClick={() => { setScanMode('audit'); resetReplacement(); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold transition-all ${scanMode === 'audit' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500'}`}
              >
                <Search size={14} /> Denetim
              </button>
              <button
                onClick={() => { setScanMode('replace'); resetReplacement(); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold transition-all ${scanMode === 'replace' ? 'bg-amber-600 text-white shadow-lg' : 'text-zinc-500'}`}
              >
                <RefreshCw size={14} /> Değişim
              </button>
            </div>

            {step === 'SCAN_OLD' || step === 'SCAN_NEW' ? (
              <div className="space-y-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-[10px] uppercase font-bold text-amber-500 text-center tracking-widest">
                    {step === 'SCAN_OLD' ? 'DEĞİŞECEK ÜRÜNÜ OKUTUN' : 'YENİ ÜRÜNÜ OKUTUN'}
                  </p>
                </div>
                <QRScanner onScan={handleScan} />
                
                {lastScanned && (
                  <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-zinc-500 uppercase mb-1">Son Okunan</p>
                    <p className="text-[10px] font-mono text-zinc-400 break-all">{lastScanned}</p>
                  </div>
                )}
              </div>
            ) : null}

            {step === 'CONFIRM' && foundRow && (
              <div className="space-y-6 animate-in zoom-in-95 duration-300">
                <div className="p-4 bg-zinc-900 border border-amber-500/30 rounded-2xl space-y-4">
                  <h3 className="text-center font-bold text-amber-500 text-sm">Değişimi Onaylayın</h3>
                  
                  <div className="space-y-2">
                    <p className="text-[10px] text-zinc-500 uppercase">Koli Kodu (SSCC)</p>
                    <p className="text-xs font-mono text-emerald-400 bg-black/40 p-2 rounded-lg break-all">{foundRow.sscc}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                      <p className="text-[9px] text-red-400 uppercase mb-1">Eski Ürün (Çıkarılacak)</p>
                      <p className="text-[10px] font-mono text-zinc-400 break-all">{foundRow.product}</p>
                    </div>
                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                      <p className="text-[9px] text-emerald-400 uppercase mb-1">Yeni Ürün (Eklenecek)</p>
                      <p className="text-[10px] font-mono text-zinc-100 break-all">{newCode}</p>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-400 text-center px-4 leading-relaxed">
                    <span className="text-emerald-400 font-bold">{foundRow.sscc.slice(-4)}</span> nolu koli içerisindeki ürünü değiştirmek istediğinize emin misiniz?
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={applyReplacement}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg"
                  >
                    Değişimi Onayla
                  </button>
                  <button
                    onClick={resetReplacement}
                    className="w-full bg-zinc-800 text-zinc-400 py-3 rounded-2xl text-xs"
                  >
                    Vazgeç ve Yeniden Başla
                  </button>
                </div>
              </div>
            )}

            {step === 'SUCCESS' && (
              <div className="space-y-6 animate-in fade-in duration-500 text-center py-4">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-2">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-white">Değişim Tamamlandı!</h3>
                  <p className="text-sm text-zinc-500">Rapor başarıyla güncellendi.</p>
                </div>

                <div className="flex flex-col gap-3 pt-4">
                  <button
                    onClick={resetReplacement}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all"
                  >
                    <RefreshCw size={20} /> Yeni Değişim Yap
                  </button>
                  <button
                    onClick={downloadModified}
                    className="w-full bg-zinc-100 hover:bg-white text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all"
                  >
                    <Download size={20} /> Güncel Dosyayı İndir
                  </button>
                </div>
              </div>
            )}

            {error && <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-red-400 text-[10px] text-center">{error}</div>}
            {success && step !== 'SUCCESS' && <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-emerald-400 text-[10px] text-center">{success}</div>}

          </div>
        )}
      </GS1ToolCard>
    </div>
  );
}
