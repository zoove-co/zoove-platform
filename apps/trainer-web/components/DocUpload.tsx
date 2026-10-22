'use client';

import { useRef, useState } from 'react';

import { ApiError, uploadDocument, type ApplicationView, type DocumentKind } from '@/lib/api';
import { prepareFile } from '@/lib/image';
import { Camera } from './Camera';
import { Spinner } from './ui';

type Doc = ApplicationView['documents'][number];

type Props = {
  kind: DocumentKind;
  title: string;
  help: string;
  doc: Doc | undefined;
  allowPdf: boolean;
  live?: boolean;
  disabled: boolean;
  onUpdated: (view: ApplicationView) => void;
  onExpired: () => void;
};

export function DocUpload({ kind, title, help, doc, allowPdf, live, disabled, onUpdated, onExpired }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const lastFile = useRef<{ blob: Blob; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [camera, setCamera] = useState(false);

  async function send(blob: Blob, name: string) {
    lastFile.current = { blob, name };
    setBusy(true);
    setError(null);
    setRetryable(false);
    try {
      onUpdated(await uploadDocument(kind, blob, name));
      lastFile.current = null;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SESSION_EXPIRED') return onExpired();
      setError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.');
      // A bad file will fail the same way again; a network or server problem is worth another try.
      setRetryable(err instanceof ApiError && ['NETWORK', 'INTERNAL', 'STORAGE_UNAVAILABLE', 'TOO_MANY_REQUESTS'].includes(err.code));
    } finally {
      setBusy(false);
    }
  }

  async function choose(file: File) {
    setError(null);
    try {
      const prepared = await prepareFile(file, allowPdf);
      await send(prepared.blob, prepared.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use this file.');
    }
  }

  const rejected = doc?.status === 'rejected';
  const state = rejected ? `Please upload again${doc?.note ? `: ${doc.note}` : ''}` : doc ? 'Uploaded' : 'Not uploaded yet';

  return (
    <div className="doc">
      <div className={`tick ${doc && !rejected ? 'ok' : ''}`} aria-hidden>
        {doc && !rejected ? '✓' : ''}
      </div>
      <div className="meta">
        <div className="name">{title}</div>
        <div className={`state ${doc && !rejected ? 'ok' : rejected ? 'bad' : ''}`}>{busy ? 'Uploading…' : state}</div>
        {!doc || rejected ? <div className="state">{help}</div> : null}
        {error ? (
          <div className="err" role="alert">
            {error}{' '}
            {retryable && lastFile.current ? (
              <button className="linkbtn" type="button" onClick={() => lastFile.current && void send(lastFile.current.blob, lastFile.current.name)}>
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        className={`btn small ${doc && !rejected ? 'ghost' : ''}`}
        type="button"
        disabled={busy || disabled}
        onClick={() => (live ? setCamera(true) : input.current?.click())}
      >
        {busy ? <Spinner /> : doc && !rejected ? (live ? 'Retake' : 'Replace') : live ? 'Open camera' : 'Upload'}
      </button>
      {!live ? (
        <input
          ref={input}
          className="visually-hidden"
          type="file"
          accept={allowPdf ? 'image/jpeg,image/png,image/webp,application/pdf' : 'image/jpeg,image/png,image/webp'}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void choose(file);
          }}
        />
      ) : null}
      {camera ? (
        <Camera
          onClose={() => setCamera(false)}
          onCapture={(blob) => {
            setCamera(false);
            void (blob instanceof File ? choose(blob) : send(blob, 'selfie.jpg'));
          }}
        />
      ) : null}
    </div>
  );
}
