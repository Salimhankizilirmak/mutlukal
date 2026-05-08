'use client';
import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (text: string) => void;
  fps?: number;
  qrbox?: number;
}

export function QRScanner({ onScan, fps = 10, qrbox = 250 }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      'qr-reader',
      { fps, qrbox, rememberLastUsedCamera: true },
      /* verbose= */ false
    );

    scannerRef.current.render(
      (decodedText) => {
        onScan(decodedText);
      },
      () => {
        // Just ignore errors
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
      }
    };
  }, [onScan, fps, qrbox]);

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border-2 border-zinc-800 bg-black">
      <div id="qr-reader" className="w-full" />
    </div>
  );
}
