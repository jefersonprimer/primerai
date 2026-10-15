# Automação web e exportação para planilhas

## Objetivo

Permitir que uma pessoa peça ao PrimerAI para consultar dados em um site e gerar uma planilha dentro de uma pasta autorizada no computador conectado.

Exemplo:

> “Entre no painel de vendas, pegue as vendas de setembro e coloque em uma planilha.”

Essa funcionalidade vem depois da organização local de arquivos. Ela reutiliza tarefas, aprovações, workspaces e o executor do desktop, mas introduz um navegador controlado e sessões potencialmente autenticadas.

## Experiência desejada

```text
Pessoa envia a instrução
        ↓
Agente propõe domínio, página, filtros e colunas
        ↓
Pessoa aprova a coleta
        ↓
Desktop abre navegador controlado
        ↓
Pessoa entra na conta, quando necessário
        ↓
Executor extrai dados estruturados
        ↓
Pessoa revisa uma amostra e aprova a exportação
        ↓
Desktop grava XLSX em workspace autorizado
```

O app deve informar o domínio acessado, os filtros aplicados, as colunas previstas, o máximo de registros e o caminho do arquivo de saída antes de executar cada etapa relevante.

## Arquitetura proposta

### Desktop

O navegador deve rodar no computador da pessoa, junto do executor local. O backend coordena a tarefa e registra o estado, mas não recebe senha, cookie ou token de sessão.

Usar Playwright em um processo auxiliar do desktop é a opção inicial. O processo recebe comandos estruturados por stdin/stdout ou IPC local, devolve eventos e fecha ao terminar a tarefa. O Tauri 2 permite distribuir binários auxiliares no pacote do aplicativo por meio de sidecars. O navegador usado pelo Playwright precisa acompanhar a versão do pacote durante o empacotamento e atualização.

```text
App React/Tauri
       │ comandos Tauri
Executor Rust ──── IPC local ──── Sidecar Playwright
       │                                 │
       └──────── eventos/resultados ─────┘
```

O executor Rust continua sendo a fronteira de segurança: valida caminhos, aplica aprovações e grava artefatos apenas em workspaces autorizados.

### Backend

O backend cria e acompanha a tarefa, persiste o plano aprovado, aprovações, eventos e metadados do artefato. Ele não deve receber o perfil persistente do navegador nem o conteúdo bruto de toda página por padrão.

Novos tipos de evento sugeridos:

- `browser.plan_ready`
- `browser.approval_required`
- `browser.started`
- `browser.login_required`
- `browser.page_loaded`
- `browser.records_extracted`
- `spreadsheet.preview_ready`
- `spreadsheet.created`

## Contrato de ferramentas

O modelo escolhe ferramentas declaradas e argumentos validados. Não recebe uma ferramenta de execução arbitrária de JavaScript, shell ou navegador.

### `browser.collect_table`

Coleta uma tabela ou lista de registros de um domínio previamente aprovado.

```json
{
  "url": "https://painel.exemplo.com/vendas",
  "allowedDomain": "painel.exemplo.com",
  "filters": { "month": "2026-09" },
  "columns": ["pedido", "data", "cliente", "valor", "status"],
  "maxRecords": 500
}
```

O executor devolve registros JSON, contagem, URL final e uma indicação de que houve autenticação manual, sem devolver cookies ou credenciais.

### `browser.wait_for_login`

Abre uma janela visível e aguarda a pessoa terminar o login. Essa ferramenta nunca lê, registra ou envia o formulário de login. Ela só observa se a navegação chegou a uma página autorizada da aplicação.

### `doc.create_xlsx`

Gera um `.xlsx` dentro de um workspace autorizado a partir de dados estruturados já revisados.

```json
{
  "path": "/workspace/Relatorios/Vendas-2026-09.xlsx",
  "sheets": [{
    "name": "Vendas setembro",
    "columns": ["Pedido", "Data", "Cliente", "Valor", "Status"],
    "rows": [["123", "2026-09-01", "Ana", 149.9, "Pago"]]
  }]
}
```

