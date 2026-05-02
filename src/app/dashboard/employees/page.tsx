import { getEmployees, createEmployee } from '@/actions/employee';
import { getFactoryContext } from '@/lib/auth-context';
import { Users, ShieldCheck, UserPlus } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const { role } = await getFactoryContext();
  const employees = await getEmployees();

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-12">
      <div>
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center gap-3 mb-8">
          <Users className="text-emerald-500" /> Personel Yönetimi
        </h1>
        
        {role === 'Sahip' ? (
          <div className="bg-[#18181b]/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 shadow-[0_0_15px_rgba(16,185,129,0.05)] mb-8">
            <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2 mb-4">
              <UserPlus size={18} className="text-emerald-400" /> Yeni Personel Ekle
            </h2>
            <form action={createEmployee} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input type="text" name="username" placeholder="Kullanıcı Adı" required className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors" />
              <input type="password" name="password" placeholder="Şifre" required className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors" />
              <select name="role" required className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors appearance-none">
                <option value="" disabled selected>Rol Seçiniz</option>
                <option value="Genel Müdür">Genel Müdür</option>
                <option value="Üretim Müdürü">Üretim Müdürü</option>
                <option value="Pazarlama">Pazarlama</option>
                <option value="Lojistik">Lojistik</option>
                <option value="Operatör">Operatör</option>
              </select>
              <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-lg transition-all shadow-[0_0_10px_rgba(5,150,105,0.3)] hover:shadow-[0_0_20px_rgba(5,150,105,0.5)]">Ekle</button>
            </form>
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl flex items-center gap-3">
            <ShieldCheck size={20} />
            <p className="text-sm">Sadece fabrika sahipleri yeni personel ekleyebilir.</p>
          </div>
        )}
      </div>

      <div className="bg-[#18181b]/80 border border-zinc-800 rounded-2xl overflow-hidden shadow-[0_0_15px_rgba(0,0,0,0.2)]">
        <div className="p-6 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-xl font-semibold text-zinc-100">Mevcut Personeller</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-900/30 text-zinc-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-medium">Kullanıcı Adı</th>
                <th className="px-6 py-4 font-medium">Rol</th>
                <th className="px-6 py-4 font-medium">Kayıt Tarihi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-zinc-800/20 transition-colors">
                  <td className="px-6 py-4 font-medium text-zinc-200">{employee.username}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {employee.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500 text-sm">
                    {employee.createdAt?.toLocaleDateString('tr-TR')}
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-zinc-500 italic">Henüz personel bulunmuyor.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
