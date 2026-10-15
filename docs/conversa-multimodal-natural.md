# Conversa multimodal natural

## Objetivo

Permitir que a pessoa converse com o PrimerAI por texto, voz, imagens, câmera, compartilhamento de tela e arquivos, mantendo o contexto na mesma conversa. A IA deve conseguir observar o material enviado, responder perguntas sobre ele e, quando houver ferramentas disponíveis, propor ou executar ações com autorização.

Exemplo:

1. “Primer, olha minha tela.”
2. A pessoa compartilha uma tela ou envia uma captura.
3. “Por que isso está dando erro?”
4. O PrimerAI analisa a imagem e explica o problema.
5. “Corrige.”
6. O PrimerAI prepara uma alteração e pede aprovação antes de executá-la, se a ação tiver impacto.

O objetivo não é exigir um modelo que aceite todos os formatos. O PrimerAI deve adaptar os insumos às capacidades do modelo configurado e explicar quando algum formato não puder ser analisado.

## Estado atual

O backend já tem um tipo `ChatTurn` com suporte opcional a imagens e converte imagens para os formatos usados pelos adapters Google e OpenAI compatível. A rota de conversa também aceita anexos de imagem. Há suporte separado a imagens no chat anônimo.

Ainda faltam partes importantes para uma conversa multimodal completa:

- A interface web envia somente texto pelo `sendMessage`.
- O schema compartilhado aceita imagens, mas não áudio, vídeo ou outros arquivos.
- Mensagens persistidas guardam apenas texto; não há entidade ou armazenamento de anexos vinculados à conversa.
- Não há detecção centralizada de capacidade multimodal por modelo.
- Não há fluxo de voz contínua, transcrição/áudio de resposta ou compartilhamento de tela em tempo real no chat.
- As ferramentas do agente já possuem riscos e aprovações, mas o chat conversacional ainda precisa integrar a solicitação e apresentação dessas ações.

## Princípios

- **Uma conversa, várias modalidades:** texto, mídia e ações continuam no mesmo histórico e contexto.
- **Capacidade por modelo:** suporte é determinado por provider e modelo, não pelo nome do provider isoladamente.
- **Degradação explícita:** se o modelo não aceitar uma modalidade, usar uma transformação compatível quando possível e avisar a pessoa.
- **Permissões no dispositivo:** câmera e captura/compartilhamento de tela dependem das permissões nativas e de consentimento visível.
- **Ações revisáveis:** ler e explicar pode ser automático; escrita, execução, envio ou alteração externa segue a política de risco e confirmação existente.
- **Mídia não é instrução:** texto visto em uma tela, imagem ou documento é dado não confiável e não substitui as instruções do sistema.

## Experiência proposta

O composer do chat oferece:

- entrada de texto;
- botão de gravar/ditar;
- anexar imagem ou arquivo;
- capturar/selecionar imagem da câmera;
- iniciar compartilhamento de tela, onde a plataforma permitir;
- prévia e remoção dos itens antes de enviar.

Durante uma sessão de áudio ou tela compartilhada, a interface indica claramente o que está ativo e oferece controles de pausar e encerrar. A pessoa pode interromper o envio sem perder as mensagens anteriores.

Após o envio, a mensagem apresenta anexos com nome, tipo e estado de processamento. A resposta pode apontar para o material analisado, por exemplo: “Na captura, o erro aparece na linha que importa `config`”. Quando não for possível identificar um trecho ou momento exato, o modelo deve dizer isso.

Uma ação sugerida aparece como plano legível, com arquivos, comandos ou mudanças que serão feitos. A pessoa pode aprovar, editar ou cancelar. A confirmação deve ocorrer antes da execução, não depois.

## Compatibilidade de modelos

As capacidades devem ser representadas explicitamente para cada modelo. Uma primeira versão pode usar metadados configurados localmente e permitir ajustes futuros a partir de descoberta feita pelo provider.

