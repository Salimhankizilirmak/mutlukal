/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import { db } from '@/db';
import { b2bPartners, b2bBrands, b2bOrders } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getFactoryContext } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';

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

