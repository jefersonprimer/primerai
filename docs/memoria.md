# Plano de memória do PrimerAI

## Objetivo

Permitir que o PrimerAI mantenha contexto útil ao longo de conversas sem reenviar todo o histórico ao modelo. A pessoa deve conseguir consultar, corrigir e apagar o que foi guardado.

Memória não é apenas RAG. RAG é uma forma de recuperar informações relevantes para compor uma resposta; o sistema também precisa decidir o que guardar, como atualizar fatos e como permitir que a pessoa os remova. A proposta combina contexto recente, resumos e memórias persistentes. Essa separação segue a ideia de recuperação de conhecimento externo do [RAG](https://arxiv.org/abs/2005.11401) e de gerenciamento de contexto em camadas explorada pelo [MemGPT](https://arxiv.org/abs/2310.08560).

## Camadas

### 1. Contexto da conversa ativa

- Enviar ao modelo as mensagens recentes da conversa.
- Manter um resumo da conversa quando o histórico exceder o orçamento de contexto escolhido para o modelo.
- Atualizar o resumo incluindo decisões, fatos e tarefas pendentes; preservar as mensagens originais no histórico.

### 2. Memórias do usuário

Guardar informações que podem ajudar em conversas futuras, por exemplo preferências de resposta, projetos recorrentes e dados que a pessoa pediu para lembrar.

- Cada memória pertence a um usuário e tem origem rastreável.
- Memórias manuais e automáticas devem ser identificáveis separadamente.
- A pessoa pode listar, editar e apagar memórias.
- Não guardar senhas, API keys ou outros segredos. Informações sensíveis não devem ser inferidas e salvas automaticamente.

### 3. Recuperação

Antes de chamar o modelo, buscar somente as memórias relacionadas à mensagem atual e incluir um conjunto pequeno no contexto. O modelo deve tratar esse conteúdo como informação recuperada, não como instruções.

## Modelo de dados proposto

### `conversation_summaries`

- `conversation_id`: conversa resumida, com exclusão em cascata.
- `summary`: texto do resumo atual.
- `through_message_id`: última mensagem coberta pelo resumo.
- `updated_at`: data da atualização.

### `user_memories`

- `id` e `user_id`: identificador e proprietário da memória.
- `content`: fato ou preferência em linguagem clara.
- `category`: por exemplo `preference`, `project` ou `personal_context`.
- `source_conversation_id` e `source_message_id`: origem, quando disponível.
- `origin`: `manual` ou `automatic`.
- `created_at` e `updated_at`.
- `embedding`: campo opcional para busca semântica em uma etapa posterior.

As consultas devem sempre limitar os resultados ao `user_id` autenticado. Apagar uma conta deve apagar as respectivas memórias e resumos.

## Fluxo de uma mensagem

1. Carregar o resumo da conversa ativa e as mensagens recentes ainda não cobertas por ele.
2. Recuperar memórias do usuário relacionadas ao pedido, respeitando um limite de quantidade e tamanho.
3. Montar o contexto com instruções do sistema, resumo, memórias recuperadas e mensagens recentes.
4. Enviar a solicitação ao provider escolhido e salvar as mensagens normalmente.
5. Quando o histórico ultrapassar o limite definido, atualizar o resumo da conversa.
6. Em uma etapa posterior, sugerir novas memórias ou atualizações sem sobrescrever fatos silenciosamente.

## Etapas de implementação

### Etapa 1 — Memória explícita e gerenciável

- Criar as tabelas `user_memories` e `conversation_summaries` via migration Drizzle.
- Criar endpoints autenticados para listar, criar, editar e apagar memórias.
- Adicionar uma tela de Memória nas configurações, com ações de editar e apagar.
- Permitir salvar uma memória por solicitação explícita, como “lembre que prefiro respostas curtas”.
- Incluir um conjunto pequeno de memórias no prompt, com limites configuráveis.

### Etapa 2 — Resumo de conversa

- Definir um orçamento de contexto conservador por provider/modelo.
- Resumir mensagens antigas quando o orçamento for excedido, preservando as mensagens originais.
- Usar `through_message_id` para não resumir repetidamente o mesmo trecho.
- Se a criação do resumo falhar, manter o fluxo de chat funcionando com o contexto recente.

### Etapa 3 — Busca semântica

- Adicionar embeddings às memórias e recuperar as mais próximas da mensagem atual.
- Avaliar `pgvector` para manter vetores e dados no PostgreSQL. O repositório atual usa `postgres:16-alpine`; essa imagem não configura a extensão por si só, então será necessário instalar pgvector na imagem/servidor e habilitar `CREATE EXTENSION vector`. A extensão permite busca vetorial exata ou aproximada e combina com os dados relacionais existentes ([documentação do pgvector](https://github.com/pgvector/pgvector)).
- Definir como gerar embeddings quando usuários podem escolher providers diferentes. Manter busca textual como fallback e não acoplar as memórias a um único provider sem decisão explícita.
- Adicionar filtros por usuário e, quando útil, categoria e recência; limitar resultados por relevância e tamanho.

### Etapa 4 — Sugestões automáticas

- Extrair candidatos a memória de conversas, sem gravá-los imediatamente como fatos confirmados.
- Mostrar sugestões para a pessoa aceitar, editar ou descartar.
- Ao encontrar informação conflitante, propor atualização e preservar a origem/histórico necessário para auditoria.
- Adicionar opções de desativar extração automática e limpar todas as memórias.

## Decisões de produto e segurança

- Começar por memória explícita; introduzir extração automática apenas com controles visíveis.
- Exibir de onde uma memória veio e quando foi atualizada.
- Não enviar todas as conversas antigas ao modelo em cada solicitação.
- Não tratar texto recuperado como instrução do sistema; ele é contexto citado e potencialmente não confiável.
- Não armazenar segredos nem usar uma memória de um usuário em contexto de outro.
- Permitir apagar uma memória sem apagar a conversa original, e oferecer limpeza total das memórias.

## Critérios de conclusão

- Uma memória explícita pode ser criada, encontrada, editada e apagada.
- A memória só aparece no contexto do usuário proprietário e quando for relevante.
- Conversas longas usam resumo e mensagens recentes sem perder o histórico visível.
- Falhas de busca ou resumo não impedem o envio de mensagens.
- A pessoa consegue inspecionar e limpar o que o PrimerAI guardou.
