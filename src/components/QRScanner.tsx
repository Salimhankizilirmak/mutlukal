'use client';
import { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (text: string) => void;
  fps?: number;
  qrbox?: number;
}

export function QRScanner({ onScan, fps = 10, qrbox = 250 }: QRScannerProps) {
  const html5QrCode = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    html5QrCode.current = new Html5Qrcode("qr-reader", {
      formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.DATA_MATRIX ]
    });

    const config = { fps, qrbox };

    html5QrCode.current.start(
      { facingMode: "environment" }, 
      config,
      (decodedText) => {
        onScan(decodedText);
      },
      () => {
        // Suppress errors
      }
    ).catch(err => {
      console.error("Camera start error:", err);
    });

    return () => {
      if (html5QrCode.current) {
        if (html5QrCode.current.isScanning) {
          html5QrCode.current.stop().then(() => {
            html5QrCode.current?.clear();
          }).catch(err => console.error("Stop error", err));
        }
      }
    };
  }, [onScan, fps, qrbox]);

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border-2 border-zinc-800 bg-black relative aspect-square">
      <div id="qr-reader" className="w-full h-full" />
    </div>
  );
}
