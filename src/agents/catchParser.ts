import Anthropic from '@anthropic-ai/sdk';

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';

export interface ParsedCatchFields {
  targetSpecies?: string;
  lureType?: string;
  lureColor?: string;
  downriggerDepth?: number;
  trollingSpeed?: number;
  rigType?: string;
  rigPosition?: string;
  spreadPosition?: string;
  lineType?: string;
  waterClarity?: string;
  waveDirection?: string;
  boatHeading?: string;
  windDir?: string;
  flasherColor?: string;
  leadLengthIn?: number;
  ballWeightLbs?: number;
  backFromBall?: number;
}

export async function parseCatchFromTranscript(transcript: string): Promise<ParsedCatchFields> {
  if (!API_KEY || !transcript.trim()) return {};

  const client = new Anthropic({ apiKey: API_KEY, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Extract fishing setup fields from this voice note. Only include fields clearly mentioned.

Valid values:
targetSpecies: Chinook | Coho | Rainbow | Lake Trout
lureType: Spoon | Flasher fly | Plug | Body bait
rigType: Downrigger | Flatline
rigPosition: Main | Slider
lineType: Mono | Braid | Leadcore | Fluorocarbon
waveDirection: Stern | Port | Starboard | Bow
boatHeading: N | NE | E | SE | S | SW | W | NW
windDir: N | NE | E | SE | S | SW | W | NW
waterClarity: Clear | Slightly stained | Green | Murky
spreadPosition: Port inner | Port outer | Stbd inner | Stbd outer | Board | Flatline
ballWeightLbs: 8 | 10 | 12 | 14 | 15 (number)
downriggerDepth: number (feet)
trollingSpeed: number (mph)
backFromBall: number (feet)
leadLengthIn: number (inches)
lureColor: free text
flasherColor: free text

Voice note: "${transcript}"

Respond with JSON only. Omit fields not mentioned.`,
    }],
  });

  const text = response.content.find(c => c.type === 'text')?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]) as ParsedCatchFields;
  } catch {
    return {};
  }
}
