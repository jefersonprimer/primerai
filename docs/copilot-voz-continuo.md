# Copilot por comando de voz contínuo e discreto

## Objetivo

Permitir que a pessoa converse com o PrimerAI por voz no celular com baixa latência, detecção automática de pausas e estilos de resposta configuráveis. A sessão deve poder continuar com a tela bloqueada e usar fones Bluetooth quando o sistema operacional disponibilizar essa rota de áudio.

“Discreto” significa uma experiência acessível sem manter o app aberto na tela: a pessoa inicia a sessão conscientemente, pode bloquear o celular e continua vendo os indicadores e controles exigidos pelo sistema. O recurso não deve escutar antes de ser iniciado nem esconder o uso do microfone.

## Estado atual

- O chat mobile está em `primerai-mobile/src/app/index.tsx` e envia mensagens pelo endpoint autenticado de conversas.
- `primerai-mobile/src/lib/api.ts` encapsula as chamadas do chat.
- `backend/src/routes/conversations.ts` monta o contexto, chama `completeChat` e persiste as mensagens. O fluxo atual é por turno e não transmite áudio nem texto em streaming.
- `packages/shared/src/providers.ts` já define capacidades opcionais para entrada e saída de áudio e suporte a tempo real: `input.audio`, `output.audio` e `realtime`.
- `docs/conversa-multimodal-natural.md` descreve voz por turno e conversa de voz em tempo real como etapas distintas.
- O app usa Expo SDK 57. Ainda não há dependência de áudio ou configuração de gravação em segundo plano no `primerai-mobile/app.json`.

## Experiência do usuário

### Início e encerramento

1. A pessoa toca no botão de voz no chat.
2. O app explica o uso do microfone na primeira ativação e solicita a permissão do sistema.
3. A sessão começa com um indicador persistente de microfone ativo, estado da conexão e controles para silenciar, interromper a resposta e encerrar.
4. A pessoa pode bloquear a tela. O sistema continua a sessão somente enquanto a plataforma permitir e o serviço nativo estiver ativo.
5. Encerrar a sessão interrompe captura e reprodução, fecha a conexão com o provider e remove buffers temporários.

Não iniciar o microfone por wake word em segundo plano na primeira versão. O recurso começa por ação explícita no app ou, se implementado depois, por um controle do sistema operacional já autorizado.

### Conversação

- O app detecta pausas para determinar o fim de cada fala, sem exigir que a pessoa pressione “enviar”.
- A pessoa pode interromper o assistente enquanto ele fala; o áudio de saída para imediatamente e o próximo turno começa.
- Exibir a transcrição reconhecida durante ou após cada turno. Quando a confiança for baixa, pedir que a pessoa repita ou confirme.
- Se a rede cair, informar o estado e oferecer reconexão ou encerramento. Não descartar silenciosamente o turno que ainda não foi confirmado.
- Manter texto, transcrições e respostas de voz na mesma conversa. Não persistir áudio bruto por padrão.

### Modos de voz

Oferecer três estilos selecionáveis:

| Modo | Orientação de resposta |
|---|---|
| Executivo | Direto, conciso, com conclusão e próximos passos primeiro. |
| Amigável | Conversacional, acolhedor e natural, sem perder precisão. |
| Didático | Explicação gradual, termos definidos e exemplos quando ajudarem. |

O modo altera as instruções de resposta do assistente, não o reconhecimento de fala. Separar essa preferência da escolha da voz sintetizada. Guardar o modo na sessão/conversa e enviá-lo ao backend como valor enumerado validado; não aceitar instruções arbitrárias do cliente como configuração de sistema.

## Escopo por entrega

### Entrega 1 — Voz por turnos

Implementar primeiro uma experiência compatível com modelos de texto:

- captura de um turno curto;
- transcrição por serviço/provider configurado;
- visualização e correção opcional antes do envio;
- envio da transcrição pelo endpoint atual de mensagens;
- leitura da resposta com controles de reprodução e interrupção;
- escolha dos três modos de resposta.

Essa etapa permite validar permissões, interface, acessibilidade, transcrição e modos sem apresentar o fluxo como conversa em tempo real. Se o modelo não aceitar áudio, o app usa a transcrição como texto e deixa claro esse fallback.

### Entrega 2 — Áudio em tempo real

Adicionar sessões bidirecionais de baixa latência para providers/modelos compatíveis:

