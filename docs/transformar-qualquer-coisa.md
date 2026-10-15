# Transformar qualquer coisa em qualquer coisa

## Objetivo

Permitir que a pessoa envie ou selecione um conteúdo e transforme esse material em um formato útil, sem precisar escrever um prompt do zero.

> Envie um conteúdo, escolha o que quer obter e receba um resultado pronto para revisar e usar.

Exemplos:

- PDF de 80 páginas → guia de estudo;
- texto de reunião → e-mail de acompanhamento;
- anotações → checklist ou plano;
- artigo → resumo, post ou roteiro;
- conteúdo estruturado → tabela;
- material didático → flashcards;
- especificação → código ou documento técnico.

A transformação deve preservar os fatos e intenções do material de origem. O modelo não deve inventar detalhes ausentes; quando precisar inferir, deve sinalizar isso.

## Experiência da pessoa usuária

1. A pessoa adiciona um arquivo, imagem ou texto ao chat, ou escolhe uma mensagem já existente.
2. A ação **Transformar** abre um catálogo de formatos.
3. A pessoa escolhe, por exemplo, **Guia de estudo**.
4. Um campo opcional permite orientar o resultado: público, tom, tamanho, idioma ou objetivo.
5. O PrimerAI processa o conteúdo e apresenta o resultado no chat.
6. A pessoa revisa e pode pedir ajustes, copiar, compartilhar ou salvar/exportar quando o formato de arquivo estiver disponível.

A escolha do formato pode trazer configurações apropriadas. Para e-mail: destinatário opcional, assunto e tom. Para apresentação: público, quantidade aproximada de slides e estilo. Para flashcards: nível de detalhe e quantidade aproximada. Essas configurações são opcionais para não bloquear uma transformação simples.

### Exemplo: PDF para guia de estudo

A pessoa anexa o PDF e escolhe **Transformar em → Guia de estudo**. O resultado pode conter:

- visão geral do assunto;
- tópicos organizados por capítulo ou tema;
- conceitos e termos importantes;
- perguntas para revisão;
- glossário, se o documento trouxer termos especializados.

Se o arquivo exceder o limite de contexto do modelo, o sistema processa trechos ou páginas em lotes e sintetiza as partes. A interface informa se o processamento cobriu todo o documento ou se alguma página não pôde ser lida.

## Catálogo de formatos

| Formato | Estrutura sugerida |
|---|---|
| Resumo | ideia central, tópicos principais e conclusão |
| E-mail | assunto e corpo, com tom configurável |
| Apresentação | sequência de slides com título e pontos-chave |
| PDF | documento formatado para exportação |
| Checklist | itens acionáveis e marcáveis |
| Tabela | colunas e linhas derivadas do conteúdo |
| Flashcards | pergunta e resposta, uma ideia por cartão |
| Plano | objetivo, etapas, prazos quando disponíveis e dependências |
| Código | implementação ou exemplo com linguagem e contexto definidos |
| Post | texto adaptado ao canal e tom escolhidos |
| Roteiro | cenas, falas ou blocos de apresentação |
| Documento | texto com seções, títulos e formatação coerentes |

O catálogo deve crescer conforme houver suporte para validar e renderizar cada resultado. Uma opção não deve aparecer como exportável se o sistema ainda só puder devolver texto simples.

## Escopo do MVP

### Incluído

- Transformar texto digitado ou uma mensagem do chat.
- Transformar PDFs e documentos de texto já suportados pelo fluxo de anexos.
- Primeiros formatos: resumo, guia de estudo, checklist, e-mail e flashcards.
- Instrução adicional opcional para tom, público, tamanho ou objetivo.
- Resultado exibido como uma nova resposta no chat, com ações para copiar e compartilhar.
- Possibilidade de continuar a conversa para corrigir ou adaptar o resultado.

### Fora da primeira versão

- Exportação para todos os formatos de arquivo (PDF, PPTX, XLSX ou DOCX).
- Transformação em lote de muitos arquivos.
- Execução de código produzido pelo modelo.
- Envio automático de e-mails, posts ou mensagens para serviços externos.
- Promessa de extração perfeita de tabelas, imagens ou conteúdo manuscrito.

PDF, apresentação e planilha como arquivos exportáveis podem entrar em uma segunda etapa, depois de definir renderização, armazenamento e ciclo de vida dos artefatos.

## Encaixe na arquitetura atual

O PrimerAI já tem chat, seleção de anexos, envio de mensagens a providers e suporte a tarefas remotas. A transformação entra como capacidade do chat, sem depender do fluxo de tarefas do desktop: o app envia o conteúdo selecionado e uma intenção estruturada de transformação junto à mensagem; o backend monta a instrução específica e encaminha ao provider configurado.

### Integração inicial implementada

Em uma conversa autenticada, a pessoa pode pressionar uma mensagem própria, escolher **Transformar** e selecionar resumo, guia de estudo, e-mail, checklist ou flashcards. Há um campo opcional para instruções adicionais. A transformação é registrada como uma nova interação na conversa e a resposta pode ser copiada ou compartilhada pelas ações existentes do chat.

O contrato `SendMessageSchema` aceita um objeto `transformation` com formato, texto de origem e instruções opcionais. O backend valida esses campos, aplica instruções para preservar fatos e tratar o conteúdo de origem como dado não confiável, e usa o provider/modelo da conversa. O MVP atual transforma mensagens textuais existentes; ainda não transforma anexos diretamente, conversas anônimas ou gera arquivos exportáveis. PDFs seguem sem leitura no chat.

