'use server';

import { sendEmail } from '@/lib/mail';
import { isSuperAdmin } from '@/lib/roles';

export async function sendFactoryInvite(email: string) {
  const isAdmin = await isSuperAdmin();
  if (!isAdmin) return { success: false, error: 'Bu işlem için Süper Admin yetkisi gerekiyor.' };

  const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`;

  const htmlTemplate = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #09090b; padding: 40px; border-radius: 12px; color: #f4f4f5; border: 1px solid #27272a;">
      <h2 style="color: #10b981; font-size: 24px; margin-bottom: 20px;">Lavaş Trace Sistemine Davet Edildiniz</h2>
      <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6;">Fabrikanızın üretim hatlarını ve iş emirlerini merkezi olarak yönetmek için oluşturulan güvenli altyapıya erişim yetkisi kazandınız.</p>
      <div style="text-align: center; margin: 40px 0;">
        <a href="${inviteLink}" style="background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Sisteme Kayıt Ol</a>
      </div>
    </div>
  `;

  const result = await sendEmail({
    to: email,
    subject: 'Lavaş Trace - Sistem Daveti',
    html: htmlTemplate,
  });

  return result;
}
