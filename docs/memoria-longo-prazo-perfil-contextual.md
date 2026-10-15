# Memória de longo prazo e perfil contextual personalizado

## Objetivo

Fazer o PrimerAI reaproveitar, em conversas futuras, informações úteis que a pessoa compartilhou: preferências de resposta, estilo de escrita, projetos ativos, stack de tecnologia e fluxo de trabalho. A pessoa não deve precisar reapresentar seu contexto em cada chat.

A memória precisa ser útil sem parecer que o sistema sabe mais do que foi informado. A pessoa deve poder ver, corrigir, desativar e apagar o que foi guardado. O PrimerAI deve distinguir fatos confirmados, preferências, informações temporárias e inferências ainda não aprovadas.

Este documento detalha a feature de perfil contextual sobre o plano existente em [`docs/memoria.md`](./memoria.md). Ele complementa esse plano; não substitui suas diretrizes de resumos de conversa e recuperação.

## Implementação atual (outubro de 2026)

O perfil contextual está entregue como uma primeira versão controlável:

- `memories` é isolada por usuário e armazena categoria, origem, conversa/mensagem de origem, vínculo opcional ao projeto e `valid_until`.
- O chat reconhece pedidos explícitos como “lembre que…”, bloqueia credenciais evidentes e recupera no máximo oito memórias relevantes, respeitando validade e a opção de uso no chat.
- Sugestões automáticas são desligadas por padrão e só viram memória depois de revisão. Elas usam regras conservadoras, não uma extração silenciosa por modelo.
- `project_profiles` guarda nome, objetivo, stack, decisões, estado e última confirmação. Para pedidos como “continue aquele projeto”, até dois projetos ativos/pausados mais recentes e relevantes podem compor o contexto.
- Web e mobile permitem gerir memórias; o web também permite criar, confirmar e apagar fichas de projeto. O mobile já permite criar, categorizar, editar e limpar memórias, além de revisar sugestões.
- A resposta de chat inclui `memoryUsage`; o web exibe as memórias e projetos que foram aplicados à resposta recém-gerada.

### Limites deliberados desta versão

- A recuperação é textual, com fallback para os projetos recentes quando a mensagem faz referência a um projeto. Ainda não há embeddings nem busca semântica.
- Não há expiração automática: itens com `valid_until` simplesmente deixam de ser enviados ao modelo. A definição de prazos padrão e lembretes de revisão continua pendente.
- A ficha de projeto é criada e mantida pela pessoa; mensagens não criam ou alteram automaticamente uma ficha estruturada.
- A transparência de uso é retornada na resposta nova do chat; ela não é persistida como um histórico de auditoria por conversa.

## O que o perfil deve guardar

Organizar o contexto em categorias legíveis e editáveis:

| Categoria | Exemplos | Duração típica |
|---|---|---|
| Preferências | “Prefiro respostas concisas”; “use português brasileiro”; “inclua exemplos de código” | Longa, até a pessoa alterar |
| Estilo de escrita | “Em e-mails, uso tom cordial e direto”; “evite jargão” | Longa, revisável |
| Projetos | “Estou construindo um app Expo para organizar tarefas”; stack, objetivo, decisões e status | Enquanto o projeto estiver ativo; pedir revisão periódica |
| Fluxo de trabalho | “Antes de editar, mostre um plano”; “uso pnpm”; “prefiro patches pequenos” | Longa, revisável |
| Contexto pessoal/profissional | Papel, área ou objetivo informado pela pessoa | Opcional e explicitamente controlável |
| Contexto temporário | Prazo, viagem, tarefa ou prioridade desta semana | Curta, com data de validade quando aplicável |

Não inferir nem armazenar automaticamente senhas, tokens, chaves, dados financeiros, dados de saúde, dados íntimos ou outras informações sensíveis. Não inferir atributos pessoais protegidos. Quando houver dúvida se algo é uma preferência duradoura ou um detalhe pontual, perguntar antes de salvar ou não salvar.

## Princípios de produto

1. **Transparência:** indicar quando uma resposta usou memória relevante; permitir abrir e inspecionar os itens aplicados.
2. **Controle:** oferecer editar, apagar, limpar tudo e desativar o uso da memória. Desativar não apaga os dados.
3. **Confirmação para aprendizado automático:** observações inferidas viram sugestões revisáveis, não fatos persistidos silenciosamente.
4. **Atualizações cuidadosas:** se uma informação nova contradiz a memória existente, sugerir alteração e preservar a escolha da pessoa.
5. **Relevância e limites:** recuperar poucos itens relacionados ao pedido, respeitando limites de texto e contexto do modelo.
6. **Separação de instruções:** memórias são dados de contexto, nunca instruções de sistema. Conteúdo de projetos e conversas pode conter texto não confiável.
7. **Falha isolada:** se extração ou recuperação falhar, o chat continua sem memória; não inventar contexto.

## Experiência proposta

### Primeira configuração

