# Central de Emergências: Operação Resgate

Sistema de chamadas do 911 do Condado de Montgomery, Pensilvânia (EUA), em página web estática, sobre o dataset [911 Calls, Montgomery County (Kaggle)](https://www.kaggle.com/datasets/mchirico/montcoalert). O Trabalho 1 faz o CRUD, a busca e a verificação de integridade das ocorrências. O Trabalho 2 acrescenta os protocolos de atendimento, o despacho de viaturas, a rede logística entre os municípios e o mapa. Todas as estruturas de dados e algoritmos foram implementados do zero em JavaScript.

Repositório: <https://github.com/fickel0/emergencies>

## Como executar

1. Abra o `index.html` no navegador.
2. Carregue `dados.csv`.

O botão Salvar CSV baixa o estado atual. Para regerar o arquivo a partir da base original: `python preparar_dados.py 911.csv dados.csv`.

## Dados

O `911.csv` do Kaggle tem 9 colunas (`lat`, `lng`, `desc`, `zip`, `title`, `timeStamp`, `twp`, `addr`, `e`):

```
40.1216030,-75.3514370,MARSHALL ST & HAWS AVE; NORRISTOWN; 2020-07-29 @ 15:54:08-Station:STA27;,19401,Fire: BUILDING FIRE,2020-07-29 15:54:08,NORRISTOWN,MARSHALL ST & HAWS AVE,1
```

O `preparar_dados.py` gera o `dados.csv` assim:

- Descarta linhas sem `zip` ou sem `twp` e mantém as 10.000 chamadas mais recentes.
- Calcula a mediana de `lat` e `lng` de cada município (`twp`) nas 10.000 chamadas e grava as 68 regiões no cabeçalho `#regiao:lat:lng;...` da primeira linha.
- Desloca os horários para o último chamado cair em "agora".
- Descarta as colunas `e` (sempre `1`), `desc` (repete endereço, região e data) e o `lat`/`lng` individual de cada linha.
- Divide `title` (`Traffic: VEHICLE ACCIDENT -`) em `categoria` (`Traffic`) e `tipo` (`Vehicle accident`, 64 tipos).
- Renomeia `twp` para `regiao` e `addr` para `endereco`, mantendo `zip`.
- Converte `timeStamp` no `id` (segundos desde 1970 × 256 + sufixo para chamadas no mesmo segundo, em base 36: `TNZFKH`, `TNZFKH-1`), de modo que ordenar por `id` já ordena por data.
- Sorteia `atendido` com semente fixa (`seed(12)`): só chamadas das últimas 48 h podem ficar pendentes (`0`), com probabilidade $e^{-\text{idade}/12}$ (143 pendentes).
- Calcula `hash` com o SHA-256 de `categoria|tipo|data_hora|zip|regiao|endereco|atendido`.

A mesma linha fica:

```
TP11OD,Fire,Building fire,19401,Norristown,MARSHALL ST & HAWS AVE,0,55762b6bfbeec9bcd3292f8c69b6f678b84c6d44f4a165bbc9883e4600370478
```

Na aplicação, `prioridades.js` associa cada um dos 64 valores de `tipo` a um nível de prioridade (1 a 5) e ao número de viaturas exigidas (1 a 4): `Building fire` tem nível 5 e pede 4 viaturas; `Cardiac arrest` tem nível 5 e pede 2; `Fall victim` tem nível 3 e pede 1.

## Estruturas de dados e algoritmos

| Estrutura / Algoritmo                | Arquivo                                                         | Dimensões com `dados.csv`               | Complexidade                                              | Escolha e papel                                                                                                                                                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Árvore B+ ($M=5, L=64$)              | `arvoreBMais.js`                                                | 10.000 ocorrências                      | Busca, ins. e rem. $O(\log n)$; intervalo $O(\log n + k)$ | Guarda as ocorrências ordenadas por `id`. Cada nó interno ocupa 64 B (uma linha de cache) num `ArrayBuffer`, e cada folha guarda até 64 chaves em sequência para varrer períodos pelas folhas encadeadas.                                                         |
| Trie ternária (TST)                  | `tst.js`                                                        | 2.523 palavras                          | Prefixo $O(L + k)$                                        | Índice de prefixo das palavras do endereço, sem tipos de via (`ST`, `RD`, `AVE`) nem direções (`N`, `W`). Usa menos memória que a R-way e é mais simples que a Patricia, onde um prefixo pode parar no meio de uma aresta.                                        |
| Tabela hash                          | `tabelaHash.js`                                                 | 64 tipos, 68 regiões, 143 pendentes     | $O(1)$ médio                                              | Hash polinomial base 31 (Horner, módulo $2^{32}$) com encadeamento e rehash acima de 0,75 de carga. Substitui `Map` e `Set` do JavaScript nos índices, conjuntos e listas de adjacência.                                                                          |
| Grafo direcionado (DFS de 3 cores)   | `grafoDirecionado.js`, `protocolos.js`, `diagramaProtocolos.js` | 3 protocolos × 7 etapas (5 a 6 arestas) | $O(V + E)$                                                | Representa dependências `u → v` entre etapas de atendimento. Uma única DFS detecta ciclos ao encontrar um vértice cinza na pilha e devolve a ordem topológica na pilha de saída.                                                                                  |
| Mochila 0/1 (programação dinâmica)   | `mochila.js`                                                    | 143 pendentes × $W$ viaturas            | Tempo e espaço $O(n \cdot W)$                             | Matriz densa bottom-up `dp[n + 1][W + 1]` onde `dp[i][j]` é a maior soma de prioridades nas primeiras `i` pendentes com até `j` viaturas. Evita o erro guloso de gastar 4 viaturas num chamado de prioridade 5 quando duas ocorrências de 2 viaturas somariam 10. |
| Grafo ponderado (Dijkstra e Kruskal) | `grafoPonderado.js`, `mapaRegioes.js`                           | 68 regiões e 126 arestas                | Dijkstra $O((V + E) \log V)$; Kruskal $O(E \log E)$       | Liga cada região às 3 vizinhas mais próximas com peso em km. Dijkstra com min-heap binário calcula a rota desde `Norristown`, e Kruskal com Union-Find (união por posto e compressão de caminho) monta a árvore geradora mínima da malha esparsa.                 |

## Detalhes da implementação

### Trabalho 1

#### Armazenamento, índices e integridade (Módulos 1, 2 e 4)

Cada ocorrência é alocada uma única vez nas folhas da Árvore B+ (`central.js`), enquanto a TST de palavras e as tabelas hash (`idxTipo`, `idxRegiao`, `pendentes`) guardam só referências para esse objeto, como conjuntos indexados pelo `id` em outra `TabelaHash`.

Na carga do CSV, o sistema recalcula o SHA-256 de cada linha com `crypto.subtle` para barrar registros incompletos ou com `id` conflitante e avisar sobre linhas alteradas fora do sistema ou duplicadas (no `dados.csv`, 5 pares de chamadas no mesmo segundo têm o mesmo conteúdo em `id`s distintos, como `TNZFKH` e `TNZFKH-1`).

A mesma `TabelaHash` serve de lista de adjacência nos grafos do Trabalho 2. Como os vértices são nomes (etapas, municípios), ela mapeia nome → vizinhos em $O(1)$ médio sem converter para índices numéricos.

#### Busca combinada e ordem de atendimento (Módulos 2, 3 e 5)

Na busca combinada (`pagina.js`, `central.js`), em vez de varrer as 10.000 ocorrências, a consulta parte sempre do menor conjunto candidato disponível:

- Se houver busca por endereço, a TST devolve as ocorrências cujas palavras começam pelos prefixos digitados.
- Caso contrário, entre os filtros preenchidos (`regiao`, `tipo`, `soPendentes`), o sistema escolhe a tabela hash com menor `.tamanho`.
- Sem nenhum deles, desce uma vez na B+ e percorre as folhas encadeadas no intervalo `[menor, maior]`.

Só esse subconjunto passa pelo filtro final e pela ordenação (por prioridade de nível 5 a 1 com desempate pela mais antiga, ou por data).

### Trabalho 2

#### Módulo 6: protocolos

Os protocolos (`protocolos.js`) são grafos direcionados (`grafoDirecionado.js`), um por categoria: `EMS`, `Fire` e `Traffic` compartilham as mesmas 7 etapas e mudam só as dependências. O `diagramaProtocolos.js` desenha o grafo da categoria escolhida. Uma aresta `u → v` significa que `u` precisa terminar antes de `v`. As dependências podem ser adicionadas e removidas clicando no grafo.

A DFS marca cada etapa com 3 estados (`0` não visitada, `1` na pilha de recursão, `2` finalizada) e mantém a pilha do caminho atual. Quando encontra uma aresta `u → v` com `v` em estado `1`, recorta da pilha o trecho de `v` até `u` e pinta de vermelho só as etapas e setas desse ciclo. Sem ciclo, a pilha de finalização invertida dá a ordem topológica das etapas que têm alguma dependência.

**Por que DFS e não Kahn.** As duas dão a ordem topológica em $O(V + E)$. Kahn só informa que sobraram vértices com grau de entrada positivo, sem dizer quais formam o ciclo (vértices que apenas dependem do ciclo também sobram). A DFS encontra a aresta de retorno `u → v` e a pilha do caminho atual já contém o ciclo exato de `v` até `u`, que é o que a tela destaca em vermelho.

#### Módulo 7: despacho de viaturas

Ao preencher o campo `Viaturas`, o despacho (`otimizarViaturas` em `mochila.js`) ignora os filtros da tela e toma todas as 143 ocorrências do índice `pendentes`, porque distribui a frota inteira. A capacidade é o número de viaturas $W$, o custo $p_i$ de cada ocorrência é o número de viaturas que seu tipo exige e o benefício $v_i$ é seu nível de prioridade.

A matriz `dp[n + 1][W + 1]` usa `Int32Array`, casos base `dp[0][j] = dp[i][0] = 0` e transição $\max(\text{dp}[i-1][j], v_i + \text{dp}[i-1][j-p_i])$. A reconstrução percorre de `dp[n][W]` até `i = 1`, recolhendo toda ocorrência em que `dp[i][j] !== dp[i - 1][j]` e descontando $p_i$ de `j` (com 21 viaturas, escolhe 11 chamados que usam 21/21 viaturas e somam 46 de prioridade). O botão `Atender (N)` grava o timestamp atual nas escolhidas na B+ e as remove de `pendentes`.

**Por que mochila 0/1 e não guloso.** Cada ocorrência é atendida inteira ou não é atendida, então a versão fracionária (ordenar por prioridade/viatura) não vale e pode errar o ótimo. Como $W$ (viaturas) é pequeno, a tabela $O(n \cdot W)$ cabe com folga: 143 × 22 células para 21 viaturas. A versão bottom-up evita recursão e permite reconstruir as escolhas pela própria matriz.

#### Módulo 8: rede logística

A rede logística (`grafoPonderado.js`) é montada a partir do cabeçalho `#regiao:lat:lng;...` do `dados.csv`. Cada um dos 68 municípios é um vértice posicionado na mediana das coordenadas das suas chamadas.

Para cada município, o sistema calcula a distância até todos os outros com uma projeção plana local ($\sqrt{(111\,\Delta\text{lat})^2 + (85\,\Delta\text{lng})^2}$ km, onde 85 km é o tamanho de um grau de longitude a cerca de 40° N) e liga o município aos 3 mais próximos com uma aresta não direcionada, de peso igual a essa distância arredondada a 0,1 km. Pares escolhidos pelos dois lados viram uma única aresta, o que dá 126 arestas entre 0,8 e 6,9 km. As distâncias são em linha reta entre centros de municípios, não por estradas, e servem como aproximação do custo de deslocamento.

Com 3 vizinhos, a malha fica esparsa e conexa, mais parecida com uma rede viária do que um grafo completo de 2.278 arestas.

Dijkstra usa um min-heap binário próprio e calcula o caminho mínimo desde a central em `Norristown` (até `Pottstown`, por exemplo, são 50,3 km). Kruskal ordena as arestas e usa Union-Find com união por posto e compressão de caminho, resultando numa árvore geradora mínima de 67 arestas (230,8 km).

**Por que Dijkstra e Kruskal e não fluxo máximo.** As perguntas da central sobre a rede são "qual a rota mais curta até o município" e "qual a malha mínima que liga todas as regiões", e ambas usam o mesmo grafo não direcionado ponderado por km. Fluxo máximo exigiria capacidades por aresta, que o dataset não fornece e teriam de ser inventadas. Os pesos são não negativos, condição do Dijkstra.

**Por que Kruskal e não Prim.** Com $E = 126$ e $V = 68$ o grafo é esparso, e Kruskal só precisa ordenar a lista de arestas que já existe. Prim precisaria de uma segunda fila de prioridade. A união por posto mantém as árvores do Union-Find com altura $O(\log V)$, e junto com a compressão de caminho cada `find` custa $O(\alpha(V))$ amortizado.

#### Módulo 9: mapa

É um mapa do condado desenhado em SVG (`mapaRegioes.js`). Cada município vira um ponto, posicionado pela projeção linear da sua latitude e longitude no `viewBox`. A fronteira de Montgomery County foi extraída do GeoJSON do OpenStreetMap (`relation 417844`) e simplificada com Ramer-Douglas-Peucker para 93 vértices em `CONTORNO_CONDADO`. No arrasto do mouse, o mapa move apenas o `viewBox` e deixa para redesenhar os elementos ao soltar o botão.

Ele serve principalmente de mapa de calor. A cada busca ou simulação de viaturas, conta quantas ocorrências do resultado caem em cada município e pinta o ponto de branco a vermelho, em proporção ao município com mais ocorrências.

Ele também substitui o filtro por região: clicar num município filtra a tabela por ele (via `idxRegiao`) e desenha em azul a rota de Dijkstra desde `Norristown`. Ao fundo, o mapa mostra as arestas da AGM de Kruskal.
