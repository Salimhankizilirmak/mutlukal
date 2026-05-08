import Link from 'next/link';
import { RefreshCw, Scissors, FileCode, ShieldAlert, ArrowRight, Smartphone } from 'lucide-react';

const tools = [
  {
    title: 'Eksik Tamamlama (Reconcile)',
    description: 'Excel raporu ve CSV referansını birleştirerek eksik kodları tamamlar ve 30/case koli kodları üretir.',
    href: '/dashboard/gs1/reconcile',
    icon: RefreshCw,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
  },
  {
    title: 'Adet Ayarlama (Subset)',
    description: 'Büyük kod dosyalarını istenen adete göre keser ve koli kodlarını otomatik olarak günceller.',
    href: '/dashboard/gs1/subset',
    icon: Scissors,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
  },
  {
    title: 'XLSX Dönüştürücü (Convert)',
    description: 'CSV dosyalarını, GS1 kontrol karakterlerini (\x1d) bozmadan tek sütunlu XLSX formatına dönüştürür.',
    href: '/dashboard/gs1/convert',
    icon: FileCode,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
  },
  {
    title: 'Çakışma Giderici (Conflicts)',
    description: 'Rus ortaklardan gelen mükerrer koli hatası raporlarını kullanarak koli kodlarını temizler.',
    href: '/dashboard/gs1/conflicts',
    icon: ShieldAlert,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
  },
  {
    title: 'Mobil Agent (QR Scanner)',
    description: 'Sahada ürün değişimi ve koli denetimi yapmanızı sağlar. QR okutarak hızlıca işlem yapın.',
    href: '/dashboard/gs1/mobile-agent',
    icon: Smartphone,
    color: 'text-zinc-100',
    bg: 'bg-zinc-100/10',
  },
];

export default function GS1Dashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">GS1 Barcode Araçları</h1>
        <p className="text-zinc-500">Lojistik ortakları için veri hazırlama ve düzeltme araçları.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group relative bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 sm:p-6 hover:border-zinc-700 transition-all shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                <div className={`p-2 sm:p-3 ${tool.bg} rounded-xl shrink-0`}>
                  <tool.icon className={tool.color} size={20} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-lg font-bold text-zinc-100 group-hover:text-white transition-colors">
                    {tool.title}
                  </h3>
                  <p className="text-[11px] sm:text-sm text-zinc-500 mt-0.5 sm:mt-1 leading-relaxed">{tool.description}</p>
                </div>
              </div>
              <ArrowRight className="text-zinc-700 group-hover:text-zinc-500 transition-colors shrink-0 mt-1 sm:mt-0" size={18} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
