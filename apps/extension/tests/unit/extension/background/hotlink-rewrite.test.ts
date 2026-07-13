import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyRefererRule, removeRefererRule, hasDnrPermission, requestDnrPermission,
} from '@/extension/background/download/hotlink-rewrite';

let sessionRules: { id: number }[];
let updateSessionRules: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionRules = [];
  updateSessionRules = vi.fn(async (o: { addRules?: { id: number }[]; removeRuleIds?: number[] }) => {
    if (o.removeRuleIds) sessionRules = sessionRules.filter((r) => !o.removeRuleIds!.includes(r.id));
    if (o.addRules) sessionRules.push(...o.addRules);
  });
  global.chrome = {
    declarativeNetRequest: {
      getSessionRules: vi.fn(async () => sessionRules),
      updateSessionRules,
    },
    permissions: {
      contains: vi.fn(async () => true),
      request: vi.fn(async () => true),
    },
  } as unknown as typeof chrome;
});

describe('hotlink-rewrite', () => {
  it('adds a modifyHeaders rule setting Referer + Origin to the source page, scoped to the url', async () => {
    const id = await applyRefererRule('https://cdn.example.com/img/a.jpg?x=1', 'https://gallery.example.org/album');
    const rule = updateSessionRules.mock.calls[0][0].addRules[0];
    expect(rule.id).toBe(id);
    expect(rule.condition.urlFilter).toBe('https://cdn.example.com/img/a.jpg?x=1');
    expect(rule.action.type).toBe('modifyHeaders');
    const headers = Object.fromEntries(
      rule.action.requestHeaders.map((h: { header: string; value: string }) => [h.header, h.value]),
    );
    expect(headers.referer).toBe('https://gallery.example.org/album');
    expect(headers.origin).toBe('https://gallery.example.org');
    expect(rule.action.requestHeaders.every((h: { operation: string }) => h.operation === 'set')).toBe(true);
  });

  it('falls back to the media URL origin when no source page is given', async () => {
    await applyRefererRule('https://cdn.example.com/img/a.jpg');
    const headers = Object.fromEntries(
      updateSessionRules.mock.calls[0][0].addRules[0].action.requestHeaders.map(
        (h: { header: string; value: string }) => [h.header, h.value],
      ),
    );
    expect(headers.referer).toBe('https://cdn.example.com');
    expect(headers.origin).toBe('https://cdn.example.com');
  });

  it('allocates ids above the current max session rule (no collision after restart)', async () => {
    sessionRules = [{ id: 7 }];
    const id = await applyRefererRule('https://cdn/x.jpg', 'https://p');
    expect(id).toBe(8);
  });

  it('removeRefererRule removes exactly that rule id', async () => {
    const id = await applyRefererRule('https://cdn/x.jpg', 'https://p');
    expect(sessionRules.some((r) => r.id === id)).toBe(true);
    await removeRefererRule(id);
    expect(sessionRules.some((r) => r.id === id)).toBe(false);
  });

  it('removeRefererRule swallows errors', async () => {
    updateSessionRules.mockRejectedValueOnce(new Error('gone'));
    await expect(removeRefererRule(99)).resolves.toBeUndefined();
  });

  it('permission helpers delegate to chrome.permissions', async () => {
    expect(await hasDnrPermission()).toBe(true);
    expect(await requestDnrPermission()).toBe(true);
    expect(chrome.permissions.contains).toHaveBeenCalledWith({ permissions: ['declarativeNetRequestWithHostAccess'] });
    expect(chrome.permissions.request).toHaveBeenCalledWith({ permissions: ['declarativeNetRequestWithHostAccess'] });
  });
});
