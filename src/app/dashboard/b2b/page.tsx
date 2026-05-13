/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Briefcase, Plus, FolderKanban, CheckCircle2, AlertCircle, Building2, Tag, Loader2, Upload, X, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { getPartners, createPartner, getBrands, createBrand, getOrders, createOrder, importLocalHistoricalBatch, createImportedOrderBatchClient, deleteOrder, deleteAllOrders, getMonthlyMasterList, saveMonthlyMasterList } from './actions';

export default function B2BDashboardPage() {
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

  const [showCreationModal, setShowCreationModal] = useState(false);

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

  const handlePurgeAllOrders = async () => {
    if (confirm('DİKKAT: Mevcut çalışma alanınızdaki tüm sipariş iş akışı kayıtlarını kalıcı olarak temizlemek istediğinize emin misiniz?')) {
      setImportingBatch(true);
      try {
        await deleteAllOrders();
        await loadData();
        setBatchSuccess('✔ Tüm sipariş iş akışları başarıyla temizlendi.');
      } catch (err: any) {
        alert(err.message || 'Temizlenemedi');
      } finally {
        setImportingBatch(false);
      }
    }
  };

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
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('filename', targetName);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.publicUrl) return data.publicUrl;
      }
    } catch (e) {
      console.warn('API upload proxy adımı atlandı, otonom simüle URL atanıyor:', e);
    }
    throw new Error('Sunucudan geçerli bir dosya URL\'si alınamadı.');
  };

  const handleClientFolderSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedPartnerId) return;

    setImportingBatch(true);
    setError('');
    setBatchSuccess('');
    setClientScanProgress('Klasör hiyerarşisi derinlemesine taranıyor, makine grupları tespit ediliyor...');

    try {
      // ──────────────────────────────────────────────────────────────
      // ADIM 1: Tüm geçerli dosyaları tara ve normalize et
      // ──────────────────────────────────────────────────────────────
      type FileEntry = {
        file: File;
        phase: number;
        orderCode: string;  // Dosya adının başındaki kod (ZPK-010320, Z190007471...)
        groupDir: string;   // Dosyanın hemen üstündeki klasör adı
        size: number;
      };
      const allEntries: FileEntry[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const rel = f.webkitRelativePath || '';
        const lowerRel = rel.toLowerCase();

        if (lowerRel.endsWith('.zip') || lowerRel.endsWith('.rar')) continue;
        if (!lowerRel.endsWith('.csv') && !lowerRel.endsWith('.xlsx') && !lowerRel.endsWith('.xls')) continue;

        const parts = rel.split('/');
        if (parts.length < 3) continue;

        let phase = 0;
        for (const p of parts) {
          if (p.startsWith('1-')) { phase = 1; break; }
          if (p.startsWith('2-')) { phase = 2; break; }
          if (p.startsWith('3-')) { phase = 3; break; }
          if (p.startsWith('4-')) { phase = 4; break; }
        }
        if (phase === 0) continue;

        const subDirName = parts[parts.length - 2];
        if (/^\d+-$/.test(subDirName.trim())) continue; // boş yer tutucu klasörler

        // Sipariş kodu: dosya adının başındaki alfanümerik-tire kombinasyonu
        const codeMatch = f.name.match(/^([A-Za-z0-9]+-[0-9]+)/);
        const orderCode = codeMatch ? codeMatch[1] : f.name.split(',')[0].trim();

        allEntries.push({ file: f, phase, orderCode, groupDir: subDirName, size: f.size });
      }

      // ──────────────────────────────────────────────────────────────
      // ADIM 2: Phase 1 dosyalarını GRUP KLASÖRÜ bazında topla
      // Her grup klasörü = tek bir makine yükü = tek bir kart
      // ──────────────────────────────────────────────────────────────
      const p1Entries = allEntries.filter(e => e.phase === 1);
      if (p1Entries.length === 0) {
        throw new Error('Seçilen klasörde 1- ile başlayan alt klasörler içinde geçerli CSV dosyası bulunamadı.');
      }

      // Grup klasörü adına göre düzenle
      const groupMap = new Map<string, FileEntry[]>();
      for (const entry of p1Entries) {
        if (!groupMap.has(entry.groupDir)) groupMap.set(entry.groupDir, []);
        groupMap.get(entry.groupDir)!.push(entry);
      }

      // ──────────────────────────────────────────────────────────────
      // Yardımcı: verilen orderCode listesini barındıran Phase N dosyalarını bul
      // "parça" tespiti: dosya adında "parça" veya "parça" kelimesi varsa partial
      // ──────────────────────────────────────────────────────────────
      const isPart = (name: string) => /parça|parca|part/i.test(name);

      const findPhaseFiles = (phaseNum: number, orderCodes: string[]) => {
        const matched = allEntries.filter(e =>
          e.phase === phaseNum && orderCodes.some(oc => e.orderCode === oc)
        );
        if (matched.length === 0) return null;
        // Tam (parça olmayan) dosyayı ana dosya yap; yoksa en büyük boyutluyu al
        const mainFile = matched.find(f => !isPart(f.file.name)) ||
          matched.reduce((a, b) => a.size > b.size ? a : b);
        const partFiles = matched.filter(f => f !== mainFile);
        return { mainFile, partFiles, all: matched };
      };

      // ──────────────────────────────────────────────────────────────
      // ADIM 3: Her grup için çapraz aşama eşleştirmesi ve DB kaydı
      // ──────────────────────────────────────────────────────────────
      const groupKeys = Array.from(groupMap.keys());
      let successCount = 0;

      for (let gi = 0; gi < groupKeys.length; gi++) {
        const groupDir = groupKeys[gi];
        const groupFiles = groupMap.get(groupDir)!;

        // Gruptaki tüm sipariş kodları
        const orderCodes = groupFiles.map(f => f.orderCode);

        setClientScanProgress(`Grup aktarılıyor (${gi + 1}/${groupKeys.length}): ${groupDir}...`);

        // Phase 1: tüm CSV'ler bu gruptaki dosyalar
        const p1Main = groupFiles[0]; // ana = ilk (boyuta göre de sıralanabilir ama fark az)
        // Gruptaki TÜM dosyaları buluta yükle
        const p1Urls = await Promise.all(groupFiles.map(f => uploadFileDirectly(f.file, f.file.name)));
        const p1Url = p1Urls[0];
        const p1AllNames = groupFiles.map(f => f.file.name);

        // Phase 2 çapraz eşleştirme
        const p2Result = findPhaseFiles(2, orderCodes);
        let p2Url: string | null = null;
        let p2FileName: string | null = null;
        let p2AllFiles: string | null = null;
        if (p2Result) {
          // Gruptaki TÜM şablon alt-dosyalarını buluta yükle
          await Promise.all(p2Result.all.map(f => uploadFileDirectly(f.file, f.file.name)));
          p2Url = await uploadFileDirectly(p2Result.mainFile.file, p2Result.mainFile.file.name);
          p2FileName = p2Result.mainFile.file.name;
          // Tüm parça+tam dosya bilgisini JSON olarak kaydet
          p2AllFiles = JSON.stringify(p2Result.all.map(f => ({
            name: f.file.name,
            size: f.size,
            isPart: isPart(f.file.name),
          })));
        }

        // Phase 3 çapraz eşleştirme
        const p3Result = findPhaseFiles(3, orderCodes);
        let p3Url: string | null = null;
        let p3FileName: string | null = null;
        let p3AllFiles: string | null = null;
        if (p3Result) {
          // Gruptaki TÜM çıktı alt-dosyalarını buluta yükle
          await Promise.all(p3Result.all.map(f => uploadFileDirectly(f.file, f.file.name)));
          p3Url = await uploadFileDirectly(p3Result.mainFile.file, p3Result.mainFile.file.name);
          p3FileName = p3Result.mainFile.file.name;
          p3AllFiles = JSON.stringify(p3Result.all.map(f => ({
            name: f.file.name,
            size: f.size,
            isPart: isPart(f.file.name),
          })));
        }

        // Phase 4 çapraz eşleştirme
        const p4Result = findPhaseFiles(4, orderCodes);
        let p4Url: string | null = null;
        let p4FileName: string | null = null;
        let p4AllFiles: string | null = null;
        if (p4Result) {
          // Gruptaki TÜM rapor alt-dosyalarını buluta yükle
          await Promise.all(p4Result.all.map(f => uploadFileDirectly(f.file, f.file.name)));
          p4Url = await uploadFileDirectly(p4Result.mainFile.file, p4Result.mainFile.file.name);
          p4FileName = p4Result.mainFile.file.name;
          p4AllFiles = JSON.stringify(p4Result.all.map(f => ({
            name: f.file.name,
            size: f.size,
            isPart: isPart(f.file.name),
          })));
        }

        await createImportedOrderBatchClient({
          partnerId: selectedPartnerId,
          brandId: selectedBrandId || undefined,
          orderName: groupDir.length > 255 ? groupDir.substring(0, 250) : groupDir,
          phase1FileUrl: p1Url,
          phase1FileName: p1Main.file.name,
          phase1AllFiles: JSON.stringify(p1AllNames),
          phase2FileUrl: p2Url,
          phase2FileName: p2FileName,
          phase2AllFiles: p2AllFiles,
          phase3FileUrl: p3Url,
          phase3FileName: p3FileName,
          phase3AllFiles: p3AllFiles,
          phase4FileUrl: p4Url,
          phase4FileName: p4FileName,
          phase4AllFiles: p4AllFiles,
        });

        successCount++;
      }

      await loadData();
      setBatchSuccess(`✔ Muhteşem! ${successCount} adet makine grubu, 4 aşamanın tamamı çapraz eşleştirilerek ve tüm dosya detaylarıyla sisteme aktarıldı.`);
      e.target.value = '';
    } catch (err: any) {
      setError(err.message || 'Klasör yüklenirken hata oluştu.');
    } finally {
      setImportingBatch(false);
      setClientScanProgress('');
    }
  };

  // ──────────────────────────────────────────────────────────────
  // YENİ: Aylık Ana Sipariş Listesi (Master Excel) Yükleme ve Ayrıştırma Motoru
  // ──────────────────────────────────────────────────────────────
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

        items.push({
          vehicleCode: lastVehicle || rawVehicle,
          orderCode: rawOrder,
          pallets: Number(row[2]) || 0,
          boxes: Number(row[3]) || 0,
          pcs: Number(row[4]) || 0,
          loadingDate: lDate || lastLoadingDate,
          productionDate: pDate || lastProdDate,
          sktDate: sDate || lastSktDate,
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

  // ──────────────────────────────────────────────────────────────
  // YENİ: Otonom Tekil İş Dosyası Açma / Yükleme Motoru
  // ──────────────────────────────────────────────────────────────
  const handleSingleAutoJobUpload = async (file: File, presetVehicle?: string) => {
    if (!selectedPartnerId) return alert('Lütfen önce Firma seçin.');
    
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

      const uploadedUrl = await uploadFileDirectly(file, file.name);

      await createImportedOrderBatchClient({
        partnerId: selectedPartnerId,
        brandId: selectedBrandId || undefined,
        orderName: vehicleCode,
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

      // Load monthly master configuration
      const mData = await getMonthlyMasterList();
      setMonthlyMasterList(mData || { months: [] });
      if (mData?.months && mData.months.length > 0) {
        // preserve active month selection or default to current/last month
        setSelectedMonthId(prev => prev || (mData.months.find((m: any) => m.isCurrent) || mData.months[mData.months.length - 1])?.monthId || '');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Premium Header & Aksiyon Çubuğu */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-zinc-950 p-6 sm:p-8 border border-indigo-900/20 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
            <p className="text-xs text-zinc-400 mt-1 max-w-xl">
              Mevcut lojistik operasyonlarınızı ve yüklenen akışları bu panelden takip edebilirsiniz.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCreationModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-black px-6 py-3.5 rounded-2xl text-xs transition-all shadow-lg shadow-indigo-950/50 flex items-center gap-2 shrink-0 self-stretch sm:self-auto justify-center"
        >
          <Plus size={16} />
          <span>Firma & Klasör Ekle</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl text-xs font-bold">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {batchSuccess && (
        <div className="flex items-center gap-2 p-4 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl text-xs font-bold">
          <CheckCircle2 size={16} />
          <span>{batchSuccess}</span>
        </div>
      )}

      {/* MODAL: Firma, Ambalaj ve Dosya Yükleme Paneli */}
      {showCreationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
            
            {/* Modal Başlığı */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800/80 bg-zinc-900/40">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                  <Building2 size={18} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">Firma & Dosya Akışı Ekleme Paneli</h3>
                  <p className="text-[11px] text-zinc-500">Sisteme yeni firmalar, ambalaj tipleri veya toplu klasörler tanımlayın</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreationModal(false)}
                className="p-2 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors outline-none"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal İçeriği (Kaydırılabilir Alan) */}
            <div className="p-5 overflow-y-auto space-y-6">
              
              {/* 1. ve 2. Aşama: Firma ve Ambalaj Tanımı */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Partner Section */}
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                    <Building2 size={14} />
                    <span>1. Partner Firma Seçimi</span>
                  </div>

                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {partners.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handlePartnerChange(p.id)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all border ${selectedPartnerId === p.id ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700'}`}
                      >
                        <span>{p.name}</span>
                        {selectedPartnerId === p.id && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleCreatePartner} className="pt-1 flex gap-2">
                    <input
                      type="text"
                      value={newPartnerName}
                      onChange={e => setNewPartnerName(e.target.value)}
                      placeholder="Yeni Firma Adı..."
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-indigo-500/50"
                    />
                    <button disabled={creating || !newPartnerName.trim()} type="submit" className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white p-1.5 rounded-xl shrink-0 transition-colors">
                      <Plus size={14} />
                    </button>
                  </form>
                </div>

                {/* Brands Section */}
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
                    <Tag size={14} />
                    <span>2. Marka / Ambalaj Tanımı</span>
                  </div>

                  {selectedPartnerId ? (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {brands.map(b => (
                        <button
                          key={b.id}
                          onClick={() => setSelectedBrandId(b.id)}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all border ${selectedBrandId === b.id ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700'}`}
                        >
                          <span>{b.name}</span>
                          {selectedBrandId === b.id && <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>}
                        </button>
                      ))}

                      {brands.length === 0 && (
                        <p className="text-[11px] text-zinc-500 text-center py-2">Henüz marka tanımlanmamış. Aşağıdan ekleyin.</p>
                      )}

                      <form onSubmit={handleCreateBrand} className="pt-1 flex gap-2">
                        <input
                          type="text"
                          value={newBrandName}
                          onChange={e => setNewBrandName(e.target.value)}
                          placeholder="Ambalaj Adı (Tortillas vb.)"
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-purple-500/50"
                        />
                        <button disabled={creating || !newBrandName.trim()} type="submit" className="bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white p-1.5 rounded-xl shrink-0 transition-colors">
                          <Plus size={14} />
                        </button>
                      </form>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600 text-center py-6">Lütfen önce partner seçin.</p>
                  )}
                </div>

              </div>

              {/* 3. Aşama: Yeni Tekil İş Akışı Başlat */}
              <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  <FolderKanban size={14} />
                  <span>3. Bağımsız Yeni Klasör/Akış Başlat</span>
                </div>

                {selectedPartnerId ? (
                  <form onSubmit={handleCreateOrder} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newOrderName}
                      onChange={e => setNewOrderName(e.target.value)}
                      placeholder="Sipariş / Klasör Adı (Örn: Triton - Nisan 2026)"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500/50"
                    />
                    <button
                      disabled={creating || !newOrderName.trim()}
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-bold px-4 py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs transition-all shrink-0"
                    >
                      <Plus size={14} />
                      <span>Akışı Oluştur</span>
                    </button>
                  </form>
                ) : (
                  <p className="text-xs text-zinc-600 italic">İş akışı başlatmak için partner seçimi zorunludur.</p>
                )}
              </div>

              {/* 4. Aşama: Toplu Otomasyon Tarayıcı Yükleyici */}
              <div className="bg-gradient-to-r from-amber-950/20 via-zinc-950 to-amber-950/10 border border-amber-500/20 rounded-2xl p-4 space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                    <Upload size={14} />
                    <span>Geçmiş Klasörleri Toplu Otonom İçe Aktar</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Bilgisayarınızdaki mevcut lojistik klasör hiyerarşisini seçin, sistem tüm alt dosyaları ayrı akışlar halinde otomatik eşleştirsin.
                  </p>
                </div>

                {clientScanProgress && (
                  <div className="text-[11px] text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl animate-pulse">
                    {clientScanProgress}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  {/* Tarayıcı Doğrudan Seçim */}
                  <div className="flex-1 relative">
                    <input
                      type="file"
                      {...({ webkitdirectory: "", directory: "" } as any)}
                      multiple
                      onChange={handleClientFolderSelection}
                      disabled={importingBatch || !selectedPartnerId}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                    />
                    <div className={`w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-extrabold px-4 py-2 rounded-xl text-xs transition-all ${importingBatch || !selectedPartnerId ? 'opacity-40' : ''}`}>
                      {importingBatch ? <Loader2 size={14} className="animate-spin text-zinc-950" /> : <Upload size={14} />}
                      <span>📁 Tüm Klasörü Tarayıcıdan Aktar</span>
                    </div>
                  </div>

                  {/* Lokal Yol */}
                  <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase block shrink-0">Lokal Yol:</span>
                    <input
                      type="text"
                      value={historicalPath}
                      onChange={e => setHistoricalPath(e.target.value)}
                      placeholder="Karekod İşlemleri/5-Triton"
                      className="bg-transparent text-[10px] text-zinc-400 outline-none w-32 font-mono"
                    />
                    <button
                      onClick={handleBulkHistoricalImport}
                      disabled={importingBatch || !selectedPartnerId || !historicalPath.trim()}
                      className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300 font-bold px-2 py-1 rounded-lg text-[10px] transition-colors"
                    >
                      Aktar
                    </button>
                  </div>
                </div>
                {!selectedPartnerId && <p className="text-[10px] text-amber-500/80">Aktarım için yukarıdan Partner Firma seçimi zorunludur.</p>}
              </div>

            </div>

            {/* Modal Alt Çubuğu */}
            <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/20 flex justify-end">
              <button
                onClick={() => setShowCreationModal(false)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold px-5 py-2 rounded-xl text-xs transition-colors"
              >
                Kapat
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────
          AYLIK SİPARİŞ LİSTESİ (MASTER EXCEL) VE DİNAMİK AYLAR TAB TABLOSU
          ────────────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-zinc-950/80 border border-zinc-800 rounded-3xl p-4 sm:p-5">
          {/* Sol: Ay Seçici Sekmeler */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            <span className="text-[10px] uppercase font-extrabold text-zinc-500 tracking-wider px-2 shrink-0">AYLAR:</span>
            {monthlyMasterList?.months?.map((m: any) => (
              <button
                key={m.monthId}
                onClick={() => setSelectedMonthId(m.monthId)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 ${selectedMonthId === m.monthId ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/50' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'}`}
              >
                {m.monthTitle}
              </button>
            ))}

            {(!monthlyMasterList?.months || monthlyMasterList.months.length === 0) && (
              <span className="text-xs text-amber-500/80 italic px-2">Henüz aylık liste yüklenmedi. Sağdan yükleyin.</span>
            )}
          </div>

          {/* Sağ: Yeni Ay Listesi (Excel) Yükleme Alanı */}
          <div className="flex items-center gap-2 shrink-0 self-stretch md:self-auto justify-end">
            <div className="relative flex-1 md:flex-initial">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleMonthlyExcelUpload}
                disabled={importingBatch || !selectedPartnerId}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
              />
              <div className={`flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black px-4 py-2 rounded-xl text-xs transition-all shadow-md ${importingBatch || !selectedPartnerId ? 'opacity-40' : ''}`}>
                <FileText size={15} />
                <span>📅 Yeni Ay Listesi (Excel) Yükle</span>
              </div>
            </div>
          </div>
        </div>

        {/* Global Otonom Sürükle-Bırak İş Dosyası Açma Dropzone */}
        {selectedMonthId && (
          <div className="relative border-2 border-dashed border-indigo-500/30 hover:border-indigo-500/60 bg-gradient-to-b from-indigo-950/10 to-transparent rounded-3xl p-6 text-center transition-all group">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                if (e.target.files?.[0]) handleSingleAutoJobUpload(e.target.files[0]);
                e.target.value = '';
              }}
              disabled={importingBatch}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
              <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-full group-hover:scale-110 transition-transform duration-300">
                <Upload size={24} />
              </div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                ⚡ Otonom İş Dosyası Aç (Sürükle veya Seç)
              </h3>
              <p className="text-xs text-zinc-400 max-w-md">
                Gelen bağımsız <span className="text-indigo-300 font-mono">.csv</span> sipariş dosyasını buraya sürükleyin. Sistem listeyi tarar, aracı bulur ve iş dosyasını otomatik başlatır.
              </p>
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────
            ARAÇLARA GÖRE GRUPLANMIŞ SİPARİŞ HİYERARŞİSİ
            ────────────────────────────────────────────────────────────── */}
        {(() => {
          const curMonth = monthlyMasterList?.months?.find((m: any) => m.monthId === selectedMonthId);
          if (!curMonth) return null;

          const items = curMonth.items || [];
          const vehicles = Array.from(new Set(items.map((it: any) => String(it.vehicleCode || '')))).filter(Boolean) as string[];

          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  🚚 {curMonth.monthTitle} — Araç Bazlı Sevkiyat Planı ({vehicles.length} Araç)
                </span>
                <button
                  onClick={handlePurgeAllOrders}
                  className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors"
                >
                  Çalışma Alanını Temizle
                </button>
              </div>

              {vehicles.map((vCode: string) => {
                const vItems = items.filter((it: any) => it.vehicleCode === vCode);
                const isExpanded = expandedVehicles[vCode] ?? true;
                
                const tPallets = vItems.reduce((acc: number, it: any) => acc + (it.pallets || 0), 0);
                const tBoxes = vItems.reduce((acc: number, it: any) => acc + (it.boxes || 0), 0);
                const tPcs = vItems.reduce((acc: number, it: any) => acc + (it.pcs || 0), 0);
                const firstDest = vItems.find((it: any) => it.destination)?.destination || '';
                const lDate = vItems.find((it: any) => it.loadingDate)?.loadingDate || '';

                return (
                  <div key={vCode} className="bg-zinc-950 border border-zinc-800/80 rounded-3xl overflow-hidden transition-all shadow-xl shadow-black/40">
                    <div
                      onClick={() => setExpandedVehicles({ ...expandedVehicles, [vCode]: !isExpanded })}
                      className="bg-gradient-to-r from-zinc-900 via-zinc-900/60 to-zinc-900 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none group border-b border-zinc-800/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-black flex items-center justify-center text-sm group-hover:scale-105 transition-transform shrink-0">
                          🚗
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-black text-white group-hover:text-indigo-300 transition-colors tracking-tight">
                              {vCode}
                            </h3>
                            <span className="bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded text-[10px]">
                              {vItems.length} İş
                            </span>
                            {lDate && (
                              <span className="bg-amber-500/10 text-amber-400 font-bold px-2 py-0.5 rounded text-[10px]">
                                📅 {lDate}
                              </span>
                            )}
                          </div>
                          {firstDest && (
                            <p className="text-xs text-zinc-400 max-w-md truncate mt-0.5" title={firstDest}>
                              📍 {firstDest}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                        <div className="flex items-center gap-3 bg-zinc-950/80 border border-zinc-800/80 px-3 py-1.5 rounded-xl text-xs">
                          <span title="Palet">🛢️ <strong className="text-white font-black">{tPallets}</strong></span>
                          <span className="text-zinc-700">|</span>
                          <span title="Koli">📦 <strong className="text-white font-black">{tBoxes}</strong></span>
                          <span className="text-zinc-700">|</span>
                          <span title="Adet">🍕 <strong className="text-emerald-400 font-black">{tPcs}</strong></span>
                        </div>

                        <div className="relative" onClick={e => e.stopPropagation()}>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              if (e.target.files?.[0]) handleSingleAutoJobUpload(e.target.files[0], vCode);
                              e.target.value = '';
                            }}
                            disabled={importingBatch}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            title="Bu araca yeni bir iş dosyası yükle"
                          />
                          <button className="p-2 bg-zinc-800 hover:bg-indigo-600 text-zinc-400 hover:text-white rounded-xl transition-colors shrink-0">
                            <Plus size={16} />
                          </button>
                        </div>

                        <div className="text-zinc-500 group-hover:text-white transition-colors shrink-0">
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 sm:p-5 space-y-4 bg-zinc-950/40">
                        {vItems.map((item: any, idx: number) => {
                          const dbRecordObj = orders.find(o => {
                            const matchV = o.order.orderName === vCode || o.order.orderName?.includes(item.orderCode);
                            const matchC = o.order.phase1Note === item.orderCode || 
                              (o.order.phase1FileName && o.order.phase1FileName.toLowerCase().startsWith(item.orderCode.toLowerCase()));
                            return matchV && matchC;
                          });

                          const dbOrder = dbRecordObj?.order;
                          const isFullyDone = dbOrder && (dbOrder.status === 'Tamamlandı' || !!dbOrder.phase4FileUrl);

                          return (
                            <div
                              key={item.orderCode || idx}
                              className={`p-4 rounded-2xl border transition-all ${dbOrder ? (isFullyDone ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-zinc-900/80 border-indigo-500/40 shadow-lg shadow-indigo-950/20') : 'bg-zinc-950/90 border-zinc-900 border-dashed hover:border-zinc-700'}`}
                            >
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-950/60 px-2.5 py-0.5 rounded-lg border border-indigo-500/20">
                                      🔑 {item.orderCode}
                                    </span>
                                    {dbOrder ? (
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
                                  {dbOrder ? (
                                    <>
                                      <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded-xl border border-zinc-800 text-[10px]">
                                        <span className={dbOrder.phase1FileUrl ? 'text-emerald-400 font-bold' : 'text-zinc-600'} title="Aşama 1">1️⃣</span>
                                        <span className={dbOrder.phase2FileUrl ? 'text-purple-400 font-bold' : 'text-zinc-600'} title="Aşama 2">2️⃣</span>
                                        <span className={dbOrder.phase3FileUrl ? 'text-blue-400 font-bold' : 'text-zinc-600'} title="Aşama 3">3️⃣</span>
                                        <span className={dbOrder.phase4FileUrl ? 'text-amber-400 font-bold' : 'text-zinc-600'} title="Aşama 4">4️⃣</span>
                                      </div>

                                      <button
                                        onClick={(e) => handleDeleteSingleOrder(e, dbOrder.id)}
                                        className="p-2 text-zinc-600 hover:text-rose-400 rounded-lg transition-colors"
                                        title="Bu işin dosyasını kaldır"
                                      >
                                        <X size={14} />
                                      </button>

                                      <Link
                                        href={`/dashboard/b2b/${dbOrder.id}`}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-black px-4 py-2 rounded-xl text-xs transition-all flex items-center gap-1 shadow-md shadow-indigo-950/50"
                                      >
                                        <span>👉 Paneli Aç</span>
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
          );
        })()}
      </div>
    </div>
  );
}