- transporte em tempo real, preferencialmente WebRTC quando o provider oferecer suporte adequado; WebSocket pode ser usado quando a API exigir;
- detecção de atividade de voz e pausas (VAD), com limiares ajustáveis e cancelamento de falsos finais;
- áudio de entrada e saída em chunks, transcrição parcial/final e eventos de estado;
- interrupção (barge-in), cancelamento de respostas e recuperação de conexão;
- suporte ao modo de resposta dentro das instruções da sessão;
- fallback por turnos para modelos sem áudio em tempo real, identificado claramente na interface.

Não encaminhar a chave permanente do provider ao aplicativo. O backend autentica a pessoa, verifica provider/modelo e limites, e cria credenciais efêmeras e restritas quando o provider suportar esse mecanismo. Quando a conexão precisar passar pelo backend, validar sessão e usuário, limitar duração/taxa e não registrar áudio ou credenciais em logs.

## Arquitetura proposta

```text
Chat mobile
  ├─ controles da sessão, transcrição e modo de resposta
  ├─ captura/reprodução e roteamento de áudio do sistema
  └─ sessão de áudio autenticada ou upload por turno
                 │
                 ▼
Backend PrimerAI
  ├─ autenticação e autorização por usuário/conversa
  ├─ resolução de provider, modelo e capabilities
  ├─ criação de sessão efêmera ou relay de eventos
  ├─ aplicação segura do modo de resposta
  └─ persistência de texto/transcrição, sem áudio bruto por padrão
                 │
                 ▼
Provider de IA/voz
  └─ áudio em tempo real, transcrição e/ou resposta falada
```

Manter o contrato de voz independente do provider. Uma interface interna pode abstrair criação e encerramento da sessão, eventos recebidos e envio de áudio, enquanto adapters convertem o protocolo específico do provider. A capability `realtime` existente é um começo, mas deve ser resolvida por modelo e provider e não presumida apenas pelo nome do provider.

Eventos conceituais da sessão:

```ts
type VoiceSessionEvent =
  | { type: "session.ready"; sessionId: string; expiresAt: string }
  | { type: "input.speech_started" }
  | { type: "input.transcript.partial"; text: string }
  | { type: "input.transcript.final"; text: string }
  | { type: "output.text.delta"; text: string }
  | { type: "output.audio.chunk"; data: string; format: string }
  | { type: "output.interrupted" }
  | { type: "session.error"; code: string; message: string }
  | { type: "session.closed" };
```

O payload binário de áudio não deve ser persistido em mensagens como base64. Persistir mensagens de texto e transcrições usando o modelo atual de conversa; se futuramente houver necessidade de anexar áudio, usar armazenamento privado com autorização, limites e retenção explícitos.

## API conceitual

As rotas finais dependem do protocolo do provider, mas a separação de responsabilidades deve ser semelhante a:

```text
POST /v1/conversations/:id/voice-sessions
  body: { mode: "executive" | "friendly" | "didactic" }
  retorna configuração efêmera e restrita da sessão

POST /v1/conversations/:id/voice-sessions/:sessionId/close
  encerra/revoga a sessão e finaliza o turno
```

Se forem usados eventos via backend, validar cada conexão com o token normal da conta e associá-la a uma sessão/conversa pertencente ao usuário. Nunca aceitar `providerId`, URL arbitrária ou chave de API fornecida pelo cliente sem validação e autorização no servidor.

## Áudio em segundo plano e Bluetooth

O app só deve continuar capturando após a pessoa iniciar a sessão em primeiro plano. Bloquear a tela não deve ativar o microfone por si só.

- **Expo:** o projeto está no SDK 57; consultar a documentação versionada do `expo-audio` antes de implementar. A inclusão de módulo nativo requer build de desenvolvimento, não apenas Expo Go.
- **iOS:** continuar gravação com a tela bloqueada requer categoria/configuração de sessão de áudio e o modo de background apropriado no `Info.plist`. Chamadas, alarmes, interrupções do sistema e políticas da plataforma podem suspender a captura.
- **Android:** gravação em segundo plano requer serviço em primeiro plano do tipo microfone, permissão correspondente e notificação persistente com ação para parar. Restrições de início de serviço e permissão de microfone variam com a versão do Android.
- **Bluetooth:** selecionar a rota disponível para microfone e saída, reagir a conexão/desconexão e mostrar quando o áudio voltou ao aparelho. O microfone Bluetooth pode ter qualidade, codec e latência diferentes do microfone interno.
- **Ciclo de vida:** tratar chamadas, alarmes, perda de foco, revogação de permissão, troca de dispositivo, desconexão e encerramento forçado. Se o sistema interromper a sessão, informar a pessoa e não fingir que continua ativa.

