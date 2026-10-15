# Modo missão

## Implementação inicial

A primeira entrega implementa planejamento com confirmação, persistência de missões e etapas, execução sequencial e acompanhamento na web. O desktop executa cada etapa pelo provider de IA configurado e registra o resultado na tarefa e no histórico da missão. Há pausa, retomada, cancelamento e nova tentativa limitada para etapas com falha.

Nesta entrega, os resultados são textuais e aparecem no detalhe da missão. O agente não cria ou altera arquivos como parte de uma missão, não roda testes de código e não faz deploy. A tela deixa claro que os resultados são produzidos pelo modelo e não afirma que ações locais ou verificações foram executadas. A próxima expansão para criação de sites deve adicionar uma prévia dos arquivos e aprovação antes de gravá-los em uma pasta autorizada.

## Objetivo

Permitir que a pessoa descreva um resultado amplo e acompanhe a IA planejando e executando o trabalho em etapas. Em vez de responder apenas à próxima pergunta, o PrimerAI mantém o objetivo, os passos, os resultados intermediários e as decisões pendentes até concluir ou explicar claramente por que não pode continuar.

Exemplo:

> “Quero criar um site para uma hamburgueria.”

A IA propõe uma missão com etapas como pesquisar referências, definir estrutura, criar identidade visual, escrever textos, implementar o site e revisar o resultado. A pessoa pode ajustar o plano antes de iniciar.

## Princípios

- A missão é um objetivo com estado persistente, etapas e critérios verificáveis de conclusão.
- O modelo pode propor e reordenar etapas, mas o backend valida o plano e as permissões.
- Cada etapa executa por meio de tarefas e ferramentas existentes; não há acesso livre ao computador nem execução arbitrária de código.
- A pessoa acompanha o trabalho, pode pausar ou cancelar e recebe uma explicação acionável quando algo falhar.
- A aprovação de uma ação vale somente para a ação descrita. A missão não ganha permissões permanentes por ter sido iniciada.
- O progresso visual deriva das etapas concluídas, não de uma porcentagem inventada pelo modelo.

## Experiência

```text
Pessoa descreve o resultado desejado
        ↓
IA propõe etapas, entregáveis e critérios de conclusão
        ↓
Pessoa revisa e confirma o plano
        ↓
Orquestrador executa uma etapa por vez
        ↓
App mostra progresso, resultados e aprovações pendentes
        ↓
IA verifica os critérios e apresenta o resultado final
```

Antes de iniciar, a tela de confirmação deve apresentar o objetivo, as etapas, o desktop e as pastas que serão usados, os entregáveis esperados e quaisquer limites conhecidos. O plano precisa ser editável: a pessoa pode renomear, remover, adicionar ou reordenar etapas antes de confirmar.

Durante a missão, cada etapa apresenta estado, descrição, resultado ou erro. A pessoa pode abrir os artefatos, aprovar ações pendentes, pausar, continuar ou cancelar. Uma etapa bloqueada não deve ser apresentada como concluída.

## Escopo inicial recomendado

Começar com uma missão de criação de site estático em uma pasta autorizada no desktop. É um caso demonstrável e permite testar planejamento, execução local, artefatos, revisão e recuperação sem conectar serviços externos.

### Incluído

- Criar uma missão a partir de um objetivo escrito.
- Gerar e validar um plano estruturado com etapas e entregáveis.
- Mostrar uma prévia editável e exigir confirmação antes de executar.
- Executar etapas sequencialmente, reutilizando tarefas e ferramentas já disponíveis.
- Atualizar o estado da missão e das etapas e mostrar progresso real.
- Pausar, retomar e cancelar uma missão.
- Registrar resultados, erros, timestamps e tarefas associadas.
- Apresentar os arquivos produzidos e um resumo final com critérios atendidos ou pendentes.
- Pedir aprovação no momento de ações de risco, como sobrescrever ou excluir arquivos.

### Fora da primeira versão

- Executar várias etapas em paralelo.
- Fazer deploy, comprar serviços, publicar conteúdo ou enviar mensagens externas.
- Aceitar missões sem limite de duração, custo, etapas ou chamadas ao modelo.
- Criar agentes independentes que operam sem supervisão.
- Alterar o plano durante a execução sem registrar e mostrar a mudança à pessoa.
- Declarar testes ou verificações aprovados sem evidência produzida por ferramenta.

## Arquitetura

```text
Web / Mobile / Desktop
  ├─ envia objetivo e edita plano
  ├─ confirma, pausa, retoma ou cancela
  └─ acompanha etapas, aprovações e artefatos
       ↓
Backend Fastify
  ├─ valida plano, limites e permissões
  ├─ persiste missão e etapas
  ├─ coordena tarefas existentes uma etapa por vez
  ├─ trata retry, cancelamento e aprovação
  └─ calcula progresso e conclusão
       ↓
PostgreSQL → tarefas, eventos, aprovações e artefatos existentes
       ↓
Desktop autorizado → ferramentas locais limitadas às pastas permitidas
```

O orquestrador deve ser independente do ciclo de vida de uma requisição HTTP. As rotas criam e atualizam a missão; um worker reivindica missões executáveis com claim transacional, despacha uma etapa e avança quando a tarefa associada termina. A reivindicação precisa ser segura com mais de uma instância do backend.

