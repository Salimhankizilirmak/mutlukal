/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Briefcase, Plus, FolderKanban, CheckCircle2, Clock, AlertCircle, ArrowRight, Layers, Building2, Tag, Loader2, Upload } from 'lucide-react';
import Link from 'next/link';
import { getPartners, createPartner, getBrands, createBrand, getOrders, createOrder, importLocalHistoricalBatch, createImportedOrderBatchClient } from './actions';

export default function B2BDashboardPage() {
  const [partners, setPartners] = useState<Array<any>>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [brands, setBrands] = useState<Array<any>>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [orders, setOrders] = useState<Array<any>>([]);
  
  // Modals / State
  const [loading, setLoading] = useState(true);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [newOrderName, setNewOrderName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  
  // Historical Bulk Import State
  const [historicalPath, setHistoricalPath] = useState('Karekod İşlemleri/5-Triton - Mayıs');
  const [importingBatch, setImportingBatch] = useState(false);
  const [batchSuccess, setBatchSuccess] = useState('');
  const [clientScanProgress, setClientScanProgress] = useState('');

  const handleBulkHistoricalImport = async () => {
    if (!selectedPartnerId || !historicalPath.trim()) return;
    setImportingBatch(true);
    setError('');
    setBatchSuccess('');
    try {
      const count = await importLocalHistoricalBatch(selectedPartnerId, selectedBrandId || undefined, historicalPath.trim());
      await loadData();
      setBatchSuccess(`✔ Harika! Toplam ${count} adet eski klasör/dosya tek tıkla iş akışı olarak içe aktarıldı.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Toplu aktarım başarısız oldu.');
    } finally {
      setImportingBatch(false);
    }
  };

  const uploadFileDirectly = async (file: File, targetName: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', targetName);

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

  const handleClientFolderSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedPartnerId) return;

    setImportingBatch(true);
    setError('');
    setBatchSuccess('');
    setClientScanProgress('Seçilen klasör taranıyor ve dosyalar gruplanıyor...');

    try {
      // Gruplama mantığı: Aşama 1 dosyalarını sipariş alt klasör ismine göre ayır
      const groups: Record<string, { phase1?: File; phase3?: File }> = {};

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const rel = f.webkitRelativePath || '';
        if (!rel.endsWith('.csv') && !rel.endsWith('.xlsx') && !rel.endsWith('.xls')) continue;

        // Path yapısı: Örn. "5-Triton - Mayıs/1-Triton-Mayıs-Firmadan Gelen CSV/ZP8-012074/ZP8-012074.csv"
        const parts = rel.split('/');
        if (parts.length < 3) continue;

        // Dosyanın hemen üstündeki klasör adı sipariş/grup başlığıdır
        const subDirName = parts[parts.length - 2];
        
        // Aşama 1 mi, Aşama 3 mü olduğunu yoldan anla
        const isPhase1 = parts.some(p => p.startsWith('1-'));
        const isPhase3 = parts.some(p => p.startsWith('3-'));

        if (!groups[subDirName]) groups[subDirName] = {};

        if (isPhase1) groups[subDirName].phase1 = f;
        if (isPhase3) groups[subDirName].phase3 = f;
      }

      const orderKeys = Object.keys(groups).filter(k => groups[k].phase1);
      if (orderKeys.length === 0) {
        throw new Error('Seçilen klasörde 1- ile başlayan alt klasörler veya geçerli CSV/Excel dosyası bulunamadı.');
      }

      let successCount = 0;
      for (let idx = 0; idx < orderKeys.length; idx++) {
        const key = orderKeys[idx];
        const g = groups[key];
        if (!g.phase1) continue;

        setClientScanProgress(`Siparişler aktarılıyor (${idx + 1}/${orderKeys.length}): ${key}...`);

        const p1Url = await uploadFileDirectly(g.phase1, g.phase1.name);
        let p3Url: string | null = null;

        if (g.phase3) {
          p3Url = await uploadFileDirectly(g.phase3, g.phase3.name);
        }

        const title = `${key} • ${g.phase1.name.replace(/\.[^/.]+$/, '')}`;

        await createImportedOrderBatchClient({
          partnerId: selectedPartnerId,
          brandId: selectedBrandId || undefined,
          orderName: title.length > 255 ? title.substring(0, 250) : title,
          phase1FileUrl: p1Url,
          phase1FileName: g.phase1.name,
          phase3FileUrl: p3Url,
          phase3FileName: g.phase3 ? g.phase3.name : null,
        });

        successCount++;
      }

      await loadData();
      setBatchSuccess(`✔ Muhteşem! Tarayıcı üzerinden ${successCount} adet sipariş grubu başarıyla buluta yüklendi ve iş akışına eklendi.`);
      // Reset input
      e.target.value = '';
    } catch (err: any) {
      setError(err.message || 'Klasör yüklenirken hata oluştu.');
    } finally {
      setImportingBatch(false);
      setClientScanProgress('');
    }
  };

  const loadBrands = useCallback(async (pId: string) => {
    try {
      const bList = await getBrands(pId);
      setBrands(bList);
      if (bList.length > 0) setSelectedBrandId(bList[0].id);
      else setSelectedBrandId('');
    } catch {
      // ignore
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const pList = await getPartners();
      setPartners(pList);
      const oList = await getOrders();
      setOrders(oList);
      if (pList.length > 0) {
        setSelectedPartnerId(pList[0].id);
        loadBrands(pList[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [loadBrands]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePartnerChange = (pId: string) => {
    setSelectedPartnerId(pId);
    loadBrands(pId);
  };

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartnerName.trim()) return;
    setCreating(true);
    try {
      const p = await createPartner(newPartnerName.trim());
      setPartners([...partners, p]);
      setSelectedPartnerId(p.id);
      setNewPartnerName('');
      setBrands([]);
      setSelectedBrandId('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Firma oluşturulamadı');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName.trim() || !selectedPartnerId) return;
    setCreating(true);
    try {
      const b = await createBrand(selectedPartnerId, newBrandName.trim());
      setBrands([...brands, b]);
      setSelectedBrandId(b.id);
      setNewBrandName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ambalaj oluşturulamadı');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderName.trim() || !selectedPartnerId) return;
    setCreating(true);
    try {
      await createOrder({
        partnerId: selectedPartnerId,
        brandId: selectedBrandId || undefined,
        orderName: newOrderName.trim(),
      });
      const oList = await getOrders();
      setOrders(oList);
      setNewOrderName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sipariş oluşturulamadı');
    } finally {
      setCreating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase"><CheckCircle2 size={12} /> Tamamlandı</span>;
      case 'phase4_pending':
        return <span className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase"><Clock size={12} /> Aşama 4 Bekliyor</span>;
      case 'phase3_pending':
        return <span className="flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase"><Clock size={12} /> Aşama 3 Bekliyor</span>;
      case 'phase2_pending':
        return <span className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase"><Clock size={12} /> Aşama 2 Bekliyor</span>;
      default:
        return <span className="flex items-center gap-1 bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase"><Clock size={12} /> Aşama 1 Bekliyor</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-zinc-950 p-6 sm:p-8 border border-indigo-900/20 shadow-2xl">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/20 text-white shrink-0">
            <Briefcase size={28} />
          </div>
          <div>
            <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold tracking-wider text-indigo-400 uppercase">
              OTOMASYON MERKEZİ
            </span>
            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
              B2B Sipariş ve Dosya Akışı
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
              Farklı firmalar (Triton, Germes, Samakat vb.) için karekod dosya süreçlerini 4 adımda tek tıkla standartlaştırın. Masaüstü klasör bağımlılığına son verin.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl text-xs font-bold">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Control Configuration area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Partner Section */}
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
            <Building2 size={16} />
            <span>1. Partner Firma Seçimi</span>
          </div>

          <div className="space-y-2">
            {partners.map(p => (
              <button
                key={p.id}
                onClick={() => handlePartnerChange(p.id)}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all border ${selectedPartnerId === p.id ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700'}`}
              >
                <span>{p.name}</span>
                {selectedPartnerId === p.id && <span className="w-2 h-2 rounded-full bg-indigo-500"></span>}
              </button>
            ))}
          </div>

          <form onSubmit={handleCreatePartner} className="pt-2 flex gap-2">
            <input
              type="text"
              value={newPartnerName}
              onChange={e => setNewPartnerName(e.target.value)}
              placeholder="Yeni Firma Adı..."
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-indigo-500/50"
            />
            <button disabled={creating || !newPartnerName.trim()} type="submit" className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white p-2 rounded-xl shrink-0 transition-colors">
              <Plus size={16} />
            </button>
          </form>
        </div>

        {/* Brands Section */}
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
            <Tag size={16} />
            <span>2. Marka / Ambalaj Tanımı</span>
          </div>

          {selectedPartnerId ? (
            <div className="space-y-2">
              {brands.map(b => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBrandId(b.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all border ${selectedBrandId === b.id ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700'}`}
                >
                  <span>{b.name}</span>
                  {selectedBrandId === b.id && <span className="w-2 h-2 rounded-full bg-purple-500"></span>}
                </button>
              ))}

              {brands.length === 0 && (
                <p className="text-[11px] text-zinc-500 text-center py-4">Henüz marka tanımlanmamış. Aşağıdan ekleyin.</p>
              )}

              <form onSubmit={handleCreateBrand} className="pt-2 flex gap-2">
                <input
                  type="text"
                  value={newBrandName}
                  onChange={e => setNewBrandName(e.target.value)}
                  placeholder="Ambalaj Adı (Tortillas vb.)"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-purple-500/50"
                />
                <button disabled={creating || !newBrandName.trim()} type="submit" className="bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white p-2 rounded-xl shrink-0 transition-colors">
                  <Plus size={16} />
                </button>
              </form>
            </div>
          ) : (
            <p className="text-xs text-zinc-600 text-center py-8">Lütfen önce sol taraftan partner seçin.</p>
          )}
        </div>

        {/* Order/Job Creation Section */}
        <div className="bg-gradient-to-br from-zinc-950 via-indigo-950/10 to-zinc-950 border border-indigo-500/20 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
            <FolderKanban size={16} />
            <span>3. Yeni İş Akışı Başlat</span>
          </div>

          {selectedPartnerId ? (
            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="p-3 bg-zinc-900/50 rounded-xl space-y-1">
                <p className="text-[10px] text-zinc-500 font-bold uppercase">Seçili Partner</p>
                <p className="text-xs text-indigo-300 font-bold">{partners.find(p => p.id === selectedPartnerId)?.name}</p>
                
                {selectedBrandId && (
                  <>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase mt-2">Seçili Ambalaj</p>
                    <p className="text-xs text-purple-300 font-bold">{brands.find(b => b.id === selectedBrandId)?.name}</p>
                  </>
                )}
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 font-bold uppercase block mb-1">Sipariş/Klasör Adı</label>
                <input
                  type="text"
                  value={newOrderName}
                  onChange={e => setNewOrderName(e.target.value)}
                  placeholder="Örn: Triton - Nisan 2026"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500/50"
                />
                <p className="text-[10px] text-zinc-500 mt-1">Dosyalarınız bu başlık altında 4 adıma ayrılacaktır.</p>
              </div>

              <button
                disabled={creating || !newOrderName.trim()}
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-xs transition-all shadow-lg shadow-emerald-950/30"
              >
                <Plus size={16} />
                <span>İş Akışını Oluştur</span>
              </button>
            </form>
          ) : (
            <p className="text-xs text-zinc-600 text-center py-8">İş akışı başlatmak için partner seçimi zorunludur.</p>
          )}
        </div>
      </div>

      {batchSuccess && (
        <div className="flex items-center gap-2 p-4 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl text-xs font-bold">
          <CheckCircle2 size={16} />
          <span>{batchSuccess}</span>
        </div>
      )}

      {/* Historical Bulk Importer Card */}
      <div className="bg-gradient-to-r from-amber-950/20 via-zinc-950 to-amber-950/10 border border-amber-500/20 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <Upload size={16} />
              <span>Geçmiş Klasörleri Tek Tuşla İçe Aktar (Toplu Otomasyon)</span>
            </div>
            <p className="text-xs text-zinc-400">
              Bilgisayarınızdaki mevcut yerel klasörleri tarayarak her bir alt klasörü/CSV dosyasını anında ayrı bir iş akışı olarak sisteme tanımlar. Tek tek yükleme zahmetinden kurtulun.
            </p>
          </div>

          <div className="w-full md:w-auto flex flex-col gap-3 shrink-0 mt-4 md:mt-0">
            {clientScanProgress && (
              <div className="text-xs text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl animate-pulse">
                {clientScanProgress}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Yöntem A: Tarayıcı Doğrudan Seçim */}
              <div className="flex-1 relative">
                <input
                  type="file"
                  {...({ webkitdirectory: "", directory: "" } as any)}
                  multiple
                  onChange={handleClientFolderSelection}
                  disabled={importingBatch || !selectedPartnerId}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                  id="nativeFolderPicker"
                />
                <div className={`w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-extrabold px-4 py-2.5 rounded-xl text-xs transition-all shadow-lg ${importingBatch || !selectedPartnerId ? 'opacity-40' : ''}`}>
                  {importingBatch ? <Loader2 size={14} className="animate-spin text-zinc-950" /> : <Upload size={14} />}
                  <span>📁 Tarayıcıdan Klasör Seç (Vercel / S3 Uyumlu)</span>
                </div>
              </div>

              {/* Yöntem B: Lokal Sunucu */}
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1">
                <span className="text-[9px] font-bold text-zinc-500 uppercase block shrink-0">Lokal Yol:</span>
                <input
                  type="text"
                  value={historicalPath}
                  onChange={e => setHistoricalPath(e.target.value)}
                  placeholder="Karekod İşlemleri/5-Triton - Mayıs"
                  className="bg-transparent text-[10px] text-zinc-400 outline-none w-36 font-mono"
                />
                <button
                  onClick={handleBulkHistoricalImport}
                  disabled={importingBatch || !selectedPartnerId || !historicalPath.trim()}
                  title="Lokal Sunucu Diskinden Yükle"
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 font-bold px-2 py-1 rounded-lg text-[10px] transition-colors"
                >
                  Aktar
                </button>
              </div>
            </div>
            {!selectedPartnerId && <p className="text-[10px] text-amber-500/80 text-center">Klasör aktarımı için yukarıdan Partner Firma seçimi zorunludur.</p>}
          </div>
        </div>
      </div>

      {/* Orders grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="text-indigo-400" size={20} />
            <h2 className="text-base font-bold text-white tracking-tight">Aktif Sipariş İş Akışları</h2>
          </div>
          <span className="text-xs text-zinc-500">{orders.length} sipariş akışı</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orders.map(({ order, partnerName, brandName }) => (
            <Link
              key={order.id}
              href={`/dashboard/b2b/${order.id}`}
              className="group bg-zinc-950/80 border border-zinc-800/80 hover:border-indigo-500/40 rounded-2xl p-4 transition-all duration-300 block space-y-3 shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-400">{partnerName}</span>
                    {brandName && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
                        {brandName}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-zinc-200 mt-1 group-hover:text-white transition-colors">
                    {order.orderName}
                  </h3>
                </div>

                <div className="shrink-0 mt-0.5">
                  {getStatusBadge(order.status)}
                </div>
              </div>

              {/* Progress dots bar */}
              <div className="grid grid-cols-4 gap-1 pt-2">
                <div className={`h-1 rounded-full ${order.phase1FileUrl ? 'bg-emerald-500' : 'bg-zinc-800'}`}></div>
                <div className={`h-1 rounded-full ${order.phase2FileUrl ? 'bg-purple-500' : 'bg-zinc-800'}`}></div>
                <div className={`h-1 rounded-full ${order.phase3FileUrl ? 'bg-blue-500' : 'bg-zinc-800'}`}></div>
                <div className={`h-1 rounded-full ${order.phase4FileUrl ? 'bg-indigo-500' : 'bg-zinc-800'}`}></div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                <span>Son Güncelleme: {new Date(order.updatedAt || order.createdAt).toLocaleDateString('tr-TR')}</span>
                <span className="flex items-center gap-1 text-indigo-400 font-bold group-hover:translate-x-1 transition-transform">
                  Yönet <ArrowRight size={12} />
                </span>
              </div>
            </Link>
          ))}

          {orders.length === 0 && (
            <div className="col-span-full py-12 text-center text-zinc-600 border border-dashed border-zinc-800 rounded-2xl text-xs">
              Sistemde henüz aktif bir sipariş/klasör akışı bulunmuyor. Yukarıdan yeni bir iş akışı başlatın.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
