'use client';
import { useState } from 'react';
import { Scissors, Loader2, Download, AlertCircle } from 'lucide-react';
import { GS1ToolCard } from '@/components/GS1ToolCard';
import { FileDropzone } from '@/components/FileDropzone';
import { generateNextSSCC } from '@/lib/gs1';
import Papa from 'papaparse';

export default function SubsetPage() {
  const [file, setFile] = useState<File | null>(null);
  const [targetCount, setTargetCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleProcess = async () => {
    if (!file) { setError('Lütfen bir dosya seçin.'); return; }
    if (targetCount <= 0) { setError('Lütfen geçerli bir adet girin.'); return; }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. Fetch current SSCC state
      const res = await fetch('/api/sscc/state');
      const { state: startSSCC } = await res.json();
      
      if (!startSSCC) throw new Error('Global SSCC sayacı okunamadı.');

      // 2. Parse CSV
      const text = await file.text();
      // Handle potential BOM
      const cleanText = text.startsWith('\ufeff') ? text.slice(1) : text;
      
      const results = Papa.parse(cleanText, {
        delimiter: '\t', // We usually use TSV
        skipEmptyLines: true,
      });

      if (results.errors.length > 0 && results.data.length === 0) {
        throw new Error('Dosya ayrıştırılamadı. Lütfen TAB ile ayrılmış (TSV) bir dosya olduğundan emin olun.');
      }

      // 3. Process
      const data = results.data as string[][];
      const prods = data.slice(0, targetCount).map(row => row[0]); // Only take product code
      
      if (prods.length === 0) throw new Error('Dosyada veri bulunamadı.');

      let currentSSCC = startSSCC;
      const finalLines: string[] = [];
      
      for (let i = 0; i < prods.length; i++) {
        if (i > 0 && i % 30 === 0) {
          currentSSCC = generateNextSSCC(currentSSCC);
        }
        finalLines.push(`${prods[i]}\t${currentSSCC}`);
      }

      // 4. Update global state
      const nextSSCC = generateNextSSCC(currentSSCC);
      const updateRes = await fetch('/api/sscc/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextSSCC }),
      });

      if (!updateRes.ok) throw new Error('Global SSCC sayacı güncellenemedi.');

      // 5. Download
      const output = '\ufeff' + finalLines.join('\r\n');
      const blob = new Blob([output], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace('.csv', '')}_Fixed_${targetCount}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(`İşlem başarıyla tamamlandı. ${prods.length} satır işlendi.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <GS1ToolCard
        title="Adet Ayarlama (Subset)"
        description="Dosyayı istenen adete göre keser ve koli kodlarını (SSCC) otomatik olarak günceller."
        icon={Scissors}
      >
        <div className="space-y-6">
          <FileDropzone
            label="Kaynak CSV (TSV) Dosyası"
            accept=".csv,.txt"
            onFileSelect={(f) => setFile(f)}
          />

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">Hedef Ürün Adedi</label>
            <input
              type="number"
              value={targetCount || ''}
              onChange={(e) => setTargetCount(parseInt(e.target.value))}
              placeholder="Örn: 37800"
              className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 text-sm outline-none focus:border-amber-500/50 transition-all"
            />
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl text-red-400 text-xs">
              <AlertCircle size={18} />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs">
              <AlertCircle size={18} />
              <p>{success}</p>
            </div>
          )}

          <button
            onClick={handleProcess}
            disabled={loading || !file || !targetCount}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:hover:bg-amber-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-900/20"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
            İşlemi Başlat ve İndir
          </button>
        </div>
      </GS1ToolCard>
    </div>
  );
}
