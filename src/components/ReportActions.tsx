'use client';
import { useState } from 'react';
import { Download, RefreshCw, X, Check, Loader2 } from 'lucide-react';
import { getBatchDownloadUrl } from '@/actions/batch';

interface ConvertModalProps {
  batchId: string;
  workOrderNo: string;
  onClose: () => void;
}

function ConvertModal({ workOrderNo, onClose }: Omit<ConvertModalProps, 'batchId'>) {
  const [file, setFile] = useState<File | null>(null);
  const [orderNo, setOrderNo] = useState(workOrderNo);
  const [gtin, setGtin] = useState('');
  const [productName, setProductName] = useState('');
  const [productionDate, setProductionDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleConvert = async () => {
    if (!file) { setError('Lütfen rapor dosyasını seçin.'); return; }
    setError(''); setSuccess(''); setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orderNo', orderNo);
      fd.append('gtin', gtin);
      fd.append('productName', productName);
      fd.append('productionDate', productionDate);

      const res = await fetch('/api/convert', { method: 'POST', body: fd });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Dönüştürme başarısız.');
        return;
      }

      const disposition = res.headers.get('Content-Disposition') || '';
      let fileName = 'sevkiyat.csv';
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      if (match) fileName = decodeURIComponent(match[1]);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);

      setSuccess(`✔ "${fileName}" oluşturuldu ve indirildi!`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bilinmeyen hata.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#18181b] border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <RefreshCw size={18} className="text-amber-400" />
            Sevkiyat Dosyası Oluştur
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-zinc-500">
            Rapordan markalama kodlarını çıkararak Çestniy Znak için UTF-8 (BOM&#39;suz) CSV dosyası oluşturur.
          </p>

          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Rapor Dosyası (Excel .xlsx)</label>
            <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full bg-[#09090b] border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 text-sm file:mr-3 file:bg-zinc-700 file:border-0 file:text-zinc-200 file:text-xs file:py-1 file:px-2 file:rounded" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Sipariş No</label>
              <input value={orderNo} onChange={e => setOrderNo(e.target.value)}
                className="w-full bg-[#09090b] border border-zinc-700 focus:border-amber-500 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">GTIN</label>
              <input value={gtin} onChange={e => setGtin(e.target.value)} placeholder="0869882938..."
                className="w-full bg-[#09090b] border border-zinc-700 focus:border-amber-500 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Ürün Adı</label>
              <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Ürün1"
                className="w-full bg-[#09090b] border border-zinc-700 focus:border-amber-500 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Üretim Tarihi</label>
              <input value={productionDate} onChange={e => setProductionDate(e.target.value)} placeholder="01.10.2024"
                className="w-full bg-[#09090b] border border-zinc-700 focus:border-amber-500 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none" />
            </div>
          </div>

          {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          {success && (
            <p className="text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <Check size={14} /> {success}
            </p>
          )}

          <button onClick={handleConvert} disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all text-sm">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Dönüştürülüyor...</> : <><RefreshCw size={16} /> CSV Oluştur ve İndir</>}
          </button>

          <p className="text-[10px] text-zinc-600 text-center">
            Dosya formatı: <span className="font-mono text-zinc-500">{orderNo || 'Sipariş'}, {gtin || 'GTIN'}, [adet], {productName || 'Ürün'}, {productionDate || 'Tarih'}.csv</span>
          </p>
        </div>
      </div>
    </div>
  );
}

interface ReportActionsProps {
  workOrderNo: string;
  downloadUrl: string;
  reportUrl?: string | null;
}

export default function ReportActions({ workOrderNo, downloadUrl, reportUrl }: ReportActionsProps) {
  const [showModal, setShowModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reportDownloading, setReportDownloading] = useState(false);

  const handleDownload = async (url: string, isReport: boolean) => {
    if (isReport) setReportDownloading(true);
    else setDownloading(true);

    try {
      const signedUrl = await getBatchDownloadUrl(url);
      if (signedUrl) {
        const a = document.createElement('a');
        a.href = signedUrl;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 100);
      } else {
        alert('İndirme linki oluşturulamadı.');
      }
    } catch {
      alert('İndirme hatası.');
    } finally {
      if (isReport) setReportDownloading(false);
      else setDownloading(false);
    }
  };

  return (
    <>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => handleDownload(downloadUrl, false)}
          disabled={downloading}
          title="Orijinal İş Emrini İndir"
          className="flex items-center gap-1.5 bg-emerald-600/10 border border-emerald-500/30 hover:bg-emerald-600 text-emerald-400 hover:text-white text-xs font-bold px-3 py-2 rounded-lg transition-all"
        >
          {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Saf Halini İndir
        </button>

        {reportUrl && (
          <button
            onClick={() => handleDownload(reportUrl, true)}
            disabled={reportDownloading}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all shadow-[0_0_10px_rgba(37,99,235,0.3)]"
          >
            {reportDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Raporu İndir
          </button>
        )}

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600 hover:text-white text-amber-400 text-xs font-bold px-3 py-2 rounded-lg transition-all"
        >
          <RefreshCw size={13} /> Dönüştür
        </button>
      </div>

      {showModal && (
        <ConvertModal
          workOrderNo={workOrderNo}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
