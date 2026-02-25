import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { DeviceFrame } from '../hooks/useFrames';

interface FramePreviewProps {
  image: File;
  frame: DeviceFrame;
}

const FramePreview = ({ image, frame }: FramePreviewProps) => {
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

  const drawImageWithFrame = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const frameName = frame.coordinates.name;
      const framePath = `/frames/${frameName}.png`;
      const maskPath = `/frames/${frameName}_mask.png`;

      const [screenImg, frameImg] = await Promise.all([
        loadImage(imageUrl),
        loadImage(framePath),
      ]);

      // Screen-hole mask: white pixels = visible area, transparent = hidden.
      // Generated from the bezel PNG via exterior flood fill for pixel-perfect clipping.
      let maskImg: HTMLImageElement | null = null;
      try {
        maskImg = await loadImage(maskPath);
      } catch {
        // No mask — corners won't be clipped but framing still works
      }

      canvas.width = frameImg.width;
      canvas.height = frameImg.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { x, y } = frame.coordinates;
      const screenshotX = parseInt(x);
      const screenshotY = parseInt(y);

      // Scale screenshot to the frame's screen hole dimensions regardless of input size.
      const targetW = frame.coordinates.screenshotWidth ?? screenImg.width;
      const targetH = frame.coordinates.screenshotHeight ?? screenImg.height;

      // Draw screenshot clipped to screen hole via destination-in mask.
      const tmpCanvas = document.createElement('canvas');
      const tmpCtx = tmpCanvas.getContext('2d');
      if (!tmpCtx) return;
      tmpCanvas.width = canvas.width;
      tmpCanvas.height = canvas.height;

      tmpCtx.drawImage(screenImg, screenshotX, screenshotY, targetW, targetH);

      if (maskImg) {
        // Keep screenshot only where mask is white (the screen hole interior).
        tmpCtx.globalCompositeOperation = 'destination-in';
        tmpCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(tmpCanvas, 0, 0);

      // Draw the frame on top. No brightness filter needed — the PNG is already black.
      ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

    } catch (error) {
      console.error('Error rendering frame:', error);
    }
  }, [imageUrl, frame]);

  useEffect(() => {
    if (!canvasRef.current || !imageUrl) return;
    drawImageWithFrame();
  }, [imageUrl, frame, drawImageWithFrame]);

  // Export the already-rendered preview canvas directly — no re-render needed.
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `framed-${image.name.replace(/\.[^/.]+$/, '')}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
