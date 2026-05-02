import { getDevices } from '@/actions/dashboard';
import BatchForm from '@/components/BatchForm';
import { SendToBack, Clock, CheckCircle2 } from 'lucide-react';
import { db } from '@/db';
import { batches } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { eq, desc } from 'drizzle-orm';

export default async function BatchesPage() {
  const { userId } = await auth();
  const devices = await getDevices();
  const existingBatches = await db.select()
    .from(batches)
    .where(eq(batches.factoryOwnerId, userId!))
    .orderBy(desc(batches.createdAt));
  
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-12">
      <div>
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center gap-3 mb-8">
          <SendToBack className="text-emerald-500" /> İş Emri (Batch) Gönderimi
        </h1>
        <BatchForm devices={devices} />
      </div>

      <div className="bg-[#18181b]/80 border border-zinc-800 rounded-2xl overflow-hidden shadow-[0_0_15px_rgba(0,0,0,0.2)]">
        <div className="p-6 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-xl font-semibold text-zinc-100">Mevcut İş Emirleri</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-900/30 text-zinc-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-medium">İş Emri No</th>
                <th className="px-6 py-4 font-medium">Cihaz ID</th>
                <th className="px-6 py-4 font-medium">Tarih</th>
                <th className="px-6 py-4 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {existingBatches.map((batch) => (
                <tr key={batch.id} className="hover:bg-zinc-800/20 transition-colors">
                  <td className="px-6 py-4 font-mono text-emerald-400">{batch.workOrderNo}</td>
                  <td className="px-6 py-4 text-zinc-400 text-sm">{batch.deviceId}</td>
                  <td className="px-6 py-4 text-zinc-500 text-xs">
                    {batch.createdAt?.toLocaleDateString('tr-TR')} {batch.createdAt?.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-4">
                    {batch.status === 'pending' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                        <Clock size={12} /> Bekliyor
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        <CheckCircle2 size={12} /> Tamamlandı
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {existingBatches.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 italic">Henüz iş emri bulunmuyor.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
