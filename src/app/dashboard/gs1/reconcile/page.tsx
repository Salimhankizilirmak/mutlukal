'use client';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, AlertCircle, Hash } from 'lucide-react';
import { GS1ToolCard } from '@/components/GS1ToolCard';
import { FileDropzone } from '@/components/FileDropzone';
import { generateNextSSCC } from '@/lib/gs1';
import * as XLSX from 'xlsx';

const cleanAndFormat = (val: string) => {
  if (!val) return '';
  let v = String(val).replace(/^[\u200B-\u200D\uFEFF\s]+|[\u200B-\u200D\uFEFF\s]+$/g, '');
  if (/^[\d.]+e[+\-]\d+$/i.test(v)) {
    try { v = BigInt(Math.round(Number(v))).toString(); } catch {}
  }
  if (v.startsWith('(01)')) v = v.substring(4);
  if (v.startsWith('(00)')) v = v.substring(4);
  
  if (/^\d{13}$/.test(v)) v = '0' + v;
  v = v.replace(/\s*91(.{4})\s*92/g, '\u001D91$1\u001D92');
  v = v.replace(/\u001D\u001D/g, '\u001D');
  v = v.replace(/\s/g, '');
  return v;
};

export default function ReconcilePage() {
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [targetCount, setTargetCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeStateSSCC, setActiveStateSSCC] = useState<string>('');
  const [fetchingState, setFetchingState] = useState(false);

  const fetchCurrentState = useCallback(async () => {
    setFetchingState(true);
    try {
      const res = await fetch(`/api/sscc/state?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data?.state) setActiveStateSSCC(data.state);
      }
    } catch {
      // Silently handle state fetch failures
    } finally {
      setFetchingState(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentState();
  }, [fetchCurrentState]);

  const handleProcess = async () => {
    if (!reportFile || !refFile) { setError('Lütfen her iki dosyayı da seçin.'); return; }
    if (targetCount <= 0) { setError('Lütfen geçerli bir adet girin.'); return; }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. Fetch current SSCC state with cache busting
      const ssccRes = await fetch(`/api/sscc/state?t=${Date.now()}`, { cache: 'no-store' });
      const { state: startSSCC } = await ssccRes.json();
      
      if (!startSSCC || !startSSCC.startsWith('004')) {
        console.warn('Aktif SSCC 004 önekiyle başlamıyor veya okunamadı. Mevcut durum:', startSSCC);
      }

      // 2. Parse Excel Report (Completed Baseline Pool)
      const reportBuffer = await reportFile.arrayBuffer();
      const reportWb = XLSX.read(reportBuffer, { type: 'array' });
      const reportWs = reportWb.Sheets[reportWb.SheetNames[0]];
      const reportData = XLSX.utils.sheet_to_json(reportWs, { header: 1 }) as string[][];
      
      const completedCodes = new Set<string>();
      const finalProds: string[] = [];

      // Avoid pushing the header row ("Kod") into our dataset
      for (let i = 0; i < reportData.length; i++) {
        const row = reportData[i];
        if (!row || !row[0]) continue;
        const rawStr = String(row[0]).trim();
        // Skip literal header strings
        if ((rawStr.toLowerCase().includes('kod') || rawStr.toLowerCase().includes('tarih')) && !rawStr.startsWith('01') && !rawStr.startsWith('(01)')) continue;
        
        const cleaned = cleanAndFormat(rawStr);
        if (cleaned) {
          completedCodes.add(cleaned);
          finalProds.push(cleaned);
        }
      }

      // 3. Parse Reference CSV Pool
      const refText = await refFile.text();
      const cleanRefText = refText.startsWith('\ufeff') ? refText.slice(1) : refText;
      const refLines = cleanRefText.split(/\r?\n/).filter(l => l.trim() !== '');

      const refProds: string[] = [];
      for (const line of refLines) {
        const firstCol = line.split('\t')[0].trim();
        if (firstCol.startsWith('01') || firstCol.startsWith('(01)') || firstCol.length >= 13) {
          refProds.push(firstCol);
        } else if (refProds.length > 0) {
          refProds[refProds.length - 1] += " " + firstCol;
        }
      }

      const cleanedRefProds = refProds.map(cleanAndFormat).filter(Boolean);

      // 4. Reconciliation Logic
      const remainingCodes = cleanedRefProds.filter(code => !completedCodes.has(code));
      const totalNeeded = targetCount - finalProds.length;
      
      if (totalNeeded < 0) {
        throw new Error(`Tamamlanan kod adedi (${finalProds.length}) hedef adetten (${targetCount}) fazla.`);
      }
      
      const selectedRemaining = remainingCodes.slice(0, totalNeeded);
      finalProds.push(...selectedRemaining);

      if (finalProds.length !== targetCount) {
        throw new Error(`Hedef adede ulaşılamadı. Eksik satır sayısı yetersiz. Toplam elde edilen: ${finalProds.length}`);
      }

      // 5. Generate continuous carton SSCC codes without pallet codes layer
      let currentSSCC = startSSCC;
      const finalLines: string[] = [];
      
      for (let i = 0; i < finalProds.length; i++) {
        const isNewKoli = i % 30 === 0;
        if (i > 0 && isNewKoli) {
          currentSSCC = generateNextSSCC(currentSSCC);
        }
        finalLines.push(`${finalProds[i]}\t${currentSSCC}`);
      }

      // 6. Update global state seamlessly
      const nextSSCC = generateNextSSCC(currentSSCC);
      await fetch('/api/sscc/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextSSCC }),
        cache: 'no-store',
      });

      // Synchronize local UI preview with fresh state
      setActiveStateSSCC(nextSSCC);

      // 7. Download output CSV
      const output = '\ufeff' + finalLines.join('\r\n');
      const blob = new Blob([output], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Reconciled_${targetCount}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(`İşlem başarıyla tamamlandı. ${finalProds.length} satır oluşturuldu ve koli zinciri temizlendi.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <GS1ToolCard
        title="Eksik Tamamlama (Reconcile)"
        description="Tamamlananlar listesi ve referans dosyayı birleştirerek eksikleri tamamlar ve koli kodlarını üretir."
        icon={RefreshCw}
      >
        <div className="space-y-6">
          {/* Active Sequence Tracker Indicator */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                <Hash size={16} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Sıradaki Koli Başlangıç Serisi</p>
                <p className="text-xs font-mono font-semibold text-amber-400 mt-0.5">
                  {fetchingState ? 'Yükleniyor...' : activeStateSSCC || 'Okunamadı'}
                </p>
              </div>
            </div>
            <button
              onClick={fetchCurrentState}
              disabled={fetchingState}
              title="Sayacı Güncelle"
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors"
            >
              <RefreshCw size={14} className={fetchingState ? 'animate-spin' : ''} />
            </button>
          </div>

          <FileDropzone
            label="1. Tamamlananlar Listesi (Excel)"
            accept=".xlsx,.xls"
            onFileSelect={(f) => setReportFile(f)}
          />
          <FileDropzone
            label="2. Referans CSV Dosyası (Tüm Kodlar)"
            accept=".csv,.txt"
            onFileSelect={(f) => setRefFile(f)}
          />

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">Hedef Toplam Adet</label>
            <input
              type="number"
              value={targetCount || ''}
              onChange={(e) => setTargetCount(parseInt(e.target.value))}
              placeholder="Örn: 52920"
              className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 text-sm outline-none focus:border-amber-500/50 transition-all"
            />
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl text-red-400 text-xs">
              <AlertCircle size={18} className="shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs">
              <AlertCircle size={18} className="shrink-0" />
              <p>{success}</p>
            </div>
          )}

          <button
            onClick={handleProcess}
            disabled={loading || !reportFile || !refFile || !targetCount}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
            Eksikleri Tamamla ve İndir
          </button>
        </div>
      </GS1ToolCard>
    </div>
  );
}
