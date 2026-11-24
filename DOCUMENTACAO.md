# Central de Emergências: Operação Resgate

CRUD de chamadas do 911 no Condado de Montgomery, Pensilvânia (EUA), em página web estática, sobre o dataset [911 Calls, Montgomery County (Kaggle)](https://www.kaggle.com/datasets/mchirico/montcoalert). Todas as estruturas de dados e algoritmos foram implementados do zero em JavaScript.

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

| Estrutura / Algoritmo               | Arquivo                     | Dimensões com `dados.csv`               | Complexidade                                              | Escolha e papel                                                                                                                                                                                                                                                   |
| ----------------------------------- | --------------------------- | --------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Árvore B+ ($M=5, L=64$)             | `arvoreBMais.js`            | 10.000 ocorrências                      | Busca, ins. e rem. $O(\log n)$; intervalo $O(\log n + k)$ | Guarda as ocorrências ordenadas por `id`. Cada nó interno ocupa 64 B (uma linha de cache) num `ArrayBuffer`, e cada folha guarda até 64 chaves em sequência para varrer períodos pelas folhas encadeadas.                                                         |
| Trie ternária (TST)                 | `tst.js`                    | 2.523 palavras                          | Prefixo $O(L + k)$                                        | Índice de prefixo das palavras do endereço, sem tipos de via (`ST`, `RD`, `AVE`) nem direções (`N`, `W`). Usa menos memória que a R-way e é mais simples que a Patricia, onde um prefixo pode parar no meio de uma aresta.                                        |
| Tabela hash                         | `tabelaHash.js`             | 64 tipos, 68 regiões, 143 pendentes     | $O(1)$ médio                                              | Hash polinomial base 31 (Horner, módulo $2^{32}$) com encadeamento e rehash acima de 0,75 de carga. Substitui `Map` e `Set` do JavaScript nos índices, conjuntos e listas de adjacência.                                                                          |
| Grafo direcionado (DFS de 3 cores)  | `grafo.js`, `protocolos.js` | 3 protocolos × 7 etapas (5 a 6 arestas) | $O(V + E)$                                                | Representa dependências `u → v` entre etapas de atendimento. Uma única DFS detecta ciclos ao encontrar um vértice cinza na pilha e devolve a ordem topológica na pilha de saída.                                                                                  |
| Mochila 0/1 (programação dinâmica)  | `central.js`                | 143 pendentes × $W$ viaturas            | Tempo e espaço $O(n \cdot W)$                             | Matriz densa bottom-up `dp[n + 1][W + 1]` onde `dp[i][j]` é a maior soma de prioridades nas primeiras `i` pendentes com até `j` viaturas. Evita o erro guloso de gastar 4 viaturas num chamado de prioridade 5 quando duas ocorrências de 2 viaturas somariam 10. |
| Rede ponderada (Dijkstra e Kruskal) | `rede.js`, `mapa.js`        | 68 regiões e 126 arestas                | Dijkstra $O((V + E) \log V)$; Kruskal $O(E \log E)$       | Liga cada região às 3 vizinhas mais próximas com peso em km. Dijkstra com min-heap binário calcula a rota desde `Norristown`, e Kruskal com Union-Find e compressão de caminho monta a árvore geradora mínima da malha esparsa.                                  |

## Detalhes da implementação

- Cada ocorrência é alocada uma única vez nas folhas da Árvore B+ (`central.js`), enquanto a TST de palavras e as tabelas hash (`idxTipo`, `idxRegiao`, `pendentes`) guardam só referências para esse objeto, como conjuntos indexados pelo `id` em outra `TabelaHash`. Na carga do CSV, o SHA-256 de cada linha é recalculado via `crypto.subtle` para barrar registros incompletos ou com `id` conflitante e avisar sobre linhas alteradas fora do sistema ou duplicadas (no `dados.csv`, 5 pares de chamadas no mesmo segundo têm o mesmo conteúdo em `id`s distintos, como `TNZFKH` e `TNZFKH-1`).
- Na busca combinada (`pagina.js`, `central.js`), em vez de varrer as 10.000 ocorrências, a consulta parte sempre do menor conjunto candidato disponível. Se houver busca por endereço, a TST devolve as ocorrências cujas palavras começam pelos prefixos digitados; caso contrário, entre os filtros preenchidos (`regiao`, `tipo`, `soPendentes`), o sistema escolhe a tabela hash com menor `.tamanho`; sem nenhum deles, desce uma vez na B+ e percorre as folhas encadeadas no intervalo `[menor, maior]`. Só esse subconjunto passa pelo filtro final e pela ordenação (por prioridade de nível 5 a 1 com desempate pela mais antiga, ou por data).
- Nos protocolos operacionais (`grafo.js`, `protocolos.js`), as categorias `EMS`, `Fire` e `Traffic` compartilham as mesmas 7 etapas e guardam suas listas de adjacência em `TabelaHash`. A DFS marca cada etapa com 3 estados (`0` não visitada, `1` na pilha de recursão, `2` finalizada) e mantém a pilha do caminho atual. Ao encontrar uma aresta `u → v` para um vértice `v` em estado `1`, recorta da pilha apenas o trecho de `v` até `u` para pintar de vermelho somente as etapas e setas que formam o ciclo real. Quando não há ciclo, a pilha de finalização invertida numera a ordem topológica das etapas conectadas.
- Ao preencher o campo `Viaturas`, o despacho (`otimizarViaturas` em `central.js`) ignora os filtros da tela e toma todas as 143 ocorrências do índice `pendentes`, porque distribui a frota inteira. A matriz `dp[n + 1][W + 1]` usa `Int32Array`, casos base `dp[0][j] = dp[i][0] = 0` e transição $\max(\text{dp}[i-1][j], v_i + \text{dp}[i-1][j-p_i])$. A reconstrução percorre de `dp[n][W]` até `i = 1`, recolhendo toda ocorrência em que `dp[i][j] !== dp[i - 1][j]` e descontando $p_i$ de `j` (com 21 viaturas, escolhe 11 chamados que usam 21/21 viaturas e somam 46 de prioridade). O botão `Atender (N)` grava o timestamp atual nas escolhidas na B+ e as remove de `pendentes`.
- No mapa em SVG (`rede.js`, `mapa.js`), a fronteira de Montgomery County foi extraída do GeoJSON do OpenStreetMap (`relation 417844`) e simplificada com Ramer-Douglas-Peucker para 93 vértices em `CONTORNO_CONDADO`, com as 67 arestas (230,8 km) da árvore geradora mínima de Kruskal ao fundo. A cada busca ou simulação de viaturas, o mapa conta quantas ocorrências do resultado atual caem em cada município e pinta os nós em escala de vermelho. Clicar num município filtra a tabela por ele via `idxRegiao` e desenha em azul o caminho mínimo de Dijkstra desde a central em `Norristown` (até `Pottstown`, por exemplo, são 50,3 km). No arrasto do mouse, o mapa move apenas o `viewBox` do SVG e deixa para redesenhar os elementos ao soltar o botão.
