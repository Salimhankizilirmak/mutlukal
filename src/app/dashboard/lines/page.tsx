import { getLines, createLine } from '@/actions/dashboard';
import { Activity } from 'lucide-react';

export default async function LinesPage() {
  const lines = await getLines();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center gap-3">
          <Activity className="text-emerald-500" /> Üretim Hatları
        </h1>
      </div>

      <div className="bg-[#18181b]/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 shadow-[0_0_15px_rgba(16,185,129,0.05)] mb-8">
        <form action={createLine} className="flex gap-4">
          <input type="text" name="name" placeholder="Yeni Hat Adı (Örn: Lavaş Kesim Hattı 1)" required className="flex-1 bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors" />
          <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-lg transition-all shadow-[0_0_10px_rgba(5,150,105,0.3)] hover:shadow-[0_0_20px_rgba(5,150,105,0.5)]">Hat Ekle</button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {lines.map((line) => (
          <div key={line.id} className="bg-[#18181b]/50 border border-zinc-800 rounded-xl p-5 hover:border-emerald-500/30 transition-all group">
            <h3 className="text-lg font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors">{line.name}</h3>
            <p className="text-zinc-500 text-sm mt-2">Sistem ID: <span className="font-mono text-xs text-zinc-600">{line.id.split('-')[0]}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}
