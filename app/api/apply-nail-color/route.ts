import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';

export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, colorName, hex, shape } = await req.json();

    if (!imageBase64 || !colorName) {
      return NextResponse.json({ error: 'MISSING_PARAMS' }, { status: 400 });
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const file = await toFile(buffer, 'hand.png', { type: 'image/png' });

    const shapeNote = shape ? ` The nails are ${shape} shaped.` : '';
    const prompt =
      `Paint all fingernails in this photo with ${colorName} nail polish (hex ${hex}).${shapeNote} ` +
      `Apply a clean glossy coat of ${colorName} colour to every visible nail. ` +
      `Do not change anything else — keep the hand, fingers, skin, background, and lighting exactly as they are.`;

    const response = await client.images.edit({
      model: 'gpt-image-2',
      image: file,
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'low',
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image returned from gpt-image-2');

    return NextResponse.json({ image: `data:image/png;base64,${b64}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[/api/apply-nail-color]', msg);
    return NextResponse.json({ error: 'GENERATION_FAILED', message: msg }, { status: 500 });
  }
}
