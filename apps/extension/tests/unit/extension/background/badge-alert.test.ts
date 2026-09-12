import type { Mock } from 'vitest';
import {
  setDownloadFailedCount, ackDownloadAlerts, updateTabBadge, BADGE_ALERT_COLOR,
} from '@/extension/background/badge';

const badgeText = () => chrome.action.setBadgeText as Mock;

describe('download-failure alert badge', () => {
  beforeEach(() => {
    setDownloadFailedCount(0); // reset module state
    badgeText().mockClear();
    (chrome.action.setBadgeBackgroundColor as Mock).mockClear();
  });

  it('paints a red failed count on a tab when downloads have failed', () => {
    setDownloadFailedCount(3);
    badgeText().mockClear();
    updateTabBadge(7);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '3', tabId: 7 });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: BADGE_ALERT_COLOR, tabId: 7 });
  });

  it('stops painting the alert once acknowledged (popup opened)', () => {
    setDownloadFailedCount(3);
    ackDownloadAlerts();
    badgeText().mockClear();
    updateTabBadge(7);
    expect(chrome.action.setBadgeText).not.toHaveBeenCalledWith({ text: '3', tabId: 7 });
  });

  it('re-alerts when a new failure raises the count after an ack', () => {
    setDownloadFailedCount(1);
    ackDownloadAlerts();
    setDownloadFailedCount(2); // a new failure
    badgeText().mockClear();
    updateTabBadge(7);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '2', tabId: 7 });
  });

  it('does not alert once the failed count returns to zero', () => {
    setDownloadFailedCount(2);
    setDownloadFailedCount(0);
    badgeText().mockClear();
    updateTabBadge(7);
    expect(chrome.action.setBadgeText).not.toHaveBeenCalledWith({ text: '0', tabId: 7 });
  });
});
