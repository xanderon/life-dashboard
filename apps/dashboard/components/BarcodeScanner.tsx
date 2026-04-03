'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type DetectedBarcode = {
  rawValue?: string;
  format?: string;
};

type DetectorLike = {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
};

type DetectorCtor = new (options?: { formats?: string[] }) => DetectorLike;

type BrowserWindow = Window & {
  BarcodeDetector?: DetectorCtor & {
    getSupportedFormats?: () => Promise<string[]>;
  };
};

export function BarcodeScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');

  const supported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return typeof (window as BrowserWindow).BarcodeDetector !== 'undefined';
  }, []);

  useEffect(() => {
    if (!open || !supported) return;

    let cancelled = false;

    async function start() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = media;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        await video.play();

        const WindowCtor = window as BrowserWindow;
        const Detector = WindowCtor.BarcodeDetector;
        if (!Detector) return;

        const formats = Detector.getSupportedFormats ? await Detector.getSupportedFormats() : [];
        const preferred = formats.filter((format) => ['ean_13', 'ean_8', 'upc_a', 'upc_e'].includes(format));
        const detector = new Detector(preferred.length ? { formats: preferred } : undefined);

        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            const raw = results.find((item) => item.rawValue?.match(/^\d{6,14}$/))?.rawValue;
            if (raw) {
              onDetected(raw);
              onClose();
              return;
            }
          } catch {
            // Keep scanning; camera access is already validated.
          }
          rafRef.current = window.setTimeout(() => {
            void scan();
          }, 250) as unknown as number;
        };

        void scan();
      } catch (scanError) {
        setError(scanError instanceof Error ? scanError.message : 'Could not start camera.');
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (rafRef.current) {
        window.clearTimeout(rafRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [onClose, onDetected, open, supported]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-3 sm:items-center sm:justify-center">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Scan barcode</div>
            <div className="text-sm text-[var(--muted)]">Use the back camera on mobile, or paste the code manually.</div>
          </div>
          <button
            className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm font-semibold"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        {supported ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-black">
            <video className="aspect-[3/4] w-full object-cover" muted playsInline ref={videoRef} />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4 text-sm text-[var(--muted)]">
            Barcode scanning is not supported in this browser. Paste the barcode manually below.
          </div>
        )}

        {error ? <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div> : null}

        <div className="mt-4">
          <label className="block">
            <div className="mb-1 text-sm font-medium">Manual barcode</div>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-[#102b2d] px-3 py-2 outline-none ring-0"
              inputMode="numeric"
              onChange={(event) => setManualBarcode(event.target.value)}
              placeholder="5941234567890"
              type="text"
              value={manualBarcode}
            />
          </label>
          <button
            className="mt-3 w-full rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/30"
            onClick={() => {
              if (!manualBarcode.trim()) return;
              onDetected(manualBarcode.trim());
              onClose();
            }}
            type="button"
          >
            Use barcode
          </button>
        </div>
      </div>
    </div>
  );
}
