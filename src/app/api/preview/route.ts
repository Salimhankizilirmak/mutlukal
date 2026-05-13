/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const urlParam = req.nextUrl.searchParams.get('url');
    if (!urlParam) {
      return NextResponse.json({ error: 'URL parametresi eksik' }, { status: 400 });
    }

    let bodyData: any = null;
    let filename = path.basename(urlParam.split('?')[0]);

    // Decode any URI components safely to evaluate physical path
    let relPath = decodeURIComponent(urlParam);
    if (relPath.startsWith('/')) {
      relPath = relPath.substring(1);
    }

    // LAYER 1: Native Disk File Access (Guarantees support for local Windows dev server with non-ASCII static directories)
    const parts = relPath.split(/[/\\]/);
    const fullPath = path.join(process.cwd(), 'public', ...parts);

    if (fs.existsSync(fullPath)) {
      bodyData = await fs.promises.readFile(fullPath);
      filename = path.basename(fullPath);
    } else {
      // LAYER 2: Cloud HTTP Fetch Fallback (Guarantees support for Vercel Serverless/CDN storage routes and external Supabase buckets)
      const isAbsolute = urlParam.startsWith('http://') || urlParam.startsWith('https://');
      let fetchTarget = urlParam;

      if (!isAbsolute) {
        // Ensure special path characters, spaces, and Cyrillic segments are encoded for network retrieval
        const encodedPath = urlParam.split('/').map(segment => encodeURIComponent(segment)).join('/');
        fetchTarget = new URL(encodedPath, req.nextUrl.origin).toString();
      }

      const cloudRes = await fetch(fetchTarget);
      if (!cloudRes.ok) {
        return NextResponse.json({ error: `Dosya sunucuda/bulutta bulunamadı (HTTP ${cloudRes.status}).` }, { status: 404 });
      }

      bodyData = await cloudRes.arrayBuffer();
    }

    const ext = path.extname(filename).toLowerCase();
    const isXlsx = ext === '.xlsx' || ext === '.xls';

    if (isXlsx) {
      return new NextResponse(bodyData, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
        },
      });
    } else {
      return new NextResponse(bodyData, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Sunucu/Bulut dosya okuma hatası' }, { status: 500 });
  }
}