Referências oficiais a conferir durante a implementação:

- [Expo Audio — SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)
- [Apple — continuar gravação em segundo plano](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/record)
- [Apple — gravação de alta qualidade via Bluetooth](https://developer.apple.com/documentation/avfoundation/avcapturesession/configuresapplicationaudiosessionforbluetoothhighqualityrecording)
- [Android — restrições para iniciar foreground services em segundo plano](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- [Android — declarar foreground services](https://developer.android.com/develop/background-work/services/fgs/declare)

## Privacidade, segurança e custos

- Solicitar permissão de microfone somente ao iniciar a funcionalidade e explicar o uso antes do diálogo do sistema.
- Mostrar indicador persistente durante captura e controles acessíveis para silenciar e encerrar.
- Não ativar por wake word, em segundo plano, sem uma etapa de produto e permissões própria.
- Não guardar áudio bruto por padrão. Informar quando transcrições forem guardadas no histórico.
- Não incluir áudio, transcrição sensível, tokens ou credenciais em logs. Registrar apenas estado técnico e identificadores não sensíveis.
- Limitar duração, tamanho de buffer, taxa de eventos, uso por sessão e custo. Encerrar sessões abandonadas ou expiradas no servidor.
- Respeitar as permissões e condições de retenção do provider escolhido; não trocar silenciosamente de provider.
- Ações solicitadas por voz continuam sujeitas às validações e confirmações de risco já existentes. Uma transcrição reconhecida não deve aprovar por si só uma ação de alto impacto.

## Plano de implementação no repositório

1. **Definir providers iniciais:** escolher quais modelos/provider suportarão transcrição, fala de saída e realtime; registrar capabilities verificadas por modelo.
2. **Construir voz por turnos:** adicionar módulo/componente de captura e transcrição ao chat mobile, tratamento de permissão/erros e resposta falada.
3. **Adicionar modos:** validar enum compartilhado, persistir preferência de conversa e aplicar instruções no backend sem expor prompt interno ao cliente.
4. **Criar sessão de voz:** adicionar rotas autenticadas e adapter de sessão efêmera/relay, mantendo chave permanente no servidor.
5. **Adicionar streaming e VAD:** implementar eventos, interrupção, cancelamento, reconexão e limites de sessão.
6. **Configurar execução em segundo plano:** ativar capacidades nativas apenas quando forem necessárias, com notificação/indicador e encerramento explícito.
7. **Validar em dispositivos físicos:** testar iOS e Android com tela bloqueada, fones Bluetooth e internos, chamadas, troca de rota, perda de rede, permissões recusadas e encerramento pelo sistema.

## Critérios de aceite

- A pessoa inicia e encerra a sessão explicitamente e sempre vê quando o microfone está ativo.
- O modo Executivo, Amigável ou Didático afeta as respostas da mesma conversa e pode ser alterado sem reiniciar o chat.
- O MVP por turnos é identificado como transcrição; não é apresentado como tempo real.
- Em modelos compatíveis, fala e resposta fluem sem esperar uma gravação longa terminar, pausas fecham turnos e a pessoa consegue interromper a resposta.
- O fallback para turnos funciona quando realtime não está disponível ou falha, com indicação clara.
- A tela bloqueada mantém a sessão somente nas plataformas e condições suportadas, com os indicadores do sistema.
- Fones Bluetooth são usados quando disponíveis; mudanças de rota e interrupções são tratadas com estado visível.
- Áudio bruto não é persistido por padrão, e sessões expiradas são encerradas/revogadas.
- Credenciais permanentes do provider nunca são enviadas ao app.
- Nenhuma ação de alto impacto é executada somente porque apareceu na transcrição; as confirmações existentes continuam obrigatórias.

## Decisões pendentes

- Quais providers/modelos serão suportados na primeira sessão realtime?
- A primeira entrega de voz será apenas mobile ou também web?
- Qual provider fará transcrição e síntese no fallback por turnos?
- A preferência do modo de resposta será salva por conversa ou globalmente por usuário?
- Quais limites iniciais de duração e custo por sessão serão adotados?
- A primeira versão de background será Android e iOS simultaneamente ou será liberada por plataforma após validação nativa?
