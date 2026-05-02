'use server';
import { db } from '@/db';
import { employees } from '@/db/schema';
import { clerkClient } from '@clerk/nextjs/server';
import { getFactoryContext } from '@/lib/auth-context';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

export async function createEmployee(prevState: any, formData: FormData) {
  try {
    const { factoryId, role: currentUserRole } = await getFactoryContext();
    if (!factoryId || currentUserRole !== 'Sahip') {
      return { error: 'Sadece fabrika sahipleri personel ekleyebilir.' };
    }

    const username = formData.get('username') as string;
    const password = formData.get('password') as string;
    const role = formData.get('role') as string;

    if (!username || !password || !role) {
      return { error: 'Lütfen tüm alanları doldurun.' };
    }

    const client = await clerkClient();
    try {
      const newUser = await client.users.createUser({ username, password });
      await db.insert(employees).values({ clerkUserId: newUser.id, factoryOwnerId: factoryId, username, role });
      revalidatePath('/dashboard/employees');
      return { success: true };
    } catch (clerkError: any) {
      console.error('Clerk Create User Error:', clerkError);
      
      const firstError = clerkError.errors?.[0];
      let message = 'Kullanıcı oluşturulurken bir hata oluştu.';

      if (firstError) {
        if (firstError.code === 'form_password_pwned') {
          message = 'Bu şifre daha önce bir veri sızıntısında ifşa olmuş. Lütfen daha güvenli ve farklı bir şifre seçin.';
        } else if (firstError.code === 'form_identifier_exists') {
          message = 'Bu kullanıcı adı zaten alınmış.';
        } else if (firstError.code === 'form_password_validation_failed') {
          message = 'Şifre kriterlere uygun değil.';
        } else {
          message = firstError.longMessage || firstError.message || message;
        }
      }

      return { error: message };
    }
  } catch (error: any) {
    console.error('Create Employee System Error:', error);
    return { error: 'Sistem hatası oluştu.' };
  }
}

export async function getEmployees() {
  const { factoryId } = await getFactoryContext();
  if (!factoryId) return [];
  return await db.select().from(employees).where(eq(employees.factoryOwnerId, factoryId));
}
