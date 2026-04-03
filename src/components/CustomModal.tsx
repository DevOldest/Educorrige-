import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
}

export default function CustomModal({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  onConfirm,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar'
}: ModalProps) {
  const icons = {
    info: <Info className="text-blue-500" size={32} />,
    success: <CheckCircle2 className="text-emerald-500" size={32} />,
    warning: <AlertTriangle className="text-amber-500" size={32} />,
    error: <AlertCircle className="text-red-500" size={32} />,
    confirm: <AlertTriangle className="text-brand-gold" size={32} />
  };

  const colors = {
    info: "border-blue-100 bg-blue-50/30",
    success: "border-emerald-100 bg-emerald-50/30",
    warning: "border-amber-100 bg-amber-50/30",
    error: "border-red-100 bg-red-50/30",
    confirm: "border-brand-yellow/20 bg-brand-yellow/5"
  };

  const buttonColors = {
    info: "bg-blue-500 hover:bg-blue-600",
    success: "bg-emerald-500 hover:bg-emerald-600",
    warning: "bg-amber-500 hover:bg-amber-600",
    error: "bg-red-500 hover:bg-red-600",
    confirm: "bg-brand-blue-dark hover:bg-brand-black"
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-brand-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={cn(
              "relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border p-6 text-center",
              colors[type]
            )}
          >
            <div className="flex justify-center mb-4">
              {icons[type]}
            </div>
            
            <h3 className="text-xl font-serif font-bold text-brand-blue-dark mb-2">{title}</h3>
            <p className="text-slate-600 mb-8 leading-relaxed">{message}</p>
            
            <div className="flex items-center gap-3">
              {type === 'confirm' ? (
                <>
                  <button
                    onClick={onClose}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                  >
                    {cancelText}
                  </button>
                  <button
                    onClick={() => {
                      onConfirm?.();
                      onClose();
                    }}
                    className={cn(
                      "flex-1 px-6 py-3 text-white rounded-xl font-bold shadow-lg transition-all",
                      buttonColors[type]
                    )}
                  >
                    {confirmText}
                  </button>
                </>
              ) : (
                <button
                  onClick={onClose}
                  className={cn(
                    "w-full px-6 py-3 text-white rounded-xl font-bold shadow-lg transition-all",
                    buttonColors[type]
                  )}
                >
                  OK
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
