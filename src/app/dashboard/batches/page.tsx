'use client'

import { useState } from 'react';
import { createBatch } from '@/actions/batch';

export default function BatchesPage() {
  const [deviceId, setDeviceId] = useState('');
  const [workOrderNo, setWorkOrderNo] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !deviceId || !workOrderNo) return;

    try {
      const { uploadUrl } = await createBatch(deviceId, workOrderNo, file.name, file.size);
      
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setProgress(percentComplete);
        }
      };
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          alert('Upload complete!');
          setProgress(0);
        } else {
          alert('Upload failed.');
        }
      };
      
      xhr.send(file);
    } catch (err) {
      console.error(err);
      alert('Error creating batch');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">İş Emri Yükle</h1>
      
      <form onSubmit={handleUpload} className="max-w-md bg-white p-4 shadow rounded">
        <div className="mb-4">
          <label className="block mb-1">Cihaz ID</label>
          <input value={deviceId} onChange={e => setDeviceId(e.target.value)} className="w-full border p-2 rounded" required />
        </div>
        <div className="mb-4">
          <label className="block mb-1">İş Emri No</label>
          <input value={workOrderNo} onChange={e => setWorkOrderNo(e.target.value)} className="w-full border p-2 rounded" required />
        </div>
        <div className="mb-4">
          <label className="block mb-1">Dosya</label>
          <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full border p-2 rounded" required />
        </div>
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded mb-4">Yükle</button>
        
        {progress > 0 && (
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
          </div>
        )}
      </form>
    </div>
  );
}
