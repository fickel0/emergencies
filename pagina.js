// a tela: liga os formulários, as janelas e a tabela ao central.js

const POR_PAGINA = 50;

let resultado = [];
let regiaoFiltro = "";
let pagina = 0;

function el(id) {
    return document.getElementById(id);
}

function novaOpcao(texto, valor) {
    const opcao = document.createElement("option");
    opcao.textContent = texto;
    opcao.value = valor;
    return opcao;
}

// carga

el("arquivo").addEventListener("change", async () => {
    const arquivo = el("arquivo").files[0];
    if (arquivo) carregar(await arquivo.text());
});

async function carregar(texto) {
    const relatorio = await carregarCsv(texto);
    el("infoCarga").textContent = `${ocorrencias.tamanho} ocorrências carregadas`;
    el("textoRelatorio").textContent = [
        `${ocorrencias.tamanho} ocorrências carregadas.`,
        parteDoRelatorio("Incompletas ou inválidas (não carregadas)", relatorio.incompletas),
        parteDoRelatorio("Alteradas fora do sistema (o hash não bate)", relatorio.alteradas),
        parteDoRelatorio("Duplicadas", relatorio.duplicadas),
        parteDoRelatorio("Conflitos de versão (ficou a primeira)", relatorio.conflitos),
    ].join("\n\n");
    el("relatorio").showModal();
    preencherListas();
    buscar();
}

function parteDoRelatorio(titulo, lista) {
    const linhas = [`${titulo}: ${lista.length}`];
    for (const item of lista.slice(0, 20)) linhas.push("  " + item);
    if (lista.length > 20) linhas.push(`  ... e mais ${lista.length - 20}`);
    return linhas.join("\n");
}

function preencherListas() {
    el("regioesConhecidas").replaceChildren();
    for (const regiao of chavesUsadas(idxRegiao)) {
        el("regioesConhecidas").append(novaOpcao(regiao, regiao));
    }

    el("tiposConhecidos").replaceChildren();
    for (const tipo of prioridades.chaves().sort()) el("tiposConhecidos").append(novaOpcao(tipo, tipo));

    atualizarTipos();
}

function atualizarTipos() {
    const cat = el("categoria").value;
    const tipoEscolhido = el("tipo").value;
    el("tipo").replaceChildren(novaOpcao("todos", ""));
    for (const tipo of chavesUsadas(idxTipo)) {
        if (cat === "" || idxTipo.buscar(tipo).valores().some((o) => o.categoria === cat)) {
            el("tipo").append(novaOpcao(tipo, tipo));
        }
    }
    el("tipo").value = [...el("tipo").options].some((o) => o.value === tipoEscolhido) ? tipoEscolhido : "";
}

el("salvarCsv").addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([gerarCsv()], { type: "text/csv" }));
    link.download = "dados.csv";
    link.click();
});

// busca

el("endereco").addEventListener("input", () => {
    el("sugestoes").replaceChildren();
    const texto = el("endereco").value.toUpperCase();
    const antes = texto.slice(0, texto.lastIndexOf(" ") + 1);
    const ultima = texto.slice(antes.length);
    if (ultima === "") return;
    for (const s of sugestoes(ultima).slice(0, 20)) {
        el("sugestoes").append(novaOpcao(`${s.palavra} (${s.quantidade})`, antes + s.palavra));
    }
});

function limparFiltros() {
    el("busca").reset();
    el("incluirAtendidas").checked = false;
    el("viaturas").disabled = false;
    regiaoFiltro = "";
    atualizarTipos();
}

function atualizarTela() {
    if (el("id").value !== "") el("consulta").requestSubmit();
    else if (el("viaturas").value !== "") despacharOuBuscar();
    else buscar();
}

el("consulta").addEventListener("submit", (evento) => {
    evento.preventDefault();
    el("viaturas").value = "";
    limparFiltros();
    const o = consultarId(el("id").value);
    mostrarResultado(o === undefined ? [] : [o]);
});

el("incluirAtendidas").addEventListener("change", () => {
    const inc = el("incluirAtendidas").checked;
    el("viaturas").value = "";
    el("viaturas").disabled = inc;
    buscar();
});

