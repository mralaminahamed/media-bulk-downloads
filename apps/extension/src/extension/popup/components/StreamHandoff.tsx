import React, { useState } from 'react';
import { ExclamationTriangleIcon, XMarkIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';
import { buildStreamCommand, STREAM_COMMAND_ENGINES, StreamCommandEngine } from '@mbd/core/download/stream/download-command';
import { streamErrorMessage } from '@mbd/core/download/stream/stream-error-message';
import { copyText } from '../utils';
import { StreamRefusal } from '../hooks/useDownloadActions';

interface StreamHandoffProps {
  refusal: StreamRefusal;
  onDismiss: () => void;
}

/**
 * The refused-stream handoff (#285). When we correctly refuse a capture (DRM /
 * live / SAMPLE-AES / unsupported browser), a dead end becomes a transparent
 * handoff: we show the exact reason and let the user copy a header-correct
 * `yt-dlp` / `ffmpeg` command to finish the job in a tool that's allowed to.
 *
 * We build a STRING only — no download, no execution, no DRM circumvention. The
 * command carries the Referer (this page) and the browser's User-Agent; the
 * builder strips any token/signature from the URLs so nothing secret is copied.
 */
export const StreamHandoff: React.FC<StreamHandoffProps> = ({ refusal, onDismiss }) => {
  const [copied, setCopied] = useState<StreamCommandEngine | null>(null);
  const manifestUrl = refusal.item.hlsManifest;
  // navigator is always present in the popup; guard only for non-DOM test envs.
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;

  // No manifest URL → nothing to hand off (shouldn't happen for a stream item).
  if (!manifestUrl) return null;

  const copy = async (engine: StreamCommandEngine): Promise<void> => {
    const command = buildStreamCommand({ manifestUrl, engine, referer: refusal.referer, userAgent });
    setCopied((await copyText(command)) ? engine : null);
  };

  return (
    <div
      role="region"
      aria-label="Download this stream with an external tool"
      className="mbd:mx-4 mbd:mb-2 mbd:rounded-(--radius-sm) mbd:border hairline mbd:border-l-2 mbd:border-l-(--warn) mbd:bg-(--panel-2) mbd:px-3 mbd:py-2.5"
    >
      <div className="mbd:flex mbd:items-start mbd:gap-2">
        <ExclamationTriangleIcon className="mbd:mt-0.5 mbd:h-4 mbd:w-4 mbd:shrink-0 mbd:text-(--warn)" />
        <div className="mbd:min-w-0 mbd:flex-1">
          <p className="mbd:text-[12px] mbd:text-(--ink)">{streamErrorMessage(refusal.code)}</p>
          <p className="mbd:mt-0.5 mbd:text-[11px] mbd:text-(--ink-3)">
            Copy a ready-to-run command and finish it in your own tool — no cookies or tokens included.
          </p>
          <div className="mbd:mt-2 mbd:flex mbd:flex-wrap mbd:gap-1.5">
            {STREAM_COMMAND_ENGINES.map((engine) => (
              <button
                key={engine}
                onClick={() => void copy(engine)}
                className="btn btn-sm btn-ghost"
                title={`Copy the ${engine} command to the clipboard`}
              >
                {copied === engine ? (
                  <CheckIcon className="mbd:h-3.5 mbd:w-3.5" />
                ) : (
                  <ClipboardDocumentIcon className="mbd:h-3.5 mbd:w-3.5" />
                )}
                <span>{copied === engine ? 'Copied' : `Copy ${engine} command`}</span>
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="mbd:shrink-0 mbd:rounded-(--radius-sm) mbd:p-0.5 mbd:text-(--ink-3) mbd:hover:bg-(--panel) mbd:hover:text-(--ink)"
        >
          <XMarkIcon className="mbd:h-4 mbd:w-4" />
        </button>
      </div>
    </div>
  );
};
