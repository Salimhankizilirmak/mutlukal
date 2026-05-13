'use client';
import { useState, useEffect, useCallback } from 'react';
import { FileCode, Loader2, AlertCircle, Hash, ArrowLeft, Download } from 'lucide-react';
import { GS1ToolCard } from '@/components/GS1ToolCard';
import { FileDropzone } from '@/components/FileDropzone';
import { generateNextSSCC } from '@/lib/gs1';
import Link from 'next/link';
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

export default function GermesConverterPage() {
  const [file, setFile] = useState<File | null>(null);
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
      // Silently handle fetch failures
    } finally {
      setFetchingState(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentState();
  }, [fetchCurrentState]);

  const handleProcess = async () => {
    if (!file) {
      setError('Lütfen işlenecek kaynak dosyayı seçin.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. Fetch fresh active counter state string dynamically without caching
      const ssccRes = await fetch(`/api/sscc/state?t=${Date.now()}`, { cache: 'no-store' });
      const { state: startSSCC } = await ssccRes.json();

      if (!startSSCC || !startSSCC.startsWith('004')) {
        console.warn('Aktif koli kodu 004 önekiyle başlamıyor veya hatalı. Değer:', startSSCC);
      }

      // 2. Read input file (XLSX, XLS, CSV)
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];

      const extractedProds: string[] = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || !row[0]) continue;
        const rawStr = String(row[0]).trim();
        
        // Skip literal header strings
        if ((rawStr.toLowerCase().includes('kod') || rawStr.toLowerCase().includes('tarih')) && !rawStr.startsWith('01') && !rawStr.startsWith('(01)')) continue;

        const cleaned = cleanAndFormat(rawStr);
        if (cleaned) extractedProds.push(cleaned);
      }

      if (extractedProds.length === 0) {
        throw new Error('Dosyadan dönüştürülecek geçerli ürün barkodu bulunamadı.');
      }

      // 3. Assign sequential continuous carton SSCC codes every 30 records omitting pallets
      let currentSSCC = startSSCC;
      const finalCsvLines: string[] = [];

      for (let i = 0; i < extractedProds.length; i++) {
        const isNewKoli = i % 30 === 0;
        if (i > 0 && isNewKoli) {
          currentSSCC = generateNextSSCC(currentSSCC);
        }
        finalCsvLines.push(`${extractedProds[i]}\t${currentSSCC}`);
      }

      // 4. Update global sequence robustly via POST
      const nextSSCC = generateNextSSCC(currentSSCC);
      await fetch('/api/sscc/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextSSCC }),
        cache: 'no-store',
      });

      // Sync active view tracker locally
      setActiveStateSSCC(nextSSCC);

      // 5. Package output file dynamically
      const outputCsvContent = '\ufeff' + finalCsvLines.join('\r\n');
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const downloadFilename = `${baseName}_Germes_Koli_Atanmis.csv`;

      const blob = new Blob([outputCsvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(`✔ İşlem başarılı! Toplam ${extractedProds.length} adet ürüne koli kodu atandı ve Triton standardında CSV indirildi.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Koli kodu atama sırasında bilinmeyen bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      {/* Top navigation header */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard/germes" className="flex items-center gap-2 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors bg-purple-500/10 px-3 py-1.5 rounded-xl border border-purple-500/20">
          <ArrowLeft size={14} />
          Panele Dön
        </Link>
        <span className="text-xs text-zinc-500">Hanami Germes / Koli Kodu Atama</span>
      </div>

      <GS1ToolCard
        title="Koli Kodu Atama (Converter)"
        description="Parçalanan veya ham gelen dosyadaki ürünlere ardışık 004 koli kodları atayarak Triton formatında CSV çıktısı üretir."
        icon={FileCode}
      >
        <div className="space-y-6">
          {/* Active Global State Indicator */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                <Hash size={16} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Aktif Koli Başlangıç Serisi</p>
                <p className="text-xs font-mono font-semibold text-purple-300 mt-0.5">
                  {fetchingState ? 'Yükleniyor...' : activeStateSSCC || 'Okunamadı'}
                </p>
              </div>
            </div>
            <button
              onClick={fetchCurrentState}
              disabled={fetchingState}
              title="Sayacı Yenile"
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors"
            >
              <Loader2 size={14} className={fetchingState ? 'animate-spin' : 'hidden'} />
              <span className={fetchingState ? 'hidden' : 'text-xs font-bold text-purple-400'}>Yenile</span>
            </button>
          </div>

          <FileDropzone
            label="İşlenecek Dosya (XLSX, XLS, CSV)"
            accept=".xlsx,.xls,.csv"
            onFileSelect={(f) => setFile(f)}
          />

          {file && (
            <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl text-xs text-purple-300 text-center font-medium">
              Seçilen Dosya: <span className="font-bold text-white">{file.name}</span>
            </div>
          )}

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
            disabled={loading || !file}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-30 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-950/30"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
            Koli Kodlarını Ata ve İndir
          </button>
        </div>
      </GS1ToolCard>
    </div>
  );
}
