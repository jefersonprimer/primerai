# Automação pessoal

## Objetivo

Fazer o PrimerAI trabalhar de forma proativa. A pessoa descreve uma rotina ou uma condição em linguagem natural, confirma a regra interpretada e passa a receber resultados sem precisar reabrir uma conversa.

Exemplos:

> “Todo dia às 8h, me diga as notícias importantes de tecnologia.”

> “Toda segunda, analise meus gastos e me diga onde estou gastando mais.”

> “Quando aparecer uma promoção desse produto abaixo de R$ 2.000, me avise.”

A automação não é uma nova forma de executar ações locais: cada disparo gera uma tarefa normal. Com isso, o sistema reaproveita histórico, permissões, dispositivos, auditoria e resultados já existentes.

## Experiência desejada

```text
Pessoa descreve o que quer automatizar
        ↓
IA extrai regra, fuso horário, fonte e ação
        ↓
App exibe uma prévia editável para confirmação
        ↓
Automação é salva e fica ativa
        ↓
Worker avalia o horário ou a condição
        ↓
Cria uma tarefa normal no backend ou desktop selecionado
        ↓
Resultado é salvo no histórico e entregue por notificação
```

Exemplo de confirmação para o primeiro pedido:

> **Resumo de notícias de tecnologia**  
> Todos os dias às 08:00, no fuso `America/Sao_Paulo`.  
> Pesquisar fontes públicas, resumir os fatos relevantes e enviar uma notificação no app.

O usuário pode alterar nome, frequência, horário, fuso, canal de entrega e pausar ou executar a rotina manualmente. A criação não deve gravar um cron gerado pelo modelo sem mostrar a interpretação antes.

## Tipos de gatilho

### Agenda (`schedule`)

Executa em momentos definidos. É a primeira entrega e cobre recorrências diárias, semanais e mensais.

```json
{
  "type": "schedule",
  "cron": "0 8 * * *",
  "timezone": "America/Sao_Paulo"
}
```

O cron é um detalhe interno: a interface deve usar frases e controles compreensíveis. O fuso é obrigatório e vem da preferência do usuário, podendo ser sobrescrito por automação.

### Condição (`condition`)

Avalia uma fonte em um intervalo e dispara somente quando o predicado for verdadeiro. O primeiro caso é alerta de preço; depois podem entrar alterações em página, chegada de e-mail, eventos de calendário e conectores de serviços.

```json
{
  "type": "condition",
  "checkEveryMinutes": 180,
  "predicate": {
    "kind": "price_below",
    "productUrl": "https://loja.exemplo/produto",
    "currency": "BRL",
    "thresholdCents": 200000
  }
}
```

O produto monitorado deve ter URL ou identificação inequívoca. Busca vaga por nome pode ser oferecida como pesquisa inicial, mas só vira alerta depois que a pessoa confirmar produto, variante, vendedor e teto de preço.

## Modelo de dados

A tabela `schedules` atual em `backend/src/db/schema.ts` guarda apenas cron, prompt e dispositivo. Ela é uma boa base para rotinas, mas não comporta condição, fuso, agendamento confiável, entregas e deduplicação. A evolução recomendada é migrá-la para `automations`.

```ts
type Automation = {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  triggerType: "schedule" | "condition";
  schedule: { cron: string; timezone: string } | null;
  condition: Record<string, unknown> | null;
  target: { kind: "backend" } | { kind: "device"; deviceId: string };
  providerId: string | null;
  model: string | null;
  delivery: { inApp: boolean; push: boolean; desktop: boolean };
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastNotifiedFingerprint: string | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
};

type AutomationRun = {
  id: string;
  automationId: string;
  taskId: string | null;
  triggerSnapshot: Record<string, unknown>;
  status: "queued" | "running" | "completed" | "failed" | "skipped";
  resultFingerprint: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};
```

`AutomationRun` é separado da task porque uma avaliação pode ser ignorada, por exemplo quando o preço ainda está acima do teto ou o resultado é idêntico ao último alerta. Quando houver trabalho a executar, a run referencia a task criada.

Índices essenciais:

- `automations(enabled, next_run_at)` para o worker encontrar itens vencidos;
- `automation_runs(automation_id, created_at)` para histórico;
- unicidade para uma execução por automação e janela de disparo, evitando duplicidade entre workers.

## Execução e confiabilidade

O scheduler deve rodar no backend como processo de worker, e não dentro do processo HTTP nem no desktop. Em cada ciclo curto ele seleciona automações ativas cujo `nextRunAt` venceu, faz o claim transacional e calcula o próximo horário antes de enfileirar a execução.

```text
Worker encontra automação vencida
        ↓
Claim atômico + cria AutomationRun
        ↓
Atualiza nextRunAt
        ↓
Avalia condição ou cria task
        ↓
Registra resultado e entrega notificação
```

O claim precisa impedir que dois processos executem a mesma ocorrência. PostgreSQL permite implementar isso com atualização condicional ou `FOR UPDATE SKIP LOCKED`. A rotina deve ser idempotente: uma tentativa repetida não pode produzir duas notificações ou duas operações no computador.

Não é necessário executar todas as ocorrências perdidas durante uma indisponibilidade. A política inicial recomendada é no máximo uma execução de recuperação por automação, identificada no histórico, e depois retomar a agenda normal. A política pode evoluir para ser configurável.

