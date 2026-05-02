'use server'

import { db } from '@/db';
import { devices } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '@clerk/nextjs/server';

export async function createDevice(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const name = formData.get('name') as string;
  const lineId = formData.get('lineId') as string;
  
  if (!name || !lineId) throw new Error('Missing fields');
  
  const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
  const deviceSecret = uuidv4();
  const id = uuidv4();

  await db.insert(devices).values({
    id,
    lineId,
    name,
    deviceSecret,
    pinCode,
    factoryOwnerId: userId
  });
}
