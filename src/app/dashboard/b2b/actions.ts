/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import { db } from '@/db';
import { b2bPartners, b2bBrands, b2bOrders, b2bSettings } from '@/db/schema';
import { eq, desc, and, like, or } from 'drizzle-orm';
import { getFactoryContext } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';
import { sendEmail } from '@/lib/mail';

export async function getPartners() {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  // Multi-tenant isolation based on orgId mapped precisely to factoryId
  return await db.select().from(b2bPartners).where(eq(b2bPartners.orgId, context.factoryId)).orderBy(b2bPartners.name);
}

export async function createPartner(name: string) {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  const [partner] = await db.insert(b2bPartners).values({
    name,
    orgId: context.factoryId,
  }).returning();

  revalidatePath('/dashboard/b2b');
  return partner;
}

export async function getBrands(partnerId: string) {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  return await db.select().from(b2bBrands).where(eq(b2bBrands.partnerId, partnerId)).orderBy(b2bBrands.name);
}

export async function createBrand(partnerId: string, name: string) {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  const [brand] = await db.insert(b2bBrands).values({
    partnerId,
    name,
    orgId: context.factoryId,
  }).returning();

  revalidatePath('/dashboard/b2b');
  return brand;
}

export async function getOrders() {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  return await db.select({
    order: b2bOrders,
    partnerName: b2bPartners.name,
    brandName: b2bBrands.name,
  })
  .from(b2bOrders)
  .innerJoin(b2bPartners, eq(b2bOrders.partnerId, b2bPartners.id))
  .leftJoin(b2bBrands, eq(b2bOrders.brandId, b2bBrands.id))
  .where(eq(b2bOrders.orgId, context.factoryId))
  .orderBy(desc(b2bOrders.createdAt));
}

export async function createOrder(data: { partnerId: string; brandId?: string; orderName: string }) {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  const [order] = await db.insert(b2bOrders).values({
    partnerId: data.partnerId,
    brandId: data.brandId || null,
    orderName: data.orderName,
    orgId: context.factoryId,
  }).returning();

  revalidatePath('/dashboard/b2b');
  return order;
}

export async function getOrderById(orderId: string) {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  const [result] = await db.select({
    order: b2bOrders,
    partnerName: b2bPartners.name,
    brandName: b2bBrands.name,
  })
  .from(b2bOrders)
  .innerJoin(b2bPartners, eq(b2bOrders.partnerId, b2bPartners.id))
  .leftJoin(b2bBrands, eq(b2bOrders.brandId, b2bBrands.id))
  .where(eq(b2bOrders.id, orderId));

  if (!result || result.order.orgId !== context.factoryId) throw new Error('Sipariş bulunamadı');
  return result;
}

export async function updateOrderPhase(orderId: string, phase: 1 | 2 | 3 | 4, fileUrl: string, fileName: string) {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (phase === 1) {
    updateData.phase1FileUrl = fileUrl;
    updateData.phase1FileName = fileName;
    updateData.status = 'phase2_pending';
  } else if (phase === 2) {
    updateData.phase2FileUrl = fileUrl;
    updateData.phase2FileName = fileName;
    updateData.status = 'phase3_pending';
  } else if (phase === 3) {
    updateData.phase3FileUrl = fileUrl;
    updateData.phase3FileName = fileName;
    updateData.status = 'phase4_pending';
  } else if (phase === 4) {
    updateData.phase4FileUrl = fileUrl;
    updateData.phase4FileName = fileName;
    updateData.status = 'completed';
  }

  const [updated] = await db.update(b2bOrders)
    .set(updateData)
    .where(eq(b2bOrders.id, orderId))
    .returning();

  revalidatePath('/dashboard/b2b');
  revalidatePath(`/dashboard/b2b/${orderId}`);
  return updated;
}

