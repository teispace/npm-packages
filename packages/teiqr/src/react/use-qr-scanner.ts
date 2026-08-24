'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { tryScan } from '../verify/api.js';
import type { ScanResult } from '../verify/scan.js';

export interface UseQrScannerOptions {
  /**
   * Called for each successful read. Fires once per distinct payload by
   * default — see {@link repeatDelayMs}.
   */
  onResult?: (result: ScanResult) => void;
  /** Called when the camera cannot be started, most often a denied permission. */
  onError?: (error: Error) => void;
  /** Start the camera as soon as the element is attached. Defaults to true. */
  autoStart?: boolean;
  /**
   * Milliseconds before the same payload is reported again. A camera sees the
   * same code in every frame, so without this a single scan fires a callback
   * sixty times a second. Set to 0 to report every frame.
   */
  repeatDelayMs?: number;
  /**
   * Frames per second to analyse. Decoding every frame is wasteful — a person
   * cannot present a code faster than this — and throttling keeps the main
   * thread free enough for the video to stay smooth.
   */
  fps?: number;
  /** Which camera to request. `'environment'` is the rear camera on a phone. */
  facingMode?: 'environment' | 'user';
  /**
   * Longest edge, in pixels, that a frame is downscaled to before decoding.
   * A 1080p frame is far more detail than a decoder needs, and scanning one
   * costs several times more than scanning a 640px version of it.
   */
  maxSize?: number;
}

export interface QrScannerState {
  /** Attach to a `<video>` element. */
  readonly ref: (node: HTMLVideoElement | null) => void;
  /** The most recent successful read. */
  readonly result: ScanResult | null;
  /** The most recent failure to start or run the camera. */
  readonly error: Error | null;
  /** Whether the camera is currently running. */
  readonly scanning: boolean;
  start: () => void;
  stop: () => void;
}

/**
 * Read QR codes from a camera.
 *
 * Wires up `getUserMedia`, throttled frame grabbing, downscaling and decoding,
 * and tears all of it down on unmount — including stopping the media tracks,
 * which is what leaves the camera light on when a component forgets it.
 *
 * ```tsx
 * const { ref, result, error } = useQrScanner({ onResult: (r) => console.log(r.text) });
 * return <video ref={ref} playsInline muted />;
 * ```
 *
 * Requires a secure context (HTTPS or localhost); browsers refuse camera
 * access otherwise, and the resulting error is surfaced through `onError`.
 */
export const useQrScanner = (options: UseQrScannerOptions = {}): QrScannerState => {
  const {
    onResult,
    onError,
    autoStart = true,
    repeatDelayMs = 1500,
    fps = 10,
    facingMode = 'environment',
    maxSize = 640,
  } = options;

  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [scanning, setScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRef = useRef<{ text: string; at: number } | null>(null);

  // Held in refs so changing a callback does not restart the camera.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Stopping every track is what actually releases the camera and turns the
    // indicator light off; pausing the video element alone does not.
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  const grabFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) return;

    const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvasRef.current = canvas;
    }
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);

    const image = context.getImageData(0, 0, width, height);
    // tryScan rather than scan: most frames contain no code at all, and
    // exceptions are the wrong control flow for the common case.
    const found = tryScan({ data: image.data, width, height });
    if (!found) return;

    const now = Date.now();
    const last = lastRef.current;
    if (last && last.text === found.text && now - last.at < repeatDelayMs) return;
    lastRef.current = { text: found.text, at: now };

    setResult(found);
    onResultRef.current?.(found);
  }, [maxSize, repeatDelayMs]);

  const start = useCallback(() => {
    if (streamRef.current) return;

    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!media?.getUserMedia) {
      const failure = new Error(
        'Camera access is unavailable. This needs a browser and a secure context (HTTPS or localhost).',
      );
      setError(failure);
      onErrorRef.current?.(failure);
      return;
    }

    media
      .getUserMedia({ video: { facingMode }, audio: false })
      .then((stream) => {
        // The component may have unmounted while permission was pending.
        if (!videoRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {
          // Autoplay can be refused; the caller can still call play() on the
          // element from a user gesture. Frame grabbing tolerates a paused
          // video by checking readyState.
        });
        setError(null);
        setScanning(true);
        timerRef.current = setInterval(grabFrame, Math.max(1, Math.round(1000 / fps)));
      })
      .catch((cause: unknown) => {
        const failure = cause instanceof Error ? cause : new Error(String(cause));
        setError(failure);
        onErrorRef.current?.(failure);
      });
  }, [facingMode, fps, grabFrame]);

  const ref = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node && autoStart) start();
      if (!node) stop();
    },
    [autoStart, start, stop],
  );

  // Always release the camera on unmount, however the component went away.
  useEffect(() => stop, [stop]);

  return { ref, result, error, scanning, start, stop };
};
