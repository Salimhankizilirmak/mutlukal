'use client';

import { useState, useEffect, useRef } from 'react';
import { Scan, Trash2, Download, AlertCircle, X, Volume2, VolumeX, CheckCircle2 } from 'lucide-react';
import { GS1ToolCard } from '@/components/GS1ToolCard';

export default function ScannerPage() {
  const [codes, setCodes] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'warn' | '' }>({ text: '', type: '' });
  const [soundEnabled, setSoundEnabled] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Play beep sound using Web Audio API
  const playBeep = (frequency: number, duration: number, type: OscillatorType = 'sine') => {
    if (!soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.error('Audio play failed', e);
    }
  };

  const playSuccessBeep = () => playBeep(880, 0.1, 'sine');
  const playWarnBeep = () => playBeep(220, 0.3, 'sawtooth');
  const playRemoveBeep = () => playBeep(440, 0.1, 'sine');

  // Keep input focused at all times
  useEffect(() => {
    const handleFocus = () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    };

    handleFocus();

    const handleWindowClick = (e: MouseEvent) => {
      // Don't hijack focus if they are clicking a button, input, or an interactive element
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'INPUT' ||
        target.closest('button') ||
        target.closest('a') ||
        target.classList.contains('remove-btn')
      ) {
        return;
      }
      handleFocus();
    };

    window.addEventListener('click', handleWindowClick);
    return () => {
      window.removeEventListener('click', handleWindowClick);
    };
  }, []);

  const showFeedback = (text: string, type: 'success' | 'warn') => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    setFeedback({ text, type });
    feedbackTimerRef.current = setTimeout(() => {
      setFeedback({ text: '', type: '' });
    }, 4000);
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputValue.trim();
    setInputValue('');

    if (!val) return;

    // Check for duplicates in current session
    if (codes.includes(val)) {
      showFeedback(`MÜKERRER BARKOD: Bu kod listede zaten var!`, 'warn');
      playWarnBeep();
    } else {
      // Add to beginning of array so it displays at the top of the UI list
      setCodes((prev) => [val, ...prev]);
      showFeedback(`Başarıyla eklendi: ${val.substring(0, 30)}...`, 'success');
      playSuccessBeep();
    }
  };

  const removeCode = (idx: number) => {
    setCodes((prev) => prev.filter((_, i) => i !== idx));
    showFeedback('Kod listeden çıkartıldı.', 'success');
    playRemoveBeep();
  };

  const clearList = () => {
    if (window.confirm('Tüm listeyi temizlemek istediğinize emin misiniz?')) {
      setCodes([]);
      showFeedback('Liste temizlendi.', 'success');
      playBeep(330, 0.2, 'sine');
    }
  };

  const exportToCSV = () => {
    if (codes.length === 0) {
      alert('Dışarı aktarılacak kod bulunamadı!');
      return;
    }

    // UTF-8 BOM prefix
    let csvContent = '\ufeff';

    // Reverse list back to original scan order (oldest/first scanned code first)
    const chronologicalCodes = [...codes].reverse();
    csvContent += chronologicalCodes.join('\r\n') + '\r\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '');

    link.setAttribute('href', url);
    link.setAttribute('download', `el_terminali_okuma_${dateStr}_${timeStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      <GS1ToolCard
        title="Karekod Terminal Okuyucu"
        description="El terminali ile okutulan barkodları hızlıca listeler, mükerrer kontrolü yapar ve CSV olarak kaydeder."
        icon={Scan}
      >
        <div className="space-y-6">
          {/* Sound toggle & Info bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <p className="text-xs text-zinc-400">
                El terminaliniz klavye modunda (wedge) olmalıdır. Taramalar otomatik yakalanır.
              </p>
            </div>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                soundEnabled
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                  : 'bg-zinc-800/40 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {soundEnabled ? 'Ses Açık' : 'Ses Kapalı'}
            </button>
          </div>

          {/* Form scanner input */}
          <form onSubmit={handleScanSubmit} className="space-y-2">
            <label htmlFor="barcodeInput" className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">
              Terminal Girişi (Sayfaya tıklayarak odağı koruyabilirsiniz)
            </label>
            <input
              id="barcodeInput"
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Barkodu okutun veya yapıştırıp Enter'a basın..."
              autoComplete="off"
              className="w-full bg-[#09090b] border border-zinc-800 rounded-xl px-5 py-4 text-zinc-100 text-base font-mono outline-none focus:border-indigo-500 focus:shadow-[0_0_15px_rgba(99,102,241,0.15)] transition-all"
            />
          </form>

          {/* Feedback Messages */}
          {feedback.text && (
            <div
              className={`flex items-start gap-3 p-4 rounded-xl text-xs border ${
                feedback.type === 'warn'
                  ? 'bg-red-500/5 border-red-500/20 text-red-400'
                  : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
              }`}
            >
              {feedback.type === 'warn' ? (
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-mono break-all">{feedback.text}</div>
            </div>
          )}

          {/* Main List Section */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-zinc-400">Okutulan Ürün Listesi</span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold font-mono">
                {codes.length} Kod
              </span>
            </div>

            <div className="border border-zinc-800 rounded-xl bg-zinc-950/50 max-h-80 overflow-y-auto divide-y divide-zinc-900 scrollbar-thin scrollbar-thumb-zinc-800">
              {codes.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  Henüz kod okutulmadı. Taramaya başlayabilirsiniz.
                </div>
              ) : (
                codes.map((code, idx) => {
                  const displayIndex = codes.length - idx;
                  return (
                    <div key={idx} className="flex items-center justify-between p-3.5 hover:bg-zinc-900/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                        <span className="text-zinc-500 font-bold font-mono text-xs select-none">
                          #{displayIndex}
                        </span>
                        <span className="text-zinc-300 font-mono text-xs truncate select-all" title={code}>
                          {code}
                        </span>
                      </div>
                      <button
                        onClick={() => removeCode(idx)}
                        className="remove-btn p-1 text-zinc-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                        title="Listeden Çıkart"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <button
              onClick={exportToCSV}
              disabled={codes.length === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/25"
            >
              <Download size={18} />
              CSV Olarak İndir (Yedekle)
            </button>
            <button
              onClick={clearList}
              disabled={codes.length === 0}
              className="px-6 py-4 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-900 disabled:hover:border-zinc-800 text-red-400 font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <Trash2 size={18} />
              Listeyi Temizle
            </button>
          </div>
        </div>
      </GS1ToolCard>
    </div>
  );
}
