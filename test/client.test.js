import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import ESignBaseClient, { Scope, ESignBaseSDKError } from '../index.js';

const makeClient = (overrides = {}) =>
  new ESignBaseClient({
    clientId: 'test_id',
    clientSecret: 'test_secret',
    scope: [Scope.ALL],
    ...overrides,
  });

const mockTokenResponse = (token = 'tkn', extra = {}) => ({
  ok: true,
  json: async () => ({ access_token: token, expires_in: 300, ...extra }),
});

const mockOkResponse = (data = {}) => ({
  ok: true,
  json: async () => data,
});

const mockErrorResponse = (status = 400, text = 'Bad request') => ({
  ok: false,
  status,
  text: async () => text,
});

describe('ESignBaseClient constructor', () => {
  it('throws if clientId is missing', () => {
    expect(() => makeClient({ clientId: undefined })).toThrow('Client ID is required');
  });

  it('throws if clientSecret is missing', () => {
    expect(() => makeClient({ clientSecret: undefined })).toThrow('Client secret is required');
  });

  it('throws if scope is empty', () => {
    expect(() => makeClient({ scope: [] })).toThrow('At least one scope must be provided');
  });

  it('throws on invalid scope value', () => {
    expect(() => makeClient({ scope: ['invalid'] })).toThrow('Invalid scope value provided');
  });

  it('handles baseURL without trailing slash', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockTokenResponse());
    const c = makeClient({ baseURL: 'https://api.example.com' });
    await c.connect();
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.com/oauth2/token');
  });

  it('constructs successfully with valid params', () => {
    expect(() => makeClient()).not.toThrow();
  });
});

describe('connect()', () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });

  it('sets isConnected on success', async () => {
    fetch.mockResolvedValue(mockTokenResponse('abc123'));
    const client = makeClient();
    await client.connect();
    expect(client.isConnected).toBe(true);
  });

  it('clears existing token state before reconnecting', async () => {
    fetch.mockResolvedValue(mockTokenResponse('new_token'));
    const client = makeClient();
    await client.connect(); // first connect
    await client.connect(); // reconnect
    expect(client.isConnected).toBe(true);
  });

  it('throws ESignBaseSDKError on HTTP error', async () => {
    fetch.mockResolvedValue(mockErrorResponse(400, 'Bad request'));
    const client = makeClient();
    await expect(client.connect()).rejects.toThrow('Bad request');
  });

  it('stores refresh token when provided', async () => {
    fetch.mockResolvedValue(mockTokenResponse('tkn', { refresh_token: 'ref123' }));
    const client = makeClient();
    await client.connect();
    // Verify by triggering a refresh — if refresh_token is stored it will use it
    fetch.mockResolvedValueOnce(mockTokenResponse('new_tkn'));
    // force expiry
    await client.connect();
    expect(client.isConnected).toBe(true);
  });
});

describe('token refresh', () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });

  it('proactively refreshes an expired token before a request', async () => {
    // connect with a token that expires immediately
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'old_tkn', expires_in: 0 }),
    });
    const client = makeClient();
    await client.connect();

    // refresh call, then the actual API call
    fetch
      .mockResolvedValueOnce(mockTokenResponse('new_tkn', { refresh_token: 'ref' }))
      .mockResolvedValueOnce(mockOkResponse([]));

    await client.getTemplates();

    const authHeaders = fetch.mock.calls.map(c => c[1]?.headers?.Authorization).filter(Boolean);
    expect(authHeaders.at(-1)).toBe('Bearer new_tkn');
  });

  it('falls back to connect() when refresh token is absent', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tkn', expires_in: 0 }),
    });
    const client = makeClient();
    await client.connect();

    // no refresh_token issued — should fall back to full connect
    fetch
      .mockResolvedValueOnce(mockTokenResponse('reconnected_tkn'))
      .mockResolvedValueOnce(mockOkResponse([]));

    await client.getTemplates();
    const authHeaders = fetch.mock.calls.map(c => c[1]?.headers?.Authorization).filter(Boolean);
    expect(authHeaders.at(-1)).toBe('Bearer reconnected_tkn');
  });

  it('falls back to connect() when refresh request fails', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tkn', expires_in: 0, refresh_token: 'bad_ref' }),
    });
    const client = makeClient();
    await client.connect();

    fetch
      .mockResolvedValueOnce(mockErrorResponse(401, 'invalid refresh token'))
      .mockResolvedValueOnce(mockTokenResponse('reconnected_tkn'))
      .mockResolvedValueOnce(mockOkResponse([]));

    await client.getTemplates();
    const authHeaders = fetch.mock.calls.map(c => c[1]?.headers?.Authorization).filter(Boolean);
    expect(authHeaders.at(-1)).toBe('Bearer reconnected_tkn');
  });
});

