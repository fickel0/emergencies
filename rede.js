function chaveAresta(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

class Rede {
    constructor() {
        this.carregar("");
    }

    carregar(cabecalho) {
        this.cidades = new TabelaHash();
        this.adjacencia = new TabelaHash();
        this.listaArestas = [];
        this.cabecalho = cabecalho;
        if (!cabecalho.startsWith("#")) return;

        for (const item of cabecalho.slice(1).split(";")) {
            const [nome, lat, lng] = item.split(":");
            if (nome && lat && lng) {
                this.cidades.inserir(nome, { nome, lat: Number(lat), lng: Number(lng) });
                this.adjacencia.inserir(nome, new TabelaHash());
            }
        }

        const nomes = this.cidades.chaves();
        const vistas = new TabelaHash();
        for (const a of nomes) {
            const ca = this.cidades.buscar(a);
            const vizinhos = nomes
                .filter((b) => b !== a)
                .map((b) => {
                    const cb = this.cidades.buscar(b);
                    const km = Math.round(Math.hypot((ca.lat - cb.lat) * 111, (ca.lng - cb.lng) * 85) * 10) / 10 || 0.1;
                    return { b, km };
                })
                .sort((x, y) => x.km - y.km)
                .slice(0, 3);

            for (const { b, km } of vizinhos) {
                this.adjacencia.buscar(a).inserir(b, km);
                this.adjacencia.buscar(b).inserir(a, km);
                const par = chaveAresta(a, b);
                if (vistas.buscar(par) === undefined) {
                    vistas.inserir(par, true);
                    this.listaArestas.push({ u: a < b ? a : b, v: a < b ? b : a, km });
                }
            }
        }
        this.agm = this.arvoreGeradoraMinima();
    }

    caminhoMinimo(origem, destino) {
        const dist = new TabelaHash();
        const ant = new TabelaHash();
        for (const v of this.cidades.chaves()) dist.inserir(v, Infinity);
        dist.inserir(origem, 0);

        const heap = [{ v: origem, d: 0 }];
        const empilhar = (v, d) => {
            let i = heap.push({ v, d }) - 1;
            for (let p; i > 0 && heap[(p = (i - 1) >> 1)].d > heap[i].d; i = p) {
                [heap[p], heap[i]] = [heap[i], heap[p]];
            }
        };
        const desempilhar = () => {
            const topo = heap[0], fim = heap.pop();
            if (heap.length > 0) {
                heap[0] = fim;
                for (let i = 0, f; (f = i * 2 + 1) < heap.length; i = f) {
                    if (f + 1 < heap.length && heap[f + 1].d < heap[f].d) f++;
                    if (heap[i].d <= heap[f].d) break;
                    [heap[i], heap[f]] = [heap[f], heap[i]];
                }
            }
            return topo;
        };

        while (heap.length > 0) {
            const { v: u, d } = desempilhar();
            if (d > dist.buscar(u)) continue;
            if (u === destino) break;

            const viz = this.adjacencia.buscar(u);
            for (const v of viz.chaves()) {
                const nova = d + viz.buscar(v);
                if (nova < dist.buscar(v)) {
                    dist.inserir(v, nova);
                    ant.inserir(v, u);
                    empilhar(v, nova);
                }
            }
        }

        const caminho = [];
        const arestas = new TabelaHash();
        if (dist.buscar(destino) < Infinity) {
            for (let atual = destino; atual !== undefined; atual = ant.buscar(atual)) {
                caminho.push(atual);
                const p = ant.buscar(atual);
                if (p !== undefined) arestas.inserir(chaveAresta(atual, p), true);
            }
            caminho.reverse();
        }
        return { caminho, arestas, km: Math.round(dist.buscar(destino) * 10) / 10 };
    }

    arvoreGeradoraMinima() {
        const pai = new TabelaHash();
        for (const v of this.cidades.chaves()) pai.inserir(v, v);

        const find = (v) => {
            if (pai.buscar(v) === v) return v;
            const raiz = find(pai.buscar(v));
            pai.inserir(v, raiz);
            return raiz;
        };

        const ordenadas = this.listaArestas.slice().sort((a, b) => a.km - b.km);
        const arestas = new TabelaHash();
        let total = 0;

        for (const a of ordenadas) {
            const ru = find(a.u);
            const rv = find(a.v);
            if (ru !== rv) {
                pai.inserir(ru, rv);
                arestas.inserir(`${a.u}|${a.v}`, true);
                total += a.km;
            }
        }
        return { arestas, km: Math.round(total * 10) / 10 };
    }
}

const CONTORNO_CONDADO = [
    [40.0655, -75.3611], [40.1486, -75.5259], [40.1895, -75.5492], [40.2072, -75.5571],
    [40.1974, -75.5629], [40.1953, -75.5733], [40.2255, -75.5927], [40.2419, -75.6968],
    [40.4470, -75.5297], [40.4185, -75.4841], [40.3078, -75.2998], [40.1911, -75.1049],
    [40.1380, -75.0151], [40.0690, -75.0967], [40.0636, -75.0874], [40.0458, -75.1094],
    [40.0703, -75.1516], [40.0846, -75.1764], [40.0541, -75.2644], [39.9905, -75.2492],
    [39.9770, -75.2765], [40.0529, -75.3495],
];

const rede = new Rede();
