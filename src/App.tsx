import React, { useState, useEffect } from 'react';
import { 
  Users, 
  FileText, 
  CheckSquare, 
  BarChart3, 
  Settings, 
  GraduationCap,
  PlusCircle,
  Upload,
  Search,
  ChevronRight,
  Menu,
  X,
  LayoutDashboard,
  AlertTriangle,
  BookOpen,
  Loader2,
  LogOut,
  Moon,
  Sun,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { supabase } from './lib/supabase';

// Views
import Dashboard from './views/Dashboard';
import ClassesView from './views/ClassesView';
import AnswerKeysView from './views/AnswerKeysView';
import GradingView from './views/GradingView';
import ReportsView from './views/ReportsView';
import ManagementView from './views/ManagementView';
import NotebookChecksView from './views/NotebookChecksView';
import SystemTestsView from './views/SystemTestsView';
import EnemSimuladoView from './views/EnemSimuladoView';
import Login from './components/Login';

type View = 'dashboard' | 'classes' | 'answer-keys' | 'grading' | 'notebook-checks' | 'enem' | 'reports' | 'management' | 'tests';

export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [session, setSession] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      const demo = localStorage.getItem('local_demo_session');
      if (demo) {
        try {
          return JSON.parse(demo);
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  });
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  // Sessão de Corretor Convidado (via código de acesso)
  const [reviewerSession, setReviewerSession] = useState<{ reviewerName: string } | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('enem_reviewer_session');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  });

  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const isSupabaseConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession()
        .then(({ data: { session } }) => {
          if (session) {
            setSession(session);
          }
          setIsAuthLoading(false);
        })
        .catch(err => {
          console.warn('Falha na conexão com Supabase Auth (possível offline):', err);
          setIsAuthLoading(false);
        });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setSession(session);
        }
      });

      seedUnits();

      return () => {
        subscription.unsubscribe();
      };
    } else {
      setIsAuthLoading(false);
    }
  }, [isSupabaseConfigured]);

  async function seedUnits() {
    if (!supabase) return;

    try {
      const { data: existingUnits } = await supabase.from('units').select('*');
      if (existingUnits && existingUnits.length === 0) {
        await supabase.from('units').insert([
          { name: 'Unidade 1' },
          { name: 'Unidade 2' },
          { name: 'Unidade 3' }
        ]);
      }
    } catch (e) {
      console.warn('Não foi possível verificar unidades iniciais (offline):', e);
    }
  }

  const handleAdminLogout = async () => {
    localStorage.removeItem('local_demo_session');
    setSession(null);
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.warn('Erro ao sair do Supabase:', e);
    }
  };

  const handleReviewerLogin = (name: string) => {
    const revObj = { reviewerName: name };
    setReviewerSession(revObj);
    localStorage.setItem('enem_reviewer_session', JSON.stringify(revObj));
  };

  const handleLogoutReviewer = () => {
    setReviewerSession(null);
    localStorage.removeItem('enem_reviewer_session');
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-blue" size={40} />
      </div>
    );
  }

  // Se o professor entrou como Corretor Convidado via Código de Acesso
  if (reviewerSession) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col transition-colors duration-300">
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-4 sm:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-yellow flex items-center justify-center shadow-md">
              <Award className="text-brand-blue-dark" size={22} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-serif font-bold text-brand-blue-dark dark:text-white leading-tight">
                Simulado ENEM
              </h1>
              <p className="text-xs text-slate-400">
                Corretor: <strong className="text-brand-blue dark:text-brand-yellow">{reviewerSession.reviewerName}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-brand-yellow hover:bg-slate-100 dark:hover:bg-slate-750 transition-all flex items-center gap-2"
              title={darkMode ? "Modo Claro" : "Modo Noturno"}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              onClick={handleLogoutReviewer}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/60 font-semibold text-xs transition-all border border-rose-200 dark:border-rose-900"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sair do Portal</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full">
          <EnemSimuladoView 
            isReviewerMode={true} 
            reviewerName={reviewerSession.reviewerName} 
            onExitReviewerMode={handleLogoutReviewer} 
          />
        </main>
      </div>
    );
  }

  // Se não estiver logado com e-mail/senha e nem for corretor
  if (!session) {
    return <Login onLogin={() => {}} onReviewerLogin={handleReviewerLogin} />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'classes', label: 'Turmas', icon: Users },
    { id: 'answer-keys', label: 'Gabaritos', icon: FileText },
    { id: 'grading', label: 'Correção', icon: CheckSquare },
    { id: 'notebook-checks', label: 'Vistos', icon: BookOpen },
    { id: 'enem', label: 'Simulado ENEM', icon: Award },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'management', label: 'Gestão', icon: GraduationCap },
    { id: 'tests', label: 'Testes', icon: AlertTriangle },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden relative transition-colors duration-300">
      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 280 : (window.innerWidth < 1024 ? 0 : 80),
          x: isSidebarOpen ? 0 : (window.innerWidth < 1024 ? -280 : 0)
        }}
        className={cn(
          "bg-brand-blue-dark text-white flex flex-col shadow-2xl z-40 fixed lg:relative h-full transition-all duration-300",
          !isSidebarOpen && window.innerWidth < 1024 && "pointer-events-none"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          {(isSidebarOpen || window.innerWidth >= 1024) && (
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: isSidebarOpen ? 1 : 0 }}
              className={cn(
                "text-xl font-serif font-bold tracking-tight text-brand-yellow truncate",
                !isSidebarOpen && "hidden"
              )}
            >
              3 em 1 Correções
            </motion.h1>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveView(item.id as View);
                if (window.innerWidth < 1024) setIsSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-4 p-3 rounded-xl transition-all duration-200 group",
                activeView === item.id 
                  ? "bg-brand-yellow text-brand-blue-dark font-semibold shadow-lg" 
                  : "hover:bg-white/5 text-brand-gray"
              )}
            >
              <item.icon size={22} className={cn(activeView === item.id ? "text-brand-blue-dark" : "group-hover:text-white")} />
              {(isSidebarOpen || (window.innerWidth < 1024 && isSidebarOpen)) && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(!isSidebarOpen && "lg:hidden")}
                >
                  {item.label}
                </motion.span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className={cn("flex items-center gap-3 p-2", !isSidebarOpen && "justify-center")}>
            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center border-2 border-brand-yellow shadow-inner shrink-0 transition-colors">
              <img 
                src="/perfil.jpg" 
                alt="Átila Alves"
                className="w-full h-full object-cover"
              />
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate text-white">Átila Alves</p>
                <p className="text-xs text-brand-gray truncate">Professor</p>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-white/10">
            <button 
              onClick={handleAdminLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all"
            >
              <LogOut size={20} />
              {isSidebarOpen && <span>Sair</span>}
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative w-full">
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-4 sm:p-6 flex items-center justify-between transition-colors duration-300">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg lg:hidden"
            >
              <Menu size={20} className="text-brand-blue-dark dark:text-brand-gray" />
            </button>
            <h2 className="text-lg sm:text-xl font-serif font-bold text-brand-blue-dark dark:text-brand-yellow">
              {navItems.find(i => i.id === activeView)?.label}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-brand-yellow hover:bg-slate-100 dark:hover:bg-slate-750 transition-all flex items-center gap-2 group"
              title={darkMode ? "Ativar Modo Claro" : "Ativar Modo Escuro"}
            >
              {darkMode ? (
                <>
                  <Sun size={18} className="group-hover:rotate-45 transition-transform" />
                  <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest">Claro</span>
                </>
              ) : (
                <>
                  <Moon size={18} className="group-hover:-rotate-12 transition-transform" />
                  <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest">Noturno</span>
                </>
              )}
            </button>
            {!isSupabaseConfigured && (
              <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg text-amber-700 dark:text-amber-400 text-sm animate-pulse">
                <AlertTriangle size={18} />
                <span>Configuração pendente</span>
              </div>
            )}
          </div>
        </header>

        <div className="p-4 sm:p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {activeView === 'dashboard' && <Dashboard />}
              {activeView === 'classes' && <ClassesView />}
              {activeView === 'answer-keys' && <AnswerKeysView />}
              {activeView === 'grading' && <GradingView />}
              {activeView === 'notebook-checks' && <NotebookChecksView />}
              {activeView === 'enem' && <EnemSimuladoView isReviewerMode={false} />}
              {activeView === 'reports' && <ReportsView />}
              {activeView === 'management' && <ManagementView />}
              {activeView === 'tests' && <SystemTestsView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
