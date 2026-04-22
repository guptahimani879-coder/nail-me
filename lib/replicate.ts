import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
});

// Replicate SDK >=0.29 wraps file outputs in FileOutput objects with a .url() method.
function toUrl(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val && typeof (val as { url?: () => string }).url === 'function') {
    return (val as { url: () => string }).url();
  }
  // href fallback
  if (val && typeof (val as { href?: string }).href === 'string') {
    return (val as { href: string }).href;
  }
  return String(val);
}

// Automatic mask generation — returns all segmented regions in the image.
// The caller picks the mask that covers the user's click point.
export async function segmentImage(imageDataUri: string): Promise<string[]> {
  const output = await replicate.run(
    'meta/sam-2:fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83',
    {
      input: {
        image: imageDataUri,
        points_per_side: 32,
        pred_iou_thresh: 0.84,
        stability_score_thresh: 0.88,
      },
    },
  ) as { combined_mask: unknown; individual_masks: unknown[] };

  const masks = output?.individual_masks;
  if (!masks || masks.length === 0) throw new Error('SAM returned no masks');
  return masks.map(toUrl);
}
