import { NextRequest, NextResponse } from 'next/server';
import { analyzeNailsWithGPT } from '@/lib/openai';
import type { NailRecommendation } from '@/types';

const DEMO: NailRecommendation = {
  skinTone: 'medium',
  undertone: 'warm',
  nailLength: 'medium',
  occasion: 'casual',
  colorRecommendations: [
    { name: 'Terracotta Sunset', hex: '#C47A5A', brand: 'OPI', productName: 'Cajun Shrimp', reason: 'Warm terracotta flatters medium skin with warm undertones beautifully' },
    { name: 'Deep Rose', hex: '#8B2635', brand: 'Essie', productName: 'Bordeaux', reason: 'Rich burgundy adds elegance and depth against warm skin' },
    { name: 'Dusty Mauve', hex: '#A0737A', brand: 'Sally Hansen', productName: 'Mauve Over', reason: 'Soft mauve blends warmth and femininity perfectly' },
    { name: 'Caramel Nude', hex: '#C49A6C', brand: 'OPI', productName: 'Dulce de Leche', reason: 'A nude that actually matches warm medium skin — elongates fingers' },
    { name: 'Coral Pop', hex: '#E8735A', brand: 'Zoya', productName: 'Marigold', reason: 'Bright coral energises warm undertones without clashing' },
  ],
  nailArtSuggestions: [
    { style: 'Minimalist Line Art', complexity: 'easy', description: 'Thin gold lines on a nude base for effortless chic', toolsNeeded: ['thin brush', 'gold nail art pen'], estimatedTime: '20 mins' },
    { style: 'French Ombré', complexity: 'intermediate', description: 'Soft gradient from nude to blush at the tips', toolsNeeded: ['sponge', 'two nail polishes'], estimatedTime: '35 mins' },
    { style: 'Floral Accent', complexity: 'advanced', description: 'Tiny hand-painted flowers on one accent nail', toolsNeeded: ['dotting tool', 'fine brush', 'multiple colors'], estimatedTime: '60 mins' },
  ],
  stylistNote: 'Your warm medium skin tone is incredibly versatile — terracotta and dusty rose shades will make your hands look radiant.',
};

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType, occasion = 'casual' } = await req.json();

    if (!image || !mediaType) {
      return NextResponse.json(
        { error: 'MISSING_PARAMS', message: 'image and mediaType are required' },
        { status: 400 },
      );
    }

    const base64 = image.replace(/^data:image\/\w+;base64,/, '');

    const recommendation = await analyzeNailsWithGPT(
      base64,
      mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
      occasion,
    );

    return NextResponse.json(recommendation);
  } catch (err: unknown) {
    console.error('[/api/analyze]', err);
    return NextResponse.json({ ...DEMO, _demo: true });
  }
}