```ts
type ModelCapabilities = {
  input: {
    text: boolean;
    image: boolean;
    audio: "none" | "transcription" | "native";
    video: "none" | "frames" | "native";
    files: "none" | "text-extraction" | "native";
  };
  output: {
    text: boolean;
    audio: "none" | "speech" | "realtime";
  };
  realtime: boolean;
  tools: boolean;
};
```

O catálogo atual de modelos expõe `supportsTools`, mas isso não descreve capacidades de entrada e saída multimodais. `supportsTools` também não deve ser usado como proxy para visão ou áudio.

### Estratégia por modalidade

| Entrada | Caminho preferido | Alternativa quando o modelo não aceita o formato |
|---|---|---|
| Imagem/foto | Enviar imagem a um modelo com visão | Informar incompatibilidade; OCR pode ajudar em conteúdo textual, mas não substitui análise visual |
| Voz gravada | Enviar áudio a modelo/serviço de transcrição ou áudio nativo | Transcrever e enviar texto ao modelo de chat |
| Microfone em tempo real | Sessão de áudio nativa, se suportada | Capturar trechos, transcrever e enviar turnos de texto; sem prometer conversa de baixa latência |
| Compartilhamento de tela | Capturar quadros sob demanda ou em intervalos e enviar a modelo com visão | OCR dos quadros, se útil, indicando que detalhes visuais podem se perder |
| PDF/documento | Extrair texto e páginas relevantes; preservar referência ao arquivo | Converter páginas selecionadas em imagens quando houver visão; avisar limites de extração |
| Vídeo | Amostrar quadros e, se necessário, extrair áudio/transcrição | Processar somente áudio ou quadros e declarar qual conteúdo foi analisado |

Não enviar continuamente todos os quadros da tela por padrão. Usar captura sob demanda, mudança relevante de tela ou amostragem com limites definidos pela experiência e pelo custo.

## Arquitetura

```text
Cliente web / desktop / mobile
  ├─ captura autorizada e seleção de arquivos
  ├─ prévias, estado de sessão e controles de interrupção
  └─ upload seguro de anexos e eventos de conversa
                    │
                    ▼
Backend de conversas
  ├─ autenticação e validação de tamanho/tipo
  ├─ metadados de anexos e referências temporárias
  ├─ extração/transcrição/amostragem quando necessário
  ├─ resolução de capacidades do modelo selecionado
  ├─ montagem do contexto multimodal compatível
  └─ fluxo de ferramenta, aprovação e resultado
                    │
                    ▼
Adapter do provider
  └─ conversão do formato canônico para a API específica
```

O cliente é responsável por permissões da câmera e compartilhamento de tela. O backend recebe somente o conteúdo que a pessoa escolheu compartilhar. A sessão de mídia deve ser separada do armazenamento permanente: não gravar áudio/vídeo por padrão quando a pessoa só iniciou uma conversa ao vivo.

### Contrato canônico de mensagem

Em vez de guardar conteúdo multimodal dentro de uma única string, representar partes da mensagem. Exemplo conceitual:

```ts
type MessagePart =
  | { type: "text"; text: string }
  | { type: "image"; attachmentId: string; mimeType: string }
  | { type: "audio"; attachmentId: string; mimeType: string; transcript?: string }
  | { type: "file"; attachmentId: string; mimeType: string; name: string }
  | { type: "screen_frame"; attachmentId: string; capturedAt: string };
```

Os adapters transformam essa estrutura para a API do provider. O cliente não deve escolher diretamente URLs ou formatos arbitrários que o backend repassa ao provider.

## Persistência e API

Uma evolução do schema pode separar mensagens, partes e anexos:

```text
chat_messages
  id, conversation_id, role, created_at

chat_message_parts
  id, message_id, position, type, text, attachment_id, metadata_json

chat_attachments
  id, user_id, storage_key, mime_type, byte_size, original_name
  status, expires_at, created_at
```

O conteúdo binário fica em armazenamento privado de objetos, não em base64 no JSON nem nos registros de mensagem. Para desenvolvimento local, pode haver um adapter de armazenamento; produção deve usar um bucket privado e URLs curtas ou upload assinado.

Rotas conceituais:

