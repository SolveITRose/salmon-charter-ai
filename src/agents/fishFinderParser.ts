import Anthropic from '@anthropic-ai/sdk';
import { FishFinderData } from '../models/Event';

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';

const PROMPT = `You are analyzing a photo of a marine fish finder or chartplotter display.
Extract only the values you can read clearly and return them as JSON.

Fields to extract:
- depth: water depth in feet (look for ft, FT, or a depth number)
- waterTemp: water temperature in Celsius (convert from °F if needed: (F-32)*5/9)
- speedOverGround: speed over ground in mph (labeled SOG, Speed, SPD — convert from knots if needed: knots * 1.15078)
- courseOverGround: course over ground in degrees (labeled COG, Course, CRS)
- heading: vessel heading in degrees (labeled HDG, Heading, BRG)
- baitOnScreen: true if you can see bait fish arches, balls, or schools on the sonar display; false if sonar is visible but empty; omit if sonar is not visible

Return ONLY a JSON object. Omit any field you cannot read confidently.
Examples: {"depth": 87, "waterTemp": 14.2, "speedOverGround": 2.3, "baitOnScreen": true}
If nothing is readable: {}`;

export async function parseFishFinderScreen(base64: string): Promise<Partial<FishFinderData>> {
  const client = new Anthropic({
    apiKey: API_KEY,
    dangerouslyAllowBrowser: true,
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};

  const parsed = JSON.parse(match[0]) as Partial<FishFinderData>;
  return parsed;
}
