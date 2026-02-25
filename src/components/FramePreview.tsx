import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { DeviceFrame } from '../hooks/useFrames';

interface FramePreviewProps {
  image: File;
  frame: DeviceFrame;
  blackFrame?: boolean; // default true — render device bezel in black
}

const FramePreview = ({ image, frame, blackFrame = true }: FramePreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState<string>('');

  useEffect(() => {
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const drawImageWithFrame = useCallback(async (forDownload = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const frameName = frame.coordinates.name;
      const framePath = `/frames/${frameName}.png`;

      const [screenImg, frameImg] = await Promise.all([
        loadImage(imageUrl),
        loadImage(framePath)
      ]);

      // Canvas matches the full frame image size
      canvas.width = frameImg.width;
      canvas.height = frameImg.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Where the screenshot sits inside the frame
      const { x, y } = frame.coordinates;
      const screenshotX = parseInt(x);
      const screenshotY = parseInt(y);

      // Scale screenshot to the frame's expected dimensions regardless of input resolution.
      // This means @2x Figma exports (e.g. 786×1704) are stretched to fill the
      // frame's screen area — same aspect ratio, so no distortion.
      const targetW = frame.coordinates.screenshotWidth ?? screenImg.width;
      const targetH = frame.coordinates.screenshotHeight ?? screenImg.height;

      // ── Draw screenshot clipped to the screen hole ────────────────
      // Use the frame PNG itself as the clip mask via canvas compositing:
      // 1. Draw screenshot onto a temp canvas at the correct position/size
      // 2. Apply destination-out with the frame PNG — this erases screenshot pixels
      //    wherever the frame is opaque (the bezel), leaving screenshot only
      //    in the transparent screen hole. Corners and the Dynamic Island are
      //    automatically handled by the frame's own alpha channel.
      const tmpCanvas = document.createElement('canvas');
      const tmpCtx = tmpCanvas.getContext('2d');
      if (!tmpCtx) return;
      tmpCanvas.width = canvas.width;
      tmpCanvas.height = canvas.height;

      tmpCtx.drawImage(screenImg, screenshotX, screenshotY, targetW, targetH);
      tmpCtx.globalCompositeOperation = 'destination-out';
      tmpCtx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

      ctx.drawImage(tmpCanvas, 0, 0);

      // ── Draw the device frame on top, optionally in black ─────────
      if (blackFrame) {
        ctx.save();
        ctx.filter = 'brightness(0)';
        ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
      }
    } catch (error) {
      console.error('Error loading images:', error);
    }
  }, [imageUrl, frame, blackFrame]);

  useEffect(() => {
    if (!canvasRef.current || !imageUrl) return;
    drawImageWithFrame();
  }, [imageUrl, frame, blackFrame, drawImageWithFrame]);

  const handleDownload = () => {
    if (!canvasRef.current) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    const originalCanvas = canvasRef.current;

    const tempCanvasRef = { current: tempCanvas };
    Object.defineProperty(canvasRef, 'current', {
      configurable: true,
      get() { return tempCanvasRef.current; }
    });

    drawImageWithFrame(true);

    setTimeout(() => {
      const link = document.createElement('a');
      link.download = `framed-${image.name.replace(/\.[^/.]+$/, '')}.png`;
      link.href = tempCanvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      Object.defineProperty(canvasRef, 'current', {
        configurable: true,
        get() { return originalCanvas; }
      });
      drawImageWithFrame(false);
    }, 100);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative transition-all duration-300 transform hover:scale-[1.01] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="max-w-full w-auto max-h-[80vh] md:max-h-[calc(100vh-128px)] h-auto shadow-xl rounded-3xl"
        />
      </div>

      <button
        id="download-button"
        onClick={handleDownload}
        className="mt-6 py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center transition-colors"
      >
        <Download className="h-4 w-4 mr-2" />
        Download Framed Image
      </button>
    </div>
  );
};

export default FramePreview;
