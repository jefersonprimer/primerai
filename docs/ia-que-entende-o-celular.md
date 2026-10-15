# IA que entende o celular

## Objetivo

Transformar o PrimerAI em um assistente operacional no celular: a pessoa fornece uma instrução em linguagem natural e imagens, documentos ou uma tela, e o aplicativo produz um resultado útil ou prepara uma ação para revisão.

Exemplos:

- “Transforma essas 12 fotos em um PDF e manda para o João.”
- “Resume essas imagens.”
- “Pega os dados desse boleto.”
- “Traduz o que está nessa tela.”
- “Tenho uma prova amanhã. Analisa essas fotos e monta um resumo para eu estudar.”

O modelo interpreta o pedido e organiza o trabalho, mas não ganha controle irrestrito do aparelho. Ele só pode solicitar ferramentas declaradas pelo aplicativo, com argumentos validados e confirmação da pessoa nas ações externas ou sensíveis.

## Estado atual

O app mobile já permite capturar uma foto, escolher imagens da galeria e enviá-las ao chat. Hoje o limite é de quatro imagens, com envio em base64, e o backend repassa as imagens ao provider de IA. O app também já usa o compartilhamento nativo para compartilhar uma mensagem de texto.

Ainda não existem no fluxo mobile:

- geração de PDF a partir de fotos;
- análise estruturada de boletos e outros documentos;
- seleção de contato e compartilhamento de arquivo gerado;
- captura de tela e tradução sobreposta;
- tarefas multimodais com progresso, artefatos e aprovações.

O catálogo compartilhado contém `doc.create_pdf`, mas essa ferramenta foi concebida para gerar PDF de texto no desktop. A experiência mobile exige uma ferramenta separada, que preserve imagens, ordem, orientação e qualidade do documento.

## Experiência proposta

```text
Pessoa escreve ou dita o pedido e anexa fotos/tela
                         ↓
IA identifica a intenção, os insumos e a ação pretendida
                         ↓
App executa ferramentas locais e/ou análise multimodal
                         ↓
Mostra prévia do resultado e impacto da ação
                         ↓
Pessoa confirma compartilhamento, contato ou outra ação externa
                         ↓
App entrega, salva ou compartilha o artefato
```

Uma tarefa deve sempre deixar claro o que ocorreu: imagens usadas, dados extraídos, arquivo gerado, destino escolhido e eventuais falhas. A pessoa pode cancelar enquanto a tarefa estiver processando.

## Casos de uso iniciais

### Fotos para PDF e compartilhamento

1. A pessoa seleciona ou fotografa até 12 páginas.
2. O app corrige rotação, detecta bordas e oferece reordenação simples.
3. A ferramenta gera um PDF temporário localmente, sem enviar as imagens ao servidor apenas para montar o arquivo.
4. A IA sugere um nome de arquivo, se necessário.
5. O app mostra a prévia e abre o compartilhamento nativo após confirmação.

Na primeira versão, “mandar para o João” deve abrir o seletor de compartilhamento do sistema com o PDF pronto. A associação automática entre um nome e um contato, bem como o envio silencioso para WhatsApp, e-mail ou outro app, fica fora do escopo: além de variar por plataforma, exigiria permissões e confirmação mais cuidadosas.

### Resumo de imagens e material de estudo

1. A pessoa seleciona fotos de páginas, quadro ou anotações.
2. O app otimiza as imagens e envia somente as necessárias ao modelo multimodal.
3. A resposta inclui resumo, tópicos centrais, conceitos que exigem atenção e perguntas de revisão.
4. A pessoa pode exportar o material como PDF, DOCX ou texto compartilhável.

O resultado deve indicar quando uma imagem está borrada, cortada ou ilegível, em vez de inventar conteúdo.

### Leitura de boleto

1. A pessoa fotografa ou seleciona o boleto.
2. OCR e visão extraem os campos relevantes: beneficiário, vencimento, valor e linha digitável/código de barras.
3. O app mostra os campos e marca valores com baixa confiança para conferência.
4. A pessoa pode copiar dados ou compartilhar o resumo.

