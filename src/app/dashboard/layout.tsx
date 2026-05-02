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
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex w-64 bg-[#18181b]/50 border-r border-zinc-800/50 backdrop-blur-xl flex-col">
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
        
        <div className="p-4 border-t border-zinc-800/50">
          <a href="/downloads/Lavas_Agent.exe" download className="w-full bg-blue-600/20 border border-blue-500/50 hover:bg-blue-600 hover:text-white text-blue-400 font-semibold py-3 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(37,99,235,0.1)] flex items-center justify-center gap-2 text-sm text-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Ajanı İndir (Windows)
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col pb-20 md:pb-0 w-full max-w-full overflow-hidden">
        <header className="h-16 border-b border-zinc-800/50 flex items-center justify-end px-4 md:px-8 bg-[#18181b]/30 backdrop-blur-sm shrink-0">
          <UserButton appearance={{ elements: { avatarBox: "w-10 h-10 ring-2 ring-zinc-800" } }} />
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-8 relative">
          <div className="absolute top-0 left-0 w-full h-96 bg-emerald-500/5 blur-[120px] -z-10 rounded-full pointer-events-none"></div>
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#18181b]/95 backdrop-blur-xl border-t border-zinc-800/50 flex justify-around p-3 z-50">
        <Link href="/dashboard/lines" className="flex flex-col items-center gap-1 text-zinc-400 hover:text-emerald-400"><Activity size={24} /><span className="text-[10px]">Hatlar</span></Link>
        <Link href="/dashboard/devices" className="flex flex-col items-center gap-1 text-zinc-400 hover:text-emerald-400"><MonitorDot size={24} /><span className="text-[10px]">Cihazlar</span></Link>
        <Link href="/dashboard/batches" className="flex flex-col items-center gap-1 text-zinc-400 hover:text-emerald-400"><SendToBack size={24} /><span className="text-[10px]">İş Emirleri</span></Link>
        {isAdmin && <Link href="/dashboard/super-admin" className="flex flex-col items-center gap-1 text-amber-500 hover:text-amber-400"><ShieldAlert size={24} /><span className="text-[10px]">Admin</span></Link>}
      </nav>
    </div>
  );
}
