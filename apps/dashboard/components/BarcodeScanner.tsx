'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

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
  onClose,
  onDetected,
}: {
  onClose: () => void;
  onDetected: (barcode: string) => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const supported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return typeof (window as BrowserWindow).BarcodeDetector !== 'undefined';
  }, []);

  const resolveDetectedBarcode = useCallback(
    async (raw: string) => {
      if (!raw.match(/^\d{6,14}$/) || isResolving) return;
      setDetectedCode(raw);
      setIsResolving(true);
      setError(null);
      try {
        await onDetected(raw);
        onClose();
      } catch (scanError) {
        setError(scanError instanceof Error ? scanError.message : 'Could not resolve product.');
        setIsResolving(false);
      }
    },
    [isResolving, onClose, onDetected]
  );

  useEffect(() => {
    let cancelled = false;

    async function startNativeDetector() {
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
            await resolveDetectedBarcode(raw);
            return;
          }
        } catch {
          // Continue polling while stream is live.
        }
        rafRef.current = window.setTimeout(() => {
          void scan();
        }, 250) as unknown as number;
      };

      void scan();
    }

    async function startHtml5QrFallback() {
      const scanner = new Html5Qrcode('cut-coach-barcode-scanner');
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 260, height: 180 },
          aspectRatio: 1.3333333,
          disableFlip: true,
        },
        async (decodedText) => {
          if (!decodedText.match(/^\d{6,14}$/)) return;
          await resolveDetectedBarcode(decodedText);
        },
        () => {
          // Ignore frame-level decode misses.
        }
      );
    }

    async function start() {
      setError(null);
      try {
        if (supported) {
          await startNativeDetector();
          return;
        }
        await startHtml5QrFallback();
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
      if (html5QrRef.current) {
        void html5QrRef.current
          .stop()
          .catch(() => undefined)
          .finally(() => {
            html5QrRef.current?.clear();
            html5QrRef.current = null;
          });
      }
    };
  }, [resolveDetectedBarcode, supported]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-3 sm:items-center sm:justify-center">
      <div className="w-full max-w-md rounded-[28px] border border-white/15 bg-[#0c1820] p-4 shadow-2xl shadow-black/50 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Scan barcode</div>
            <div className="text-sm text-[var(--muted)]">Use the back camera on mobile, or paste the code manually.</div>
          </div>
          <button
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/90"
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
          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-black">
            <div className="aspect-[3/4] w-full" id="cut-coach-barcode-scanner" />
          </div>
        )}

        {error ? <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div> : null}
        {detectedCode ? (
          <div className="mt-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-3 text-sm text-emerald-50">
            <div className="font-semibold">{isResolving ? 'Barcode detected' : 'Try again'}</div>
            <div className="mt-1 text-emerald-100/80">
              {isResolving ? `Found ${detectedCode}. Looking up the product now...` : `Found ${detectedCode}, but resolution failed.`}
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <label className="block">
            <div className="mb-1 text-sm font-medium">Manual barcode</div>
            <input
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 outline-none ring-0"
              inputMode="numeric"
              onChange={(event) => setManualBarcode(event.target.value)}
              placeholder="5941234567890"
              type="text"
              value={manualBarcode}
            />
          </label>
          <button
            className="mt-3 w-full rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/30 disabled:opacity-50"
            onClick={() => {
              if (!manualBarcode.trim()) return;
              void resolveDetectedBarcode(manualBarcode.trim());
            }}
            disabled={isResolving}
            type="button"
          >
            {isResolving ? 'Looking up product...' : 'Use barcode'}
          </button>
        </div>
      </div>
    </div>
  );
}