el("viaturas").addEventListener("input", () => {
    el("id").value = "";
    limparFiltros();
    despacharOuBuscar();
});

el("atenderLote").addEventListener("click", async () => {
    for (const o of resultado.filter((o) => o.atendido === 0)) await marcarAtendida(o);
    atualizarTela();
});

el("categoria").addEventListener("change", atualizarTipos);

for (const r of document.querySelectorAll('input[name="ordem"]')) {
    r.addEventListener("change", () => {
        el("viaturas").value = "";
        buscar();
    });
}

el("busca").addEventListener("input", () => {
    el("viaturas").value = "";
    buscar();
});

el("busca").addEventListener("submit", (evento) => evento.preventDefault());

el("limpar").addEventListener("click", () => {
    el("id").value = "";
    el("viaturas").value = "";
    limparFiltros();
    buscar();
});

el("qualquerPeriodo").addEventListener("click", () => {
    el("viaturas").value = "";
    el("de").value = "";
    el("ate").value = "";
    buscar();
});

for (const botao of document.querySelectorAll("[data-minutos]")) {
    botao.addEventListener("click", () => {
        el("viaturas").value = "";
        const agora = Date.now();
        el("de").value = paraCampo(agora - botao.dataset.minutos * 60 * 1000);
        el("ate").value = paraCampo(agora);
        buscar();
    });
}

function paraCampo(ms) {
    const fuso = new Date(ms).getTimezoneOffset() * 60 * 1000;
    return new Date(ms - fuso).toISOString().slice(0, 19);
}

function paraSegundos(valorDoCampo) {
    return Math.floor(new Date(valorDoCampo).getTime() / 1000);
}

function buscar() {
    el("id").value = "";
    const de = el("de").value;
    const ate = el("ate").value;
    const lista = buscarOcorrencias({
        endereco: palavrasDe(el("endereco").value),
        regiao: regiaoFiltro,
        categoria: el("categoria").value,
        tipo: el("tipo").value,
        soPendentes: !el("incluirAtendidas").checked,
        ordem: el("busca").ordem.value,
        menor: de ? criarId(paraSegundos(de), 0) : 0,
        maior: ate ? criarId(paraSegundos(ate), 255) : Number.MAX_SAFE_INTEGER,
    });
    mostrarResultado(lista);
}

function despacharOuBuscar() {
    const limite = Math.min(500, Math.floor(Number(el("viaturas").value)));
    if (!(limite > 0)) {
        buscar();
        return;
    }
    const todasPendentes = pendentes.valores();
    ordenar(todasPendentes, false, "prioridade");
    mostrarResultado(otimizarViaturas(todasPendentes, limite));
}

// janela de cadastro e edição

let editando = null;

el("nova").addEventListener("click", () => abrirJanela(null));

function abrirJanela(o) {
    editando = o;
    const f = el("editor");
    f.reset();
    el("botaoRemover").hidden = o === null;
    if (o === null) {
        el("tituloJanela").textContent = "Nova ocorrência";
    } else {
        el("tituloJanela").textContent = `Ocorrência ${idParaTexto(o.id)}, de ${dataNaTela(o.id)}`;
        f.categoria.value = o.categoria;
        f.tipo.value = o.tipo;
        f.regiao.value = o.regiao;
        f.zip.value = o.zip;
        f.endereco.value = o.endereco;
        f.atendido.checked = o.atendido === 1;
    }
    el("janela").returnValue = "";
    el("janela").showModal();
}

el("janela").addEventListener("close", async () => {
    const acao = el("janela").returnValue;
    const f = el("editor");
    if (acao === "salvar") {
        const salva = await salvarOcorrencia(editando, {
            categoria: f.categoria.value,
            tipo: f.tipo.value,
            regiao: f.regiao.value,
            zip: f.zip.value,
            endereco: f.endereco.value,
            atendido: f.atendido.checked,
        });
        if (salva === null) alert("Não salvou: tem campo vazio ou categoria inválida.");
    } else if (acao === "remover") {
        removerOcorrencia(editando);
    } else {
        return;
    }
    preencherListas();
    atualizarTela();
});

// tabela e páginas

