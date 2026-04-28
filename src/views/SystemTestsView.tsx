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
      setTests(prev => ({ ...prev, db: { status: 'fail', message: `Erro: ${err.message}` } }));
    }
  };

  const runApiTest = async () => {
    setTests(prev => ({ ...prev, api: { status: 'running', message: 'Verificando chave...' } }));
    
    const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
    const processKey = process.env.GEMINI_API_KEY;
    
    const key = (viteKey && viteKey !== 'undefined' && viteKey !== 'null' && viteKey !== '') ? viteKey : 
                (processKey && processKey !== 'undefined' && processKey !== 'null' && processKey !== '') ? processKey : null;

    if (!key) {
      setTests(prev => ({ ...prev, api: { status: 'fail', message: 'Chave API não encontrada. No Vercel, use VITE_GEMINI_API_KEY.' } }));
      return;
    }
    setTests(prev => ({ ...prev, api: { status: 'pass', message: `Chave detectada (${viteKey ? 'VITE_' : 'Global'}).` } }));
  };

  const runAiTest = async () => {
    setTests(prev => ({ ...prev, ai: { status: 'running', message: 'Processando prompt...' } }));
    try {
      if (!ai) throw new Error("IA não disponível. Verifique a chave API.");
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: "Diga 'OK' se você estiver funcionando."
      });
      const text = response.text || '';
      if (text.includes('OK')) {
        setTests(prev => ({ ...prev, ai: { status: 'pass', message: `IA respondeu: ${text}` } }));
      } else {
        setTests(prev => ({ ...prev, ai: { status: 'pass', message: `IA respondeu, mas não o esperado: ${text}` } }));
      }
    } catch (err: any) {
      setTests(prev => ({ ...prev, ai: { status: 'fail', message: `Erro: ${err.message}` } }));
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
          <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Diagnóstico do Sistema</h3>
          <p className="text-slate-500">Ferramentas de teste para verificar a saúde das conexões e integrações.</p>
        </div>
        <button 
          onClick={runAllTests}
          className="flex items-center gap-2 bg-brand-blue text-white px-6 py-3 rounded-xl font-bold hover:bg-brand-blue-dark transition-all"
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

        <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl flex gap-4">
          <AlertTriangle className="text-amber-500 shrink-0" size={24} />
          <div>
            <h4 className="font-bold text-amber-900 mb-1">Dica de Debug de PDF</h4>
            <p className="text-sm text-amber-800">
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
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-50 rounded-xl text-brand-blue">
            {icon}
          </div>
          <div>
            <h4 className="font-bold text-brand-blue-dark">{title}</h4>
            <StatusBadge status={status} />
          </div>
        </div>
        <button 
          onClick={onRun}
          disabled={status === 'running'}
          className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-brand-blue transition-all"
        >
          <Play size={18} />
        </button>
      </div>
      
      {message && (
        <div className={`p-3 rounded-xl text-sm font-medium ${
          status === 'pass' ? 'bg-emerald-50 text-emerald-700' : 
          status === 'fail' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pass': return <div className="flex items-center gap-1 text-emerald-500 text-xs font-bold uppercase mt-1"><CheckCircle2 size={14} /> Operacional</div>;
    case 'fail': return <div className="flex items-center gap-1 text-red-500 text-xs font-bold uppercase mt-1"><XCircle size={14} /> Falha</div>;
    case 'running': return <div className="flex items-center gap-1 text-brand-blue text-xs font-bold uppercase mt-1"><Loader2 size={14} className="animate-spin" /> Testando...</div>;
    default: return <div className="text-slate-400 text-xs font-bold uppercase mt-1">Aguardando</div>;
  }
}
