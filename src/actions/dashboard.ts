'use server';
import { db } from '@/db';
import { productionLines, devices } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';

export async function getLines() {
  const { userId } = await auth();
  if (!userId) throw new Error('Yetkisiz erişim');
  return await db.select().from(productionLines).where(eq(productionLines.factoryOwnerId, userId));
}

export async function createLine(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error('Yetkisiz erişim');
  const name = formData.get('name') as string;
  const id = uuidv4();
  await db.insert(productionLines).values({ id, name, factoryOwnerId: userId });
  revalidatePath('/dashboard/lines');
}

export async function getDevices() {
  const { userId } = await auth();
  if (!userId) throw new Error('Yetkisiz erişim');
  return await db.select().from(devices).where(eq(devices.factoryOwnerId, userId));
}

export async function createDevice(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error('Yetkisiz erişim');
  const name = formData.get('name') as string;
  const lineId = formData.get('lineId') as string;
  const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
  const id = uuidv4();
  const deviceSecret = uuidv4();
  await db.insert(devices).values({ id, name, lineId, pinCode, deviceSecret, factoryOwnerId: userId });
  revalidatePath('/dashboard/devices');
}
