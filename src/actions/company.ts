'use server';
import { db } from '@/db';
import { companies } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function getCompany() {
  const { userId } = await auth();
  if (!userId) return null;
  const result = await db.select().from(companies).where(eq(companies.ownerId, userId)).limit(1);
  return result[0] || null;
}

export async function setupCompany(formData: FormData) {
  const { userId } = await auth();
  if (!userId) throw new Error('Yetkisiz');
  const name = formData.get('name') as string;
  await db.insert(companies).values({ ownerId: userId, name });
  revalidatePath('/dashboard');
}
