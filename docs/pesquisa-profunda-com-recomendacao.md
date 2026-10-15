# Pesquisa profunda com recomendação

## Objetivo

Transformar um pedido de pesquisa ou compra em uma recomendação fundamentada, comparando informações de várias fontes e entregando uma conclusão prática — não apenas uma lista de links.

Exemplo:

> “Quero o melhor notebook para programação até R$ 5.000.”

A resposta deve explicar os critérios usados, recomendar opções disponíveis, mostrar preços e configurações encontrados e incluir fontes para a pessoa conferir.

## Como funcionaria

```text
Pedido da pessoa
       ↓
Entender uso, orçamento e preferências
       ↓
Definir critérios de comparação
       ↓
Encontrar produtos em lojas e comparadores
       ↓
Confirmar especificações e analisar avaliações
       ↓
Comparar candidatos e preparar recomendações
       ↓
Resposta com escolhas, justificativas, preços e fontes
```

### 1. Entender o pedido

O sistema extrai do pedido:

- categoria do produto;
- orçamento e moeda;
- uso pretendido;
- preferências ou requisitos obrigatórios;
- localização, quando afetar disponibilidade, preço ou garantia.

No exemplo do notebook, “programação” é o uso e R$ 5.000 é o teto. Se faltar uma informação que mude bastante a recomendação — por exemplo, necessidade de jogos, edição de vídeo ou execução local de modelos de IA — o sistema pode perguntar. Caso contrário, segue com critérios padrão e os declara na resposta.

### 2. Definir o que importa para esse uso

Os critérios dependem da categoria. Para programação, uma primeira versão pode considerar:

- processador e desempenho sustentado;
- memória RAM instalada e possibilidade de expansão;
- armazenamento SSD e possibilidade de expansão;
- tela, teclado, bateria e peso;
- sistema operacional e compatibilidade com as ferramentas comuns;
- garantia e facilidade de assistência no Brasil.

O orçamento restringe a busca. Os pesos dos critérios devem ser visíveis e ajustáveis; não se deve apresentar uma pontuação como objetiva se ela depender de escolhas do sistema.

### 3. Encontrar candidatos em lojas

Com os critérios definidos, o sistema faz buscas específicas para localizar modelos e configurações que caibam no orçamento. Para cada oferta, tenta registrar:

- nome e configuração exata do modelo;
- preço, moeda, loja e URL;
- disponibilidade e condições relevantes, como frete quando disponível;
- data e hora da consulta.

Resultados de loja são candidatos, não confirmação de qualidade. Modelos com nomes parecidos podem ter configurações diferentes; por isso, cada oferta precisa ser associada à configuração exata antes da comparação.

### 4. Verificar e complementar em outras fontes

Para os candidatos mais promissores, busca informações adicionais em fontes apropriadas:

- páginas de fabricantes para especificações, garantia e limites de upgrade;
- análises técnicas independentes para desempenho, tela, ruído, bateria e construção;
- avaliações de compradores para detectar padrões recorrentes, tratando relatos isolados com cautela;
- avisos de suporte ou problemas conhecidos, quando houver fonte confiável.

As fontes devem ser abertas e lidas, e não depender somente do resumo mostrado pelo buscador. Alegações importantes devem ser ligadas à fonte que as sustenta. Conflitos entre fontes, dados ausentes e avaliações pouco representativas devem ser apresentados como incerteza.

### 5. Comparar e recomendar

Depois da verificação, a resposta pode trazer:

- **Melhor escolha:** melhor equilíbrio para o uso e orçamento informados;
- **Alternativa:** opção próxima que favorece outros critérios;
- **Mais barata:** menor preço entre ofertas verificadas que atendem ao mínimo;
- **Melhor desempenho:** opção com maior capacidade de processamento dentro do limite, se houver evidência suficiente.

