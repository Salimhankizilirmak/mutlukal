import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const urlParam = req.nextUrl.searchParams.get('url');
    if (!urlParam) {
      return NextResponse.json({ error: 'URL parametresi eksik' }, { status: 400 });
    }

    // Decode any URI components safely
    let relPath = decodeURIComponent(urlParam);
    if (relPath.startsWith('/')) {
      relPath = relPath.substring(1);
    }

    // Robustly split by both slashes to support Windows file paths natively
    const parts = relPath.split(/[/\\]/);
    const fullPath = path.join(process.cwd(), 'public', ...parts);

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: `Dosya sunucuda bulunamadı.` }, { status: 404 });
    }

    const buffer = await fs.promises.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const isXlsx = ext === '.xlsx' || ext === '.xls';

    if (isXlsx) {
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `inline; filename="${encodeURIComponent(path.basename(fullPath))}"`,
        },
      });
    } else {
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Sunucu dosya okuma hatası';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
