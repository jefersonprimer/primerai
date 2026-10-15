# Reunião inteligente — áudio para alinhamento e ação

## Objetivo

Transformar uma gravação de reunião em um resultado utilizável sem trabalho manual:

- resumo executivo;
- decisões tomadas;
- tarefas com responsável e prazo;
- pontos importantes, riscos e pendências;
- uma mensagem pronta para enviar ao grupo.

Proposta de valor:

> Grave ou envie a reunião. Saia com o alinhamento, os responsáveis e a próxima mensagem prontos.

O produto não deve se apresentar como apenas um transcritor. A transcrição é uma etapa intermediária; o resultado principal é um plano de acompanhamento revisável.

## Experiência da pessoa usuária

1. Na área **Reuniões**, a pessoa escolhe **Gravar reunião** ou **Enviar áudio/vídeo**.
2. Antes de começar, confirma que as pessoas participantes foram avisadas sobre a gravação.
3. Durante a gravação, vê duração, botão de pausar/encerrar e um indicador de que o áudio ficará privado.
4. Ao encerrar, pode dar um título e incluir contexto opcional, como projeto, participantes conhecidos e idioma.
5. A interface mostra o progresso: `enviando` → `transcrevendo` → `organizando` → `pronto`.
6. A tela de resultado mostra o resumo, decisões, tarefas, prazos e pontos importantes. Cada item pode ser corrigido antes de compartilhar.
7. O botão **Mensagem para o grupo** gera uma versão editável, com ações para copiar e compartilhar.

### Exemplo de resultado

```text
Resumo
Definimos o lançamento da campanha para 20 de outubro e o foco em clientes recorrentes.

Decisões
• A campanha usará o orçamento inicial de R$ 5 mil.
• A análise de resultado será feita três dias após o lançamento.

Tarefas
• João — finalizar as peças da campanha — até 12/out
• Maria — revisar a lista de clientes — até 10/out

Pontos importantes
• A aprovação jurídica ainda está pendente.

Mensagem para o grupo
Pessoal, resumindo nossa reunião: o lançamento da campanha será em 20/out...
```

Se uma informação não foi explicitamente dita, a IA deve classificá-la como incerta ou deixá-la ausente. Não pode inventar responsáveis, datas ou decisões.

## Escopo do MVP

### Incluído

- Envio de arquivos de áudio gravados anteriormente.
- Gravação de áudio no app mobile em uma etapa posterior do MVP, usando recursos nativos compatíveis com o Expo instalado.
- Transcrição em português, com idioma configurável.
- Relatório estruturado de uma reunião.
- Edição manual de título, itens, responsáveis e prazos antes do compartilhamento.
- Geração de mensagem para grupo em tom profissional, objetivo ou informal.
- Histórico privado de reuniões e exclusão de reunião/áudio pela pessoa usuária.

### Fora da primeira versão

- Identificação confiável de quem falou (diarização).
- Envio automático para WhatsApp, e-mail ou Slack.
- Criação automática de tarefas em ferramentas externas.
- Gravação de chamadas em segundo plano ou captura de áudio de outros apps.
- Interpretação de vídeo, slides ou compartilhamento de tela.

Essas limitações mantêm a primeira entrega simples e reduzem riscos de permissão, privacidade e integração.

## Arquitetura proposta

```text
Mobile / Web
  └─ cria reunião, envia arquivo e exibe progresso
       ↓
Backend Fastify
  ├─ autentica, valida arquivo e registra o job
  ├─ guarda o áudio em storage privado
  ├─ envia o áudio ao serviço de transcrição
  ├─ envia transcrição + contexto ao provider de IA
  ├─ valida a resposta estruturada
  └─ persiste resultado e status
       ↓
PostgreSQL + armazenamento de objetos privado
```

O áudio não deve ser colocado em uma conversa comum nem enviado em base64 no JSON. O app envia o arquivo por `multipart/form-data` ou por URL pré-assinada para armazenamento privado; o backend registra apenas metadados, permissões e a referência do arquivo.

