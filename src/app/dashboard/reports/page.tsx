import { db } from '@/db';
import { importBatches, devices } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { eq, and, desc } from 'drizzle-orm';
import { FileText } from 'lucide-react';

export default async function ReportsPage() {
  const { userId } = await auth();

  const myDevices = await db.query.devices.findMany({
    where: eq(devices.factoryOwnerId, userId!)
  });
  const deviceIds = myDevices.map(d => d.id);
  const devicesMap = Object.fromEntries(myDevices.map(d => [d.id, d.name]));

  const allCompleted = deviceIds.length > 0
    ? (await Promise.all(
        deviceIds.map(id =>
          db.select().from(importBatches)
            .where(and(eq(importBatches.deviceId, id), eq(importBatches.status, 'completed')))
            .orderBy(desc(importBatches.createdAt))
        )
      )).flat().sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    : [];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 flex items-center gap-3 mb-8">
        <FileText className="text-blue-500" /> Üretim Raporları
      </h1>

      <div className="bg-[#18181b]/80 border border-zinc-800 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.3)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-900/50 text-zinc-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-5 font-medium">İş Emri No</th>
                <th className="px-6 py-5 font-medium">Cihaz</th>
                <th className="px-6 py-5 font-medium">Tamamlanma Tarihi</th>
                <th className="px-6 py-5 text-right font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {allCompleted.map((batch) => (
                <tr key={batch.id} className="hover:bg-zinc-800/20 transition-all">
                  <td className="px-6 py-5">
                    <div className="font-mono text-emerald-400 font-bold">{batch.workOrderNo}</div>
                  </td>
                  <td className="px-6 py-5 text-zinc-400 text-sm">
                    {devicesMap[batch.deviceId] || batch.deviceId}
                  </td>
                  <td className="px-6 py-5 text-zinc-400 text-sm">
                    {batch.createdAt?.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full font-medium">
                      <FileText size={12} /> Rapor Alındı
                    </span>
                  </td>
                </tr>
              ))}
              {allCompleted.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <FileText className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                    <p className="text-zinc-500 italic">Henüz tamamlanmış bir üretim raporu bulunmuyor.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