Cada recomendação deve mostrar configuração, preço e loja consultados, vantagens, limitações, motivo da escolha e fontes. Se não houver candidatos suficientemente verificados, o sistema deve dizer isso e apresentar o que falta confirmar em vez de inventar uma vencedora.

## Exemplo de experiência

Pedido:

> Quero o melhor notebook para programação até R$ 5.000.

Possível resposta:

> **Melhor escolha — Modelo A**  
> Encontrado por R$ X na Loja Y em [data]. Tem configuração adequada para programação e memória expansível. A análise consultada aponta boa tela, mas autonomia apenas mediana.  
> **Por que escolhi:** atende ao orçamento e equilibra desempenho e possibilidade de upgrade.
>
> **Alternativa — Modelo B**  
> Melhor tela, mas memória não expansível e preço mais próximo do teto.
>
> **Mais barata — Modelo C**  
> Custa menos e atende ao uso informado; o processador é mais limitado em tarefas pesadas.
>
> **Fontes e preços:** links para a oferta, especificações do fabricante e análises consultadas. Preços verificados no momento da pesquisa e sujeitos a alteração.

Os nomes e valores acima são ilustrativos; uma resposta real só os deve preencher após verificar ofertas atuais.

## Encaixe no PrimerAI hoje

O backend já tem `searchWeb` em `backend/src/ai/web-search.ts`, que consulta DuckDuckGo e retorna até oito títulos, URLs e trechos. As mensagens de conversa podem acionar a pesquisa e encaminhar esses trechos ao modelo em `backend/src/routes/conversations.ts`. Também existe o endpoint autenticado `/v1/agent/research` em `backend/src/routes/agent.ts`.

Isso é uma base para pesquisa web, mas ainda não implementa pesquisa profunda: hoje não há leitura sistemática das páginas, extração estruturada de ofertas e especificações, deduplicação de variantes, comparação por categoria ou resposta estruturada em cartões. A pesquisa existente também é acionada por intenção em texto, então uma evolução deve tornar o estado da pesquisa explícito para a interface e para o backend.

### MVP implementado: notebooks no chat

Pedidos que mencionam notebook/laptop junto com compra, recomendação, programação, orçamento ou preço acionam três buscas paralelas: ofertas, modelos para programação e análises/especificações. Os resultados são deduplicados, até 12 páginas públicas são lidas com limites de redirecionamento, tamanho e tempo, e o contexto é enviado ao provider configurado com instruções para separar fontes, declarar incerteza e não inventar preços. A integração cobre conversas persistidas e o endpoint de chat anônimo.

A resposta continua sendo texto do modelo no chat, com estrutura sugerida para critérios, recomendações e fontes. O MVP não extrai nem valida ofertas em um schema próprio, não garante que todas as lojas sejam pesquisadas, e não tem cartões/tabela visual nem histórico de preços. Conteúdo de snippet continua sendo apenas pista quando a página não pôde ser lida. Preços e configurações ainda dependem da leitura do modelo sobre as evidências coletadas.

## Arquitetura proposta

Separar responsabilidades em componentes do backend:

1. **Interpretador do pedido:** transforma linguagem natural em um objeto validado, com categoria, orçamento, uso e preferências. Pode pedir esclarecimento quando necessário.
2. **Plano de pesquisa:** cria consultas por intenção — encontrar ofertas, confirmar especificações, procurar análises e verificar problemas.
3. **Coletores:** fazem busca e leitura de páginas públicas, aplicando limites de tempo, tamanho, domínios e quantidade de páginas.
4. **Normalizador:** converte os achados em registros com produto, variante, preço, loja, atributos, URL, data da consulta e trecho de evidência.
5. **Comparador:** filtra itens fora do orçamento, agrupa ofertas da mesma configuração, aplica critérios declarados e marca lacunas ou conflitos.
6. **Redator:** apresenta recomendações e associa cada afirmação relevante às evidências coletadas.
7. **Interface:** exibe recomendações, critérios, fontes, horário dos preços e opções para corrigir preferências ou aprofundar um candidato.

