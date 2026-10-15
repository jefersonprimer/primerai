# Visão de tela em tempo real

## Objetivo

Permitir que a pessoa peça ajuda sobre o conteúdo que está vendo no computador ou celular sem precisar salvar uma captura e anexá-la manualmente. Exemplos: explicar um trecho de código, resumir um PDF aberto, traduzir uma tela ou analisar uma planilha.

A primeira versão deve capturar uma imagem sob demanda e enviá-la como parte da conversa ativa. “Tempo real” descreve a rapidez para pedir ajuda; não significa transmitir a tela continuamente. Uma sessão contínua pode ser avaliada depois, com controles próprios de privacidade, custo e desempenho.

## Estado no projeto

O desktop já tem o fluxo de captura pontual no chat: seletor de tela/janela do sistema, prévia, remoção e envio como anexo multimodal. O atalho global padrão é `Alt + Shift + Espaço`; ele traz o PrimerAI para frente e a pessoa inicia a captura no botão **Ver minha tela**, preservando a ativação explícita exigida pelo seletor do WebView. Se a captura for cancelada, nenhuma imagem é enviada.

A captura depende de `getDisplayMedia` estar disponível no WebView e no sistema operacional. A implementação mostra um erro claro quando a API não estiver disponível. O envio reaproveita a rota existente de anexos e o backend mantém a validação de modelo com visão. Mobile continua dependendo de módulos nativos: no Android, `MediaProjection`; no iOS, o fluxo de compartilhamento/captura permitido pelo sistema.

## Experiência proposta

### Desktop

1. A pessoa aciona **Ver minha tela** no chat ou usa um atalho global configurável, inicialmente `Alt + Espaço`.
2. O sistema operacional apresenta o seletor de tela ou janela e pede autorização quando aplicável.
3. O PrimerAI captura um quadro, mostra uma prévia e deixa a pessoa cancelar ou enviar.
4. O quadro é anexado à mensagem. A pessoa pode acrescentar uma pergunta, como “O que está causando este erro?”.
5. O modelo com visão analisa a captura e responde no chat. Se o modelo atual não aceitar imagens, o app informa isso e oferece a troca para um modelo compatível.

O atalho deve abrir ou trazer o PrimerAI para frente e iniciar a captura. Ele não deve capturar a tela silenciosamente. Se o atalho estiver ocupado por outro aplicativo, permitir configurar outro nas preferências.

### Mobile

Um botão flutuante pode iniciar a captura apenas quando a plataforma permitir e após consentimento explícito do sistema. A pessoa deve ver um indicador claro de captura e poder interrompê-la. A captura pontual é o primeiro objetivo; uma bolha sobre outros aplicativos não é requisito para o MVP.

No Android, a captura de outros apps depende do fluxo de consentimento do `MediaProjection`. No iOS, compartilhar conteúdo de outros apps depende dos mecanismos do sistema, como o ReplayKit, e exige integração nativa. Se a captura externa não estiver disponível, oferecer importar/compartilhar uma captura de tela para o PrimerAI como alternativa.

## Comportamento por plataforma

| Plataforma | Entrada inicial | Limites e alternativa |
|---|---|---|
| Desktop Tauri | Seletor nativo de tela/janela iniciado pelo atalho ou botão | Permissão do sistema; prévia obrigatória antes do envio |
| Android | Captura iniciada por ação explícita e consentimento do sistema | `MediaProjection`; oferecer compartilhamento/importação de screenshot quando indisponível |
| iOS | Fluxo de compartilhamento/captura permitido pelo sistema | Requer integração nativa; manter screenshot importado/compartilhado como fallback |
| Web | Compartilhamento de tela iniciado pelo navegador, se suportado | O usuário escolhe o que compartilhar; sem captura em background |

## Arquitetura

```text
Atalho global ou botão no cliente
                 ↓
Captura nativa/autorizada de um quadro
                 ↓
Prévia e pergunta da pessoa
                 ↓ HTTPS
Upload como anexo de imagem da conversa ativa
                 ↓
Backend valida anexo e capacidade do modelo
                 ↓
Provider multimodal recebe imagem e texto
                 ↓
Resposta aparece no histórico da conversa
```

### Cliente desktop

- Usar o plugin oficial de atalhos globais do Tauri para registrar e remover o atalho.
- Conectar o atalho e o botão do composer à mesma ação de captura.
- Usar o seletor/captura de tela suportado pelo runtime e pelo sistema operacional. A permissão e a seleção devem permanecer visíveis para a pessoa.
- Reduzir a imagem para um limite definido pelo produto, preservando texto legível, e mostrar a prévia antes do upload.
- Enviar a imagem pelo fluxo existente de anexos de conversa, mantendo referência ao anexo na mensagem persistida.

### Cliente mobile

