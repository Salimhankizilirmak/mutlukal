'use client';
import { useState } from 'react';
import { ShieldAlert, Loader2, AlertCircle } from 'lucide-react';
import { GS1ToolCard } from '@/components/GS1ToolCard';
import { FileDropzone } from '@/components/FileDropzone';
import { generateNextSSCC } from '@/lib/gs1';
import Papa from 'papaparse';

export default function ConflictsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [itemsPerKoli, setItemsPerKoli] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleProcess = async () => {
    if (!file) { setError('Lütfen bir dosya seçin.'); return; }
    if (itemsPerKoli <= 0) { setError('Lütfen geçerli bir koli içi ürün adedi girin.'); return; }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. Fetch current SSCC state (which is now guaranteed to be high/safe)
      const res = await fetch('/api/sscc/state');
      const { state: startSSCC } = await res.json();
      
      // 2. Parse CSV
      const text = await file.text();
      const cleanText = text.startsWith('\ufeff') ? text.slice(1) : text;
      
      const results = Papa.parse(cleanText, {
        delimiter: '\t',
        skipEmptyLines: true,
      });

      // 3. Process - Keep product codes, regenerate all SSCCs
      const data = results.data as string[][];
      const prods = data.map(row => row[0]);
      
      let currentSSCC = startSSCC;
      const finalLines: string[] = [];
      
      for (let i = 0; i < prods.length; i++) {
        if (i > 0 && i % itemsPerKoli === 0) {
          currentSSCC = generateNextSSCC(currentSSCC);
        }
        finalLines.push(`${prods[i]}\t${currentSSCC}`);
      }

      // 4. Update global state
      const nextSSCC = generateNextSSCC(currentSSCC);
      await fetch('/api/sscc/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextSSCC }),
      });

      // 5. Download
      const output = '\ufeff' + finalLines.join('\r\n');
      const blob = new Blob([output], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace('.csv', '')}_Fixed_Conflicts.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess('Tüm koli kodları güvenli bir seri ile yeniden oluşturuldu.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <GS1ToolCard
        title="Çakışma Giderici (Conflicts)"
        description="Rus ortaklardan gelen koli çakışma hatalarını gidermek için tüm koli kodlarını güvenli bir seri ile yeniler."
        icon={ShieldAlert}
      >
        <div className="space-y-6">
          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl">
            <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-1">Dikkat</p>
            <p className="text-xs text-zinc-400">Bu işlem, dosyadaki mevcut tüm koli kodlarını siler ve global sayaçtan gelen yeni, benzersiz kodlarla değiştirir.</p>
          </div>

          <FileDropzone
            label="Çakışma Yaşanan CSV Dosyası"
            accept=".csv,.txt"
            onFileSelect={(f) => setFile(f)}
          />

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">Koli İçi Ürün Adedi</label>
            <input
              type="number"
              value={itemsPerKoli || ''}
              onChange={(e) => setItemsPerKoli(parseInt(e.target.value) || 0)}
              placeholder="Örn: 30"
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
            disabled={loading || !file}
            className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:hover:bg-red-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-900/20"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <ShieldAlert size={20} />}
            Koli Kodlarını Yenile ve İndir
          </button>
        </div>
      </GS1ToolCard>
    </div>
  );
}
