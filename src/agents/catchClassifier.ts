/**
 * Catch Classifier Agent
 * Uses Claude Vision (claude-sonnet-4-20250514) to identify fish species
 * from catch photos captured on Georgian Bay.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as FileSystem from 'expo-file-system/legacy';

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';

export interface ClassificationResult {
  species: string;
  confidence: number;    // 0-1
  sizeEstimate: string;
  notes: string;
  lengthCm: number | null;
  girthCm: number | null;
  weightLbsEstimate: number | null;
}

const SYSTEM_PROMPT = `You are an expert Georgian Bay fishing guide and marine biologist with 30 years of experience identifying freshwater and Great Lakes fish species. You specialize in Lake Ontario and Georgian Bay (Lake Huron) salmon, trout, and bass fishing.

Common species in Georgian Bay include:
- Chinook Salmon (King Salmon) - largest, silver sides, black gums
- Coho Salmon - silver, smaller than Chinook, white gums
- Atlantic Salmon - brown/red spots, smaller adipose fin
- Lake Trout - deeply forked tail, light spots on dark background
- Rainbow Trout (Steelhead) - pink lateral stripe, speckled
- Brown Trout - dark spots with red halos
- Smallmouth Bass - bronze-green, 3 anal spines
- Walleye - glassy eyes, olive-gold coloring
- Northern Pike - elongated, spotted pattern

When analyzing catch photos, consider:
- Body shape and size proportions
- Coloration and markings
- Fin placement and shape
- Tail fork depth
- Visible dental features if mouth is open
- Estimated length vs. hand/rod references in frame

Always respond with valid JSON only, no markdown.`;

const USER_MESSAGE = `Identify the main subject in this photo. If it is a fish, identify the species. If no fish is present, identify whatever object or subject is most prominent (e.g. "Water Bottle", "Hand", "Coffee Mug") — this mode is used for testing the measurement pipeline.

Estimate the length and girth (or equivalent dimensions) of the main subject using any visible reference objects (hands, ruler, rod, furniture, etc.). If no reference is visible, use your best judgment based on typical proportions and apparent scale.

Respond ONLY with valid JSON in this exact format:
{
  "species": "Subject name (e.g. Chinook Salmon or Water Bottle)",
  "confidence": 0.85,
  "sizeEstimate": "approximately 65-70 cm / 26-28 inches",
  "lengthCm": 68,
  "girthCm": 38,
  "notes": "What you identified, what references you used, and how you estimated the dimensions"
}

Rules for length/girth:
- lengthCm: longest axis of the subject in centimetres
- girthCm: circumference at the widest point in centimetres
- Always provide your best estimate — never return null unless the image is completely unreadable`;

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    if (!API_KEY) {
      throw new Error('Anthropic API key not configured');
    }
    anthropicClient = new Anthropic({
      apiKey: API_KEY,
      dangerouslyAllowBrowser: true,
    });
  }
  return anthropicClient;
}

/**
 * Convert a local file URI to base64 string.
 */
async function fileToBase64(fileUri: string): Promise<string> {
  try {
    // Strip file:// prefix if present for expo-file-system
    const path = fileUri.startsWith('file://') ? fileUri : fileUri;
    const base64 = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64;
  } catch (error) {
    console.error('[Classifier] fileToBase64 error:', error);
    throw error;
  }
}

/**
 * Detect image media type from file extension.
 */
function getMediaType(fileUri: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  const lower = fileUri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg'; // default
}

/**
 * Classify a catch photo using Claude Vision.
 * Returns species, confidence, size estimate, and notes.
 */
export async function classifyCatch(
  photoUri: string
): Promise<ClassificationResult> {
  const defaultResult: ClassificationResult = {
    species: 'Unknown',
    confidence: 0,
    sizeEstimate: 'Unknown',
    notes: 'Classification failed — please identify manually.',
    lengthCm: null,
    girthCm: null,
    weightLbsEstimate: null,
  };

  try {
    if (!photoUri) {
      return defaultResult;
    }

    const client = getClient();

    let base64Data: string;
    try {
      base64Data = await fileToBase64(photoUri);
    } catch {
      return {
        ...defaultResult,
        notes: 'Could not read photo file for classification.',
      };
    }

    const mediaType = getMediaType(photoUri);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: USER_MESSAGE,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return defaultResult;
    }

    const rawText = textContent.text.trim();

    // Extract JSON from response (handle any accidental markdown)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Classifier] No JSON found in response:', rawText);
      return defaultResult;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      species?: string;
      confidence?: number;
      sizeEstimate?: string;
      notes?: string;
      lengthCm?: number | null;
      girthCm?: number | null;
    };

    const lengthCm = typeof parsed.lengthCm === 'number' && parsed.lengthCm > 0 ? parsed.lengthCm : null;
    const girthCm = typeof parsed.girthCm === 'number' && parsed.girthCm > 0 ? parsed.girthCm : null;

    // Weight (lbs) = (length_in × girth_in²) / 800
    let weightLbsEstimate: number | null = null;
    if (lengthCm && girthCm) {
      const lengthIn = lengthCm / 2.54;
      const girthIn = girthCm / 2.54;
      weightLbsEstimate = Math.round((lengthIn * girthIn * girthIn) / 800 * 10) / 10;
    }

    return {
      species: parsed.species || 'Unknown',
      confidence: typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0,
      sizeEstimate: parsed.sizeEstimate || 'Unknown',
      notes: parsed.notes || '',
      lengthCm,
      girthCm,
      weightLbsEstimate,
    };
  } catch (error) {
    console.error('[Classifier] classifyCatch error:', error);
    return defaultResult;
  }
}

/**
 * Generate a trip insight using Claude when 5+ catch events are available.
 * Returns a markdown string with fishing analysis.
 */
export async function generateTripInsight(
  eventSummaries: Array<{
    species: string;
    time: string;
    lat: number;
    lng: number;
    hydroScore: number;
    setup: {
      downriggerDepth: number;
      lureType: string;
      trollingSpeed: number;
    };
  }>
): Promise<string> {
  if (eventSummaries.length < 5) {
    return 'Log 5 or more catches to unlock AI trip analysis.';
  }

  try {
    const client = getClient();

    const summaryText = eventSummaries
      .map(
        (e, i) =>
          `Catch ${i + 1}: ${e.species} at ${e.time}, ` +
          `Depth: ${e.setup.downriggerDepth}ft, Lure: ${e.setup.lureType}, ` +
          `Speed: ${e.setup.trollingSpeed}mph, HydroScore: ${e.hydroScore}/100`
      )
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: `You are a Georgian Bay salmon fishing expert analyzing a trip log.

Trip data:
${summaryText}

Provide a concise 3-4 sentence fishing insight covering:
1. What patterns are emerging (depth, lure, time of day)
2. Which setups seem most productive
3. One actionable recommendation for the next hour
4. Brief note on conditions and HydroScore trends

Keep it practical and specific to Georgian Bay salmon fishing.`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    return textContent?.type === 'text'
      ? textContent.text
      : 'Unable to generate insight.';
  } catch (error) {
    console.error('[Classifier] generateTripInsight error:', error);
    return 'AI analysis temporarily unavailable.';
  }
}
