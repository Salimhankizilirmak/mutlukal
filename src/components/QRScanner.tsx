/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface QRScannerProps {
  onScan: (text: string) => void;
  fps?: number;
  qrbox?: number;
}

export function QRScanner({ onScan, fps = 20, qrbox = 280 }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isWasmLoaded, setIsWasmLoaded] = useState<boolean>(false);
  const streamRef = useRef<MediaStream | null>(null);
  const readBarcodesRef = useRef<any>(null);

  // 1. WebAssembly Loader
  useEffect(() => {
    let active = true;
    async function initWasm() {
      try {
        // Dynamically import zxing-wasm/reader to avoid SSR issues
        const { readBarcodes, prepareZXingModule } = await import('zxing-wasm/reader');
        if (!active) return;
        
        // Prepare module - by default it will fetch from jsDelivr CDN
        await prepareZXingModule();
        readBarcodesRef.current = readBarcodes;
        setIsWasmLoaded(true);
      } catch (err) {
        console.error('WASM Loader Error:', err);
        if (active) {
          setError('WebAssembly Barkod Tarayıcı yüklenemedi. İnternet bağlantınızı kontrol edin.');
        }
      }
    }
    initWasm();
    return () => {
      active = false;
    };
  }, []);

  // 2. Camera Permission & Start Stream
  const startCamera = async (deviceId?: string) => {
    setIsLoading(true);
    setError('');

    // Stop current stream if running
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    const constraints: MediaStreamConstraints = {
      video: deviceId 
        ? { deviceId: { exact: deviceId } } 
        : { 
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920, max: 1920 }, // High resolution for small 2D codes (DataMatrix)
            height: { ideal: 1080, max: 1080 }
          },
      audio: false
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // iOS requirement to autoplay inside Safari
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('autoplay', 'true');
        videoRef.current.setAttribute('muted', 'true');
        
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Video play interrupted:', playErr);
        }
      }

      // Enumerate cameras after stream started (so iOS will show camera labels)
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = allDevices.filter(d => d.kind === 'videoinput');
      setCameras(videoDevs);

      // Determine active device ID
      const activeTrack = stream.getVideoTracks()[0];
      if (activeTrack) {
        const settings = activeTrack.getSettings();
        if (settings.deviceId) {
          setActiveCameraId(settings.deviceId);
        }
      }

      setIsLoading(false);
    } catch (err: any) {
      console.error('Camera Access Error:', err);
      setIsLoading(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Kamera izni reddedildi. Lütfen tarayıcı ayarlarından kameraya izin verin.');
      } else {
        setError(`Kamera başlatılamadı: ${err.message || err}`);
      }
    }
  };

  // Start initial camera stream once ready
  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // 3. Switch Camera handler
  const handleSwitchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.deviceId === activeCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextDevice = cameras[nextIndex];
    if (nextDevice) {
      startCamera(nextDevice.deviceId);
    }
  };

  // 4. Scanning Process Loop
  useEffect(() => {
    if (!isWasmLoaded || isLoading || error) return;

    let scanTimer: any = null;
    const intervalTime = Math.max(50, 1000 / fps); // Throttle interval (e.g. 50ms - 100ms)

    const processFrame = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video || !canvas || video.paused || video.ended) {
        return;
      }

      // Check if video is loaded and ready
      if (video.readyState < video.HAVE_CURRENT_DATA) {
        return;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Match canvas dimensions to actual video resolution
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width === 0 || height === 0) return;

      canvas.width = width;
      canvas.height = height;

      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, width, height);

      // Define standard Region of Interest (ROI) / scanning box in the center to save processing time
      // Since it's WASM, processing full frame is still super fast, but cropping to center makes barcode alignment easier.
      // We process the full frame because the user wants "shak shak okutma" regardless of where the code is in the frame.
      try {
        const imageData = ctx.getImageData(0, 0, width, height);
        
        // Run WASM barcode decoding (supports: QRCode, DataMatrix, Code128)
        const results = await readBarcodesRef.current(imageData, {
          formats: ['QRCode', 'DataMatrix', 'Code128'],
          tryHarder: false, // Set to false for rapid real-time scanning, true is slower
        });

        if (results && results.length > 0) {
          // Play a clean feedback beep/vibrate if supported
          if (navigator.vibrate) {
            navigator.vibrate(80);
          }
          // Emit scanned text
          onScan(results[0].text);
        }
      } catch (scanErr) {
        // Suppress decoding errors (they occur when no code is visible in the frame)
      }
    };

    scanTimer = setInterval(processFrame, intervalTime);

    return () => {
      if (scanTimer) clearInterval(scanTimer);
    };
  }, [isWasmLoaded, isLoading, error, fps, onScan]);

  return (
    <div className="relative w-full max-w-sm mx-auto aspect-square rounded-2xl overflow-hidden border-2 border-zinc-800 bg-zinc-950 flex flex-col justify-center items-center shadow-2xl">
      {/* Hidden Canvas for extracting frames */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Video Element */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {/* Loading Overlay */}
      {(isLoading || !isWasmLoaded) && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 z-20 backdrop-blur-sm">
          <div className="relative w-16 h-16 mb-4">
            <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-sm font-medium text-zinc-300">
            {!isWasmLoaded ? 'Barkod Motoru Yükleniyor (WASM)...' : 'Kamera Hazırlanıyor...'}
          </p>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/95 z-20 p-6 text-center">
          <AlertCircle size={40} className="text-rose-500 mb-3 animate-bounce" />
          <p className="text-sm font-semibold text-rose-400 mb-4">{error}</p>
          <button
            onClick={() => startCamera()}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded-xl text-zinc-200 border border-zinc-700 transition"
          >
            <RefreshCw size={14} /> Tekrar Dene
          </button>
        </div>
      )}

      {/* Scanner viewfinder overlay (Industrial crosshair/laser style) */}
      {!isLoading && isWasmLoaded && !error && (
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
          {/* Central QR/Barcode frame target */}
          <div 
            style={{ width: `${qrbox}px`, height: `${qrbox}px` }} 
            className="relative border-2 border-indigo-500/40 rounded-2xl flex items-center justify-center transition-all duration-300"
          >
            {/* Viewfinder Corners */}
            <div className="absolute top-[-2px] left-[-2px] w-5 h-5 border-t-4 border-l-4 border-indigo-500 rounded-tl-lg"></div>
            <div className="absolute top-[-2px] right-[-2px] w-5 h-5 border-t-4 border-r-4 border-indigo-500 rounded-tr-lg"></div>
            <div className="absolute bottom-[-2px] left-[-2px] w-5 h-5 border-b-4 border-l-4 border-indigo-500 rounded-bl-lg"></div>
            <div className="absolute bottom-[-2px] right-[-2px] w-5 h-5 border-b-4 border-r-4 border-indigo-500 rounded-br-lg"></div>

            {/* Glowing Scan Laser Line Animation */}
            <div className="absolute left-1 right-1 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse" 
                 style={{
                   animation: 'scanLaser 2.2s infinite ease-in-out',
                 }}
            />
          </div>

          {/* Semi-transparent dark overlay around target box */}
          <div className="absolute inset-0 bg-black/40 mix-blend-multiply" />
        </div>
      )}

      {/* Camera Swap Button Overlay */}
      {cameras.length > 1 && !isLoading && !error && (
        <button
          onClick={handleSwitchCamera}
          className="absolute bottom-4 right-4 z-30 p-3 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-100 rounded-xl border border-zinc-700/60 shadow-lg backdrop-blur-md active:scale-95 transition-transform flex items-center justify-center"
          title="Kamerayı Değiştir"
        >
          <RefreshCw size={18} className="text-indigo-400" />
        </button>
      )}

      {/* Inject Laser Scanning Styles */}
      <style jsx global>{`
        @keyframes scanLaser {
          0% { top: 5%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 95%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
