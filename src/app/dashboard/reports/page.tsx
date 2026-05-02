import { db } from '@/db';
import { batches } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { eq, and, desc } from 'drizzle-orm';
import { FileText, Download, ExternalLink } from 'lucide-react';

export default async function ReportsPage() {
  const { userId } = await auth();
  
  const completedBatches = await db.select()
    .from(batches)
    .where(and(
      eq(batches.factoryOwnerId, userId!),
      eq(batches.status, 'completed')
    ))
    .orderBy(desc(batches.createdAt));

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
                <th className="px-6 py-5 font-medium">Tamamlanma Tarihi</th>
                <th className="px-6 py-5 font-medium">Rapor</th>
                <th className="px-6 py-5 text-right font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {completedBatches.map((batch) => (
                <tr key={batch.id} className="hover:bg-zinc-800/20 transition-all group">
                  <td className="px-6 py-5">
                    <div className="font-mono text-emerald-400 font-bold">{batch.workOrderNo}</div>
                    <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-tighter">Cihaz: {batch.deviceId}</div>
                  </td>
                  <td className="px-6 py-5 text-zinc-400 text-sm">
                    {batch.createdAt?.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-800/50 px-2 py-1 rounded border border-zinc-700">
                      <FileText size={14} className="text-blue-400" /> PDF Raporu
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors title='Görüntüle'">
                        <ExternalLink size={18} />
                      </button>
                      <a 
                        href={`#`} 
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-[0_0_10px_rgba(37,99,235,0.2)]"
                      >
                        <Download size={14} /> İNDİR
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {completedBatches.length === 0 && (
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
