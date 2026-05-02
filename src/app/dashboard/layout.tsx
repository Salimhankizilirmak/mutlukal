import { isSuperAdmin } from '@/lib/roles';
import { getCompany, setupCompany } from '@/actions/company';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { Activity, MonitorDot, SendToBack, ShieldAlert, Factory } from 'lucide-react';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await isSuperAdmin();
  const company = await getCompany();

  // Firma kaydı yoksa ve Süper Admin değilse Onboarding ekranı göster
  if (!company && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b] p-4">
        <div className="bg-[#18181b]/80 backdrop-blur-md border border-emerald-500/30 rounded-2xl p-8 max-w-md w-full shadow-[0_0_30px_rgba(16,185,129,0.1)]">
          <div className="flex justify-center mb-6"><Factory className="w-16 h-16 text-emerald-500" /></div>
          <h2 className="text-2xl font-bold text-center text-zinc-100 mb-2">Lavaş Trace&apos;e Hoş Geldiniz</h2>
          <p className="text-zinc-400 text-center mb-8 text-sm">Sistemi kullanmaya başlamadan önce lütfen işletmenizi tanımlayın.</p>
          <form action={setupCompany} className="flex flex-col gap-4">
            <div>
              <label className="text-zinc-300 text-sm mb-1 block">Firma / Marka Adı</label>
              <input type="text" name="name" required placeholder="Örn: Günar İskele A.Ş." className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50" />
            </div>
            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg mt-4 transition-all shadow-[0_0_15px_rgba(5,150,105,0.4)]">Kurulumu Tamamla</button>
          </form>
        </div>
      </div>
    );
  }

  // Normal Dashboard
  const displayName = isAdmin ? 'SÜPER ADMİN' : (company?.name || 'LAVAŞ TRACE');

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#18181b]/50 border-r border-zinc-800/50 backdrop-blur-xl flex flex-col">
        <div className="p-6 border-b border-zinc-800/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <span className="font-bold text-white text-lg">{displayName.charAt(0)}</span>
          </div>
          <span className="font-bold text-zinc-100 truncate flex-1" title={displayName}>{displayName}</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/dashboard/lines" className="flex items-center gap-3 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/30 p-3 rounded-lg transition-all"><Activity size={20} /> Üretim Hatları</Link>
          <Link href="/dashboard/devices" className="flex items-center gap-3 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/30 p-3 rounded-lg transition-all"><MonitorDot size={20} /> Cihazlar</Link>
          <Link href="/dashboard/batches" className="flex items-center gap-3 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/30 p-3 rounded-lg transition-all"><SendToBack size={20} /> İş Emirleri</Link>
          {isAdmin && <Link href="/dashboard/super-admin" className="flex items-center gap-3 text-amber-500 hover:bg-amber-500/10 p-3 rounded-lg transition-all mt-8 border border-amber-500/20"><ShieldAlert size={20} /> Süper Admin</Link>}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <header className="h-16 border-b border-zinc-800/50 flex items-center justify-end px-8 bg-[#18181b]/30 backdrop-blur-sm">
          <UserButton appearance={{ elements: { avatarBox: "w-10 h-10 ring-2 ring-zinc-800" } }} />
        </header>
        <div className="flex-1 overflow-auto p-8 relative">
          <div className="absolute top-0 left-0 w-full h-96 bg-emerald-500/5 blur-[120px] -z-10 rounded-full pointer-events-none"></div>
          {children}
        </div>
      </main>
    </div>
  );
}
