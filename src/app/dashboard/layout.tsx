import { isSuperAdmin } from '@/lib/roles';
import { getFactoryContext } from '@/lib/auth-context';
import { UserButton, OrganizationSwitcher } from '@clerk/nextjs';
import Link from 'next/link';
import { Activity, MonitorDot, SendToBack, ShieldAlert, Factory, FileText, Users } from 'lucide-react';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await isSuperAdmin();
  const context = await getFactoryContext();

  const displayName = isAdmin && context.factoryId === 'admin' ? 'SÜPER ADMİN' : 'LAVAŞ TRACE';

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
          <Link href="/dashboard/reports" className="flex items-center gap-3 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/30 p-3 rounded-lg transition-all"><FileText size={20} /> Raporlar</Link>
          <Link href="/dashboard/employees" className="flex items-center gap-3 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/30 p-3 rounded-lg transition-all"><Users size={20} /> Personeller</Link>
          {isAdmin && <Link href="/dashboard/super-admin" className="flex items-center gap-3 text-amber-500 hover:bg-amber-500/10 p-3 rounded-lg transition-all mt-8 border border-amber-500/20"><ShieldAlert size={20} /> Süper Admin</Link>}
        </nav>
        
        <div className="p-4 border-t border-zinc-800/50">
          <a
            href="/downloads/Lavas_Agent.exe"
            download
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.25)] hover:shadow-[0_0_25px_rgba(37,99,235,0.45)] text-sm border border-blue-500/30"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Lavaş Trace Masaüstü Ajanı
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col pb-20 md:pb-0 w-full max-w-full overflow-hidden">
        <header className="h-16 border-b border-zinc-800/50 flex items-center justify-end gap-4 px-4 md:px-8 bg-[#18181b]/30 backdrop-blur-sm shrink-0">
          <OrganizationSwitcher 
            hidePersonal={true}
            appearance={{ 
              elements: { 
                organizationSwitcherTrigger: "focus:shadow-none hover:bg-zinc-800/50 px-2 py-1 rounded-lg text-zinc-300",
                organizationSwitcherTriggerIcon: "text-zinc-400"
              } 
            }} 
          />
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
        <Link href="/dashboard/reports" className="flex flex-col items-center gap-1 text-zinc-400 hover:text-emerald-400"><FileText size={24} /><span className="text-[10px]">Raporlar</span></Link>
        <Link href="/dashboard/employees" className="flex flex-col items-center gap-1 text-zinc-400 hover:text-emerald-400"><Users size={24} /><span className="text-[10px]">Personel</span></Link>
        {isAdmin && <Link href="/dashboard/super-admin" className="flex flex-col items-center gap-1 text-amber-500 hover:text-amber-400"><ShieldAlert size={24} /><span className="text-[10px]">Admin</span></Link>}
      </nav>
    </div>
  );
}
