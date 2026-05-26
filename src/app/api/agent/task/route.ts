import { NextResponse } from 'next/server';
import { db } from '@/db';
import { devices, b2bOrders } from '@/db/schema';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  const secret = authHeader.replace('Bearer ', '').trim();

  const device = await db.select().from(devices).where(eq(devices.deviceSecret, secret)).limit(1);
  if (!device.length) return NextResponse.json({ error: 'Geçersiz cihaz' }, { status: 401 });

  // Bu cihaza atanmış, şablonu hazır ama henüz raporu YÜKLENMEMİŞ ilk B2B siparişini bul
  const task = await db.select().from(b2bOrders).where(
    and(
      eq(b2bOrders.assignedDeviceId, device[0].id),
      isNotNull(b2bOrders.agentFileUrl),
      isNull(b2bOrders.reportFileUrl)
    )
  ).limit(1);

  if (!task.length) return NextResponse.json({ error: 'Görev yok' }, { status: 404 });

  // Ajanın indirmesi için bilgileri yolla
  return NextResponse.json({
    taskId: task[0].id,
    workOrderNo: task[0].orderCode,
    downloadUrl: task[0].agentFileUrl, // Ajan buradan indirecek
    fileName: `Sablon_${task[0].orderCode}.xlsx`
  });
}

// Ajan rapor gönderdiğinde (Yerel Dosya Sistemine Kayıt)
export async function POST(req: Request) {
  const formData = await req.formData();
  const secret = formData.get('deviceSecret') as string;
  const taskId = formData.get('taskId') as string;
  const file = formData.get('report') as File;

  if (!secret || !taskId || !file) return NextResponse.json({ error: 'Eksik veri' }, { status: 400 });

  const device = await db.select().from(devices).where(eq(devices.deviceSecret, secret)).limit(1);
  if (!device.length) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadDir = join(process.cwd(), 'public', 'uploads', 'reports');
  await mkdir(uploadDir, { recursive: true });

  const fileName = `${Date.now()}-${file.name}`;
  const filePath = join(uploadDir, fileName);
  await writeFile(filePath, buffer);

  const fileUrl = `/uploads/reports/${fileName}`;

  // B2B siparişinin 3. Aşamasını doldur
  await db.update(b2bOrders).set({ reportFileUrl: fileUrl, status: 'in_progress' }).where(eq(b2bOrders.id, taskId));

  return NextResponse.json({ success: true });
}
