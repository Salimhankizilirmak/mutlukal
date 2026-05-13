import { NextResponse } from 'next/server';
import { s3Client } from '@/lib/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getFactoryContext } from '@/lib/auth-context';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const context = await getFactoryContext();
    if (!context.factoryId) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
    }

    const contentTypeHeader = req.headers.get('content-type') || '';
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'lavas-trace';

    // 1. Doğrudan Sunucu Üzerinden Dosya Yükleme (CORS Bloklarını Atlar)
    if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      let filename = formData.get('filename') as string | null;

      if (!file) {
        return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 });
      }

      filename = filename || file.name;
      const contentType = file.type || 'application/octet-stream';
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const key = `b2b/${context.factoryId}/${Date.now()}_${filename}`;

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      let publicUrl = '';
      try {
        await s3Client.send(command);
        publicUrl = `${process.env.SUPABASE_ENDPOINT}/storage/v1/object/public/${bucketName}/${key}`;
      } catch (s3Err) {
        console.warn('S3 bulut yüklemesi atlandı veya başarısız oldu, lokal public/b2b-uploads dizinine yedekleniyor:', s3Err);
        // Fallback persist locally to ensure zero operational friction
        const uploadDir = path.join(process.cwd(), 'public', 'b2b-uploads', context.factoryId);
        await fs.promises.mkdir(uploadDir, { recursive: true });
        const safeName = `${Date.now()}_${filename}`;
        await fs.promises.writeFile(path.join(uploadDir, safeName), buffer);
        publicUrl = `/b2b-uploads/${context.factoryId}/${safeName}`;
      }

      return NextResponse.json({ publicUrl, key });
    }

    // 2. Geriye Dönük Uyumluluk (JSON tabanlı Presigned URL İsteği)
    const { filename, contentType } = await req.json();
    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Filename ve contentType gerekli' }, { status: 400 });
    }

    const key = `b2b/${context.factoryId}/${Date.now()}_${filename}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const publicUrl = `${process.env.SUPABASE_ENDPOINT}/storage/v1/object/public/${bucketName}/${key}`;

    return NextResponse.json({ presignedUrl, publicUrl, key });
  } catch (error: unknown) {
    console.error('S3 Upload / Presigned URL error:', error);
    return NextResponse.json({ error: 'Dosya işlenemedi veya URL oluşturulamadı' }, { status: 500 });
  }
}

