import Link from 'next/link';
import { Scissors, FileCode, ArrowRight, Flower } from 'lucide-react';

const tools = [
  {
    title: 'Çoklu Dosya Parçalayıcı (Multi-Splitter)',
    description: 'Germes\'ten gelen fazla ürünleri barındıran XLSX dosyasını tek seferde yükleyin, istediğiniz dosya isimlerini ve barkod adetlerini girerek çoklu parçalara bölün.',
    href: '/dashboard/germes/splitter',
    icon: Scissors,
    color: 'text-pink-400',
    bg: 'bg-pink-400/10',
    border: 'hover:border-pink-500/40',
  },
  {
    title: 'Koli Kodu Atama ve CSV Export (Converter)',
    description: 'Gelen veya parçalanan XLSX dosyasını yükleyin, GS1 şifreleme karakterlerini bozmadan 004 serisinden koli kodlarını (SSCC) atayarak Triton standartlarında CSV alın.',
    href: '/dashboard/germes/converter',
    icon: FileCode,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    border: 'hover:border-purple-500/40',
  },
];

export default function GermesDashboard() {
  return (
    <div className="space-y-8">
      {/* Decorative Title Area */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-pink-950/40 via-purple-950/20 to-zinc-950 p-6 sm:p-8 border border-pink-900/20">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-pink-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl shadow-lg shadow-pink-500/20 text-white">
            <Flower size={28} className="animate-pulse duration-1000" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-pink-500/10 border border-pink-500/20 text-[10px] font-bold tracking-wider text-pink-400 uppercase">
                YENİ PARTNER
              </span>
            </div>
            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
              Hanami Germes Paneli
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Fazla gelen kodları dinamik parçalama ve Triton standartlarında sıralı koli (SSCC) atama merkezi.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className={`group relative bg-[#121214]/80 border border-zinc-800/80 rounded-3xl p-5 sm:p-7 transition-all duration-300 shadow-xl overflow-hidden ${tool.border}`}
          >
            {/* Ambient hover light */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            
            <div className="flex items-start justify-between gap-4 relative z-10">
              <div className="flex items-start sm:items-center gap-4">
                <div className={`p-3.5 ${tool.bg} rounded-2xl shrink-0 transition-transform group-hover:scale-110 duration-300`}>
                  <tool.icon className={tool.color} size={24} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-zinc-100 group-hover:text-white transition-colors tracking-tight">
                    {tool.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1 leading-relaxed font-normal">
                    {tool.description}
                  </p>
                </div>
              </div>
              <ArrowRight className="text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0 mt-1 sm:mt-0" size={20} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
