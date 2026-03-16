import React, { useState } from 'react';
import { LogIn, Loader2, GraduationCap, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login. Verifique suas credenciais.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden border border-slate-100"
      >
        <div className="p-8 bg-brand-blue-dark text-white text-center">
          <div className="w-16 h-16 bg-brand-yellow rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg rotate-3">
            <GraduationCap size={32} className="text-brand-blue-dark" />
          </div>
          <h2 className="text-2xl font-serif font-bold">Educorrige</h2>
          <p className="text-brand-gray text-sm mt-1">Portal do Professor</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm flex items-center gap-3">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-slate-400 ml-1">E-mail</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-yellow transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-slate-400 ml-1">Senha</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-yellow transition-all"
            />
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-blue text-white py-4 rounded-2xl font-bold hover:bg-brand-blue-dark transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={20} />}
            Entrar no Sistema
          </button>

          <p className="text-center text-xs text-slate-400">
            Acesso restrito a professores autorizados.
          </p>
        </form>
      </motion.div>
    </div>
  );
}
