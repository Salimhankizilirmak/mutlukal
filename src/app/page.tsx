import Link from 'next/link';
import { ArrowRight, Factory, Zap, ShieldCheck, Activity, Cpu } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-50 font-sans selection:bg-emerald-500/30">
      {/* Navbar */}
      <nav className="fixed w-full z-50 bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <Factory className="text-white w-6 h-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-zinc-100">Lavaş Trace</span>
          </div>
          <div className="flex gap-4">
            <Link href="/sign-in" className="px-5 py-2.5 text-sm font-medium text-zinc-300 hover:text-white transition-colors">
              Müşteri Girişi
            </Link>
            <Link href="/sign-up" className="px-5 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all shadow-[0_0_15px_rgba(5,150,105,0.3)] hover:shadow-[0_0_25px_rgba(5,150,105,0.5)] flex items-center gap-2">
              Sisteme Katıl <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative pt-32 pb-16 sm:pt-40 sm:pb-24 lg:pb-32 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800/50 border border-zinc-700/50 text-emerald-400 text-sm font-medium mb-8 backdrop-blur-sm">
            <Zap className="w-4 h-4" /> Endüstri 4.0 Standardında Üretim
          </div>
          
          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-zinc-100 mb-8 leading-tight">
            Üretim Hattınızı <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">
              Geleceğe Bağlayın
            </span>
          </h1>
          
          <p className="mt-6 text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Lavaş Trace ile sahadaki tüm makinelerinizi tek bir merkezden yönetin. İş emirlerini saniyeler içinde iletin, raporları anlık alın ve verimliliği zirveye taşıyın.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/sign-up" className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(5,150,105,0.4)] flex items-center justify-center gap-2">
              Ücretsiz Başlayın <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="mailto:iletisim@novexistech.com" className="w-full sm:w-auto px-8 py-4 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-lg font-semibold rounded-xl transition-all backdrop-blur-sm flex items-center justify-center">
              Bizimle İletişime Geçin
            </Link>
          </div>
        </div>
      </main>

      {/* Features Grid */}
      <section className="py-24 bg-[#0c0c0e] border-t border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-zinc-100 mb-4">Neden Lavaş Trace?</h2>
            <p className="text-zinc-400">Karmaşık kabloları ve kağıt işlerini unutun. Dijital dönüşüm parmaklarınızın ucunda.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-[#18181b]/50 border border-zinc-800 hover:border-emerald-500/30 p-8 rounded-2xl transition-all group backdrop-blur-sm">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Activity className="text-emerald-400 w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-100 mb-3">Gerçek Zamanlı İzleme</h3>
              <p className="text-zinc-400 leading-relaxed">Hangi makinede hangi iş emrinin çalıştığını, bitenleri ve bekleyenleri canlı olarak kontrol panosundan takip edin.</p>
            </div>

            <div className="bg-[#18181b]/50 border border-zinc-800 hover:border-emerald-500/30 p-8 rounded-2xl transition-all group backdrop-blur-sm">
              <div className="w-12 h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Cpu className="text-cyan-400 w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-100 mb-3">Masaüstü Ajan Entegrasyonu</h3>
              <p className="text-zinc-400 leading-relaxed">Sahadaki eski bilgisayarlar bile Lavaş Ajan sayesinde saniyeler içinde akıllı bir endüstriyel terminale dönüşür.</p>
            </div>

            <div className="bg-[#18181b]/50 border border-zinc-800 hover:border-emerald-500/30 p-8 rounded-2xl transition-all group backdrop-blur-sm">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ShieldCheck className="text-amber-400 w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-zinc-100 mb-3">Sıfır Veri Kaybı</h3>
              <p className="text-zinc-400 leading-relaxed">Kopuk internet veya elektrik kesintilerinde bile cihazlar kendi içinde senkronize kalır, iş emri güvenliğini sağlar.</p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="border-t border-zinc-800/50 py-12 bg-[#09090b]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <Factory className="text-emerald-500 w-5 h-5" />
            <span className="font-bold text-zinc-300">Lavaş Trace</span>
          </div>
          <p className="text-zinc-500 text-sm">© 2026 Novexis Tech. Tüm hakları saklıdır.</p>
        </div>
      </footer>
    </div>
  );
}
