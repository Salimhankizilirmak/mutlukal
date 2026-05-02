'use client';
import { useState } from 'react';
import { sendFactoryInvite } from '@/actions/invite';

export default function SuperAdminPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Gönderiliyor...');
    const result = await sendFactoryInvite(email);
    if (result.success) setStatus('Davet başarıyla gönderildi!');
    else setStatus('Hata: ' + result.error);
  };

  return (
    <div className="p-8 max-w-2xl text-zinc-100">
      <h1 className="text-3xl font-bold mb-6 text-emerald-500">Süper Admin Kontrol Paneli</h1>
      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
        <h2 className="text-xl font-semibold mb-4">Yeni Fabrika Davet Et</h2>
        <form onSubmit={handleInvite} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Fabrika Yöneticisinin E-posta Adresi"
            className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded focus:border-emerald-500 outline-none text-zinc-100"
            required
          />
          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 p-3 rounded font-bold transition">
            Davet Maili Gönder
          </button>
        </form>
        {status && <p className="mt-4 text-sm text-zinc-400">{status}</p>}
      </div>
    </div>
  );
}
