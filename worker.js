// Runs on Cloudflare's servers (copied into the build as _worker.js), never in the browser.
// 1. /api/describe → optional AI: reading text (mode "read"), describing pictures (mode "describe") or translating text (mode "translate"). API keys stay here, as Cloudflare Secrets.
// 2. Everything else → the app's normal files (env.ASSETS).
//
// Add ONE of these as a Secret in Cloudflare (Settings → Variables and Secrets):
//   GROQ_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY
// If several are set, the first in that order is used. Optional plain variable AI_MODEL overrides the model.

const DEFAULT_MODELS = {
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
};
const LABELS = { groq: 'Groq', anthropic: 'Anthropic Claude', openai: 'OpenAI' };
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BASE64_LENGTH = 5_000_000;
const MAX_TEXT_LENGTH = 10_000;

function translatePrompt(from, to) {
  return (
    `Translate the text below from ${from || 'its language'} into ${to}.` +
    ` Keep the paragraph breaks. Write ${to} in its own script: Chinese as simplified Chinese characters, Arabic in Arabic script, Hindi in Devanagari.` +
    ' Reply with the translation only: no notes, quotes, explanations or formatting.'
  );
}

const DESCRIBE_PROMPT =
  'Describe this image for a person who is blind or has low vision. ' +
  'Start with a one-sentence summary. Then describe the important details: people (without guessing who they are), ' +
  'objects, setting, colours, and any visible text, quoted exactly. Be factual and concise. Plain text only, no markdown.';

const CONTENT_HINTS = {
  words: ' The image contains only words, no numbers: read shapes like 1, 0 and 5 as the letters I/l, O and S.',
  numbers: ' The image contains only numbers and symbols, no words: read shapes like I, l, O and S as the digits 1, 0 and 5.',
};

function readPrompt(language, content) {
  const hint = (language ? ` The text is probably in ${language}.` : '') + (CONTENT_HINTS[content] ?? '');
  return (
    'Transcribe all of the text in this image exactly as written.' + hint +
    ' Keep the original reading order, line breaks and paragraph breaks. Do not translate, summarise, explain or add formatting.' +
    ' Write every word in its original script: Chinese as Chinese characters (never pinyin or other romanisation), Arabic in Arabic script, Hindi in Devanagari.' +
    ' If there is no readable text, reply with exactly: NO_TEXT'
  );
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
};

/** Picks the first provider that has a key configured, or null. */
export function pickProvider(env) {
  const order = [
    ['groq', env.GROQ_API_KEY],
    ['anthropic', env.ANTHROPIC_API_KEY],
    ['openai', env.OPENAI_API_KEY],
  ];
  for (const [id, key] of order) {
    if (key && key.trim()) {
      return { id, label: LABELS[id], key: key.trim(), model: (env.AI_MODEL || '').trim() || DEFAULT_MODELS[id] };
    }
  }
  return null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...SECURITY_HEADERS },
  });
}

// Groq and OpenAI share the same "chat completions" format.
// `image` is optional: translation sends text only.
async function callOpenAiCompatible(p, image, mediaType, prompt, maxTokens) {
  const url =
    p.id === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}` },
    body: JSON.stringify({
      model: p.model,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: image
            ? [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${mediaType};base64,${image}` } },
              ]
            : prompt,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${p.label} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

async function callAnthropic(p, image, mediaType, prompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': p.key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: p.model,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: image
            ? [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
                { type: 'text', text: prompt },
              ]
            : prompt,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${p.label} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export async function handleDescribe(request, env) {
  const provider = pickProvider(env);
  if (request.method === 'GET') {
    return json(provider ? { enabled: true, provider: provider.label } : { enabled: false });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!provider) return json({ error: 'AI descriptions are not set up on this site.' }, 503);

  // Basic protection against other websites calling this from a browser.
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) return json({ error: 'Forbidden.' }, 403);
    } catch {
      return json({ error: 'Forbidden.' }, 403);
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const { image, mediaType, mode = 'describe', language, content, text, from, to } = body || {};
  if (mode !== 'describe' && mode !== 'read' && mode !== 'translate') return json({ error: 'Invalid request.' }, 400);

  if (mode === 'translate') {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) {
      return json({ error: 'The text is missing or too long.' }, 400);
    }
    if (typeof to !== 'string' || !to.trim()) return json({ error: 'Invalid request.' }, 400);
    const prompt = translatePrompt(typeof from === 'string' ? from.slice(0, 40) : '', to.slice(0, 40)) + '\n\n' + text;
    try {
      const out =
        provider.id === 'anthropic'
          ? await callAnthropic(provider, null, null, prompt, 3000)
          : await callOpenAiCompatible(provider, null, null, prompt, 3000);
      if (!out) return json({ error: 'The AI service returned an empty translation.' }, 502);
      return json({ text: out, provider: provider.label });
    } catch (err) {
      console.error('AI provider error', err);
      return json({ error: 'The AI service could not translate this right now. Please try again later.' }, 502);
    }
  }

  if (typeof image !== 'string' || image.length === 0 || image.length > MAX_BASE64_LENGTH) {
    return json({ error: 'The image is missing or too large.' }, 400);
  }
  if (typeof mediaType !== 'string' || !ALLOWED_TYPES.includes(mediaType)) {
    return json({ error: 'Unsupported image type.' }, 400);
  }

  const prompt = mode === 'read' ? readPrompt(typeof language === 'string' ? language.slice(0, 40) : '', content) : DESCRIBE_PROMPT;
  const maxTokens = mode === 'read' ? 2000 : 500;

  let output;
  try {
    output =
      provider.id === 'anthropic'
        ? await callAnthropic(provider, image, mediaType, prompt, maxTokens)
        : await callOpenAiCompatible(provider, image, mediaType, prompt, maxTokens);
  } catch (err) {
    // Details go to Cloudflare's logs only, never to the browser.
    console.error('AI provider error', err);
    return json({ error: 'The AI service could not read this image right now. Please try again later.' }, 502);
  }

  if (mode === 'read') {
    const text = output.trim() === 'NO_TEXT' ? '' : output;
    return json({ text, provider: provider.label });
  }
  if (!output) return json({ error: 'The AI service returned an empty description.' }, 502);
  return json({ description: output, provider: provider.label });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/describe') return handleDescribe(request, env);
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
    return out;
  },
};
