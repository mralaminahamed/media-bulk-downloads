import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StreamHandoff } from '@/extension/popup/components/StreamHandoff';
import { ImageInfo } from '@mbd/core/types';
import { StreamRefusal } from '@/extension/popup/hooks/useDownloadActions';

const streamItem = (manifest: string): ImageInfo =>
  ({ src: manifest, hlsManifest: manifest, type: 'm3u8', kind: 'video' } as unknown as ImageInfo);

const refusal = (over: Partial<StreamRefusal> = {}): StreamRefusal => ({
  item: streamItem('https://cdn.example.com/live/master.m3u8'),
  code: 'drm',
  referer: 'https://watch.example.com/video/42',
  audioOnly: false,
  quality: 'auto',
  ...over,
});

describe('StreamHandoff', () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: 'TestUA/1.0', configurable: true });
  });

  it('shows the exact refusal reason', () => {
    render(<StreamHandoff refusal={refusal({ code: 'drm' })} onDismiss={() => {}} />);
    expect(screen.getByText(/DRM-protected/i)).toBeInTheDocument();
  });

  it('copies a header-correct yt-dlp command', async () => {
    render(<StreamHandoff refusal={refusal()} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /copy yt-dlp command/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const cmd = writeText.mock.calls[0][0] as string;
    expect(cmd).toContain('yt-dlp');
    expect(cmd).toContain(`--referer 'https://watch.example.com/video/42'`);
    expect(cmd).toContain(`--user-agent 'TestUA/1.0'`);
    expect(cmd).toContain(`'https://cdn.example.com/live/master.m3u8'`);
  });

  it('copies an ffmpeg stream-copy command', async () => {
    render(<StreamHandoff refusal={refusal()} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /copy ffmpeg command/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const cmd = writeText.mock.calls[0][0] as string;
    expect(cmd).toContain('ffmpeg');
    expect(cmd).toContain('-c copy');
    expect(cmd).toContain(`-headers 'Referer: https://watch.example.com/video/42'`);
  });

  it('applies the stream-quality preference to the yt-dlp handoff command (M5)', async () => {
    render(<StreamHandoff refusal={refusal({ quality: '480' })} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /copy yt-dlp command/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0] as string).toContain(`-S 'res:480'`);
  });

  it('emits an audio-extraction yt-dlp command when the refusal was audio-only (I13)', async () => {
    render(<StreamHandoff refusal={refusal({ audioOnly: true })} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /copy yt-dlp command/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const cmd = writeText.mock.calls[0][0] as string;
    expect(cmd).toContain('yt-dlp');
    expect(cmd).toContain('-x');
  });

  it('emits an audio-only ffmpeg command (drop video, copy audio to .m4a) for an audio-only refusal (I13)', async () => {
    render(<StreamHandoff refusal={refusal({ audioOnly: true })} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /copy ffmpeg command/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const cmd = writeText.mock.calls[0][0] as string;
    expect(cmd).toContain('-vn');
    expect(cmd).toContain('-c:a copy');
    expect(cmd).toContain(`'out.m4a'`);
    expect(cmd).not.toContain('out.mp4');
  });

  it('never leaks a signed token from the manifest URL', async () => {
    render(
      <StreamHandoff
        refusal={refusal({ item: streamItem('https://cdn.example.com/master.m3u8?token=SECRET_TOKEN') })}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /copy yt-dlp command/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).not.toContain('SECRET_TOKEN');
  });

  it('reflects a successful copy on the button', async () => {
    render(<StreamHandoff refusal={refusal()} onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /copy yt-dlp command/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument());
  });

  it('calls onDismiss when the close button is clicked', () => {
    const onDismiss = vi.fn();
    render(<StreamHandoff refusal={refusal()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
