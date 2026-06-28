'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

interface Log {
  date: string;
  weight: number | null;
  caloriesConsumed: number | null;
  caloriesBurned: number | null;
  trainingType: string;
  sleepHours: number | null;
  waterIntake: number | null;
  stressLevel: number | null;
  mood: string | null;
}

interface Settings {
  currentCalorieTarget: number;
  age: number;
  height: number;
  goal: string;
  weeklyRate: number;
}

export default function Home() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // Form de Onboarding
  const [setupForm, setSetupForm] = useState({ age: '', height: '', weight: '', gender: 'M', activityLevel: '1.375', goal: 'loss', weeklyRate: '-0.5' });
  
  // Form Diário (Padrão para a data de ontem)
  const getYesterdayString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };
  const [logForm, setLogForm] = useState({ date: getYesterdayString(), weight: '', caloriesConsumed: '', caloriesBurned: '', trainingType: 'Descanso', sleepHours: '', waterIntake: '', stressLevel: '3', mood: 'Regular' });
  const [clientMessage, setClientMessage] = useState({ type: '', text: '' });

  async function fetchData() {
    try {
      const resSetup = await fetch('/api/setup');
      const dataSetup = await resSetup.json();
      setSettings(dataSetup);

      const resLogs = await fetch('/api/logs');
      const dataLogs = await resLogs.json();
      setLogs(dataLogs.logs);
      setInsights(dataLogs.insights || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setupForm)
    });
    await fetchData();
  };

  const resetLogForm = () => {
    setLogForm({
      date: getYesterdayString(),
      weight: '',
      caloriesConsumed: '',
      caloriesBurned: '',
      trainingType: 'Descanso',
      sleepHours: '',
      waterIntake: '',
      stressLevel: '3',
      mood: 'Regular',
    });
    setIsEditing(false);
  };

  const handleEditLog = (log: Log) => {
    setLogForm({
      date: log.date,
      weight: log.weight?.toString() || '',
      caloriesConsumed: log.caloriesConsumed?.toString() || '',
      caloriesBurned: log.caloriesBurned?.toString() || '',
      trainingType: log.trainingType,
      sleepHours: log.sleepHours?.toString() || '',
      waterIntake: log.waterIntake?.toString() || '',
      stressLevel: log.stressLevel?.toString() || '3',
      mood: log.mood || 'Regular',
    });
    setIsEditing(true);
    setClientMessage({ type: 'info', text: `Modo de edição ativado para ${log.date}.` });
  };

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Regra de Negócio: Validar o uso máximo de 1 "Dia Livre" nos últimos 7 dias
    if (logForm.trainingType === 'Livre') {
      const last7DaysLogs = logs.slice(0, 7);
      const freeDaysCount = last7DaysLogs.filter(l => l.trainingType === 'Livre' && l.date !== logForm.date).length;
      if (freeDaysCount >= 1) {
        setClientMessage({ type: 'error', text: 'Atenção: Você já utilizou um Dia Livre nos últimos 7 dias. Foque na constância!' });
        return;
      }
    }

    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logForm)
    });

    setClientMessage({ type: 'success', text: isEditing ? 'Registro atualizado com sucesso.' : 'Dados computados com sucesso! O algoritmo recalculou seu progresso.' });
    resetLogForm();
    await fetchData();
  };

  const recentLogs = [...logs].slice(0, 7);
  const recentWeights = recentLogs.map((log) => log.weight).filter((w): w is number => w !== null);
  const recentCalories = recentLogs.map((log) => log.caloriesConsumed).filter((c): c is number => c !== null);
  const recentSleep = recentLogs.map((log) => log.sleepHours).filter((s): s is number => s !== null);
  const recentWater = recentLogs.map((log) => log.waterIntake).filter((w): w is number => w !== null);
  const recentStress = recentLogs.map((log) => log.stressLevel).filter((s): s is number => s !== null);

  const average = (values: number[]) => values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const alerts = [] as string[];

  if (settings && recentCalories.length >= 3) {
    const averageCalories = average(recentCalories);
    if (averageCalories > settings.currentCalorieTarget + 150) {
      alerts.push('A ingestão média está acima da meta. Revisite o planejamento das refeições.');
    } else if (averageCalories < settings.currentCalorieTarget - 150) {
      alerts.push('A ingestão média está abaixo do alvo. Revise a consistência e a recuperação.');
    }
  }

  if (recentSleep.length >= 3) {
    const averageSleep = average(recentSleep);
    if (averageSleep < 7) {
      alerts.push('O sono da semana está abaixo de 7 horas. Isso pode prejudicar a recuperação.');
    }
  }

  if (recentWater.length >= 3) {
    const averageWater = average(recentWater);
    if (averageWater < 2000) {
      alerts.push('A hidratação média está baixa. Um ajuste de água pode melhorar o desempenho.');
    }
  }

  if (recentStress.length >= 3) {
    const averageStress = average(recentStress);
    if (averageStress >= 4) {
      alerts.push('O estresse da semana está alto. Uma rotina mais leve pode ajudar.');
    }
  }

  if (recentWeights.length === 0) {
    alerts.push('Ainda não há pesos recentes para avaliar a tendência.');
  }

  // Preparação de dados para gráficos com Média Móvel de Peso de 7 dias
  const chartData = [...logs].reverse().map((log, index, arr) => {
    const windowSlice = arr.slice(Math.max(0, index - 6), index + 1);
    const validWeights = windowSlice.map(l => l.weight).filter((w): w is number => w !== null);
    const movingAvg = validWeights.length > 0 ? (validWeights.reduce((a, b) => a + b, 0) / validWeights.length).toFixed(2) : null;

    return {
      data: log.date.substring(5, 10).replace('-', '/'),
      'Peso Real': log.weight,
      'Média Móvel': movingAvg ? parseFloat(movingAvg) : null,
      'Consumo Ingerido': log.caloriesConsumed,
      'Meta Diária': settings?.currentCalorieTarget,
      'Gasto Exercício': log.caloriesBurned || 0
    };
  });

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-xl">Carregando dados metabólicos...</div>;
  }

  // Se o usuário não passou pelo Setup Inicial, renderiza o Onboarding Formulário Clínico
  if (!settings) {
    return (
      <div className="max-w-md mx-auto my-12 bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
        <h1 className="text-2xl font-bold mb-2 text-indigo-400">Configuração Inicial</h1>
        <p className="text-slate-400 text-sm mb-6">Insira seus dados para calibrar o ponto de partida ideal da sua taxa de TDEE.</p>
        <form onSubmit={handleSetupSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase text-slate-400 mb-1">Idade</label>
            <input required type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={setupForm.age} onChange={e => setSetupForm({...setupForm, age: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-400 mb-1">Altura (cm)</label>
            <input required type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={setupForm.height} onChange={e => setSetupForm({...setupForm, height: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-400 mb-1">Peso Atual (kg)</label>
            <input required type="number" step="0.1" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={setupForm.weight} onChange={e => setSetupForm({...setupForm, weight: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-400 mb-1">Sexo Biológico</label>
            <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={setupForm.gender} onChange={e => setSetupForm({...setupForm, gender: e.target.value})}>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-400 mb-1">Fator de Atividade</label>
            <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={setupForm.activityLevel} onChange={e => setSetupForm({...setupForm, activityLevel: e.target.value})}>
              <option value="1.2">Sedentário (Pouco ou nenhum exercício)</option>
              <option value="1.375">Levemente Ativo (Exercício leve 1-3 dias/sem)</option>
              <option value="1.55">Moderadamente Ativo (Exercício moderado 3-5 dias/sem)</option>
              <option value="1.725">Altamente Ativo (Treino pesado diário ou híbrido constante)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-400 mb-1">Objetivo Primário</label>
            <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={setupForm.goal} onChange={e => setSetupForm({...setupForm, goal: e.target.value})}>
              <option value="loss">Definição / Perda de Peso (Déficit)</option>
              <option value="maintenance">Manutenção Metabólica (Homeostase)</option>
              <option value="gain">Hipertrofia / Ganho de Massa (Superávit)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-400 mb-1">Ritmo Semanal Esperado (kg)</label>
            <input required type="number" step="0.05" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={setupForm.weeklyRate} onChange={e => setSetupForm({...setupForm, weeklyRate: e.target.value})} />
          </div>
          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold p-3 rounded-lg transition-colors mt-2">Calcular Meu Ponto de Partida</button>
        </form>
      </div>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8">
      {/* Top Banner */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">Metabolic Tracker</h1>
          <p className="text-slate-400 text-sm mt-1">Sincronização cross-device ativada na infraestrutura Vercel.</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700/50 px-5 py-3 rounded-xl text-center">
          <span className="text-xs uppercase text-slate-400 block tracking-wider">Meta Calórica Atual</span>
          <span className="text-2xl font-black text-emerald-400">{settings.currentCalorieTarget} kcal</span>
        </div>
      </div>
      <section className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-200 mb-4">💡 Insights Automáticos</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <p className="text-xs uppercase text-slate-400">Média de calorias</p>
            <p className="text-xl font-semibold text-emerald-400">{recentCalories.length > 0 ? `${Math.round(average(recentCalories))} kcal` : '—'}</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <p className="text-xs uppercase text-slate-400">Sono médio</p>
            <p className="text-xl font-semibold text-sky-400">{recentSleep.length > 0 ? `${average(recentSleep).toFixed(1)}h` : '—'}</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <p className="text-xs uppercase text-slate-400">Água média</p>
            <p className="text-xl font-semibold text-cyan-400">{recentWater.length > 0 ? `${Math.round(average(recentWater))} ml` : '—'}</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
            <p className="text-xs uppercase text-slate-400">Tendência de peso</p>
            <p className="text-xl font-semibold text-amber-400">{recentWeights.length >= 2 ? `${(recentWeights[recentWeights.length - 1] - recentWeights[0]).toFixed(1)} kg` : '—'}</p>
          </div>
        </div>
        <div className="space-y-3">
          {insights.length > 0 ? (
            insights.map((insight, index) => (
              <p key={index} className="text-slate-300 text-sm leading-6">• {insight}</p>
            ))
          ) : (
            <p className="text-slate-500 text-sm">Ainda não há insights suficientes. Registre mais dias para receber recomendações.</p>
          )}
        </div>
      </section>

      {/* Grid de Inputs e Mensagens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section className="bg-slate-800 border border-slate-700 p-6 rounded-2xl shadow-sm h-fit">
          <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">📝 Log Diário</h2>
          
          {clientMessage.text && (
            <div className={`p-3 rounded-lg text-sm mb-4 font-medium ${clientMessage.type === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
              {clientMessage.text}
            </div>
          )}

          {alerts.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm font-semibold text-amber-300 mb-2">Alertas ativos</p>
              <ul className="space-y-1 text-sm text-amber-100/90">
                {alerts.map((alert, index) => (
                  <li key={index}>• {alert}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleLogSubmit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase text-slate-400 mb-1">Data de Referência</label>
              <input type="date" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={logForm.date} onChange={e => setLogForm({...logForm, date: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs uppercase text-slate-400 mb-1">Peso (kg) <span className="text-slate-500 font-normal">(deixar vazio se esqueceu)</span></label>
              <input type="number" step="0.1" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={logForm.weight} onChange={e => setLogForm({...logForm, weight: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs uppercase text-slate-400 mb-1">Ingestão Calórica (kcal) <span className="text-slate-500 font-normal">(vazio se esqueceu)</span></label>
              <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={logForm.caloriesConsumed} onChange={e => setLogForm({...logForm, caloriesConsumed: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs uppercase text-slate-400 mb-1">Gasto de Exercício Ativo (kcal)</label>
              <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={logForm.caloriesBurned} onChange={e => setLogForm({...logForm, caloriesBurned: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs uppercase text-slate-400 mb-1">Natureza do Dia</label>
              <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={logForm.trainingType} onChange={e => setLogForm({...logForm, trainingType: e.target.value})}>
                <option value="Descanso">Descanso / Repouso</option>
                <option value="Musculação">Treino de Musculação / Força</option>
                <option value="Corrida">Sessão de Corrida / Cardio</option>
                <option value="Híbrido">Dia Híbrido (Força + Cardio)</option>
                <option value="Livre">Dia Livre (Refeição Fora/Off)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase text-slate-400 mb-1">Sono (horas)</label>
              <input type="number" step="0.1" min="0" max="24" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={logForm.sleepHours} onChange={e => setLogForm({...logForm, sleepHours: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs uppercase text-slate-400 mb-1">Hidratação (ml)</label>
              <input type="number" min="0" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={logForm.waterIntake} onChange={e => setLogForm({...logForm, waterIntake: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs uppercase text-slate-400 mb-1">Estresse</label>
              <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={logForm.stressLevel} onChange={e => setLogForm({...logForm, stressLevel: e.target.value})}>
                <option value="1">1 — Muito baixo</option>
                <option value="2">2 — Baixo</option>
                <option value="3">3 — Moderado</option>
                <option value="4">4 — Alto</option>
                <option value="5">5 — Muito alto</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase text-slate-400 mb-1">Humor</label>
              <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white" value={logForm.mood} onChange={e => setLogForm({...logForm, mood: e.target.value})}>
                <option value="Ótimo">Ótimo</option>
                <option value="Bom">Bom</option>
                <option value="Regular">Regular</option>
                <option value="Ruim">Ruim</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold p-3 rounded-lg transition-colors shadow-lg">{isEditing ? 'Atualizar Registro' : 'Salvar Dados'}</button>
              <button type="button" onClick={resetLogForm} className="px-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors">Novo</button>
            </div>
          </form>
        </section>

        {/* Dashboards e Gráficos */}
        <div className="lg:col-span-2 space-y-8">
          {/* Gráfico 1: Peso Real vs Média Móvel */}
          <div className="bg-slate-800 border border-slate-700 p-4 sm:p-6 rounded-2xl h-80 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Tendência de Peso Corpóreo (Média Móvel de 7 Dias)</h3>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="data" stroke="#94a3b8" />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }} />
                <Legend />
                <ReferenceLine y={settings?.currentCalorieTarget} stroke="#f87171" strokeDasharray="3 3" label="Meta" />
                <Line type="monotone" dataKey="Média Móvel" stroke="#60a5fa" strokeWidth={3} dot={false} connectNulls />
                <Line type="linear" dataKey="Peso Real" stroke="#475569" strokeWidth={1} strokeDasharray="4 4" connectNulls dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico 2: Balanço de Calorias Ingeridas vs Meta */}
          <div className="bg-slate-800 border border-slate-700 p-4 sm:p-6 rounded-2xl h-80 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Adesão Calórica Diária vs Teto do Modelo Adaptativo</h3>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="data" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }} />
                <Legend />
                <ReferenceLine y={settings?.currentCalorieTarget} stroke="#f87171" strokeDasharray="3 3" label="Meta" />
                <Bar dataKey="Consumo Ingerido" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={40} name="Ingerido (kcal)" />
                <Bar dataKey="Gasto Exercício" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={40} name="Gasto Treino (kcal)" />
                <Line type="monotone" dataKey="Meta Diária" stroke="#f87171" strokeWidth={2} dot={false} name="Meta do App" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Histórico Recente */}
      <section className="bg-slate-800 border border-slate-700 rounded-2xl p-6 overflow-hidden shadow-sm">
        <h3 className="text-lg font-bold text-slate-200 mb-4">Histórico Recente (Últimos Registros)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="text-xs uppercase bg-slate-900/50 text-slate-400 border-b border-slate-700">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Peso</th>
                <th className="p-3">Consumo</th>
                <th className="p-3">Gasto Exercício</th>
                <th className="p-3">Sono</th>
                <th className="p-3">Água</th>
                <th className="p-3">Estresse</th>
                <th className="p-3">Humor</th>
                <th className="p-3">Tipo de Rotina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {logs.map((log) => (
                <tr key={log.date} className="hover:bg-slate-700/30 transition-colors">
                  <td className="p-3 font-medium text-slate-400">{log.date}</td>
                  <td className="p-3 text-white">{log.weight ? `${log.weight} kg` : <span className="text-slate-600">— Esquecido</span>}</td>
                  <td className="p-3 text-white">{log.caloriesConsumed ? `${log.caloriesConsumed} kcal` : <span className="text-slate-600">— Esquecido</span>}</td>
                  <td className="p-3 text-amber-400">{log.caloriesBurned ? `+${log.caloriesBurned} kcal` : '0 kcal'}</td>
                  <td className="p-3 text-white">{log.sleepHours ? `${log.sleepHours}h` : <span className="text-slate-600">—</span>}</td>
                  <td className="p-3 text-white">{log.waterIntake ? `${log.waterIntake} ml` : <span className="text-slate-600">—</span>}</td>
                  <td className="p-3 text-white">{log.stressLevel ? log.stressLevel : <span className="text-slate-600">—</span>}</td>
                  <td className="p-3 text-white">{log.mood || <span className="text-slate-600">—</span>}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                        log.trainingType === 'Híbrido' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                        log.trainingType === 'Musculação' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        log.trainingType === 'Corrida' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        log.trainingType === 'Livre' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                        'bg-slate-600/10 text-slate-400 border border-slate-600/20'
                      }`}>
                        {log.trainingType}
                      </span>
                      <button type="button" onClick={() => handleEditLog(log)} className="text-xs text-indigo-300 hover:text-indigo-200">Editar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
