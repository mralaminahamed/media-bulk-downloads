import { describe, it, expect } from 'vitest';
import { queueErrorMessage } from '@/extension/popup/components/queue-error-message';

describe('queueErrorMessage', () => {
  it('maps known reducer error codes to human sentences', () => {
    expect(queueErrorMessage('SERVER_FORBIDDEN')).toMatch(/Retry w\/ referer/i);
    expect(queueErrorMessage('Cancelled')).toBe('Cancelled.');
    expect(queueErrorMessage('Link expired')).toMatch(/open the source/i);
    expect(queueErrorMessage('retry limit reached')).toMatch(/several tries/i);
  });

  it('never shows a raw ALL_CAPS code to the user', () => {
    const msg = queueErrorMessage('NETWORK_FAILED');
    expect(msg).toBe('Download failed.');
    expect(msg).not.toContain('NETWORK_FAILED');
  });

  it('passes through an already-human message and defaults when empty', () => {
    expect(queueErrorMessage('Disk full while saving')).toBe('Disk full while saving');
    expect(queueErrorMessage(undefined)).toBe('Download failed.');
  });
});
