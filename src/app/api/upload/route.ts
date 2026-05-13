/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { s3Client } from '@/lib/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getFactoryContext } from '@/lib/auth-context';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  const diagnosticLogs: string[] = [];
  const log = (msg: string) => {
    console.log(`[UPLOAD DIAGNOSTIC] ${msg}`);
    diagnosticLogs.push(msg);
  };

  try {
    log('Upload POST endpoint triggered.');
    let context: { factoryId: string; role?: string } = { factoryId: '' };
    try {
      context = await getFactoryContext();
      log(`Factory Auth Context resolved: ${context.factoryId}`);
    } catch {
      log('API Route auth mapping skipped, utilizing fallback sandbox-factory context.');
      context = { factoryId: 'sandbox-factory', role: 'Developer' };
    }

    if (!context?.factoryId) {
      context = { factoryId: 'sandbox-factory', role: 'Developer' };
    }

    const contentTypeHeader = req.headers.get('content-type') || '';
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'lavas-batches';
    log(`Target Bucket: "${bucketName}" | Content-Type Header: "${contentTypeHeader}"`);

    // 1. Doğrudan Sunucu Üzerinden Dosya Yükleme (CORS Bloklarını ve Emülasyon Sınırlarını Atlar)
    if (contentTypeHeader.includes('multipart/form-data')) {
      log('Parsing multi-part form data payload...');
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      let filename = formData.get('filename') as string | null;

      if (!file) {
        log('ERROR: File payload missing in form data.');
        return NextResponse.json({ error: 'Dosya bulunamadı', logs: diagnosticLogs }, { status: 400 });
      }

      filename = filename || file.name;
      const contentType = file.type || 'application/octet-stream';
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      log(`File parsed successfully. Name: "${filename}" | Size: ${buffer.length} bytes | MIME: "${contentType}"`);

      const ext = path.extname(filename);
      const baseNameWithoutExt = path.basename(filename, ext);
      const asciiBase = baseNameWithoutExt.replace(/[^a-zA-Z0-9\-_]/g, '_').replace(/_+/g, '_');
      const safeFilename = `${asciiBase}${ext}`;
      const key = `b2b/${context.factoryId}/${Date.now()}_${safeFilename}`;
      
      // Akıllı URL Tespiti: Supabase endpoint'inden base URL çıkar
      let baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      if (!baseUrl && process.env.SUPABASE_ENDPOINT) {
        baseUrl = process.env.SUPABASE_ENDPOINT.split('/storage/')[0];
      }
      log(`Constructed Storage Key: "${key}" | Resolved Base URL: "${baseUrl}"`);

      let publicUrl = '';
      let protocol1Error = '';

      // PROTOCOL 1: Standard AWS S3 Client Gateway
      try {
        log('PROTOCOL 1: Invoking standard AWS S3 REST API via @aws-sdk/client-s3...');
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        });
        await s3Client.send(command);
        publicUrl = `${baseUrl}/storage/v1/object/public/${bucketName}/${key}`;
        log(`✔ PROTOCOL 1 SUCCESS! Public URL generated: ${publicUrl}`);
      } catch (s3Err: unknown) {
        protocol1Error = s3Err instanceof Error ? s3Err.message : String(s3Err);
        log(`✘ PROTOCOL 1 FAILED: ${protocol1Error}`);

        // PROTOCOL 2: Zero-Dependency Direct HTTP REST Stream to Supabase Storage Gateway using native fetch
        log('PROTOCOL 2: Attempting zero-dependency native REST streaming upload bypass...');
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const targetRestUrl = `${baseUrl}/storage/v1/object/${bucketName}/${key}`;
        log(`REST target API string: "${targetRestUrl}" | AnonKey length: ${anonKey.length}`);

        const restRes = await fetch(targetRestUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${anonKey}`,
            'Content-Type': contentType,
          },
          body: buffer,
        });

        if (restRes.ok) {
          publicUrl = `${baseUrl}/storage/v1/object/public/${bucketName}/${key}`;
          log(`✔ PROTOCOL 2 SUCCESS! File written natively to bucket via REST. URL: ${publicUrl}`);
        } else {
          const errText = await restRes.text().catch(() => '');
          log(`✘ PROTOCOL 2 FAILED: HTTP ${restRes.status} | Response text: ${errText}`);

          const isCloudEnv = process.env.VERCEL || process.env.NODE_ENV === 'production';
          if (isCloudEnv) {
            log('CRITICAL: Running on cloud deployment. Refusing to swallow cloud upload failure into ephemeral storage.');
            return NextResponse.json({
              error: `Bulut depolama yazma izni reddedildi!\nS3 Hatası: ${protocol1Error}\nREST Hatası (${restRes.status}): ${errText}`,
              logs: diagnosticLogs,
            }, { status: 500 });
          }

          log('Warning: Running locally. Persisting file locally as a development fallback.');
          const uploadDir = path.join(process.cwd(), 'public', 'b2b-uploads', context.factoryId);
          await fs.promises.mkdir(uploadDir, { recursive: true });
          const safeName = `${Date.now()}_${filename}`;
          await fs.promises.writeFile(path.join(uploadDir, safeName), buffer);
          publicUrl = `/b2b-uploads/${context.factoryId}/${safeName}`;
          log(`Fallback local URL configured: ${publicUrl}`);
        }
      }

      log('Upload sequence finalized beautifully.');
      return NextResponse.json({ publicUrl, key, logs: diagnosticLogs });
    }

    // 2. Geriye Dönük Uyumluluk (JSON tabanlı Presigned URL İsteği)
    log('Processing backwards-compatible presigned URL JSON mode.');
    const { filename, contentType } = await req.json();
    if (!filename || !contentType) {
      log('ERROR: Presigned parameters missing.');
      return NextResponse.json({ error: 'Filename ve contentType gerekli', logs: diagnosticLogs }, { status: 400 });
    }

    const ext = path.extname(filename);
    const baseNameWithoutExt = path.basename(filename, ext);
    const asciiBase = baseNameWithoutExt.replace(/[^a-zA-Z0-9\-_]/g, '_').replace(/_+/g, '_');
    const safeFilename = `${asciiBase}${ext}`;
    const key = `b2b/${context.factoryId}/${Date.now()}_${safeFilename}`;
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_ENDPOINT?.replace('/storage/v1/s3', '').replace('.storage.', '.') || '';
    const publicUrl = `${baseUrl}/storage/v1/object/public/${bucketName}/${key}`;

    log(`Presigned mapping success. URL: ${publicUrl}`);
    return NextResponse.json({ presignedUrl, publicUrl, key, logs: diagnosticLogs });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Dosya işlenemedi veya URL oluşturulamadı';
    log(`FATAL ERROR: ${errMsg}`);
    return NextResponse.json({ error: errMsg, logs: diagnosticLogs }, { status: 500 });
  }
}
