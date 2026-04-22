'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import NailCanvas from '@/components/NailCanvas';
import type { NailRecommendation, NailMask } from '@/types';

type Phase = 'tap' | 'segmenting' | 'analyzing' | 'results' | 'error';
type NailArtImages = Record<number, { src: string | null; loading: boolean }>;

const COMPLEXITY_LABEL: Record<string, string> = {
  easy: 'Easy',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const COMPLEXITY_COLOR: Record<string, string> = {
  easy: 'bg-[var(--sage-pale)] text-[var(--sage-dark)]',
  intermediate: 'bg-amber-50 text-amber-700',
  advanced: 'bg-[var(--rose-pale)] text-[var(--rose-dark)]',
};

function proxied(url: string) {
  return `/api/proxy-mask?url=${encodeURIComponent(url)}`;
}

// Load a mask and return { coversPoint, area } — area is white pixel count.
// We pick the smallest mask that covers the click (most specific = nail, not whole hand).
async function getMaskInfo(maskUrl: string, imgX: number, imgY: number): Promise<{ coversPoint: boolean; area: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const point = ctx.getImageData(imgX, imgY, 1, 1).data;
      if (point[0] <= 128) { resolve({ coversPoint: false, area: 0 }); return; }
      // Count white pixels to measure mask size
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let area = 0;
      for (let i = 0; i < data.length; i += 4) { if (data[i] > 128) area++; }
      resolve({ coversPoint: true, area });
    };
    img.onerror = () => resolve({ coversPoint: false, area: 0 });
    img.src = proxied(maskUrl);
  });
}

