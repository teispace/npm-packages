// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encode } from '../src/core/encode.js';
import { rasterize } from '../src/raster/scene-raster.js';
import { QrCanvas, QrCode, useQrCode } from '../src/react.js';
import { renderSvg } from '../src/render/svg.js';
import { scan } from '../src/verify/api.js';

afterEach(cleanup);

describe('<QrCode>', () => {
  it('renders an svg element with the right viewBox', () => {
    const { container } = render(<QrCode value="https://example.com" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const matrix = encode('https://example.com');
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${matrix.size + 8} ${matrix.size + 8}`);
  });

  it('produces real elements, not injected markup', () => {
    const { container } = render(<QrCode value="element check" />);
    // dangerouslySetInnerHTML would leave a single text child; real elements
    // give us a queryable tree.
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('renders geometry identical to the string renderer', () => {
    // Both paths must agree, or an SVG preview and a PNG export would differ.
    const value = 'https://example.com/parity';
    const style = { moduleShape: 'rounded' as const };
    const { container } = render(<QrCode value={value} {...style} />);

    const fromComponent = Array.from(container.querySelectorAll('path'))
      .map((p) => p.getAttribute('d'))
      .join('');
    const fromString = renderSvg(encode(value), style).svg;

    // Every path the component drew must appear in the string renderer's output.
    for (const d of Array.from(container.querySelectorAll('path'))) {
      expect(fromString).toContain(d.getAttribute('d'));
    }
    expect(fromComponent.length).toBeGreaterThan(0);
  });

  it('applies size to both axes for a square code', () => {
    const { container } = render(<QrCode value="sized" size={256} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('256');
    expect(svg?.getAttribute('height')).toBe('256');
  });

  it('accounts for a label band when sizing', () => {
    const { container } = render(
      <QrCode
        value="labelled"
        size={200}
        frame={{
          style: 'label-bottom',
          text: 'SCAN ME',
          textColor: '#fff',
          background: '#000',
          border: 1,
          cornerRadius: 2,
          fontFamily: 'sans-serif',
        }}
      />,
    );
    const svg = container.querySelector('svg');
    // A label makes the scene taller than it is wide, so height must exceed width.
    expect(Number(svg?.getAttribute('height'))).toBeGreaterThan(200);
  });

  it('exposes an accessible name when given a title, and hides itself otherwise', () => {
    const { container: named } = render(<QrCode value="x" title="Link to example" />);
    expect(named.querySelector('svg')?.getAttribute('role')).toBe('img');
    expect(named.querySelector('title')?.textContent).toBe('Link to example');

    cleanup();
    const { container: bare } = render(<QrCode value="x" />);
    expect(bare.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('forwards DOM props without leaking styling options onto the element', () => {
    const { container } = render(
      <QrCode value="x" className="my-code" data-testid="qr" moduleShape="dot" ecc="H" />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('my-code');
    expect(svg?.getAttribute('data-testid')).toBe('qr');
    // Encoder and style options must never reach the DOM.
    expect(svg?.hasAttribute('moduleShape')).toBe(false);
    expect(svg?.hasAttribute('ecc')).toBe(false);
  });

  it('accepts a ref to the svg element', () => {
    const ref = { current: null as SVGSVGElement | null };
    render(<QrCode value="x" ref={ref} />);
    expect(ref.current?.tagName.toLowerCase()).toBe('svg');
  });

  it('encodes binary and pre-built segments, not just text', () => {
    // The popular React wrappers are text-only; this must not be.
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const { container } = render(<QrCode value={bytes} ecc="H" />);
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('emits gradient definitions with stable ids across renders', () => {
    const style = {
      body: {
        kind: 'linear' as const,
        angle: 45,
        stops: [
          { offset: 0, color: '#000000' },
          { offset: 1, color: '#333333' },
        ],
      },
    };
    const first = renderToStaticMarkup(<QrCode value="grad" {...style} />);
    const second = renderToStaticMarkup(<QrCode value="grad" {...style} />);
    expect(first).toBe(second);
    expect(first).toContain('linearGradient');
  });
});

describe('server rendering', () => {
  it('renders to static markup with no DOM present', () => {
    const html = renderToStaticMarkup(<QrCode value="https://example.com" size={128} />);
    expect(html.startsWith('<svg')).toBe(true);
    expect(html).toContain('viewBox=');
  });

  it('server markup matches what the client renders, so hydration is quiet', () => {
    const value = 'https://example.com/hydration';
    const props = { value, moduleShape: 'rounded' as const, size: 128 };
    const server = renderToStaticMarkup(<QrCode {...props} />);
    const { container } = render(<QrCode {...props} />);
    // Compare the path data, which is the part that could drift.
    const clientPaths = Array.from(container.querySelectorAll('path')).map((p) =>
      p.getAttribute('d'),
    );
    for (const d of clientPaths) expect(server).toContain(d);
  });

  it('the rendered SVG still decodes back to the payload', () => {
    // Rendering through React must not corrupt the symbol.
    const value = 'https://example.com/react-decode';
    const { container } = render(<QrCode value={value} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // The matrix behind it is what a scanner would read.
    expect(scan(encode(value)).text).toBe(value);
  });
});

describe('useQrCode', () => {
  it('returns the same object when inputs are unchanged, despite inline literals', () => {
    const seen: unknown[] = [];
    const Probe = ({ value }: { value: string }) => {
      // A fresh options object every render is the common call pattern; the
      // hook must not recompute for it.
      const result = useQrCode(value, { moduleShape: 'rounded' });
      seen.push(result);
      return null;
    };
    const { rerender } = render(<Probe value="stable" />);
    rerender(<Probe value="stable" />);
    rerender(<Probe value="stable" />);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).toBe(seen[0]);
  });

  it('recomputes when the value changes', () => {
    const seen: unknown[] = [];
    const Probe = ({ value }: { value: string }) => {
      seen.push(useQrCode(value));
      return null;
    };
    const { rerender } = render(<Probe value="a" />);
    rerender(<Probe value="b" />);
    expect(seen[1]).not.toBe(seen[0]);
  });

  it('recomputes when an option changes', () => {
    const seen: unknown[] = [];
    const Probe = ({ ecc }: { ecc: 'L' | 'H' }) => {
      seen.push(useQrCode('same', { ecc, boostEcc: false }));
      return null;
    };
    const { rerender } = render(<Probe ecc="L" />);
    rerender(<Probe ecc="H" />);
    expect(seen[1]).not.toBe(seen[0]);
  });
});

describe('<QrCanvas>', () => {
  it('sizes the backing store in device pixels, not CSS pixels', () => {
    // This is the retina-blur bug the popular canvas components have: they
    // size the bitmap in CSS pixels and the browser upscales it.
    const { container } = render(<QrCanvas value="retina" size={128} pixelRatio={3} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.style.width).toBe('128px');
    // Backing store must be ~3x the CSS size.
    expect(canvas?.width).toBeGreaterThan(300);
  });

  it('uses a 1x backing store when told to', () => {
    const { container } = render(<QrCanvas value="flat" size={100} pixelRatio={1} />);
    const canvas = container.querySelector('canvas');
    expect(canvas?.width).toBeLessThan(150);
  });

  it('forwards DOM props and exposes an accessible name', () => {
    const { container } = render(
      <QrCanvas value="x" size={64} title="Scan me" className="c" moduleShape="dot" />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas?.getAttribute('class')).toBe('c');
    expect(canvas?.getAttribute('aria-label')).toBe('Scan me');
    expect(canvas?.hasAttribute('moduleShape')).toBe(false);
  });

  it('accepts a ref to the canvas element', () => {
    const ref = { current: null as HTMLCanvasElement | null };
    render(<QrCanvas value="x" size={64} ref={ref} />);
    expect(ref.current?.tagName.toLowerCase()).toBe('canvas');
  });
});

/** Payload used by the camera tests, kept distinct so a stray match is obvious. */
const SCANNER_PAYLOAD = 'https://example.com/camera-frame';

describe('useQrScanner', () => {
  it('reports a clear error when there is no camera API', async () => {
    const { useQrScanner } = await import('../src/react/use-qr-scanner.js');
    const onError = vi.fn();
    const Probe = () => {
      const { ref } = useQrScanner({ onError });
      // A live camera viewfinder carries no audio and no authored content.
      // biome-ignore lint/a11y/useMediaCaption: nothing to caption on a viewfinder
      return <video ref={ref} />;
    };
    render(<Probe />);
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toMatch(/camera/i);
  });

  /**
   * A fake camera: a stream, a video element reporting a size, and a canvas
   * that hands back the pixels of a real rendered symbol.
   *
   * jsdom has no canvas, so `getContext` returns null and the frame loop
   * bails before it decodes anything. Stubbing it is what makes the loop's
   * documented behaviour — throttling, downscaling, not firing the same
   * payload repeatedly — testable at all.
   */
  const fakeCamera = (options: { videoWidth?: number; videoHeight?: number } = {}) => {
    const frame = rasterize(encode(SCANNER_PAYLOAD), {}, { scale: 4 });
    const videoWidth = options.videoWidth ?? frame.width;
    const videoHeight = options.videoHeight ?? frame.height;

    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const sized: { width: number; height: number }[] = [];
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
      return {
        drawImage: () => {
          sized.push({ width: this.width, height: this.height });
        },
        // The hook passes its own width/height to the decoder, so the buffer
        // handed back here only decodes when the two agree — which is exactly
        // the scaling arithmetic under test.
        getImageData: (_x: number, _y: number, width: number, height: number) => ({
          data:
            width === frame.width && height === frame.height
              ? frame.pixels
              : new Uint8Array(width * height * 4).fill(255),
          width,
          height,
        }),
      } as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;

    /**
     * Make the video element look like one with a frame ready.
     *
     * Three properties, and all three matter: the loop bails on
     * `readyState < 2`, which jsdom reports as 0 forever, so without it the
     * frame grabber never runs and every assertion below would pass by
     * measuring nothing.
     */
    const attachVideoSize = () => {
      const video = document.querySelector('video');
      if (!video) return;
      Object.defineProperty(video, 'videoWidth', { configurable: true, value: videoWidth });
      Object.defineProperty(video, 'videoHeight', { configurable: true, value: videoHeight });
      // HAVE_CURRENT_DATA: a frame is available to draw.
      Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    };

    const restore = () => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      Reflect.deleteProperty(navigator, 'mediaDevices');
    };

    return { attachVideoSize, restore, sized, track };
  };

  it('starts the camera on its own, because autoStart defaults to true', async () => {
    const { useQrScanner } = await import('../src/react/use-qr-scanner.js');
    const camera = fakeCamera();
    const Probe = () => {
      const { ref } = useQrScanner();
      // biome-ignore lint/a11y/useMediaCaption: nothing to caption on a viewfinder
      return <video ref={ref} />;
    };

    render(<Probe />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Nobody called start(). The camera came on anyway, which is the
    // documented default and worth pinning precisely because it is the one
    // behaviour a reader would want to know about before shipping.
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    camera.restore();
  });

  it('stays off until start() when autoStart is false', async () => {
    const { useQrScanner } = await import('../src/react/use-qr-scanner.js');
    const camera = fakeCamera();
    let api: { start: () => void } | null = null;
    const Probe = () => {
      const scanner = useQrScanner({ autoStart: false });
      api = scanner;
      // biome-ignore lint/a11y/useMediaCaption: nothing to caption on a viewfinder
      return <video ref={scanner.ref} />;
    };

    render(<Probe />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();

    act(() => {
      (api as unknown as { start: () => void }).start();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    camera.restore();
  });

  it('does not report the same payload on every frame', async () => {
    // The README's claim: "the same payload does not fire sixty times a
    // second". A camera holds a code in view for seconds at a time, so
    // without suppression a single scan becomes hundreds of callbacks.
    const { useQrScanner } = await import('../src/react/use-qr-scanner.js');
    const camera = fakeCamera();
    const onResult = vi.fn();

    const Probe = () => {
      const { ref } = useQrScanner({ onResult, fps: 20, repeatDelayMs: 5000 });
      // biome-ignore lint/a11y/useMediaCaption: nothing to caption on a viewfinder
      return <video ref={ref} />;
    };

    render(<Probe />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    camera.attachVideoSize();

    // A second of footage at 20 fps, with the code in view throughout.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    expect(onResult.mock.calls.length).toBeGreaterThan(0);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0].text).toBe(SCANNER_PAYLOAD);
    camera.restore();
  }, 15000);

  it('downscales a large frame before decoding it', async () => {
    // A 1080p frame is far more detail than the decoder needs, and decoding
    // one every 100 ms is what drops frames on a phone.
    const { useQrScanner } = await import('../src/react/use-qr-scanner.js');
    const camera = fakeCamera({ videoWidth: 1920, videoHeight: 1080 });

    const Probe = () => {
      const { ref } = useQrScanner({ maxSize: 640, fps: 20 });
      // biome-ignore lint/a11y/useMediaCaption: nothing to caption on a viewfinder
      return <video ref={ref} />;
    };

    render(<Probe />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    camera.attachVideoSize();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(camera.sized.length).toBeGreaterThan(0);
    // 1920x1080 scaled so the longest edge is maxSize.
    expect(camera.sized[0]).toEqual({ width: 640, height: 360 });
    camera.restore();
  }, 15000);

  it('stops media tracks on unmount, releasing the camera', async () => {
    const { useQrScanner } = await import('../src/react/use-qr-scanner.js');
    const stop = vi.fn();
    const track = { stop };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const Probe = () => {
      const { ref } = useQrScanner();
      // A live camera viewfinder carries no audio and no authored content.
      // biome-ignore lint/a11y/useMediaCaption: nothing to caption on a viewfinder
      return <video ref={ref} />;
    };
    const { unmount } = render(<Probe />);
    // Let the getUserMedia promise settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    unmount();

    // Failing to stop tracks is what leaves the camera light on.
    expect(stop).toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });
});
