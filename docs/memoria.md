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

### Etapa 1 — Memória explícita e gerenciável (implementada)

- A tabela atual `memories` foi estendida com categoria e data de atualização via migration.
- Endpoints autenticados permitem listar, salvar/atualizar, editar categoria/conteúdo e apagar memórias.
- As configurações de desktop e mobile mostram categorias e permitem editar e apagar.
- Pedidos explícitos no formato “lembre que...”, “guarde que...” e equivalentes salvam uma memória e recebem confirmação no chat.
- As memórias são incluídas no prompt como dados de contexto, com categoria; a recuperação ainda envia todas as memórias.

## Próximos passos

Ordem sugerida para evoluir a feature, mantendo o fluxo de chat disponível mesmo quando uma etapa de memória falhar:

### 1. Tornar a memória explícita confiável

- Revisar a detecção de comandos como “lembre que...” e “guarde que...”: cobrir variações em português, evitar falsos positivos e informar claramente quando um pedido não foi salvo.
- Guardar a origem de cada memória (conversa e mensagem) e exibir essa origem e a data de atualização nas telas de memória.
- Adicionar ação para apagar todas as memórias e opção para desativar o uso delas no chat.
- Alinhar o formato de edição entre web, desktop e mobile; manter compatibilidade com memórias antigas sem categoria.
- Confirmar que pedidos envolvendo senhas, tokens, chaves de API ou dados sensíveis não sejam persistidos.

**Pronto quando:** a pessoa consegue criar, consultar, editar, categorizar, apagar uma memória individual ou limpar todas; a interface informa o resultado do pedido de salvamento.

### 2. Recuperar apenas contexto relevante

- Antes de usar embeddings, implementar uma busca textual simples sobre chave e conteúdo, com categoria como filtro opcional.
- Limitar quantidade e tamanho do contexto recuperado; ordenar por relevância e recência.
- Nunca consultar memórias fora do `user_id` autenticado.
- Manter uma opção de fallback segura: se a busca falhar, o chat continua sem memória ou usa apenas um conjunto pequeno, em vez de falhar a resposta.
- Registrar métricas sem registrar conteúdo privado, para avaliar consultas sem correspondência e tamanho do contexto.

**Pronto quando:** cada pedido envia apenas memórias relacionadas, há limites previsíveis de contexto e uma falha na recuperação não impede o chat.

### 3. Resumir conversas longas

- Definir limites de contexto por provider/modelo e reservar espaço para a resposta.
- Criar `conversation_summaries` com resumo e `through_message_id`; preservar mensagens originais na interface e no banco.
- Atualizar o resumo em blocos, incluindo decisões, fatos e tarefas pendentes, sem resumir repetidamente mensagens já cobertas.
- Se o provider não conseguir resumir, enviar mensagens recentes e seguir com o chat.

**Pronto quando:** a conversa retoma decisões antigas depois de muitas mensagens, sem reenviar todo o histórico e sem ocultar o histórico original.

### 4. Sugerir memórias automáticas com aprovação

- Extrair candidatos de conversas sem gravá-los diretamente como fatos confirmados.
- Apresentar ações claras para aceitar, editar ou descartar cada sugestão.
- Se um candidato contradiz uma memória existente, sugerir atualização em vez de sobrescrevê-la.
- Permitir desativar sugestões automáticas e identificar a origem automática/manual.

**Pronto quando:** nenhuma memória inferida é persistida sem aprovação, e conflitos podem ser revisados pela pessoa.

### 5. Avaliar busca semântica

- Só adicionar embeddings se a busca textual não recuperar bem projetos e assuntos descritos com palavras diferentes.
- Escolher um provider de embeddings compatível com a configuração de providers da PrimerAI, sem enviar dados a um serviço novo sem decisão de produto.
- Avaliar pgvector na infraestrutura e manter busca textual como fallback.
- Comparar a relevância dos resultados em consultas reais anonimizadas ou exemplos sintéticos antes de ativar por padrão.

**Pronto quando:** busca semântica melhora a recuperação medida, respeita filtros de usuário e categoria, e pode ser desativada sem perda das memórias.

## Etapa 2 — Resumo de conversa (planejada)

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
