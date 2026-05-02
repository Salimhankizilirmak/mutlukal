import { auth } from '@clerk/nextjs/server';
import { isSuperAdmin } from './roles';

export async function getFactoryContext() {
  const { orgId, orgRole, userId } = await auth();
  
  if (!userId) {
    throw new Error('Oturum açılmamış.');
  }

  if (orgId) {
    // Return organization details
    // For now we don't have company object, UI will handle displaying Org name via OrganizationSwitcher
    return { factoryId: orgId, role: orgRole };
  }

  const isAdmin = await isSuperAdmin();
  if (isAdmin) {
    return { factoryId: 'admin', role: 'Super Admin' };
  }

  throw new Error('Bir organizasyona bağlı değilsiniz.');
}
