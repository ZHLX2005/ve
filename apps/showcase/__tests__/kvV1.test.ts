import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setBearerProvider } from '../src/api/http/request';
import { kvV1Service } from '../src/api/services/kvV1';

describe('kvV1 service (throw model)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setBearerProvider(() => 'jwt-xyz');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockJSON(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('set POSTs to /api/v1/kv with Bearer header + tags + no visibility by default', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, message: 'ok' }));
    global.fetch = mockFetch;

    await kvV1Service.set({
      key: 'shortcuts',
      value: '{}',
      tags: ['prod', 'cache'],
      groupId: 42,
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/kv');
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt-xyz' });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ key: 'shortcuts', value: '{}', ttl: 0, tags: ['prod', 'cache'], groupId: 42 });
    expect(body).not.toHaveProperty('visibility');
  });

  it('set includes visibility when explicitly provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, message: 'ok' }));
    global.fetch = mockFetch;

    await kvV1Service.set({
      key: 'game-center_skin:index',
      value: '[]',
      groupId: 190,
      tags: ['game-center-skin'],
      visibility: 'public',
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.visibility).toBe('public');
  });

  it('set defaults tags to [] (replace semantics = clear)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, message: 'ok' }));
    global.fetch = mockFetch;

    await kvV1Service.set({ key: 'k', value: 'v' });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tags).toEqual([]);
  });

  it('get GETs /api/v1/kv/:key', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockJSON(200, {
        code: 0,
        data: { key: 'shortcuts', value: '{}', visibility: 'private', expires_at: '' },
      }),
    );
    global.fetch = mockFetch;

    const item = await kvV1Service.get({ key: 'shortcuts' });
    expect(item.key).toBe('shortcuts');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/kv/shortcuts');
  });

  it('get appends groupId query when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockJSON(200, {
        code: 0,
        data: { key: 'k', value: 'v', expires_at: '', groupId: 42, groupName: 'g', myRole: 'writer', tags: [] },
      }),
    );
    global.fetch = mockFetch;

    await kvV1Service.get({ key: 'k', groupId: 42 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/kv/k?groupId=42');
  });

  it('delete sends DELETE with groupId query', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, message: 'ok' }));
    global.fetch = mockFetch;

    await kvV1Service.delete({ key: 'shortcuts', groupId: 42 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/kv/shortcuts?groupId=42');
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });

  it('delete without groupId omits query string (locks default-group behavior)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, message: 'ok' }));
    global.fetch = mockFetch;

    await kvV1Service.delete({ key: 'k' });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/kv/k');
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });

  it('list with pagination appends query string', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockJSON(200, { code: 0, data: { items: [], total: 0 } }),
    );
    global.fetch = mockFetch;

    await kvV1Service.list({ limit: 10, offset: 20 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/kv?limit=10&offset=20');
  });

  it('list passes tags as repeated params + match', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockJSON(200, { code: 0, data: { items: [], total: 0 } }),
    );
    global.fetch = mockFetch;

    await kvV1Service.list({ tags: ['prod', 'cache'], match: 'all' });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/kv?tags=prod&tags=cache&match=all');
  });

  it('tags() GETs the facet endpoint for the selected group + unwraps {tags:[...]}', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockJSON(200, {
        code: 0,
        data: { tags: [{ tag: 'prod', count: 3 }, { tag: 'cache', count: 1 }] },
      }),
    );
    global.fetch = mockFetch;

    const out = await kvV1Service.tags({ groupId: 42 });
    expect(out).toEqual([{ tag: 'prod', count: 3 }, { tag: 'cache', count: 1 }]);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/kv/tags?groupId=42');
  });

  it('tags() omits groupId when 0 or undefined + returns [] on missing tags field', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, data: { tags: [] } }));
    global.fetch = mockFetch;

    await kvV1Service.tags({ groupId: 0 });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/kv/tags');

    const out0 = await kvV1Service.tags();
    expect(mockFetch.mock.calls[1][0]).toBe('/api/v1/kv/tags');
    expect(out0).toEqual([]);
  });

  it('tags() returns [] when data is missing tags field (defensive)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, data: {} }));
    global.fetch = mockFetch;
    const out = await kvV1Service.tags({ groupId: 42 });
    expect(out).toEqual([]);
  });

  it('versions GETs /kv/:key/versions with groupId and unwraps versions array', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockJSON(200, {
        code: 0,
        data: { versions: [{ version_no: 2, value_len: 42, replaced_at: '2026-08-01T12:00:00+08:00' }] },
      }),
    );
    global.fetch = mockFetch;

    const out = await kvV1Service.versions({ key: 'api_url', groupId: 42 });

    expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/kv/api_url/versions?groupId=42');
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('GET');
    expect(out).toEqual([{ version_no: 2, value_len: 42, replaced_at: '2026-08-01T12:00:00+08:00' }]);
  });

  it('versions without groupId omits query string', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, data: { versions: [] } }));
    global.fetch = mockFetch;

    await kvV1Service.versions({ key: 'k' });

    expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/kv/k/versions');
  });

  it('restore POSTs /kv/:key/restore with version + groupId', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, data: { message: 'kv restored successfully' } }));
    global.fetch = mockFetch;

    await kvV1Service.restore({ key: 'api_url', version: 2, groupId: 42 });

    expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/kv/api_url/restore');
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ version: 2, groupId: 42 });
  });

  it('throws ApiError on business code 50 (key not found)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockJSON(200, { code: 50, data: null, message: 'key not found' }),
    );
    global.fetch = mockFetch;

    await expect(kvV1Service.get({ key: 'missing' })).rejects.toMatchObject({ code: 50 });
  });

  describe('setVisibility', () => {
    it('POSTs /kv/:key/visibility with visibility + groupId', async () => {
      const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, message: 'ok' }));
      global.fetch = mockFetch;

      await kvV1Service.setVisibility({ key: 'site-banner', visibility: 'public', groupId: 42 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('/api/v1/kv/site-banner/visibility');
      const init = mockFetch.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt-xyz' });
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({ visibility: 'public', groupId: 42 });
    });

    it('omits groupId when 0 or undefined', async () => {
      const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, message: 'ok' }));
      global.fetch = mockFetch;

      await kvV1Service.setVisibility({ key: 'k', visibility: 'private' });
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ visibility: 'private' });
      expect(body).not.toHaveProperty('groupId');
    });

    it('encodes key with special characters', async () => {
      const mockFetch = vi.fn().mockResolvedValue(mockJSON(200, { code: 0, message: 'ok' }));
      global.fetch = mockFetch;

      await kvV1Service.setVisibility({ key: 'has space/slash', visibility: 'public', groupId: 1 });
      expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/kv/has%20space%2Fslash/visibility');
    });
  });

  describe('getPublicUrl', () => {
    it('builds /api/v1/kv/public/:key with groupId query using window.location.origin', () => {
      // jsdom 默认 origin 是 'http://localhost:3000'(vitest 默认),但这里直接 stub
      const originalLocation = window.location;
      delete (window as { location?: unknown }).location;
      (window as unknown as { location: { origin: string } }).location = { origin: 'https://example.com' };

      try {
        const url = kvV1Service.getPublicUrl({ key: 'site-banner', groupId: 42 });
        expect(url).toBe('https://example.com/api/v1/kv/public/site-banner?groupId=42');
      } finally {
        (window as unknown as { location: Location }).location = originalLocation;
      }
    });

    it('encodes key with special characters', () => {
      const url = kvV1Service.getPublicUrl({ key: 'a b/c', groupId: 1 });
      expect(url).toMatch(/\/api\/v1\/kv\/public\/a%20b%2Fc\?groupId=1$/);
    });
  });

  describe('getPublic', () => {
    it('GETs /kv/public/:key with groupId query and returns the public item', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        mockJSON(200, {
          code: 0,
          data: {
            key: 'github-show',
            value: '{"meta":{"schemaVersion":"1.2.0"},"columns":[],"rows":[]}',
            expires_at: '',
            groupId: 42,
            groupName: '公开示例',
            visibility: 'public',
            currentVersion: 7,
            tags: ['github-show'],
          },
        }),
      );
      global.fetch = mockFetch;

      const item = await kvV1Service.getPublic({ key: 'github-show', groupId: 42 });
      expect(item.key).toBe('github-show');
      expect(item.groupId).toBe(42);
      expect(item.visibility).toBe('public');
      expect(item.currentVersion).toBe(7);
      expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/kv/public/github-show?groupId=42');
      expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('GET');
    });

    it('encodes key with special characters', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        mockJSON(200, { code: 0, data: { key: 'a b/c', value: '', groupId: 1, groupName: '', visibility: 'public', currentVersion: 0 } }),
      );
      global.fetch = mockFetch;

      await kvV1Service.getPublic({ key: 'a b/c', groupId: 1 });
      expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/kv/public/a%20b%2Fc?groupId=1');
    });

    it('throws ApiError on code 50 (key not found / not public)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        mockJSON(200, { code: 50, data: null, message: 'key not found' }),
      );
      global.fetch = mockFetch;

      await expect(kvV1Service.getPublic({ key: 'private-only', groupId: 42 })).rejects.toMatchObject({ code: 50 });
    });
  });
});
