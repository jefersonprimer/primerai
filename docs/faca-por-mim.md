# “Faça por mim” — agente no computador

## Objetivo

Permitir que a pessoa descreva um trabalho em linguagem natural e que o PrimerAI o execute no computador conectado, com escopo limitado às pastas autorizadas, acompanhamento do progresso e aprovação explícita para ações de risco.

Exemplos:

- “Organiza minha pasta Downloads por tipo de arquivo e encontra duplicados.”
- “Entra no site de vendas, pega os dados deste mês e coloca numa planilha.”

O agente deve executar ações verificáveis por meio de ferramentas declaradas. O modelo não recebe acesso livre ao computador nem executa código arbitrário.

## Estado atual e encaixe na arquitetura

O PrimerAI já tem o fluxo distribuído principal:

```text
Mobile/Desktop → Backend (Fastify: autenticação e tarefas)
              → Desktop (Tauri/Rust: acesso aos arquivos locais)
```

O desktop registra pastas autorizadas, recebe tarefas pendentes por polling, atualiza progresso e publica o resultado. Há também um fluxo específico para resumir PDFs. O banco já contém estruturas para tarefas, eventos, chamadas de ferramentas, aprovações, artefatos e auditoria.

Ainda faltam o agent loop genérico, o catálogo e executor genéricos de ferramentas, o gate de permissões e a interação de aprovação entre os apps. Portanto, a evolução natural é generalizar o fluxo existente de tarefas e o executor Rust, sem conceder acesso irrestrito à máquina.

### Implementado: organização local por tipo

O desktop já reconhece tarefas remotas de organização, seleciona a pasta autorizada indicada (ou Downloads como padrão), monta uma prévia dos arquivos diretamente nessa pasta e aguarda aprovação no desktop ou no celular. Após aprovação, cria subpastas por categoria e move os arquivos sem sobrescrever destinos existentes. São consideradas até 300 entradas por prévia; arquivos em subpastas não são percorridos. A tarefa termina ao aprovar ou cancelar.

Antes da prévia, o executor também encontra grupos de arquivos idênticos pelo hash SHA-256, para arquivos diretamente na pasta com até 512 MB. Duplicados são apenas informados e nunca apagados. Depois de organizar, o desktop oferece desfazer durante a sessão atual, desde que os arquivos não tenham sido alterados ou que um novo arquivo não ocupe o caminho original.

Essa entrega ainda não usa o modelo para planejar ações, não apaga duplicados, não preserva o desfazer após reiniciar o desktop e não fornece histórico detalhado ou uma transação completa de mudanças durante a execução.

## Experiência proposta

1. A pessoa escolhe um desktop online e envia uma instrução pelo celular ou pelo desktop.
2. O backend seleciona o provider/modelo configurado e inicia a tarefa.
3. O agente inspeciona o escopo permitido e prepara um plano de ações.
4. A interface apresenta uma prévia clara: arquivos afetados, operações e eventuais conflitos.
5. Ações que exigem confirmação pausam a tarefa até a pessoa aprovar ou recusar.
6. O desktop executa as ações aprovadas, envia eventos de progresso e retorna um resumo e os artefatos produzidos.

Para tarefas de leitura e análise, o agente pode seguir sem confirmação. Para mudanças de arquivos, deve haver uma prévia antes da execução. Exclusões e sobrescritas sempre exigem confirmação explícita; uma tarefa recusada não deve tentar contornar a decisão com outra ferramenta.

## Primeira entrega: organizar arquivos

Começar por uma tarefa inteiramente local, com resultado fácil de revisar:

> “Organiza minha pasta Downloads por tipo de arquivo e mostra os duplicados.”

O fluxo pode listar arquivos, identificar tipo e tamanho, calcular hashes para detectar duplicados e propor diretórios de destino. Antes de mover ou renomear, apresenta a lista de mudanças. A primeira versão pode deixar duplicados apenas identificados; apagar duplicados deve ser uma ação separada e confirmada individualmente ou em lote, mostrando quais cópias serão removidas.

### Ferramentas iniciais

