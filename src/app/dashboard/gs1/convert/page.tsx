'use client';
import { useState } from 'react';
import { FileCode, Loader2, Download, AlertCircle } from 'lucide-react';
import { GS1ToolCard } from '@/components/GS1ToolCard';
import { FileDropzone } from '@/components/FileDropzone';
import * as XLSX from 'xlsx';

export default function ConvertPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleConvert = async () => {
    if (!file) { setError('Lütfen bir dosya seçin.'); return; }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const text = await file.text();
      const cleanText = text.startsWith('\ufeff') ? text.slice(1) : text;
      
      const rows = cleanText.split(/\r?\n/).filter(line => line.trim() !== '');
      const data = rows.map(row => row.split('\t'));

      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

      const fileName = `${file.name.replace('.csv', '')}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setSuccess(`Dönüştürme tamamlandı: ${fileName}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <GS1ToolCard
        title="XLSX Dönüştürücü (Convert)"
        description="CSV dosyalarını, GS1 kontrol karakterlerini bozmadan tek sütunlu XLSX formatına dönüştürür."
        icon={FileCode}
      >
        <div className="space-y-6">
          <FileDropzone
            label="Kaynak CSV Dosyası"
            accept=".csv,.txt"
            onFileSelect={(f) => setFile(f)}
          />

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
            onClick={handleConvert}
            disabled={loading || !file}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
            Dönüştür ve İndir (.xlsx)
          </button>
        </div>
      </GS1ToolCard>
    </div>
  );
}
