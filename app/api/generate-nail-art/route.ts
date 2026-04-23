import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { style, description, colorName, hex } = await req.json();

    if (!style || !description) {
      return NextResponse.json({ error: 'MISSING_PARAMS' }, { status: 400 });
    }

    // Always generate a stunning close-up nail art image — no hand photo needed.
    // This is faster, more visually striking, and shows the art clearly.
    const prompt = `Macro beauty photography of five perfectly manicured fingernails with ${style} nail art. ${description}. Accent colour: ${colorName} (${hex}). Shot flat on a white marble surface. Ultra sharp macro lens, vibrant saturated colours, soft bokeh background, professional editorial nail photography. Feminine, pretty, and highly detailed — trending on Pinterest 2026. Only the nails visible, no fingers or skin.`;

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
