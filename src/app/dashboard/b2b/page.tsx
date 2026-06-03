/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Building2, Plus, ArrowRight, Loader2, AlertCircle, 
  Upload, CheckCircle2, ChevronDown, ChevronRight, X, 
  FileText, Trash2, Smartphone, RefreshCw, Layers 
} from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { 
  getMonthlyMasterList, saveMonthlyMasterList, deleteMonthFromList,
  getPartners, getOrders, deleteOrder, syncPartnersAndClientsFromExcel,
  loadLocalPlanIfExists, createImportedOrderBatchClient 
} from './actions';

export default function B2BDashboardPage() {
  // Master lists
  const [monthlyMasterList, setMonthlyMasterList] = useState<any>({ months: [] });
  const [selectedMonthId, setSelectedMonthId] = useState<string>('');
  const [orders, setOrders] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);

  // Expanded status maps
  const [expandedFirms, setExpandedFirms] = useState<Record<string, boolean>>({});
  const [expandedVehicles, setExpandedVehicles] = useState<Record<string, boolean>>({});

  // Loading & Action States
  const [loading, setLoading] = useState(true);
  const [syncingLocal, setSyncingLocal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [clientScanProgress, setClientScanProgress] = useState('');

  // Fetch all state
  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const mList = await getMonthlyMasterList();
      setMonthlyMasterList(mList || { months: [] });
      if (mList?.months && mList.months.length > 0) {
        setSelectedMonthId(prev => prev || (mList.months.find((m: any) => m.isCurrent) || mList.months[mList.months.length - 1])?.monthId || '');
      }

      const pList = await getPartners();
      setPartners(pList);

      const oList = await getOrders();
      // Extract just the order property from each joined row
      setOrders(oList.map(r => r.order));
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenemedi.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  // Auto sync on mount
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      // Attempt to load from public/ONAYSIZ/yeniisemri.xlsx if it exists
      try {
        await loadLocalPlanIfExists();
      } catch (e) {
        console.warn('Auto local plan sync bypassed:', e);
      }
      await loadData(false);
      setLoading(false);
    };
    init();
  }, [loadData]);

  // Run manually local sync
  const handleReloadLocal = async () => {
    setSyncingLocal(true);
    setError('');
    setSuccess('');
    try {
      const res = await loadLocalPlanIfExists();
      if (res.success) {
        setSuccess(`✔ Yerel iş emri dosyası (yeniisemri.xlsx) başarıyla senkronize edildi. ${res.count} adet iş emri güncellendi.`);
        await loadData(false);
      } else {
        setError(res.message || 'Dosya senkronize edilemedi.');
      }
    } catch (err: any) {
      setError(err.message || 'Hata oluştu.');
    } finally {
      setSyncingLocal(false);
    }
  };

  // Upload master xlsx manually from web UI
  const handleMonthlyExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError('');
    setSuccess('');
    setClientScanProgress(`Ayrıştırılıyor ve firmalar senkronize ediliyor...`);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      
      const sheetName = wb.SheetNames.find(s => s.toLowerCase().includes('sayfa1') || s.toLowerCase().includes('sheet1')) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      let currentMachine = 'DİĞER';
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

      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        if (!row || row.length === 0) continue;

        const firstCell = row[0] ? String(row[0]).trim() : '';

        if (firstCell.toUpperCase().startsWith('MAKİNE')) {
          currentMachine = firstCell;
          continue;
        }

        if (firstCell.toUpperCase() === 'SIRA' || firstCell.toUpperCase() === 'MUTLUKAL İŞ EMRİ' || !row[1]) {
          continue;
        }

        const firma = row[1] ? String(row[1]).trim() : '';
        if (!firma) continue;

        const vehicleCode = (row[5] ? String(row[5]).trim() : '') || (row[3] ? String(row[3]).trim() : '') || 'DİĞER';
        const orderCode = (row[6] ? String(row[6]).trim() : '') || vehicleCode;
        const gtin = row[2] ? String(row[2]).trim() : '';
        const productName = row[4] ? String(row[4]).trim() : '';
        const boxes = Number(row[10]) || 0;
        const pallets = Number(row[12]) || 0;
        const pcs = Number(row[15]) || 0;
        const prodDate = parseExcelDate(row[23]);
        const expDate = parseExcelDate(row[24]);
        const batchNo = row[25] ? String(row[25]).trim() : '';
        const destination = row[21] ? String(row[21]).trim() : '';

        items.push({
          machine: currentMachine,
          firma,
          gtin,
          vehicleCode,
          orderCode,
          productName,
          boxes,
          pallets,
          pcs,
          productionDate: prodDate,
          sktDate: expDate,
          batchNo,
          destination,
          englishName: productName,
          rawRowIndex: idx
        });
      }

      if (items.length === 0) {
        throw new Error('Dosyada geçerli iş emri kaydı bulunamadı.');
      }

      // Sync unique firms in DB
      const uniqueFirms = [...new Set(items.map(it => it.firma))];
      await syncPartnersAndClientsFromExcel(uniqueFirms);

      const monthTitle = "Aktif İş Emri Listesi";
      const monthId = "aktif-is-emri-listesi";

      const updatedMonths = [...(monthlyMasterList?.months || [])];
      const existingIdx = updatedMonths.findIndex((m: any) => m.monthId === monthId);

      const newMonthObj = {
        monthId,
        monthTitle,
        partnerId: 'web-upload',
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
      await loadData(false);
      setSelectedMonthId(monthId);
      setSuccess(`✔ Plan başarıyla yüklendi! Toplam ${items.length} iş emri firmalara göre gruplandı.`);
    } catch (err: any) {
      setError(err.message || 'Excel yüklenemedi.');
    } finally {
      setImporting(false);
      setClientScanProgress('');
      e.target.value = '';
    }
  };

  // Upload single CSV helper
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
      throw new Error(`Dosya buluta yüklenemedi (HTTP ${uploadRes.status}).`);
    }

    return publicUrl;
  };

  // Single CSV Order creation
  const handleSingleAutoJobUpload = async (file: File, item: any) => {
    setImporting(true);
    setError('');
    setSuccess('');
    setClientScanProgress(`"${file.name}" dosyası yükleniyor ve iş emri başlatılıyor...`);

    try {
      // Automatic sync partner/client first
      const syncMap = await syncPartnersAndClientsFromExcel([item.firma]);
      const mapped = syncMap[item.firma];
      if (!mapped) throw new Error('Firma veritabanı eşleşmesi yapılamadı.');

      const uploadedUrl = await uploadToCloud(file, file.name);

      await createImportedOrderBatchClient({
        partnerId: mapped.partnerId,
        orderName: item.vehicleCode,
        clientId: mapped.clientId,
        phase1FileUrl: uploadedUrl,
        phase1FileName: file.name,
        phase1AllFiles: JSON.stringify([file.name]),
      });

      await loadData(false);
      setSuccess(`✔ "${item.orderCode}" sipariş akışı başarıyla başlatıldı!`);
    } catch (err: any) {
      setError(err.message || 'Sipariş başlatılırken hata oluştu.');
    } finally {
      setImporting(false);
      setClientScanProgress('');
    }
  };

  const handleDeleteSingleOrder = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Bu sipariş akışını tamamen silmek istediğinize emin misiniz?')) {
      try {
        await deleteOrder(id);
        await loadData(false);
        setSuccess('Sipariş akışı silindi.');
      } catch (err: any) {
        setError(err.message || 'Silinemedi');
      }
    }
  };

  const handleDeleteMonth = async (monthId: string) => {
    if (!window.confirm('Bu planı ve plana bağlı tüm verileri kaldırmak istediğinize emin misiniz?')) return;
    setLoading(true);
    try {
      await deleteMonthFromList(monthId);
      await loadData(false);
      setSelectedMonthId('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Get curated colored CSS theme maps for each firm
  const getFirmColorClass = (firmaName: string) => {
    const name = firmaName.toUpperCase();
    if (name.includes('TRİTON') || name.includes('TRITON')) {
      return {
        bg: 'from-blue-600/10 to-indigo-950/20 border-blue-500/20 hover:border-blue-500/40',
        text: 'text-blue-400',
        accent: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
        glow: 'bg-blue-500/5'
      };
    }
    if (name.includes('GERMES')) {
      return {
        bg: 'from-emerald-600/10 to-emerald-950/20 border-emerald-500/20 hover:border-emerald-500/40',
        text: 'text-emerald-400',
        accent: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
        glow: 'bg-emerald-500/5'
      };
    }
    if (name.includes('KOTOR')) {
      return {
        bg: 'from-amber-600/10 to-amber-950/20 border-amber-500/20 hover:border-amber-500/40',
        text: 'text-amber-400',
        accent: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
        glow: 'bg-amber-500/5'
      };
    }
    if (name.includes('MAGNİT') || name.includes('MAGNIT')) {
      return {
        bg: 'from-rose-600/10 to-rose-950/20 border-rose-500/20 hover:border-rose-500/40',
        text: 'text-rose-400',
        accent: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
        glow: 'bg-rose-500/5'
      };
    }
    if (name.includes('SMART') || name.includes('SAMAKAT')) {
      return {
        bg: 'from-purple-600/10 to-purple-950/20 border-purple-500/20 hover:border-purple-500/40',
        text: 'text-purple-400',
        accent: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
        glow: 'bg-purple-500/5'
      };
    }
    if (name.includes('MAYDONOZ')) {
      return {
        bg: 'from-lime-600/10 to-lime-950/20 border-lime-500/20 hover:border-lime-500/40',
        text: 'text-lime-400',
        accent: 'bg-lime-500/10 text-lime-300 border-lime-500/20',
        glow: 'bg-lime-500/5'
      };
    }
    if (name.includes('SULTANOĞLU') || name.includes('SULTANOGLU')) {
      return {
        bg: 'from-cyan-600/10 to-cyan-950/20 border-cyan-500/20 hover:border-cyan-500/40',
        text: 'text-cyan-400',
        accent: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
        glow: 'bg-cyan-500/5'
      };
    }
    return {
      bg: 'from-zinc-800/10 to-zinc-950/20 border-zinc-800 hover:border-zinc-700',
      text: 'text-zinc-400',
      accent: 'bg-zinc-800/50 text-zinc-300 border-zinc-700/50',
      glow: 'bg-zinc-500/2'
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  // Parse active months items
  const curMonth = monthlyMasterList?.months?.find((m: any) => m.monthId === selectedMonthId);
  const firmsMap: Record<string, Record<string, any[]>> = {};

  if (curMonth?.items) {
    curMonth.items.forEach((item: any) => {
      if (!firmsMap[item.firma]) firmsMap[item.firma] = {};
      if (!firmsMap[item.firma][item.vehicleCode]) firmsMap[item.firma][item.vehicleCode] = [];
      firmsMap[item.firma][item.vehicleCode].push(item);
    });
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto px-4 py-8">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-indigo-950/30 p-6 sm:p-8 border border-zinc-800 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/20 text-white shrink-0">
            <Building2 size={28} />
          </div>
          <div>
            <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold tracking-wider text-indigo-400 uppercase">
              B2B KONTROL MERKEZİ
            </span>
            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
              Ortak B2B İş Emri Portalı
            </h1>
            <p className="text-xs text-zinc-400 mt-1 max-w-xl">
              Tek bir iş emri üzerinden tüm firmaları, araçları ve sipariş karekod süreçlerini tek sayfada yönetin.
            </p>
          </div>
        </div>
        
        {/* Dynamic Reload Trigger */}
        <button
          onClick={handleReloadLocal}
          disabled={syncingLocal}
          className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-xs font-bold px-4 py-2.5 rounded-xl border border-zinc-800 shrink-0 self-stretch md:self-auto justify-center transition-all"
        >
          <RefreshCw size={14} className={syncingLocal ? 'animate-spin text-amber-400' : ''} />
          <span>Yerelden Yeniden Yükle</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl text-xs font-bold animate-in fade-in duration-200">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl text-xs font-bold animate-in fade-in duration-200">
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* Plan Upload & Select Section */}
      <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-transparent to-transparent pointer-events-none"></div>
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4 mb-4">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="text-purple-400" size={16} /> Aktif İş Emri Şablonu (.xlsx)
            </h2>
            <p className="text-[11px] text-zinc-500 mt-1">Dinamik olarak güncellenebilen ortak iş listesi</p>
          </div>
          
          <div className="flex items-center gap-2">
            <form className="relative flex items-center gap-2">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleMonthlyExcelUpload}
                disabled={importing}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <button
                type="button"
                disabled={importing}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg shadow-indigo-900/20 shrink-0"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                <span>İş Emri Dosyası Yükle</span>
              </button>
            </form>
          </div>
        </div>

        {/* Selected Month Status Tabs */}
        {monthlyMasterList?.months?.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
            {monthlyMasterList.months.map((m: any) => (
              <div key={m.monthId} className="flex items-center shrink-0">
                <button
                  onClick={() => setSelectedMonthId(m.monthId)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${selectedMonthId === m.monthId ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-950/40' : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700'}`}
                >
                  {m.monthTitle} ({m.items?.length || 0} Satır)
                </button>
                <button
                  onClick={() => handleDeleteMonth(m.monthId)}
                  className="p-2 text-zinc-600 hover:text-red-400 transition-colors ml-0.5"
                  title="Planı sil"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {clientScanProgress && (
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-2 text-[11px] font-medium text-amber-400 mt-2">
            <Loader2 className="animate-spin" size={14} />
            <span>{clientScanProgress}</span>
          </div>
        )}
      </div>

      {/* Main Firms & Vehicles Map Dashboard */}
      {Object.keys(firmsMap).length === 0 ? (
        <div className="p-16 text-center text-zinc-500 border border-zinc-800 border-dashed rounded-3xl bg-zinc-900/10">
          <Layers size={48} className="mx-auto text-zinc-700 mb-3" />
          <p className="text-sm font-semibold">Aktif İş Emri Bulunmuyor</p>
          <p className="text-xs text-zinc-650 mt-1 max-w-sm mx-auto">
            Yukarıdaki &quot;İş Emri Dosyası Yükle&quot; butonunu kullanarak yeni şablonu içeri aktarın veya sunucu klasöründen otomatik okutun.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.keys(firmsMap).map(firmaName => {
            const vehicles = firmsMap[firmaName];
            const theme = getFirmColorClass(firmaName);
            const isFirmExpanded = expandedFirms[firmaName] !== false;

            return (
              <div 
                key={firmaName}
                className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${theme.bg} border p-6 transition-all shadow-xl`}
              >
                {/* Decorative glow shape */}
                <div className={`absolute -right-12 -bottom-12 w-32 h-32 ${theme.glow} rounded-full blur-2xl pointer-events-none`}></div>

                {/* Firm Header */}
                <div 
                  onClick={() => setExpandedFirms(prev => ({ ...prev, [firmaName]: !isFirmExpanded }))}
                  className="flex items-center justify-between cursor-pointer select-none mb-4 pb-2 border-b border-zinc-850"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-xl ${theme.accent} shrink-0`}>
                      <Building2 size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-md sm:text-lg font-black text-white uppercase tracking-wide truncate">
                        {firmaName}
                      </h3>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {Object.keys(vehicles).length} araç koordinasyonu
                      </p>
                    </div>
                  </div>
                  <div className="text-zinc-400">
                    {isFirmExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </div>
                </div>

                {/* Expandable Vehicles Grid */}
                {isFirmExpanded && (
                  <div className="grid grid-cols-1 gap-4 pt-1">
                    {Object.keys(vehicles).map(vCode => {
                      const vItems = vehicles[vCode];
                      const isExpanded = !!expandedVehicles[vCode];

                      // Check if there is active DB order
                      const hasOrderCreated = vItems.some(item => {
                        return orders.some(o => {
                          const matchV = o.orderName === vCode || o.orderName?.includes(item.orderCode);
                          const matchC = o.phase1Note === item.orderCode || 
                            (o.phase1FileName && o.phase1FileName.toLowerCase().startsWith(item.orderCode.toLowerCase()));
                          return matchV && matchC;
                        });
                      });

                      return (
                        <div key={vCode} className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-md">
                          {/* Vehicle Header Bar */}
                          <div 
                            onClick={() => setExpandedVehicles(prev => ({ ...prev, [vCode]: !isExpanded }))}
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-900/30 transition-colors select-none"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-md">🚛</span>
                              <div>
                                <h4 className="text-xs font-black text-white tracking-wider font-mono">{vCode}</h4>
                                <p className="text-[9px] text-zinc-500 mt-0.5">{vItems.length} sipariş kalemi yüklenebilir</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              {hasOrderCreated ? (
                                <span className="bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded text-[9px] border border-emerald-500/20">
                                  Aktif Akış Var
                                </span>
                              ) : (
                                <span className="bg-zinc-900 text-zinc-500 font-bold px-2 py-0.5 rounded text-[9px] border border-zinc-800">
                                  Dosya Bekliyor
                                </span>
                              )}
                              <div className="text-zinc-500">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </div>
                            </div>
                          </div>

                          {/* Sub items collapsible list */}
                          {isExpanded && (
                            <div className="p-4 bg-zinc-950 border-t border-zinc-850 space-y-3">
                              {vItems.map((item: any, itemIdx: number) => {
                                const dbRecordObj = orders.find(o => {
                                  const matchV = o.orderName === vCode || o.orderName?.includes(item.orderCode);
                                  const matchC = o.phase1Note === item.orderCode || 
                                    (o.phase1FileName && o.phase1FileName.toLowerCase().startsWith(item.orderCode.toLowerCase()));
                                  return matchV && matchC;
                                });

                                const isFullyDone = dbRecordObj && (dbRecordObj.status === 'completed' || !!dbRecordObj.phase4FileUrl);

                                return (
                                  <div
                                    key={item.orderCode || itemIdx}
                                    className={`p-3.5 rounded-xl border transition-all ${dbRecordObj ? (isFullyDone ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-zinc-900/80 border-indigo-500/30 shadow-lg shadow-indigo-950/10') : 'bg-zinc-950/90 border-zinc-900 border-dashed hover:border-zinc-800'}`}
                                  >
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                      <div className="space-y-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[10px] font-mono font-bold text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded-lg border border-indigo-500/20">
                                            🔑 {item.orderCode}
                                          </span>
                                          <span className="text-[10px] font-bold text-zinc-300 truncate max-w-xs" title={item.productName}>
                                            {item.productName}
                                          </span>
                                          {dbRecordObj ? (
                                            isFullyDone ? (
                                              <span className="bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded text-[9px]">
                                                ✓ İşlem Bitti
                                              </span>
                                            ) : (
                                              <span className="bg-amber-500/10 text-amber-400 font-bold px-2 py-0.5 rounded text-[9px] animate-pulse">
                                                ⏳ İşlemde
                                              </span>
                                            )
                                          ) : (
                                            <span className="bg-zinc-900 text-zinc-500 font-bold px-2 py-0.5 rounded text-[9px]">
                                              Dosya Bekleniyor
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-2.5 text-[10px] text-zinc-400 pt-0.5 flex-wrap">
                                          <span>Hedef: <strong className="text-zinc-200">{item.pcs} adet</strong></span>
                                          <span>•</span>
                                          <span>Koli: <strong className="text-zinc-200">{item.boxes}</strong></span>
                                          <span>•</span>
                                          <span>Makine: <strong className="text-zinc-300">{item.machine}</strong></span>
                                          {item.productionDate && (
                                            <>
                                              <span>•</span>
                                              <span className="text-zinc-500">Üretim/SKT: <strong className="text-zinc-300">{item.productionDate} - {item.sktDate}</strong></span>
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                                        {dbRecordObj ? (
                                          <>
                                            <div className="flex items-center gap-0.5 bg-zinc-950 px-2 py-1 rounded-xl border border-zinc-800 text-[9px]">
                                              <span className={dbRecordObj.phase1FileUrl ? 'text-emerald-400 font-bold' : 'text-zinc-650'} title="Aşama 1">1️⃣</span>
                                              <span className={dbRecordObj.phase2FileUrl ? 'text-purple-400 font-bold' : 'text-zinc-650'} title="Aşama 2">2️⃣</span>
                                              <span className={dbRecordObj.phase3FileUrl ? 'text-blue-400 font-bold' : 'text-zinc-650'} title="Aşama 3">3️⃣</span>
                                              <span className={dbRecordObj.phase4FileUrl ? 'text-indigo-400 font-bold' : 'text-zinc-650'} title="Aşama 4">4️⃣</span>
                                            </div>

                                            <button
                                              onClick={(e) => handleDeleteSingleOrder(e, dbRecordObj.id)}
                                              className="p-1.5 text-zinc-600 hover:text-rose-400 rounded-lg transition-colors"
                                              title="Siparişi kaldır"
                                            >
                                              <X size={14} />
                                            </button>

                                            <Link
                                              href={`/dashboard/b2b/${dbRecordObj.id}`}
                                              className="bg-indigo-650 hover:bg-indigo-600 text-white font-extrabold px-3 py-1.5 rounded-lg text-[11px] transition-all shadow-md"
                                            >
                                              <span>Görüntüle</span>
                                            </Link>
                                          </>
                                        ) : (
                                          <div className="relative">
                                            <input
                                              type="file"
                                              accept=".csv"
                                              onChange={(e) => {
                                                if (e.target.files?.[0]) handleSingleAutoJobUpload(e.target.files[0], item);
                                                e.target.value = '';
                                              }}
                                              disabled={importing}
                                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <div className="flex items-center gap-1 bg-zinc-900 hover:bg-indigo-600 hover:text-white text-zinc-400 font-bold px-3 py-1.5 rounded-lg text-[11px] transition-all border border-zinc-800">
                                              <Upload size={10} />
                                              <span>Başlat</span>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