O PrimerAI não deve efetuar pagamento, abrir o banco nem assumir que um código extraído é correto. A leitura é assistiva; o valor, o destinatário e a data precisam ser confirmados pela pessoa no aplicativo de pagamento.

### Tradução de tela

No Android, o usuário pode conceder permissão temporária de captura de tela. O app captura a tela atual, extrai o texto, traduz e mostra o resultado no próprio PrimerAI; uma camada flutuante pode ser avaliada depois.

No iOS, a captura e automação de outros apps são mais restritas. A primeira experiência deve aceitar screenshot compartilhado ou importado para o PrimerAI, usando os mecanismos permitidos pelo sistema.

## Arquitetura

```text
App mobile
  ├─ entrada: câmera, galeria, arquivos e captura permitida de tela
  ├─ ferramentas locais: pré-processamento, PDF, armazenamento temporário e share sheet
  └─ interface de tarefa, prévia e confirmação
                    │ HTTPS
                    ▼
Backend
  ├─ autenticação, criação de tarefa, progresso e artefatos
  ├─ orquestração de análise multimodal
  └─ política de limites, retenção e auditoria mínima
                    │
                    ▼
Provider de IA
  └─ interpretação de imagens, OCR complementar, extração e resposta estruturada
```

O backend coordena a tarefa e chama o provider de IA quando a análise exige um modelo. Ele não deve executar ações no telefone. A decisão de criar arquivos, salvar na galeria, abrir o compartilhamento ou acessar uma captura continua no app mobile.

### Ferramentas mobile propostas

| Ferramenta | Responsabilidade | Risco |
|---|---|---|
| `mobile.prepare_images` | Corrigir orientação, limitar tamanho e criar miniaturas | Seguro |
| `mobile.create_image_pdf` | Criar PDF local a partir de imagens ordenadas | Seguro, com prévia |
| `mobile.extract_document_data` | Solicitar extração estruturada de documento | Seguro para leitura |
| `mobile.capture_screen` | Capturar a tela mediante permissão do sistema | Confirmação do sistema |
| `mobile.share_file` | Abrir o seletor nativo para um arquivo gerado | Confirmação da pessoa |
| `mobile.save_file` | Salvar arquivo em local escolhido | Confirmação se substituir |

Os nomes e schemas devem ficar em `packages/shared`, mas a implementação permanece nativa no app mobile. Cada ferramenta recebe apenas URIs temporárias autorizadas pela tarefa; ela não recebe acesso geral ao armazenamento do dispositivo.

## Dados, privacidade e segurança

- Pedir acesso à câmera, fotos e arquivos somente quando a pessoa iniciar uma ação que dependa deles.
- Processar localmente o que não precisa da IA, como ordenar imagens e gerar PDF.
- Antes de enviar conteúdo para um provider, informar que as imagens serão analisadas pelo modelo configurado e permitir cancelar.
- Preferir imagens reduzidas para análise; manter a resolução necessária apenas para o PDF final.
- Guardar arquivos temporários em área privada do app e removê-los após expiração ou conclusão, salvo se a pessoa escolher salvar ou compartilhar.
- Não registrar imagens, linha digitável, dados de boleto, contatos ou conteúdo extraído nos logs do backend.
- Usar respostas estruturadas e validação de schema para documentos, em vez de interpretar texto livre como dados de pagamento.
- Nunca compartilhar, enviar mensagem, pagar, excluir ou substituir arquivos sem uma interação explícita da pessoa.
- Tratar texto presente em imagem ou tela como conteúdo não confiável, nunca como instrução para mudar a política da tarefa.

## Limites iniciais

| Recurso | Limite inicial sugerido |
|---|---|
| Imagens por tarefa de PDF | 12 |
| Imagens por tarefa de análise | 12, com loteamento se necessário |
| Tamanho total enviado para IA | 20 MB após otimização |
| Duração de processamento | 90 segundos antes de oferecer retry |
| Retenção de arquivo temporário | Até 24 horas, ou remoção logo após compartilhar |