export async function importLocalHistoricalBatch(partnerId: string, brandId?: string, relativePublicPath = 'Karekod İşlemleri/5-Triton - Mayıs') {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  const fullBasePath = path.join(process.cwd(), 'public', ...relativePublicPath.split('/'));
  if (!fs.existsSync(fullBasePath)) {
    throw new Error(`Belirtilen yerel klasör bulunamadı: ${relativePublicPath}`);
  }

  // Gelen CSV (Aşama 1) ve Cihazdan Gelen (Aşama 3) klasörlerini bul
  const baseEntries = await fs.promises.readdir(fullBasePath, { withFileTypes: true });
  let phase1DirName = '';
  let phase3DirName = '';

  for (const entry of baseEntries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('1-')) phase1DirName = entry.name;
      if (entry.name.startsWith('3-')) phase3DirName = entry.name;
    }
  }

  if (!phase1DirName) {
    throw new Error(`Aşama 1 klasörü (1- ile başlayan) bulunamadı.`);
  }

  const phase1AbsPath = path.join(fullBasePath, phase1DirName);
  const subDirs = await fs.promises.readdir(phase1AbsPath, { withFileTypes: true });

  let importedCount = 0;

  for (const sub of subDirs) {
    if (!sub.isDirectory()) continue;

    const subDirPath = path.join(phase1AbsPath, sub.name);
    const files = await fs.promises.readdir(subDirPath);

    for (const file of files) {
      if (!file.endsWith('.csv') && !file.endsWith('.xlsx') && !file.endsWith('.xls')) continue;

      // Sade ve anlaşılır sipariş başlığı
      const orderTitle = `${sub.name} • ${file.replace(/\.[^/.]+$/, '')}`;
      const phase1Url = `/${relativePublicPath}/${phase1DirName}/${sub.name}/${file}`;

      // Aşama 3 dosyası var mı kontrol et
      let phase3Url: string | null = null;
      let phase3Name: string | null = null;

      if (phase3DirName) {
        const phase3SubPath = path.join(fullBasePath, phase3DirName, sub.name);
        if (fs.existsSync(phase3SubPath)) {
          try {
            const p3Files = await fs.promises.readdir(phase3SubPath);
            for (const p3f of p3Files) {
              if (p3f.endsWith('.xlsx') || p3f.endsWith('.xls') || p3f.endsWith('.csv')) {
                phase3Url = `/${relativePublicPath}/${phase3DirName}/${sub.name}/${p3f}`;
                phase3Name = p3f;
                break;
              }
            }
          } catch {
            // ignore
          }
        }
      }

      const statusVal = phase3Url ? 'phase4_pending' : 'phase2_pending';

      await db.insert(b2bOrders).values({
        partnerId,
        brandId: brandId || null,
        orderName: orderTitle.length > 255 ? orderTitle.substring(0, 250) : orderTitle,
        phase1FileUrl: phase1Url,
        phase1FileName: file,
        phase3FileUrl: phase3Url,
        phase3FileName: phase3Name,
        status: statusVal as any,
        orgId: context.factoryId,
      });

      importedCount++;
    }
  }

  revalidatePath('/dashboard/b2b');
  return importedCount;
}

export async function createImportedOrderBatchClient(data: {
  partnerId: string;
  brandId?: string;
  orderName: string;
  // Phase 1 — gelen CSV grubu
  phase1FileUrl: string;
  phase1FileName: string;
  phase1AllFiles?: string; // JSON: string[]
  // Phase 2 — makineye gönderilen xlsx (eşleşti ise)
  phase2FileUrl?: string | null;
  phase2FileName?: string | null;
  phase2AllFiles?: string | null; // JSON: {name:string, size:number, isPart:boolean}[]
  // Phase 3 — cihazdan alınan xlsx (eşleşti ise)
  phase3FileUrl?: string | null;
  phase3FileName?: string | null;
  phase3AllFiles?: string | null;
  // Phase 4 — firmaya gönderilen rapor (eşleşti ise)
  phase4FileUrl?: string | null;
  phase4FileName?: string | null;
  phase4AllFiles?: string | null;
}) {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  // Status: en ileri tamamlanan aşamaya göre otomatik hesapla
  let statusVal = 'phase2_pending';
  if (data.phase4FileUrl) statusVal = 'completed';
  else if (data.phase3FileUrl) statusVal = 'phase4_pending';
  else if (data.phase2FileUrl) statusVal = 'phase3_pending';

  const [order] = await db.insert(b2bOrders).values({
    partnerId: data.partnerId,
    brandId: data.brandId || null,
    orderName: data.orderName,
    phase1FileUrl: data.phase1FileUrl,
    phase1FileName: data.phase1FileName,
    phase1AllFiles: data.phase1AllFiles || null,
    phase2FileUrl: data.phase2FileUrl || null,
    phase2FileName: data.phase2FileName || null,
    phase2AllFiles: data.phase2AllFiles || null,
    phase3FileUrl: data.phase3FileUrl || null,
    phase3FileName: data.phase3FileName || null,
    phase3AllFiles: data.phase3AllFiles || null,
    phase4FileUrl: data.phase4FileUrl || null,
    phase4FileName: data.phase4FileName || null,
    phase4AllFiles: data.phase4AllFiles || null,
    status: statusVal as any,
    orgId: context.factoryId,
  }).returning();

  revalidatePath('/dashboard/b2b');
  return order;
}

export async function deleteOrder(orderId: string) {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  await db.delete(b2bOrders).where(eq(b2bOrders.id, orderId));
  revalidatePath('/dashboard/b2b');
}

export async function deleteAllOrders() {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  await db.delete(b2bOrders).where(eq(b2bOrders.orgId, context.factoryId));
  revalidatePath('/dashboard/b2b');
}

export async function clearPhaseFile(orderId: string, phase: 1 | 2 | 3 | 4) {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (phase === 1) {
    updateData.phase1FileUrl = null;
    updateData.phase1FileName = null;
    updateData.phase1AllFiles = null;
    updateData.status = 'phase1_pending';
  } else if (phase === 2) {
    updateData.phase2FileUrl = null;
    updateData.phase2FileName = null;
    updateData.phase2AllFiles = null;
    updateData.status = 'phase2_pending';
  } else if (phase === 3) {
    updateData.phase3FileUrl = null;
    updateData.phase3FileName = null;
    updateData.phase3AllFiles = null;
    updateData.status = 'phase3_pending';
  } else if (phase === 4) {
    updateData.phase4FileUrl = null;
    updateData.phase4FileName = null;
    updateData.phase4AllFiles = null;
    updateData.status = 'phase4_pending';
  }

  await db.update(b2bOrders).set(updateData).where(eq(b2bOrders.id, orderId));
  revalidatePath('/dashboard/b2b');
  revalidatePath(`/dashboard/b2b/${orderId}`);
}

