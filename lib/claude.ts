import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt } from './prompts';
import type { NailRecommendation } from '@/types';

const client = new Anthropic();

export async function analyzeNails(
  base64Image: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  occasion: string,
): Promise<NailRecommendation> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          { type: 'text', text: buildPrompt(occasion) },
        ],
      },
    ],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const clean = raw.replace(/```json\n?|```/g, '').trim();
  return JSON.parse(clean) as NailRecommendation;
}
