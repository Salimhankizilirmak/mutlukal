import { db } from '@/db';
import { devices } from '@/db/schema';
import { createDevice } from '@/actions/device';

export default async function DevicesPage() {
  const deviceList = await db.select().from(devices);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Cihazlar</h1>
      
      <form action={createDevice} className="mb-8 p-4 bg-white shadow rounded max-w-md">
        <h2 className="text-lg font-semibold mb-4">Yeni Cihaz Ekle</h2>
        <div className="mb-4">
          <label className="block mb-1">Cihaz Adı</label>
          <input name="name" className="w-full border p-2 rounded" required />
        </div>
        <div className="mb-4">
          <label className="block mb-1">Hat ID (Şimdilik manuel)</label>
          <input name="lineId" className="w-full border p-2 rounded" required />
        </div>
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">Ekle</button>
      </form>

      <div className="bg-white shadow rounded p-4">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="p-2 border-b">ID</th>
              <th className="p-2 border-b">İsim</th>
              <th className="p-2 border-b">PIN Kodu</th>
            </tr>
          </thead>
          <tbody>
            {deviceList.map(d => (
              <tr key={d.id}>
                <td className="p-2 border-b">{d.id}</td>
                <td className="p-2 border-b">{d.name}</td>
                <td className="p-2 border-b font-mono font-bold text-lg">{d.pinCode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
