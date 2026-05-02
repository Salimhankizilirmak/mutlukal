'use client';
import { useState } from 'react';
import { getPresignedUrl, createBatchRecord } from '@/actions/batch';

export default function BatchForm({ devices }: { devices: { id: string; name: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [workOrderNo, setWorkOrderNo] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !workOrderNo || !deviceId) return;
    setIsUploading(true);
    setProgress(0);

    try {
      const { presignedUrl, objectKey } = await getPresignedUrl(workOrderNo, file.name, file.type);
      
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presignedUrl, true);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => xhr.status === 200 ? resolve() : reject();
        xhr.onerror = () => reject();
        xhr.send(file);
      });

      await createBatchRecord({ deviceId, workOrderNo, fileUrl: objectKey, fileSize: file.size });
      alert('İş Emri Başarıyla Cihaza Atandı!');
      setFile(null); setWorkOrderNo(''); setProgress(0);
    } catch {
      alert('Yükleme hatası.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form onSubmit={handleUpload} className="bg-[#18181b]/80 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4">
      <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200">
        <option value="">Hedef Cihazı Seçin</option>
        {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <input type="text" value={workOrderNo} onChange={(e) => setWorkOrderNo(e.target.value)} placeholder="İş Emri Numarası (Örn: BATCH-001)" required className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200" />
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200" />
      {isUploading && <div className="w-full bg-zinc-800 rounded-full h-2.5"><div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div></div>}
      <button type="submit" disabled={isUploading} className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-600 text-white font-semibold px-6 py-3 rounded-lg">{isUploading ? 'Yükleniyor...' : 'Buluta Yükle ve Ata'}</button>
    </form>
  );
}
