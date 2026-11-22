# Central de Emergências: Operação Resgate

Sistema web CRUD de ocorrências de emergência (chamadas do 911). As estruturas centrais (árvore B+, Trie, tabela hash e grafo direcionado) foram feitas do zero em JavaScript.

## Como executar

1. Abra o `index.html` no navegador.
2. Em **Carregar CSV**, escolha o `dados.csv`.

O botão **Salvar CSV** baixa o estado atual.

Para gerar o `dados.csv` de novo (opcional): `python preparar_dados.py 911.csv dados.csv`.

## Dados

**Fonte:** [911 Calls, Montgomery County (Kaggle)](https://www.kaggle.com/datasets/mchirico/montcoalert).

São usadas as 10.000 chamadas válidas mais recentes.

**Campos usados:**

| Original | No sistema |
|---|---|
| `title` (`Traffic: VEHICLE ACCIDENT -`) | `categoria` (`Traffic`) e `tipo` (`Vehicle accident`) |
| `twp` | `regiao` |
| `addr` | `endereco` |
| `zip` | `zip` |
| `timeStamp` | dentro do `id` |
| `lat`, `lng` | mediana por `regiao` no cabeçalho `#regiao:lat:lng;...` da 1ª linha do `dados.csv` |

Ficaram de fora `e` e `desc` (que só repete endereço e região).

**Campos derivados ou acrescentados:**

- **`id`:** segundos desde 1970 × 256 + um sufixo para chamadas no mesmo segundo. Na tela, ele aparece em base 36: `TMI7LR`, `TMI7LR-1`. Ordenar por id é ordenar por data.
- **`atendido`:** sorteado com semente fixa. Só as chamadas das últimas 48 h podem estar pendentes, com chance e^(−idade/12), o que dá 153 pendentes.
- **`hash`:** o hash de integridade de cada linha.
- **Nível de prioridade (1 a 5) e viaturas necessárias (1 a 4):** saem do tipo da ocorrência, por tabelas próprias em `prioridades.js` que cobrem os 64 tipos da base. Ex.: Building fire = nível 5 e 4 viaturas; Cardiac arrest = nível 5 e 2 viaturas; Fall victim = nível 3 e 1 viatura.

**Adaptações:**

As datas foram deslocadas para o último chamado cair no momento em que o script rodou.

Tipo e região perderam as maiúsculas do original. O endereço continua em maiúsculas.

## Estruturas

| Estrutura | Arquivo | Dimensões com `dados.csv` | Onde é usada |
|---|---|---|---|
| Árvore B+ | `arvoreBMais.js` | 9.996 ocorrências (M = 5, L = 64) | `ocorrencias` (id → ocorrência): consulta por id, período, listagem em ordem de data, Salvar CSV |
| Trie (TST) | `tst.js` | 1.916 palavras indexadas | `palavras` (palavra do endereço → ocorrências): busca por prefixo e sugestões |
| Tabela hash | `tabelaHash.js` | 64 tipos, 68 regiões, 153 pendentes | índices de tipo e região, pendentes, prioridades, integridade, adjacência dos grafos e conjuntos |
| Grafo direcionado | `grafo.js` | 3 protocolos × 7 etapas (6 a 7 arestas) | `protocolos` (categoria → grafo de etapas): dependências operacionais, ciclos e ordem topológica |
| Grafo ponderado (rede) | `rede.js` | 48 vértices (regiões) e 89 arestas | `rede`: malha logística do condado, caminho mínimo (Dijkstra) e árvore geradora mínima (Kruskal) |

### Árvore B+

Guarda todas as ocorrências, ordenadas pelo id. Como o id é a data, um período vira um intervalo de ids: a árvore desce até o início uma vez e anda pelas folhas encadeadas.

- **M = 5:** cada nó interno ocupa 64 bytes, uma linha de cache, num pool (`ArrayBuffer`): 4 chaves × 8 B + 5 filhos × 4 B + a contagem. Descer um nível é ler uma linha só.
- **L = 64:** descer um nível é um salto para qualquer lugar da memória, enquanto as chaves de uma folha ficam em sequência, e ler ou deslocar uma sequência é barato (o processador já busca as linhas seguintes). Por isso a folha pode ser bem maior que o nó interno: 64 × 8 B = 512 B, 8 linhas de cache.

### Trie (árvore de busca ternária, TST)

Cada palavra do endereço aponta para as ocorrências que a contêm. `W MAIN ST & N YORK RD` entra por `MAIN` e por `YORK`. Tipos de via e direções (`ST`, `RD`, `W`, `N`…) ficam de fora, porque quase todo endereço tem um deles.

Escolhemos a TST pela simplicidade. É mais eficiente que a R-way e na Patricia um prefixo pode terminar no meio de um nó.

### Tabela hash

Hash polinomial base 31 (método de Horner, módulo 2^32), com encadeamento. A capacidade dobra quando a carga passa de 0,75. O código não usa `Set` nem `Map` do JavaScript, usa somente nossa tabela.

### Grafo direcionado

Cada categoria (`EMS`, `Fire` e `Traffic`) tem seu protocolo de atendimento em `protocolos.js`: um `Grafo` (`grafo.js`) com as mesmas 7 etapas operacionais e as dependências de cada operação. Cada vértice é uma etapa e cada aresta `u → v` diz que `u` precisa terminar antes de `v` começar. A lista de adjacência usa a própria `TabelaHash`, onde cada etapa aponta para o conjunto (`TabelaHash`) das etapas que dependem dela.

A consulta da ordem de execução e a detecção de ciclos rodam juntas numa busca em profundidade (DFS) com regra das 3 cores e pilha de resultado, em $O(V + E)$:

- Ao entrar na pilha de recursão, a etapa fica cinza (`1`); ao terminar todas as dependentes, fica preta (`2`) e vai para a pilha de resultado.
- Se a busca encontra uma aresta para uma etapa cinza, o trecho aberto na pilha de recursão fecha um ciclo. Só as etapas e setas desse ciclo ficam vermelhas na tela.
- Sem ciclo, o grafo é um DAG, e a pilha de resultado invertida numera as etapas conectadas na ordem em que podem ser executadas (`1, 2, ...`).

### Rede logística (caminhos mínimos e árvore geradora mínima)

O `preparar_dados.py` calcula a mediana de latitude e longitude das chamadas de cada região (mantendo as regiões separadas por pelo menos 3,2 km para os nomes não se sobreporem no mapa) e grava na primeira linha do `dados.csv` (`#Abington:40.1129:-75.1208;...`). Ao carregar o CSV, a `Rede` (`rede.js`) monta um grafo não direcionado e ponderado com **48 regiões (vértices)** e conecta cada região às suas 3 vizinhas mais próximas, gerando **89 conexões (arestas)** cujo peso é a distância em quilômetros entre os centros das regiões.

Foram implementadas duas técnicas complementares sobre essa mesma rede:

- **Caminho mínimo (Algoritmo de Dijkstra):** otimiza o deslocamento local entre duas regiões específicas (origem e destino clicadas no mapa). A partir da origem com distância 0, o algoritmo usa um min-heap binário para extrair a menor distância acumulada e relaxa iterativamente suas arestas (`dist[u] + peso(u, v) < dist[v]`) em $O((V + E) \log V)$, guardando o predecessor em `ant` para reconstruir a rota mais curta e a quilometragem total.
- **Árvore geradora mínima (Algoritmo de Kruskal com Union-Find):** otimiza a infraestrutura global, conectando todas as 48 regiões com a menor extensão total de malha e sem ciclos. Como a rede viária é esparsa (89 arestas para 48 vértices), o algoritmo de Kruskal ordena as arestas pelo peso e une componentes distintas usando uma estrutura de conjuntos disjuntos (**Union-Find**) com **compressão de caminho** no `find`, selecionando $V - 1 = 47$ conexões em tempo $O(E \log V)$.

## Como funciona

- **Gerenciamento:** carregar, cadastrar, editar, remover e salvar o CSV.
- **Consulta:** por id (B+), por endereço com prefixo (Trie), por região e por tipo (hash), por categoria, só pendentes e por período (B+). A busca roda em três etapas:
  1. **caminho:** uma estrutura gera as candidatas. Com endereço, é a Trie. Senão, entre os conjuntos dos campos preenchidos (região, tipo, pendentes), o menor, já que cada um sabe o próprio tamanho. Sem nenhum deles, o período na B+;
  2. **filtro:** cada candidata é conferida contra todos os campos;
  3. **ordem:** recentes, antigos ou prioridade.
- **Prioridade:** do nível 5 ao 1 e, no empate, a mais antiga primeiro. A tela abre em "só pendentes, por prioridade", que é a fila de atendimento.
- **Planejamento de atendimento (Mochila 0/1 com programação dinâmica):** quando o operador informa o número de viaturas disponíveis, o sistema resolve a mochila 0/1 (`otimizarViaturas` em `central.js`) sobre as ocorrências filtradas na tela.
  - **Modelagem:** a capacidade $W$ é o total de viaturas disponíveis; cada ocorrência $i$ tem custo $p_i \in \{1..4\}$ (viaturas exigidas pelo tipo) e benefício $v_i \in \{1..5\}$ (nível de prioridade). Uma escolha gulosa só pela maior prioridade pode deixar viaturas paradas ou gastar 4 viaturas num único chamado (`Building fire`, prioridade 5) quando o mesmo recurso atenderia duas paradas cardíacas (`Cardiac arrest`, 2 viaturas e prioridade 5 cada, somando 10).
  - **Estado, casos base e transição:** usamos programação dinâmica bottom-up em matriz densa `dp[n + 1][W + 1]`, já que todas as capacidades de `0` a `W` são visitadas e o preenchimento iterativo evita recursão profunda sobre centenas de chamados. O estado `dp[i][j]` guarda a maior soma de prioridades possível entre as primeiras `i` ocorrências com até `j` viaturas. Os casos base são `dp[0][j] = 0` e `dp[i][0] = 0`. Para cada ocorrência `i` e capacidade `j`, a decisão escolhe o máximo entre deixar a ocorrência de fora (`dp[i - 1][j]`) ou, se $p_i \le j$, atendê-la (`v_i + dp[i - 1][j - p_i]`), em tempo e espaço $O(n \cdot W)$.
  - **Reconstrução:** voltando de `dp[n][W]` até `i = 1`, sempre que `dp[i][j] !== dp[i - 1][j]`, a ocorrência `i` entrou na solução ótima e descontamos $p_i$ de `j`. As ocorrências selecionadas vão para o topo da tabela, as que ficaram de fora aparecem abaixo com opacidade reduzida e o resumo mostra as viaturas empenhadas e a prioridade total atingida.
- **Integridade:** cada ocorrência vira um texto, `categoria|tipo|data_hora|zip|regiao|endereco|atendido`, e o SHA-256 dele vai na coluna `hash`. O SHA-256 vem pronto (`crypto.subtle` no navegador, `hashlib` no Python).
  - **incompleta:** campo vazio ou inválido.
  - **alterada:** o hash do arquivo não bate com o recalculado, ou seja, alguém mexeu fora do sistema.
  - **duplicada:** mesmo conteúdo de outra linha, com o mesmo id ou com outro.
  - **conflito de versão:** mesmo id, mas com conteúdo diferente; fica a primeira.

  Com o `dados.csv`: 4 incompletas, 0 alteradas, 5 duplicadas (pares idênticos no mesmo segundo) e 0 conflitos.

## Testes dos algoritmos

- **Ordem topológica e ciclos (`grafo.js`):**
  - *Sem ciclo (DAG):* abrir **Protocolos de atendimento** em `EMS`, `Fire` ou `Traffic` exibe as etapas numeradas na ordem topológica válida (`1` a `7` em `EMS`/`Fire`, `1` a `6` em `Traffic`).
  - *Com ciclo:* em `Fire`, clicar na etapa `5` (*Encaminhar ocorrência para atendimento*) e na etapa `4` (*Isolar área e prestar atendimento*) cria a dependência reversa `5 → 4`, fechando um ciclo com `4 → 5`. A DFS de 3 cores detecta o retorno ao vértice cinza e destaca apenas as duas etapas e suas setas em vermelho (`!`). Clicar na seta vermelha remove a dependência e restaura a numeração.
- **Planejamento de viaturas (`otimizarViaturas` em `central.js`):**
  - Com o `dados.csv` carregado (153 pendentes) e **21 viaturas disponíveis**, a programação dinâmica seleciona 11 ocorrências que usam 21/21 viaturas e atingem prioridade total **44**: as 2 paradas cardíacas de nível 5 (2 viaturas cada), 8 emergências de nível 4 (2 viaturas cada) e 1 chamado de nível 2 (1 viatura) para aproveitar a viatura restante.
- **Caminho mínimo e AGM (`rede.js`):**
  - *Árvore geradora mínima (Kruskal):* abrir **Rede logística** (com `dados.csv` carregado) e marcar **árvore geradora mínima** seleciona **47 conexões** das 89 disponíveis, interligando todas as 48 regiões com **211,9 km** totais.
  - *Caminho mínimo (Dijkstra):* no modo **caminho mínimo**, clicar em `Pottstown` (noroeste) e em `Abington` (leste) encontra a rota mínima `Pottstown → Lower Pottsgrove → Limerick → Perkiomen → Skippack → Worcester → North Wales → Lower Gwynedd → Ambler → Upper Dublin → Upper Moreland → Abington` com **54,9 km**.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `tabelaHash.js`, `tst.js`, `arvoreBMais.js`, `grafo.js`, `rede.js` | as estruturas e algoritmos de grafos |
| `ocorrencia.js` | id e hash de integridade |
| `prioridades.js` | tabelas tipo → nível e tipo → viaturas |
| `protocolos.js` | grafos de dependências operacionais por categoria |
| `central.js` | o sistema: índices, carga, integridade, busca e edição (sem nada de tela) |
| `pagina.js`, `index.html` | a tela |
| `preparar_dados.py`, `dados.csv` | o script dos dados e o CSV gerado |
