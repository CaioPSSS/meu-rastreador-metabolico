# 📘 Documentação Técnica: Metabolic Tracker

Esta documentação serve como o guia definitivo de arquitetura, regras de negócio e infraestrutura para desenvolvedores humanos e agentes autônomos de IA (como GitHub Copilot, Cursor, etc.) que assumirem a manutenção deste projeto.

---

## 🤖 DIRETIVAS CRÍTICAS PARA AGENTES DE IA (SYSTEM CONTEXT)
**Para qualquer IA lendo este repositório antes de gerar código:**
1. **NÃO ATUALIZE O PRISMA PARA A VERSÃO 6 OU 7.** O projeto está intencionalmente fixado na versão `^5.x`. O Vercel Postgres e nossa configuração de schema não suportam a sintaxe de `url` e `directUrl` das versões mais recentes do Prisma sem um `prisma.config.ts`. Mantenha a v5.
2. **NÃO ALTERE O SCRIPT DE BUILD.** O script correto no `package.json` deve ser estritamente `"build": "prisma db push && next build"`. Como usamos o Vercel Postgres (Neon) serverless, as tabelas precisam ser sincronizadas a cada deploy.
3. **MANTENHA A CHAVE PRIMÁRIA COMO STRING.** O campo `date` no modelo `DailyLog` é uma `String` (formato ISO `YYYY-MM-DD`). Não mude para `DateTime`. Isso previne bugs globais de fuso horário, garantindo que o dia registrado no celular seja o mesmo salvo no banco de dados.

---

## 🏗️ 1. Visão Geral da Arquitetura e Stack

A aplicação é um rastreador metabólico Full-Stack desenhado para tolerar falhas (dados parciais/dias esquecidos) e calcular o Gasto Energético Total (TDEE) real e empírico do usuário.

* **Front-end / Back-end:** Next.js 14+ (App Router).
* **Banco de Dados:** Vercel Postgres (Engine: Neon Serverless PostgreSQL).
* **ORM:** Prisma Client (v5.x).
* **Gráficos:** Recharts (Renderização SVG responsiva no cliente).
* **Estilização:** Tailwind CSS.
* **Hospedagem:** Vercel (Ambiente Serverless).
* **Fluxo principal:** onboarding inicial → cadastro de logs diários → recalculo adaptativo da meta → exibição de dashboards e insights.

### Estrutura de pastas importante
* `app/` — rotas da aplicação, incluindo páginas e APIs.
* `app/api/logs/route.ts` — endpoint para leitura e escrita de logs diários.
* `app/api/setup/route.ts` — onboarding e salvamento das preferências do usuário.
* `lib/metabolicAlgo.ts` — motor de cálculo de metas e insights.
* `prisma/schema.prisma` — modelo de dados usado pelo Prisma.
* `public/` — arquivos estáticos e assets públicos.

---

## 🗄️ 2. Estrutura do Banco de Dados (Prisma Schema)

O banco é projetado para aceitar lacunas de dados. Campos como `weight` e `caloriesConsumed` são opcionais (`Float?`, `Int?`).

### Modelo `UserSettings` (Singleton)
Armazena a configuração clínica e a meta calórica atualizada pelo algoritmo.
* `id`: Fixo como `"singleton"`.
* `age`, `height`, `gender`, `activityLevel`: Usados para o cálculo heurístico (Mifflin-St Jeor).
* `goal`: `"loss"`, `"maintenance"`, `"gain"`.
* `weeklyRate`: Ritmo de progressão esperado (ex: `-0.5` kg).
* `currentCalorieTarget`: Meta atual (atualizada dinamicamente pelo motor metabólico).
* `createdAt` e `updatedAt`: auditoria básica.

### Modelo `DailyLog` (Série Temporal)
* `date`: `String` (PK) no formato `YYYY-MM-DD`.
* `weight`: `Float?` (Peso matinal).
* `caloriesConsumed`: `Int?` (Ingestão).
* `caloriesBurned`: `Int?` (Gasto em exercícios).
* `trainingType`: `String` (Tags de esforço: "Descanso", "Musculação", "Corrida", "Híbrido", "Livre").
* `sleepHours`: `Float?` (Horas de sono reportadas).
* `waterIntake`: `Int?` (Hidratação em ml).
* `stressLevel`: `Int?` (Nível subjetivo de estresse de 1 a 5).
* `mood`: `String?` (Humor diário: "Ótimo", "Bom", "Regular", "Ruim").
* `proteinConsumed`: `Int?` (Proteína consumida em gramas, novo).
* `waistCircumference`: `Float?` (Circunferência da cintura em cm, novo rastreador de composição).
* `createdAt`: timestamp de criação.

