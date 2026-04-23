import Anthropic from '@anthropic-ai/sdk';
import type { NailRecommendation } from '@/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a professional nail artist and colour consultant with 15+ years of experience working with all skin tones. You have an exceptional eye for which nail colours flatter specific skin tones and undertones.

When analysing a hand photo, you:
- Accurately identify skin tone (fair/light/medium/tan/deep/rich) and undertone (warm/cool/neutral) from the actual photo
- Recommend colours that genuinely complement that specific skin tone — not generic suggestions
- Consider the occasion when selecting colours and finishes
- Give specific, real nail polish product names and brands (OPI, Essie, Zoya, Sally Hansen, Chanel, Dior, Orly, CND)
- Write reasons that feel personal and expert, not generic
- Prioritise trending 2026 shades: glazed nudes, chrome finishes, opalescent pinks, jelly sheers, terracottas, mocha browns, rich berry tones

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

export async function analyzeNailsWithClaude(
  base64Image: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  occasion: string,
  excludeHexes: string[] = [],
): Promise<NailRecommendation> {
  const excludeNote = excludeHexes.length
    ? ` Do NOT suggest any of these hex colours already shown: ${excludeHexes.join(', ')}. Suggest completely different colours.`
    : '';

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          {
            type: 'text',
            text: `Please analyse this hand photo and give me nail colour recommendations for a ${occasion} occasion.${excludeNote}`,
          },
        ],
      },
    ],
  });

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const clean = raw.replace(/```json\n?|```/g, '').trim();
  return JSON.parse(clean) as NailRecommendation;
}
