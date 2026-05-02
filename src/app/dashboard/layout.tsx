import { isSuperAdmin } from '@/lib/roles';
import { ClientLayout } from './ClientLayout';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const superAdmin = await isSuperAdmin();

  return (
    <ClientLayout isSuperAdmin={superAdmin}>
      {children}
    </ClientLayout>
  );
}
