// Supabase Edge Function: read a fuel-pump display photo with Claude vision (fallback after
// on-device ML Kit). Secret: ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...).
// Auth: Supabase verifies the caller's JWT by default, so only signed-in users can call it.
// The app always shows the result in an editable confirm step before anything is saved.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';

import { parseRequest, PUMP_PROMPT, PUMP_SCHEMA, sanitizeReading } from './lib.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Reads ANTHROPIC_API_KEY from the environment. The app gives up after ~20 s anyway.
const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'not_configured' }, 503);

  const parsed = parseRequest(await req.json().catch(() => null));
  if (!parsed) return json({ error: 'bad_request' }, 400);

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // Re-run on Anthropic's recommended model if a safety classifier declines.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: PUMP_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: parsed.imageBase64 } },
            { type: 'text', text: PUMP_PROMPT },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') return json({ reading: null, reason: 'refused' });
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return json({ reading: null, reason: 'no_output' });
    return json({ reading: sanitizeReading(text.text) });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'rate_limited' }, 429);
    if (err instanceof Anthropic.APIError) return json({ error: 'upstream_failed', status: err.status ?? null }, 502);
    return json({ error: 'upstream_failed' }, 502);
  }
});
