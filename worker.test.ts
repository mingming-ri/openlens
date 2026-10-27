// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleDescribe, pickProvider } from './worker.js';

const url = 'https://openlens.pages.dev/api/describe';
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

afterEach(() => vi.unstubAllGlobals());

describe('pickProvider', () => {
  it('returns null when no key is set', () => {
    expect(pickProvider({})).toBeNull();
    expect(pickProvider({ GROQ_API_KEY: '   ' })).toBeNull();
  });

  it('uses the first key found: Groq, then Anthropic, then OpenAI', () => {
    expect(pickProvider({ OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a', GROQ_API_KEY: 'g' })?.id).toBe('groq');
    expect(pickProvider({ OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' })?.id).toBe('anthropic');
    expect(pickProvider({ OPENAI_API_KEY: 'o' })?.id).toBe('openai');
  });

  it('allows overriding the model', () => {
    expect(pickProvider({ GROQ_API_KEY: 'g', AI_MODEL: 'custom-model' })?.model).toBe('custom-model');
  });
});

describe('handleDescribe', () => {
  it('reports disabled without a key, and never returns the key', async () => {
    expect(await (await handleDescribe(new Request(url), {})).json()).toEqual({ enabled: false });
    const on = await (await handleDescribe(new Request(url), { GROQ_API_KEY: 'secret-123' })).text();
    expect(on).toContain('"enabled":true');
    expect(on).not.toContain('secret-123');
  });

  it('rejects other websites and bad input', async () => {
    const env = { GROQ_API_KEY: 'k' };
    expect((await handleDescribe(post({}, { origin: 'https://evil.example' }), env)).status).toBe(403);
    expect((await handleDescribe(post({ image: 'x', mediaType: 'text/html' }), env)).status).toBe(400);
    expect((await handleDescribe(post({ image: 'x', mediaType: 'image/jpeg', mode: 'hack' }), env)).status).toBe(400);
  });

  it('reads text with AI and sends the key only to the provider', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'EXIT\nNo entry' } }] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleDescribe(post({ image: 'abc', mediaType: 'image/jpeg', mode: 'read', language: 'English' }), {
      GROQ_API_KEY: 'k',
    });
    expect(await res.json()).toEqual({ text: 'EXIT\nNo entry', provider: 'Groq' });
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toContain('api.groq.com');
    expect(String(init.body)).toContain('Transcribe');
  });

  it('translates text without an image', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Hola mundo' } }] })));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleDescribe(post({ mode: 'translate', text: 'Hello world', from: 'English', to: 'Spanish' }), { GROQ_API_KEY: 'k' });
    expect((await res.json()).text).toBe('Hola mundo');
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(typeof sent.messages[0].content).toBe('string');
    expect((await handleDescribe(post({ mode: 'translate', text: '', to: 'Spanish' }), { GROQ_API_KEY: 'k' })).status).toBe(400);
  });

  it('returns empty text when the AI finds none', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'NO_TEXT' } }] }))));
    const res = await handleDescribe(post({ image: 'abc', mediaType: 'image/jpeg', mode: 'read' }), { GROQ_API_KEY: 'k' });
    expect((await res.json()).text).toBe('');
  });

  it('hides provider errors from the browser', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid key k-123', { status: 401 })));
    const res = await handleDescribe(post({ image: 'abc', mediaType: 'image/jpeg' }), { GROQ_API_KEY: 'k-123' });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('k-123');
  });
});
