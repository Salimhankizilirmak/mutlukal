import { NextResponse } from 'next/server';
import { db } from '@/db';
import { devices, batches } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(req: Request) {
  const body = await req.json();
  const { action, deviceSecret, reportData, targetDeviceId, batchId } = body;

  const device = await db.select().from(devices).where(eq(devices.pinCode, deviceSecret)).limit(1); // Basit auth
  if (!device.length) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  // RAPOR YÜKLEME
  if (action === 'upload_report') {
    // Gerçek senaryoda reportData (base64) buluta yüklenir, biz URL simüle ediyoruz
    await db.update(batches).set({ status: 'completed', reportUrl: 'rapor_dosyasi.pdf' }).where(eq(batches.id, batchId));
    return NextResponse.json({ success: true });
  }

  // CİHAZLARI GETİR (Aktarım için)
  if (action === 'get_devices') {
    const allDevices = await db.select().from(devices).where(eq(devices.factoryOwnerId, device[0].factoryOwnerId));
    return NextResponse.json(allDevices.filter(d => d.id !== device[0].id));
  }

  // İŞ AKTARMA
  if (action === 'transfer_batch') {
    await db.update(batches).set({ deviceId: targetDeviceId }).where(eq(batches.id, batchId));
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 });
}
