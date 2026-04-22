'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { NailRecommendation } from '@/types';

type Phase = 'analyzing' | 'results' | 'error';
type Tab = 'colors' | 'nail-art';
type NailArtImages = Record<number, { src: string | null; loading: boolean }>;
// cache key: `${hex}|${shape}`
type ColorCache = Record<string, string>;
type ColorLoading = Set<string>;

const SHAPES = ['Round', 'Oval', 'Squoval', 'Square', 'Almond', 'Stiletto', 'Coffin'];
const DEFAULT_SHAPE = 'Oval';

const COMPLEXITY_COLOR: Record<string, string> = {
  easy: 'bg-[var(--sage-pale)] text-[var(--sage-dark)]',
  intermediate: 'bg-amber-50 text-amber-700',
  advanced: 'bg-[var(--rose-pale)] text-[var(--rose-dark)]',
};

const OCCASION_TAGS: Record<string, string[]> = {
  casual:  ['Casual', 'Everyday'],
  work:    ['Work', 'Office'],
  wedding: ['Wedding', 'Formal'],
  holiday: ['Holiday', 'Party'],
  fun:     ['Fun', 'Night Out'],
};

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

async function fetchColorPreview(pngBase64: string, colorName: string, hex: string, shape: string): Promise<string | null> {
  try {
    const res = await fetch('/api/apply-nail-color', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageBase64: pngBase64, colorName, hex, shape }),
    });
    const json = await res.json();
    return json.image ?? null;
  } catch {
    return null;
  }
}

