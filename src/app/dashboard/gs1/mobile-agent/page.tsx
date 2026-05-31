'use client';
import { useState, useRef, useCallback } from 'react';
import { Smartphone, FileText } from 'lucide-react';
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [lastScanned, setLastScanned] = useState('');
  
  // Use a Map for O(1) lookup to prevent freezing on 60k+ rows
  const codeMapRef = useRef<Map<string, CSVRow>>(new Map());
  const lastScannedTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');

  // Helper to clean codes for comparison
  const normalizeCode = (c: string) => {
    return c.replace(/\(01\)|\(00\)|\u001d|\s/g, '').replace(/^0+/, '');
  };

  // Load CSV
  const handleFileSelect = async (f: File) => {
    setFile(f);
    setError('');
    setSuccess('Yükleniyor...');
    setLastScanned('');
    codeMapRef.current.clear();
    lastScannedTimeRef.current = 0;
    lastScannedCodeRef.current = '';
    
    try {
      const text = await f.text();
      const cleanText = text.startsWith('\ufeff') ? text.slice(1) : text;
      const results = Papa.parse(cleanText, { delimiter: '\t', skipEmptyLines: true });
      if (results.errors.length > 0 && results.data.length === 0) throw new Error('Dosya okunamadı.');

      const map = new Map<string, CSVRow>();
      
      (results.data as string[][]).forEach((row, idx) => {
        const product = row[0] || '';
        const sscc = row[1] || '';
        if (product) {
          const norm = normalizeCode(product);
          // Only map the first occurrence if there are duplicates
          if (!map.has(norm)) {
             map.set(norm, { product, sscc, originalIndex: idx + 1 });
          }
        }
      });

      codeMapRef.current = map;
      setSuccess(`${map.size} eşsiz kod belleğe (O(1) hızında) başarıyla yüklendi. Artık taramaya başlayabilirsiniz.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dosya yüklenirken hata oluştu.');
      setSuccess('');
    }
  };

  const handleScan = useCallback((text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;

    const now = Date.now();
    // Debounce: ignore exact same scan within 1000ms
    if (cleaned === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 1000) {
      return;
    }

    lastScannedCodeRef.current = cleaned;
    lastScannedTimeRef.current = now;
    setLastScanned(cleaned);

    const normScanned = normalizeCode(cleaned);
    
    // O(1) instant lookup
    const match = codeMapRef.current.get(normScanned);

    // Fallback: partial inclusion check if exact match fails (slower, but covers edge cases)
    let finalMatch = match;
    if (!finalMatch) {
      for (const [key, val] of codeMapRef.current.entries()) {
        if (key.includes(normScanned)) {
          finalMatch = val;
          break;
        }
      }
    }

    if (finalMatch) {
      setSuccess(`✅ Satır ${finalMatch.originalIndex} (Koli: ${finalMatch.sscc.slice(-4)})`);
      setError('');
    } else {
      setSuccess('');
      setError(`❌ Kod listede bulunamadı.`);
    }
  }, []);

  return (
    <div className="max-w-md mx-auto py-4 space-y-6">
      <GS1ToolCard
        title="Mobil Agent Denetim"
        description="Seri barkod okutarak saniyesinde satır numarasını tespit edin. 60.000 satırda dahi O(1) hızında çalışır."
        icon={Smartphone}
      >
        {!file ? (
          <FileDropzone
            label="Denetlenecek CSV Dosyasını Seçin"
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
               <button onClick={() => setFile(null)} className="text-[10px] text-amber-500 font-bold hover:underline">Dosyayı Değiştir</button>
            </div>

            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
              <p className="text-[10px] uppercase font-bold text-indigo-400 text-center tracking-widest">
                ÜRÜN BARKODUNU OKUTUN
              </p>
            </div>
            
            {/* The QRScanner will constantly invoke onScan, but useCallback + debounce prevents lag */}
            <QRScanner onScan={handleScan} fps={20} qrbox={250} />
            
            {/* Result Area */}
            {success && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-center font-bold text-lg animate-in zoom-in-95 duration-200">
                {success}
              </div>
            )}
            
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-center font-bold text-lg animate-in zoom-in-95 duration-200">
                {error}
              </div>
            )}

            {lastScanned && (
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3 text-center">
                <p className="text-[9px] font-bold text-zinc-500 uppercase mb-1">Son Okunan Barkod</p>
                <p className="text-[10px] font-mono text-zinc-400 break-all">{lastScanned}</p>
              </div>
            )}
          </div>
        )}
      </GS1ToolCard>
    </div>
  );
}
