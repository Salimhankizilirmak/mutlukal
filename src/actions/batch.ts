'use server'

import { db } from '@/db';
import { importBatches } from '@/db/schema';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { s3Client } from '@/lib/s3';

export async function getPresignedUrl(workOrderNo: string, fileName: string, fileType: string) {
  const id = uuidv4();
  const key = `batches/${id}-${fileName}`;
  
  const command = new PutObjectCommand({
    Bucket: process.env.SUPABASE_BUCKET_NAME!,
    Key: key,
    ContentType: fileType,
  });

  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  
  return { presignedUrl, objectKey: key };
}

export async function getBatchDownloadUrl(fileUrl: string) {
  try {
    // URL'den bucket adından sonrasını al (Key'i bulmak için daha güvenli yol)
    const bucketToken = `/${process.env.SUPABASE_BUCKET_NAME}/`;
    const keyIndex = fileUrl.indexOf(bucketToken);
    
    if (keyIndex === -1) throw new Error('Invalid file URL');
    
    const key = decodeURIComponent(fileUrl.substring(keyIndex + bucketToken.length));
    const fileName = key.split('/').pop() || 'dosya.xlsx';
    
    const command = new GetObjectCommand({
      Bucket: process.env.SUPABASE_BUCKET_NAME!,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    });

    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (e) {
    console.error('Download URL Error:', e);
    return null;
  }
}

export async function createBatchRecord({ deviceId, workOrderNo, fileUrl, fileSize }: { deviceId: string, workOrderNo: string, fileUrl: string, fileSize: number }) {
  const id = uuidv4();
  const publicUrl = `${process.env.SUPABASE_ENDPOINT}/storage/v1/object/public/${process.env.SUPABASE_BUCKET_NAME}/${fileUrl}`;

  await db.insert(importBatches).values({
    id,
    deviceId,
    workOrderNo,
    fileUrl: publicUrl,
    status: 'pending',
    fileSize,
    createdAt: new Date()
  });
}
