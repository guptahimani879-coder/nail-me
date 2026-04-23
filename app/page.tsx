'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

function resizeImage(dataUri: string, maxDim = 1024): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.src = dataUri;
  });
}

function toPngBase64(dataUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''));
    };
    img.onerror = reject;
    img.src = dataUri;
  });
}

const OCCASIONS = [
  { id: 'casual',  label: 'Casual' },
  { id: 'work',    label: 'Work' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'holiday', label: 'Holiday' },
  { id: 'fun',     label: 'Fun' },
] as const;

type LoadingStep = 'idle' | 'analyzing' | 'applying' | 'done';

const STEP_LABELS: Record<LoadingStep, string> = {
  idle:      '',
  analyzing: 'Analysing your skin tone…',
  applying:  'Preparing your first look…',
  done:      'Ready!',
};

export default function Home() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [occasion, setOccasion] = useState<string>('casual');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('idle');

  const isLoading = loadingStep !== 'idle';

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a JPG, PNG, or WebP image.'); return;
    }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB.'); return; }
    setCompressing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUri = await resizeImage(e.target?.result as string);
      setPreview(dataUri);
      setCompressing(false);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleAnalyze = useCallback(async () => {
    if (!preview || isLoading) return;
    setError(null);

    // Store image + occasion for the results page
    sessionStorage.setItem('nail_image', preview);
    sessionStorage.setItem('nail_occasion', occasion);
    sessionStorage.removeItem('nail_recommendation');
    sessionStorage.removeItem('nail_first_preview');
    sessionStorage.removeItem('nail_first_hex');

    // Step 1 — analyse skin tone & get colour recommendations
    setLoadingStep('analyzing');
    const b64 = preview.replace(/^data:image\/\w+;base64,/, '');
    const mt = preview.match(/^data:(image\/\w+);/)?.[1] ?? 'image/jpeg';

    let recommendation: Record<string, unknown> | null = null;
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: b64, mediaType: mt, occasion }),
      });
      recommendation = await res.json();
      sessionStorage.setItem('nail_recommendation', JSON.stringify(recommendation));
    } catch {
      setError('Analysis failed — please try again.');
      setLoadingStep('idle');
      return;
    }

    // Step 2 — apply first recommended colour to the photo
    setLoadingStep('applying');
    try {
      const topColor = (recommendation as { colorRecommendations?: { name: string; hex: string }[] })
        ?.colorRecommendations?.[0];
      if (topColor) {
        const pngBase64 = await toPngBase64(preview);
        const res = await fetch('/api/apply-nail-color', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageBase64: pngBase64, colorName: topColor.name, hex: topColor.hex, shape: 'Oval' }),
        });
        const json = await res.json();
        if (json.image) {
          sessionStorage.setItem('nail_first_preview', json.image);
          sessionStorage.setItem('nail_first_hex', topColor.hex);
        }
      }
    } catch { /* colour apply failed — results page handles gracefully */ }

    setLoadingStep('done');
    router.push('/analyze');
  }, [preview, occasion, isLoading, router]);

  // Loading screen — shown after tapping the CTA
  if (isLoading && preview) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center max-w-lg mx-auto px-5 gap-6">
        <div className="text-center mb-2">
          <p className="text-xs tracking-[0.3em] uppercase text-[var(--ink-light)]">Glow Studio</p>
        </div>

        {/* Photo */}
        <div className="w-full rounded-3xl overflow-hidden border border-[var(--cream-dk)] relative" style={{ maxHeight: 320 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Your hand" className="w-full object-cover" style={{ maxHeight: 320 }} />
          <div className="absolute inset-0 bg-black/10" />
        </div>

        {/* Steps */}
        <div className="w-full bg-white rounded-2xl border border-[var(--cream-dk)] p-5 space-y-4">
          {(['analyzing', 'applying'] as LoadingStep[]).map((step) => {
            const done = step === 'analyzing' && (loadingStep === 'applying' || loadingStep === 'done');
            const active = loadingStep === step;
            return (
              <div key={step} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs ${
                  done ? 'bg-[var(--sage-dark)] text-white' : active ? 'border-2 border-[var(--ink)] border-t-transparent animate-spin' : 'border-2 border-[var(--cream-dk)]'
                }`}>
                  {done ? '✓' : null}
                </div>
                <p className={`text-sm ${active ? 'text-[var(--ink)] font-medium' : done ? 'text-[var(--sage-dark)]' : 'text-[var(--ink-light)]'}`}>
                  {STEP_LABELS[step]}
                </p>
              </div>
            );
          })}
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col max-w-lg mx-auto px-5"
      style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
    >
      {/* Salon header */}
      <div className="pt-10 pb-6 text-center animate-fade-up">
        <p className="text-xs tracking-[0.3em] uppercase text-[var(--ink-light)] mb-1">Glow Studio</p>
        <div className="w-8 h-px bg-[var(--cream-dk)] mx-auto mb-4" />
        <h1 className="font-display text-4xl font-light text-[var(--ink)] leading-tight mb-2">
          Find your perfect look
        </h1>
        <p className="text-[var(--ink-mid)] text-sm leading-relaxed max-w-xs mx-auto">
          Upload a photo of your hand and get personalised nail colour and art recommendations before your appointment.
        </p>
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-3xl border border-[var(--cream-dk)] overflow-hidden animate-fade-up" style={{ animationDelay: '0.1s' }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !preview && fileInputRef.current?.click()}
          className={`relative transition-all overflow-hidden ${preview ? 'cursor-default' : dragOver ? 'bg-[var(--rose-pale)] cursor-copy' : 'cursor-pointer'}`}
          style={{ minHeight: 220 }}
        >
          {compressing ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-6 h-6 rounded-full border-2 border-[var(--ink)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--ink-mid)]">Preparing photo…</p>
            </div>
          ) : preview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Your hand" className="w-full object-cover max-h-72" />
              <button
                onClick={(e) => { e.stopPropagation(); setPreview(null); fileInputRef.current!.value = ''; }}
                className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full w-9 h-9 flex items-center justify-center text-[var(--ink)] shadow-sm text-sm"
              >✕</button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-14 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--cream)] flex items-center justify-center text-3xl animate-float">✋</div>
              <div>
                <p className="text-[var(--ink)] font-medium text-sm">Upload a hand photo</p>
                <p className="text-[var(--ink-light)] text-xs mt-1">JPG, PNG, WebP · max 5 MB</p>
              </div>
            </div>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

        <div className="px-5 pb-5 pt-4 border-t border-[var(--cream-dk)]">
          <p className="text-xs text-[var(--ink-light)] uppercase tracking-widest mb-3">Occasion</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {OCCASIONS.map(o => (
              <button key={o.id} onClick={() => setOccasion(o.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${occasion === o.id ? 'bg-[var(--ink)] text-white' : 'bg-[var(--cream)] text-[var(--ink-mid)]'}`}>
                {o.label}
              </button>
            ))}
          </div>

          {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

          <button
            onClick={handleAnalyze}
            disabled={!preview || compressing}
            className={`w-full py-4 rounded-2xl font-medium text-sm transition-all ${
              preview && !compressing ? 'bg-[var(--ink)] text-white animate-cta-glow active:opacity-90' : 'bg-[var(--cream-dk)] text-[var(--ink-light)] cursor-not-allowed'
            }`}
          >
            Get My Recommendations →
          </button>
          <p className="text-center text-xs text-[var(--ink-light)] mt-3">Your photo is analysed and never stored.</p>
        </div>
      </div>

      <div className="mt-auto pt-10 text-center animate-fade-up" style={{ animationDelay: '0.2s' }}>
        <p className="text-xs text-[var(--ink-light)]">Powered by <span className="font-medium text-[var(--ink-mid)]">Nail Me AI</span></p>
      </div>
    </main>
  );
}
