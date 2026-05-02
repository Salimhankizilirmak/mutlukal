import { db } from '@/db';
import { importBatches, devices, productionReports } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';
import { eq, desc, inArray } from 'drizzle-orm';
import { FileText, ClipboardList } from 'lucide-react';
import ReportActions from '@/components/ReportActions';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const { userId } = await auth();

  const myDevices = await db.query.devices.findMany({
    where: eq(devices.factoryOwnerId, userId!)
  });
  
  if (myDevices.length === 0) {
    return (
      <div className="p-8 max-w-5xl mx-auto text-center">
        <h1 className="text-3xl font-bold text-zinc-100 mb-4">Üretim Raporları</h1>
        <p className="text-zinc-500">Henüz kayıtlı bir cihazınız bulunmuyor.</p>
      </div>
    );
  }

  const deviceIds = myDevices.map(d => d.id);
  const devicesMap = Object.fromEntries(myDevices.map(d => [d.id, d.name]));

  // Bu cihazlara ait tüm raporları çek
  // Önce bu cihazlara ait batch'leri bulalım
  const batches = await db.select().from(importBatches).where(inArray(importBatches.deviceId, deviceIds));
  const batchIds = batches.map(b => b.id);
  const batchesMap = Object.fromEntries(batches.map(b => [b.id, b]));

  const allReports = batchIds.length > 0 
    ? await db.select().from(productionReports)
        .where(inArray(productionReports.batchId, batchIds))
        .orderBy(desc(productionReports.createdAt))
    : [];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 flex items-center gap-3 mb-2">
            <FileText className="text-blue-500" /> Üretim Raporları
          </h1>
          <p className="text-zinc-500 text-sm">
            Cihazlardan gelen tüm rapor dosyalarını buradan yönetebilirsiniz.
          </p>
        </div>
      </div>

      <div className="bg-[#18181b]/80 border border-zinc-800 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.3)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-900/50 text-zinc-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-5 font-medium">Rapor Dosyası</th>
                <th className="px-6 py-5 font-medium">İş Emri No</th>
                <th className="px-6 py-5 font-medium">Cihaz</th>
                <th className="px-6 py-5 font-medium">Tarih</th>
                <th className="px-6 py-5 text-right font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {allReports.map((report) => {
                const batch = batchesMap[report.batchId];
                return (
                  <tr key={report.id} className="hover:bg-zinc-800/20 transition-all">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-500/10 p-2 rounded-lg border border-blue-500/20 text-blue-400">
                          <FileText size={18} />
                        </div>
                        <div>
                          <div className="text-zinc-200 font-medium text-sm truncate max-w-[200px]">{report.fileName}</div>
                          <div className="text-[10px] text-zinc-600 font-mono">{report.id.substring(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <ClipboardList size={14} className="text-emerald-500" />
                        <span className="font-mono text-emerald-400 font-bold text-sm">
                          {batch?.workOrderNo || 'Bilinmiyor'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-zinc-400 text-sm">
                      {batch ? (devicesMap[batch.deviceId] || batch.deviceId) : '-'}
                    </td>
                    <td className="px-6 py-5 text-zinc-400 text-sm">
                      {report.createdAt?.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <ReportActions
                        workOrderNo={batch?.workOrderNo || 'RAPOR'}
                        downloadUrl={batch?.fileUrl || ''}
                        reportUrl={report.fileUrl}
                      />
                    </td>
                  </tr>
                );
              })}
              {allReports.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="bg-zinc-900/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-800">
                      <FileText className="w-8 h-8 text-zinc-700" />
                    </div>
                    <p className="text-zinc-500 italic">Henüz bir üretim raporu bulunmuyor.</p>
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
