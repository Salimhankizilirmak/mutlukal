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

    const { filename, contentType } = await req.json();
    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Filename ve contentType gerekli' }, { status: 400 });
    }

    const key = `b2b/${context.factoryId}/${Date.now()}_${filename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.SUPABASE_BUCKET_NAME || 'lavas-trace',
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const publicUrl = `${process.env.SUPABASE_ENDPOINT}/storage/v1/object/public/${process.env.SUPABASE_BUCKET_NAME || 'lavas-trace'}/${key}`;

    return NextResponse.json({ presignedUrl, publicUrl, key });
  } catch (error: unknown) {
    console.error('Presigned URL error:', error);
    return NextResponse.json({ error: 'URL oluşturulamadı' }, { status: 500 });
  }
}
