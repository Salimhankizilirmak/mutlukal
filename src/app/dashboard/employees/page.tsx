import { OrganizationProfile } from '@clerk/nextjs';
import { Users } from 'lucide-react';
import { getFactoryContext } from '@/lib/auth-context';

export default async function EmployeesPage() {
  // We call this to ensure they are in an organization and authorized
  await getFactoryContext();

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center gap-3 mb-2">
          <Users className="text-emerald-500" /> Personel ve Organizasyon Yönetimi
        </h1>
        <p className="text-zinc-500 text-sm">
          Bu ekrandan personelleri organizasyonunuza davet edebilir, yetkilerini düzenleyebilir ve sistem ayarlarını yönetebilirsiniz.
        </p>
      </div>

      <div className="bg-[#18181b]/50 border border-zinc-800/50 rounded-2xl overflow-hidden p-6 shadow-[0_0_20px_rgba(0,0,0,0.3)]">
        <OrganizationProfile 
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-transparent shadow-none w-full max-w-full",
              navbar: "hidden md:flex",
              headerTitle: "text-zinc-100",
              headerSubtitle: "text-zinc-400",
              profileSectionTitle: "text-zinc-200 border-b border-zinc-800 pb-2",
              profileSectionTitleText: "text-zinc-200",
              profileSectionPrimaryButton: "text-emerald-400 hover:bg-emerald-500/10",
              userPreviewTextContainer: "text-zinc-200",
              userPreviewSecondaryIdentifier: "text-zinc-400",
              badge: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
              tableHead: "bg-zinc-900/50 text-zinc-400 border-b border-zinc-800",
              tableRow: "hover:bg-zinc-800/30 border-b border-zinc-800/50",
              tableCell: "text-zinc-300",
              actionButton: "text-zinc-300 hover:bg-zinc-800",
              primaryButton: "bg-emerald-600 hover:bg-emerald-500 text-white",
              formButtonPrimary: "bg-emerald-600 hover:bg-emerald-500",
              formFieldInput: "bg-[#09090b] border-zinc-800 text-zinc-200",
              formFieldLabel: "text-zinc-400",
            }
          }}
        />
      </div>
    </div>
  );
}
