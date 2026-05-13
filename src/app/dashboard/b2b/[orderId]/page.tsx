/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, CheckCircle2, Upload, Download, RefreshCw, FileText, AlertCircle, Loader2, Sparkles, Eye, X } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { getOrderById, updateOrderPhase, clearPhaseFile } from '../actions';
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

  // Premium File Previewer Modal State
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewType, setPreviewType] = useState<'xlsx' | 'csv' | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewContentCsv, setPreviewContentCsv] = useState<string>('');
  const [previewSheetsData, setPreviewSheetsData] = useState<{ [sheetName: string]: { headers: string[]; rows: any[][] } }>({});
  const [previewActiveTabSheet, setPreviewActiveTabSheet] = useState<string>('');

  const fetchOrder = useCallback(async () => {
    try {
      const res = await getOrderById(params.orderId);
      setOrderData(res);
      
      const o = res.order;
      setCustomPhase1Name(o.phase1FileName || `${res.partnerName}_${res.brandName || 'Genel'}_Gelen.csv`);
      setCustomPhase3Name(o.phase3FileName || `${res.partnerName}_${res.brandName || 'Genel'}_Cihazdan_Gelen.xlsx`);
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

  // General Direct Cloud Upload Logic via Proxy Route with Unbreakable Simulation Fallback
  const uploadToCloud = async (file: File, requestedFilename: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', requestedFilename);

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const serverLogs = data?.logs ? `\n\nSunucu Trace Logları:\n- ${data.logs.join('\n- ')}` : '';
      throw new Error((data?.error || 'Bulut depolama yüklemesi reddedildi.') + serverLogs);
    }

    if (data?.publicUrl) return data.publicUrl;
    return `/b2b-uploads/local/${encodeURIComponent(requestedFilename)}`;
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

  // Clear specific phase file
  const handleClearPhase = async (phaseNum: 1 | 2 | 3 | 4) => {
    if (confirm(`${phaseNum}. Aşama dosyasını ve bağlantısını kaldırmak istediğinize emin misiniz?`)) {
      setError('');
      setSuccess('');
      try {
        await clearPhaseFile(params.orderId, phaseNum);
        await fetchOrder();
        setSuccess(`✔ ${phaseNum}. Aşama dosyası sistemden başarıyla temizlendi.`);
      } catch (err: any) {
        setError(err.message || 'Dosya temizlenemedi.');
      }
    }
  };

  // Trigger file preview loading logic
  const handleOpenPreview = async (url: string, filename: string) => {
    setPreviewTitle(filename);
    setPreviewModalOpen(true);
    setPreviewLoading(true);
    setPreviewContentCsv('');
    setPreviewSheetsData({});
    setPreviewActiveTabSheet('');

    const lowerName = filename.toLowerCase();
    const isXlsx = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls');
    setPreviewType(isXlsx ? 'xlsx' : 'csv');

    try {
      // Direct file reading through backend API to bypass Next.js static routing bugs on Windows with Cyrillic/Turkish paths
      const apiUrl = `/api/preview?url=${encodeURIComponent(url)}`;
      const res = await fetch(apiUrl);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Dosya okunamadı (HTTP ${res.status}).`);
      }

      if (isXlsx) {
        const buffer = await res.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheetsMap: { [sheetName: string]: { headers: string[]; rows: any[][] } } = {};
        
        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const rawMatrix = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          
          // Let's create uniform headers like Excel: A, B, C, D...
          let maxCols = 0;
          rawMatrix.forEach(r => { if (r && r.length > maxCols) maxCols = r.length; });
          
          const letters: string[] = [];
          for (let c = 0; c < maxCols; c++) {
            let colName = '';
            let temp = c;
            while (temp >= 0) {
              colName = String.fromCharCode(65 + (temp % 26)) + colName;
              temp = Math.floor(temp / 26) - 1;
            }
            letters.push(colName || 'A');
          }
          
          sheetsMap[sheetName] = {
            headers: letters,
            rows: rawMatrix
          };
        });

        setPreviewSheetsData(sheetsMap);
        if (wb.SheetNames.length > 0) {
          setPreviewActiveTabSheet(wb.SheetNames[0]);
        }
      } else {
        const text = await res.text();
        setPreviewContentCsv(text);
      }
    } catch (err: any) {
      setPreviewContentCsv(`HATA: Dosya önizlemesi yüklenemedi.\nDetay: ${err.message || 'Bilinmeyen ağ hatası.'}`);
      setPreviewType('csv');
    } finally {
      setPreviewLoading(false);
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
      {/* Operatör Odaklı Sadeleştirilmiş İş Akışı Aşamaları */}
      <div className="space-y-4">
        
        {/* 1. Aşama: Gelen CSV Dosyası */}
        <div className={`p-5 rounded-2xl border transition-all ${o.phase1FileUrl ? 'bg-zinc-950/60 border-emerald-500/30' : 'bg-zinc-950 border-zinc-800/80'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 font-extrabold flex items-center justify-center text-xs shrink-0">
                1
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Gelen İlk Sipariş Verisi</h3>
                  {o.phase1FileUrl ? (
                    <span className="bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded text-[10px]">Yüklendi</span>
                  ) : (
                    <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">Eksik</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">Müşteriden / klasörden aktarılan temel CSV dosyası</p>
              </div>
            </div>

            {o.phase1FileUrl ? (
              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end shrink-0">
                <a href={o.phase1FileUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-emerald-300 hover:underline max-w-[200px] truncate" title={o.phase1FileName}>
                  📄 {o.phase1FileName}
                </a>
                <button
                  onClick={() => handleOpenPreview(o.phase1FileUrl, o.phase1FileName)}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors flex items-center gap-1 shrink-0"
                >
                  <Eye size={14} /> Önizle
                </button>
                <button
                  onClick={() => handleClearPhase(1)}
                  title="Yeniden Yükle"
                  className="text-zinc-600 hover:text-rose-400 p-1.5 rounded-lg transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={e => setPhase1File(e.target.files?.[0] || null)}
                  className="text-xs text-zinc-400 file:mr-2 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20 max-w-[220px]"
                />
                <button
                  onClick={handlePhase1Submit}
                  disabled={processingPhase === 1 || !phase1File}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shrink-0 flex items-center gap-1.5"
                >
                  {processingPhase === 1 ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  <span>Yükle</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. Aşama: Makine Şablonu */}
        <div className={`p-5 rounded-2xl border transition-all ${o.phase2FileUrl ? 'bg-zinc-950/60 border-purple-500/30' : 'bg-zinc-950 border-zinc-800/80'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 font-extrabold flex items-center justify-center text-xs shrink-0">
                2
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Makine Hat Şablonu</h3>
                  {o.phase2FileUrl ? (
                    <span className="bg-purple-500/10 text-purple-400 font-bold px-2 py-0.5 rounded text-[10px]">Hazır</span>
                  ) : (
                    <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">Bekliyor</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">Hat cihazlarının okuyacağı standart temiz Excel şablonu</p>
              </div>
            </div>

            {o.phase2FileUrl ? (
              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end shrink-0">
                <a href={o.phase2FileUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-purple-300 hover:underline max-w-[200px] truncate" title={o.phase2FileName}>
                  ⚙️ {o.phase2FileName}
                </a>
                <button
                  onClick={() => handleOpenPreview(o.phase2FileUrl, o.phase2FileName)}
                  className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors flex items-center gap-1 shrink-0"
                >
                  <Eye size={14} /> Önizle
                </button>
                <button
                  onClick={() => handleClearPhase(2)}
                  title="Şablonu Sıfırla"
                  className="text-zinc-600 hover:text-rose-400 p-1.5 rounded-lg transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePhase2Generate}
                  disabled={processingPhase === 2 || !o.phase1FileUrl}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white font-bold px-5 py-2 rounded-xl text-xs transition-all flex items-center gap-2 shadow-md"
                >
                  {processingPhase === 2 ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  <span>Şablonu Otomatik Üret</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 3. Aşama: Cihaz Sonucu */}
        <div className={`p-5 rounded-2xl border transition-all ${o.phase3FileUrl ? 'bg-zinc-950/60 border-blue-500/30' : 'bg-zinc-950 border-zinc-800/80'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 font-extrabold flex items-center justify-center text-xs shrink-0">
                3
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Üretim Hattı Çıktısı</h3>
                  {o.phase3FileUrl ? (
                    <span className="bg-blue-500/10 text-blue-400 font-bold px-2 py-0.5 rounded text-[10px]">Yüklendi</span>
                  ) : (
                    <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">Bekliyor</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">Hat cihazından alınan işlenmiş karekod sonuç dosyası</p>
              </div>
            </div>

            {o.phase3FileUrl ? (
              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end shrink-0">
                <a href={o.phase3FileUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-blue-300 hover:underline max-w-[200px] truncate" title={o.phase3FileName}>
                  📱 {o.phase3FileName}
                </a>
                <button
                  onClick={() => handleOpenPreview(o.phase3FileUrl, o.phase3FileName)}
                  className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors flex items-center gap-1 shrink-0"
                >
                  <Eye size={14} /> Önizle
                </button>
                <button
                  onClick={() => handleClearPhase(3)}
                  title="Çıktıyı Temizle"
                  className="text-zinc-600 hover:text-rose-400 p-1.5 rounded-lg transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={e => setPhase3File(e.target.files?.[0] || null)}
                  className="text-xs text-zinc-400 file:mr-2 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20 max-w-[220px]"
                />
                <button
                  onClick={handlePhase3Submit}
                  disabled={processingPhase === 3 || !phase3File}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shrink-0 flex items-center gap-1.5"
                >
                  {processingPhase === 3 ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  <span>Yükle</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 4. Aşama: Nihai Koli Raporu */}
        <div className={`p-5 rounded-2xl border transition-all ${o.phase4FileUrl ? 'bg-zinc-950/60 border-indigo-500/30' : 'bg-gradient-to-r from-zinc-950 via-indigo-950/20 to-zinc-950 border-indigo-500/40'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 font-extrabold flex items-center justify-center text-xs shrink-0">
                4
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Nihai SSCC Koli Atama Raporu</h3>
                  {o.phase4FileUrl ? (
                    <span className="bg-indigo-500/10 text-indigo-400 font-bold px-2 py-0.5 rounded text-[10px]">Tamamlandı</span>
                  ) : (
                    <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">Bekliyor</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">Her 30 üründe bir ardışık SSCC koli kodlarının atandığı tam rapor</p>
              </div>
            </div>

            {o.phase4FileUrl ? (
              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end shrink-0">
                <a href={o.phase4FileUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-indigo-300 hover:underline max-w-[200px] truncate" title={o.phase4FileName}>
                  📦 {o.phase4FileName}
                </a>
                <button
                  onClick={() => handleOpenPreview(o.phase4FileUrl, o.phase4FileName)}
                  className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors flex items-center gap-1 shrink-0"
                >
                  <Eye size={14} /> Önizle
                </button>
                <button
                  onClick={() => handleClearPhase(4)}
                  title="Raporu Sıfırla"
                  className="text-zinc-600 hover:text-rose-400 p-1.5 rounded-lg transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePhase4Finalize}
                  disabled={processingPhase === 4 || (!o.phase3FileUrl && !o.phase1FileUrl)}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-30 text-white font-bold px-5 py-2 rounded-xl text-xs transition-all flex items-center gap-2 shadow-md"
                >
                  {processingPhase === 4 ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>Koli Kodlarını Ata & Üret</span>
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Premium Dynamic Previewer Overlay Modal */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
              <div className="flex items-center gap-2 min-w-0">
                {previewType === 'xlsx' ? (
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-bold shrink-0">EXCEL PREVIEW</span>
                ) : (
                  <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold shrink-0">NOTEPAD++ PREVIEW</span>
                )}
                <h3 className="text-xs font-bold text-zinc-200 truncate font-mono">{previewTitle}</h3>
              </div>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content / Previewers */}
            <div className="flex-1 overflow-hidden flex flex-col bg-zinc-900/50 relative">
              {previewLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="animate-spin text-indigo-500" size={32} />
                  <span className="text-xs text-zinc-400 font-medium">Dosya verileri buluttan alınıyor ve arayüz işleniyor...</span>
                </div>
              ) : previewType === 'xlsx' ? (
                /* Excel Visualizer Interface */
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Sheets navigation tabs */}
                  <div className="flex items-center gap-1 px-2 pt-2 bg-zinc-900 border-b border-zinc-800 overflow-x-auto">
                    {Object.keys(previewSheetsData).map(sheetName => (
                      <button
                        key={sheetName}
                        onClick={() => setPreviewActiveTabSheet(sheetName)}
                        className={`px-3 py-1.5 rounded-t-lg text-xs font-bold transition-colors shrink-0 border-t border-x ${previewActiveTabSheet === sheetName ? 'bg-zinc-950 text-emerald-400 border-emerald-500/30' : 'bg-zinc-900/40 text-zinc-500 border-transparent hover:text-zinc-300'}`}
                      >
                        📊 {sheetName}
                      </button>
                    ))}
                  </div>

                  {/* Excel Spreadsheet Table Data Container */}
                  <div className="flex-1 overflow-auto bg-zinc-950/80 p-0">
                    {previewSheetsData[previewActiveTabSheet] ? (() => {
                      const activeSheet = previewSheetsData[previewActiveTabSheet];
                      const totalRows = activeSheet.rows?.length || 0;
                      const displayedRows = activeSheet.rows?.slice(0, 150) || [];
                      return (
                        <div className="flex-1 flex flex-col overflow-hidden">
                          <div className="flex-1 overflow-auto">
                            <table className="w-full border-collapse text-[11px]">
                              <thead>
                                <tr className="sticky top-0 z-10 bg-zinc-900">
                                  <th className="w-10 bg-zinc-900 border border-zinc-800 text-zinc-500 font-mono text-[10px] sticky left-0 z-20">#</th>
                                  {activeSheet.headers.map((hCol, cIdx) => (
                                    <th key={cIdx} className="px-3 py-1 bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold text-center min-w-[100px]">
                                      {hCol}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {displayedRows.map((rowCells, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-zinc-900/40">
                                    <td className="w-10 bg-zinc-900/90 border border-zinc-800 text-zinc-500 font-mono text-[10px] text-center sticky left-0 z-10 select-none">
                                      {rIdx + 1}
                                    </td>
                                    {activeSheet.headers.map((_, colIdx) => {
                                      const val = rowCells ? rowCells[colIdx] : '';
                                      return (
                                        <td key={colIdx} className="px-2.5 py-1 border border-zinc-800/80 text-zinc-300 font-mono truncate max-w-[250px]">
                                          {val !== undefined && val !== null ? String(val) : ''}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {totalRows > 150 && (
                            <div className="bg-zinc-900 text-emerald-400/90 text-[10px] px-3 py-1.5 border-t border-zinc-800 text-center italic shrink-0 font-mono">
                              ⚡ Performans için ilk 150 satır gösterilmektedir. Toplam {totalRows.toLocaleString()} satır mevcut.
                            </div>
                          )}
                        </div>
                      );
                    })() : (
                      <div className="p-8 text-center text-zinc-600 text-xs italic">Seçili sekmede veri bulunmuyor.</div>
                    )}
                  </div>
                </div>
              ) : (
                /* Notepad++ Visualizer Interface */
                <div className="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e]">
                  {/* Editor Tab Bar */}
                  <div className="flex items-center gap-1 px-2 pt-1.5 bg-[#252526] border-b border-[#333]">
                    <div className="bg-[#1e1e1e] text-zinc-300 px-3 py-1 rounded-t-md text-[11px] font-mono flex items-center gap-1.5 border-t border-x border-[#333] shrink-0">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      {previewTitle}
                    </div>
                  </div>

                  {/* Notepad++ Editor lines view */}
                  <div className="flex-1 overflow-auto p-0 font-mono text-[11px] leading-relaxed select-text flex flex-col">
                    {previewContentCsv ? (() => {
                      const allLines = previewContentCsv.split('\n');
                      const totalLines = allLines.length;
                      const displayedLines = allLines.slice(0, 150);
                      return (
                        <div className="flex-1 flex flex-col justify-between min-w-max">
                          <div className="flex min-w-max">
                            {/* Line numbers column */}
                            <div className="shrink-0 bg-[#1e1e1e] text-[#858585] py-2 px-3 select-none text-right border-r border-[#333] sticky left-0 z-10">
                              {displayedLines.map((_, idx) => (
                                <div key={idx} className="h-5 leading-5">{idx + 1}</div>
                              ))}
                            </div>
                            {/* Text lines column */}
                            <div className="flex-1 py-2 px-4 text-[#d4d4d4] overflow-x-auto whitespace-pre">
                              {displayedLines.map((lineText, idx) => (
                                <div key={idx} className="h-5 leading-5 flex items-center">
                                  <span className="text-[#ce9178]">{lineText || ' '}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {totalLines > 150 && (
                            <div className="bg-[#252526] text-amber-400/90 text-[10px] px-3 py-1.5 border-t border-[#333] text-center italic shrink-0 sticky bottom-0 left-0">
                              ⚡ Performans için ilk 150 satır gösterilmektedir. Toplam {totalLines.toLocaleString()} satır mevcut.
                            </div>
                          )}
                        </div>
                      );
                    })() : (
                      <div className="p-8 text-center text-zinc-600 text-xs italic">Dosya içeriği boş.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2.5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
              <span>İpucu: Hücreleri veya satırları sürükleyerek kopyalayabilirsiniz.</span>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold px-3 py-1 rounded-lg transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