export async function updatePhaseNote(orderId: string, phase: 1 | 2 | 3 | 4, note: string) {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (phase === 1) updateData.phase1Note = note;
  else if (phase === 2) updateData.phase2Note = note;
  else if (phase === 3) updateData.phase3Note = note;
  else if (phase === 4) updateData.phase4Note = note;

  await db.update(b2bOrders).set(updateData).where(eq(b2bOrders.id, orderId));
  revalidatePath(`/dashboard/b2b/${orderId}`);
}

export async function getMonthlyMasterList() {
  try {
    const context = await getFactoryContext();
    if (!context?.factoryId) return { months: [] };

    const records = await db.select().from(b2bSettings).where(eq(b2bSettings.orgId, context.factoryId));
    const found = records.find(r => r.key === 'monthly_master_list');
    if (found && found.value) {
      return JSON.parse(found.value);
    }
  } catch {
    // fallback gracefully
  }
  return { months: [] };
}

export async function saveMonthlyMasterList(data: any) {
  const context = await getFactoryContext();
  if (!context?.factoryId) throw new Error('Yetkisiz');

  const jsonString = JSON.stringify(data);
  const existing = await db.select().from(b2bSettings).where(eq(b2bSettings.orgId, context.factoryId));
  const found = existing.find(r => r.key === 'monthly_master_list');

  if (found) {
    await db.update(b2bSettings)
      .set({ value: jsonString, updatedAt: new Date() })
      .where(eq(b2bSettings.id, found.id));
  } else {
    await db.insert(b2bSettings).values({
      orgId: context.factoryId,
      key: 'monthly_master_list',
      value: jsonString,
    });
  }

  revalidatePath('/dashboard/b2b');
  return { success: true };
}
export async function deleteMonthFromList(monthId: string) {
  const context = await getFactoryContext();
  if (!context?.factoryId) throw new Error('Yetkisiz');

  const records = await db.select().from(b2bSettings).where(eq(b2bSettings.orgId, context.factoryId));
  const found = records.find(r => r.key === 'monthly_master_list');
  
  if (found && found.value) {
    const data = JSON.parse(found.value);
    const targetMonth = data.months.find((m: any) => m.monthId === monthId);
    
    if (targetMonth) {
      // 1. Bu ayın araçlarını (orderName prefix) tespit et ve TOPLU sil
      const rawCodes = targetMonth.orderCodes || [];
      const vehicleNames = Array.isArray(rawCodes) ? rawCodes : [];
      
      if (vehicleNames.length > 0) {
        // SQL Parametre limitini aşmamak için 50'şerli gruplar halinde sil
        const chunkSize = 50;
        for (let i = 0; i < vehicleNames.length; i += chunkSize) {
          const chunk = vehicleNames.slice(i, i + chunkSize);
          const conditions = chunk.map((vn: string) => like(b2bOrders.orderName, `${vn} • %`));
          
          await db.delete(b2bOrders).where(and(
            eq(b2bOrders.orgId, context.factoryId),
            or(...conditions)
          ));
        }
      }
      
      // 2. Ayı listeden çıkar
      data.months = data.months.filter((m: any) => m.monthId !== monthId);
      
      await db.update(b2bSettings)
        .set({ value: JSON.stringify(data), updatedAt: new Date() })
        .where(eq(b2bSettings.id, found.id));
    }
  }
  
  revalidatePath('/dashboard/b2b');
}

export async function sendB2BReportEmail(orderId: string, reportUrl: string, fileName: string, subjectData: any) {
  const context = await getFactoryContext();
  if (!context.factoryId) throw new Error('Yetkisiz');

  const { vehicleCode, orderCode, ssccRange, prodDate, expDate, batchNo } = subjectData;
  
  // Subject: Подтверждение заказа (чесни знак) - KB-006328/ ZPK-010320 - ZPL-012080 08.05.2026 - 08.11.2026 (26050825-2)
  const subject = `Подтверждение заказа (чесни знак) - ${vehicleCode}/ ${orderCode} - ${ssccRange} ${prodDate} - ${expDate} (${batchNo})`;

  // Fetch report content for attachment
  const res = await fetch(reportUrl);
  if (!res.ok) throw new Error('Rapor dosyası sunucudan indirilemedi.');
  const buffer = Buffer.from(await res.arrayBuffer());

  const html = ''; // Başlık dışında asla bir yazı ekleme

  return await sendEmail({
    to: 'k.can@mutlukal.com.tr',
    cc: ['s.canidemir@mutlukal.com.tr', 'salimhankizil@gmail.com'],
    subject,
    html,
    attachments: [
      {
        filename: fileName,
        content: buffer,
      }
    ]
  });
}