### Regras de integridade importantes
* Nunca trocar `date` para `DateTime`.
* Nunca remover campos opcionais sem considerar compatibilidade com dados antigos.
* Sempre manter o `id` do `UserSettings` como `singleton`.

---

## 🧠 3. O Motor Metabólico (`lib/metabolicAlgo.ts`)

A lógica central da aplicação resolve o problema das fórmulas de internet (que erram muito) usando os próprios dados do usuário. Opera em duas fases:

### Funções principais
* `calculateInitialTarget(data)` — calcula a meta inicial com base em Mifflin-St Jeor e objetivo desejado.
* `recalculateAdaptiveTarget(logs, settings)` — recalcula a meta quando há dados suficientes.
* `generateInsights(logs, settings)` — cria recomendações semanais com base em ingestão, sono, água, estresse e humor.

### Fase 1: Cálculo Base (Heurística de Mifflin-St Jeor)
Quando há **menos de 14 dias** de logs, a aplicação calcula o basal clínico:
`TMB = (10 * Peso) + (6.25 * Altura) - (5 * Idade) + Constante` (onde Constante é +5 p/ Homem, -161 p/ Mulher).
Aplica-se o fator de atividade e soma-se o déficit/superávit do objetivo (assumindo que 1kg corporais = 7700 kcal).

### Fase 2: Cálculo Empírico Adaptativo e Insights
Quando a base de dados atinge **14 registros (2 semanas flutuantes)**, o algoritmo passa a ajustar a meta com base no comportamento real e nas tendências de progresso.
1. Substitui o bloco rígido de semana 1 vs. semana 2 por uma regressão linear de pesos válidos nos últimos 14 a 21 dias.
2. Calcula a inclinação da reta de mínimos quadrados para estimar a variação diária de peso (`kg/dia`), eliminando ruído de flutuações de glicogênio e água.
3. Converte essa tendência em energia real: `Delta_Energia = (Trend_kg_per_day * 7700)`.
4. Define o **TDEE Empírico** como `Calorias_Ingeridas_Média - Delta_Energia`.
5. Usa `caloriesBurned` apenas para insights comportamentais e crédito dinâmico de exercício, não para o cálculo do TDEE basal adaptativo.
6. Recalcula a nova meta aplicando o objetivo do usuário sobre esse TDEE empírico.
7. Aplica suavização e limites de ajuste para evitar mudanças abruptas, permitindo variações de até 150 kcal da meta atual.
8. Se os dados estiverem insuficientes (menos de 4 pesos válidos na janela ou menos de 10 dias de calorias registradas), mantém a meta atual sem recalcular.
9. Gera insights automáticos a partir dos últimos 7 dias de registro, avaliando ingestão, sono, água, estresse, humor e proteína.

O endpoint `/api/logs` retorna agora `{ logs, insights }`, e o front-end exibe recomendações semanais baseadas no estado atual do usuário.

### Regras de negócio do motor
* Se há menos de 14 logs, a aplicação usa a meta inicial.
* Se há 14 logs ou mais, a aplicação tenta recalcular com base em progresso real.
* O TDEE empírico agora usa regressão linear de peso, não diferença de médias semanais.
* `caloriesBurned` não é somado no cálculo do TDEE adaptativo; ele entra apenas em insights comportamentais.
* Ajustes muito bruscos são evitados com suavização de 45%/55% e limite de variação de 150 kcal.
* O algoritmo evita recalcular quando há poucos pesos válidos ou poucas entradas calóricas.

---

## 🚀 4. Variáveis de Ambiente e Conexão (Neon / Vercel)

### Variáveis exigidas
* `POSTGRES_PRISMA_URL` — conexão principal do Prisma para o banco PostgreSQL.
* `POSTGRES_URL_NON_POOLING` — conexão sem pool usada por validações e sincronização local.

### Observação importante
Em ambiente local, o Prisma precisa das duas variáveis para validar o schema e rodar `db push`/`generate`.

As variáveis abaixo são injetadas automaticamente pela Vercel no ambiente de produção. Para desenvolvimento local, devem constar no arquivo `.env`:

```env
POSTGRES_PRISMA_URL="postgres://default:xxx@ep-xxx.us-east-1.postgres.vercel-storage.com:5432/verceldb?pgbouncer=true&connect_timeout=15"
POSTGRES_URL_NON_POOLING="postgres://default:xxx@ep-xxx.us-east-1.postgres.vercel-storage.com:5432/verceldb"
```

