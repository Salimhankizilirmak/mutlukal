import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const orderNo = (formData.get('orderNo') as string) || 'ORDER';
    const gtin = (formData.get('gtin') as string) || 'GTIN';
    const productName = (formData.get('productName') as string) || 'Urun';
    const productionDate = (formData.get('productionDate') as string) || '';

    if (!file) return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });

    // "Aksiyonlar" veya benzeri sheet'i bul
    const aksiyonlarSheet = wb.SheetNames.find(s =>
      s.toLowerCase().includes('aksiyon') || s.toLowerCase().includes('action') || s.toLowerCase().includes('kod')
    ) || wb.SheetNames[wb.SheetNames.length - 1];

    const ws = wb.Sheets[aksiyonlarSheet];
    const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as string[][];

    if (!data || data.length < 2) {
      return NextResponse.json({ error: `"${aksiyonlarSheet}" sayfasında veri bulunamadı.` }, { status: 422 });
    }

    // Header satırını bul
    const headerRow = data[0];
    const statusColIdx = headerRow.findIndex(h => String(h).toLowerCase().includes('durum') || String(h).toLowerCase().includes('status'));
    const barcodeColIdx = headerRow.findIndex(h => String(h).toLowerCase().includes('barkod') || String(h).toLowerCase().includes('kod') && !String(h).toLowerCase().includes('durum'));
    
    const barcodeIdx = barcodeColIdx >= 0 ? barcodeColIdx : 1;

    // Success olan markalama kodlarını çek
    const markalamaCodes: string[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[barcodeIdx]) continue;
      
      const status = statusColIdx >= 0 ? String(row[statusColIdx] || '').toLowerCase() : 'success';
      if (status === 'success' || statusColIdx < 0) {
        const code = String(row[barcodeIdx]);
        if (code.startsWith('01')) {
          markalamaCodes.push(code);
        }
      }
    }

    if (markalamaCodes.length === 0) {
      return NextResponse.json({ error: 'Uygun markalama kodu bulunamadı. "Aksiyonlar" sayfasında "success" durumlu kayıt var mı?' }, { status: 422 });
    }

    // Koli/Palet bilgilerini de ara (varsa)
    // Kopya formatındaki koli/palet eşleşmesi: şimdilik ilk kod başına koli/palet boş bırakılır
    // CSV oluştur: Marka \t Koli \t Palet
    // Kurala göre: Marka → Koli → Palet, tab ile ayrılmış
    const csvLines: string[] = markalamaCodes.map(code => code); // Tab ile koli/palet ekleneceği zaman: code + '\t' + koli + '\t' + palet

    const csvContent = csvLines.join('\n');

    // Dosya adı: "Sipariş, GTIN, miktar, ürün adı, üretim tarihi.csv"
    const quantity = markalamaCodes.length;
    const dateStr = productionDate || new Date().toLocaleDateString('tr-TR').replace(/\./g, '.');
    const fileName = `${orderNo}, ${gtin}, ${quantity}, ${productName}, ${dateStr}.csv`;

    // UTF-8 BOM'suz (kural gereği)
    const csvBufferNoBOM = Buffer.from(csvContent, 'utf8');


    return new NextResponse(csvBufferNoBOM, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'X-File-Name': fileName,
        'X-Record-Count': String(quantity),
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return NextResponse.json({ error: 'Dönüştürme hatası: ' + message }, { status: 500 });
  }
}
