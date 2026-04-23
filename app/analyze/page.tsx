'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { NailRecommendation } from '@/types';

type Phase = 'analyzing' | 'results' | 'error';
type Tab = 'colors' | 'nail-art';
type ColorCache = Record<string, string>;

const SHAPES = ['Round', 'Oval', 'Squoval', 'Square', 'Almond', 'Stiletto', 'Coffin'];
const DEFAULT_SHAPE = 'Oval';

// 3 curated nail art styles — images served from /nail-art/ in public folder
const CURATED_STYLES = [
  {
    style: 'Chrome Halo',
    description: 'Silver-white iridescent chrome with holographic blue shift',
    src: '/nail-art/chrome-halo.jpg',
  },
  {
    style: 'Garden Spirit',
    description: 'Sage green base with ghost flowers and gold star charms',
    src: '/nail-art/garden-spirit.jpg',
  },
  {
    style: 'Violet Aurora',
    description: 'Deep violet with holographic rainbow chrome powder finish',
    src: '/nail-art/violet-aurora.jpg',
  },
];

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

async function fetchColorPreview(
  imageBase64: string,
  colorName: string,
  hex: string,
  shape: string,
): Promise<{ image: string | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 58000);
  try {
    const res = await fetch('/api/apply-nail-color', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageBase64, colorName, hex, shape }),
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


