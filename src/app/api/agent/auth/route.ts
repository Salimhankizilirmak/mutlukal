import { NextResponse } from 'next/server';
import { db } from '@/db';
import { devices } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  const { pinCode } = await request.json();
  
  if (!pinCode) return NextResponse.json({ error: 'Missing pinCode' }, { status: 400 });

  const device = await db.query.devices.findFirst({
    where: eq(devices.pinCode, pinCode)
  });

  if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });

  return NextResponse.json({
    id: device.id,
    name: device.name,
    deviceSecret: device.deviceSecret
  });
}
