class GrafoDirecionado {
    constructor(vertices) {
        this.adjacencia = new TabelaHash();
        for (const v of vertices) this.adjacencia.inserir(v, new TabelaHash());
    }

    adicionarAresta(antes, depois) {
        this.adjacencia.buscar(antes).inserir(depois, true);
    }

    removerAresta(antes, depois) {
        this.adjacencia.buscar(antes).remover(depois);
    }

    vertices() {
        return this.adjacencia.chaves();
    }

    arestas() {
        const lista = [];
        for (const u of this.vertices()) {
            for (const v of this.adjacencia.buscar(u).chaves()) lista.push([u, v]);
        }
        return lista;
    }

    // DFS com regra das 3 cores (1 = cinza na pilha, 2 = preto) e pilha de resultado
    ordemTopologica() {
        const ativos = new TabelaHash();
        for (const [u, v] of this.arestas()) {
            ativos.inserir(u, true);
            ativos.inserir(v, true);
        }

        const cor = new TabelaHash();
        const trilha = [];
        const pilha = [];
        const noCiclo = new TabelaHash();
        const arestasCiclo = new TabelaHash();

        const visitar = (u) => {
            cor.inserir(u, 1);
            trilha.push(u);
            for (const v of this.adjacencia.buscar(u).chaves()) {
                if (cor.buscar(v) === 1) {
                    const trecho = trilha.slice(trilha.indexOf(v));
                    trecho.forEach((n, i) => {
                        noCiclo.inserir(n, true);
                        arestasCiclo.inserir(`${n}->${trecho[(i + 1) % trecho.length]}`, true);
                    });
                } else if (cor.buscar(v) === undefined) {
                    visitar(v);
                }
            }
            trilha.pop();
            cor.inserir(u, 2);
            pilha.push(u);
        };

        for (const v of this.vertices()) {
            if (ativos.buscar(v) && cor.buscar(v) === undefined) visitar(v);
        }

        const valida = noCiclo.tamanho === 0;
        return { valida, ordem: valida ? pilha.reverse() : [], noCiclo, arestasCiclo };
    }
}
