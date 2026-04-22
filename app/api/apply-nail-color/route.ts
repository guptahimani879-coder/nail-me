import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType, colorName, hex } = await req.json();

    if (!imageBase64 || !colorName) {
      return NextResponse.json({ error: 'MISSING_PARAMS' }, { status: 400 });
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const ext = mediaType === 'image/png' ? 'png' : 'jpg';
    const file = await toFile(buffer, `hand.${ext}`, { type: mediaType });

    const response = await client.images.edit({
      model: 'gpt-image-2',
      image: file,
      prompt: `Apply ${colorName} nail polish (hex color ${hex}) to all the fingernails in this photo. Keep everything else exactly the same — the hand position, skin tone, lighting, and background. Only change the nail color.`,
      n: 1,
      size: '1024x1024',
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image returned');

    return NextResponse.json({ image: `data:image/png;base64,${b64}` });
  } catch (err: unknown) {
    console.error('[/api/apply-nail-color]', err);
    return NextResponse.json({ error: 'GENERATION_FAILED' }, { status: 500 });
  }
}