| Ferramenta | Ação | Permissão inicial |
|---|---|---|
| `fs.list_directory` | Lista conteúdo de uma pasta autorizada | Segura |
| `fs.search_files` | Busca arquivos por nome, tipo ou padrão | Segura |
| `fs.get_file_info` | Lê metadados e calcula hash quando necessário | Segura |
| `fs.create_directory` | Cria pasta dentro do workspace | Segura, se não houver conflito |
| `fs.move_file` | Move ou renomeia um arquivo | Confirmação, especialmente em lote |
| `fs.copy_file` | Copia arquivo sem sobrescrever por padrão | Confirmação |
| `fs.delete_path` | Exclui arquivo/pasta | Confirmação explícita sempre |
| `doc.create_xlsx` | Gera planilha a partir de dados estruturados | Segura para novo arquivo; confirmar sobrescrita |

Cada chamada deve ter schema validado, limites de tamanho/quantidade e resultado estruturado. Caminhos devem ser canonicalizados no executor Rust e permanecer dentro de um workspace habilitado, inclusive ao seguir links simbólicos.

## Agent loop e protocolo de tarefas

O loop deve ficar no backend, que já centraliza autenticação, providers e tarefas. O desktop permanece executor das ferramentas locais.

```text
enquanto houver iterações e orçamento:
  enviar instrução, contexto e catálogo de ferramentas ao modelo
  validar cada chamada contra schema, escopo e política de risco
  se a ação requer confirmação:
    registrar chamada e aprovação pendente
    pausar tarefa e notificar os apps
    retomar somente após decisão válida da pessoa
  senão:
    encaminhar a chamada ao desktop
    registrar resultado e atualizar progresso
retornar resumo final e artefatos
```

O loop precisa de limites de iterações, tempo, arquivos inspecionados, bytes lidos e tamanho de saída. Chamadas do desktop devem ser vinculadas ao usuário, dispositivo e tarefa; chamadas repetidas precisam ser idempotentes ou protegidas contra execução duplicada. Cancelar a tarefa deve impedir novas ações e respeitar uma operação em andamento de forma segura.

Eventos de tarefa podem representar, por exemplo, `plan_ready`, `tool_started`, `approval_required`, `approval_resolved`, `tool_finished`, `progress`, `completed`, `failed` e `cancelled`. O polling atual pode ser mantido na primeira etapa; WebSocket pode substituir ou complementar depois.

## Aprovações e prévia

Uma aprovação deve estar associada a uma chamada específica, com argumentos, escopo, risco, resumo de impacto e expiração. Antes de aprovar, a pessoa precisa entender:

- quais caminhos serão lidos ou alterados;
- quantos arquivos e quantos bytes estão envolvidos;
- se haverá criação, movimento, renomeação, sobrescrita ou exclusão;
- exemplos dos arquivos afetados e conflitos encontrados.

Aprovação vale somente para a ação e os argumentos exibidos. Se o plano ou os arquivos mudarem enquanto aguarda, o desktop deve revalidar as precondições e solicitar nova aprovação quando o impacto for diferente. Não oferecer “permitir sempre” na primeira versão.

## Segunda entrega: dados de site para planilha

Automação web deve ser uma fase separada, depois que o fluxo de ferramentas e aprovações estiver confiável. O navegador adiciona riscos próprios: páginas podem conter instruções maliciosas, sessões autenticadas acessam dados privados e o conteúdo pode mudar entre a prévia e a coleta.

Proposta de evolução:

1. Começar por páginas públicas e leitura sem autenticação.
2. Exibir domínio e dados que serão coletados antes de navegar ou exportar.
3. Tratar conteúdo da página como dado não confiável, nunca como instruções para o agente.
4. Restringir navegação a domínios permitidos pela tarefa e bloquear downloads/executáveis por padrão.
5. Para login, usar sessão controlada no desktop; não pedir nem enviar senhas ao modelo/backend.
6. Mostrar prévia dos registros e colunas antes de gravar a planilha.
7. Criar XLSX em workspace autorizado e confirmar sobrescrita.

Uma integração via API oficial do serviço deve ser preferida quando existir e tiver escopo adequado; automação de interface fica como alternativa para sites sem API utilizável.

## Segurança e privacidade

- **Workspaces são a fronteira:** toda operação de arquivo valida o caminho no desktop, não apenas no backend.
- **Catálogo fechado:** o modelo escolhe ferramentas implementadas; não pode montar comandos shell arbitrários.
- **Menor privilégio:** conceder acesso apenas às pastas escolhidas pela pessoa e apenas às ferramentas necessárias.
- **Confirmação informada:** exclusão e sobrescrita nunca são silenciosas; ações em lote exibem impacto agregado e exemplos.
- **Conteúdo não confiável:** nomes de arquivos, documentos e páginas web não podem substituir as instruções do sistema ou da pessoa.
- **Segredos:** não incluir tokens, cookies, senhas ou conteúdo sensível em logs, eventos ou prompts desnecessários.
- **Auditoria minimizada:** registrar ferramenta, status, horário e digest dos argumentos; evitar copiar conteúdo privado para auditoria.
- **Falhas seguras:** path inválido, workspace removido, conflito inesperado ou aprovação expirada interrompem a ação relacionada.
- **Reversibilidade:** preferir criar cópias ou mover para uma pasta de revisão antes de excluir permanentemente, quando adequado.