Apresentar um resumo curto do que a memória pode guardar e como a pessoa controla essa informação. A ativação de sugestões automáticas deve ser uma escolha explícita. Memória manual (“lembre que...”) continua disponível mesmo se sugestões automáticas estiverem desligadas.

### Sugestão durante a conversa

Quando houver um candidato útil e potencialmente duradouro, mostrar uma sugestão não intrusiva, por exemplo:

> Parece que você prefere respostas com passos curtos e exemplos. Quer guardar isso para os próximos chats?

Ações: **Guardar**, **Editar**, **Agora não**. Não repetir a mesma sugestão depois de descartada, a menos que a pessoa volte a pedir para lembrar.

Para projetos, agrupar candidatos em uma ficha revisável:

```text
Projeto: PrimerAI Mobile
Objetivo: assistente pessoal com chat e automações
Stack mencionada: Expo SDK 57, React Native, TypeScript
Estado: ativo
Última confirmação: data
```

Não afirmar que o sistema “aprendeu” um dado até ele ter sido salvo. Dar confirmação clara após aceitar ou editar.

### Gestão do perfil

Adicionar uma tela ou seção **Memória e perfil** nas configurações. Ela deve mostrar categorias, conteúdo, origem, data de atualização e, se houver, projeto relacionado e data de validade. Permitir:

- criar, editar e apagar cada item;
- revisar e aceitar/editar/descartar sugestões;
- desativar sugestões automáticas;
- desativar o uso de memórias em conversas sem apagar os dados;
- limpar todas as memórias com confirmação;
- consultar quais memórias foram usadas em uma conversa, quando a UI puder mostrar isso sem poluir o chat.

## Modelo de dados

A tabela `memories` existente pode continuar compatível na primeira etapa. Evoluir os campos para representar origem, temporalidade e revisão:

```text
memories
  id
  user_id
  key                 identificador legível e estável dentro da categoria
  value               conteúdo em linguagem clara
  category            preference | writing_style | project | workflow |
                      person | goal | context
  origin              manual | accepted_suggestion | imported
  status              active | archived
  source_conversation_id   opcional
  source_message_id        opcional
  confidence               opcional; interno para ordenação de sugestões
  valid_until              opcional para contexto temporário
  last_confirmed_at        opcional para itens que precisam revisão
  created_at
  updated_at
```

Sugestões ainda não aceitas devem ficar em uma entidade separada, ou em registros com estado `pending`, sem entrarem no contexto normal:

```text
memory_suggestions
  id, user_id, proposed_key, proposed_value, category
  source_conversation_id, source_message_id
  status: pending | accepted | dismissed | expired
  created_at, reviewed_at
```

Registrar a origem permite explicar de onde veio a informação e evitar tratar uma inferência como algo dito explicitamente. Evitar duplicar transcrições ou conversas inteiras na tabela de memória. Índices e unicidade devem manter o escopo por usuário; toda consulta deve filtrar pelo `user_id` autenticado.

## Fluxo de aprendizado e uso

### Aprender

1. Após salvar a mensagem do usuário, identificar candidatos apenas quando a extração automática estiver ativada ou quando houver pedido explícito.
2. Aplicar filtros de segurança antes de qualquer persistência. Excluir segredos e conteúdos sensíveis da extração automática.
3. Comparar cada candidato às memórias ativas: duplicatas podem ser ignoradas; conflitos viram sugestão de atualização.
4. Salvar candidatos automáticos como sugestões pendentes. Pedidos explícitos podem salvar diretamente e devem receber confirmação.
5. Remover ou expirar dados temporários segundo a política definida; nunca converter automaticamente um contexto temporário em preferência permanente.

### Recuperar

1. Verificar se a pessoa desativou o uso de memória no chat.
2. Buscar por texto e categoria no primeiro estágio; considerar busca semântica somente se a busca textual não for suficiente.
3. Priorizar itens ativos por relevância para a mensagem, confirmação recente e categoria.
4. Aplicar limites de quantidade e tamanho antes de montar o prompt.
5. Acrescentar ao contexto uma seção claramente delimitada como dados de perfil não confiáveis.
6. Opcionalmente registrar IDs das memórias usadas para permitir transparência na interface, sem salvar conteúdo duplicado em logs.

O contexto deve deixar claro ao modelo que essas informações podem estar desatualizadas e não substituem o pedido atual. Se memória e mensagem atual conflitarem, priorizar o pedido atual e perguntar quando a diferença afetar materialmente o resultado.

## Recuperação em etapas

### Etapa inicial: busca textual

- Pesquisar em `key` e `value`, com filtros por categoria, status e validade.
- Usar correspondência textual simples e limites de contexto; ordenar por relevância e recência.
- Não incluir todas as memórias indiscriminadamente.

### Etapa posterior: busca semântica

Adicionar embeddings somente se exemplos reais mostrarem que a busca textual perde contexto relevante descrito com outras palavras. Escolher onde gerar embeddings sem enviar dados a um serviço novo silenciosamente. Manter filtro por usuário e busca textual como fallback. O plano [`docs/memoria.md`](./memoria.md) já registra considerações sobre pgvector e providers.

