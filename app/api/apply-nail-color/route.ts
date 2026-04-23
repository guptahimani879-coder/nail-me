import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { colorName, hex, shape, skinTone, nailLength } = await req.json();

    if (!colorName || !hex) {
      return NextResponse.json({ error: 'MISSING_PARAMS' }, { status: 400 });
    }

    const skinDesc = skinTone ?? 'medium';
    const lengthDesc = nailLength ? `${nailLength}-length` : 'medium-length';
    const shapeDesc = shape ?? 'oval';

    const prompt =
      `Professional beauty photography of a woman's hand with ${skinDesc} skin tone. ` +
      `${lengthDesc} ${shapeDesc}-shaped nails painted with ${colorName} nail polish, hex colour ${hex}. ` +
      `The nail colour is clearly visible, rich and saturated — unmistakably ${colorName}. ` +
      `Glossy finish. Clean white background. Soft studio lighting. Macro lens. Editorial quality. ` +
      `No rings or jewellery. Fingers relaxed, slightly spread. Nails perfectly manicured.`;

    const response = await client.images.generate({
      model: 'gpt-image-2',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'high',
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