Os números precisam ser ajustados após medir desempenho em aparelhos reais e custos dos providers. Falhas parciais devem preservar a lista de imagens e permitir tentar novamente, sem duplicar compartilhamentos ou arquivos finais.

## Etapas de implementação

### Etapa 1 — PDF local a partir de fotos

- Permitir selecionar até 12 imagens e exibir grade com remoção e reordenação.
- Adicionar correção de orientação e compressão controlada.
- Implementar geração de PDF local no Android e iOS.
- Criar prévia, nome editável e compartilhamento pelo share sheet nativo.
- Exibir progresso e limpar o arquivo temporário depois da conclusão.

**Pronto quando:** a pessoa cria um PDF de fotos e o compartilha por qualquer app disponível no sistema, sem que as imagens precisem passar pelo backend.

### Etapa 2 — Tarefas de análise multimodal

- Criar entidade de tarefa mobile com estados `queued`, `processing`, `preview_ready`, `completed`, `failed` e `cancelled`.
- Ampliar o limite atual de anexos e preparar envio em lotes.
- Definir contrato estruturado para resumo, material de estudo, tradução e extração de documento.
- Mostrar fontes/imagens analisadas, avisos de baixa legibilidade e resultado copiável/exportável.
- Persistir no backend somente o estado e metadados indispensáveis; o conteúdo deve seguir a política de retenção definida.

**Pronto quando:** o app gera resultados consistentes para um conjunto de fotos e informa claramente o que não conseguiu ler.

### Etapa 3 — Boleto e documentos estruturados

- Adicionar schema validado para beneficiário, valor, vencimento, código e confiança por campo.
- Usar OCR local quando viável e visão do provider como complemento.
- Destacar incertezas e permitir copiar cada campo individualmente.
- Cobrir documentos comuns com testes de imagens sintéticas e casos de baixa qualidade.

**Pronto quando:** a leitura oferece dados revisáveis e nunca se apresenta como confirmação de pagamento ou autenticidade do documento.

### Etapa 4 — Tradução de tela

- Implementar importação de screenshot em ambas as plataformas.
- No Android, avaliar captura de tela sob consentimento por sessão.
- Exibir texto original, tradução e opção de copiar/compartilhar.
- Investigar uma sobreposição somente após validar permissões, consumo de bateria e regras das lojas.

**Pronto quando:** uma captura compartilhada com o app pode ser traduzida de forma legível e segura em Android e iOS.

### Etapa 5 — Comandos operacionais compostos

- Interpretar pedidos como “crie o PDF e compartilhe”.
- Produzir um plano visível: insumos, nome do arquivo e ação externa prevista.
- Exigir confirmação imediatamente antes de abrir o compartilhamento ou salvar fora da área privada.
- Adicionar histórico de tarefas e artefatos, com limpeza e controles de privacidade.

**Pronto quando:** pedidos compostos são executados por etapas, com prévia e confirmação antes de qualquer efeito externo.

## Decisões em aberto

- Biblioteca ou implementação nativa para criar PDF com imagens em Expo, incluindo qualidade, orientação e metadados.
- Política de retenção de anexos e resultados no backend e no dispositivo.
- Providers/modelos multimodais suportados e custo máximo por tarefa.
- Estratégia de OCR local versus OCR/visão no provider.
- Se os resultados de estudo serão salvos como conversa, tarefa independente ou ambos.
- Escopo de contatos: apenas share sheet inicial ou integração explícita com contatos em uma fase posterior.
- Viabilidade e UX da captura contínua/overlay no Android, mantendo no iOS o modelo de screenshot importado.

## Critérios de conclusão do primeiro lançamento

- A pessoa cria PDF de até 12 fotos, revisa a ordem e compartilha pelo seletor nativo.
- A pessoa envia fotos para resumo, tradução ou estudo e recebe um resultado que informa limitações de leitura.
- A leitura de boleto apresenta campos estruturados e avisos de confiança, sem efetuar pagamentos.
- Toda ação que exporta, salva fora do app ou compartilha exige confirmação explícita.
- Arquivos temporários e dados sensíveis não ficam expostos em logs ou armazenados além da política definida.