Contrato conceitual de um achado:

```ts
type Finding = {
  productName: string;
  variant: string | null;
  attribute: string;
  value: string;
  sourceUrl: string;
  sourceTitle: string;
  evidence: string;
  collectedAt: string;
  confidence: "high" | "medium" | "low";
};

type Offer = {
  productName: string;
  variant: string;
  price: number;
  currency: "BRL";
  retailer: string;
  url: string;
  availability: string | null;
  collectedAt: string;
};
```

Esse contrato é ilustrativo; a implementação deve validar e limitar os campos e o tamanho das evidências.

## Plano incremental

### Fase 1 — Pesquisa guiada e resposta com fontes (MVP implementado)

- Reaproveitar a busca web existente.
- [x] Fazer múltiplas consultas específicas a partir do pedido de notebook.
- [x] Abrir páginas públicas com limites e preservar URL, título e horário de coleta.
- [x] Pedir ao modelo uma síntese com critérios, opções e incertezas explicitadas.
- Mostrar ao usuário as fontes usadas.

**Pronto quando:** a resposta distingue evidência de inferência e cada recomendação tem fontes verificáveis.

### Fase 2 — Comparação de ofertas

- Adicionar extratores específicos para uma categoria inicial, como notebooks.
- Normalizar preço, loja, configuração e disponibilidade.
- Associar ofertas à variante correta do produto e eliminar duplicatas.
- Exibir tabela comparativa e cartões de recomendação.

**Pronto quando:** a pessoa consegue conferir que está comparando configurações equivalentes e ofertas dentro do orçamento.

### Fase 3 — Mais categorias e acompanhamento

- Adicionar esquemas de critérios por categoria.
- Permitir ajustar pesos, salvar uma pesquisa e refazê-la para atualizar preços.
- Considerar histórico de preços somente se houver coleta e retenção confiáveis.

**Pronto quando:** novas categorias podem ser adicionadas sem misturar seus critérios e a atualização de uma pesquisa distingue dados novos de antigos.

## Requisitos de confiabilidade e segurança

- Tratar texto de páginas como conteúdo não confiável, nunca como instruções ao agente.
- Limitar domínios, redirecionamentos, tamanho de resposta, páginas abertas, tempo e concorrência.
- Evitar autenticação ou compra automática; a primeira versão deve apenas pesquisar páginas públicas.
- Não afirmar que preço, estoque, garantia ou defeito foram confirmados sem evidência e horário da consulta.
- Diferenciar especificação oficial, resultado de loja, análise editorial e relato de comprador.
- Não transformar quantidade de avaliações ou comentários em prova de um problema recorrente sem contexto.
- Incluir fonte por afirmação factual importante e manter a URL original.
- Respeitar limites de acesso dos sites e preferir APIs ou feeds oficiais quando disponíveis.
- Não armazenar conteúdo integral das páginas além do necessário para produzir e auditar a resposta.

## Decisões em aberto

- Qual provedor de busca será usado em produção e quais são seus limites e custos?
- Qual categoria será o piloto: notebooks ou outra?
- A busca será sempre acionada pelo usuário ou também sugerida automaticamente?
- Quais lojas, comparadores e fontes técnicas serão aceitos para o piloto?
- A interface inicial será uma resposta formatada no chat ou cartões e tabela comparativa dedicados?
- Qual política de atualização e retenção será aplicada a preços e páginas coletados?

## Critérios de sucesso

- Uma recomendação pode ser conferida nas fontes associadas a ela.
- Preços exibem loja e momento de consulta e não são tratados como permanentes.
- Produtos com variantes diferentes não são comparados como se fossem idênticos.
- A resposta explica por que cada opção atende aos critérios declarados.
- Incerteza, evidência insuficiente e conflitos entre fontes ficam visíveis.
- A pessoa pode corrigir orçamento, uso ou preferências e repetir a comparação.
