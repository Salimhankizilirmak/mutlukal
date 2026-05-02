'use client';
import { useState } from 'react';
import { Download, RefreshCw, X, Loader2, FileDown, FileJson } from 'lucide-react';
import { getBatchDownloadUrl } from '@/actions/batch';

interface ConvertModalProps {
  workOrderNo: string;
  onClose: () => void;
}

function ConvertModal({ workOrderNo, onClose }: ConvertModalProps) {
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

      setSuccess(`✔ "${fileName}" oluşturuldu!`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bilinmeyen hata.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#18181b] border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <FileJson size={18} className="text-amber-400" />
            Çestniy Znak Dönüştürücü
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">Rapor Dosyası</label>
            <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-300 text-xs file:mr-3 file:bg-zinc-800 file:border-0 file:text-zinc-300 file:text-[10px] file:py-1 file:px-2 file:rounded" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">İş Emri No</label>
              <input value={orderNo} onChange={e => setOrderNo(e.target.value)}
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">GTIN</label>
              <input value={gtin} onChange={e => setGtin(e.target.value)} placeholder="086988..."
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none focus:border-amber-500/50" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">Ürün Adı</label>
              <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Urun"
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 block font-bold">Tarih</label>
              <input value={productionDate} onChange={e => setProductionDate(e.target.value)} placeholder="01.01.2024"
                className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 text-sm outline-none focus:border-amber-500/50" />
            </div>
          </div>

          {error && <p className="text-red-400 text-[10px] bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-emerald-400 text-[10px] bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2">{success}</p>}

          <button onClick={handleConvert} disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all text-sm shadow-lg shadow-amber-900/20">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Dönüştür ve İndir
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReportActionsProps {
  workOrderNo: string;
  downloadUrl: string; // Job order URL
  reportUrl: string;   // Real report URL
}

export default function ReportActions({ workOrderNo, downloadUrl, reportUrl }: ReportActionsProps) {
  const [showModal, setShowModal] = useState(false);
  const [dlJob, setDlJob] = useState(false);
  const [dlRep, setDlRep] = useState(false);

  const handleDownload = async (url: string, type: 'job' | 'report') => {
    if (type === 'job') setDlJob(true); else setDlRep(true);
    try {
      const signedUrl = await getBatchDownloadUrl(url);
      if (signedUrl) {
        const a = document.createElement('a');
        a.href = signedUrl;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 100);
      }
    } catch {
      alert('Hata oluştu.');
    } finally {
      if (type === 'job') setDlJob(false); else setDlRep(false);
    }
  };

  return (
    <>
      <div className="flex justify-end gap-2">
        {/* RAPOR İNDİR (Ana Aksiyon) */}
        <button
          onClick={() => handleDownload(reportUrl, 'report')}
          disabled={dlRep}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition-all shadow-lg shadow-blue-900/20"
        >
          {dlRep ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Raporu İndir
        </button>

        {/* SAF HALİNİ İNDİR (Yan Aksiyon) */}
        <button
          onClick={() => handleDownload(downloadUrl, 'job')}
          disabled={dlJob}
          title="Orijinal İş Emri Dosyası"
          className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-[11px] font-bold px-3 py-2 rounded-lg transition-all border border-zinc-700"
        >
          {dlJob ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
          Saf Halini İndir
        </button>

        {/* DÖNÜŞTÜR */}
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-amber-600/10 border border-amber-600/30 hover:bg-amber-600 hover:text-white text-amber-500 text-[11px] font-bold px-3 py-2 rounded-lg transition-all"
        >
          <RefreshCw size={13} /> Dönüştür
        </button>
      </div>

      {showModal && <ConvertModal workOrderNo={workOrderNo} onClose={() => setShowModal(false)} />}
    </>
  );
}