Para destinos em desktop, o backend cria uma task pendente como já faz em `POST /v1/tasks`. Se o dispositivo estiver offline, a tarefa pode aguardar até uma validade definida; após isso, a run falha com uma explicação e a pessoa é notificada. Rotinas que usam apenas dados ou web públicos podem rodar inteiramente no backend.

## Alertas de preço

Alerta de preço requer coleta estruturada, não apenas uma resposta do modelo. Cada verificação deve registrar fonte, URL final, preço, moeda, disponibilidade, horário de coleta e nível de confiança.

Para evitar spam:

- não notificar novamente para o mesmo preço/oferta enquanto a condição continuar verdadeira;
- gerar `resultFingerprint` com produto, loja, preço e disponibilidade;
- avisar outra vez se o preço cair, se outra loja elegível aparecer ou após um período de reengajamento configurável;
- informar falhas de coleta de maneira agregada, não a cada tentativa;
- declarar que preços, estoque e frete podem mudar até a compra.

A primeira versão deve monitorar páginas públicas permitidas e somente leitura. Login, captcha, compra automática, cupons pessoais e qualquer ação de checkout ficam fora do escopo inicial.

## Permissões e segurança

Uma automação não amplia as permissões já concedidas ao agente.

- A criação sempre mostra o que será consultado, com que frequência, qual computador será usado e onde o resultado será entregue.
- Ações de leitura dentro de fontes e workspaces autorizados podem ser executadas conforme a política existente.
- Qualquer escrita local, envio externo, exclusão, movimentação de arquivo ou mudança em serviço conectado exige aprovação no momento da execução, salvo uma regra explícita, limitada e revogável que o produto passe a suportar.
- O prompt e as configurações são validados no backend; conteúdo de páginas, e-mails ou documentos nunca pode alterar a automação por instruções embutidas.
- Tokens e credenciais de conectores não entram no prompt, logs, eventos ou histórico de notificações.
- Limites por automação devem cobrir frequência mínima, duração, chamadas à web, dados processados, custo estimado e tentativas consecutivas.

Ao falhar repetidamente, a automação deve ser pausada automaticamente após um limite e enviar uma única notificação de atenção. A pessoa pode reativá-la depois de corrigir a causa.

## API e interface

Rotas iniciais sugeridas:

- `POST /v1/automations/draft`: interpreta o pedido e devolve uma prévia validada; não persiste.
- `POST /v1/automations`: cria após confirmação.
- `GET /v1/automations`: lista automações, próximo disparo e último resultado.
- `GET /v1/automations/:id`: detalhe e execuções.
- `PATCH /v1/automations/:id`: edita, ativa ou pausa.
- `POST /v1/automations/:id/run`: executa imediatamente.
- `DELETE /v1/automations/:id`: remove a regra e preserva ou remove o histórico conforme política de retenção.

A tela deve ter uma lista com estado ativo/pausado, próxima execução, último resultado e menu de ações. O detalhe apresenta a regra em português, fontes/destino, execuções e erros. Uma área de criação pode partir do chat, mas a confirmação deve usar controles estruturados, não só texto livre.

## Ordem de implementação

### 1. Rotinas recorrentes e histórico

- Migrar `schedules` para um modelo com `timezone`, `nextRunAt`, provider/model e relação com execuções.
- Criar CRUD autenticado, validação de cron e prévia de criação.
- Implementar worker com claim atômico e criação de tasks existentes.
- Exibir lista, pausar, editar e executar agora.

**Pronto quando:** uma rotina diária ou semanal dispara uma task uma única vez no horário correto, sobreviver a reinício e mostrar o resultado no histórico.

### 2. Entrega e execução em dispositivo

- Adicionar notificações no app e no desktop; push mobile quando a infraestrutura estiver disponível.
- Tratar desktop offline, validade da tarefa e reexecução manual.
- Adicionar limites, pausa após falhas e auditoria de cada run.

**Pronto quando:** uma automação de análise local informa resultado ou falha compreensível mesmo quando o desktop não está disponível.

### 3. Condições e alerta de preço

- Implementar esquema de condição versionado e worker de avaliação periódica.
- Integrar coleta estruturada de ofertas públicas, com fontes e deduplicação.
- Implementar fingerprint e política anti-repetição de alertas.

**Pronto quando:** um produto confirmado dispara uma notificação apenas quando uma oferta verificável fica abaixo do teto definido.

### 4. Conectores pessoais

- Adicionar conectores com OAuth e escopos mínimos para finanças, e-mail, calendário ou serviços escolhidos.
- Tornar a origem dos dados, retenção e revogação de acesso visíveis na interface.
- Criar modelos específicos de automação por conector, evitando prompts soltos para operações sensíveis.

**Pronto quando:** a pessoa conecta um serviço, entende quais dados serão lidos e recebe uma análise agendada com origem rastreável.

## Decisões pendentes

- Provedor de fila/worker: processo próprio com PostgreSQL inicialmente ou uma fila dedicada quando houver escala.
- Canal inicial de notificação: somente in-app, desktop, push mobile ou combinação.
- Política de retenção para runs, resultados e dados coletados.
- Frequência mínima e orçamento de execução por plano/usuário.
- Fontes e lojas permitidas no primeiro alerta de preço.
- Primeiro conector de dados pessoais para a análise de gastos e requisitos de segurança correspondentes.
