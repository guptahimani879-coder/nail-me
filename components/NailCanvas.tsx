'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import type { NailMask } from '@/types';

interface Props {
  imageDataUri: string;
  masks: NailMask[];
  selectedHex: string;
  onNailClick: (x: number, y: number) => void;
  segmentingPoint: { x: number; y: number } | null;
  phase: 'tap' | 'results';
}

// ── HSL helpers ───────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

function proxied(url: string) {
  return `/api/proxy-mask?url=${encodeURIComponent(url)}`;
}

/**
 * Loads a mask PNG from a URL and returns it as a boolean array.
 * White pixels (R > 128) = nail, black = background.
 * Routed through /api/proxy-mask so getImageData doesn't throw a CORS taint error.
 */
async function loadMask(maskUrl: string, w: number, h: number): Promise<boolean[]> {
  return new Promise((resolve) => {
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const result: boolean[] = new Array(w * h);
      for (let i = 0; i < w * h; i++) {
        result[i] = data[i * 4] > 128;
      }
      resolve(result);
    };
    img.onerror = () => resolve(new Array(w * h).fill(false));
    img.src = proxied(maskUrl);
  });
}

export default function NailCanvas({
  imageDataUri,
  masks,
  selectedHex,
  onNailClick,
  segmentingPoint,
  phase,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const imgRef      = useRef<HTMLImageElement | null>(null);
  // Combined boolean mask across all tapped nails (nail pixel = true)
  const combinedMaskRef = useRef<boolean[] | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  // ── Load source image once ────────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement!;
      const maxW = parent.clientWidth;
      // On mobile limit to 55vh so controls + results are visible below
      const maxH = Math.min(420, Math.round(window.innerHeight * 0.55));
      const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
      const w = Math.round(img.naturalWidth * ratio);
      const h = Math.round(img.naturalHeight * ratio);
      canvas.width = w; canvas.height = h;
      setCanvasSize({ w, h });
      drawFrame(null, selectedHex);
    };
    img.src = imageDataUri;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataUri]);

  // ── Rebuild combined mask when new SAM masks arrive ───────
  useEffect(() => {
    if (!canvasSize.w || masks.length === 0) return;
    const { w, h } = canvasSize;

    Promise.all(masks.map(m => loadMask(m.maskImageUrl, w, h))).then(allMasks => {
      const combined = new Array(w * h).fill(false);
      allMasks.forEach(mask => {
        mask.forEach((v, i) => { if (v) combined[i] = true; });
      });
      combinedMaskRef.current = combined;
      drawFrame(combined, selectedHex);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masks, canvasSize]);

  // ── Redraw when color changes ─────────────────────────────
  useEffect(() => {
    drawFrame(combinedMaskRef.current, selectedHex);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHex]);

  // ── Core draw: photo + HSL nail recolor on mask ───────────
  const drawFrame = useCallback((mask: boolean[] | null, hex: string) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || canvas.width === 0) return;
    const ctx = canvas.getContext('2d')!;
    const { width: w, height: h } = canvas;

    ctx.drawImage(img, 0, 0, w, h);
    if (!mask) return;

    // Per-pixel HSL recolor: keep luminance (gloss/texture), swap hue+sat
    const [tr, tg, tb] = hexToRgb(hex);
    const [th, ts] = rgbToHsl(tr, tg, tb);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      const pi = i * 4;
      const [, , l] = rgbToHsl(d[pi], d[pi + 1], d[pi + 2]);
      const [nr, ng, nb] = hslToRgb(th, Math.min(ts, 0.82), l);
      // 92% blend — preserves slight original color so it reads natural
      d[pi]     = Math.round(d[pi]     * 0.08 + nr * 0.92);
      d[pi + 1] = Math.round(d[pi + 1] * 0.08 + ng * 0.92);
      d[pi + 2] = Math.round(d[pi + 2] * 0.08 + nb * 0.92);
    }
    ctx.putImageData(imgData, 0, 0);

    // Gloss highlight pass — draw a soft white shine over each masked region
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffffff';
    // Just a subtle top-left to center-right gradient over the whole canvas
    // (real gloss is already in the original photo's luminance)
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.18)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }, []);

  // ── Map canvas click → original image coords → callback ──
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== 'tap') return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // Canvas CSS size vs internal resolution ratio
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top)  * scaleY;
    // Map back to original image pixels (for SAM)
    const img = imgRef.current!;
    const imgX = Math.round(canvasX * (img.naturalWidth  / canvas.width));
    const imgY = Math.round(canvasY * (img.naturalHeight / canvas.height));
    onNailClick(imgX, imgY);
  }, [phase, onNailClick]);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className={`w-full rounded-2xl block ${phase === 'tap' ? 'cursor-crosshair' : 'cursor-default'}`}
      />

      {/* Tap instruction overlay */}
      {phase === 'tap' && masks.length === 0 && !segmentingPoint && (
        <div className="absolute inset-0 flex items-end justify-center pb-5 pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 text-sm font-medium text-stone-700 border border-stone-200 shadow-sm">
            Tap each nail to try on colors
          </div>
        </div>
      )}

      {/* Spinner on the click point while SAM runs */}
      {segmentingPoint && canvasRef.current && (() => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const img = imgRef.current!;
        const cx = (segmentingPoint.x / img.naturalWidth)  * rect.width;
        const cy = (segmentingPoint.y / img.naturalHeight) * rect.height;
        return (
          <div
            className="absolute pointer-events-none"
            style={{ left: cx, top: cy, transform: 'translate(-50%,-50%)' }}
          >
            <div className="w-8 h-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin bg-white/60" />
          </div>
        );
      })()}

      {/* Dot on each tapped nail — only shown during tap phase */}
      {phase === 'tap' && masks.map((m, idx) => {
        const canvas = canvasRef.current;
        if (!canvas || !imgRef.current) return null;
        const rect = canvas.getBoundingClientRect();
        const img = imgRef.current;
        const cx = (m.pointX / img.naturalWidth)  * rect.width;
        const cy = (m.pointY / img.naturalHeight) * rect.height;
        return (
          <div
            key={idx}
            className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none"
            style={{
              left: cx, top: cy,
              transform: 'translate(-50%,-50%)',
              background: selectedHex,
            }}
          />
        );
      })}
    </div>
  );
}
