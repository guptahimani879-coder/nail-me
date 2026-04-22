import { NextRequest, NextResponse } from 'next/server';

// Proxy Replicate mask images through our server so the browser can call
// getImageData() on them without CORS taint errors.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url || !url.startsWith('https://')) {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  try {
    const upstream = await fetch(url);
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'image/png',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new NextResponse('Failed to fetch mask', { status: 502 });
  }
}