export default function AnalyzePage() {
  const router = useRouter();

  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const pngBase64Ref = useRef<string>('');
  const [occasion, setOccasion] = useState<string>('casual');
  const [phase, setPhase] = useState<Phase>('analyzing');
  const [recommendation, setRecommendation] = useState<NailRecommendation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [activeTab, setActiveTab] = useState<Tab>('colors');
  const [selectedShape, setSelectedShape] = useState(DEFAULT_SHAPE);
  const [selectedHex, setSelectedHex] = useState('');
  const [selectedColorName, setSelectedColorName] = useState('');
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [applyingColor, setApplyingColor] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [nailArtImages, setNailArtImages] = useState<NailArtImages>({});
  const [sharing, setSharing] = useState(false);

  // Cache: hex|shape -> data URI. Avoids re-generating the same combo.
  const colorCache = useRef<ColorCache>({});
  // Which cache keys are currently in-flight
  const colorLoading = useRef<ColorLoading>(new Set());
  // After a tap on a color that's still loading, remember what we want
  const wantedKey = useRef<string>('');
  // Trigger re-render when cache entries land
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    const img = sessionStorage.getItem('nail_image');
    const occ = sessionStorage.getItem('nail_occasion');
    if (!img) { router.replace('/'); return; }
    setImageDataUri(img);
    if (occ) setOccasion(occ);
    toPngBase64(img).then(b64 => { pngBase64Ref.current = b64; }).catch(() => {});
  }, [router]);

  // Pre-warm a color into cache
  const warmColor = useCallback((colorName: string, hex: string, shape: string) => {
    const key = `${hex}|${shape}`;
    if (colorCache.current[key] || colorLoading.current.has(key)) return;
    colorLoading.current.add(key);
    fetchColorPreview(pngBase64Ref.current, colorName, hex, shape).then(src => {
      colorLoading.current.delete(key);
      if (src) {
        colorCache.current[key] = src;
        setCacheVersion(v => v + 1); // trigger re-render so waiting taps resolve
      }
    });
  }, []);

  const analyze = useCallback(async (img: string, occ: string) => {
    try {
      const b64 = img.replace(/^data:image\/\w+;base64,/, '');
      const mt = img.match(/^data:(image\/\w+);/)?.[1] ?? 'image/jpeg';
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: b64, mediaType: mt, occasion: occ }),
      });
      const data: NailRecommendation = await res.json();
      setRecommendation(data);
      const top = data.colorRecommendations?.[0];
      if (top) { setSelectedHex(top.hex); setSelectedColorName(top.name); }
      setPhase('results');

      // Pre-generate ALL color previews in parallel with default shape
      // so tapping any color is instant once they land
      if (pngBase64Ref.current) {
        data.colorRecommendations.forEach(c => warmColor(c.name, c.hex, DEFAULT_SHAPE));
      }

      // Nail art previews
      const initial: NailArtImages = {};
      data.nailArtSuggestions.forEach((_, i) => { initial[i] = { src: null, loading: true }; });
      setNailArtImages(initial);
      data.nailArtSuggestions.forEach((art, i) => {
        fetch('/api/generate-nail-art', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            imageBase64: pngBase64Ref.current, mediaType: 'image/png',
            style: art.style, description: art.description,
            colorName: top?.name ?? '', hex: top?.hex ?? '#C47A5A',
          }),
        })
          .then(r => r.json())
          .then(json => setNailArtImages(prev => ({ ...prev, [i]: { src: json.image ?? null, loading: false } })))
          .catch(() => setNailArtImages(prev => ({ ...prev, [i]: { src: null, loading: false } })));
      });
    } catch {
      setErrorMsg('Analysis failed — please try again');
      setPhase('error');
    }
  }, [warmColor]);

  useEffect(() => {
    if (imageDataUri && occasion) analyze(imageDataUri, occasion);
  }, [imageDataUri, occasion, analyze]);

  // When cache updates, resolve any pending tap
  useEffect(() => {
    const key = wantedKey.current;
    if (!key) return;
    const cached = colorCache.current[key];
    if (cached) {
      setEditedImage(cached);
      setApplyingColor(false);
      wantedKey.current = '';
    }
  }, [cacheVersion]);

  const applyColor = useCallback((hex: string, colorName: string, shape: string) => {
    const key = `${hex}|${shape}`;
    setSelectedHex(hex);
    setSelectedColorName(colorName);
    setApplyError(null);

    const cached = colorCache.current[key];
    if (cached) {
      // Instant — already in cache
      setEditedImage(cached);
      setApplyingColor(false);
      return;
    }

    // Not cached yet — show loading and remember what we want
    setApplyingColor(true);
    wantedKey.current = key;
    warmColor(colorName, hex, shape); // kicks off if not already in-flight
  }, [warmColor]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    const imageToShare = editedImage ?? imageDataUri;
    try {
      if (navigator.share) {
        const shareData: ShareData = {
          title: 'My Nail Look — Nail Me',
          text: `Color: ${selectedColorName} | Shape: ${selectedShape} | Book at Glow Studio`,
        };
        if (imageToShare && navigator.canShare) {
          try {
            const blob = await (await fetch(imageToShare)).blob();
            const file = new File([blob], 'my-nails.png', { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) shareData.files = [file];
          } catch { /* file share not supported */ }
        }
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText('nail-me.vercel.app');
        alert('Link copied!');
      }
    } catch { /* cancelled */ }
    setSharing(false);
  }, [sharing, editedImage, imageDataUri, selectedColorName, selectedShape]);

  if (!imageDataUri) return null;

  const displayImage = editedImage ?? imageDataUri;

  return (
    <main className="min-h-screen flex flex-col max-w-lg mx-auto" style={{ paddingBottom: 'max(5rem, env(safe-area-inset-bottom))' }}>

      {/* ── Sticky top ── */}
      <div className="sticky top-0 z-20 bg-[var(--cream)]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button onClick={() => router.push('/')} className="text-[var(--ink-light)] text-sm py-2 pr-3">← Back</button>
          <div className="text-center">
            <p className="text-xs tracking-[0.25em] uppercase text-[var(--ink-light)] leading-none">Glow Studio</p>
            <p className="font-display text-lg font-light text-[var(--ink)]">Nail Me</p>
          </div>
          <div className="w-14" />
        </div>

        {/* Hand photo */}
        <div className="mx-4 relative rounded-2xl overflow-hidden bg-[var(--cream-dk)]" style={{ aspectRatio: '4/3' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={displayImage} alt="Your hand" className="w-full h-full object-cover" />

          {applyingColor && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/20">
              <div className="w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <p className="text-white text-xs font-medium bg-black/40 px-3 py-1 rounded-full">Generating preview…</p>
            </div>
          )}
          {phase === 'analyzing' && (
            <div className="absolute inset-0 shimmer flex items-center justify-center">
              <p className="text-[var(--ink-mid)] text-xs font-medium bg-white/80 px-3 py-1.5 rounded-full">Analysing your skin tone…</p>
            </div>
          )}
          {editedImage && !applyingColor && (
            <div className="absolute bottom-2 right-2 bg-black/50 rounded-full px-2 py-0.5">
              <p className="text-white text-xs">AI preview</p>
            </div>
          )}
        </div>

        {applyError && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <span className="flex-1">{applyError}</span>
            <button onClick={() => setApplyError(null)} className="text-red-400">✕</button>
          </div>
        )}

        {/* Nail shape selector — stores preference, applies on next color tap */}
        {phase === 'results' && (
          <div className="mt-3 pb-2 px-4 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {SHAPES.map(shape => (
              <button
                key={shape}
                onClick={() => setSelectedShape(shape)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  selectedShape === shape
                    ? 'bg-[var(--ink)] text-white border-[var(--ink)]'
                    : 'bg-white text-[var(--ink-mid)] border-[var(--cream-dk)]'
                }`}
              >
                {shape}
              </button>
            ))}
          </div>
        )}

        {/* Tabs */}
        {phase === 'results' && (
          <div className="flex mx-4 mt-1 border-b border-[var(--cream-dk)]">
            {(['colors', 'nail-art'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'border-[var(--ink)] text-[var(--ink)]'
                    : 'border-transparent text-[var(--ink-light)]'
                }`}
              >
                {tab === 'colors' ? 'Colors' : 'Nail Art'}
              </button>
            ))}
          </div>
        )}

        {phase === 'error' && (
          <div className="px-4 mt-4 text-center">
            <p className="text-red-500 text-sm mb-3">{errorMsg}</p>
            <button
              onClick={() => { setPhase('analyzing'); if (imageDataUri) analyze(imageDataUri, occasion); }}
              className="px-6 py-2 rounded-full bg-[var(--ink)] text-white text-sm"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* ── Scrollable content ── */}
      {phase === 'results' && recommendation && (
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">

          {/* Colors tab */}
          {activeTab === 'colors' && (
            <div className="space-y-4 animate-fade-up">
              <div className="bg-white rounded-2xl p-4 border border-[var(--cream-dk)] text-sm">
                <span className="font-medium text-[var(--ink)]">Skin read: </span>
                <span className="text-[var(--ink-mid)]">{recommendation.skinTone} · {recommendation.undertone} undertone · {recommendation.nailLength} nails</span>
              </div>

              {recommendation.stylistNote && (
                <div className="bg-[var(--rose-pale)] rounded-2xl p-4 border border-rose-100">
                  <p className="text-sm text-[var(--rose-dark)] italic leading-relaxed">&ldquo;{recommendation.stylistNote}&rdquo;</p>
                </div>
              )}

              <div>
                <p className="text-xs text-[var(--ink-light)] uppercase tracking-widest mb-3">Recommended for you</p>
                <div className="space-y-2">
                  {recommendation.colorRecommendations.map((c, i) => {
                    const key = `${c.hex}|${DEFAULT_SHAPE}`;
                    const isCached = !!colorCache.current[key];
                    const isLoading = colorLoading.current.has(key);
                    return (
                      <button
                        key={i}
                        onClick={() => applyColor(c.hex, c.name, selectedShape)}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
                          selectedHex === c.hex
                            ? 'border-[var(--ink)] bg-white shadow-sm'
                            : 'border-[var(--cream-dk)] bg-white active:scale-[0.99]'
                        }`}
                      >
                        <div className="relative flex-shrink-0">
                          <div
                            className="w-12 h-12 rounded-full shadow-sm animate-swatch-pop"
                            style={{ background: c.hex, animationDelay: `${i * 0.06}s` }}
                          />
                          {/* Ready indicator */}
                          {isCached && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--sage-dark)] border-2 border-white" />
                          )}
                          {isLoading && !isCached && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white animate-pulse" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[var(--ink)] text-sm">{c.name}</p>
                          <p className="text-xs text-[var(--ink-light)] truncate">{c.brand} · {c.productName}</p>
                          <p className="text-xs text-[var(--ink-mid)] mt-0.5 leading-snug">{c.reason}</p>
                        </div>
                        {selectedHex === c.hex && !applyingColor && (
                          <span className="text-xs bg-[var(--ink)] text-white px-2 py-0.5 rounded-full flex-shrink-0">On</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-[var(--ink-light)] text-center mt-3">
                  Green dot = ready · Tap any color to preview on your hand
                </p>
              </div>
            </div>
          )}

          {/* Nail Art tab */}
          {activeTab === 'nail-art' && (
            <div className="space-y-4 animate-fade-up">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--ink-light)] uppercase tracking-widest">Trending now</p>
                <span className="text-xs bg-[var(--sage-pale)] text-[var(--sage-dark)] px-2 py-0.5 rounded-full">Updated this week</span>
              </div>

              {recommendation.nailArtSuggestions.map((art, i) => {
                const imgState = nailArtImages[i];
                const tags = OCCASION_TAGS[recommendation.occasion] ?? ['Casual'];
                return (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden border border-[var(--cream-dk)] animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                    {imgState?.loading ? (
                      <div className="w-full h-52 shimmer flex items-center justify-center">
                        <p className="text-xs text-[var(--ink-light)] bg-white/70 px-3 py-1 rounded-full">Generating on your hand…</p>
                      </div>
                    ) : imgState?.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imgState.src} alt={art.style} className="w-full h-52 object-cover" />
                    ) : (
                      <div className="w-full h-52 bg-[var(--cream-dk)] flex items-center justify-center">
                        <p className="text-xs text-[var(--ink-light)]">Preview unavailable</p>
                      </div>
                    )}

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-display text-lg font-light text-[var(--ink)]">{art.style}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${COMPLEXITY_COLOR[art.complexity] ?? 'bg-gray-100 text-gray-600'}`}>
                          {art.complexity.charAt(0).toUpperCase() + art.complexity.slice(1)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {tags.map(tag => (
                          <span key={tag} className="text-xs bg-[var(--cream)] text-[var(--ink-mid)] px-2 py-0.5 rounded-full border border-[var(--cream-dk)]">{tag}</span>
                        ))}
                      </div>
                      <p className="text-xs text-[var(--ink-mid)] leading-relaxed mb-3">{art.description}</p>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs text-[var(--ink-light)]">{art.toolsNeeded.join(' · ')}</p>
                        <p className="text-xs text-[var(--ink-light)]">{art.estimatedTime}</p>
                      </div>
                      {imgState?.src && (
                        <button
                          onClick={() => setEditedImage(imgState.src!)}
                          className="w-full py-2.5 rounded-xl bg-[var(--ink)] text-white text-xs font-medium active:opacity-80"
                        >
                          Try this look
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sticky share bar */}
      {phase === 'results' && (
        <div className="sticky bottom-0 px-4 py-3 bg-[var(--cream)] border-t border-[var(--cream-dk)]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button
            onClick={handleShare}
            disabled={sharing}
            className="w-full py-3.5 rounded-2xl bg-[var(--ink)] text-white text-sm font-medium animate-cta-glow active:opacity-90 flex items-center justify-center gap-2"
          >
            <span>↑</span>
            <span>{sharing ? 'Sharing…' : 'Share my look'}</span>
          </button>
        </div>
      )}
    </main>
  );
}