export default function AnalyzePage() {
  const router = useRouter();

  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const rawBase64Ref = useRef<string>('');
  const mediaTypeRef = useRef<string>('image/jpeg');
  const pngBase64Ref = useRef<string>('');
  const recommendationRef = useRef<NailRecommendation | null>(null);
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

    if (savedRec) {
      try {
        loadedFromCache.current = true;
        const data = JSON.parse(savedRec) as NailRecommendation;
        setRecommendation(data);
        recommendationRef.current = data;
        const top = data.colorRecommendations?.[0];
        if (top) {
          setSelectedHex(top.hex);
          setSelectedColorName(top.name);
          const key = `${top.hex}|${DEFAULT_SHAPE}`;
          wantedKey.current = key;
          setApplyingColor(true);
          toPngBase64(img).then(b64 => {
            pngBase64Ref.current = b64;
            warmColor(top.name, top.hex, DEFAULT_SHAPE);
          }).catch(() => { setApplyingColor(false); wantedKey.current = ''; });
        }
        setPhase('results');
        return;
      } catch { /* fall through */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const warmColor = useCallback((colorName: string, hex: string, shape: string) => {
    const key = `${hex}|${shape}`;
    if (colorCache.current[key] || colorLoading.current.has(key)) return;
    colorLoading.current.add(key);
    fetchColorPreview(pngBase64Ref.current, colorName, hex, shape).then(({ image, error }) => {
      colorLoading.current.delete(key);
      if (image) {
        colorCache.current[key] = image;
        setCacheVersion(v => v + 1);
      } else if (wantedKey.current === key) {
        setApplyError(error ?? 'Preview generation failed');
        setApplyingColor(false);
        wantedKey.current = '';
      }
    });
  }, []);


  const analyze = useCallback(async (occ: string) => {
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: rawBase64Ref.current, mediaType: mediaTypeRef.current, occasion: occ }),
      });
      const data: NailRecommendation = await res.json();
      return data;
    } catch { return null; }
  }, []);

  useEffect(() => {
    if (!rawBase64Ref.current || !occasion || loadedFromCache.current) return;
    (async () => {
      const data = await analyze(occasion);
      if (!data) { setErrorMsg('Analysis failed — please try again'); setPhase('error'); return; }
      setRecommendation(data);
      recommendationRef.current = data;
      const top = data.colorRecommendations?.[0];
      if (top) {
        setSelectedHex(top.hex);
        setSelectedColorName(top.name);
        wantedKey.current = `${top.hex}|${DEFAULT_SHAPE}`;
        setApplyingColor(true);
      }
      setPhase('results');
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
    if (pngBase64Ref.current) {
      warmColor(colorName, hex, shape);
    } else {
      const img = sessionStorage.getItem('nail_image') ?? '';
      toPngBase64(img).then(b64 => { pngBase64Ref.current = b64; warmColor(colorName, hex, shape); })
        .catch(() => { setApplyingColor(false); wantedKey.current = ''; });
    }
  }, [warmColor]);


  // Re-apply color when shape changes
  const prevShapeRef = useRef(DEFAULT_SHAPE);
  useEffect(() => {
    if (selectedShape === prevShapeRef.current || !selectedHex || !selectedColorName || phase !== 'results') return;
    prevShapeRef.current = selectedShape;
    applyColor(selectedHex, selectedColorName, selectedShape);
  }, [selectedShape, selectedHex, selectedColorName, phase, applyColor]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    const imageToShare = editedImage ?? imageDataUri;
    try {
      if (navigator.share) {
        const shareData: ShareData = { title: 'My Nail Look — Nail Me', text: `Color: ${selectedColorName} | Shape: ${selectedShape} | Book at Your Salon` };
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
  const colors = recommendation?.colorRecommendations?.slice(0, 3) ?? [];

  // Stiletto nail SVG path (shared between color swatch and nail art image swatch)
  const STILETTO_PATH = "M40,4 C40,4 68,32 68,72 L68,104 Q68,114 58,114 L22,114 Q12,114 12,104 L12,72 C12,32 40,4 40,4 Z";

  function NailSwatch({ hex, selected }: { hex: string; selected: boolean }) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: '#f5f0eb' }}>
        <svg viewBox="0 0 80 118" className="w-3/5 h-3/5 drop-shadow-md">
          <path
            d={STILETTO_PATH}
            fill={hex}
            stroke={selected ? '#1a1a1a' : 'transparent'}
            strokeWidth="3"
          />
          <path
            d="M26,28 Q33,16 40,12"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  function NailImageSwatch({ src, alt }: { src: string; alt: string }) {
    const clipId = `clip-${alt.replace(/\s+/g, '-').toLowerCase()}`;
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: '#f5f0eb' }}>
        <svg viewBox="0 0 80 118" className="w-3/5 h-3/5 drop-shadow-md">
          <defs>
            <clipPath id={clipId}>
              <path d={STILETTO_PATH} />
            </clipPath>
          </defs>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <image
            href={src}
            x="0" y="0" width="80" height="118"
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
          {/* subtle gloss highlight */}
          <path
            d="M26,28 Q33,16 40,12"
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col max-w-lg mx-auto" style={{ paddingBottom: 'max(5rem, env(safe-area-inset-bottom))' }}>

      {/* Sticky top */}
      <div className="sticky top-0 z-20 bg-[var(--cream)]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button onClick={() => router.push('/')} className="text-[var(--ink-light)] text-sm py-2 pr-3">← Back</button>
          <div className="text-center">
            <p className="text-xs tracking-[0.25em] uppercase text-[var(--ink-light)] leading-none">Your Salon Name</p>
            <p className="font-display text-lg font-light text-[var(--ink)]">Nail Me</p>
          </div>
          <div className="w-14" />
        </div>

        {/* Hand photo */}
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
            <button
              onClick={() => { setApplyError(null); applyColor(selectedHex, selectedColorName, selectedShape); }}
              className="text-white bg-red-500 px-2 py-1 rounded-lg flex-shrink-0"
            >Retry</button>
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
            <button onClick={() => { setPhase('analyzing'); analyze(occasion).then(data => { if (data) { setRecommendation(data); setPhase('results'); } }); }} className="px-6 py-2 rounded-full bg-[var(--ink)] text-white text-sm">Try again</button>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      {phase === 'results' && recommendation && (
        <div className="flex-1 px-4 pt-4 pb-2">

          {/* Skin read + stylist note */}
          <div className="bg-white rounded-2xl p-3 border border-[var(--cream-dk)] text-sm mb-3">
            <span className="font-medium text-[var(--ink)]">Skin read: </span>
            <span className="text-[var(--ink-mid)]">{recommendation.skinTone} · {recommendation.undertone} undertone · {recommendation.nailLength} nails</span>
            {recommendation.stylistNote && (
              <p className="text-xs text-[var(--ink-mid)] italic mt-1.5 leading-snug">&ldquo;{recommendation.stylistNote}&rdquo;</p>
            )}
          </div>

          {/* Colors tab */}
          {activeTab === 'colors' && (
            <div className="animate-fade-up">
              <p className="text-xs text-[var(--ink-light)] uppercase tracking-widest mb-3">Recommended for you</p>
              <div className="grid grid-cols-3 gap-3">
                {colors.map((c, i) => {
                  const isSelected = selectedHex === c.hex;
                  return (
                    <button
                      key={`${c.hex}-${i}`}
                      onClick={() => applyColor(c.hex, c.name, selectedShape)}
                      className={`bg-white rounded-2xl overflow-hidden border transition-all text-left active:scale-[0.97] ${
                        isSelected ? 'border-[var(--ink)] shadow-sm' : 'border-[var(--cream-dk)]'
                      }`}
                    >
                      {/* Nail swatch image area */}
                      <div className="relative w-full bg-[var(--cream)]" style={{ aspectRatio: '1/1' }}>
                        <NailSwatch hex={c.hex} selected={isSelected} />
                        {isSelected && !applyingColor && (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[var(--ink)] flex items-center justify-center">
                            <span className="text-white text-[8px]">✓</span>
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="font-medium text-[var(--ink)] text-xs leading-tight line-clamp-1">{c.name}</p>
                        <p className="text-[10px] text-[var(--ink-mid)] mt-0.5 line-clamp-2 leading-snug">{c.reason}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nail Art tab */}
          {activeTab === 'nail-art' && (
            <div className="animate-fade-up">
              <p className="text-xs text-[var(--ink-light)] uppercase tracking-widest mb-3">Trending now</p>
              <div className="grid grid-cols-3 gap-3">
                {CURATED_STYLES.map((art, i) => (
                  <div
                    key={`${art.style}-${i}`}
                    className="bg-white rounded-2xl overflow-hidden border border-[var(--cream-dk)] text-left"
                  >
                    <div className="relative w-full bg-[var(--cream)]" style={{ aspectRatio: '1/1' }}>
                      <NailImageSwatch src={art.src} alt={art.style} />
                    </div>
                    <div className="p-2.5">
                      <p className="font-medium text-[var(--ink)] text-xs leading-tight line-clamp-1">{art.style}</p>
                      <p className="text-[10px] text-[var(--ink-mid)] mt-0.5 line-clamp-2 leading-snug">{art.description}</p>
                    </div>
                  </div>
                ))}
              </div>
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
            <span>↑</span><span>{sharing ? 'Sharing…' : 'Send look to salon'}</span>
          </button>
        </div>
      )}
    </main>
  );
}
