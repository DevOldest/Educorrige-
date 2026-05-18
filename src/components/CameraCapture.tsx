import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, Check, RotateCcw, Trash2, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (files: File[]) => void;
}

export default function CameraCapture({ isOpen, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setIsReady(true);
      }
      setError(null);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Não foi possível acessar a câmera. Verifique as permissões.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsReady(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImages(prev => [...prev, imageData]);
      }
    }
  };

  const removeImage = (index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleDone = () => {
    const files = capturedImages.map((dataUrl, index) => {
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)![1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], `captured_photo_${index}_${Date.now()}.jpg`, { type: mime });
    });

    onCapture(files);
    setCapturedImages([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col pt-safe">
      {/* Header */}
      <div className="p-4 flex items-center justify-between z-10 bg-black/50 backdrop-blur-md">
        <button 
          onClick={() => {
            onClose();
            setCapturedImages([]);
          }}
          className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <X size={24} />
        </button>
        <h3 className="text-white font-bold">Captura Direta</h3>
        <div className="flex items-center gap-2">
           <span className="bg-brand-yellow text-brand-blue-dark px-2 py-0.5 rounded-full text-xs font-bold">
            {capturedImages.length} fotos
          </span>
        </div>
      </div>

      {/* Video Preview */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-slate-900">
        {error ? (
          <div className="text-center p-6 space-y-4">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500">
              <X size={32} />
            </div>
            <p className="text-white font-medium">{error}</p>
            <button 
              onClick={startCamera}
              className="px-6 py-2 bg-brand-yellow text-brand-blue-dark rounded-xl font-bold"
            >
              Tentar Novamente
            </button>
          </div>
        ) : (
          <video 
            ref={videoRef}
            autoPlay 
            playsInline 
            className={cn(
              "w-full h-full object-contain transition-opacity duration-300",
              isReady ? "opacity-100" : "opacity-0"
            )}
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Captured Thumbnails Strip */}
      <div className="h-24 bg-black/80 backdrop-blur-md p-2 flex gap-3 overflow-x-auto items-center">
        {capturedImages.length === 0 ? (
          <div className="w-full flex items-center justify-center text-slate-500 text-xs font-bold uppercase tracking-wider">
            Nenhuma foto capturada
          </div>
        ) : (
          capturedImages.map((img, i) => (
            <div key={i} className="relative group flex-shrink-0">
              <img 
                src={img} 
                className="w-16 h-16 object-cover rounded-lg border-2 border-brand-yellow" 
                alt={`Captura ${i + 1}`}
              />
              <button 
                onClick={() => removeImage(i)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"
              >
                <X size={10} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Controls */}
      <div className="p-8 bg-black flex items-center justify-around pb-safe-bottom">
        <button 
          onClick={() => setCapturedImages([])}
          disabled={capturedImages.length === 0}
          className="p-4 text-white hover:bg-white/10 rounded-full transition-colors disabled:opacity-30"
          title="Limpar tudo"
        >
          <RotateCcw size={28} />
        </button>

        <button 
          onClick={capturePhoto}
          disabled={!isReady}
          className="w-20 h-20 bg-white rounded-full flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
        >
          <div className="w-16 h-16 rounded-full border-4 border-black" />
        </button>

        <button 
          onClick={handleDone}
          disabled={capturedImages.length === 0}
          className={cn(
            "p-4 rounded-full transition-all",
            capturedImages.length > 0 ? "bg-brand-yellow text-brand-blue-dark scale-110" : "text-white/30"
          )}
          title="Finalizar e Carregar"
        >
          <Check size={32} />
        </button>
      </div>
    </div>
  );
}
