/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect } from 'react';
import { Building2, Plus, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { createB2BClient, getB2BClients } from './actions';

export default function B2BDashboardPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClientName, setNewClientName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const fetchClients = async () => {
    try {
      const list = await getB2BClients();
      setClients(list);
    } catch (err: any) {
      setError(err.message || 'Müşteriler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('name', newClientName.trim());
      await createB2BClient(fd);
      setNewClientName('');
      await fetchClients();
    } catch (err: any) {
      setError(err.message || 'Firma eklenemedi.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto px-4 py-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-indigo-950/30 p-6 sm:p-8 border border-zinc-800 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/20 text-white shrink-0">
            <Building2 size={28} />
          </div>
          <div>
            <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold tracking-wider text-indigo-400 uppercase">
              B2B YÖNETİM MERKEZİ
            </span>
            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
              Müşteri Yönetim Portalı
            </h1>
            <p className="text-xs text-zinc-400 mt-1 max-w-xl">
              B2B sipariş akışlarını, şablon atamalarını ve nihai SSCC koli raporlarını firmalara göre yönetin.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl text-xs font-bold animate-in fade-in duration-200">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Modern 'Yeni Firma Ekle' Form */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-transparent to-transparent pointer-events-none"></div>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <Plus size={16} className="text-indigo-400" /> Yeni Firma Tanımla
        </h2>
        <form onSubmit={handleCreateClient} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newClientName}
            onChange={e => setNewClientName(e.target.value)}
            placeholder="Örn: Triton, BİM, Migros..."
            required
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500/50 transition-colors"
          />
          <button
            type="submit"
            disabled={creating || !newClientName.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-extrabold px-6 py-3 rounded-2xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 shrink-0"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            <span>Firma Ekle</span>
          </button>
        </form>
      </div>

      {/* Firmalar Vitrini Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-lg font-bold text-white">Müşteri Firmalar</h2>
          <span className="text-xs text-zinc-500 font-mono">{clients.length} Kayıtlı Firma</span>
        </div>

        {clients.length === 0 ? (
          <div className="bg-zinc-900/20 border border-zinc-800 border-dashed rounded-3xl p-12 text-center text-zinc-500 text-sm">
            <Building2 size={48} className="mx-auto text-zinc-700 mb-3" />
            <p>Sistemde tanımlı B2B firması bulunamadı.</p>
            <p className="text-xs text-zinc-600 mt-1">Yukarıdaki panelden ilk firmayı ekleyebilirsiniz.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {clients.map(client => (
              <Link
                key={client.id}
                href={`/dashboard/b2b/client/${client.id}`}
                className="group relative overflow-hidden bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700/80 rounded-3xl p-6 transition-all duration-300 flex flex-col justify-between h-44 shadow-lg hover:shadow-xl hover:translate-y-[-2px]"
              >
                {/* Decorative background shape */}
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-indigo-500/5 group-hover:bg-indigo-500/10 rounded-full blur-xl pointer-events-none transition-all"></div>
                
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center text-indigo-400 group-hover:text-indigo-300 transition-colors">
                    <Building2 size={20} />
                  </div>
                  <h3 className="text-lg font-extrabold text-white group-hover:text-indigo-400 transition-colors mt-2">
                    {client.name}
                  </h3>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-800 mt-4">
                  <span className="text-[10px] text-zinc-500 font-medium">
                    Kayıt: {new Date(client.createdAt).toLocaleDateString('tr-TR')}
                  </span>
                  <div className="flex items-center gap-1 text-xs font-bold text-indigo-400 group-hover:text-indigo-300 transition-colors">
                    <span>Siparişler</span>
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
