'use client';
import { useState } from 'react';
import { RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { GS1ToolCard } from '@/components/GS1ToolCard';
import { FileDropzone } from '@/components/FileDropzone';
import { generateNextSSCC } from '@/lib/gs1';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function ReconcilePage() {
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [targetCount, setTargetCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleProcess = async () => {
    if (!reportFile || !refFile) { setError('Lütfen her iki dosyayı da seçin.'); return; }
    if (targetCount <= 0) { setError('Lütfen geçerli bir adet girin.'); return; }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. Fetch current SSCC state
      const ssccRes = await fetch('/api/sscc/state');
      const { state: startSSCC } = await ssccRes.json();
      
      // 2. Parse Excel Report (Completed)
      const reportBuffer = await reportFile.arrayBuffer();
      const reportWb = XLSX.read(reportBuffer, { type: 'array' });
      const reportWs = reportWb.Sheets[reportWb.SheetNames[0]];
      const reportData = XLSX.utils.sheet_to_json(reportWs, { header: 1 }) as string[][];
      
      const completedCodes = new Set<string>();
      reportData.forEach(row => {
        if (row[0]) completedCodes.add(String(row[0]).trim());
      });

      // 3. Parse Reference CSV
      const refText = await refFile.text();
      const cleanRefText = refText.startsWith('\ufeff') ? refText.slice(1) : refText;
      const refResults = Papa.parse(cleanRefText, { delimiter: '\t', skipEmptyLines: true });
      const refRows = (refResults.data as string[][]).map(r => r[0]);

      // 4. Reconciliation Logic
      const remainingCodes = refRows.filter(code => !completedCodes.has(code));
      const totalNeeded = targetCount - completedCodes.size;
      
      if (totalNeeded < 0) throw new Error('Tamamlanan kod adedi hedef adetten fazla.');
      
      const selectedRemaining = remainingCodes.slice(0, totalNeeded);
      
      // We combine them (Report + Selected Remaining)
      // Actually, user wants the result to follow the structure from the start
      // So we take everything from report data first, then add from remaining.
      
      const finalProds: string[] = [];
      reportData.forEach(row => {
        if (row[0]) finalProds.push(String(row[0]).trim());
      });
      finalProds.push(...selectedRemaining);

      // 5. Generate SSCC
      let currentSSCC = startSSCC;
      const finalLines: string[] = [];
      for (let i = 0; i < finalProds.length; i++) {
        if (i > 0 && i % 30 === 0) {
          currentSSCC = generateNextSSCC(currentSSCC);
        }
        finalLines.push(`${finalProds[i]}\t${currentSSCC}`);
      }

      // 6. Update global state
      const nextSSCC = generateNextSSCC(currentSSCC);
      await fetch('/api/sscc/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextSSCC }),
      });

      // 7. Download
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

      setSuccess(`İşlem başarıyla tamamlandı. ${finalProds.length} satır oluşturuldu.`);
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
