'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { NailRecommendation, ColorRecommendation } from '@/types';

type Phase = 'analyzing' | 'results' | 'error';
type Tab = 'colors' | 'nail-art';
type ColorCache = Record<string, string>;

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

// Curated 2026 trending nail art styles — floral, fun, girlie (Pinterest + industry sources)
const TRENDING_STYLES = [
  { style: 'Cherry Blossom', description: 'Delicate hand-painted pink sakura petals scattered across a milky white base — feminine, romantic, and huge on Pinterest 2026', complexity: 'intermediate', estimatedTime: '45 mins', toolsNeeded: ['fine nail brush', 'pink & white polish', 'dotting tool'] },
  { style: 'Daisy Chain', description: 'Cheerful white daisies with sunny yellow centres on a pastel base — the ultimate cottage-core girlie nail', complexity: 'easy', estimatedTime: '25 mins', toolsNeeded: ['dotting tool', 'fine brush', 'white & yellow polish'] },
  { style: 'Rosé Garden', description: 'Tiny hand-painted roses in blush and dusty pink — romantic, maximalist, and dominating nail inspo feeds this season', complexity: 'advanced', estimatedTime: '60 mins', toolsNeeded: ['fine nail brush', 'blush polishes', 'rose gold glitter'] },
  { style: 'Glazed Donut', description: 'Sheer iridescent glaze over a nude base — the Hailey Bieber signature look, effortlessly pretty', complexity: 'easy', estimatedTime: '15 mins', toolsNeeded: ['chrome powder', 'gel top coat'] },
  { style: 'Butterfly Dream', description: 'Ethereal pastel butterfly wings painted across accent nails with iridescent shimmer — whimsical and magical', complexity: 'advanced', estimatedTime: '55 mins', toolsNeeded: ['fine brush', 'pastel polishes', 'iridescent glitter'] },
  { style: 'Strawberry Swirl', description: 'Juicy red and cream swirls with tiny seed details — fun, playful, and very viral on TikTok right now', complexity: 'intermediate', estimatedTime: '35 mins', toolsNeeded: ['red & cream polish', 'dotting tool', 'fine brush'] },
  { style: 'Pastel Swirl', description: 'Dreamy hand-painted swirls blending lavender, mint and blush on each nail — soft and romantic', complexity: 'intermediate', estimatedTime: '35 mins', toolsNeeded: ['dotting tool', 'thin brush', 'pastel polishes'] },
  { style: 'Opalescent Pearl', description: 'Milky iridescent finish shifting between pink, white and lavender — like the inside of a seashell', complexity: 'easy', estimatedTime: '15 mins', toolsNeeded: ['pearl chrome powder', 'gel base'] },
  { style: 'Wildflower Meadow', description: 'Tiny wildflowers — lavender, chamomile, forget-me-nots — hand-painted across all five nails for a garden-fairy feel', complexity: 'advanced', estimatedTime: '70 mins', toolsNeeded: ['fine nail brush', 'multi-colour polishes', 'dotting tool'] },
  { style: 'Jelly Glass', description: 'Translucent syrup-coloured polish with iridescent shimmer — looks like expensive hard candy', complexity: 'easy', estimatedTime: '20 mins', toolsNeeded: ['sheer jelly polish', 'chrome top coat'] },
  { style: 'Bow & Ribbon', description: 'Cute 3D-effect ribbon bows on a soft pink or nude base — the Coquette aesthetic in full bloom', complexity: 'intermediate', estimatedTime: '30 mins', toolsNeeded: ['fine brush', 'pink polish', 'white nail art pen'] },
  { style: 'Cloud Nine', description: 'Fluffy white clouds painted over a dreamy sky-blue base with tiny stars — soft, cute, and endlessly shareable', complexity: 'easy', estimatedTime: '20 mins', toolsNeeded: ['blue & white polish', 'fine brush', 'dotting tool'] },
];

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

