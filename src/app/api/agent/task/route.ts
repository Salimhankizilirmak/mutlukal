import { NextResponse } from 'next/server';
import { db } from '@/db';
import { devices, importBatches } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const deviceSecret = authHeader.split(' ')[1];
  
  const device = await db.query.devices.findFirst({
    where: eq(devices.deviceSecret, deviceSecret)
  });

  if (!device) return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });

  const [batch] = await db.select()
    .from(importBatches)
    .where(and(
      eq(importBatches.deviceId, device.id),
      eq(importBatches.status, 'pending')
    ))
    .orderBy(desc(importBatches.id))
    .limit(1);

  if (!batch) return NextResponse.json({ message: 'No pending tasks' });

  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const { s3Client } = await import('@/lib/s3');

  const key = batch.fileUrl.replace(`${process.env.SUPABASE_ENDPOINT}/storage/v1/object/public/${process.env.SUPABASE_BUCKET_NAME}/`, '');
  const originalFileName = key.split('/').pop() || '';
  const extension = originalFileName.includes('.') ? originalFileName.split('.').pop() : 'xlsx';
  const fileName = `${batch.workOrderNo}.${extension}`;

  const command = new GetObjectCommand({
    Bucket: process.env.SUPABASE_BUCKET_NAME!,
    Key: key,
  });

  const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  return NextResponse.json({
    id: batch.id,
    workOrderNo: batch.workOrderNo,
    downloadUrl,
    fileName,
    fileSize: batch.fileSize
  });
}