> Nota: O `POSTGRES_URL_NON_POOLING` é necessário para que o Prisma valide o schema localmente e funcione no build serverless.

---

## 🧪 5. Como testar localmente

### Fluxo recomendado
1. Instale as dependências:

```bash
npm install
```

2. Crie um arquivo `.env` com as variáveis de conexão PostgreSQL acima.

3. Gere o cliente Prisma e sincronize o schema:

```bash
npx prisma generate
npx prisma db push
```

4. Execute a aplicação:

```bash
npm run dev
```

5. Para validar a build como no Vercel:

```bash
npm run build
```

### Pontos para checar em caso de erro
* `POSTGRES_URL_NON_POOLING` ausente → erro de validação do Prisma.
* `prisma generate` não rodou → cliente desatualizado.
* `next build` quebrando em `app/api/logs/route.ts` → confira se o schema do Prisma inclui os campos usados pelo backend.
* `getYesterdayLocalISODate()` usa data local explicita para evitar erros de data em fusos horários diferentes, em vez de `toISOString()`.

---

## 🧩 6. Comportamento atual do front-end

A interface principal foi expandida para incluir:
* formulário de onboarding inicial;
* formulário diário com registro de peso, calorias, treino, sono, água, estresse e humor;
* painel de insights automáticos;
* alertas visuais baseados em tendência recente;
* gráficos de tendência de peso e aderência calórica;
* tabela com histórico recente e botão de edição para registros anteriores.

### Regras de UX implementadas
* Se o usuário marcar `Livre`, o app impede mais de um dia livre nos últimos 7 dias.
* Os campos de peso, calorias e sono são opcionais, permitindo lacunas de registro.
* O formulário de edição reaproveita os valores de um registro existente para correção.
* `app/page.tsx` foi fragmentado em componentes menores: `OnboardingForm`, `DailyEntryForm`, `MetabolicCharts` e `RecentHistoryTable`.
* A camada de dados foi isolada em `app/hooks/useMetabolicData.ts` para gerenciar `logs`, `settings`, `insights`, carregamento e erros.
* Os gráficos de peso usam EMA (Média Móvel Exponencial) para reduzir o impacto de dias antigos e dar mais peso aos registros recentes.

### Observações sobre renderização e sincronização inicial

 - `app/page.tsx` agora é um Server Component que busca `settings` e `logs` via Prisma no servidor e passa `initialSettings`, `initialLogs` e `initialInsights` para o componente cliente `DashboardClient`.
 - O hook `useMetabolicData` aceita esses `initial*` props e evita re-fetch automático quando `initialSettings` não é `null`, garantindo renderização SSR rápida com dados já carregados.
 - Quando `initialSettings` é `null` (usuário sem onboarding), o hook dispara `refresh()` no cliente para buscar os dados necessários.

### Comportamento otimista ao gravar logs

 - O método `addLog` em `useMetabolicData` aplica uma atualização otimista local (`setLogs`) inserindo o registro no topo da lista para uma UI responsiva.
 - Em caso de falha na requisição ao endpoint `/api/logs`, o hook restaura os `logs` a partir de um backup e relança o erro para que a UI mostre uma mensagem apropriada.
 - O endpoint `/api/logs` recalcula a meta adaptativa (`recalculateAdaptiveTarget`) quando houver dados suficientes (>= 14), mas a UI confia na resposta otimista até que o `refresh()` confirme o estado final.

### Campos adicionados e rastreamento de composição

 - Foram adicionados `proteinConsumed` (Int?) e `waistCircumference` (Float?) ao modelo `DailyLog` para permitir insights de ingestão proteica e mudança de composição corporal.
 - Esses campos são opcionais e não quebram a janela de regressão do algoritmo; são usados para insights, não para o cálculo primário do TDEE adaptativo.

Se quiser, eu posso também gerar um trecho de `CHANGELOG.md` com o resumo dessas mudanças antes de você commitar e fazer o `prisma db push` no ambiente que tenha acesso ao banco.

---

## 🛠️ 7. Pontos de atenção para manutenção

Ao alterar o projeto, tenha cuidado com:
* a compatibilidade do schema do Prisma com a API;
* a estabilidade do algoritmo adaptativo;
* o formato da data em `YYYY-MM-DD`;
* os dados opcionais em `DailyLog` para não quebrar entradas antigas;
* a lógica de insights, que depende de dados recentes suficientes para fazer sentido.

Se alguma mudança alterar a estrutura de `DailyLog`, ajuste a interface, a API e a documentação em conjunto.