- Implementar captura em módulos nativos compatíveis com o SDK Expo utilizado pelo app; a solução requer development builds e validação em aparelhos reais.
- No Android, solicitar o consentimento do `MediaProjection` no momento de cada sessão iniciada pela pessoa e respeitar a indicação de captura ativa do sistema.
- No iOS, avaliar o fluxo nativo de broadcast/captura compatível com a versão mínima suportada. Não prometer captura irrestrita de outras apps.
- Manter uma alternativa de share sheet/importação de screenshot em ambas as plataformas.

### Backend e modelos

- Reutilizar o endpoint e a persistência de anexos de imagem da conversa, sem criar um canal paralelo para imagens de tela.
- Validar autenticação, propriedade da conversa, formato e tamanho do anexo.
- Verificar a capacidade de visão do modelo antes de chamar o provider e retornar erro legível quando não suportar imagem.
- Repassar a imagem e a pergunta como partes multimodais da mesma mensagem.
- Não incluir conteúdo da captura em logs. Aplicar a política de retenção existente para anexos.

## Privacidade e segurança

- A captura só começa após ação explícita. Nunca manter captura ativa ao iniciar o app ou ao alternar para outra janela.
- Mostrar qual tela/janela foi selecionada e uma prévia antes do envio. Permitir cancelar e remover a captura.
- Enviar somente a imagem escolhida pela pessoa; não enviar fluxo contínuo no MVP.
- Informar que a imagem será enviada ao provider configurado para análise.
- Respeitar telas protegidas e restrições aplicadas pelo sistema operacional.
- Tratar texto encontrado na tela como conteúdo não confiável, não como instrução para alterar políticas ou executar ações.
- Não executar código, clicar, preencher formulários nem realizar ações externas como consequência automática da análise. A visão de tela é inicialmente somente leitura.

## Escopo do MVP

### Incluído

- Captura pontual no desktop pelo botão do chat e atalho global.
- Seletor de tela/janela e prévia com cancelar/enviar.
- Upload como anexo na conversa atual e pergunta opcional.
- Validação de suporte a visão no modelo e mensagens de erro compreensíveis.
- Preferência para configurar o atalho e indicação visual do estado da captura.

### Posterior

- Captura pontual nativa no Android e fluxo compatível no iOS.
- Sessões contínuas ou envio automático de quadros por mudança de tela.
- OCR local, tradução sobreposta, compartilhamento de contexto entre dispositivos e interação automatizada com a tela.

## Etapas de implementação

### 1. Desktop, captura pontual — implementado

- Integrar o plugin de atalhos globais do Tauri e declarar as permissões necessárias.
- Adicionar ação “Ver minha tela” ao composer e configuração do atalho.
- Implementar captura autorizada, prévia, cancelamento e otimização da imagem.
- Usar a API atual de anexos e envio de mensagem multimodal.
- Cobrir estados de permissão negada, captura cancelada, atalho indisponível, falha de upload e modelo sem visão.

O fluxo base está implementado. Ainda é necessário validar a seleção de tela nos WebViews de cada sistema desktop e melhorar a escolha do atalho nas preferências.

**Critério de conclusão:** a pessoa consegue chamar o PrimerAI de outra janela, selecionar uma tela, revisar a captura e receber uma resposta sobre ela na conversa escolhida.

### 2. Mobile, captura iniciada pela pessoa

- Confirmar a versão mínima de Android/iOS e o fluxo nativo suportado por cada uma.
- Criar módulos/configuração Expo necessários e gerar builds de desenvolvimento.
- Implementar consentimento, indicador de captura, envio de um quadro e interrupção.
- Manter importação/compartilhamento de screenshot como fallback uniforme.

**Critério de conclusão:** o comportamento é compreensível e autorizado em aparelhos reais; quando a captura externa não puder ser iniciada, o fallback continua disponível.

### 3. Avaliar transmissão contínua

- Medir latência, consumo de bateria/rede e custo por provider.
- Definir frequência e condições de envio de quadros, botão de pausa e encerramento visível.
- Pedir consentimento separado antes de iniciar qualquer transmissão contínua.
- Não armazenar vídeo por padrão; persistir apenas as mensagens e anexos que a pessoa decidir manter.

## Decisões a confirmar antes da implementação

- Quais sistemas desktop serão suportados no primeiro lançamento.
- Se a captura deve anexar a imagem imediatamente ou sempre mostrar prévia.
- Tamanho máximo e política de retenção para capturas de tela.
- Atalho padrão e como resolver conflito com outros aplicativos.
- Versões mínimas de Android/iOS e se o mobile entra no mesmo lançamento ou depois do desktop.

## Referências técnicas

- [Tauri: atalhos globais](https://v2.tauri.app/plugin/global-shortcut/)
- [Android: captura com MediaProjection](https://developer.android.com/media/platform/av-capture)
- [Apple: ReplayKit](https://developer.apple.com/documentation/ReplayKit)
