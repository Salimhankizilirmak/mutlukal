import { currentUser } from '@clerk/nextjs/server';

export async function isSuperAdmin() {
  const user = await currentUser();
  if (!user) return false;
  
  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId
  )?.emailAddress;

  const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim());
  return superAdminEmails.includes(primaryEmail || '');
}
