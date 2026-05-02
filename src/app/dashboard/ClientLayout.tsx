'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Server, FileText, ShieldAlert } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';

export function ClientLayout({ children, isSuperAdmin }: { children: React.ReactNode, isSuperAdmin: boolean }) {
  const pathname = usePathname();

  const menuItems = [
    { name: 'Kontrol Merkezi', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Hatlar', href: '/dashboard/lines', icon: Server },
    { name: 'Cihazlar', href: '/dashboard/devices', icon: Server },
    { name: 'İş Emirleri', href: '/dashboard/batches', icon: FileText },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#09090b] text-slate-200 font-sans">
      <motion.aside 
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-64 flex flex-col glass-panel m-4 rounded-xl border-white/5 relative z-10"
      >
        <div className="p-6 flex items-center space-x-3 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#4ade80] to-[#38bdf8] shadow-[0_0_15px_rgba(74,222,128,0.4)] flex items-center justify-center">
            <Server className="w-5 h-5 text-black" />
          </div>
          <span className="text-xl font-bold tracking-wider text-white neon-text-blue">NEXUS</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link key={item.name} href={item.href}>
                <motion.div
                  whileHover={{ x: 5, backgroundColor: 'rgba(255,255,255,0.05)' }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center px-4 py-3 rounded-lg transition-colors relative overflow-hidden group ${isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  {isActive && (
                    <motion.div 
                      layoutId="activeTab" 
                      className="absolute left-0 top-0 bottom-0 w-1 bg-[#4ade80] shadow-[0_0_10px_#4ade80]"
                    />
                  )}
                  <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-[#4ade80]' : 'group-hover:text-[#38bdf8] transition-colors'}`} />
                  <span className="font-medium">{item.name}</span>
                </motion.div>
              </Link>
            );
          })}
          
          {isSuperAdmin && (
            <div className="mt-8 pt-4 border-t border-white/10">
              <Link href="/dashboard/super-admin">
                <motion.div
                  whileHover={{ x: 5, backgroundColor: 'rgba(234, 179, 8, 0.1)' }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center px-4 py-3 rounded-lg transition-colors relative overflow-hidden group text-yellow-500 hover:text-yellow-400 border border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.15)]"
                >
                  <ShieldAlert className="w-5 h-5 mr-3 group-hover:drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" />
                  <span className="font-medium group-hover:drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]">Süper Admin Paneli</span>
                </motion.div>
              </Link>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-white/10 flex items-center justify-between">
           <div className="flex items-center space-x-3">
             <UserButton appearance={{ elements: { userButtonAvatarBox: "w-10 h-10 border border-white/20" } }} />
             <span className="text-sm text-slate-400">Admin</span>
           </div>
        </div>
      </motion.aside>

      <main className="flex-1 relative z-0 overflow-y-auto p-4 pl-0">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="h-full glass-panel rounded-xl p-8"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