O primeiro MVP pode executar uma etapa por vez. Uma falha pode permitir retry explícito ou retry automático limitado para erros transitórios. Reiniciar o backend não pode apagar o plano nem marcar uma etapa ativa como concluída sem confirmação do resultado.

## Modelo de dados

Uma estrutura inicial:

```text
missions
  id, user_id, device_id, title, objective, status
  plan_version, progress, current_step_id
  created_at, updated_at, started_at, finished_at, cancelled_at

mission_steps
  id, mission_id, position, title, instructions
  status, output, error, task_id
  completion_criteria, attempts, started_at, finished_at

mission_events
  id, mission_id, step_id, type, payload, created_at
```

Estados da missão:

```text
draft | awaiting_confirmation | queued | running | paused
waiting_approval | completed | failed | cancelled
```

Estados da etapa:

```text
pending | running | waiting_approval | completed | failed | skipped | cancelled
```

`output`, `error` e `payload` devem conter dados estruturados e limitados. Tokens, segredos e conteúdo desnecessário não devem ser copiados para eventos. As chaves estrangeiras devem manter cada missão e etapa vinculadas ao usuário autenticado. `task_id` referencia a tarefa existente para reutilizar progresso, aprovações e artefatos.

Exemplo do plano retornado pela IA antes de persistir:

```ts
type MissionPlan = {
  title: string;
  objective: string;
  steps: Array<{
    title: string;
    instructions: string;
    completionCriteria: string[];
    expectedArtifacts: string[];
  }>;
};
```

A resposta do modelo deve ser validada com Zod: limitar número de etapas, tamanho de títulos e instruções, e rejeitar campos inesperados ou planos vazios. O plano confirmado recebe uma versão; alterações posteriores são registradas como nova versão ou eventos auditáveis.

## Progresso

No MVP sequencial, calcular a porcentagem pelo número de etapas concluídas sobre o total de etapas confirmadas. A etapa em execução pode ser exibida separadamente, sem somar uma estimativa subjetiva ao percentual.

```text
progresso = etapas concluídas / etapas confirmadas × 100
```

Se uma etapa falhar, o percentual não avança. Se a pessoa alterar o plano antes de iniciar, recalcular com a nova quantidade. Depois do início, não remover silenciosamente uma etapa: alterações precisam ser explícitas e registradas.

## API proposta

```text
POST   /v1/missions/draft             gera um plano sem iniciar execução
POST   /v1/missions                   salva missão confirmada e coloca na fila
GET    /v1/missions                   lista missões do usuário
GET    /v1/missions/:id               detalhe, etapas, eventos e progresso
PATCH  /v1/missions/:id               pausa, retoma ou edita campos permitidos
POST   /v1/missions/:id/cancel         cancela missão e tarefa ativa quando possível
POST   /v1/missions/:id/steps/:stepId/retry  tenta novamente uma etapa com falha
```

`POST /draft` não persiste nem executa. A criação da missão recebe o plano confirmado, mas o backend ainda valida limites, pertença do dispositivo e acesso ao workspace. Toda leitura ou mudança verifica `user_id`; conhecer um UUID não concede acesso.

## Aprovação e segurança

- O início confirma apenas o plano, não aprova futuras ações de risco.
- Ferramentas locais permanecem restritas aos workspaces habilitados para o dispositivo.
- A missão pausa em `waiting_approval` quando uma etapa pede uma ação que exige confirmação.
- A tela de aprovação mostra ferramenta, arquivos ou dados afetados e impacto esperado.
- Recusar uma ação não autoriza a IA a tentar contorná-la por outro caminho.
- Mudanças destrutivas, sobrescritas e ações externas exigem aprovação explícita.
- Limitar etapas, iterações, arquivos, duração, tamanho de saída e tentativas por missão.
- Prompt injection encontrado em páginas ou arquivos é tratado como conteúdo, nunca como mudança das instruções ou permissões da missão.
- O cancelamento impede novos despachos e sinaliza à tarefa ativa para parar nos pontos seguros.

## Critérios de aceite do MVP

- A pessoa descreve uma missão e recebe um plano editável, sem que nada seja executado antes da confirmação.
- Uma missão confirmada sobrevive ao reinício do backend e continua a partir do estado persistido.
- Cada etapa produz estado e resultado vinculados a uma tarefa ou registra um erro compreensível.
- A interface mostra a etapa atual e um percentual calculado a partir das etapas concluídas.
- Pausar impede o início de novas etapas; retomar continua do estado persistido.
- Cancelar impede novos despachos e não altera arquivos sem autorização.
- A missão só aparece como concluída quando todas as etapas obrigatórias e critérios verificáveis foram satisfeitos.
- O resumo final lista artefatos criados, verificações realizadas e itens que ainda precisam de atenção.

## Etapas de implementação

1. **Planejamento e persistência:** schemas Zod, tabelas, geração de draft, edição e confirmação do plano.
2. **Orquestrador sequencial:** claim atômico, despacho de tarefa por etapa, transições de estado, retry limitado e recuperação após reinício.
3. **Acompanhamento na interface:** lista e detalhe da missão, progresso, eventos, pausa, continuação, cancelamento e aprovações.
4. **Critérios e revisão final:** validação dos entregáveis com ferramentas, resumo com evidências e encerramento correto de falhas.
5. **Expansão gradual:** novos modelos de missão, mais plataformas e, depois, paralelismo limitado quando dependências e recuperação estiverem bem definidas.
