import { isSuperAdmin } from '@/lib/roles';
import { sendFactoryInvite } from '@/actions/invite';
import { redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

export default async function SuperAdminPage() {
  const isAdmin = await isSuperAdmin();
  if (!isAdmin) redirect('/dashboard');

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-amber-500 flex items-center gap-3 mb-8">
        <ShieldAlert /> Süper Admin Kontrol Merkezi
      </h1>
      <div className="bg-[#18181b]/80 border border-amber-500/30 rounded-2xl p-6 shadow-[0_0_15px_rgba(245,158,11,0.05)]">
        <h2 className="text-xl font-semibold text-zinc-100 mb-4">Yeni Fabrika Ekle (Davet Gönder)</h2>
        <form action={async (formData) => {
          'use server';
          const email = formData.get('email') as string;
          await sendFactoryInvite(email);
        }} className="flex gap-4">
          <input type="email" name="email" placeholder="Fabrika Sahibinin E-posta Adresi" required className="flex-1 bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-amber-500/50" />
          <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-6 py-3 rounded-lg transition-all shadow-[0_0_10px_rgba(217,119,6,0.3)]">Davet Linki Gönder</button>
        </form>
      </div>
    </div>
  );
}