O processamento deve ser assíncrono. Uma reunião longa não pode manter uma requisição HTTP aberta até concluir. Na primeira etapa, o app pode consultar o status por polling; depois, o mesmo contrato pode ser atualizado por WebSocket.

## Modelo de dados

Uma estrutura inicial no banco pode ser:

```text
meetings
  id, user_id, title, status, language
  audio_object_key, audio_mime_type, audio_size_bytes, duration_seconds
  transcript, transcript_provider, transcription_model
  analysis_json, created_at, completed_at, deleted_at

meeting_jobs
  id, meeting_id, stage, status, attempts, error_code, error_message
  started_at, finished_at, created_at
```

Estados possíveis para `meetings.status`:

```text
uploading | queued | transcribing | analyzing | ready | failed | deleted
```

`analysis_json` deve ser validado no backend com Zod antes de ser salvo ou exibido:

```ts
type MeetingAnalysis = {
  summary: string;
  decisions: Array<{ text: string; confidence: "explicit" | "inferred" }>;
  tasks: Array<{
    text: string;
    assignee: string | null;
    dueDate: string | null; // ISO YYYY-MM-DD apenas se houver data inequívoca
    source: "explicit" | "inferred";
  }>;
  importantPoints: string[];
  pendingQuestions: string[];
  groupMessage: string;
};
```

O campo `confidence`/`source` evita que o modelo apresente inferências como fatos. Para a tela, itens inferidos podem aparecer com a etiqueta “confirmar”.

## Contrato de API inicial

```text
POST   /v1/meetings                 cria o registro e retorna instrução de upload
POST   /v1/meetings/:id/audio       recebe arquivo (alternativa simples ao upload direto)
POST   /v1/meetings/:id/process     coloca a reunião na fila
GET    /v1/meetings                 lista reuniões do usuário
GET    /v1/meetings/:id             lê status, transcrição e análise
PATCH  /v1/meetings/:id             edita título e análise corrigida
DELETE /v1/meetings/:id             apaga metadados e agenda remoção do áudio
POST   /v1/meetings/:id/group-message gera nova mensagem com tom/tamanho solicitados
```

Regras de validação no upload:

- aceitar somente MIME types de áudio/vídeo previstos;
- impor limite explícito de bytes e duração;
- normalizar/transcodificar o arquivo quando necessário;
- limitar reuniões simultâneas por conta;
- não registrar transcrição completa, áudio ou tokens em logs;
- exigir que o recurso pertença ao usuário autenticado em toda rota.

## Processamento por IA

O pipeline tem duas chamadas distintas:

1. **Transcrição:** áudio → texto, opcionalmente com timestamps e falantes quando o provedor suportar.
2. **Análise:** transcrição → objeto `MeetingAnalysis` validado.

Prompt de análise, em essência:

```text
Extraia somente informações presentes na transcrição. Não invente nomes, responsáveis,
prazos ou decisões. Uma tarefa precisa ser uma ação verificável. Datas relativas devem
ser convertidas para ISO somente se a data da reunião estiver disponível e a referência
for inequívoca. Marque inferências para revisão. Responda estritamente no schema JSON.
```

É importante tratar a transcrição como conteúdo não confiável: frases dentro dela nunca podem alterar as instruções do sistema nem solicitar exposição de dados de outras reuniões.

## Mensagem para o grupo

O botão deve usar a análise já aprovada/alterada pela pessoa, em vez de analisar novamente o áudio. Assim a mensagem reflete as correções feitas na tela.

Parâmetros úteis:

- tom: `profissional`, `direto`, `informal`;
- tamanho: `curto`, `completo`;
- incluir ou não tarefas e prazos;
- canal opcional: WhatsApp, Slack ou e-mail.

