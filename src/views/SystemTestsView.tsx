import React, { useState } from 'react';
import { 
  Database, 
  Cpu, 
  Key, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Play,
  FileSearch,
  MessageSquare,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ai, GEMINI_MODEL } from '../lib/gemini';
import { Type } from '@google/genai';

export default function SystemTestsView() {
  const [tests, setTests] = useState<{
    db: { status: 'idle' | 'running' | 'pass' | 'fail', message: string },
    api: { status: 'idle' | 'running' | 'pass' | 'fail', message: string },
    ai: { status: 'idle' | 'running' | 'pass' | 'fail', message: string },
    pdf: { status: 'idle' | 'running' | 'pass' | 'fail', message: string }
  }>({
    db: { status: 'idle', message: '' },
    api: { status: 'idle', message: '' },
    ai: { status: 'idle', message: '' },
    pdf: { status: 'idle', message: '' }
  });

  const runDbTest = async () => {
    setTests(prev => ({ ...prev, db: { status: 'running', message: 'Testando conexão...' } }));
    try {
      const { data, error } = await supabase.from('assessments').select('count', { count: 'exact', head: true });
      if (error) throw error;
      setTests(prev => ({ ...prev, db: { status: 'pass', message: 'Conexão estabelecida com sucesso!' } }));
    } catch (err: any) {
      console.error('DB Test detailed error:', err);
      if (err.message === 'Failed to fetch') {
        setTests(prev => ({ ...prev, db: { status: 'fail', message: `Erro: Failed to fetch (Verifique VITE_SUPABASE_URL e sua internet)` } }));
      } else {
        setTests(prev => ({ ...prev, db: { status: 'fail', message: `Erro: ${err.message}` } }));
      }
    }
  };

  const runApiTest = async () => {
    setTests(prev => ({ ...prev, api: { status: 'running', message: 'Verificando chaves...' } }));
    
    const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
    const processKey = process.env.GEMINI_API_KEY;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    // Check which one is populated
    const hasVite = viteKey && viteKey.trim() !== '' && viteKey !== 'undefined' && viteKey !== 'null';
    const hasProcess = processKey && processKey.trim() !== '' && processKey !== 'undefined' && processKey !== 'null';
    const hasSupabase = supabaseUrl && supabaseKey;

    if (!hasVite && !hasProcess) {
      setTests(prev => ({ ...prev, api: { status: 'fail', message: 'Falta: GEMINI_API_KEY' } }));
      return;
    }
    
    if (!hasSupabase) {
       setTests(prev => ({ ...prev, api: { status: 'fail', message: 'Falta: VITE_SUPABASE_URL ou KEY (Obrigatório para o DB)' } }));
       return;
    }
    
    setTests(prev => ({ ...prev, api: { status: 'pass', message: 'Chaves detectadas com sucesso.' } }));
  };

  const runAiTest = async () => {
    setTests(prev => ({ ...prev, ai: { status: 'running', message: 'Processando prompt...' } }));
    try {
      if (!ai) throw new Error("IA não disponível. Verifique a chave API.");
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          role: 'user',
          parts: [{ text: "Diga 'OK' se você estiver funcionando." }]
        }]
      });
      const text = response.text || '';
      if (text.includes('OK')) {
        setTests(prev => ({ ...prev, ai: { status: 'pass', message: `IA respondeu: ${text}` } }));
      } else {
        setTests(prev => ({ ...prev, ai: { status: 'pass', message: `IA respondeu, mas não o esperado: ${text}` } }));
      }
    } catch (err: any) {
      console.error('AI Test detailed error:', err);
      // Log more details if it's a fetch error
      if (err.message === 'Failed to fetch') {
        setTests(prev => ({ ...prev, ai: { status: 'fail', message: 'Erro: Failed to fetch (Possível problema de rede ou CORS)' } }));
      } else {
        setTests(prev => ({ ...prev, ai: { status: 'fail', message: `Erro: ${err.message}` } }));
      }
    }
  };

  const runAllTests = async () => {
    await runDbTest();
    await runApiTest();
    await runAiTest();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-serif font-bold text-brand-blue-dark dark:text-brand-yellow transition-colors">Diagnóstico do Sistema</h3>
          <p className="text-slate-500 dark:text-slate-400 transition-colors">Ferramentas de teste para verificar a saúde das conexões e integrações.</p>
        </div>
        <button 
          onClick={runAllTests}
          className="flex items-center gap-2 bg-brand-blue text-white px-6 py-3 rounded-xl font-bold hover:bg-brand-blue-dark transition-all shadow-md"
        >
          <Play size={20} />
          Executar Todos os Testes
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* DB Card */}
        <TestCard 
          title="Banco de Dados (Supabase)"
          icon={<Database size={24} />}
          status={tests.db.status}
          message={tests.db.message}
          onRun={runDbTest}
        />

        {/* API Key Card */}
        <TestCard 
          title="Configuração de API"
          icon={<Key size={24} />}
          status={tests.api.status}
          message={tests.api.message}
          onRun={runApiTest}
        />

        {/* AI Integration Card */}
        <TestCard 
          title={`Integração IA (${GEMINI_MODEL})`}
          icon={<Cpu size={24} />}
          status={tests.ai.status}
          message={tests.ai.message}
          onRun={runAiTest}
        />

        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-6 rounded-2xl flex gap-4 transition-colors">
          <AlertTriangle className="text-amber-500 dark:text-amber-400 shrink-0" size={24} />
          <div>
            <h4 className="font-bold text-amber-900 dark:text-amber-300 mb-1">Dica de Debug de PDF</h4>
            <p className="text-sm text-amber-800 dark:text-amber-400/80">
              Se a extração de gabarito falhar, certifique-se de que o PDF não está protegido por senha e que o texto é selecionável (não é uma imagem pura).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TestCard({ title, icon, status, message, onRun }: any) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-brand-blue dark:text-brand-yellow transition-colors">
            {icon}
          </div>
          <div>
            <h4 className="font-bold text-brand-blue-dark dark:text-brand-yellow transition-colors">{title}</h4>
            <StatusBadge status={status} />
          </div>
        </div>
        <button 
          onClick={onRun}
          disabled={status === 'running'}
          className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500 hover:text-brand-blue dark:hover:text-brand-yellow transition-all"
        >
          <Play size={18} />
        </button>
      </div>
      
      {message && (
        <div className={`p-3 rounded-xl text-sm font-medium transition-colors ${
          status === 'pass' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400' : 
          status === 'fail' ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400' : 
          'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pass': return <div className="flex items-center gap-1 text-emerald-500 dark:text-emerald-400 text-xs font-bold uppercase mt-1"><CheckCircle2 size={14} /> Operacional</div>;
    case 'fail': return <div className="flex items-center gap-1 text-red-500 dark:text-red-400 text-xs font-bold uppercase mt-1 transition-colors"><XCircle size={14} /> Falha</div>;
    case 'running': return <div className="flex items-center gap-1 text-brand-blue dark:text-brand-yellow text-xs font-bold uppercase mt-1 transition-colors"><Loader2 size={14} className="animate-spin" /> Testando...</div>;
    default: return <div className="text-slate-400 dark:text-slate-600 text-xs font-bold uppercase mt-1 transition-colors">Aguardando</div>;
  }
}
