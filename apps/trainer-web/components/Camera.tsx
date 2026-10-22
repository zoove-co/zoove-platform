'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Spinner } from './ui';

type Props = { onCapture: (blob: Blob) => void; onClose: () => void };

// Live selfie: opens the front camera and takes the picture on the spot (no gallery upload).
export function Camera({ onCapture, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const attempt = useRef(0); // lets a late camera answer be ignored after the dialog closed or restarted
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const fallback = useRef<HTMLInputElement>(null);

  const stop = useCallback(() => {
    attempt.current += 1;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const start = useCallback(async () => {
    const mine = ++attempt.current;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setError(null);
    setReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open the camera. Use the button below to take a photo with your phone camera.');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1600 } }, audio: false });
      if (mine !== attempt.current) {
        media.getTracks().forEach((track) => track.stop()); // closed or restarted while the browser was asking
        return;
      }
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      setReady(true);
    } catch (err) {
      if (mine !== attempt.current) return;
      const name = err instanceof DOMException ? err.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission is blocked. Allow the camera for this site in your browser settings, then try again.'
          : name === 'NotFoundError'
            ? 'No camera found on this device. Use the button below to take a photo instead.'
            : 'Could not start the camera. Close other apps that use it and try again.',
      );
    }
  }, []);

  useEffect(() => {
    void start();
    return stop;
  }, [start, stop]);

  useEffect(
    () => () => {
      if (shot) URL.revokeObjectURL(shot.url);
    },
    [shot],
  );

  function snap() {
    const element = video.current;
    if (!element || !element.videoWidth) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1280 / Math.max(element.videoWidth, element.videoHeight));
    canvas.width = Math.round(element.videoWidth * scale);
    canvas.height = Math.round(element.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(element, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return setError('Could not take the photo. Please try again.');
        stop();
        setShot({ blob, url: URL.createObjectURL(blob) });
      },
      'image/jpeg',
      0.9,
    );
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Take a selfie">
      <div className="sheet">
        <h2>Take a selfie</h2>
        {shot ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="preview" src={shot.url} alt="Your selfie" />
            <div className="actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setShot(null);
                  void start();
                }}
              >
                Retake
              </button>
              <button className="btn" type="button" onClick={() => onCapture(shot.blob)}>
                Use this photo
              </button>
            </div>
          </>
        ) : (
          <>
            {!error ? <video ref={video} className="video" playsInline muted autoPlay /> : null}
            {error ? <div className="banner bad">{error}</div> : <p className="muted small">Face the camera in good light. Remove sunglasses and any cap.</p>}
            <div className="actions">
              <button className="btn ghost" type="button" onClick={onClose}>
                Cancel
              </button>
              {!error ? (
                <button className="btn" type="button" onClick={snap} disabled={!ready}>
                  {ready ? 'Take photo' : <Spinner />}
                </button>
              ) : (
                <button className="btn" type="button" onClick={() => fallback.current?.click()}>
                  Take photo with phone camera
                </button>
              )}
            </div>
            <input
              ref={fallback}
              className="visually-hidden"
              type="file"
              accept="image/*"
              capture="user"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onCapture(file);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
