'use server'

import { db } from '@/db';
import { importBatches } from '@/db/schema';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { s3Client } from '@/lib/s3';

export async function createBatch(deviceId: string, workOrderNo: string, fileName: string, fileSize: number) {
  const id = uuidv4();
  const key = `batches/${id}-${fileName}`;
  
  const command = new PutObjectCommand({
    Bucket: process.env.SUPABASE_BUCKET_NAME!,
    Key: key,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  const fileUrl = `${process.env.SUPABASE_ENDPOINT}/storage/v1/object/public/${process.env.SUPABASE_BUCKET_NAME}/${key}`;

  await db.insert(importBatches).values({
    id,
    deviceId,
    workOrderNo,
    fileUrl,
    status: 'pending',
    fileSize
  });

  return { uploadUrl, id };
}
