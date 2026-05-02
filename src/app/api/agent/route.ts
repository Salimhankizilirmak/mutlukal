import { NextResponse } from 'next/server';
import { db } from '@/db';
import { devices, importBatches } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from '@/lib/s3';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  const body = await req.json();
  const { action, deviceSecret, targetDeviceId, batchId, fileName, reportUrl } = body;

  // deviceSecret ile doğrula (pinCode değil)
  const device = await db.select().from(devices).where(eq(devices.deviceSecret, deviceSecret)).limit(1);
  if (!device.length) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });

  // 1. ADIM: RAPOR İÇİN YÜKLEME URL'İ AL
  if (action === 'get_report_upload_url') {
    const key = `reports/${uuidv4()}-${fileName}`;
    const command = new PutObjectCommand({
      Bucket: process.env.SUPABASE_BUCKET_NAME!,
      Key: key,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Varsayılan excel
    });
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const publicUrl = `${process.env.SUPABASE_ENDPOINT}/storage/v1/object/public/${process.env.SUPABASE_BUCKET_NAME}/${key}`;
    return NextResponse.json({ success: true, uploadUrl, reportUrl: publicUrl });
  }

  // 2. ADIM: RAPOR YÜKLEME TAMAMLANDI — importBatches tablosunu güncelle
  if (action === 'upload_report') {
    let targetBatchId = batchId;
    
    if (!targetBatchId) {
      const lastPending = await db.select().from(importBatches)
        .where(and(eq(importBatches.deviceId, device[0].id), eq(importBatches.status, 'pending')))
        .orderBy(desc(importBatches.createdAt))
        .limit(1);
      if (lastPending.length > 0) targetBatchId = lastPending[0].id;
    }

    if (!targetBatchId) return NextResponse.json({ success: false, message: 'Aktif iş emri yok.' });

    await db.update(importBatches)
      .set({ 
        status: 'completed', 
        reportUrl: reportUrl, // Ajanın gönderdiği S3 linkini kaydet
        updatedAt: new Date() 
      })
      .where(eq(importBatches.id, targetBatchId));
      
    return NextResponse.json({ success: true, message: 'Rapor başarıyla kaydedildi.' });
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
