'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Camera, RefreshCw, AlertCircle, Search, Sparkles } from 'lucide-react';
import { CatalogFoodItem } from '@/lib/foodCatalog/search';
import ModalPortal from '../ModalPortal';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFoodFound: (food: CatalogFoodItem) => void;
  onOpenOcr: () => void;
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  onFoodFound,
  onOpenOcr,
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isScanningRef = useRef(false);

  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [searching, setSearching] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);

  // Iniciar câmera quando modal abrir
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    stopCamera();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Acesso à câmera não suportado neste navegador.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      setHasCamera(true);
      startBarcodeDetection();
    } catch (err: any) {
      console.warn('[BarcodeScanner] Erro na câmera:', err);
      setHasCamera(false);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Permissão de câmera negada. Permita o acesso nas configurações do navegador ou digite o código de barras abaixo.'
          : 'Não foi possível acessar a câmera do dispositivo.'
      );
    }
  };

  const stopCamera = () => {
    isScanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.1;
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
      if (navigator.vibrate) {
        navigator.vibrate(100);
      }
    } catch {
      // Áudio não essencial
    }
  };

  const startBarcodeDetection = () => {
    if (!('BarcodeDetector' in window)) {
      // BarcodeDetector nativo não suportado (ex: desktop Safari antigo / Firefox)
      return;
    }

    isScanningRef.current = true;
    const barcodeDetector = new (window as any).BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'code_128'],
    });

    const detectLoop = async () => {
      if (!isScanningRef.current || !videoRef.current || searching) {
        if (isScanningRef.current) requestAnimationFrame(detectLoop);
        return;
      }

      if (videoRef.current.readyState >= 2) {
        try {
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            const rawValue = barcodes[0].rawValue;
            isScanningRef.current = false;
            playBeep();
            handleBarcodeLookup(rawValue);
            return;
          }
        } catch {
          // Frame skip
        }
      }

      if (isScanningRef.current) {
        setTimeout(() => requestAnimationFrame(detectLoop), 150);
      }
    };

    requestAnimationFrame(detectLoop);
  };

  const handleBarcodeLookup = async (code: string) => {
    const cleanCode = code.trim().replace(/\D/g, '');
    if (!cleanCode) return;

    setSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(`/api/foods/barcode/${cleanCode}`);
      const data = await res.json();

      if (!res.ok || !data.food) {
        setSearchError(
          `Produto com código ${cleanCode} não encontrado. Você pode tirar foto da tabela ou cadastrá-lo manualmente.`
        );
        isScanningRef.current = true; // Retoma scanning
        return;
      }

      stopCamera();
      onFoodFound(data.food);
    } catch (err: any) {
      setSearchError('Erro ao consultar banco de alimentos.');
      isScanningRef.current = true;
    } finally {
      setSearching(false);
    }
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl p-5 shadow-2xl space-y-4 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-cyan-400">
            <Camera className="h-5 w-5" />
            <h3 className="text-base font-bold text-white">Escanear Código de Barras</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Viewfinder da Câmera */}
        <div className="relative w-full aspect-[4/3] bg-black rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
          {hasCamera !== false ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Mira visual animada */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
                <div className="relative w-64 h-36 border-2 border-cyan-400/70 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                  {/* Linha vermelha de leitura */}
                  <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse" />
                  
                  {/* Cantoneiras */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-cyan-300" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-cyan-300" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-cyan-300" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-cyan-300" />
                </div>
              </div>

              {/* Botão de trocar câmera */}
              <button
                type="button"
                onClick={toggleCamera}
                className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/70 text-white backdrop-blur-sm border border-slate-700 hover:bg-slate-800 transition"
                title="Trocar câmera"
              >
                <RefreshCw className="h-4 w-4" />
              </button>

              {searching && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-cyan-300">
                  <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-semibold">Identificando alimento...</span>
                </div>
              )}
            </>
          ) : (
            <div className="p-6 text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-amber-400 mx-auto" />
              <p className="text-xs text-slate-300">{cameraError}</p>
            </div>
          )}
        </div>

        {searchError && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-300 text-xs space-y-2">
            <p>{searchError}</p>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
                onOpenOcr();
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5" /> Tirar foto da tabela nutricional em vez disso
            </button>
          </div>
        )}

        {/* Busca Manual por Código */}
        <div className="space-y-2 pt-1 border-t border-slate-800/80">
          <label className="block text-xs uppercase text-slate-500 font-semibold tracking-wider">
            Ou digite os números do código de barras
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ex: 7891000100103"
              className="flex-1 bg-[#080d1a] border border-slate-700/70 rounded-xl px-3 py-2 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-cyan-500/60"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBarcodeLookup(manualBarcode)}
            />
            <button
              type="button"
              disabled={!manualBarcode || searching}
              onClick={() => handleBarcodeLookup(manualBarcode)}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-1"
            >
              <Search className="h-3.5 w-3.5" /> Buscar
            </button>
          </div>
        </div>
      </div>
    </div>
  </ModalPortal>
  );
}
