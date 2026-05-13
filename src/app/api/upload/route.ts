import { NextResponse } from 'next/server';
import { s3Client } from '@/lib/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getFactoryContext } from '@/lib/auth-context';

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

      await s3Client.send(command);

      const publicUrl = `${process.env.SUPABASE_ENDPOINT}/storage/v1/object/public/${bucketName}/${key}`;
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

