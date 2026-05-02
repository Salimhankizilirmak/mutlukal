import { NextResponse } from 'next/server';
import { db } from '@/db';
import { devices, importBatches } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const body = await req.json();
  const { action, deviceSecret, targetDeviceId, batchId } = body;

  // deviceSecret ile doğrula (pinCode değil)
  const device = await db.select().from(devices).where(eq(devices.deviceSecret, deviceSecret)).limit(1);
  if (!device.length) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  // RAPOR YÜKLEME — importBatches tablosunu güncelle
  if (action === 'upload_report') {
    await db.update(importBatches)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(importBatches.id, batchId));
    return NextResponse.json({ success: true });
  }

  // CİHAZLARI GETİR (Aktarım için)
  if (action === 'get_devices') {
    const allDevices = await db.select().from(devices).where(eq(devices.factoryOwnerId, device[0].factoryOwnerId));
    return NextResponse.json(allDevices.filter(d => d.id !== device[0].id));
  }

  // İŞ AKTARMA — importBatches tablosunu güncelle
  if (action === 'transfer_batch') {
    await db.update(importBatches)
      .set({ deviceId: targetDeviceId })
      .where(eq(importBatches.id, batchId));
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 });
}
