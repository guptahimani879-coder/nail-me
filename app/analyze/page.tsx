'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { NailRecommendation } from '@/types';

type Phase = 'analyzing' | 'results' | 'error';
type Tab = 'colors' | 'nail-art';
type NailArtImages = Record<number, { src: string | null; loading: boolean }>;

const SHAPES = ['Round', 'Oval', 'Squoval', 'Square', 'Almond', 'Stiletto', 'Coffin'];

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

export default function AnalyzePage() {
  const router = useRouter();
  const shapeRowRef = useRef<HTMLDivElement>(null);

  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [imageBase64Png, setImageBase64Png] = useState<string>('');
  const [occasion, setOccasion] = useState<string>('casual');
  const [phase, setPhase] = useState<Phase>('analyzing');
  const [recommendation, setRecommendation] = useState<NailRecommendation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [activeTab, setActiveTab] = useState<Tab>('colors');
  const [selectedShape, setSelectedShape] = useState('Oval');
  const [selectedHex, setSelectedHex] = useState('');
  const [selectedColorName, setSelectedColorName] = useState('');
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [applyingColor, setApplyingColor] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [nailArtImages, setNailArtImages] = useState<NailArtImages>({});
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const img = sessionStorage.getItem('nail_image');
    const occ = sessionStorage.getItem('nail_occasion');
    if (!img) { router.replace('/'); return; }
    setImageDataUri(img);
    if (occ) setOccasion(occ);
    // Pre-convert to PNG for the edit API
    toPngBase64(img).then(setImageBase64Png).catch(() => {});
  }, [router]);

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

      const initial: NailArtImages = {};
      data.nailArtSuggestions.forEach((_, i) => { initial[i] = { src: null, loading: true }; });
      setNailArtImages(initial);

      data.nailArtSuggestions.forEach((art, i) => {
        toPngBase64(img).then(pngB64 =>
          fetch('/api/generate-nail-art', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              imageBase64: pngB64, mediaType: 'image/png',
              style: art.style, description: art.description,
              colorName: top?.name ?? '', hex: top?.hex ?? '#C47A5A',
            }),
          })
        )
          .then(r => r.json())
          .then(json => setNailArtImages(prev => ({ ...prev, [i]: { src: json.image ?? null, loading: false } })))
          .catch(() => setNailArtImages(prev => ({ ...prev, [i]: { src: null, loading: false } })));
      });
    } catch {
      setErrorMsg('Analysis failed — please try again');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (imageDataUri && occasion) analyze(imageDataUri, occasion);
  }, [imageDataUri, occasion, analyze]);

  const applyColor = useCallback(async (hex: string, colorName: string, shape: string) => {
    if (applyingColor || !imageBase64Png) return;
    setSelectedHex(hex);
    setSelectedColorName(colorName);
    setApplyingColor(true);
    setApplyError(null);
    try {
      const res = await fetch('/api/apply-nail-color', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64: imageBase64Png, colorName, hex, shape }),
      });
      const json = await res.json();
      if (json.image) setEditedImage(json.image);
      else setApplyError(json.message ?? 'Failed to apply color');
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Failed to apply color');
    } finally {
      setApplyingColor(false);
    }
  }, [applyingColor, imageBase64Png]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    const imageToShare = editedImage ?? imageDataUri;
    try {
      if (navigator.share) {
        const shareData: ShareData = {
          title: 'My Nail Look — Nail Me',
          text: `${selectedColorName ? `Color: ${selectedColorName}` : ''} | Shape: ${selectedShape} | Book at Glow Studio`,
        };
        if (imageToShare && navigator.canShare) {
          try {
            const blob = await (await fetch(imageToShare)).blob();
            const file = new File([blob], 'my-nails.png', { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) shareData.files = [file];
          } catch { /* file share not supported, fall through */ }
        }
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText('Book at Glow Studio — nail-me.vercel.app');
        alert('Link copied to clipboard!');
      }
    } catch { /* user cancelled */ }
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
              <p className="text-white text-xs font-medium bg-black/40 px-3 py-1 rounded-full">Applying your look…</p>
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

        {/* Nail shape selector */}
        {phase === 'results' && (
          <div ref={shapeRowRef} className="mt-3 pb-2 px-4 flex gap-2 overflow-x-auto scrollbar-hide">
            {SHAPES.map(shape => (
              <button
                key={shape}
                onClick={() => {
                  setSelectedShape(shape);
                  if (selectedHex) applyColor(selectedHex, selectedColorName, shape);
                }}
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

        {/* Error state */}
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

          {/* ── Colors tab ── */}
          {activeTab === 'colors' && (
            <div className="space-y-4 animate-fade-up">

              {/* Skin read */}
              <div className="bg-white rounded-2xl p-4 border border-[var(--cream-dk)] text-sm">
                <span className="font-medium text-[var(--ink)]">Skin read: </span>
                <span className="text-[var(--ink-mid)]">{recommendation.skinTone} · {recommendation.undertone} undertone · {recommendation.nailLength} nails</span>
              </div>

              {/* Stylist note */}
              {recommendation.stylistNote && (
                <div className="bg-[var(--rose-pale)] rounded-2xl p-4 border border-rose-100">
                  <p className="text-sm text-[var(--rose-dark)] italic leading-relaxed">
                    &ldquo;{recommendation.stylistNote}&rdquo;
                  </p>
                </div>
              )}

              {/* Color rows */}
              <div>
                <p className="text-xs text-[var(--ink-light)] uppercase tracking-widest mb-3">Recommended for you</p>
                <div className="space-y-2">
                  {recommendation.colorRecommendations.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => applyColor(c.hex, c.name, selectedShape)}
                      disabled={applyingColor}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
                        selectedHex === c.hex
                          ? 'border-[var(--ink)] bg-white shadow-sm'
                          : 'border-[var(--cream-dk)] bg-white'
                      } ${applyingColor ? 'opacity-60' : 'active:scale-[0.99]'}`}
                    >
                      <div
                        className="w-12 h-12 rounded-full flex-shrink-0 shadow-sm animate-swatch-pop"
                        style={{ background: c.hex, animationDelay: `${i * 0.06}s` }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[var(--ink)] text-sm">{c.name}</p>
                        <p className="text-xs text-[var(--ink-light)] truncate">{c.brand} · {c.productName}</p>
                        <p className="text-xs text-[var(--ink-mid)] mt-0.5 leading-snug">{c.reason}</p>
                      </div>
                      {selectedHex === c.hex && (
                        <span className="text-xs bg-[var(--ink)] text-white px-2 py-0.5 rounded-full flex-shrink-0">On</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Nail Art tab ── */}
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
                  <div
                    key={i}
                    className="bg-white rounded-2xl overflow-hidden border border-[var(--cream-dk)] animate-fade-up"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    {/* Preview image */}
                    {imgState?.loading ? (
                      <div className="w-full h-52 shimmer flex flex-col items-center justify-center gap-2">
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

                      {/* Occasion tags */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {tags.map(tag => (
                          <span key={tag} className="text-xs bg-[var(--cream)] text-[var(--ink-mid)] px-2 py-0.5 rounded-full border border-[var(--cream-dk)]">
                            {tag}
                          </span>
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

      {/* ── Sticky share bar ── */}
      {phase === 'results' && (
        <div
          className="sticky bottom-0 px-4 py-3 bg-[var(--cream)] border-t border-[var(--cream-dk)]"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
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
