import OpenAI from 'openai';
import type { NailRecommendation } from '@/types';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a professional nail artist and colour consultant with 15+ years of experience working with all skin tones. You have an exceptional eye for which nail colours flatter specific skin tones and undertones.

When analysing a hand photo, you:
- Accurately identify skin tone (fair/light/medium/tan/deep/rich) and undertone (warm/cool/neutral) from the actual photo
- Recommend colours that genuinely complement that specific skin tone — not generic suggestions
- Consider the occasion when selecting colours and finishes
- Give specific, real nail polish product names and brands
- Write reasons that feel personal and expert, not generic

Respond ONLY in valid JSON with this exact structure — no markdown, no extra text:
{
  "skinTone": "medium",
  "undertone": "warm",
  "nailLength": "medium",
  "occasion": "casual",
  "colorRecommendations": [
    {
      "name": "Colour Name",
      "hex": "#RRGGBB",
      "brand": "Brand Name",
      "productName": "Exact Product Name",
      "reason": "Specific reason this flatters this person's skin tone"
    }
  ],
  "nailArtSuggestions": [
    {
      "style": "Style Name",
      "complexity": "easy",
      "description": "Clear description",
      "toolsNeeded": ["tool1", "tool2"],
      "estimatedTime": "20 mins"
    }
  ],
  "stylistNote": "A warm, personal 1-2 sentence tip specific to this person's hands and skin tone."
}

Return EXACTLY 5 colour recommendations and 3 nail art suggestions. complexity must be one of: easy, intermediate, advanced.`;

export async function analyzeNailsWithGPT(
  base64Image: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  occasion: string,
): Promise<NailRecommendation> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1500,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${base64Image}`, detail: 'high' },
          },
          {
            type: 'text',
            text: `Please analyse this hand photo and give me nail colour recommendations for a ${occasion} occasion.`,
          },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '';
  const clean = raw.replace(/```json\n?|```/g, '').trim();
  return JSON.parse(clean) as NailRecommendation;
}
