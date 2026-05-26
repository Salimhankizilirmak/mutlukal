/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Briefcase, Building2, Plus, ArrowLeft, FolderKanban, CheckCircle2, AlertCircle, Loader2, Upload, X, ChevronDown, ChevronRight, FileText, Trash2, Tag, Eye } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { getPartners, createPartner, getBrands, createBrand, getMonthlyMasterList, saveMonthlyMasterList, deleteMonthFromList, getB2BClients, getB2BOrdersByClient, createImportedOrderBatchClient, deleteOrder, deleteAllOrders } from '../../actions';

export default function B2BClientDetailPage({ params }: { params: { clientId: string } }) {
  const [clientName, setClientName] = useState('Yükleniyor...');
  const [partners, setPartners] = useState<Array<any>>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [brands, setBrands] = useState<Array<any>>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [orders, setOrders] = useState<Array<any>>([]);

  // Monthly Master Configuration States
  const [monthlyMasterList, setMonthlyMasterList] = useState<any>({ months: [] });
  const [selectedMonthId, setSelectedMonthId] = useState<string>('');
  const [expandedVehicles, setExpandedVehicles] = useState<Record<string, boolean>>({});

  // Modals / State
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  
  // Historical Bulk Import State
  const [importingBatch, setImportingBatch] = useState(false);
  const [batchSuccess, setBatchSuccess] = useState('');
  const [clientScanProgress, setClientScanProgress] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Find client info
      const clientsList = await getB2BClients();
      const currentClient = clientsList.find(c => c.id === params.clientId);
      if (currentClient) {
        setClientName(currentClient.name);
      } else {
        setClientName('Bilinmeyen Müşteri');
      }

      const pList = await getPartners();
      setPartners(pList);
      if (pList.length > 0) {
        setSelectedPartnerId(pList[0].id);
        const bList = await getBrands(pList[0].id);
        setBrands(bList);
        if (bList.length > 0) setSelectedBrandId(bList[0].id);
      }

      // Fetch client orders
      const oList = await getB2BOrdersByClient(params.clientId);
      setOrders(oList);

      // Load monthly master configuration
      const mData = await getMonthlyMasterList();
      setMonthlyMasterList(mData || { months: [] });
      if (mData?.months && mData.months.length > 0) {
        setSelectedMonthId(prev => prev || (mData.months.find((m: any) => m.isCurrent) || mData.months[mData.months.length - 1])?.monthId || '');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [params.clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteSingleOrder = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Bu sipariş iş akışını tamamen silmek istediğinize emin misiniz?')) {
      try {
        await deleteOrder(id);
        await loadData();
      } catch (err: any) {
        alert(err.message || 'Silinemedi');
      }
    }
  };

  const handleDeleteMonth = async (monthId: string) => {
    if (!window.confirm('Bu ayı ve bu aya ait TÜM araç dosyalarını silmek istediğinize emin misiniz?')) return;
    setLoading(true);
    try {
      await deleteMonthFromList(monthId);
      const mList = await getMonthlyMasterList();
      setMonthlyMasterList(mList);
      if (selectedMonthId === monthId) setSelectedMonthId('');
      const oList = await getB2BOrdersByClient(params.clientId);
      setOrders(oList);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadToCloud = async (file: File, requestedFilename: string) => {
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

  const handleMonthlyExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPartnerId) return;

    setImportingBatch(true);
    setError('');
    setBatchSuccess('');
    setClientScanProgress(`${file.name} ayrıştırılıyor, aylık araç ve sipariş haritası çıkarılıyor...`);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      
      const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('sayfa1') || s.toLowerCase().includes('sheet1')) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      let lastVehicle = '';
      let lastProdDate = '';
      let lastSktDate = '';
      let lastLoadingDate = '';
      let lastBatchNo = '';

      const items: any[] = [];

      const parseExcelDate = (val: any) => {
        if (!val) return '';
        if (typeof val === 'number') {
          const d = new Date((val - 25569) * 86400 * 1000);
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          return `${dd}.${mm}.${yyyy}`;
        }
        return String(val).trim();
      };

      for (const row of rows) {
        if (!row || row.length < 2) continue;
        const rawVehicle = row[0] ? String(row[0]).trim() : '';
        const rawOrder = row[1] ? String(row[1]).trim() : '';

        if (rawVehicle.toLowerCase().includes('order') || rawOrder.toLowerCase().includes('number')) continue;
        if (!rawOrder) continue;

        if (rawVehicle && rawVehicle.startsWith('KB-')) {
          lastVehicle = rawVehicle;
        }

        const pDate = parseExcelDate(row[14]);
        if (pDate) lastProdDate = pDate;

        const sDate = parseExcelDate(row[15]);
        if (sDate) lastSktDate = sDate;

        const lDate = parseExcelDate(row[5]);
        if (lDate) lastLoadingDate = lDate;

        const bNo = (row[7] ? String(row[7]).trim() : '') || (row[14] ? String(row[14]).trim() : '');
        if (bNo && bNo.includes('-')) lastBatchNo = bNo;

        items.push({
          vehicleCode: lastVehicle || rawVehicle,
          orderCode: rawOrder,
          pallets: Number(row[2]) || 0,
          boxes: Number(row[3]) || 0,
          pcs: Number(row[4]) || 0,
          loadingDate: lDate || lastLoadingDate,
          productionDate: pDate || lastProdDate,
          sktDate: sDate || lastSktDate,
          batchNo: bNo || lastBatchNo,
          destination: row[6] ? String(row[6]).trim() : '',
          englishName: "Mutlukal Wheat Tortilla"
        });
      }

      let monthTitle = "Mayıs 2026";
      const upperName = file.name.toUpperCase();
      if (upperName.includes('MAYIS')) monthTitle = "Mayıs 2026";
      else if (upperName.includes('HAZİRAN') || upperName.includes('HAZIRAN')) monthTitle = "Haziran 2026";
      else if (upperName.includes('NİSAN') || upperName.includes('NISAN')) monthTitle = "Nisan 2026";
      else if (upperName.includes('TEMMUZ')) monthTitle = "Temmuz 2026";
      else {
        const custom = prompt('Lütfen yüklenen listenin Ay / Yıl başlığını girin:', 'Mayıs 2026');
        if (custom) monthTitle = custom.trim();
      }

      const monthId = monthTitle.toLowerCase().replace(/\s+/g, '-');

      const updatedMonths = [...(monthlyMasterList?.months || [])];
      const existingIdx = updatedMonths.findIndex((m: any) => m.monthId === monthId);

      const newMonthObj = {
        monthId,
        monthTitle,
        partnerId: selectedPartnerId,
        isCurrent: true,
        items
      };

      updatedMonths.forEach((m: any) => { m.isCurrent = false; });

      if (existingIdx >= 0) {
        updatedMonths[existingIdx] = newMonthObj;
      } else {
        updatedMonths.push(newMonthObj);
      }

      await saveMonthlyMasterList({ months: updatedMonths });
      await loadData();
      setSelectedMonthId(monthId);
      setBatchSuccess(`✔ Harika! ${monthTitle} listesi başarıyla ayrıştırıldı. Toplam ${items.length} iş emri araçlara atandı.`);
    } catch (err: any) {
      setError(err.message || 'Excel dosyası ayrıştırılamadı.');
    } finally {
      setImportingBatch(false);
      setClientScanProgress('');
      e.target.value = '';
    }
  };

  const handleSingleAutoJobUpload = async (file: File, presetVehicle?: string) => {
    if (!selectedPartnerId) return alert('Lütfen önce bir Partner Firma tanımlayın.');
    
    setImportingBatch(true);
    setError('');
    setBatchSuccess('');
    setClientScanProgress(`${file.name} yükleniyor, otomatik araç tespiti ve iş dosyası açılışı yapılıyor...`);

    try {
      const orderCode = file.name.split(',')[0].trim();
      const curMonth = monthlyMasterList?.months?.find((m: any) => m.monthId === selectedMonthId);
      let vehicleCode = presetVehicle || '';

      if (!vehicleCode && curMonth?.items) {
        const found = curMonth.items.find((it: any) => it.orderCode.toLowerCase() === orderCode.toLowerCase());
        if (found?.vehicleCode) {
          vehicleCode = found.vehicleCode;
        }
      }

      if (!vehicleCode) {
        const manual = prompt(`"${orderCode}" için araç kodu otomatik bulunamadı. Lütfen araç kodunu (örn: KB-006123) girin:`, 'KB-006123');
        if (!manual) throw new Error('Araç kodu belirtilmediği için işlem iptal edildi.');
        vehicleCode = manual.trim();
      }

      const uploadedUrl = await uploadToCloud(file, file.name);

      await createImportedOrderBatchClient({
        partnerId: selectedPartnerId,
        brandId: selectedBrandId || undefined,
        orderName: vehicleCode,
        clientId: params.clientId,
        phase1FileUrl: uploadedUrl,
        phase1FileName: file.name,
        phase1AllFiles: JSON.stringify([file.name]),
      });

      await loadData();
      setBatchSuccess(`✔ İş Dosyası Başarıyla Açıldı! "${orderCode}" siparişi otomatik olarak "${vehicleCode}" aracına bağlandı.`);
    } catch (err: any) {
      setError(err.message || 'İş dosyası açılırken hata oluştu.');
    } finally {
      setImportingBatch(false);
      setClientScanProgress('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  const curMonth = monthlyMasterList?.months?.find((m: any) => m.monthId === selectedMonthId);
  const vehiclesMap: Record<string, any[]> = {};
  if (curMonth?.items) {
    curMonth.items.forEach((item: any) => {
      if (!vehiclesMap[item.vehicleCode]) vehiclesMap[item.vehicleCode] = [];
      vehiclesMap[item.vehicleCode].push(item);
    });
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto px-4 py-8">
      {/* Top Navigation */}
      <div>
        <Link href="/dashboard/b2b" className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-indigo-400 transition-colors bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
          <ArrowLeft size={14} /> Müşterilere Dön
        </Link>
      </div>

      {/* Hero Title */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-indigo-950/20 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
        <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold tracking-wider text-indigo-400 uppercase">
          MÜŞTERİ HATLARI SİPARİŞ YÖNETİMİ
        </span>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mt-2 uppercase">
          {clientName} SİPARİŞ YÖNETİMİ
        </h1>
        <p className="text-xs text-zinc-500 mt-1.5">
          Bu panel üzerinden firmanın aylık sipariş şablonlarını yükleyebilir, ajanların atamalarını ve raporlarını takip edebilirsiniz.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl text-xs font-bold animate-in fade-in duration-200">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {batchSuccess && (
        <div className="flex items-center gap-2 p-4 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl text-xs font-bold animate-in fade-in duration-200">
          <CheckCircle2 size={16} />
          <span>{batchSuccess}</span>
        </div>
      )}

      {/* Plan Yükleme & Yönetim Kartı */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-transparent to-transparent pointer-events-none"></div>
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4 mb-6">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="text-purple-400" size={16} /> Aylık Ana Plan & Araç Dağılımları
            </h2>
            <p className="text-[11px] text-zinc-500 mt-1">Yüklenen Excel listesindeki araçlar ve içerdiği siparişler</p>
          </div>
          
          {/* Plan Yükleme Form (Accepts CSV/Excel and contains hidden clientId) */}
          <div className="flex items-center gap-2">
            <form className="relative flex items-center gap-2">
              <input type="hidden" name="clientId" value={params.clientId} />
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleMonthlyExcelUpload}
                disabled={importingBatch}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <button
                type="button"
                disabled={importingBatch}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg shadow-indigo-900/20 shrink-0"
              >
                {importingBatch ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                <span>Yeni Aylık Plan Yükle (.xlsx/.csv)</span>
              </button>
            </form>
          </div>
        </div>

        {/* Partner Select if empty config */}
        {partners.length > 0 && !selectedPartnerId && (
          <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl mb-4 text-xs text-zinc-400">
            Lütfen plan yüklemek için önce aktif bir partner seçin.
          </div>
        )}

        {/* Aktif Ay Seçimi */}
        {monthlyMasterList?.months?.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-4">
            {monthlyMasterList.months.map((m: any) => (
              <div key={m.monthId} className="flex items-center shrink-0">
                <button
                  onClick={() => setSelectedMonthId(m.monthId)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${selectedMonthId === m.monthId ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-950/40' : 'bg-zinc-900/50 text-zinc-400 border-zinc-850 hover:border-zinc-700'}`}
                >
                  {m.monthTitle} ({m.items?.length || 0} Sipariş)
                </button>
                <button
                  onClick={() => handleDeleteMonth(m.monthId)}
                  className="p-2 text-zinc-600 hover:text-red-400 transition-colors ml-0.5"
                  title="Ayı ve planı sil"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {clientScanProgress && (
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-2 text-[11px] font-medium text-amber-400 mb-4">
            <Loader2 className="animate-spin" size={14} />
            <span>{clientScanProgress}</span>
          </div>
        )}

        {/* Master List Araç Dağılımları */}
        {Object.keys(vehiclesMap).length === 0 ? (
          <div className="p-12 text-center text-zinc-600 text-xs italic border border-zinc-850 border-dashed rounded-2xl bg-zinc-900/10">
            Henüz bu müşteri için yüklenmiş aktif bir plan bulunmuyor.
          </div>
        ) : (
          <div className="space-y-3">
            {Object.keys(vehiclesMap).map(vCode => {
              const vItems = vehiclesMap[vCode];
              const isExpanded = !!expandedVehicles[vCode];

              // Bu araca ait aktif bir sipariş kaydı var mı kontrol et
              const hasOrderCreated = vItems.some(item => {
                return orders.some(o => {
                  const matchV = o.orderName === vCode || o.orderName?.includes(item.orderCode);
                  const matchC = o.phase1Note === item.orderCode || 
                    (o.phase1FileName && o.phase1FileName.toLowerCase().startsWith(item.orderCode.toLowerCase()));
                  return matchV && matchC;
                });
              });

              return (
                <div key={vCode} className="border border-zinc-800/80 rounded-2xl overflow-hidden bg-zinc-900/20">
                  {/* Araç Başlığı */}
                  <div
                    onClick={() => setExpandedVehicles(prev => ({ ...prev, [vCode]: !prev[vCode] }))}
                    className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-zinc-900/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-xs shrink-0">
                        🚛
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{vCode}</h4>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{vItems.length} sipariş kalemi içeriyor</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {hasOrderCreated ? (
                        <span className="bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded text-[9px] border border-emerald-500/20">
                          Aktif Akış Var
                        </span>
                      ) : (
                        <span className="bg-zinc-900 text-zinc-500 font-bold px-2 py-0.5 rounded text-[9px] border border-zinc-800">
                          Beklemede
                        </span>
                      )}
                      <div className="text-zinc-500">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Alt Siparişler Listesi */}
                  {isExpanded && (
                    <div className="p-4 bg-zinc-950/40 border-t border-zinc-850 space-y-3">
                      {vItems.map((item: any, idx: number) => {
                        const dbRecordObj = orders.find(o => {
                          const matchV = o.orderName === vCode || o.orderName?.includes(item.orderCode);
                          const matchC = o.phase1Note === item.orderCode || 
                            (o.phase1FileName && o.phase1FileName.toLowerCase().startsWith(item.orderCode.toLowerCase()));
                          return matchV && matchC;
                        });

                        const isFullyDone = dbRecordObj && (dbRecordObj.status === 'completed' || !!dbRecordObj.phase4FileUrl);

                        return (
                          <div
                            key={item.orderCode || idx}
                            className={`p-3.5 rounded-xl border transition-all ${dbRecordObj ? (isFullyDone ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-zinc-900/80 border-indigo-500/40 shadow-lg shadow-indigo-950/20') : 'bg-zinc-950/90 border-zinc-900 border-dashed hover:border-zinc-700'}`}
                          >
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded-lg border border-indigo-500/20">
                                    🔑 {item?.orderCode || 'Bilinmiyor'}
                                  </span>
                                  {dbRecordObj ? (
                                    isFullyDone ? (
                                      <span className="bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded text-[10px]">
                                        ✓ İşlem Bitti
                                      </span>
                                    ) : (
                                      <span className="bg-amber-500/10 text-amber-400 font-bold px-2 py-0.5 rounded text-[10px] animate-pulse">
                                        ⏳ İşlemde
                                      </span>
                                    )
                                  ) : (
                                    <span className="bg-zinc-900 text-zinc-500 font-bold px-2 py-0.5 rounded text-[10px]">
                                      📥 Dosya Bekliyor
                                    </span>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-3 text-[11px] text-zinc-400 pt-0.5 flex-wrap">
                                  <span>Hedef: <strong className="text-zinc-200">{item.pcs} adet</strong></span>
                                  <span>•</span>
                                  <span>Koli: <strong className="text-zinc-200">{item.boxes}</strong></span>
                                  <span>•</span>
                                  <span>Palet: <strong className="text-zinc-200">{item.pallets}</strong></span>
                                  {item.productionDate && (
                                    <>
                                      <span>•</span>
                                      <span className="text-zinc-500">Üretim/SKT: <strong className="text-zinc-300">{item.productionDate} - {item.sktDate}</strong></span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                                {dbRecordObj ? (
                                  <>
                                    <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded-xl border border-zinc-800 text-[10px]">
                                      <span className={dbRecordObj.phase1FileUrl ? 'text-emerald-400 font-bold' : 'text-zinc-600'} title="Aşama 1">1️⃣</span>
                                      <span className={dbRecordObj.phase2FileUrl ? 'text-purple-400 font-bold' : 'text-zinc-600'} title="Aşama 2">2️⃣</span>
                                      <span className={dbRecordObj.phase3FileUrl ? 'text-blue-400 font-bold' : 'text-zinc-600'} title="Aşama 3">3️⃣</span>
                                      <span className={dbRecordObj.phase4FileUrl ? 'text-indigo-400 font-bold' : 'text-zinc-600'} title="Aşama 4">4️⃣</span>
                                    </div>

                                    <button
                                      onClick={(e) => handleDeleteSingleOrder(e, dbRecordObj.id)}
                                      className="p-2 text-zinc-600 hover:text-rose-400 rounded-lg transition-colors"
                                      title="Bu işin dosyasını kaldır"
                                    >
                                      <X size={14} />
                                    </button>

                                    <Link
                                      href={`/dashboard/b2b/${dbRecordObj.id}`}
                                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-black px-4 py-2 rounded-xl text-xs transition-all flex items-center gap-1 shadow-md"
                                    >
                                      <span>👉 Detay Aşamaları</span>
                                    </Link>
                                  </>
                                ) : (
                                  <div className="relative">
                                    <input
                                      type="file"
                                      accept=".csv"
                                      onChange={(e) => {
                                        if (e.target.files?.[0]) handleSingleAutoJobUpload(e.target.files[0], vCode);
                                        e.target.value = '';
                                      }}
                                      disabled={importingBatch}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="flex items-center gap-1.5 bg-zinc-900 hover:bg-indigo-600 text-zinc-400 hover:text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-all border border-zinc-800">
                                      <Upload size={12} />
                                      <span>Dosyayı Yükle & Başlat</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
