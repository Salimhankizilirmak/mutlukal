'use server';
import { db } from '@/db';
import { employees } from '@/db/schema';
import { clerkClient } from '@clerk/nextjs/server';
import { getFactoryContext } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

export async function createEmployee(formData: FormData) {
  const { factoryId, role: currentUserRole } = await getFactoryContext();
  if (!factoryId || currentUserRole !== 'Sahip') throw new Error('Sadece fabrika sahipleri personel ekleyebilir.');

  const username = formData.get('username') as string;
  const password = formData.get('password') as string;
  const role = formData.get('role') as string;

  const client = await clerkClient();
  const newUser = await client.users.createUser({ username, password });

  await db.insert(employees).values({ clerkUserId: newUser.id, factoryOwnerId: factoryId, username, role });
  revalidatePath('/dashboard/employees');
}

export async function getEmployees() {
  const { factoryId } = await getFactoryContext();
  if (!factoryId) return [];
  return await db.select().from(employees).where(eq(employees.factoryOwnerId, factoryId));
}
