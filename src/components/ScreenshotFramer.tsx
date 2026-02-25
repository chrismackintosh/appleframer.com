import React, { useEffect, useState } from "react";
import { ImagePlus, Download, Trash2, Settings } from "lucide-react";
import UploadZone from "./UploadZone";
import FramePreview from "./FramePreview";
import FrameSettings from "./FrameSettings";
import { DeviceFrame } from "../hooks/useFrames";
import { toast } from "sonner";
import JSZip from "jszip";

interface ScreenshotFramerProps {
  frames: DeviceFrame[];
  isLoading: boolean;
  error: string | null;
}

const ScreenshotFramer = ({
  frames,
  isLoading,
  error,
}: ScreenshotFramerProps) => {
  const [images, setImages] = useState<File[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<DeviceFrame | undefined>(
    undefined
  );
  const [showSettings, setShowSettings] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null
  );
  const [blackFrame, setBlackFrame] = useState(false);

  useEffect(() => {
    if (frames.length > 0 && !selectedFrame) {
      setSelectedFrame(frames[0]);
    }
  }, [frames, selectedFrame]);

  const handleFilesSelected = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length > 0) {
      // Always use the first available frame — we only have one.
      // No detection needed; just frame everything silently.
      if (frames.length > 0) {
        setSelectedFrame(frames[0]);
      }
      setImages((prev) => {
        const newImages = [...prev, ...imageFiles];
        setSelectedImageIndex(newImages.length - 1);
        return newImages;
      });
    } else {
      setImages((prev) => {
        const newImages = [...prev, ...imageFiles];
        if (imageFiles.length > 0 && selectedImageIndex === null) {
          setSelectedImageIndex(newImages.length - 1);
        }
        return newImages;
      });
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    if (selectedImageIndex === index) {
      setSelectedImageIndex(images.length > 1 ? 0 : null);
    } else if (selectedImageIndex !== null && index < selectedImageIndex) {
      setSelectedImageIndex(selectedImageIndex - 1);
    }
  };

  const handleSelectImage = (index: number) => {
    setSelectedImageIndex(index);
  };

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  const renderFramedImage = async (
    image: File,
    frame: DeviceFrame
  ): Promise<Blob> => {
    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    };

    const imageUrl = URL.createObjectURL(image);
    try {
      const frameName = frame.coordinates.name;
      const framePath = `/frames/${frameName}.png`;
      const maskPath = `/frames/${frameName}_mask.png`;

      const [screenImg, frameImg] = await Promise.all([
        loadImage(imageUrl),
        loadImage(framePath),
      ]);

      // Try to load the screen-hole mask (white = screen hole, transparent elsewhere).
      let maskImg: HTMLImageElement | null = null;
      try {
        maskImg = await loadImage(maskPath);
      } catch {
        // No mask — screenshot won't be corner-clipped but will still render
      }

      const canvas = document.createElement("canvas");
      canvas.width = frameImg.width;
      canvas.height = frameImg.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");

      const targetW = frame.coordinates.screenshotWidth ?? screenImg.width;
      const targetH = frame.coordinates.screenshotHeight ?? screenImg.height;

      const { x, y } = frame.coordinates;
      const screenshotX = parseInt(x);
      const screenshotY = parseInt(y);

      // Draw screenshot clipped to the screen hole via destination-in mask.
      const tmpCanvas = document.createElement("canvas");
      const tmpCtx = tmpCanvas.getContext("2d");
      if (!tmpCtx) throw new Error("No temp canvas context");
      tmpCanvas.width = canvas.width;
      tmpCanvas.height = canvas.height;

      tmpCtx.drawImage(screenImg, screenshotX, screenshotY, targetW, targetH);

      if (maskImg) {
        tmpCtx.globalCompositeOperation = "destination-in";
        tmpCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(tmpCanvas, 0, 0);

      // Draw frame on top. No brightness filter needed — the PNG is already black.
      ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

      return await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
        }, "image/png");
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  };

  const handleDownloadZip = async () => {
    toast.info("Creating zip...");
    const zip = new JSZip();
    for (let i = 0; i < images.length; i++) {
      const blob = await renderFramedImage(images[i], selectedFrame!);
      zip.file(`framed-${images[i].name.replace(/\.[^/.]+$/, "")}.png`, blob);
    }
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = "framed-screenshots.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast.success("Zip created successfully!");
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-6xl">
        <div className="bg-white rounded-xl shadow-xl p-8 text-center">
          <p className="text-gray-500">Loading available frames...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-6xl">
        <div className="bg-white rounded-xl shadow-xl p-8 text-center">
          <p className="text-red-500">Error loading frames: {error}</p>
        </div>
      </div>
    );
  }

  if (!frames.length || !selectedFrame) {
    return (
      <div className="w-full max-w-6xl">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden transition-all duration-300">
          <UploadZone onFilesSelected={handleFilesSelected} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl">
      {images.length === 0 && (
        <div className="mb-8 px-2 py-5 bg-gradient-to-r from-gray-50 via-white to-gray-100 border border-gray-200 rounded-2xl shadow flex flex-col items-center text-center relative overflow-hidden">
          <p className="text-base md:text-lg text-gray-700 max-w-3xl mx-auto mb-1">
            Frame your{" "}
            <span className="font-semibold text-black">iPhone</span>{" "}
            screenshots for{" "}
            <span className="font-semibold text-black">presentations</span>.
          </p>
          <p className="text-sm text-gray-500 max-w-xl mx-auto">
            Drop any iPhone screenshot — it will be automatically scaled and
            framed with the custom black bezel.
          </p>
        </div>
      )}
      <div className="bg-white rounded-xl shadow-xl overflow-hidden transition-all duration-300">
        {images.length === 0 ? (
          <UploadZone onFilesSelected={handleFilesSelected} />
        ) : (
          <div className="flex flex-col md:flex-row min-h-[500px]">
            <div className="w-full md:w-3/4 p-6 flex items-center justify-center relative">
              {selectedImageIndex !== null && (
                <FramePreview
                  image={images[selectedImageIndex]}
                  frame={selectedFrame}
                  blackFrame={blackFrame}
                />
              )}

              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    blackFrame
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                  }`}
                  onClick={() => setBlackFrame(true)}
                  title="Black frame"
                >
                  Black
                </button>
                <button
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    !blackFrame
                      ? "bg-gray-700 text-white border-gray-700"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                  }`}
                  onClick={() => setBlackFrame(false)}
                  title="Original frame color"
                >
                  Original
                </button>

                <button
                  className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                  onClick={toggleSettings}
                  title="Frame settings"
                >
                  <Settings className="h-5 w-5 text-gray-600" />
                </button>
              </div>
            </div>

            <div className="w-full md:w-1/4 bg-gray-50 p-4 border-t md:border-t-0 md:border-l border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium">Screenshots</h3>
                <button
                  className="flex items-center text-sm text-blue-500 hover:text-blue-600"
                  onClick={() => document.getElementById("file-input")?.click()}
                >
                  <ImagePlus className="h-4 w-4 mr-1" />
                  Add more
                </button>
                <input
                  id="file-input"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFilesSelected(Array.from(e.target.files));
                    }
                  }}
                />
              </div>

              <div className="overflow-y-auto max-h-[400px] space-y-3">
                {images.map((image, index) => (
                  <div
                    key={index}
                    className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedImageIndex === index
                        ? "bg-blue-50 border border-blue-200"
                        : "hover:bg-gray-100"
                    }`}
                    onClick={() => handleSelectImage(index)}
                  >
                    <div className="w-12 h-12 bg-gray-200 rounded-md overflow-hidden mr-3 flex-shrink-0">
                      <img
                        src={URL.createObjectURL(image)}
                        alt={`Preview ${index}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-grow min-w-0">
                      <p className="text-sm truncate">{image.name}</p>
                      <p className="text-xs text-gray-500">
                        {Math.round(image.size / 1024)} KB
                      </p>
                    </div>
                    <button
                      className="ml-2 p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-200 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveImage(index);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {selectedImageIndex !== null && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  {images.length > 1 && (
                    <button
                      className="w-full mb-2 py-2 px-4 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center transition-colors"
                      onClick={handleDownloadZip}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download All as Zip
                    </button>
                  )}
                  <button
                    className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center justify-center transition-colors"
                    onClick={() => {
                      document.getElementById("download-button")?.click();
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Framed Image
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <FrameSettings
          selectedFrame={selectedFrame}
          setSelectedFrame={setSelectedFrame}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

export default ScreenshotFramer;
