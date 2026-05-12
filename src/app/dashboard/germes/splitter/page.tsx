'use client';
import { useState } from 'react';
import { Scissors, Plus, Trash2, Loader2, AlertCircle, FileSpreadsheet, ArrowLeft, Download } from 'lucide-react';
import { GS1ToolCard } from '@/components/GS1ToolCard';
import { FileDropzone } from '@/components/FileDropzone';
import Link from 'next/link';
import * as XLSX from 'xlsx';

interface SubsetConfig {
  id: string;
  fileName: string;
  count: number;
}

interface SplitResult {
  fileName: string;
  count: number;
  content: string;
}

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

export default function GermesSplitterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [availableProducts, setAvailableProducts] = useState<string[]>([]);
  const [configs, setConfigs] = useState<SubsetConfig[]>([
    { id: '1', fileName: 'Germes_Part1', count: 37800 },
  ]);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<SplitResult[]>([]);

  // Parse file immediately when dropped to inform user of true total row count
  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError('');
    setResults([]);
    setParsing(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];

      const extracted: string[] = [];
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) continue;
        const rawStr = String(row[0]).trim();
        if (rawStr.toLowerCase().includes('kod') || rawStr.toLowerCase().includes('tarih')) continue;
        
        const cleaned = cleanAndFormat(rawStr);
        if (cleaned) extracted.push(cleaned);
      }

      if (extracted.length === 0) {
        throw new Error('Dosyadan geçerli ürün kodu okunamadı. İlk sütunda kodların olduğundan emin olun.');
      }

      setAvailableProducts(extracted);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Dosya okunurken hata oluştu.');
      setAvailableProducts([]);
    } finally {
      setParsing(false);
    }
  };

  const addConfigRow = () => {
    const nextId = String(Date.now());
    setConfigs([...configs, { id: nextId, fileName: `Germes_Part${configs.length + 1}`, count: 10000 }]);
  };

  const removeConfigRow = (id: string) => {
    if (configs.length <= 1) return;
    setConfigs(configs.filter(c => c.id !== id));
  };

  const updateConfig = (id: string, field: keyof SubsetConfig, value: string | number) => {
    setConfigs(configs.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const totalRequested = configs.reduce((sum, c) => sum + (Number(c.count) || 0), 0);

  const handleSplit = () => {
    if (availableProducts.length === 0) {
      setError('Lütfen önce geçerli kodlar içeren bir dosya yükleyin.');
      return;
    }

    if (totalRequested > availableProducts.length) {
      setError(`Talep edilen toplam adet (${totalRequested}), dosyadaki mevcut barkod sayısından (${availableProducts.length}) fazla!`);
      return;
    }

    // Verify filenames
    for (const c of configs) {
      if (!c.fileName.trim()) {
        setError('Lütfen tüm çıktılar için geçerli bir dosya adı girin.');
        return;
      }
      if (c.count <= 0) {
        setError('Lütfen tüm çıktılar için sıfırdan büyük bir adet girin.');
        return;
      }
    }

    setLoading(true);
    setError('');
    setResults([]);

    try {
      let currentIndex = 0;
      const processedOutcomes: SplitResult[] = [];

      for (const conf of configs) {
        const chunk = availableProducts.slice(currentIndex, currentIndex + conf.count);
        currentIndex += conf.count;

        // Build clean single column format ready for downstream tool
        const csvContent = '\ufeff' + chunk.join('\r\n');
        const cleanName = conf.fileName.endsWith('.csv') ? conf.fileName : `${conf.fileName}.csv`;

        processedOutcomes.push({
          fileName: cleanName,
          count: chunk.length,
          content: csvContent,
        });
      }

      setResults(processedOutcomes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Parçalama sırasında bilinmeyen bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const triggerDownload = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard/germes" className="flex items-center gap-2 text-xs font-bold text-pink-400 hover:text-pink-300 transition-colors bg-pink-500/10 px-3 py-1.5 rounded-xl border border-pink-500/20">
          <ArrowLeft size={14} />
          Panele Dön
        </Link>
        <span className="text-xs text-zinc-500">Hanami Germes / Çoklu Parçalama</span>
      </div>

      <GS1ToolCard
        title="Çoklu Dosya Parçalayıcı (Multi-Splitter)"
        description="Fazla koli kodlarını içeren kaynak dosyayı belirlediğiniz isim ve satır sayılarına göre ardışık dilimlere ayırır."
        icon={Scissors}
      >
        <div className="space-y-6">
          <FileDropzone
            label="Kaynak Dosya (XLSX, XLS, CSV)"
            accept=".xlsx,.xls,.csv"
            onFileSelect={handleFileSelect}
          />

          {parsing && (
            <div className="flex items-center justify-center gap-3 p-4 bg-zinc-900 rounded-2xl border border-zinc-800 text-zinc-400 text-xs">
              <Loader2 size={16} className="animate-spin text-pink-500" />
              <span>Dosya taranıyor ve barkodlar doğrulanıyor...</span>
            </div>
          )}

          {file && !parsing && (
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-pink-950/20 to-purple-950/10 border border-pink-900/30 rounded-2xl">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={20} className="text-pink-400" />
                <div>
                  <p className="text-xs font-bold text-zinc-200">{file.name}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Okunan Geçerli Barkod: <span className="text-pink-400 font-bold">{availableProducts.length}</span> adet
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${totalRequested > availableProducts.length ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                  Kalan: {availableProducts.length - totalRequested}
                </span>
              </div>
            </div>
          )}

          {/* Dynamic Configuration Rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block">
                Hedef Çıktı Dosyaları ve Satır Dağılımı
              </label>
              <button
                onClick={addConfigRow}
                type="button"
                className="flex items-center gap-1.5 text-xs text-pink-400 hover:text-pink-300 font-bold py-1 px-2.5 rounded-lg bg-pink-500/5 hover:bg-pink-500/10 border border-pink-500/20 transition-colors"
              >
                <Plus size={14} />
                Çıktı Ekle
              </button>
            </div>

            <div className="space-y-2.5">
              {configs.map((conf, idx) => (
                <div key={conf.id} className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                  <span className="text-xs font-mono font-bold text-zinc-600 w-5 shrink-0 text-center">
                    #{idx + 1}
                  </span>
                  
                  <div className="flex-1">
                    <input
                      type="text"
                      value={conf.fileName}
                      onChange={(e) => updateConfig(conf.id, 'fileName', e.target.value)}
                      placeholder="Dosya Adı (Örn: Germes_73080)"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-pink-500/50 transition-colors"
                    />
                  </div>

                  <div className="w-36 shrink-0">
                    <input
                      type="number"
                      value={conf.count || ''}
                      onChange={(e) => updateConfig(conf.id, 'count', parseInt(e.target.value) || 0)}
                      placeholder="Adet"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none focus:border-pink-500/50 transition-colors"
                    />
                  </div>

                  <button
                    onClick={() => removeConfigRow(conf.id)}
                    disabled={configs.length <= 1}
                    title="Satırı Sil"
                    className="p-2 text-zinc-600 hover:text-red-400 disabled:opacity-20 transition-colors shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl text-red-400 text-xs">
              <AlertCircle size={18} className="shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <button
            onClick={handleSplit}
            disabled={loading || availableProducts.length === 0 || totalRequested <= 0}
            className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-30 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-pink-950/30"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Scissors size={20} />}
            Dosyaları Ayrıştır ve Hazırla
          </button>

          {/* Success Individual Download Cards */}
          {results.length > 0 && (
            <div className="pt-4 border-t border-zinc-800/80 space-y-3">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Parçalama Başarılı! Çıktı Dosyalarınız Hazır:
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.map((res, i) => (
                  <div key={i} className="flex items-center justify-between p-3.5 bg-zinc-950 border border-emerald-500/20 rounded-xl hover:border-emerald-500/40 transition-colors">
                    <div className="overflow-hidden pr-2">
                      <p className="text-xs font-bold text-zinc-200 truncate" title={res.fileName}>
                        {res.fileName}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {res.count} satır ürün kodu
                      </p>
                    </div>

                    <button
                      onClick={() => triggerDownload(res.fileName, res.content)}
                      className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-lg text-xs font-bold transition-colors shrink-0"
                    >
                      <Download size={14} />
                      İndir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </GS1ToolCard>
    </div>
  );
}
