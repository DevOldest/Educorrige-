import React, { useState, useEffect } from 'react';
import { LogIn, Loader2, GraduationCap, AlertCircle, Key, FileCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase, clearSupabaseAuthStorage } from '../lib/supabase';
import { getStoredSimulation, fetchRemoteSimulation } from '../lib/enemService';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../lib/safeStorage';

interface LoginProps {
  onLogin: () => void;
  onReviewerLogin: (reviewerName: string) => void;
  sessionNotice?: string | null;
}

export default function Login({ onLogin, onReviewerLogin, sessionNotice }: LoginProps) {
  const [mode, setMode] = useState<'admin' | 'reviewer'>('admin');
  
  // Login Titular
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);

  // Login Corretor via Código
  const [reviewerName, setReviewerName] = useState(() => safeGetItem('last_reviewer_name') || '');
  const [accessCode, setAccessCode] = useState('');
  const [reviewerError, setReviewerError] = useState<string | null>(null);
  const [isReviewerLoading, setIsReviewerLoading] = useState(false);

  useEffect(() => {
    fetchRemoteSimulation().catch(() => {});
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setIsNetworkError(false);

    if (!supabase) {
      handleDemoLogin();
      return;
    }

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;
      safeRemoveItem('local_demo_session');
      onLogin();
    } catch (err: any) {
      console.warn('Erro durante tentativa de login:', err);
      const msg = err?.message || String(err || '');
      
      if (msg.includes('Failed to fetch') || msg.includes('fetch') || msg.includes('NetworkError')) {
        setIsNetworkError(true);
        setError('Não foi possível conectar ao servidor do banco de dados (projeto pausado ou sem conexão com a internet). Você pode entrar pelo Modo Demonstração / Offline abaixo.');
      } else {
        setError(msg || 'Erro ao fazer login. Verifique suas credenciais.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = () => {
    clearSupabaseAuthStorage();
    const demoSession = {
      user: {
        id: 'prof-titular-demo',
        email: email.trim() || 'atilausp011@gmail.com',
        user_metadata: { name: 'Átila Alves' }
      },
      isDemo: true
    };
    safeSetItem('local_demo_session', JSON.stringify(demoSession));
    onLogin();
  };

  const handleReviewerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewerError(null);

    const trimmedName = reviewerName.trim();
    if (!trimmedName) {
      setReviewerError('Informe o seu nome (ex: Prof. Carlos - Física).');
      return;
    }

    const enteredCode = accessCode.trim().toUpperCase();
    if (!enteredCode) {
      setReviewerError('Informe o código de acesso do simulado.');
      return;
    }

    setIsReviewerLoading(true);
    try {
      let currentSim = getStoredSimulation();
      let validCode = String(currentSim?.access_code || 'ENEM2026').trim().toUpperCase();

      if (enteredCode !== validCode) {
        currentSim = await fetchRemoteSimulation();
        validCode = String(currentSim?.access_code || 'ENEM2026').trim().toUpperCase();
      }

      if (enteredCode !== validCode) {
        setReviewerError('Código de acesso inválido. Peça o código correto ao professor coordenador.');
        return;
      }

      // Código válido! Entrar no modo corretor
      safeSetItem('last_reviewer_name', trimmedName);
      onReviewerLogin(trimmedName);
    } catch (err: any) {
      console.warn('Erro durante login do corretor:', err);
      setReviewerError('Não foi possível validar o código agora. Verifique sua conexão e tente novamente.');
    } finally {
      setIsReviewerLoading(false);
    }
  };

  return (
    <div translate="no" className="notranslate min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-800"
      >
        <div className="p-8 bg-brand-blue-dark text-white text-center">
          <div className="w-16 h-16 bg-brand-yellow rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg rotate-3">
            <GraduationCap size={32} className="text-brand-blue-dark" />
          </div>
          <h2 className="text-2xl font-serif font-bold">Educorrige</h2>
          <p className="text-brand-gray text-sm mt-1">Plataforma de Avaliação & Simulado ENEM</p>

          {/* Alternador de Modo de Acesso */}
          <div className="mt-6 p-1 bg-white/10 rounded-2xl flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setMode('admin'); setError(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                mode === 'admin'
                  ? 'bg-brand-yellow text-brand-blue-dark shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <span>Professor Titular</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('reviewer'); setReviewerError(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                mode === 'reviewer'
                  ? 'bg-brand-yellow text-brand-blue-dark shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <FileCheck size={14} />
              <span>Corretor Simulado</span>
            </button>
          </div>
        </div>

        {mode === 'admin' ? (
          /* Formulário do Professor Titular (Login tradicional) */
          <form key="admin-login-form" onSubmit={handleAdminLogin} className="p-8 space-y-6">
            {sessionNotice && !error && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 rounded-2xl text-sm flex items-start gap-3">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <span>{sessionNotice}</span>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 rounded-2xl text-sm space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
                {isNetworkError && (
                  <button
                    type="button"
                    onClick={handleDemoLogin}
                    className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs shadow transition-all"
                  >
                    <span>Entrar no Modo Demonstração / Offline Agora</span>
                  </button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="admin-email" className="text-xs font-bold uppercase text-slate-400 ml-1">E-mail</label>
              <input 
                id="admin-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-yellow transition-all text-sm"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="admin-password" className="text-xs font-bold uppercase text-slate-400 ml-1">Senha</label>
              <input 
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-yellow transition-all text-sm"
              />
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-brand-blue text-white py-4 rounded-2xl font-bold hover:bg-brand-blue-dark transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={20} />}
              <span>Entrar no Sistema</span>
            </button>

            <div className="pt-2 flex flex-col gap-2 text-center">
              <button
                type="button"
                onClick={handleDemoLogin}
                className="text-xs text-slate-500 hover:text-brand-blue dark:hover:text-brand-yellow font-medium transition-colors"
              >
                <span>Ambiente de testes? Clique para entrar no Modo Offline / Demonstração</span>
              </button>

              <button
                type="button"
                onClick={() => { setMode('reviewer'); setReviewerError(null); }}
                className="text-xs text-brand-blue dark:text-brand-yellow font-semibold hover:underline"
              >
                <span>Vai apenas corrigir o Simulado ENEM? Entre via Código aqui.</span>
              </button>
            </div>
          </form>
        ) : (
          /* Formulário de Acesso Rápido do Corretor de Simulado via Código */
          <form key="reviewer-login-form" onSubmit={handleReviewerLogin} className="p-8 space-y-6">
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Key size={14} /> Acesso Simplificado para Correção
              </div>
              <p>Não precisa de e-mail nem de cadastro. Digite seu nome e o código fornecido pela coordenação.</p>
            </div>

            {reviewerError && (
              <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-center gap-3">
                <AlertCircle size={18} className="shrink-0" />
                <span>{reviewerError}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="reviewer-name" className="text-xs font-bold uppercase text-slate-400 ml-1">Seu Nome / Disciplina</label>
              <input 
                id="reviewer-name"
                name="reviewerName"
                type="text"
                autoComplete="name"
                required
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                placeholder="Ex: Prof. Marcelo - Física"
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-yellow transition-all text-sm font-medium"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="reviewer-code" className="text-xs font-bold uppercase text-slate-400 ml-1">Código de Acesso do Simulado</label>
              <input 
                id="reviewer-code"
                name="accessCode"
                type="text"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                required
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                placeholder="Ex: ENEM2026"
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-yellow transition-all font-mono tracking-wider font-bold text-center text-lg uppercase"
              />
            </div>

            <button 
              type="submit"
              disabled={isReviewerLoading}
              className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isReviewerLoading ? <Loader2 className="animate-spin" size={20} /> : <FileCheck size={20} />}
              <span>{isReviewerLoading ? 'Validando Acesso...' : 'Acessar Correção do Simulado'}</span>
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setMode('admin'); setError(null); }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <span>Voltar para o login com e-mail e senha</span>
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
