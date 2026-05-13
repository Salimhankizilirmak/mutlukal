'use server';

import { db } from '@/db';
import { b2bPartners, b2bBrands, b2bOrders } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getFactoryContext } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';

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
