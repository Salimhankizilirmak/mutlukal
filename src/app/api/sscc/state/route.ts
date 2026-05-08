import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(process.cwd(), 'public', 'global_sscc_state.txt');

export async function GET() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      // Default initial value if not exists
      return NextResponse.json({ state: '00286988293850000001' });
    }
    const state = fs.readFileSync(STATE_FILE, 'utf8').trim();
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ error: 'Failed to read SSCC state' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { state } = await request.json();
    if (!state || typeof state !== 'string') {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
    }
    fs.writeFileSync(STATE_FILE, state, 'utf8');
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update SSCC state' }, { status: 500 });
  }
}