function mostrarResultado(lista) {
    resultado = lista;
    const btn = el("atenderLote");
    const pendentesNaLista = lista.filter((o) => o.atendido === 0).length;
    btn.hidden = el("incluirAtendidas").checked;
    btn.disabled = pendentesNaLista === 0;
    btn.textContent = `✓ Atender (${pendentesNaLista})`;
    el("contagem").textContent = `${resultado.length} ocorrências`;
    pagina = 0;
    mostrar();
    mostrarRede();
}

el("anterior").addEventListener("click", () => {
    pagina--;
    mostrar();
});

el("proxima").addEventListener("click", () => {
    pagina++;
    mostrar();
});

function dataNaTela(id) {
    return new Date(segundosDoId(id) * 1000).toLocaleString("pt-BR");
}

function mostrar() {
    const tabela = el("linhas");
    tabela.replaceChildren();
    for (const o of resultado.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)) {
        const tr = tabela.insertRow();
        const sit = o.atendido ? "A" : "P";
        const valores = [idParaTexto(o.id), dataNaTela(o.id), o.categoria, o.tipo, nivelDe(o), viaturasDe(o), o.regiao, o.endereco, sit];
        valores.forEach((valor, idx) => {
            const td = tr.insertCell();
            td.textContent = valor;
            if (idx === 4 || idx === 5 || idx === 8) td.className = "centro";
        });
        const acoes = tr.insertCell();
        acoes.className = "acoes";
        if (!o.atendido) {
            const atender = document.createElement("button");
            atender.textContent = "✓";
            atender.addEventListener("click", async () => {
                await marcarAtendida(o);
                atualizarTela();
            });
            acoes.append(atender);
        }
        const editar = document.createElement("button");
        editar.textContent = "✎";
        editar.addEventListener("click", () => abrirJanela(o));
        acoes.append(editar);
    }
    const totalPaginas = Math.max(1, Math.ceil(resultado.length / POR_PAGINA));
    el("pagina").textContent = `página ${pagina + 1} de ${totalPaginas}`;
    el("anterior").disabled = pagina === 0;
    el("proxima").disabled = pagina >= totalPaginas - 1;
}

mostrar();

// protocolos de atendimento

let selecionado = null;
let rascunhos = null;

function grafoAtual() {
    return rascunhos.buscar(el("categoriaProtocolo").value);
}

function copiarProtocolos(origem) {
    const copia = new TabelaHash();
    for (const cat of origem.chaves()) {
        const g = new Grafo(ETAPAS);
        for (const [u, v] of origem.buscar(cat).arestas()) g.adicionarAresta(u, v);
        copia.inserir(cat, g);
    }
    return copia;
}

el("abrirProtocolos").addEventListener("click", () => {
    selecionado = null;
    el("categoriaProtocolo").value = "EMS";
    rascunhos = copiarProtocolos(protocolos);
    mostrarProtocolo();
    el("janelaProtocolos").returnValue = "";
    el("janelaProtocolos").showModal();
});

el("janelaProtocolos").addEventListener("close", () => {
    if (el("janelaProtocolos").returnValue === "salvar") {
        for (const cat of rascunhos.chaves()) protocolos.inserir(cat, rascunhos.buscar(cat));
    }
});

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
            <marker id="seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#444"/></marker>
            <marker id="setaCiclo" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#c00"/></marker>
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
        const cor = bloq ? "#c00" : "#444";
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
        const corBorda = sel ? "#06c" : bloq ? "#c00" : "#333";
        const corFundo = sel ? "#def" : bloq ? "#fdd" : "#eee";
        const dx = cos >= -0.01 ? 24 : -24;
        const ancora = cos >= -0.01 ? "start" : "end";
        linhas.push(
            `<g data-vertice="${i}" style="cursor:pointer">`,
            `<circle cx="${x}" cy="${y}" r="16" fill="${corFundo}" stroke="${corBorda}" stroke-width="1.5"/>`,
            `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="bold" fill="${corBorda}">${rotulo}</text>`,
            `<text x="${x + dx}" y="${y + 4}" text-anchor="${ancora}" font-size="13" fill="${corBorda}">${v}</text>`,
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