```text
POST   /v1/conversations/:id/attachments     inicia upload/recebe anexo
POST   /v1/conversations/:id/messages         envia texto e partes multimodais
GET    /v1/conversations/:id/messages         lista mensagens e metadados de anexos
DELETE /v1/attachments/:id                    remove anexo próprio
POST   /v1/conversations/:id/actions/:id/approve   aprova ação pendente
POST   /v1/conversations/:id/actions/:id/deny      recusa ação pendente
```

Para respostas demoradas, upload e processamento devem expor estados como `uploading`, `processing`, `ready`, `failed` e `expired`. Voz/tela em tempo real pode exigir WebSocket ou WebRTC e deve ter um contrato separado das mensagens convencionais.

## Resolução de capacidades e fallback

Ao enviar uma mensagem, o backend resolve provider e modelo escolhidos e compara cada parte com as capacidades registradas.

1. Se todas as partes forem aceitas, converter e encaminhar diretamente.
2. Se áudio puder ser transcrito, transcrever e anexar a transcrição como parte identificada, preservando metadados de origem.
3. Se arquivo puder ser extraído, extrair texto e páginas dentro dos limites e passar o conteúdo relevante.
4. Se o fallback perder informação relevante — por exemplo, uma imagem sem visão — pedir escolha ou explicar que aquela pergunta exige um modelo compatível.
5. Nunca remover uma mídia silenciosamente nem fingir que o modelo a analisou.

Erros do provider devem ser normalizados. Se um provider aceitar a requisição de texto, mas rejeitar uma modalidade, apresentar uma mensagem útil e permitir trocar de modelo ou tentar um fallback seguro. Não alternar automaticamente para outro provider que possa ter custo, política de retenção ou destino de dados diferente sem informar a pessoa.

## Ações e permissões

O entendimento multimodal não altera o sistema de execução de ferramentas. A IA pode propor uma ferramenta; o backend valida nome, schema, escopo e nível de risco; o agente local executa apenas dentro das permissões autorizadas.

| Tipo de ação | Tratamento |
|---|---|
| Explicar, resumir ou analisar mídia | Executar após envio explícito do conteúdo |
| Ler arquivos dentro de workspace autorizado | Aplicar escopo e limites existentes |
| Criar arquivo novo em local autorizado | Mostrar resultado e caminho; usar as regras atuais de risco |
| Sobrescrever, mover, apagar ou executar comando | Mostrar plano e solicitar aprovação explícita antes de executar |
| Compartilhar tela, câmera ou microfone | Permissão do sistema e indicador de sessão ativo |
| Enviar conteúdo a terceiros | Confirmação específica com destinatário e conteúdo visíveis |

Uma instrução encontrada dentro de um site, arquivo, imagem ou tela pode ser analisada, mas nunca deve autorizar uma ação por si mesma.

## Privacidade, segurança e limites

- Pedir permissões no momento em que forem necessárias e mostrar um indicador persistente durante captura ativa.
- Não iniciar microfone, câmera ou compartilhamento de tela automaticamente por interpretação de texto.
- Explicar qual conteúdo será enviado ao provider configurado; permitir cancelar antes do envio.
- Não manter gravação de áudio ou vídeo de uma sessão ao vivo por padrão.
- Definir limites de tamanho, duração, quantidade de anexos, resolução e quadros por minuto.
- Validar MIME type pelo conteúdo quando possível; não confiar apenas no nome/extensão.
- Isolar anexos por usuário e conversa; links de download devem expirar e exigir autorização.
- Remover temporários após prazo definido, cancelamento ou exclusão da conversa conforme política de retenção.
- Não incluir conteúdo, transcrição, imagem ou credenciais em logs. Registrar apenas identificadores técnicos e erros redigidos.
- Tratar documentos e transcrições como entrada não confiável contra prompt injection.
- Mostrar quando a resposta veio de OCR/transcrição ou de análise direta de mídia.
- Estabelecer limites de custo antes de permitir sessões longas ou processamento de muitos quadros.

## Etapas de implementação

### Etapa 1 — Imagens e anexos no chat