## API conceitual

Estender os endpoints atuais em `backend/src/routes/memories.ts` conforme a necessidade:

```text
GET    /v1/memories
PUT    /v1/memories/:key
PATCH  /v1/memories/:key
DELETE /v1/memories/:key
DELETE /v1/memories              limpar tudo, com confirmação na interface

GET    /v1/memory-suggestions
POST   /v1/memory-suggestions/:id/accept
PATCH  /v1/memory-suggestions/:id   editar e aceitar
POST   /v1/memory-suggestions/:id/dismiss

GET    /v1/memory-settings
PATCH  /v1/memory-settings

GET    /v1/projects
POST   /v1/projects
PATCH  /v1/projects/:id       editar ou confirmar a ficha
DELETE /v1/projects/:id
```

Configurações podem conter `useMemoriesInChat` e `automaticSuggestionsEnabled`. A API nunca deve permitir acessar ou alterar registros de outro usuário. Limpeza global deve exigir confirmação explícita na UI, e o endpoint deve apagar somente memórias daquele usuário.

## Privacidade e segurança

- Obter controle explícito para sugestões automáticas; não confundir uso de memória com treinamento do modelo.
- Tratar mensagens, memórias recuperadas e candidatos como entrada não confiável, com proteção contra prompt injection.
- Não usar memória para autorizar ferramentas, compartilhar dados ou executar ações.
- Não guardar credenciais nem conteúdo sensível inferido automaticamente.
- Exibir origem e oferecer exclusão. Apagar a memória remove seu uso futuro, sem apagar a conversa original, salvo pedido separado.
- Fazer filtros por proprietário no banco e testar isolamento entre contas.
- Não registrar valores de memória, prompts completos ou candidatos em logs de produção.
- Definir retenção e exclusão para sugestões descartadas e memórias temporárias.
- Se a conta for apagada, apagar memórias, sugestões e associações de perfil conforme a política de exclusão.

## Plano de implementação no repositório

1. **Aprimorar o modelo existente:** adicionar origem, estado, proveniência e validade com migration compatível; preservar linhas antigas como memórias manuais ativas.
2. **Recuperar contexto relevante:** trocar o carregamento de todas as memórias em `backend/src/routes/conversations.ts` por busca limitada por texto/categoria; respeitar opção de desativação.
3. **Criar controles de perfil:** ampliar a tela de configurações mobile e a tela web correspondente com preferências de memória e limpeza total.
4. **Adicionar sugestões:** criar tabela, rotas e UI para aceitar, editar e descartar candidatos sem persistência automática.
5. **Extrair candidatos com segurança:** implementar extração assíncrona após a resposta, com filtros contra segredos/sensíveis, deduplicação, detecção de conflito e limites de custo.
6. **Organizar projetos:** permitir agrupar memórias relacionadas em uma ficha de projeto com stack, objetivo, decisões, estado e última confirmação.
7. **Avaliar recuperação semântica:** só adicionar embeddings após medir a busca textual e escolher explicitamente provider/armazenamento.
8. **Adicionar revisão temporal:** sinalizar projetos e contextos que podem estar desatualizados; pedir confirmação antes de remover ou substituir.

Falhas nas etapas de extração, recuperação e resumo não podem bloquear o chat. A extração deve ocorrer fora do caminho crítico sempre que possível.

## Critérios de aceite

- Preferências, estilo de escrita, projetos e fluxo de trabalho aparecem organizados e editáveis no perfil.
- Pedidos explícitos de memória são salvos e confirmados; não são perdidos se a extração automática estiver desativada.
- Sugestões automáticas nunca entram no contexto antes da aprovação.
- Memórias relevantes são recuperadas em novos chats sem reenviar todo o histórico nem todas as memórias.
- A pessoa consegue ver origem/data, editar, apagar, limpar tudo e desligar o uso de memória.
- Uma informação conflitante não sobrescreve silenciosamente a memória existente.
- Informações temporárias podem expirar ou pedir confirmação de atualização.
- Desativar memória impede sua inclusão em novos prompts, sem apagar os registros.
- Uma falha no serviço de memória não impede o envio nem a resposta do chat.
- Consultas e alterações são isoladas pelo usuário autenticado; testes cobrem acesso cruzado entre contas.
- Segredos e conteúdo sensível não são persistidos por extração automática.

## Decisões pendentes

- Sugestões automáticas vêm desligadas por padrão ou são oferecidas no onboarding?
- A primeira versão de extração suporta todos os chats ou somente conversas selecionadas/projetos?
- Quais categorias de informação pessoal são permitidas, além das preferências e projetos?
- Qual prazo padrão para revisar projetos ativos e expirar contexto temporário?
- O perfil será compartilhado entre mobile, web e desktop desde a primeira entrega?
- Que modelo/provider poderá extrair candidatos sem contrariar as preferências de privacidade e custo da pessoa?
