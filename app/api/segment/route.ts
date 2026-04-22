import { NextRequest, NextResponse } from 'next/server';
import { segmentImage } from '@/lib/replicate';

export async function POST(req: NextRequest) {
  try {
    const { imageDataUri } = await req.json();

    if (!imageDataUri) {
      return NextResponse.json(
        { error: 'MISSING_PARAMS', message: 'imageDataUri is required' },
        { status: 400 },
      );
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: 'NO_REPLICATE_TOKEN', message: 'REPLICATE_API_TOKEN is not set' },
        { status: 500 },
      );
    }

    const maskUrls = await segmentImage(imageDataUri);
    return NextResponse.json({ maskUrls });
  } catch (err) {
    console.error('[/api/segment]', err);
    return NextResponse.json(
      { error: 'SEGMENT_FAILED', message: 'Segmentation failed — check Replicate token and model availability' },
      { status: 500 },
    );
  }
}
