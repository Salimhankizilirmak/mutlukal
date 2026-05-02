'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { createEmployee } from '@/actions/employee';
import { UserPlus, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

const initialState = {
  error: null,
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-lg transition-all shadow-[0_0_10px_rgba(5,150,105,0.3)] hover:shadow-[0_0_20px_rgba(5,150,105,0.5)] flex items-center justify-center gap-2"
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
      Ekle
    </button>
  );
}

export default function EmployeeForm() {
  const [state, formAction] = useFormState(createEmployee, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <div className="bg-[#18181b]/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 shadow-[0_0_15px_rgba(16,185,129,0.05)] mb-8">
      <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2 mb-4">
        <UserPlus size={18} className="text-emerald-400" /> Yeni Personel Ekle
      </h2>
      
      <form ref={formRef} action={formAction} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            name="username"
            placeholder="Kullanıcı Adı"
            required
            className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="password"
            name="password"
            placeholder="Şifre"
            required
            className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <select
            name="role"
            required
            className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors appearance-none"
          >
            <option value="" disabled selected>Rol Seçiniz</option>
            <option value="Genel Müdür">Genel Müdür</option>
            <option value="Üretim Müdürü">Üretim Müdürü</option>
            <option value="Pazarlama">Pazarlama</option>
            <option value="Lojistik">Lojistik</option>
            <option value="Operatör">Operatör</option>
          </select>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            {state.error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 px-4 py-2 rounded-lg animate-in fade-in slide-in-from-top-1">
                <AlertCircle size={16} />
                {state.error}
              </div>
            )}
            {state.success && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-400/10 border border-emerald-400/20 px-4 py-2 rounded-lg animate-in fade-in slide-in-from-top-1">
                <CheckCircle2 size={16} />
                Personel başarıyla oluşturuldu.
              </div>
            )}
          </div>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