- Unificar o envio do chat web com o suporte a imagens já presente no backend.
- Definir o contrato de partes multimodais e o schema compartilhado.
- Adicionar seleção, prévia, remoção, upload e estado de processamento.
- Persistir metadados e anexos em storage privado, com autorização por usuário.
- Criar capacidades iniciais por modelo para imagem e ferramentas.
- Informar incompatibilidade de modelo sem descartar imagens.

**Pronto quando:** a pessoa envia texto e imagens na mesma mensagem, continua a conversa sobre elas e consegue rever/remover os anexos de acordo com a política de retenção.

### Etapa 2 — Documentos e voz por turno

- Aceitar formatos de documentos selecionados, com limites e extração isolada.
- Implementar gravação curta ou seleção de áudio no mobile/web onde suportado.
- Integrar transcrição como capability separada do chat geral.
- Anexar transcrição à mensagem e permitir corrigir texto antes de enviar, se desejado.
- Adicionar leitura de resposta por voz como opção, com controles de reprodução.

**Pronto quando:** modelos apenas de texto conseguem responder a voz transcrita e a interface identifica claramente transcrição versus entrada de áudio nativa.

### Etapa 3 — Tela e câmera sob demanda

- Implementar captura de imagem da câmera e screenshot/importação nas plataformas disponíveis.
- Implementar compartilhamento de tela iniciado explicitamente e com encerramento visível.
- Enviar quadros sob demanda ou com política de amostragem e limites.
- Permitir apontar a pergunta para um quadro específico ou para o estado atual da tela.
- Definir suporte por plataforma: navegador, Tauri/desktop, Android e iOS.

**Pronto quando:** a pessoa inicia e encerra captura conscientemente, pergunta sobre o conteúdo recebido e sabe quais quadros foram analisados.

### Etapa 4 — Conversa de voz em tempo real

- Adicionar sessões de baixa latência apenas para providers/modelos que ofereçam áudio em tempo real.
- Definir transporte, autenticação efêmera e encerramento de sessão.
- Suportar interrupção da fala da IA, cancelamento e recuperação de rede.
- Oferecer fallback por turnos com transcrição para modelos sem áudio nativo.
- Indicar no produto se a sessão está em tempo real ou em modo de transcrição.

**Pronto quando:** a conversa funciona com latência e interrupção aceitáveis nos modelos compatíveis e o fallback não é apresentado como experiência equivalente.

### Etapa 5 — Ações sobre o que foi visto

- Integrar respostas multimodais ao fluxo atual de tarefas e aprovações.
- Mostrar diff, caminhos, comandos e impacto antes de ações confirmáveis.
- Associar execução ao dispositivo/workspace explicitamente escolhido.
- Registrar resultado e permitir desfazer quando houver suporte técnico.

**Pronto quando:** “corrige” pode virar uma proposta rastreável e nenhuma ação de risco acontece sem aprovação explícita.

## Questões para decisão

- Quais plataformas entram primeiro para câmera, áudio e compartilhamento de tela?
- O MVP deve focar chat web com imagem/documento ou começar pela voz no mobile?
- Qual storage privado estará disponível em produção e qual prazo de retenção será adotado?
- A seleção de modelo será manual ou o PrimerAI poderá sugerir um modelo compatível antes do envio?
- Quais providers terão suporte de voz em tempo real na primeira entrega?
- Qual limite inicial de tamanho, duração e custo por conversa multimodal?
- A pessoa poderá manter anexos na conversa por tempo indefinido ou escolher retenção ao anexar?

## Critérios de aceite gerais

- Texto, imagem e arquivo podem coexistir na mesma mensagem e manter ordem/contexto.
- O modelo escolhido recebe somente modalidades que seu adapter suporta.
- Fallbacks são visíveis e não escondem perda de informação.
- Upload, consulta e exclusão de anexos respeitam a propriedade do usuário.
- Permissões de captura são explícitas e a sessão tem controles de pausa/encerramento.
- Ações de risco passam pelo fluxo existente de confirmação e autorização.
- Erros de formato, tamanho, provider e permissão são apresentados sem expor chaves ou conteúdo privado em logs.
