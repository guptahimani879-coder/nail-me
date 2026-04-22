'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { NailRecommendation } from '@/types';

type Phase = 'analyzing' | 'results' | 'error';
type NailArtImages = Record<number, { src: string | null; loading: boolean }>;

const COMPLEXITY_COLOR: Record<string, string> = {
  easy: 'bg-[var(--sage-pale)] text-[var(--sage-dark)]',
  intermediate: 'bg-amber-50 text-amber-700',
  advanced: 'bg-[var(--rose-pale)] text-[var(--rose-dark)]',
};

export default function AnalyzePage() {
  const router = useRouter();
  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [mediaType, setMediaType] = useState<string>('image/jpeg');
  const [occasion, setOccasion] = useState<string>('casual');
  const [phase, setPhase] = useState<Phase>('analyzing');
  const [recommendation, setRecommendation] = useState<NailRecommendation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [selectedHex, setSelectedHex] = useState<string>('');
  const [selectedColorName, setSelectedColorName] = useState<string>('');
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [applyingColor, setApplyingColor] = useState(false);
  const [nailArtImages, setNailArtImages] = useState<NailArtImages>({});

  useEffect(() => {
    const img = sessionStorage.getItem('nail_image');
    const occ = sessionStorage.getItem('nail_occasion');
    if (!img) { router.replace('/'); return; }
    setImageDataUri(img);
    const b64 = img.replace(/^data:image\/\w+;base64,/, '');
    const mt = img.match(/^data:(image\/\w+);/)?.[1] ?? 'image/jpeg';
    setImageBase64(b64);
    setMediaType(mt);
    if (occ) setOccasion(occ);
  }, [router]);

  const analyze = useCallback(async (b64: string, mt: string, occ: string) => {
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: b64, mediaType: mt, occasion: occ }),
      });
      const data: NailRecommendation = await res.json();
      setRecommendation(data);
      const topColor = data.colorRecommendations?.[0];
      if (topColor) {
        setSelectedHex(topColor.hex);
        setSelectedColorName(topColor.name);
      }
      setPhase('results');

      // Generate nail art previews using the actual hand photo
      const initial: NailArtImages = {};
      data.nailArtSuggestions.forEach((_, i) => { initial[i] = { src: null, loading: true }; });
      setNailArtImages(initial);

      data.nailArtSuggestions.forEach((art, i) => {
        fetch('/api/generate-nail-art', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            imageBase64: b64,
            mediaType: mt,
            style: art.style,
            description: art.description,
            colorName: topColor?.name ?? '',
            hex: topColor?.hex ?? '#C47A5A',
          }),
        })
          .then(r => r.json())
          .then(json => {
            setNailArtImages(prev => ({ ...prev, [i]: { src: json.image ?? null, loading: false } }));
          })
          .catch(() => {
            setNailArtImages(prev => ({ ...prev, [i]: { src: null, loading: false } }));
          });
      });
    } catch {
      setErrorMsg('Analysis failed — please try again');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (imageBase64 && mediaType && occasion) {
      analyze(imageBase64, mediaType, occasion);
    }
  }, [imageBase64, mediaType, occasion, analyze]);

  const applyColor = useCallback(async (hex: string, colorName: string) => {
    if (applyingColor || !imageBase64) return;
    setSelectedHex(hex);
    setSelectedColorName(colorName);
    setApplyingColor(true);
    try {
      const res = await fetch('/api/apply-nail-color', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64, mediaType, colorName, hex }),
      });
      const json = await res.json();
      if (json.image) setEditedImage(json.image);
    } catch {
      // silently fail — original image stays visible
    } finally {
      setApplyingColor(false);
    }
  }, [applyingColor, imageBase64, mediaType]);

  if (!imageDataUri) return null;

  const displayImage = editedImage ?? imageDataUri;

  return (
    <main className="min-h-screen flex flex-col max-w-lg mx-auto"
      style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>

      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--cream)] px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => router.push('/')}
            className="text-[var(--ink-light)] text-sm flex items-center gap-1 py-2 pr-3"
          >
            ← Back
          </button>
          <h1 className="font-display text-xl font-light text-[var(--ink)]">Nail Me</h1>
          <div className="w-14" />
        </div>

        {/* Hand photo */}
        <div className="relative rounded-2xl overflow-hidden bg-[var(--cream-dk)]" style={{ aspectRatio: '4/3' }}>
          <img
            src={displayImage}
            alt="Your hand"
            className="w-full h-full object-cover"
          />
          {applyingColor && (
            <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center gap-2">
              <div className="w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <p className="text-white text-xs font-medium">Applying color…</p>
            </div>
          )}
          {editedImage && !applyingColor && (
            <div className="absolute bottom-2 right-2">
              <span className="text-xs bg-black/50 text-white px-2 py-1 rounded-full">AI preview</span>
            </div>
          )}
        </div>

        {/* Analyzing spinner */}
        {phase === 'analyzing' && (
          <div className="mt-4 flex items-center justify-center gap-3 animate-fade-up">
            <div className="w-5 h-5 rounded-full border-2 border-[var(--ink)] border-t-transparent animate-spin" />
            <p className="text-[var(--ink-mid)] text-sm">Analysing your skin tone & nails…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="mt-4 text-center animate-fade-up">
            <p className="text-red-500 text-sm mb-3">{errorMsg}</p>
            <button
              onClick={() => { setPhase('analyzing'); analyze(imageBase64, mediaType, occasion); }}
              className="px-6 py-2 rounded-full bg-[var(--ink)] text-white text-sm"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Scrollable results */}
      {phase === 'results' && recommendation && (
        <div className="px-4 mt-4 space-y-8 animate-fade-up">

          <div className="bg-white rounded-2xl p-4 border border-[var(--cream-dk)] text-sm text-[var(--ink-mid)]">
            <span className="font-medium text-[var(--ink)]">Skin read: </span>
            {recommendation.skinTone} · {recommendation.undertone} undertone · {recommendation.nailLength} nails
          </div>

          {recommendation.stylistNote && (
            <div className="bg-[var(--rose-pale)] rounded-2xl p-4 border border-rose-100">
              <p className="text-sm text-[var(--rose-dark)] italic leading-relaxed">
                &ldquo;{recommendation.stylistNote}&rdquo;
              </p>
            </div>
          )}

          {/* Color recommendations */}
          <section>
            <h2 className="font-display text-xl font-light text-[var(--ink)] mb-1">Your Colors</h2>
            <p className="text-xs text-[var(--ink-light)] mb-4">Tap a color to see it on your nails</p>
            <div className="space-y-3">
              {recommendation.colorRecommendations.map((c, i) => (
                <button
                  key={i}
                  onClick={() => applyColor(c.hex, c.name)}
                  disabled={applyingColor}
                  className={`w-full flex items-center gap-4 p-3 rounded-2xl border transition-all text-left ${
                    selectedHex === c.hex
                      ? 'border-[var(--ink)] bg-white shadow-md'
                      : 'border-[var(--cream-dk)] bg-white hover:border-[var(--ink-light)]'
                  } ${applyingColor ? 'opacity-60' : ''}`}
                >
                  <div
                    className="w-11 h-11 rounded-full flex-shrink-0 shadow-sm border border-white/60 animate-swatch-pop"
                    style={{ background: c.hex, animationDelay: `${i * 0.06}s` }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[var(--ink)] text-sm truncate">{c.name}</p>
                    <p className="text-xs text-[var(--ink-light)] truncate">{c.brand} · {c.productName}</p>
                    <p className="text-xs text-[var(--ink-mid)] mt-0.5 leading-snug">{c.reason}</p>
                  </div>
                  {selectedHex === c.hex && (
                    <span className="text-xs bg-[var(--ink)] text-white px-2 py-0.5 rounded-full flex-shrink-0">On</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Nail art suggestions */}
          <section>
            <h2 className="font-display text-xl font-light text-[var(--ink)] mb-4">Nail Art Ideas</h2>
            <div className="space-y-3">
              {recommendation.nailArtSuggestions.map((art, i) => {
                const imgState = nailArtImages[i];
                return (
                  <div
                    key={i}
                    className="bg-white rounded-2xl overflow-hidden border border-[var(--cream-dk)] animate-fade-up"
                    style={{ animationDelay: `${i * 0.08}s` }}
                  >
                    {imgState?.loading ? (
                      <div className="w-full h-52 bg-[var(--cream-dk)] flex flex-col items-center justify-center gap-2">
                        <div className="w-5 h-5 rounded-full border-2 border-[var(--ink-light)] border-t-transparent animate-spin" />
                        <p className="text-xs text-[var(--ink-light)]">Generating on your hand…</p>
                      </div>
                    ) : imgState?.src ? (
                      <img src={imgState.src} alt={`${art.style} preview`} className="w-full h-52 object-cover" />
                    ) : null}

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-medium text-[var(--ink)] text-sm">{art.style}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${COMPLEXITY_COLOR[art.complexity] ?? 'bg-gray-100 text-gray-600'}`}>
                          {art.complexity}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--ink-mid)] leading-relaxed mb-2">{art.description}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-[var(--ink-light)]">{art.toolsNeeded.join(' · ')}</p>
                        <p className="text-xs text-[var(--ink-light)]">{art.estimatedTime}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <button
            onClick={() => router.push('/')}
            className="w-full py-3 rounded-2xl border border-[var(--cream-dk)] text-[var(--ink-mid)] text-sm font-medium active:bg-[var(--cream-dk)] mb-6"
          >
            Try another photo
          </button>
        </div>
      )}
    </main>
  );
}
