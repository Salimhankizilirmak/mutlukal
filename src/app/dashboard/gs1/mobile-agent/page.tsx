'use client';
import { useState } from 'react';
import { Smartphone, Download, AlertCircle, Search, RefreshCw, FileText, CheckCircle2 } from 'lucide-react';
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
  const [foundRow, setFoundRow] = useState<CSVRow | null>(null);
  const [newCodeStep, setNewCodeStep] = useState(false);
  const [lastScanned, setLastScanned] = useState('');

  // Helper to clean codes for comparison
  const normalizeCode = (c: string) => {
    // Remove (01), (00), \x1d, spaces and leading zeros
    return c.replace(/\(01\)|\(00\)|\u001d|\s/g, '').replace(/^0+/, '');
  };

  // Load CSV
  const handleFileSelect = async (f: File) => {
    setFile(f);
    setError('');
    setData([]);
    setLastScanned('');
    
    try {
      const text = await f.text();
      const cleanText = text.startsWith('\ufeff') ? text.slice(1) : text;
      
      const results = Papa.parse(cleanText, {
        delimiter: '\t',
        skipEmptyLines: true,
      });

      if (results.errors.length > 0 && results.data.length === 0) {
        throw new Error('Dosya okunamadı. TSV formatında olduğundan emin olun.');
      }

      const rows: CSVRow[] = (results.data as string[][]).map((row, idx) => ({
        product: row[0] || '',
        sscc: row[1] || '',
        originalIndex: idx + 1
      }));

      setData(rows);
      setSuccess(`${rows.length} satır yüklendi.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dosya yükleme hatası.');
    }
  };

  const handleScan = (text: string) => {
    const cleaned = text.trim();
    setLastScanned(cleaned);

    // If we are waiting for a new code for replacement
    if (newCodeStep && foundRow) {
      handleReplace(cleaned);
      return;
    }

    // Search for code using normalized comparison
    const normScanned = normalizeCode(cleaned);
    const match = data.find(row => {
      const normRow = normalizeCode(row.product);
      return normRow === normScanned || normRow.includes(normScanned) || normScanned.includes(normRow);
    });
    
    if (match) {
      setFoundRow(match);
      setSuccess(`Kod Bulundu: Satır ${match.originalIndex}`);
      setError('');
    } else {
      setFoundRow(null);
      setError('Okutulan kod listede bulunamadı.');
      setSuccess('');
    }
  };

  const handleReplace = (newCode: string) => {
    if (!foundRow) return;

    const updatedData = [...data];
    const index = updatedData.findIndex(r => r.originalIndex === foundRow.originalIndex);
    
    if (index !== -1) {
      updatedData[index] = { ...updatedData[index], product: newCode.trim() };
      setData(updatedData);
      setFoundRow(updatedData[index]);
      setNewCodeStep(false);
      setSuccess(`Değişim Başarılı! Satır ${foundRow.originalIndex} güncellendi.`);
    }
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
                onClick={() => { setScanMode('audit'); setNewCodeStep(false); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${scanMode === 'audit' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500'}`}
              >
                <Search size={14} /> Denetim
              </button>
              <button
                onClick={() => { setScanMode('replace'); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${scanMode === 'replace' ? 'bg-amber-600 text-white shadow-lg' : 'text-zinc-500'}`}
              >
                <RefreshCw size={14} /> Değişim
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] uppercase font-bold text-zinc-500 text-center tracking-widest">
                {newCodeStep ? 'YENİ ÜRÜN KODUNU OKUTUN' : 'MEVCUT ÜRÜN KODUNU OKUTUN'}
              </p>
              <QRScanner onScan={handleScan} />
              
              {lastScanned && (
                <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3 animate-in fade-in duration-300">
                  <p className="text-[9px] font-bold text-zinc-500 uppercase mb-1">Son Okunan Ham Veri</p>
                  <p className="text-[10px] font-mono text-zinc-400 break-all leading-relaxed">{lastScanned}</p>
                </div>
              )}
            </div>

            {foundRow && (
              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-3 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">Satır Bilgisi</span>
                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded-full">#{foundRow.originalIndex}</span>
                </div>
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase mb-1">Ürün Kodu</p>
                  <p className="text-xs font-mono text-zinc-200 break-all bg-black/40 p-2 rounded-lg">{foundRow.product}</p>
                </div>
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase mb-1">Koli Kodu (SSCC)</p>
                  <p className="text-xs font-mono text-emerald-400 break-all bg-black/40 p-2 rounded-lg">{foundRow.sscc}</p>
                </div>

                {scanMode === 'replace' && !newCodeStep && (
                  <button
                    onClick={() => setNewCodeStep(true)}
                    className="w-full mt-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold py-3 rounded-xl transition-all"
                  >
                    Yeni Ürünle Değiştir
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-red-400 text-[10px]">
                <AlertCircle size={14} />
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-emerald-400 text-[10px]">
                <CheckCircle2 size={14} />
                <p>{success}</p>
              </div>
            )}

            <button
              onClick={downloadModified}
              className="w-full bg-zinc-100 hover:bg-white text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg"
            >
              <Download size={20} /> Güncel Raporu İndir
            </button>
          </div>
        )}
      </GS1ToolCard>
    </div>
  );
}