## Etapas de implementação

### Etapa 1 — Executor genérico de arquivos (parcial)

- [x] Criar prévia e execução local da organização por tipo, sem sobrescrita.
- [x] Identificar duplicados por SHA-256 e exibi-los sem remover arquivos.
- [x] Permitir desfazer a organização na sessão atual do desktop.
- [ ] Separar as operações de arquivo do fluxo específico de PDFs.
- Implementar catálogo compartilhado e schemas de argumentos/resultados.
- Aplicar validação de workspace, limites e proteção contra traversal e symlinks.
- Adicionar inspeção de arquivos e hashes para duplicados.

**Pronto quando:** tarefas conseguem listar e analisar conteúdo autorizado sem alterar arquivos nem acessar caminhos fora do workspace. A organização inicial já valida o workspace no executor local.

### Etapa 2 — Planejamento e execução revisável

- Criar agent loop com limite de iterações e chamadas de ferramenta.
- Fazer o modelo produzir plano estruturado e chamadas validadas.
- Implementar prévia/dry-run para movimentos e renomeações.
- Executar a tarefa “organizar Downloads” apenas após a revisão da pessoa.

**Pronto quando:** o plano mostra exatamente os arquivos e destinos; a execução revalida conflitos e respeita o escopo.

### Etapa 3 — Aprovação ponta a ponta (parcial)

- [x] Persistir chamadas e decisões de aprovação ligadas à tarefa.
- [x] Permitir pausar, aprovar, recusar, expirar e cancelar.
- [x] Mostrar a solicitação de aprovação no app que iniciou a tarefa e refletir o estado no desktop.
- Auditar decisões e impedir repetição de ações após reconexão.

**Pronto quando:** uma ação que exige confirmação fica parada até uma decisão e não é executada após recusa ou expiração.

### Etapa 4 — Histórico, artefatos e recuperação

- Exibir plano, progresso, decisões e resumo final no histórico de tarefas.
- Associar arquivos gerados como artefatos, com caminho local e metadados.
- Definir retomada, retry e cancelamento sem duplicar efeitos.

**Pronto quando:** a pessoa consegue entender o que foi feito e localizar os arquivos gerados mesmo depois de fechar e reabrir o app.

### Etapa 5 — Navegação web e planilhas

- Definir ferramenta de browser e modelo de sessão/localidade.
- Começar em páginas públicas; validar domínios e tratar página como entrada não confiável.
- Criar prévia tabular e gerar XLSX com schema e tipos de coluna explícitos.
- Adicionar tratamento de autenticação somente com sessão local controlada e consentimento claro.

**Pronto quando:** uma tarefa de coleta aprovada produz uma planilha rastreável, com origem dos dados e sem enviar credenciais ao modelo.

## Decisões em aberto

- Como o backend entrega chamadas ao desktop: polling de comandos, WebSocket ou ambos.
- Quais estados/eventos de tarefa e formatos de plano serão contratos compartilhados.
- Se movimentações em lote podem ser aprovadas como um único conjunto ou exigem aprovação por grupo.
- Política de retenção de planos, argumentos e eventos que possam conter nomes de arquivos privados.
- Tecnologia de automação web e limites de domínio, download e sessões autenticadas.
- Se oferecer desfazer mudanças e por quanto tempo guardar os dados necessários para isso.

## Critérios de conclusão do produto

- A pessoa consegue pedir uma tarefa pelo mobile ou desktop e escolher o computador conectado.
- O desktop só atua em workspaces habilitados e por ferramentas declaradas.
- A pessoa revisa mudanças antes da execução e confirma ações destrutivas ou de alto impacto.
- Progresso, falhas, decisões e resultados ficam visíveis e associados à tarefa.
- Reenvio, desconexão, cancelamento e retry não causam ações duplicadas nem ignoram aprovações.
- A organização de arquivos funciona antes de expandir para navegação web autenticada.
