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

    // 1. Fully strip any potential single, double, or nested URL encoding layers to get the pure raw human-readable path
    let rawDecoded = urlParam;
    try {
      let attempts = 0;
      while (rawDecoded.includes('%') && attempts < 5) {
        const nextDec = decodeURIComponent(rawDecoded);
        if (nextDec === rawDecoded) break;
        rawDecoded = nextDec;
        attempts++;
      }
    } catch {
      // Keep best-effort decoded state if malformed segments exist
    }

    let bodyData: any = null;
    let filename = path.basename(rawDecoded.split('?')[0]);

    // Format relative path for native physical check
    let relPath = rawDecoded;
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
      // LAYER 2: Cloud HTTP Fetch Fallback with Ultimate Retry Variations to Prevent Network Edge 404 Double-Encoding Drops
      const isAbsolute = rawDecoded.startsWith('http://') || rawDecoded.startsWith('https://');
      let cloudRes: Response | null = null;

      if (isAbsolute) {
        // Encode the absolute URL properly to handle Cyrillic and spaces before fetching from cloud
        cloudRes = await fetch(encodeURI(rawDecoded));
      } else {
        // Variation A: Clean single-encoded path segments (Standard for modern Next.js/Vercel static asset routing routers)
        const singleEncodedPath = rawDecoded.split('/').map(segment => encodeURIComponent(segment)).join('/');
        const targetA = new URL(singleEncodedPath, req.nextUrl.origin).toString();
        cloudRes = await fetch(targetA);

        // Variation B: Standard encodeURI preservation (Encodes spaces and Cyrillic but preserves friendly slashes and commas)
        if (!cloudRes.ok && cloudRes.status === 404) {
          const targetB = new URL(encodeURI(rawDecoded), req.nextUrl.origin).toString();
          cloudRes = await fetch(targetB);
        }

        // Variation C: Raw literal path string fallback
        if (!cloudRes.ok && cloudRes.status === 404) {
          const targetC = new URL(rawDecoded, req.nextUrl.origin).toString();
          cloudRes = await fetch(targetC);
        }
      }

      if (!cloudRes || !cloudRes.ok) {
        return NextResponse.json({ error: `Dosya sunucuda/bulutta bulunamadı (HTTP ${cloudRes?.status || 404}).` }, { status: 404 });
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
