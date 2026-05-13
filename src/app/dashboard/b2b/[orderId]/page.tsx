/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, CheckCircle2, Upload, RefreshCw, AlertCircle, Loader2, Sparkles, Eye, X, ChevronDown, Hash } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { getOrderById, updateOrderPhase, clearPhaseFile, getMonthlyMasterList, sendB2BReportEmail } from '../actions';
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

const detectSeparator = (text: string) => {
  const lines = text.split(/\r\n|\r|\n/).slice(0, 10);
  const counts = { tab: 0, comma: 0, semi: 0 };
  lines.forEach(line => {
    counts.tab += (line.match(/\t/g) || []).length;
    counts.comma += (line.match(/,/g) || []).length;
    counts.semi += (line.match(/;/g) || []).length;
  });
  if (counts.tab > counts.comma && counts.tab > counts.semi) return '\t';
  if (counts.semi > counts.comma) return ';';
  return ',';
};

const safeJsonParse = (str: string | null) => {
  if (!str) return [];
  try {
    const d = JSON.parse(str);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
};

export default function B2BPipelineDetailPage({ params }: { params: { orderId: string } }) {
  const [orderData, setOrderData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processingPhase, setProcessingPhase] = useState<number | null>(null);

  // Accordion states for multi-file views
  const [expandedPhase1, setExpandedPhase1] = useState(false);
  const [expandedPhase2, setExpandedPhase2] = useState(false);
  const [expandedPhase3, setExpandedPhase3] = useState(false);
  const [expandedPhase4, setExpandedPhase4] = useState(false);
  const [sendingMail, setSendingMail] = useState(false);
  const [mailSuccess, setMailSuccess] = useState(false);

  // Phase 1 Custom filename state
  const [customPhase1Name, setCustomPhase1Name] = useState('');
  const [phase1File, setPhase1File] = useState<File | null>(null);

  // Phase 3 Custom filename state
  const [customPhase3Name, setCustomPhase3Name] = useState('');
  const [phase3File, setPhase3File] = useState<File | null>(null);

  // Global SSCC counter state tracker
  const [activeSSCC, setActiveSSCC] = useState<string>('');
  const [reconcileTargetCount, setReconcileTargetCount] = useState<number>(0);

  // Manual override file states
  const [phase2ManualFile, setPhase2ManualFile] = useState<File | null>(null);
  const [phase4ManualFile, setPhase4ManualFile] = useState<File | null>(null);

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
    // 1. Get Presigned URL from our API (bypass body limit)
    const authRes = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: requestedFilename,
        contentType: file.type || 'text/csv'
      })
    });

    if (!authRes.ok) {
      const err = await authRes.json().catch(() => ({}));
      throw new Error(`Yükleme izni alınamadı: ${err.error || authRes.statusText}`);
    }

    const { presignedUrl, publicUrl } = await authRes.json();

    // 2. Upload directly to Supabase/S3 from Browser (Bypasses Vercel 4.5MB limit)
    const uploadRes = await fetch(presignedUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'text/csv' }
    });

    if (!uploadRes.ok) {
      throw new Error(`Dosya doğrudan buluta yüklenemedi (HTTP ${uploadRes.status}). Lütfen Supabase Bucket/Policy ayarlarını kontrol edin.`);
    }

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

  // Phase 2 Generator (Machine Prep) - Pure GS1 Character Preserving Single Column XLSX Converter
  const handlePhase2Generate = async () => {
    if (!orderData?.order?.phase1FileUrl) return setError('Aşama 1 dosyası bulunamadı.');
    setProcessingPhase(2);
    setError('');
    setSuccess('');
    try {
      // 1. URL'yi güvenli hale getir (Rusça karakterler için)
      const targetUrl = orderData.order.phase1FileUrl.startsWith('http') 
        ? orderData.order.phase1FileUrl 
        : window.location.origin + orderData.order.phase1FileUrl;

      // 2. Kaynak dosyayı çek
      const res = await fetch(targetUrl);
      if (!res.ok) {
        throw new Error(`Kaynak dosya sunucudan alınamadı (HTTP ${res.status}).\nAdres: ${targetUrl}`);
      }

      // 3. İçeriğin HTML (404) olup olmadığını kontrol et
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error('HATA: Kaynak dosya yerine bir web sayfası (404) döndü. Lütfen dosyayı silip tekrar yükleyin.');
      }

      const text = await res.text();
      const cleanText = text.startsWith('\ufeff') ? text.slice(1) : text;
      
      const sep = detectSeparator(cleanText);
      const rows = cleanText.split(/\r\n|\r|\n/).filter(line => line.trim() !== '');
      
      // GS1 Dönüştürücü (Convert) Mantığı:
      const data = rows.map(row => {
        const cols = row.split(sep);
        const rawLine = cols.length > 1 ? cols.join(' ') : cols[0];
        return [cleanAndFormat(rawLine)];
      });

      const targetWs = XLSX.utils.aoa_to_sheet(data);
      const targetWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(targetWb, targetWs, 'Sheet1');

      // 4. XLSX Dosyasını Oluştur
      const baseName = orderData.order.phase1FileName ? orderData.order.phase1FileName.replace(/\.csv|\.txt/i, '') : `${orderData.partnerName}_Şablon`;
      const generatedName = `${baseName}.xlsx`;
      
      // Buluta Yükleme Hazırlığı
      const outBuffer = XLSX.write(targetWb, { type: 'array', bookType: 'xlsx' });
      const fileObj = new File([outBuffer], generatedName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const url = await uploadToCloud(fileObj, generatedName);
      await updateOrderPhase(params.orderId, 2, url, generatedName);
      
      // 5. Doğrudan İndirme (XLSX.writeFile ile daha güvenli)
      XLSX.writeFile(targetWb, generatedName);

      await fetchOrder();
      setSuccess(`✔ Aşama 2 (Makine Hat Şablonu) başarıyla üretildi ve buluta kaydedildi: ${generatedName}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingPhase(null);
    }
  };

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

  const handlePhase2ManualSubmit = async () => {
    if (!phase2ManualFile) return setError('Lütfen yüklenecek XLSX dosyasını seçin.');
    setProcessingPhase(2);
    setError('');
    setSuccess('');
    try {
      const url = await uploadToCloud(phase2ManualFile, phase2ManualFile.name);
      await updateOrderPhase(params.orderId, 2, url, phase2ManualFile.name);
      await fetchOrder();
      setSuccess('Aşama 2 (Makine Şablonu) manuel olarak yüklendi.');
      setPhase2ManualFile(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingPhase(null);
    }
  };

  const handlePhase4ManualSubmit = async () => {
    if (!phase4ManualFile) return setError('Lütfen yüklenecek rapor dosyasını seçin.');
    setProcessingPhase(4);
    setError('');
    setSuccess('');
    try {
      const url = await uploadToCloud(phase4ManualFile, phase4ManualFile.name);
      await updateOrderPhase(params.orderId, 4, url, phase4ManualFile.name);
      await fetchOrder();
      setSuccess('Aşama 4 (Nihai Rapor) manuel olarak yüklendi ve iş tamamlandı.');
      setPhase4ManualFile(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingPhase(null);
    }
  };

  // Phase 4 Deliverables Logic (Eksik Tamamlama / Reconcile)
  const handlePhase4Finalize = async () => {
    const reportUrl = orderData?.order?.phase3FileUrl;
    const refUrl = orderData?.order?.phase1FileUrl;
    
    if (!refUrl) return setError('Aşama 1 (Referans) verisi bulunamadı.');
    if (!reconcileTargetCount || reconcileTargetCount <= 0) return setError('Lütfen geçerli bir Hedef Toplam Adet girin.');
    
    setProcessingPhase(4);
    setError('');
    setSuccess('');
    try {
      // 1. Fetch live un-cached SSCC active counter state
      const ssccRes = await fetch(`/api/sscc/state?t=${Date.now()}`, { cache: 'no-store' });
      const { state: startSSCC } = await ssccRes.json();
      if (!startSSCC || !startSSCC.startsWith('004')) throw new Error('Geçerli 004 sayacı okunamadı.');

      // 2. Parse Phase 3 (Completed / Tamamlananlar) - Optional if only Phase 1 exists
      const completedCodes = new Set<string>();
      const finalProds: string[] = [];

      if (reportUrl) {
        const reportRes = await fetch(reportUrl);
        if (!reportRes.ok) throw new Error(`Rapor dosyası sunucuda bulunamadı (${reportRes.status}).`);
        const reportBuffer = await reportRes.arrayBuffer();
        const reportWb = XLSX.read(reportBuffer, { type: 'array' });
        const reportWs = reportWb.Sheets[reportWb.SheetNames[0]];
        const reportData = XLSX.utils.sheet_to_json(reportWs, { header: 1 }) as string[][];

        for (let i = 0; i < reportData.length; i++) {
          const row = reportData[i];
          if (!row || !row[0]) continue;
          const rawStr = String(row[0]).trim();
          if ((rawStr.toLowerCase().includes('kod') || rawStr.toLowerCase().includes('tarih')) && !rawStr.startsWith('01') && !rawStr.startsWith('(01)')) continue;
          
          const cleaned = cleanAndFormat(rawStr);
          if (cleaned && !completedCodes.has(cleaned)) {
            completedCodes.add(cleaned);
            finalProds.push(cleaned);
          }
        }
      }

      // 3. Parse Phase 1 (Reference / Tüm Kodlar)
      const refRes = await fetch(refUrl);
      const refText = await refRes.text();
      const cleanRefText = refText.startsWith('\ufeff') ? refText.slice(1) : refText;
      const refLines = cleanRefText.split(/\r?\n/).filter(l => l.trim() !== '');

      const refProdsRaw: string[] = [];
      for (const line of refLines) {
        // reconcile sayfasındaki gibi hem Tab hem Boşluk ayrıştırma
        const firstCol = line.split('\t')[0].trim();
        if (firstCol.startsWith('01') || firstCol.startsWith('(01)') || firstCol.length >= 13) {
          refProdsRaw.push(firstCol);
        } else if (refProdsRaw.length > 0) {
          refProdsRaw[refProdsRaw.length - 1] += " " + firstCol;
        }
      }
      const cleanedRefProds = refProdsRaw.map(cleanAndFormat).filter(Boolean);

      // 4. Reconciliation Logic: Fill missing codes up to targetCount
      const remainingCodes = cleanedRefProds.filter(code => !completedCodes.has(code));
      const totalNeeded = reconcileTargetCount - finalProds.length;
      
      if (totalNeeded < 0) {
        throw new Error(`Mevcut kod adedi (${finalProds.length}) hedef adetten (${reconcileTargetCount}) fazla.`);
      }
      
      if (totalNeeded > 0) {
        const selectedRemaining = remainingCodes.slice(0, totalNeeded);
        finalProds.push(...selectedRemaining);
      }

      if (finalProds.length !== reconcileTargetCount) {
        console.warn(`Hedef adede (${reconcileTargetCount}) ulaşılamadı. Eksik satır sayısı yetersiz. Elde edilen: ${finalProds.length}`);
      }

      // 5. Generate continuous carton SSCC codes
      let currentSSCC = startSSCC;
      const finalLines: string[] = [];
      
      for (let i = 0; i < finalProds.length; i++) {
        const isNewKoli = i % 30 === 0;
        if (i > 0 && isNewKoli) {
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
        cache: 'no-store',
      });
      setActiveSSCC(nextSSCC);

      // 7. Save to Cloud & Download
      const finalCsvContent = '\ufeff' + finalLines.join('\r\n');
      
      const o = orderData?.order || {};
      const currentOrderCode = o.phase1Note || (o.phase1FileName ? o.phase1FileName.split(',')[0].trim() : '');
      
      let targetItem: any = null;
      try {
        const mList = await getMonthlyMasterList();
        if (mList?.months) {
          for (const m of mList.months) {
            const found = m.items?.find((it: any) => it.orderCode.toLowerCase() === currentOrderCode.toLowerCase());
            if (found) { targetItem = found; break; }
          }
        }
      } catch {
        // ignore
      }

      const prodDate = targetItem?.productionDate || "06.05.2026";
      const sktDate = targetItem?.sktDate || "06.11.2026";
      const englishName = targetItem?.englishName || "Mutlukal Wheat Tortilla";
      const targetQtyStr = `${reconcileTargetCount} шт.`;

      const origParts = o.phase1FileName ? o.phase1FileName.replace(/\.csv$/i, '').split(',') : [];
      const gtin = origParts[1] ? origParts[1].trim() : "08698829380698";

      const targetDeliverableName = `${currentOrderCode || o.orderName}, ${gtin}, ${targetQtyStr},  ${englishName}, ${prodDate} ${sktDate}.csv`;
      
      const fileObj = new File([finalCsvContent], targetDeliverableName, { type: 'text/csv;charset=utf-8' });
      const cloudUrl = await uploadToCloud(fileObj, targetDeliverableName);
      await updateOrderPhase(params.orderId, 4, cloudUrl, targetDeliverableName);

      const blob = new Blob([finalCsvContent], { type: 'text/csv;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = targetDeliverableName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      await fetchOrder();
      setSuccess(`✔ Rapor Başarıyla Hazırlandı! Toplam ${finalProds.length} ürüne koli kodları atandı, buluta yedeklendi ve indirildi.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingPhase(null);
    }
  };
  
  const handleSendMail = async () => {
    const o = orderData?.order;
    if (!o?.phase4FileUrl) return;
    
    setSendingMail(true);
    setMailSuccess(false);
    setError('');
    
    try {
      // 1. Get metadata for subject (Fetch Master List)
      const currentOrderCode = o.phase1Note || (o.phase1FileName ? o.phase1FileName.split(',')[0].trim() : '');
      let targetItem: any = null;
      try {
        const mList = await getMonthlyMasterList();
        if (mList?.months) {
          for (const m of mList.months) {
            const found = m.items?.find((it: any) => it.orderCode.toLowerCase() === currentOrderCode.toLowerCase());
            if (found) { targetItem = found; break; }
          }
        }
      } catch { /* ignore */ }

      // 2. Fetch report to get SSCC range
      const res = await fetch(o.phase4FileUrl);
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '' && l.includes('\t'));
      
      if (lines.length === 0) throw new Error('Rapor içeriği boş veya okunamaz durumda.');
      
      const firstSSCC = lines[0].split('\t')[1];
      const lastSSCC = lines[lines.length - 1].split('\t')[1];
      const ssccRange = `${firstSSCC} - ${lastSSCC}`;

      const prodDate = targetItem?.productionDate || "06.05.2026";
      const sktDate = targetItem?.sktDate || "06.11.2026";

      await sendB2BReportEmail(params.orderId, o.phase4FileUrl, o.phase4FileName || 'report.csv', {
        vehicleCode: targetItem?.vehicleCode || o.orderName.split(' • ')[0],
        orderCode: currentOrderCode,
        ssccRange,
        prodDate,
        expDate: sktDate,
        batchNo: targetItem?.batchNo || "Bilinmiyor"
      });

      setMailSuccess(true);
    } catch (err: any) {
      setError(`Mail gönderimi başarısız: ${err.message}`);
    } finally {
      setSendingMail(false);
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
      // If the URL is absolute (Supabase/S3), fetch directly to bypass Vercel 4.5MB body limit
      const isAbsolute = url.startsWith('http');
      const fetchUrl = isAbsolute ? url : `/api/preview?url=${encodeURIComponent(url)}`;
      
      const res = await fetch(fetchUrl);
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
          
          // Create headers like A, B, C...
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
        const lines = text.split(/\r\n|\r|\n/);
        if (lines.length > 2000) {
          const truncated = lines.slice(0, 2000).join('\n');
          setPreviewContentCsv(`${truncated}\n\n... [DEVAMINI GÖRMEK İÇİN DOSYAYI İNDİRİN - TOPLAM ${lines.length} SATIR]`);
        } else {
          setPreviewContentCsv(text);
        }
      }
    } catch (err: any) {
      console.error('Preview error:', err);
      setError(`Önizleme yüklenemedi: ${err.message}`);
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
        {(() => {
          const files1 = safeJsonParse(o.phase1AllFiles);
          const hasMulti1 = files1.length > 1;
          return (
            <div className={`p-5 rounded-2xl border transition-all ${o.phase1FileUrl ? 'bg-zinc-950/60 border-emerald-500/30' : 'bg-zinc-950 border-zinc-800/80'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div 
                  onClick={() => hasMulti1 && setExpandedPhase1(!expandedPhase1)}
                  className={`flex items-center gap-3 ${hasMulti1 ? 'cursor-pointer select-none group' : ''}`}
                >
                  <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 font-extrabold flex items-center justify-center text-xs shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                    1
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors flex items-center gap-1">
                        <span>Gelen İlk Sipariş Verisi</span>
                        {hasMulti1 && (
                          <ChevronDown size={16} className={`text-emerald-400 transition-transform duration-200 ${expandedPhase1 ? 'rotate-180' : ''}`} />
                        )}
                      </h3>
                      {o.phase1FileUrl ? (
                        <span className="bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded text-[10px]">Yüklendi</span>
                      ) : (
                        <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">Eksik</span>
                      )}
                      {hasMulti1 && (
                        <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">+{files1.length - 1} Dosya</span>
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

              {/* Collapsible Subfiles Drawer */}
              {hasMulti1 && expandedPhase1 && (
                <div className="mt-4 pt-3 border-t border-emerald-500/10 animate-in fade-in slide-in-from-top-2 duration-200">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase mb-2 tracking-wider">Gruptaki Tüm Dosyalar</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                    {files1.map((fItem: any) => {
                      const fn = typeof fItem === 'string' ? fItem : fItem?.name;
                      if (!fn) return null;
                      const subUrl = fn === o.phase1FileName ? o.phase1FileUrl : `/b2b-uploads/local/${encodeURIComponent(fn)}`;
                      return (
                        <div key={fn} className="flex items-center justify-between p-2 rounded-xl bg-zinc-900 border border-zinc-800/80 hover:border-emerald-500/20 transition-colors">
                          <span className="text-xs font-mono text-zinc-300 truncate mr-2" title={fn}>📄 {fn}</span>
                          <button
                            onClick={() => handleOpenPreview(subUrl, fn)}
                            className="text-[10px] bg-zinc-800 hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-400 font-bold px-2 py-1 rounded-lg transition-colors shrink-0 flex items-center gap-1"
                          >
                            <Eye size={12} /> Önizle
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 2. Aşama: Makine Şablonu */}
        {(() => {
          const files2 = safeJsonParse(o.phase2AllFiles);
          const hasMulti2 = files2.length > 1;
          return (
            <div className={`p-5 rounded-2xl border transition-all ${o.phase2FileUrl ? 'bg-zinc-950/60 border-purple-500/30' : 'bg-zinc-950 border-zinc-800/80'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div 
                  onClick={() => hasMulti2 && setExpandedPhase2(!expandedPhase2)}
                  className={`flex items-center gap-3 ${hasMulti2 ? 'cursor-pointer select-none group' : ''}`}
                >
                  <span className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 font-extrabold flex items-center justify-center text-xs shrink-0 group-hover:bg-purple-500/20 transition-colors">
                    2
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors flex items-center gap-1">
                        <span>Makine Hat Şablonu</span>
                        {hasMulti2 && (
                          <ChevronDown size={16} className={`text-purple-400 transition-transform duration-200 ${expandedPhase2 ? 'rotate-180' : ''}`} />
                        )}
                      </h3>
                      {o.phase2FileUrl ? (
                        <span className="bg-purple-500/10 text-purple-400 font-bold px-2 py-0.5 rounded text-[10px]">Hazır</span>
                      ) : (
                        <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">Bekliyor</span>
                      )}
                      {hasMulti2 && (
                        <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">+{files2.length - 1} Dosya</span>
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
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <button
                      onClick={handlePhase2Generate}
                      disabled={processingPhase === 2 || !o.phase1FileUrl}
                      className="bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white font-bold px-5 py-2 rounded-xl text-xs transition-all flex items-center gap-2 shadow-md shrink-0"
                    >
                      {processingPhase === 2 ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      <span>Otonom Şablon Üret</span>
                    </button>
                    
                    <div className="h-4 w-[1px] bg-zinc-800 hidden sm:block" />
                    
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".xlsx"
                        onChange={e => setPhase2ManualFile(e.target.files?.[0] || null)}
                        className="text-[10px] text-zinc-500 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-zinc-800 file:text-zinc-400 hover:file:bg-zinc-700 max-w-[150px]"
                      />
                      <button
                        onClick={handlePhase2ManualSubmit}
                        disabled={!phase2ManualFile || processingPhase === 2}
                        className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 font-bold px-3 py-1.5 rounded-xl text-[10px] transition-all border border-zinc-700"
                      >
                        Yükle
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Subfiles Drawer */}
              {hasMulti2 && expandedPhase2 && (
                <div className="mt-4 pt-3 border-t border-purple-500/10 animate-in fade-in slide-in-from-top-2 duration-200">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase mb-2 tracking-wider">Gruptaki Tüm Şablon Dosyaları</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                    {files2.map((fItem: any) => {
                      const fn = typeof fItem === 'string' ? fItem : fItem?.name;
                      if (!fn) return null;
                      const subUrl = fn === o.phase2FileName ? o.phase2FileUrl : `/b2b-uploads/local/${encodeURIComponent(fn)}`;
                      return (
                        <div key={fn} className="flex items-center justify-between p-2 rounded-xl bg-zinc-900 border border-zinc-800/80 hover:border-purple-500/20 transition-colors">
                          <span className="text-xs font-mono text-zinc-300 truncate mr-2" title={fn}>⚙️ {fn}</span>
                          <button
                            onClick={() => handleOpenPreview(subUrl, fn)}
                            className="text-[10px] bg-zinc-800 hover:bg-purple-500/10 text-zinc-400 hover:text-purple-400 font-bold px-2 py-1 rounded-lg transition-colors shrink-0 flex items-center gap-1"
                          >
                            <Eye size={12} /> Önizle
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 3. Aşama: Cihaz Sonucu */}
        {(() => {
          const files3 = safeJsonParse(o.phase3AllFiles);
          const hasMulti3 = files3.length > 1;
          return (
            <div className={`p-5 rounded-2xl border transition-all ${o.phase3FileUrl ? 'bg-zinc-950/60 border-blue-500/30' : 'bg-zinc-950 border-zinc-800/80'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div 
                  onClick={() => hasMulti3 && setExpandedPhase3(!expandedPhase3)}
                  className={`flex items-center gap-3 ${hasMulti3 ? 'cursor-pointer select-none group' : ''}`}
                >
                  <span className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 font-extrabold flex items-center justify-center text-xs shrink-0 group-hover:bg-blue-500/20 transition-colors">
                    3
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1">
                        <span>Üretim Hattı Çıktısı</span>
                        {hasMulti3 && (
                          <ChevronDown size={16} className={`text-blue-400 transition-transform duration-200 ${expandedPhase3 ? 'rotate-180' : ''}`} />
                        )}
                      </h3>
                      {o.phase3FileUrl ? (
                        <span className="bg-blue-500/10 text-blue-400 font-bold px-2 py-0.5 rounded text-[10px]">Yüklendi</span>
                      ) : (
                        <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">Bekliyor</span>
                      )}
                      {hasMulti3 && (
                        <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">+{files3.length - 1} Dosya</span>
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

              {/* Collapsible Subfiles Drawer */}
              {hasMulti3 && expandedPhase3 && (
                <div className="mt-4 pt-3 border-t border-blue-500/10 animate-in fade-in slide-in-from-top-2 duration-200">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase mb-2 tracking-wider">Gruptaki Tüm Çıktı Dosyaları</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                    {files3.map((fItem: any) => {
                      const fn = typeof fItem === 'string' ? fItem : fItem?.name;
                      if (!fn) return null;
                      const subUrl = fn === o.phase3FileName ? o.phase3FileUrl : `/b2b-uploads/local/${encodeURIComponent(fn)}`;
                      return (
                        <div key={fn} className="flex items-center justify-between p-2 rounded-xl bg-zinc-900 border border-zinc-800/80 hover:border-blue-500/20 transition-colors">
                          <span className="text-xs font-mono text-zinc-300 truncate mr-2" title={fn}>📱 {fn}</span>
                          <button
                            onClick={() => handleOpenPreview(subUrl, fn)}
                            className="text-[10px] bg-zinc-800 hover:bg-blue-500/10 text-zinc-400 hover:text-blue-400 font-bold px-2 py-1 rounded-lg transition-colors shrink-0 flex items-center gap-1"
                          >
                            <Eye size={12} /> Önizle
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 4. Aşama: Nihai Koli Raporu */}
        {(() => {
          const files4 = safeJsonParse(o.phase4AllFiles);
          const hasMulti4 = files4.length > 1;
          return (
            <div className={`p-5 rounded-2xl border transition-all ${o.phase4FileUrl ? 'bg-zinc-950/60 border-indigo-500/30' : 'bg-gradient-to-r from-zinc-950 via-indigo-950/20 to-zinc-950 border-indigo-500/40'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div 
                  onClick={() => hasMulti4 && setExpandedPhase4(!expandedPhase4)}
                  className={`flex items-center gap-3 ${hasMulti4 ? 'cursor-pointer select-none group' : ''}`}
                >
                  <span className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 font-extrabold flex items-center justify-center text-xs shrink-0 group-hover:bg-indigo-500/20 transition-colors">
                    4
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors flex items-center gap-1">
                        <span>Nihai SSCC Koli Atama Raporu</span>
                        {hasMulti4 && (
                          <ChevronDown size={16} className={`text-indigo-400 transition-transform duration-200 ${expandedPhase4 ? 'rotate-180' : ''}`} />
                        )}
                      </h3>
                      {o.phase4FileUrl ? (
                        <span className="bg-indigo-500/10 text-indigo-400 font-bold px-2 py-0.5 rounded text-[10px]">Tamamlandı</span>
                      ) : (
                        <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">Bekliyor</span>
                      )}
                      {hasMulti4 && (
                        <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">+{files4.length - 1} Rapor</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">Her 30 üründe bir ardışık SSCC koli kodlarının atandığı tam rapor</p>
                  </div>
                </div>

                {o.phase4FileUrl ? (
                  <div className="flex flex-col gap-3 self-stretch sm:self-auto min-w-[240px]">
                    <div className="flex items-center gap-2 justify-end shrink-0">
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

                    <button
                      onClick={handleSendMail}
                      disabled={sendingMail}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border shadow-lg ${
                        mailSuccess 
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20'
                      }`}
                    >
                      {sendingMail ? <Loader2 size={14} className="animate-spin" /> : mailSuccess ? <CheckCircle2 size={14} /> : <Upload size={14} />}
                      <span>{mailSuccess ? 'Rapor Başarıyla Mail Gönderildi' : 'Raporu Mail Olarak Gönder'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 w-full sm:w-auto">
                    {/* Reconcile Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Active Sequence Tracker Indicator */}
                      <div className="flex items-center gap-2.5 p-2 bg-zinc-900 border border-zinc-800 rounded-xl">
                        <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-500">
                          <Hash size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold leading-none">Sıradaki Koli</p>
                          <p className="text-[11px] font-mono font-semibold text-amber-400 mt-0.5 truncate">
                            {activeSSCC || '...'}
                          </p>
                        </div>
                      </div>

                      {/* Target Count Input */}
                      <div className="flex items-center gap-2 px-3 bg-zinc-900 border border-zinc-800 rounded-xl focus-within:border-indigo-500/50 transition-colors">
                        <Sparkles size={14} className="text-indigo-400" />
                        <input
                          type="number"
                          value={reconcileTargetCount || ''}
                          onChange={(e) => setReconcileTargetCount(parseInt(e.target.value) || 0)}
                          placeholder="Hedef Adet"
                          className="bg-transparent border-0 w-full py-2 text-xs text-white outline-none placeholder:text-zinc-600"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handlePhase4Finalize}
                      disabled={processingPhase === 4 || !o.phase1FileUrl || !reconcileTargetCount}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-30 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-900/20"
                    >
                      {processingPhase === 4 ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      <span>Eksikleri Tamamla & Raporu Üret</span>
                    </button>

                    <div className="flex items-center gap-3 pt-2 border-t border-indigo-500/10">
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="file"
                          accept=".xlsx,.csv"
                          onChange={e => setPhase4ManualFile(e.target.files?.[0] || null)}
                          className="text-[10px] text-zinc-500 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-zinc-800 file:text-zinc-400 hover:file:bg-zinc-700 w-full"
                        />
                        <button
                          onClick={handlePhase4ManualSubmit}
                          disabled={!phase4ManualFile || processingPhase === 4}
                          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 font-bold px-3 py-1.5 rounded-xl text-[10px] transition-all border border-zinc-700 shrink-0"
                        >
                          Hazır Rapor Yükle
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Subfiles Drawer */}
              {hasMulti4 && expandedPhase4 && (
                <div className="mt-4 pt-3 border-t border-indigo-500/10 animate-in fade-in slide-in-from-top-2 duration-200">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase mb-2 tracking-wider">Gruptaki Tüm Atanmış Raporlar</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                    {files4.map((fItem: any) => {
                      const fn = typeof fItem === 'string' ? fItem : fItem?.name;
                      if (!fn) return null;
                      const subUrl = fn === o.phase4FileName ? o.phase4FileUrl : o.phase4FileUrl; 
                      return (
                        <div key={fn} className="flex items-center justify-between p-2 rounded-xl bg-zinc-900 border border-zinc-800/80 hover:border-indigo-500/20 transition-colors">
                          <span className="text-xs font-mono text-zinc-300 truncate mr-2" title={fn}>📦 {fn}</span>
                          <button
                            onClick={() => handleOpenPreview(subUrl, fn)}
                            className="text-[10px] bg-zinc-800 hover:bg-indigo-500/10 text-zinc-400 hover:text-indigo-400 font-bold px-2 py-1 rounded-lg transition-colors shrink-0 flex items-center gap-1"
                          >
                            <Eye size={12} /> Önizle
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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
