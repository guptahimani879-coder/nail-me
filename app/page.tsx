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
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
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

const EXAMPLE_COLORS = ['#C47A5A', '#8B2635', '#F2A7BB', '#4A7C59', '#2C4A7C'];

export default function Home() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [occasion, setOccasion] = useState<string>('casual');
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB.');
      return;
    }
    setCompressing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const raw = e.target?.result as string;
      const dataUri = await resizeImage(raw);
      setPreview(dataUri);
      setCompressing(false);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleAnalyze = () => {
    if (!preview) return;
    sessionStorage.setItem('nail_image', preview);
    sessionStorage.setItem('nail_occasion', occasion);
    router.push('/analyze');
  };

  return (
    <main className="min-h-screen flex flex-col items-center px-4 pt-10 pb-8 sm:py-20"
      style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>

      {/* Hero — compact on mobile */}
      <div className="text-center mb-7 sm:mb-10 animate-fade-up">
        <p className="text-xs tracking-[0.25em] uppercase text-[var(--ink-light)] mb-2">AI Nail Artist</p>
        <h1 className="font-display text-5xl sm:text-6xl font-light text-[var(--ink)] leading-tight mb-3">
          Nail Me
        </h1>
        <p className="text-[var(--ink-mid)] text-sm sm:text-base max-w-xs mx-auto leading-relaxed">
          Upload a hand photo and get personalised nail color recommendations for your skin tone.
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-[var(--cream-dk)] p-5 sm:p-8 animate-fade-up" style={{ animationDelay: '0.1s' }}>

        {/* Occasion tabs */}
        <div className="mb-5">
          <p className="text-xs font-medium text-[var(--ink-light)] uppercase tracking-widest mb-3">Occasion</p>
          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map(o => (
              <button
                key={o.id}
                onClick={() => setOccasion(o.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  occasion === o.id
                    ? 'bg-[var(--ink)] text-white'
                    : 'bg-[var(--cream)] text-[var(--ink-mid)] active:bg-[var(--cream-dk)]'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !preview && fileInputRef.current?.click()}
          className={`relative rounded-2xl border-2 border-dashed transition-all overflow-hidden ${
            preview
              ? 'border-transparent cursor-default'
              : dragOver
                ? 'border-[var(--rose-mid)] bg-[var(--rose-pale)] cursor-copy'
                : 'border-[var(--cream-dk)] bg-[var(--cream)] active:bg-[var(--cream-dk)] cursor-pointer'
          }`}
          style={{ minHeight: 180 }}
        >
          {compressing ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <div className="w-7 h-7 rounded-full border-2 border-[var(--ink)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--ink-mid)]">Preparing photo…</p>
            </div>
          ) : preview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Your hand" className="w-full rounded-2xl object-cover max-h-60" />
              <button
                onClick={(e) => { e.stopPropagation(); setPreview(null); fileInputRef.current!.value = ''; }}
                className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full w-9 h-9 flex items-center justify-center text-[var(--ink)] shadow-sm active:bg-white text-sm"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
              <div className="w-14 h-14 rounded-full bg-[var(--cream-dk)] flex items-center justify-center text-2xl animate-float">
                ✋
              </div>
              <div>
                <p className="text-[var(--ink-mid)] font-medium text-sm">Tap to choose a photo</p>
                <p className="text-[var(--ink-light)] text-xs mt-1">JPG, PNG, WebP · max 5 MB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="mt-1 px-5 py-2 rounded-full bg-[var(--cream-dk)] text-[var(--ink-mid)] text-xs font-medium active:opacity-70"
              >
                Upload photo
              </button>
            </div>
          )}
        </div>

        {/* Gallery picker — no capture attribute so iOS shows both gallery + camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleInputChange}
        />
        {/* Camera picker — capture forces rear camera */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={handleInputChange}
        />

        {error && (
          <p className="mt-3 text-sm text-red-500 text-center">{error}</p>
        )}

        <p className="text-center text-xs text-[var(--ink-light)] mt-3">
          Your photo is analyzed and never stored.
        </p>

        {/* CTA */}
        <button
          onClick={handleAnalyze}
          disabled={!preview || compressing}
          className={`mt-4 w-full py-4 rounded-2xl font-medium text-base transition-all ${
            preview && !compressing
              ? 'bg-[var(--ink)] text-white animate-cta-glow active:opacity-90 active:scale-[0.98]'
              : 'bg-[var(--cream-dk)] text-[var(--ink-light)] cursor-not-allowed'
          }`}
        >
          Analyze My Nails →
        </button>
      </div>

      {/* Example palette */}
      <div className="mt-10 text-center animate-fade-up" style={{ animationDelay: '0.2s' }}>
        <p className="text-xs text-[var(--ink-light)] uppercase tracking-widest mb-4">Colors people love</p>
        <div className="flex gap-3 justify-center">
          {EXAMPLE_COLORS.map((hex, i) => (
            <div
              key={hex}
              className="w-9 h-9 rounded-full shadow-sm border border-white/60 animate-swatch-pop"
              style={{ background: hex, animationDelay: `${0.25 + i * 0.07}s` }}
            />
          ))}
        </div>
      </div>

    </main>
  );
}
