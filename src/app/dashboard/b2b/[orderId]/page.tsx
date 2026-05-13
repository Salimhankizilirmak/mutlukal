/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, CheckCircle2, Clock, Upload, Download, RefreshCw, FileText, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { getOrderById, updateOrderPhase } from '../actions';
import { generateNextSSCC } from '@/lib/gs1';

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

export default function B2BPipelineDetailPage({ params }: { params: { orderId: string } }) {
  const [orderData, setOrderData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processingPhase, setProcessingPhase] = useState<number | null>(null);

  // Phase 1 Custom filename state
  const [customPhase1Name, setCustomPhase1Name] = useState('');
  const [phase1File, setPhase1File] = useState<File | null>(null);

  // Phase 3 Custom filename state
  const [customPhase3Name, setCustomPhase3Name] = useState('');
  const [phase3File, setPhase3File] = useState<File | null>(null);

  // Global SSCC counter state tracker
  const [activeSSCC, setActiveSSCC] = useState<string>('');

  const fetchOrder = useCallback(async () => {
    try {
      const res = await getOrderById(params.orderId);
      setOrderData(res);
      // set intelligent default filenames based on folder conventions
      if (!res.order.phase1FileName) {
        setCustomPhase1Name(`${res.partnerName}_${res.brandName || 'Genel'}_Gelen.csv`);
      } else {
        setCustomPhase1Name(res.order.phase1FileName);
      }
      if (!res.order.phase3FileName) {
        setCustomPhase3Name(`${res.partnerName}_${res.brandName || 'Genel'}_Cihazdan_Gelen.xlsx`);
      } else {
        setCustomPhase3Name(res.order.phase3FileName);
      }
    } catch (err: any) {
      setError(err.message || 'Sipariş detayları okunamadı');
    } finally {
      setLoading(false);
    }
  }, [params.orderId]);

  const fetchGlobalCounter = useCallback(async () => {
    try {
      const res = await fetch(`/api/sscc/state?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        if (d?.state) setActiveSSCC(d.state);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchOrder();
    fetchGlobalCounter();
  }, [fetchOrder, fetchGlobalCounter]);

  // General Direct Cloud Upload Logic via Proxy Route (Bypasses S3 CORS blocks)
  const uploadToCloud = async (file: File, requestedFilename: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', requestedFilename);

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Cloud depolama yüklemesi başarısız oldu.');
    }

    const { publicUrl } = await res.json();
    return publicUrl;
  };

  // Phase 1 Upload Handler
  const handlePhase1Submit = async () => {
    if (!phase1File) return setError('Lütfen 1. Aşama için gelen dosya seçin.');
    setProcessingPhase(1);
    setError('');
    setSuccess('');
    try {
      const targetName = customPhase1Name.trim() || phase1File.name;
      const url = await uploadToCloud(phase1File, targetName);
      await updateOrderPhase(params.orderId, 1, url, targetName);
      await fetchOrder();
      setSuccess('Aşama 1 dosyası başarıyla buluta yüklendi ve iş akışına bağlandı.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingPhase(null);
    }
  };

  // Phase 2 Generator (Machine Prep)
  const handlePhase2Generate = async () => {
    if (!orderData?.order?.phase1FileUrl) return setError('Aşama 1 dosyası bulunamadı.');
    setProcessingPhase(2);
    setError('');
    setSuccess('');
    try {
      // Fetch phase 1 raw contents
      const res = await fetch(orderData.order.phase1FileUrl);
      const buffer = await res.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];

      const rowsForMachine: any[] = [];
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || !row[0]) continue;
        const rawStr = String(row[0]).trim();
        
        // signature collision check protection
        if ((rawStr.toLowerCase().includes('kod') || rawStr.toLowerCase().includes('tarih')) && !rawStr.startsWith('01') && !rawStr.startsWith('(01)')) continue;
        
        const cleaned = cleanAndFormat(rawStr);
        if (cleaned) {
          rowsForMachine.push({ 'Barkod': cleaned });
        }
      }

      if (rowsForMachine.length === 0) throw new Error('Aşama 1 dosyasından geçerli kod çıkarılamadı.');

      // Package native Excel for machine
      const targetWs = XLSX.utils.json_to_sheet(rowsForMachine);
      const targetWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(targetWb, targetWs, 'Makine_Sablonu');
      const outBuffer = XLSX.write(targetWb, { type: 'array', bookType: 'xlsx' });

      const generatedName = `${orderData.partnerName}_${orderData.brandName || 'Genel'}_Makine_Sablonu.xlsx`;
      const fileObj = new File([outBuffer], generatedName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const url = await uploadToCloud(fileObj, generatedName);
      await updateOrderPhase(params.orderId, 2, url, generatedName);
      await fetchOrder();
      setSuccess('✔ Aşama 2 (Makine Exceli) otomatik üretildi ve S3 bulutuna eklendi.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingPhase(null);
    }
  };

  // Phase 3 Upload Handler
  const handlePhase3Submit = async () => {
    if (!phase3File) return setError('Lütfen 3. Aşama (Cihazdan Alınan) dosyasını seçin.');
    setProcessingPhase(3);
    setError('');
    setSuccess('');
    try {
      const targetName = customPhase3Name.trim() || phase3File.name;
      const url = await uploadToCloud(phase3File, targetName);
      await updateOrderPhase(params.orderId, 3, url, targetName);
      await fetchOrder();
      setSuccess('Aşama 3 dosyası başarıyla buluta yüklendi. Şimdi Rapor oluşturabilirsiniz.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingPhase(null);
    }
  };

  // Phase 4 Deliverables Logic (SSCC Carton chains generation + Final report formatting)
  const handlePhase4Finalize = async () => {
    const sourceUrl = orderData?.order?.phase3FileUrl || orderData?.order?.phase1FileUrl;
    if (!sourceUrl) return setError('Aşama 3 veya Aşama 1 kaynak verisi bulunamadı.');
    
    setProcessingPhase(4);
    setError('');
    setSuccess('');
    try {
      // 1. Fetch live un-cached SSCC active counter state
      const ssccRes = await fetch(`/api/sscc/state?t=${Date.now()}`, { cache: 'no-store' });
      const { state: startSSCC } = await ssccRes.json();
      if (!startSSCC || !startSSCC.startsWith('004')) throw new Error('Geçerli 004 sayacı okunamadı.');

      // 2. Fetch source file contents
      const fileRes = await fetch(sourceUrl);
      const buffer = await fileRes.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];

      const validProds: string[] = [];
      const seen = new Set();

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || !row[0]) continue;
        const rawStr = String(row[0]).trim();
        
        // collision free robust filter
        if ((rawStr.toLowerCase().includes('kod') || rawStr.toLowerCase().includes('tarih')) && !rawStr.startsWith('01') && !rawStr.startsWith('(01)')) continue;

        const cleaned = cleanAndFormat(rawStr);
        if (cleaned && !seen.has(cleaned)) {
          seen.add(cleaned);
          validProds.push(cleaned);
        }
      }

      if (validProds.length === 0) throw new Error('Dosyadan koli kodu atanacak ürün çıkarılamadı.');

      // 3. Chain sequential 004 carton logic every 30 records omitting pallet layer standard
      let currentSSCC = startSSCC;
      const finalLines: string[] = [];
      
      for (let i = 0; i < validProds.length; i++) {
        const isNewKoli = i % 30 === 0;
        if (i > 0 && isNewKoli) {
          currentSSCC = generateNextSSCC(currentSSCC);
        }
        finalLines.push(`${validProds[i]}\t${currentSSCC}`);
      }

      // 4. Update robust global continuous counter sequence via POST
      const nextSSCC = generateNextSSCC(currentSSCC);
      await fetch('/api/sscc/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextSSCC }),
        cache: 'no-store',
      });
      setActiveSSCC(nextSSCC);

      // 5. Output file package cloud persisting + local browser downloading
      const finalCsvContent = '\ufeff' + finalLines.join('\r\n');
      const targetDeliverableName = `${orderData.partnerName}_${orderData.brandName || 'Genel'}_Rapor_Tamamlandi.csv`;
      
      // Upload to Phase 4
      const fileObj = new File([finalCsvContent], targetDeliverableName, { type: 'text/csv;charset=utf-8' });
      const cloudUrl = await uploadToCloud(fileObj, targetDeliverableName);
      await updateOrderPhase(params.orderId, 4, cloudUrl, targetDeliverableName);

      // Client direct native download trigger
      const blob = new Blob([finalCsvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = targetDeliverableName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await fetchOrder();
      setSuccess(`✔ İşlem Harika! Toplam ${validProds.length} ürüne ardışık 004 SSCC atandı, dosyalar buluta yedeklendi ve otomatik indirildi.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingPhase(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-[400px]"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>;
  }

  const o = orderData?.order;
  if (!o) return <div className="text-center py-12 text-zinc-500">Sipariş akışı bulunamadı.</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard/b2b" className="flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20">
          <ArrowLeft size={14} /> İş Akışı Merkezine Dön
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-400">
            Aktif SSCC Serisi: <strong className="text-indigo-400">{activeSSCC || 'Yükleniyor...'}</strong>
          </span>
          <button onClick={fetchOrder} className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-xl text-zinc-400 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Hero Title Container */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide">{orderData?.partnerName}</span>
            {orderData?.brandName && (
              <span className="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded font-bold">
                {orderData.brandName}
              </span>
            )}
          </div>
          <h1 className="text-xl font-extrabold text-white mt-1">{o.orderName}</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Oluşturulma: {new Date(o.createdAt).toLocaleDateString('tr-TR')} • Bulut Depolama Aktif</p>
        </div>

        {/* Global Pipeline Step Banner */}
        <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 px-4 py-2.5 rounded-2xl">
          <Sparkles className="text-indigo-400" size={18} />
          <span className="text-xs font-bold text-indigo-200">
            {o.status === 'completed' ? 'Tüm Süreç Tamamlandı' : 'İş Akışı Devam Ediyor'}
          </span>
        </div>
      </div>

      {error && <div className="p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl text-xs font-bold flex items-center gap-2"><AlertCircle size={16} /><span>{error}</span></div>}
      {success && <div className="p-4 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl text-xs font-bold flex items-center gap-2"><CheckCircle2 size={16} /><span>{success}</span></div>}

      {/* 4 Steps Interactive Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Phase 1 Card */}
        <div className={`rounded-3xl p-5 border transition-all relative overflow-hidden ${o.phase1FileUrl ? 'bg-zinc-950/40 border-emerald-500/30' : 'bg-zinc-950/90 border-zinc-800 shadow-lg'}`}>
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center text-[10px]">1</span>
              Gelen Dosya (CSV)
            </span>
            {o.phase1FileUrl ? <CheckCircle2 className="text-emerald-500" size={16} /> : <Clock className="text-zinc-600" size={16} />}
          </div>

          <div className="pt-4 space-y-4">
            {o.phase1FileUrl ? (
              <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                <p className="text-[10px] text-zinc-500 font-bold uppercase">Yüklü Bulut Dosyası</p>
                <a href={o.phase1FileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-300 hover:underline block truncate mt-0.5">
                  {o.phase1FileName}
                </a>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500">Masaüstündeki mevcut isimlendirme yapınızı korumak için başlığı özelleştirebilirsiniz.</p>
            )}

            <div>
              <label className="text-[10px] text-zinc-400 font-bold uppercase block mb-1">Dosya İsimlendirmesi</label>
              <input
                type="text"
                value={customPhase1Name}
                onChange={e => setCustomPhase1Name(e.target.value)}
                placeholder="Dosya Adı..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500/50"
              />
            </div>

            <div>
              <label className="text-[10px] text-zinc-400 font-bold uppercase block mb-1">Dosya Seçimi</label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={e => setPhase1File(e.target.files?.[0] || null)}
                className="w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20 file:transition-colors"
              />
            </div>

            <button
              onClick={handlePhase1Submit}
              disabled={processingPhase === 1 || !phase1File}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md"
            >
              {processingPhase === 1 ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              <span>Buluta Yükle & Kaydet</span>
            </button>
          </div>
        </div>

        {/* Phase 2 Card */}
        <div className={`rounded-3xl p-5 border transition-all relative overflow-hidden ${o.phase2FileUrl ? 'bg-zinc-950/40 border-purple-500/30' : 'bg-zinc-950/90 border-zinc-800 shadow-lg'}`}>
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-purple-500/10 flex items-center justify-center text-[10px]">2</span>
              Makine Şablonu (Excel)
            </span>
            {o.phase2FileUrl ? <CheckCircle2 className="text-purple-500" size={16} /> : <Clock className="text-zinc-600" size={16} />}
          </div>

          <div className="pt-4 space-y-4">
            {o.phase2FileUrl ? (
              <div className="p-3 bg-purple-500/5 rounded-xl border border-purple-500/10">
                <p className="text-[10px] text-zinc-500 font-bold uppercase">Üretilen Bulut Şablonu</p>
                <a href={o.phase2FileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-purple-300 hover:underline block truncate mt-0.5">
                  {o.phase2FileName}
                </a>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500">1. Aşamadaki verileri ayrıştırarak makinenin okuyacağı standart <strong>Barkod</strong> sütunlu Excel dosyası oluşturur.</p>
            )}

            <button
              onClick={handlePhase2Generate}
              disabled={processingPhase === 2 || !o.phase1FileUrl}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white font-bold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md mt-6"
            >
              {processingPhase === 2 ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              <span>{o.phase2FileUrl ? 'Şablonu Yeniden Üret' : 'Otomatik Şablon Üret'}</span>
            </button>
          </div>
        </div>

        {/* Phase 3 Card */}
        <div className={`rounded-3xl p-5 border transition-all relative overflow-hidden ${o.phase3FileUrl ? 'bg-zinc-950/40 border-blue-500/30' : 'bg-zinc-950/90 border-zinc-800 shadow-lg'}`}>
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center text-[10px]">3</span>
              Cihazdan Alınan Veri
            </span>
            {o.phase3FileUrl ? <CheckCircle2 className="text-blue-500" size={16} /> : <Clock className="text-zinc-600" size={16} />}
          </div>

          <div className="pt-4 space-y-4">
            {o.phase3FileUrl ? (
              <div className="p-3 bg-blue-500/5 rounded-xl border border-blue-500/10">
                <p className="text-[10px] text-zinc-500 font-bold uppercase">Yüklü Üretim Sonucu</p>
                <a href={o.phase3FileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-300 hover:underline block truncate mt-0.5">
                  {o.phase3FileName}
                </a>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500">Üretim bittikten sonra makineden aldığınız çıktı Excel/CSV dosyasını buraya yükleyin.</p>
            )}

            <div>
              <label className="text-[10px] text-zinc-400 font-bold uppercase block mb-1">Dosya İsimlendirmesi</label>
              <input
                type="text"
                value={customPhase3Name}
                onChange={e => setCustomPhase3Name(e.target.value)}
                placeholder="Dosya Adı..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-blue-500/50"
              />
            </div>

            <div>
              <label className="text-[10px] text-zinc-400 font-bold uppercase block mb-1">Çıktı Dosyası Seçimi</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => setPhase3File(e.target.files?.[0] || null)}
                className="w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 file:transition-colors"
              />
            </div>

            <button
              onClick={handlePhase3Submit}
              disabled={processingPhase === 3 || !phase3File}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md"
            >
              {processingPhase === 3 ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              <span>Buluta Yükle</span>
            </button>
          </div>
        </div>

        {/* Phase 4 Card */}
        <div className={`rounded-3xl p-5 border transition-all relative overflow-hidden ${o.phase4FileUrl ? 'bg-zinc-950/40 border-indigo-500/30' : 'bg-gradient-to-br from-zinc-950 via-indigo-950/20 to-zinc-950 border-indigo-500/40 shadow-xl'}`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-xl pointer-events-none"></div>
          
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center text-[10px]">4</span>
              Nihai Rapor & Koli Atama
            </span>
            {o.phase4FileUrl ? <CheckCircle2 className="text-indigo-500" size={16} /> : <Clock className="text-zinc-600" size={16} />}
          </div>

          <div className="pt-4 space-y-4">
            {o.phase4FileUrl ? (
              <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                <p className="text-[10px] text-zinc-500 font-bold uppercase">Tamamlanan Bulut Raporu</p>
                <a href={o.phase4FileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-indigo-300 hover:underline block truncate mt-0.5">
                  {o.phase4FileName}
                </a>
              </div>
            ) : (
              <div className="space-y-2 text-[11px] text-zinc-400">
                <p>Mükerrer barkodları otomatik temizler ve belirlenen standart kurallara göre nihai CSV formatını oluşturur:</p>
                <ul className="list-disc list-inside text-indigo-300/80 space-y-0.5 font-medium">
                  <li>004 ile başlayan ardışık SSCC kodları</li>
                  <li>Her 30 üründe bir yeni koli</li>
                  <li>Palet katmanı hariç (Triton standardı)</li>
                </ul>
              </div>
            )}

            <button
              onClick={handlePhase4Finalize}
              disabled={processingPhase === 4 || (!o.phase3FileUrl && !o.phase1FileUrl)}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-30 text-white font-bold py-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/40 mt-4"
            >
              {processingPhase === 4 ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              <span>{o.phase4FileUrl ? 'Raporu Tekrar Üret ve İndir' : 'Koli Kodlarını Ata & Raporu İndir'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