async function fetchColorPreview(
  colorName: string,
  hex: string,
  shape: string,
  skinTone: string,
  nailLength: string,
): Promise<{ image: string | null; error?: string }> {
  const controller = new AbortController();
  // Abort after 58s so the spinner always resolves even if the server hangs
  const timer = setTimeout(() => controller.abort(), 58000);
  try {
    const res = await fetch('/api/apply-nail-color', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ colorName, hex, shape, skinTone, nailLength }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await res.json();
    if (!res.ok) return { image: null, error: json.message ?? json.error ?? `HTTP ${res.status}` };
    return { image: json.image ?? null, error: json.image ? undefined : 'No image in response' };
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === 'AbortError') {
      return { image: null, error: 'Preview timed out — tap to retry' };
    }
    return { image: null, error: e instanceof Error ? e.message : 'Network error' };
  }
}

type NailArtEntry = typeof TRENDING_STYLES[0] & { src: string | null; loading: boolean };

export default function AnalyzePage() {
  const router = useRouter();

  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const rawBase64Ref = useRef<string>('');
  const mediaTypeRef = useRef<string>('image/jpeg');
  const recommendationRef = useRef<NailRecommendation | null>(null);
  const [occasion, setOccasion] = useState<string>('casual');

  const [phase, setPhase] = useState<Phase>('analyzing');
  const [recommendation, setRecommendation] = useState<NailRecommendation | null>(null);
  const [allColors, setAllColors] = useState<ColorRecommendation[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [activeTab, setActiveTab] = useState<Tab>('colors');
  const [selectedShape, setSelectedShape] = useState(DEFAULT_SHAPE);
  const [selectedHex, setSelectedHex] = useState('');
  const [selectedColorName, setSelectedColorName] = useState('');
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [applyingColor, setApplyingColor] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Nail art state — pool of all 12 shuffled, shown 3 at a time
  const stylePoolRef = useRef<typeof TRENDING_STYLES>([]);
  const styleIndexRef = useRef(0);
  const [nailArtEntries, setNailArtEntries] = useState<NailArtEntry[]>([]);
  const [refreshingArt, setRefreshingArt] = useState(false);

  // Color refresh state
  const [refreshingColors, setRefreshingColors] = useState(false);

  // Color preview cache: hex|shape → data URI
  const colorCache = useRef<ColorCache>({});
  const colorLoading = useRef<Set<string>>(new Set());
  const wantedKey = useRef<string>('');
  const loadedFromCache = useRef(false);
  const [cacheVersion, setCacheVersion] = useState(0);

  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const img = sessionStorage.getItem('nail_image');
    const occ = sessionStorage.getItem('nail_occasion');
    const savedRec = sessionStorage.getItem('nail_recommendation');

    if (!img) { router.replace('/'); return; }
    setImageDataUri(img);
    if (occ) setOccasion(occ);
    rawBase64Ref.current = img.replace(/^data:image\/\w+;base64,/, '');
    mediaTypeRef.current = img.match(/^data:(image\/\w+);/)?.[1] ?? 'image/jpeg';
    stylePoolRef.current = shuffle(TRENDING_STYLES);

    // Recommendation was stored by the upload page — use it
    if (savedRec) {
      try {
        loadedFromCache.current = true;
        const data = JSON.parse(savedRec) as NailRecommendation;
        setRecommendation(data);
        recommendationRef.current = data;
        setAllColors(data.colorRecommendations);
        const top = data.colorRecommendations?.[0];
        if (top) {
          setSelectedHex(top.hex);
          setSelectedColorName(top.name);
          // Start generating the first color preview immediately
          const key = `${top.hex}|${DEFAULT_SHAPE}`;
          wantedKey.current = key;
          setApplyingColor(true);
          warmColor(top.name, top.hex, DEFAULT_SHAPE);
        }
        setPhase('results');
        // Other colors and nail art are generated on demand — not pre-loaded

        return;
      } catch { /* fall through to normal analyze */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const warmColor = useCallback((colorName: string, hex: string, shape: string) => {
    const key = `${hex}|${shape}`;
    if (colorCache.current[key] || colorLoading.current.has(key)) return;
    colorLoading.current.add(key);
    const rec = recommendationRef.current;
    fetchColorPreview(colorName, hex, shape, rec?.skinTone ?? 'medium', rec?.nailLength ?? 'medium').then(({ image, error }) => {
      colorLoading.current.delete(key);
      if (image) {
        colorCache.current[key] = image;
        setCacheVersion(v => v + 1);
      } else if (wantedKey.current === key) {
        // Always stop the spinner for the color the user is waiting on
        setApplyError(error ?? 'Preview generation failed');
        setApplyingColor(false);
        wantedKey.current = '';
      }
    });
  }, []);

  const generateNailArtBatch = useCallback((styles: typeof TRENDING_STYLES, topColor: ColorRecommendation | undefined) => {
    const entries: NailArtEntry[] = styles.map(s => ({ ...s, src: null, loading: true }));
    setNailArtEntries(entries);
    styles.forEach((style, i) => {
      fetch('/api/generate-nail-art', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          style: style.style,
          description: style.description,
          colorName: topColor?.name ?? '',
          hex: topColor?.hex ?? '#C47A5A',
        }),
      })
        .then(r => r.json())
        .then(json => setNailArtEntries(prev => prev.map((e, idx) => idx === i ? { ...e, src: json.image ?? null, loading: false } : e)))
        .catch(() => setNailArtEntries(prev => prev.map((e, idx) => idx === i ? { ...e, src: null, loading: false } : e)));
    });
  }, []);

  const analyze = useCallback(async (occ: string, excludeHexes: string[] = []) => {
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: rawBase64Ref.current, mediaType: mediaTypeRef.current, occasion: occ, excludeHexes }),
      });
      const data: NailRecommendation = await res.json();
      return data;
    } catch { return null; }
  }, []);

  // Initial load (skipped when pre-computed results were loaded from sessionStorage)
  useEffect(() => {
    if (!rawBase64Ref.current || !occasion || loadedFromCache.current) return;
    (async () => {
      const data = await analyze(occasion);
      if (!data) { setErrorMsg('Analysis failed — please try again'); setPhase('error'); return; }
      setRecommendation(data);
      recommendationRef.current = data;
      setAllColors(data.colorRecommendations);
      const top = data.colorRecommendations?.[0];
      if (top) {
        setSelectedHex(top.hex);
        setSelectedColorName(top.name);
        // Apply first color immediately
        wantedKey.current = `${top.hex}|${DEFAULT_SHAPE}`;
        setApplyingColor(true);
      }
      setPhase('results');
      // Colors and nail art generated on demand
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occasion]);

  // Resolve pending user tap when cache updates
  useEffect(() => {
    if (!wantedKey.current) return;
    const cached = colorCache.current[wantedKey.current];
    if (cached) { setEditedImage(cached); setApplyingColor(false); wantedKey.current = ''; }
  }, [cacheVersion]);

  const applyColor = useCallback((hex: string, colorName: string, shape: string) => {
    const key = `${hex}|${shape}`;
    setSelectedHex(hex); setSelectedColorName(colorName); setApplyError(null);
    const cached = colorCache.current[key];
    if (cached) { setEditedImage(cached); setApplyingColor(false); return; }
    setApplyingColor(true);
    wantedKey.current = key;
    warmColor(colorName, hex, shape);
  }, [warmColor]);

  // Generate nail art only when the user first opens that tab
  const nailArtLoadedRef = useRef(false);
  useEffect(() => {
    if (activeTab !== 'nail-art' || nailArtLoadedRef.current || phase !== 'results' || !recommendation) return;
    nailArtLoadedRef.current = true;
    const firstBatch = stylePoolRef.current.slice(0, 3);
    styleIndexRef.current = 3;
    setNailArtEntries(firstBatch.map(s => ({ ...s, src: null, loading: true })));
    generateNailArtBatch(firstBatch, allColors[0]);
  }, [activeTab, phase, recommendation, allColors, generateNailArtBatch]);

  // Re-apply current color when the user picks a different nail shape
  const prevShapeRef = useRef(DEFAULT_SHAPE);
  useEffect(() => {
    if (selectedShape === prevShapeRef.current || !selectedHex || !selectedColorName || phase !== 'results') return;
    prevShapeRef.current = selectedShape;
    applyColor(selectedHex, selectedColorName, selectedShape);
  }, [selectedShape, selectedHex, selectedColorName, phase, applyColor]);

  const refreshColors = useCallback(async () => {
    if (refreshingColors || !recommendation) return;
    setRefreshingColors(true);
    const existingHexes = allColors.map(c => c.hex);
    const data = await analyze(occasion, existingHexes);
    if (data?.colorRecommendations) {
      const newColors = [...allColors, ...data.colorRecommendations];
      setAllColors(newColors);
      data.colorRecommendations.forEach(c => warmColor(c.name, c.hex, DEFAULT_SHAPE));
    }
    setRefreshingColors(false);
  }, [refreshingColors, recommendation, allColors, analyze, occasion, warmColor]);

  const refreshNailArt = useCallback(() => {
    if (refreshingArt) return;
    setRefreshingArt(true);
    const pool = stylePoolRef.current;
    const idx = styleIndexRef.current;
    // Cycle back to start if we've used them all
    const nextIdx = idx >= pool.length ? 3 : idx + 3;
    const batch = idx >= pool.length
      ? pool.slice(0, 3)
      : pool.slice(idx, idx + 3);
    styleIndexRef.current = nextIdx >= pool.length ? 3 : nextIdx;
    const top = allColors[0];
    generateNailArtBatch(batch, top);
    setRefreshingArt(false);
  }, [refreshingArt, allColors, generateNailArtBatch]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    const imageToShare = editedImage ?? imageDataUri;
    try {
      if (navigator.share) {
        const shareData: ShareData = { title: 'My Nail Look — Nail Me', text: `Color: ${selectedColorName} | Shape: ${selectedShape} | Book at Glow Studio` };
        if (imageToShare && navigator.canShare) {
          try {
            const blob = await (await fetch(imageToShare)).blob();
            const file = new File([blob], 'my-nails.png', { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) shareData.files = [file];
          } catch { /* not supported */ }
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

      {/* Sticky top */}
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

        {/* Hand photo — object-contain so nothing is ever cropped */}
        <div className="mx-4 relative rounded-2xl overflow-hidden bg-[var(--cream-dk)]" style={{ aspectRatio: '4/3' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={displayImage} alt="Your hand" className="w-full h-full object-contain" />
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

        {/* Shape selector */}
        {phase === 'results' && (
          <div className="mt-3 pb-2 px-4 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {SHAPES.map(shape => (
              <button
                key={shape}
                onClick={() => setSelectedShape(shape)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  selectedShape === shape ? 'bg-[var(--ink)] text-white border-[var(--ink)]' : 'bg-white text-[var(--ink-mid)] border-[var(--cream-dk)]'
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
                  activeTab === tab ? 'border-[var(--ink)] text-[var(--ink)]' : 'border-transparent text-[var(--ink-light)]'
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
            <button onClick={() => { setPhase('analyzing'); analyze(occasion).then(data => { if (data) { setRecommendation(data); setAllColors(data.colorRecommendations); setPhase('results'); } }); }} className="px-6 py-2 rounded-full bg-[var(--ink)] text-white text-sm">Try again</button>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      {phase === 'results' && recommendation && (
        <div className="flex-1 px-4 pt-4 pb-2">

          {/* Colors tab */}
          {activeTab === 'colors' && (
            <div className="space-y-4 animate-fade-up">
              {(recommendation as unknown as { _demo?: boolean; _error?: string })._demo && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-800">
                  <p className="font-medium mb-0.5">OpenAI API not responding — showing demo data</p>
                  <p className="text-amber-700 break-all">{(recommendation as unknown as { _error?: string })._error ?? 'Unknown error'}</p>
                  <p className="mt-1 text-amber-600">Check that <strong>OPENAI_API_KEY</strong> is set in your Vercel project → Settings → Environment Variables.</p>
                </div>
              )}
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
                  {allColors.map((c, i) => {
                    const key = `${c.hex}|${DEFAULT_SHAPE}`;
                    const isCached = !!colorCache.current[key];
                    const isInFlight = colorLoading.current.has(key);
                    return (
                      <button
                        key={`${c.hex}-${i}`}
                        onClick={() => applyColor(c.hex, c.name, selectedShape)}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
                          selectedHex === c.hex ? 'border-[var(--ink)] bg-white shadow-sm' : 'border-[var(--cream-dk)] bg-white active:scale-[0.99]'
                        }`}
                      >
                        <div className="relative flex-shrink-0">
                          <div className="w-12 h-12 rounded-full shadow-sm animate-swatch-pop" style={{ background: c.hex, animationDelay: `${i * 0.05}s` }} />
                          {isCached && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--sage-dark)] border-2 border-white" />}
                          {isInFlight && !isCached && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white animate-pulse" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[var(--ink)] text-sm">{c.name}</p>
                          <p className="text-xs text-[var(--ink-light)] truncate">{c.brand} · {c.productName}</p>
                          <p className="text-xs text-[var(--ink-mid)] mt-0.5 leading-snug line-clamp-2">{c.reason}</p>
                        </div>
                        {selectedHex === c.hex && !applyingColor && <span className="text-xs bg-[var(--ink)] text-white px-2 py-0.5 rounded-full flex-shrink-0">On</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Refresh colors */}
              <button
                onClick={refreshColors}
                disabled={refreshingColors}
                className="w-full py-3 rounded-2xl border border-[var(--cream-dk)] bg-white text-sm text-[var(--ink-mid)] font-medium flex items-center justify-center gap-2 active:bg-[var(--cream-dk)]"
              >
                {refreshingColors ? (
                  <><div className="w-4 h-4 rounded-full border-2 border-[var(--ink-light)] border-t-transparent animate-spin" /><span>Finding more colours…</span></>
                ) : (
                  <><span>↻</span><span>Show more colours</span></>
                )}
              </button>
            </div>
          )}

          {/* Nail Art tab */}
          {activeTab === 'nail-art' && (
            <div className="space-y-4 animate-fade-up">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--ink-light)] uppercase tracking-widest">Trending now</p>
                <span className="text-xs bg-[var(--sage-pale)] text-[var(--sage-dark)] px-2 py-0.5 rounded-full">Spring 2026</span>
              </div>

              {nailArtEntries.map((art, i) => {
                const tags = OCCASION_TAGS[recommendation.occasion] ?? ['Casual'];
                return (
                  <div key={`${art.style}-${i}`} className="bg-white rounded-2xl overflow-hidden border border-[var(--cream-dk)] animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                    {/* Close-up nail art image */}
                    <div className="relative w-full bg-[var(--cream-dk)]" style={{ aspectRatio: '1/1' }}>
                      {art.loading ? (
                        <div className="absolute inset-0 shimmer flex items-center justify-center">
                          <p className="text-xs text-[var(--ink-light)] bg-white/70 px-3 py-1 rounded-full">Creating nail art…</p>
                        </div>
                      ) : art.src ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={art.src} alt={art.style} className="w-full h-full object-cover" />
                          {/* Try on hand overlay — tap to apply to hand photo above */}
                          <button
                            onClick={() => {
                              setApplyingColor(true);
                              fetch('/api/generate-nail-art', {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({
                                  style: art.style,
                                  description: art.description,
                                  colorName: allColors[0]?.name ?? '',
                                  hex: allColors[0]?.hex ?? '#C47A5A',
                                }),
                              })
                                .then(r => r.json())
                                .then(json => { if (json.image) setEditedImage(json.image); })
                                .catch(() => {})
                                .finally(() => setApplyingColor(false));
                            }}
                            className="absolute inset-x-0 bottom-0 py-3 bg-gradient-to-t from-black/70 to-transparent flex items-end justify-center pb-3"
                          >
                            <span className="text-white text-xs font-medium">Preview close-up ↑</span>
                          </button>
                        </>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <p className="text-xs text-[var(--ink-light)]">Preview unavailable</p>
                        </div>
                      )}
                    </div>

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
                      <p className="text-xs text-[var(--ink-mid)] leading-relaxed mb-2">{art.description}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-[var(--ink-light)]">{art.toolsNeeded.join(' · ')}</p>
                        <p className="text-xs text-[var(--ink-light)]">{art.estimatedTime}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Refresh nail art */}
              <button
                onClick={refreshNailArt}
                disabled={refreshingArt || nailArtEntries.some(e => e.loading)}
                className="w-full py-3 rounded-2xl border border-[var(--cream-dk)] bg-white text-sm text-[var(--ink-mid)] font-medium flex items-center justify-center gap-2 active:bg-[var(--cream-dk)]"
              >
                <span>↻</span><span>Show different styles</span>
              </button>
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
            <span>↑</span><span>{sharing ? 'Sharing…' : 'Share my look'}</span>
          </button>
        </div>
      )}
    </main>
  );
}
