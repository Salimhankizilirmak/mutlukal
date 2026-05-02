import { getLines, getDevices, createDevice } from '@/actions/dashboard';
import { MonitorDot } from 'lucide-react';

export default async function DevicesPage() {
  const lines = await getLines();
  const devices = await getDevices();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center gap-3">
          <MonitorDot className="text-emerald-500" /> Cihaz Yönetimi
        </h1>
      </div>

      <div className="bg-[#18181b]/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 shadow-[0_0_15px_rgba(16,185,129,0.05)] mb-8">
        <form action={createDevice} className="flex gap-4 items-center">
          <select name="lineId" required className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50">
            <option value="">Hat Seçin</option>
            {lines.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}
          </select>
          <input type="text" name="name" placeholder="Cihaz Adı (Örn: Paketleme PC)" required className="flex-1 bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50" />
          <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-lg transition-all shadow-[0_0_10px_rgba(5,150,105,0.3)]">Cihaz Ekle</button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {devices.map((device) => (
          <div key={device.id} className="bg-[#18181b]/50 border border-zinc-800 rounded-xl p-5 flex justify-between items-center hover:border-emerald-500/30 transition-all">
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">{device.name}</h3>
              <p className="text-zinc-500 text-sm mt-1">Bağlantı PIN Kodu:</p>
            </div>
            <div className="bg-[#09090b] border border-zinc-800 px-4 py-2 rounded-lg">
              <span className="text-2xl font-mono font-bold text-emerald-400 tracking-widest">{device.pinCode}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