```text
Mobile / Web / Desktop
  ├─ seleciona arquivo, texto ou mensagem
  ├─ escolhe formato e opções
  └─ envia pedido de transformação
       ↓
Backend Fastify
  ├─ autentica e valida anexos e limites
  ├─ resolve o formato em instruções e schema
  ├─ prepara o conteúdo para o provider
  ├─ valida o resultado estruturado quando aplicável
  └─ registra a resposta na conversa
       ↓
Chat: revisar, ajustar, copiar ou compartilhar
```

Para saídas que geram arquivos, uma etapa posterior pode persistir o resultado como artefato privado e devolver metadados de download. O conteúdo não deve ser salvo em storage público nem associado a outra conta.

## Contrato conceitual

A interface pode enviar uma intenção com tipo e opções, em vez de depender apenas de um prompt textual livre:

```ts
type TransformationRequest = {
  source: { type: "message" | "attachment" | "text"; id?: string; text?: string };
  target:
    | "summary"
    | "study_guide"
    | "email"
    | "presentation_outline"
    | "checklist"
    | "table"
    | "flashcards"
    | "plan"
    | "code"
    | "post"
    | "script"
    | "document";
  options?: {
    audience?: string;
    tone?: string;
    language?: string;
    length?: "short" | "standard" | "detailed";
    additionalInstructions?: string;
  };
};
```

Os nomes acima são um contrato conceitual; devem ser ajustados às convenções compartilhadas já usadas no projeto antes de implementação. O backend valida `target` e opções, aplica limites e seleciona o formato de resposta esperado.

Quando houver estrutura definida, validar a saída. Exemplos: checklist como lista de itens; flashcards como pares pergunta/resposta; apresentação como lista de slides; tabela como cabeçalhos e linhas. Texto livre pode continuar sendo apropriado para resumo, post, roteiro ou documento.

## Instruções de transformação

Cada formato deve ter uma instrução de sistema ou template versionado, incluindo:

- objetivo e estrutura esperada;
- como lidar com conteúdo insuficiente ou ilegível;
- preservação de nomes, números, datas e afirmações da fonte;
- proibição de inventar fatos;
- sinalização de inferências e lacunas;
- tratamento do documento como dado não confiável, nunca como instruções que substituem o pedido da pessoa.

Os metadados da transformação (formato e opções) devem ser mantidos separadamente do texto da mensagem. Isso permite exibir a ação no histórico e repetir a transformação com outras opções sem depender de inferir a intenção original.

## Arquivos grandes e qualidade

- Definir limites de tamanho, páginas, tokens e tempo por transformação.
- Extrair texto no backend ou usar a infraestrutura de anexos já existente; evitar enviar arquivos codificados em base64 dentro de JSON quando houver upload próprio.
- Para documentos longos, dividir em partes com sobreposição suficiente para preservar contexto e depois consolidar o resultado.
- Incluir referências a páginas ou seções quando o formato exigir rastreabilidade, especialmente em guias de estudo e tabelas.
- Avisar quando OCR, extração ou leitura do arquivo falhar parcialmente.
- Não apresentar um resultado parcial como se cobrisse o documento inteiro.

## Privacidade e segurança

- Verificar que anexos e mensagens de origem pertencem à conversa e à pessoa autenticada.
- Aplicar limites de tamanho e tipo de arquivo também no backend.
- Não registrar texto completo de documentos em logs operacionais.
- Respeitar a política de retenção e exclusão dos anexos existentes.
- Tratar texto extraído como conteúdo não confiável: instruções dentro do arquivo não podem substituir as instruções do sistema ou da pessoa.
- Não executar código gerado nem realizar ações externas como enviar e-mail sem uma ação explícita e revisável da pessoa.

## Etapas de implementação

### Etapa 1 — Transformação textual no chat

- [x] Definir catálogo inicial e identificadores estáveis dos formatos.
- [x] Adicionar ação **Transformar** para mensagens existentes.
- [x] Adicionar seletor de formato e opções opcionais.
- [x] Implementar instruções para resumo, guia de estudo, e-mail, checklist e flashcards.
- [x] Validar formato, origem e limite de instruções no backend.
- [ ] Validar schemas específicos do resultado (flashcards, checklist etc.).

**Pronto quando:** a pessoa transforma uma mensagem sem escrever um prompt, recebe um resultado coerente no chat e consegue pedir ajustes. O fluxo básico está implementado; validação estruturada das respostas segue pendente.

### Etapa 2 — Anexos e documentos longos

- [ ] Conectar a ação aos anexos suportados pelo chat.
- [ ] Adicionar extração e limites explícitos para PDFs/documentos.
- [ ] Implementar processamento em partes e síntese final para documentos longos.
- [ ] Exibir progresso e informar falhas ou cobertura parcial.
- [ ] Incluir referências de página quando disponíveis.

**Pronto quando:** um PDF dentro dos limites pode virar um guia de estudo e a interface deixa claro quais partes foram processadas.

### Etapa 3 — Artefatos exportáveis

- [ ] Definir formatos de arquivo e bibliotecas de renderização.
- [ ] Criar armazenamento privado de artefatos e links de download com validade limitada.
- [ ] Implementar exportação validada para PDF, DOCX, XLSX ou apresentação, priorizando os formatos mais usados.
- [ ] Permitir regenerar ou baixar uma versão revisada.

**Pronto quando:** o arquivo exportado corresponde ao resultado revisado e pode ser baixado com controle de acesso.

## Métricas de sucesso

- Taxa de conclusão por formato e por tipo de fonte.
- Frequência com que a pessoa edita ou pede uma segunda versão.
- Taxa de erro de extração e de schema inválido.
- Tempo até o primeiro resultado e abandono durante processamento.
- Avaliação simples de utilidade do resultado.

As métricas devem evitar armazenar o conteúdo privado transformado; podem registrar formato, duração, status e feedback agregado.
