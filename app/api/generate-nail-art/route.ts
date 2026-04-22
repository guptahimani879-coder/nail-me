import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { style, description, colorName, hex, skinTone, occasion } = await req.json();

    if (!style || !description) {
      return NextResponse.json({ error: 'MISSING_PARAMS' }, { status: 400 });
    }

    const prompt = `Close-up professional nail photography of a hand with beautifully manicured nails. Nail art style: ${style}. ${description}. Nail color: ${colorName} (${hex}). Skin tone: ${skinTone}. Occasion: ${occasion}. Sharp focus, studio lighting, elegant, high-end beauty editorial style. No text or watermarks.`;

    const response = await client.images.generate({
      model: 'gpt-image-2',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'medium',
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image returned');

    return NextResponse.json({ image: `data:image/png;base64,${b64}` });
  } catch (err: unknown) {
    console.error('[/api/generate-nail-art]', err);
    return NextResponse.json({ error: 'GENERATION_FAILED' }, { status: 500 });
  }
}