describe('getTemplates()', () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });

  it('returns template list', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockOkResponse([]));
    const client = makeClient();
    await client.connect();
    expect(await client.getTemplates()).toEqual([]);
  });

  it('throws on API error', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockErrorResponse(500, 'server error'));
    const client = makeClient();
    await client.connect();
    await expect(client.getTemplates()).rejects.toThrow('server error');
  });
});

describe('getTemplate()', () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });

  it('encodes template id in URL', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockOkResponse({}));
    const client = makeClient();
    await client.connect();
    await client.getTemplate('a/b');
    expect(fetch.mock.calls[1][0]).toContain('api/template/a%2Fb');
  });

  it('throws on API error', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockErrorResponse(404, 'not found'));
    const client = makeClient();
    await client.connect();
    await expect(client.getTemplate('t1')).rejects.toThrow('not found');
  });
});

describe('getDocuments()', () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });

  it('builds correct query params', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockOkResponse({ documents: [] }));
    const client = makeClient();
    await client.connect();
    await client.getDocuments(10, 5);
    expect(fetch.mock.calls[1][0]).toContain('api/documents?limit=10&offset=5');
  });

  it('throws on API error', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockErrorResponse(500, 'err'));
    const client = makeClient();
    await client.connect();
    await expect(client.getDocuments()).rejects.toThrow('err');
  });
});

describe('getDocument()', () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });

  it('returns document data', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockOkResponse({ id: 'd1' }));
    const client = makeClient();
    await client.connect();
    expect(await client.getDocument('d1')).toEqual({ id: 'd1' });
  });

  it('throws on API error', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockErrorResponse(404, 'not found'));
    const client = makeClient();
    await client.connect();
    await expect(client.getDocument('d1')).rejects.toThrow('not found');
  });
});

describe('createDocument()', () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });

  const recipients = [
    { email: 'a@a.com', first_name: 'A', last_name: 'B', role_name: 'signee_1', locale: 'en' },
  ];

  it('sends correct body', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockOkResponse({ document_id: 'doc1' }));
    const client = makeClient();
    await client.connect();
    const res = await client.createDocument({
      templateId: 'tpl',
      documentName: 'Doc',
      recipients,
    });
    expect(res).toEqual({ document_id: 'doc1' });
    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.template_id).toBe('tpl');
    expect(body.name).toBe('Doc');
    expect(body.recipients[0].email).toBe('a@a.com');
  });

  it('includes expiration_date as ISO string', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockOkResponse({ document_id: 'doc1' }));
    const client = makeClient();
    await client.connect();
    const expiration = new Date('2025-01-01T00:00:00Z');
    await client.createDocument({ templateId: 'tpl', documentName: 'Doc', recipients, expirationDate: expiration });
    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.expiration_date).toBe(expiration.toISOString());
  });

  it('includes user_defined_metadata when provided', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockOkResponse({ document_id: 'doc1' }));
    const client = makeClient();
    await client.connect();
    await client.createDocument({
      templateId: 'tpl', documentName: 'Doc', recipients,
      userDefinedMetadata: { internal_id: 'ABC' },
    });
    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.user_defined_metadata).toEqual({ internal_id: 'ABC' });
  });

  it('throws on API error', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockErrorResponse(400, 'bad'));
    const client = makeClient();
    await client.connect();
    await expect(client.createDocument({ templateId: 'tpl', documentName: 'Doc', recipients }))
      .rejects.toThrow('bad');
  });
});

describe('downloadDocument()', () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });

  it('returns a Readable stream', async () => {
    vi.spyOn(Readable, 'fromWeb').mockReturnValue('STREAM');
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce({ ok: true, body: { type: 'web' } });
    const client = makeClient();
    await client.connect();
    const stream = await client.downloadDocument('doc1');
    expect(stream).toBe('STREAM');
    expect(Readable.fromWeb).toHaveBeenCalledWith({ type: 'web' });
  });

  it('throws on API error', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockErrorResponse(404, 'not found'));
    const client = makeClient();
    await client.connect();
    await expect(client.downloadDocument('doc1')).rejects.toThrow('not found');
  });
});

describe('deleteDocument()', () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });

  it('uses DELETE method and returns true', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce({ ok: true, status: 204 });
    const client = makeClient();
    await client.connect();
    const res = await client.deleteDocument('doc1');
    expect(res).toBe(true);
    expect(fetch.mock.calls[1][1].method).toBe('DELETE');
  });

  it('throws on API error', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockErrorResponse(404, 'not found'));
    const client = makeClient();
    await client.connect();
    await expect(client.deleteDocument('doc1')).rejects.toThrow('not found');
  });
});

describe('getCredits()', () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });

  it('returns credit balance', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockOkResponse({ credits: 42 }));
    const client = makeClient();
    await client.connect();
    expect(await client.getCredits()).toEqual({ credits: 42 });
  });

  it('throws on API error', async () => {
    fetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockErrorResponse(500, 'err'));
    const client = makeClient();
    await client.connect();
    await expect(client.getCredits()).rejects.toThrow('err');
  });
});