export default function AnalyzePage() {
  const router = useRouter();
  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<string>('casual');
  const [phase, setPhase] = useState<Phase>('tap');
  const [masks, setMasks] = useState<NailMask[]>([]);
  const [segmentingPoint, setSegmentingPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedHex, setSelectedHex] = useState<string>('#C47A5A');
  const [recommendation, setRecommendation] = useState<NailRecommendation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [segmentError, setSegmentError] = useState<string | null>(null);
  const [nailArtImages, setNailArtImages] = useState<NailArtImages>({});

  // Cache all SAM mask URLs after first API call — reused for every subsequent tap
  const allMaskUrlsRef = useRef<string[] | null>(null);

  useEffect(() => {
    const img = sessionStorage.getItem('nail_image');
    const occ = sessionStorage.getItem('nail_occasion');
    if (!img) { router.replace('/'); return; }
    setImageDataUri(img);
    if (occ) setOccasion(occ);
  }, [router]);

  const handleNailClick = useCallback(async (imgX: number, imgY: number) => {
    if (phase !== 'tap') return;
    setSegmentingPoint({ x: imgX, y: imgY });
    setSegmentError(null);

    try {
      // Fetch all masks from SAM on the first tap; reuse cache afterwards
      if (!allMaskUrlsRef.current) {
        setPhase('segmenting');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);
        const res = await fetch('/api/segment', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageDataUri }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        setPhase('tap');
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? `Segmentation failed (${res.status})`);
        }
        const { maskUrls } = await res.json();
        allMaskUrlsRef.current = maskUrls as string[];
      }

      // Check all masks in parallel, then pick the smallest that covers the point.
      // Smallest area = most specific mask (nail vs whole hand vs whole image).
      const maskUrls = allMaskUrlsRef.current!;
      const infos = await Promise.all(maskUrls.map(url => getMaskInfo(url, imgX, imgY)));
      const candidates = maskUrls
        .map((url, i) => ({ url, ...infos[i] }))
        .filter(m => m.coversPoint)
        .sort((a, b) => a.area - b.area);
      const chosenUrl = candidates[0]?.url ?? maskUrls[0];

      setMasks(prev => [...prev, { pointX: imgX, pointY: imgY, maskImageUrl: chosenUrl! }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Segmentation failed';
      setSegmentError(
        msg.includes('abort') ? 'Timed out — Replicate may be cold-starting, try tapping again' : msg,
      );
      setPhase('tap');
    } finally {
      setSegmentingPoint(null);
    }
  }, [phase, imageDataUri]);

  const handleAnalyze = useCallback(async () => {
    if (!imageDataUri) return;
    setPhase('analyzing');
    try {
      const base64 = imageDataUri.replace(/^data:image\/\w+;base64,/, '');
      const mediaType = imageDataUri.match(/^data:(image\/\w+);/)?.[1] ?? 'image/jpeg';
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType, occasion }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? 'Analysis failed');
      }
      const data: NailRecommendation = await res.json();
      setRecommendation(data);
      if (data.colorRecommendations?.[0]?.hex) setSelectedHex(data.colorRecommendations[0].hex);
      setPhase('results');

      // Kick off nail art image generation in the background
      const topColor = data.colorRecommendations[0];
      const initialState: NailArtImages = {};
      data.nailArtSuggestions.forEach((_, i) => { initialState[i] = { src: null, loading: true }; });
      setNailArtImages(initialState);

      data.nailArtSuggestions.forEach((art, i) => {
        fetch('/api/generate-nail-art', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            style: art.style,
            description: art.description,
            colorName: topColor?.name ?? '',
            hex: topColor?.hex ?? '#C47A5A',
            skinTone: data.skinTone,
            occasion: data.occasion,
          }),
        })
          .then(r => r.json())
          .then(json => {
            setNailArtImages(prev => ({
              ...prev,
              [i]: { src: json.image ?? null, loading: false },
            }));
          })
          .catch(() => {
            setNailArtImages(prev => ({ ...prev, [i]: { src: null, loading: false } }));
          });
      });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong');
      setPhase('error');
    }
  }, [imageDataUri, occasion]);

  if (!imageDataUri) return null;

  return (
    <main className="min-h-screen flex flex-col max-w-lg mx-auto"
      style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>

      {/* Sticky top section: header + canvas + tap controls */}
      <div className="sticky top-0 z-10 bg-[var(--cream)] px-4 pt-4 pb-3">

        {/* Header */}
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

        {/* SAM segmenting banner */}
        {phase === 'segmenting' && (
          <div className="mb-3 px-3 py-2.5 rounded-xl bg-[var(--cream-dk)] flex items-center gap-3 animate-fade-up">
            <div className="w-4 h-4 rounded-full border-2 border-[var(--ink)] border-t-transparent animate-spin flex-shrink-0" />
            <p className="text-xs text-[var(--ink-mid)]">Mapping your photo… first tap takes ~30s</p>
          </div>
        )}

        {/* Canvas */}
        <NailCanvas
        imageDataUri={imageDataUri}
        masks={masks}
        selectedHex={selectedHex}
        onNailClick={handleNailClick}
        segmentingPoint={segmentingPoint}
        phase={phase === 'tap' || phase === 'segmenting' ? 'tap' : 'results'}
      />

        {/* Segment error */}
        {segmentError && (
          <div className="mt-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <span className="flex-shrink-0">⚠️</span>
            <p className="flex-1">{segmentError}</p>
            <button onClick={() => setSegmentError(null)} className="ml-auto text-red-400 flex-shrink-0">✕</button>
          </div>
        )}

        {/* Tap controls */}
        {(phase === 'tap' || phase === 'segmenting') && (
          <div className="mt-3 animate-fade-up">
            <p className="text-center text-xs text-[var(--ink-mid)] mb-3">
              {masks.length === 0
                ? 'Tap each nail in the photo to select it'
                : `${masks.length} nail${masks.length > 1 ? 's' : ''} selected — tap more or continue`}
            </p>
            {masks.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setMasks([]); allMaskUrlsRef.current = null; }}
                  className="flex-1 py-3 rounded-2xl border border-[var(--cream-dk)] text-[var(--ink-mid)] text-sm font-medium active:bg-[var(--cream-dk)]"
                >
                  Reset
                </button>
                <button
                  onClick={handleAnalyze}
                  className="flex-[2] py-3 rounded-2xl bg-[var(--ink)] text-white text-sm font-medium animate-cta-glow active:scale-[0.98]"
                >
                  Analyze My Nails →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Analyzing spinner */}
        {phase === 'analyzing' && (
          <div className="mt-4 flex items-center justify-center gap-3 animate-fade-up">
            <div className="w-5 h-5 rounded-full border-2 border-[var(--ink)] border-t-transparent animate-spin" />
            <p className="text-[var(--ink-mid)] text-sm">Reading your skin tone & nails…</p>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="mt-4 text-center animate-fade-up">
            <p className="text-red-500 text-sm mb-3">{errorMsg}</p>
            <button onClick={() => setPhase('tap')} className="px-6 py-2 rounded-full bg-[var(--ink)] text-white text-sm">
              Try again
            </button>
          </div>
        )}

      </div>{/* end sticky */}

      {/* Scrollable results */}
      <div className="px-4">

      {/* Results */}
      {phase === 'results' && recommendation && (
        <div className="mt-8 space-y-8 animate-fade-up">

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

          <section>
            <h2 className="font-display text-xl font-light text-[var(--ink)] mb-4">Your Colors</h2>
            <div className="space-y-3">
              {recommendation.colorRecommendations.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedHex(c.hex)}
                  className={`w-full flex items-center gap-4 p-3 rounded-2xl border transition-all text-left ${
                    selectedHex === c.hex
                      ? 'border-[var(--ink)] bg-white shadow-md'
                      : 'border-[var(--cream-dk)] bg-white hover:border-[var(--ink-light)]'
                  }`}
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
                  <span className="text-xs font-mono text-[var(--ink-light)] flex-shrink-0">{c.hex}</span>
                </button>
              ))}
            </div>
          </section>

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
                    {/* AI-generated preview image */}
                    {imgState?.loading ? (
                      <div className="w-full h-48 bg-[var(--cream-dk)] flex flex-col items-center justify-center gap-2">
                        <div className="w-5 h-5 rounded-full border-2 border-[var(--ink-light)] border-t-transparent animate-spin" />
                        <p className="text-xs text-[var(--ink-light)]">Generating preview…</p>
                      </div>
                    ) : imgState?.src ? (
                      <img
                        src={imgState.src}
                        alt={`${art.style} nail art preview`}
                        className="w-full h-48 object-cover"
                      />
                    ) : null}

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-medium text-[var(--ink)] text-sm">{art.style}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${COMPLEXITY_COLOR[art.complexity] ?? 'bg-gray-100 text-gray-600'}`}>
                          {COMPLEXITY_LABEL[art.complexity] ?? art.complexity}
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

      </div>{/* end scrollable */}
    </main>
  );
}