O gerador deve preservar tipos de data e número, criar cabeçalho, congelar a primeira linha, aplicar filtros e rejeitar sobrescrita sem confirmação.

## Aprovações necessárias

| Momento | O que é exibido | Decisão |
|---|---|---|
| Coleta | Domínio, página, filtros, colunas e máximo de registros | Aprovar ou recusar |
| Login | Domínio e aviso de que o login será feito manualmente no computador | Continuar ou cancelar |
| Exportação | Amostra, número de linhas, abas e caminho do XLSX | Criar ou recusar |
| Sobrescrita | Arquivo existente e caminho | Substituir ou escolher outro nome |

Uma aprovação é vinculada aos argumentos apresentados. Mudança de domínio, filtros, colunas, limite ou arquivo de saída exige nova aprovação.

## Segurança e privacidade

- Tratar todo conteúdo de página como dado não confiável, inclusive mensagens que tentem orientar o agente.
- Permitir somente domínio e subdomínios aprovados na tarefa.
- Abrir autenticação em janela visível e deixar a pessoa preencher credenciais.
- Nunca inserir senha, token, cookie ou código de autenticação em prompts, logs, eventos ou banco.
- Usar contexto temporário de navegador por tarefa; perfis persistentes só podem existir mediante decisão explícita de produto e controles de limpeza.
- Bloquear downloads, uploads, pagamentos, exclusões, alterações de configurações e qualquer ação de escrita no site na primeira versão.
- Limitar número de páginas, registros, tempo de navegação, tamanho de dados e domínios redirecionados.
- Guardar no histórico somente metadados necessários: domínio, filtros, quantidade de registros, colunas, data e artefato gerado.
- Aplicar a mesma política de workspaces usada pelo executor de arquivos ao salvar a planilha.

## Ordem de implementação

### 1. Exportação XLSX local

- Implementar `doc.create_xlsx` no desktop.
- Aceitar apenas dados que já estejam estruturados e em tamanho limitado.
- Exibir caminho, abas, colunas e total de linhas antes de gravar.
- Criar artefato e histórico de tarefa.

**Pronto quando:** o desktop gera uma planilha tipada e revisável em um workspace autorizado sem depender de automação web.

### 2. Coleta em páginas públicas

- Criar sidecar Playwright e protocolo versionado de IPC.
- Permitir navegação somente a domínio aprovado e leitura de tabelas/listas.
- Limitar coleta a uma página ou paginação explícita, com máximo de registros.
- Exibir prévia de registros e origem antes de exportar.

**Pronto quando:** uma página pública aprovada gera uma planilha com dados rastreáveis e sem ações de escrita no site.

### 3. Sessão autenticada manual

- Abrir navegador visível para a pessoa fazer login.
- Detectar conclusão por URL/página autorizada, sem observar campos de senha.
- Descartar sessão ao terminar a tarefa na primeira versão.
- Definir expiração, cancelamento e limpeza em caso de falha.

**Pronto quando:** uma pessoa consegue exportar dados da própria conta sem fornecer credenciais ao backend ou ao modelo.

### 4. Conectores por serviço

- Implementar primeiro conector para um serviço escolhido, com rotas, filtros e colunas conhecidos.
- Preferir APIs oficiais quando oferecerem escopo de acesso adequado.
- Manter automação visual somente como alternativa a uma API indisponível.
- Adicionar validações específicas para cada conector e testes com dados de demonstração.

**Pronto quando:** um serviço alvo tem fluxo estável de coleta, mapeamento de dados e mensagens de erro compreensíveis.

## Decisões pendentes

- Primeiro serviço ou painel a suportar.
- Estratégia de distribuição e atualização do browser do Playwright por sistema operacional.
- Linguagem/formato do sidecar e protocolo de comunicação com o executor Rust.
- Se o modo inicial permite apenas páginas públicas ou também login manual.
- Retenção dos dados coletados: somente no desktop, resumo no backend ou upload opcional do artefato.
- Política para APIs oficiais, escopos OAuth e renovação de tokens.
- Formato de limites por tarefa: páginas, registros, bytes, duração e exportações.