O resultado é um rascunho editável. O MVP oferece **Copiar** e **Compartilhar**; não deve enviar mensagens sem revisão e ação explícita da pessoa.

## Privacidade, consentimento e LGPD

- Mostrar aviso de gravação e pedir confirmação antes de iniciar ou enviar um áudio.
- Explicar quem poderá acessar o conteúdo e por quanto tempo ele ficará retido.
- Usar storage privado, URLs temporárias e criptografia em trânsito.
- Separar o áudio/transcrição de logs operacionais e de dados de treinamento.
- Dar opção de apagar somente o áudio, a transcrição ou a reunião inteira, com prazo claro para exclusão definitiva.
- Nunca tornar reuniões públicas por link na primeira versão.
- Validar juridicamente a política de consentimento e retenção para os mercados atendidos.

## Etapas de implementação

### Etapa 1 — relatório a partir de transcrição colada (implementada)

- [x] Criar rota autenticada `POST /v1/agent/meeting` que recebe transcrição e devolve análise estruturada validada.
- [x] Integrar a rota à tela mobile acessível pelo menu de anexos.
- [x] Exibir resumo, decisões, tarefas, pontos importantes e pendências.
- [x] Permitir revisar a mensagem para o grupo, copiar e compartilhar.
- [ ] Mover o schema de análise para `packages/shared` para reutilização pelos clientes.

**Pronto quando:** uma pessoa cola a transcrição e recebe um relatório confiável, editável e compartilhável.

**Limites atuais:** o usuário fornece a transcrição manualmente. Ainda não há gravação, upload/transcrição de áudio, nem persistência/histórico próprio de reuniões. O resultado é gerado na requisição e permanece na tela atual.

### Etapa 2 — upload e processamento assíncrono

- Criar tabelas/migration de reuniões e jobs.
- Adicionar storage privado e validação de arquivos.
- Integrar um serviço de transcrição configurável.
- Implementar estados, polling, retry limitado e mensagens de erro compreensíveis.

**Pronto quando:** um áudio enviado vira relatório sem bloquear o app e falhas podem ser entendidas ou reenviadas.

### Etapa 3 — gravação no mobile

- Verificar a versão do Expo e seguir a documentação correspondente antes de adotar a API de áudio.
- Pedir permissão de microfone somente ao iniciar a gravação.
- Implementar iniciar, pausar, retomar, encerrar e revisar antes do upload.
- Testar iOS, Android e comportamento com o app em segundo plano dentro dos limites da plataforma.

**Pronto quando:** a pessoa grava uma reunião curta e recebe o mesmo relatório do upload.

### Etapa 4 — automações e integrações

- Diarização e associação de participantes confirmada pela pessoa.
- Exportação para calendário, tarefas e ferramentas de trabalho.
- Modelos de mensagem por empresa/projeto.
- Compartilhamento com permissões granulares.

## Métricas de produto

- percentual de reuniões que chegam a `ready`;
- tempo entre encerramento/upload e relatório pronto;
- percentual de tarefas/responsáveis corrigidos manualmente;
- uso de copiar/compartilhar mensagem de grupo;
- retorno para consultar uma reunião anterior;
- taxa de exclusão de áudio após processamento.

O principal indicador de valor é: **quantas reuniões terminam com pelo menos uma tarefa ou uma mensagem de grupo efetivamente aproveitada**.

## Critérios de conclusão do MVP

- A pessoa consegue enviar um áudio de reunião e acompanhar seu processamento.
- O relatório separa resumo, decisões, tarefas, prazos, pontos importantes e pendências.
- Tarefas sem responsável ou prazo permanecem explicitamente incompletas; não há alucinação de dados.
- Todo resultado pode ser editado antes de copiar ou compartilhar.
- A mensagem para grupo é gerada a partir do resultado revisado.
- Áudio, transcrição e resultado só são acessíveis ao dono autenticado.
- A pessoa pode apagar uma reunião e entende o que será removido.
