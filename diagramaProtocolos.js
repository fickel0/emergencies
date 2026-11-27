// diagrama dos protocolos: desenha o grafo da categoria, destaca o ciclo e edita arestas por clique

let selecionado = null;

function grafoAtual() {
    return protocolos.buscar(el("categoriaProtocolo").value);
}

el("categoriaProtocolo").addEventListener("change", () => {
    selecionado = null;
    mostrarProtocolo();
});

function mostrarProtocolo() {
    const g = grafoAtual();
    const res = g.ordemTopologica();
    const pos = ETAPAS.map((_, i) => {
        const ang = (2 * Math.PI * i) / ETAPAS.length - Math.PI / 2;
        return { x: 450 + 165 * Math.cos(ang), y: 200 + 150 * Math.sin(ang), cos: Math.cos(ang) };
    });

    const arestas = g.arestas();
    const linhas = [
        `<defs>
            <marker id="seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#1f2328"/></marker>
            <marker id="setaCiclo" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#cf222e"/></marker>
        </defs>`,
    ];

    arestas.forEach(([u, v], i) => {
        const a = pos[ETAPAS.indexOf(u)];
        const b = pos[ETAPAS.indexOf(v)];
        const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const dx = (b.x - a.x) / dist;
        const dy = (b.y - a.y) / dist;
        const desvio = g.adjacencia.buscar(v).buscar(u) ? 5 : 0;
        const nx = -dy * desvio;
        const ny = dx * desvio;
        const x1 = a.x + dx * 18 + nx;
        const y1 = a.y + dy * 18 + ny;
        const x2 = b.x - dx * 20 + nx;
        const y2 = b.y - dy * 20 + ny;
        const bloq = res.arestasCiclo.buscar(`${u}->${v}`) === true;
        const cor = bloq ? "#cf222e" : "#1f2328";
        const seta = bloq ? "url(#setaCiclo)" : "url(#seta)";
        linhas.push(
            `<g data-aresta="${i}" style="cursor:pointer">`,
            `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="12"/>`,
            `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${cor}" stroke-width="2.5" marker-end="${seta}"/>`,
            `</g>`
        );
    });

    ETAPAS.forEach((v, i) => {
        const { x, y, cos } = pos[i];
        const bloq = res.noCiclo.buscar(v) === true;
        const sel = v === selecionado;
        const idx = res.ordem.indexOf(v);
        const rotulo = bloq ? "!" : idx >= 0 ? idx + 1 : "";
        const corBorda = sel ? "#0969da" : bloq ? "#cf222e" : "#d0d7de";
        const corFundo = sel ? "#ddf4ff" : bloq ? "#ffebe9" : "#f6f8fa";
        const corTexto = sel ? "#0969da" : bloq ? "#cf222e" : "#1f2328";
        const dx = cos >= -0.01 ? 24 : -24;
        const ancora = cos >= -0.01 ? "start" : "end";
        linhas.push(
            `<g data-vertice="${i}" style="cursor:pointer">`,
            `<circle cx="${x}" cy="${y}" r="16" fill="${corFundo}" stroke="${corBorda}" stroke-width="1.5"/>`,
            `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="bold" fill="${corTexto}">${rotulo}</text>`,
            `<text x="${x + dx}" y="${y + 4}" text-anchor="${ancora}" font-size="13" fill="${corTexto}">${v}</text>`,
            `</g>`
        );
    });

    const svg = el("grafoSvg");
    svg.innerHTML = linhas.join("");
    for (const arco of svg.querySelectorAll("[data-aresta]")) {
        const [u, v] = arestas[arco.dataset.aresta];
        arco.addEventListener("click", () => {
            g.removerAresta(u, v);
            mostrarProtocolo();
        });
    }
    for (const no of svg.querySelectorAll("[data-vertice]")) {
        const v = ETAPAS[no.dataset.vertice];
        no.addEventListener("click", () => {
            if (selecionado === null) {
                selecionado = v;
            } else if (selecionado === v) {
                selecionado = null;
            } else {
                g.adicionarAresta(selecionado, v);
                selecionado = null;
            }
            mostrarProtocolo();
        });
    }
}
