
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import ESignBaseClient, { GrantType, Scope } from '../index.js';

describe('ESignBaseClient', () => {
    let client;

    beforeEach(() => {
        globalThis.fetch = vi.fn();

        client = new ESignBaseClient({
        clientId: 'id',
        clientSecret: 'secret',
        grantType: GrantType.CLIENT_CREDENTIALS,
        scope: [Scope.READ],
        });
    });

    it('should throw if connect fails', async () => {
        fetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
        });

        await expect(client.connect()).rejects.toThrow('Bad request');
    });

    it('should store access token on connect', async () => {
        fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
            access_token: 'abc123',
        }),
        });

        await client.connect();
        expect(client.isConnected).toBe(true);
    });

    it('should call templates endpoint', async () => {
        // First call = connect()
        fetch
        .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'token' }),
        })
        .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ templates: [] }),
        });

        await client.connect();
        const result = await client.getTemplates();

        expect(result.templates).toEqual([]);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw when not connected', async () => {
        await expect(client.getTemplates()).rejects.toThrow('Client is not connected');
    });

    it('validates constructor parameters', () => {
        expect(() => new ESignBaseClient({
        clientSecret: 's',
        grantType: GrantType.CLIENT_CREDENTIALS,
        scope: [Scope.READ],
        })).toThrow('Client ID is required');

        expect(() => new ESignBaseClient({
        clientId: 'i',
        grantType: GrantType.CLIENT_CREDENTIALS,
        scope: [Scope.READ],
        })).toThrow('Client secret is required');

        expect(() => new ESignBaseClient({
        clientId: 'i',
        clientSecret: 's',
        scope: [Scope.READ],
        })).toThrow('Grant type is required');

        expect(() => new ESignBaseClient({
        clientId: 'i',
        clientSecret: 's',
        grantType: 'bad',
        scope: [Scope.READ],
        })).toThrow('Invalid grant type');

        expect(() => new ESignBaseClient({
        clientId: 'i',
        clientSecret: 's',
        grantType: GrantType.CLIENT_CREDENTIALS,
        scope: ['invalid'],
        })).toThrow('Invalid scope value provided');

        expect(() => new ESignBaseClient({
        clientId: 'i',
        clientSecret: 's',
        grantType: GrantType.AUTHORIZATION_CODE,
        scope: [Scope.READ],
        })).toThrow('Username and password are required for authorization_code grant type');
    });

    it('handles baseURL missing trailing slash', async () => {
        const customFetch = vi.fn();
        globalThis.fetch = customFetch;

        const c = new ESignBaseClient({
        clientId: 'i',
        clientSecret: 's',
        grantType: GrantType.CLIENT_CREDENTIALS,
        scope: [Scope.READ],
        baseURL: 'https://api.example.com',
        });

        customFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) });

        await c.connect();

        expect(customFetch).toHaveBeenCalledTimes(1);
        expect(customFetch.mock.calls[0][0]).toBe('https://api.example.com/oauth2/token');
    });

    it('createDocument sends correct body and handles expiration Date', async () => {
        const expiration = new Date('2020-01-01T00:00:00Z');

        fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'doc1' }) });

        await client.connect();

        const recipients = [{ email: 'a@a.com', first_name: 'A', last_name: 'B', role_name: 'r', locale: 'en' }];

        await client.createDocument({
        templateId: 'tpl',
        documentName: 'Doc',
        recipients,
        expirationDate: expiration,
        });

        const sentBody = JSON.parse(fetch.mock.calls[1][1].body);
        expect(sentBody.expiration_date).toBe(expiration.toISOString());
        expect(sentBody.recipients[0].email).toBe('a@a.com');
    });

    it('getDocuments builds query params', async () => {
        fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ documents: [] }) });

        await client.connect();
        await client.getDocuments(10, 5);

        expect(fetch.mock.calls[1][0]).toContain('api/documents?limit=10&offset=5');
    });

    it('getTemplate encodes template id', async () => {
        fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

        await client.connect();
        await client.getTemplate('a/b');

        expect(fetch.mock.calls[1][0]).toContain('api/template/a%2Fb');
    });

    it('deleteDocument uses DELETE and returns true', async () => {
        fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) })
        .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) });

        await client.connect();
        const res = await client.deleteDocument('doc1');
        expect(res).toBe(true);
        expect(fetch.mock.calls[1][1].method).toBe('DELETE');
    });

    it('retries on 401 by reconnecting', async () => {
        fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't1' }) })
        .mockResolvedValueOnce({ status: 401, ok: false, text: async () => 'Unauthorized' })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't2' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ templates: [] }) });

        await client.connect();
        const res = await client.getTemplates();

        expect(res.templates).toEqual([]);
        expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('downloadDocument converts response body to Readable via fromWeb', async () => {
        vi.spyOn(Readable, 'fromWeb').mockReturnValue('STREAM');

        fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) })
        .mockResolvedValueOnce({ ok: true, body: { type: 'web' } });

        await client.connect();
        const stream = await client.downloadDocument('doc1');

        expect(stream).toBe('STREAM');
        expect(Readable.fromWeb).toHaveBeenCalledWith({ type: 'web' });
    });
});
