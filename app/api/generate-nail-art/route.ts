import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType, style, description, colorName, hex } = await req.json();

    if (!style || !description) {
      return NextResponse.json({ error: 'MISSING_PARAMS' }, { status: 400 });
    }

    const prompt = `Apply this nail art to the fingernails in the photo: ${style} — ${description}. Use ${colorName} (${hex}) as the base color. Keep the hand, skin tone, and background identical. Only change the nails.`;

    let response;

    if (imageBase64) {
      // Edit the actual hand photo for a personalised preview
      const buffer = Buffer.from(imageBase64, 'base64');
      const ext = mediaType === 'image/png' ? 'png' : 'jpg';
      const file = await toFile(buffer, `hand.${ext}`, { type: mediaType });

      response = await client.images.edit({
        model: 'gpt-image-2',
        image: file,
        prompt,
        n: 1,
        size: '1024x1024',
      });
    } else {
      // Fallback: generate a generic preview
      response = await client.images.generate({
        model: 'gpt-image-2',
        prompt: `Close-up of beautifully manicured nails with ${style} nail art. ${description}. Nail color: ${colorName} (${hex}). Studio beauty photography.`,
        n: 1,
        size: '1024x1024',
        quality: 'medium',
      });
    }

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image returned');

    return NextResponse.json({ image: `data:image/png;base64,${b64}` });
  } catch (err: unknown) {
    console.error('[/api/generate-nail-art]', err);
    return NextResponse.json({ error: 'GENERATION_FAILED' }, { status: 500 });
  }
}
