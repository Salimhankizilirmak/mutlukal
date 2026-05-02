'use client';

import { motion } from 'framer-motion';
import { Activity, Server, CheckCircle2 } from 'lucide-react';

export default function DashboardPage() {
  const stats = [
    { 
      title: 'Aktif Cihazlar', 
      value: '24', 
      label: 'Son 24 saatte %12 artış', 
      icon: Server,
      color: '#4ade80',
      borderClass: 'neon-border',
      progress: 75
    },
    { 
      title: 'Bekleyen İş Emirleri', 
      value: '142', 
      label: 'Kritik seviyeye yakın', 
      icon: Activity,
      color: '#f87171',
      borderClass: 'border border-transparent hover:border-[#f87171] hover:shadow-[0_0_20px_rgba(248,113,113,0.5)] transition-all duration-300',
      progress: 85
    },
    { 
      title: 'Tamamlanan Görevler', 
      value: '1,048', 
      label: 'Bu ayki performans', 
      icon: CheckCircle2,
      color: '#38bdf8',
      borderClass: 'neon-blue-border',
      progress: 92
    }
  ];

  return (
    <div className="space-y-8">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
          Üretim Hattı <span className="neon-text-blue">İzleme Merkezi</span>
        </h1>
        <p className="text-slate-400">Tesislerin ve cihazların anlık durum raporu.</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 * i }}
              whileHover={{ y: -5 }}
              className={`glass-panel p-6 rounded-2xl ${stat.borderClass} flex flex-col justify-between`}
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-sm font-medium text-slate-400 mb-1">{stat.title}</p>
                  <h3 className="text-4xl font-bold text-white">{stat.value}</h3>
                </div>
                <div className="p-3 rounded-xl bg-white/5" style={{ color: stat.color, boxShadow: `0 0 15px ${stat.color}40` }}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
              
              <div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stat.progress}%` }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: stat.color, boxShadow: `0 0 10px ${stat.color}` }}
                  />
                </div>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
      
      {/* Decorative Wave/Grid effect at bottom */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="mt-12 h-64 rounded-2xl border border-white/5 bg-gradient-to-b from-white/5 to-transparent flex items-center justify-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
        <div className="text-center z-10">
          <Activity className="w-16 h-16 mx-auto mb-4 text-white/20" />
          <p className="text-slate-500 font-mono text-sm tracking-widest">AĞ TRAFİĞİ BEKLENİYOR...</p>
        </div>
      </motion.div>
    </div>
  );
}
