import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { companies, employees } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getFactoryContext() {
  const { userId } = await auth();
  if (!userId) throw new Error('Yetkisiz');

  // 1. Kullanıcı Fabrika Sahibi mi?
  const company = await db.select().from(companies).where(eq(companies.ownerId, userId)).limit(1);
  if (company.length > 0) return { factoryId: userId, role: 'Sahip', company: company[0] };

  // 2. Kullanıcı Personel mi?
  const employee = await db.select().from(employees).where(eq(employees.clerkUserId, userId)).limit(1);
  if (employee.length > 0) {
    const factoryOwnerId = employee[0].factoryOwnerId;
    const empCompany = await db.select().from(companies).where(eq(companies.ownerId, factoryOwnerId)).limit(1);
    return { factoryId: factoryOwnerId, role: employee[0].role, company: empCompany[0] || null };
  }

  return { factoryId: null, role: null, company: null };
}
