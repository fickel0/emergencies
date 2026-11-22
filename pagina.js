// a tela: liga os formulários, as janelas e a tabela ao central.js

const POR_PAGINA = 50;

let resultado = [];
let simulacao = null;
let pagina = 0;

// atalho pra pegar um elemento pelo id
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

// tudo fica só na memória: um F5 apaga os dados e a escolha do arquivo
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

// o título com a quantidade e as 20 primeiras, pra janela não ficar enorme
function parteDoRelatorio(titulo, lista) {
    const linhas = [`${titulo}: ${lista.length}`];
    for (const item of lista.slice(0, 20)) linhas.push("  " + item);
    if (lista.length > 20) linhas.push(`  ... e mais ${lista.length - 20}`);
    return linhas.join("\n");
}

// as listas de região e de tipo saem das chaves dos próprios índices. o que estava
// escolhido continua escolhido (depois de salvar uma ocorrência, por exemplo)
function preencherListas() {
    const regiaoEscolhida = el("regiao").value;
    const tipoEscolhido = el("tipo").value;

    el("regiao").replaceChildren(novaOpcao("todas", ""));
    el("regioesConhecidas").replaceChildren();
    for (const regiao of chavesUsadas(idxRegiao)) {
        el("regiao").append(novaOpcao(regiao, regiao));
        el("regioesConhecidas").append(novaOpcao(regiao, regiao));
    }

    el("tipo").replaceChildren(novaOpcao("todos", ""));
    for (const tipo of chavesUsadas(idxTipo)) el("tipo").append(novaOpcao(tipo, tipo));

    // na janela de edição, a sugestão de tipo são os da tabela de prioridades
    el("tiposConhecidos").replaceChildren();
    for (const tipo of prioridades.chaves().sort()) el("tiposConhecidos").append(novaOpcao(tipo, tipo));

    el("regiao").value = regiaoEscolhida;
    el("tipo").value = tipoEscolhido;
}

// salvar CSV: baixa o arquivo
el("salvarCsv").addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([gerarCsv()], { type: "text/csv" }));
    link.download = "dados.csv";
    link.click();
});

// busca

// a cada letra digitada, sugere as palavras que começam com a última palavra do campo.
// as palavras de antes ficam como estão
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

// o id não combina com os filtros, então eles são limpos (e, no contrário, buscar pelos
// filtros apaga o id)
el("consulta").addEventListener("submit", (evento) => {
    evento.preventDefault(); // senão o formulário recarrega a página
    el("endereco").value = "";
    el("regiao").value = "";
    el("categoria").value = "";
    el("tipo").value = "";
    el("de").value = "";
    el("ate").value = "";
    el("soPendentes").checked = false;
    const o = consultarId(el("id").value);
    mostrarResultado(o === undefined ? [] : [o]);
});

// qualquer mudança num filtro (digitar, escolher, marcar) já refaz a busca.
// escolher uma sugestão do endereço também conta como mudança
el("busca").addEventListener("input", buscar);

// o Enter não pode enviar o formulário, senão a página recarrega
el("busca").addEventListener("submit", (evento) => evento.preventDefault());

// volta tudo pro padrão: só pendentes, por prioridade, sem endereço, região, tipo nem período
el("limpar").addEventListener("click", () => {
    el("busca").reset();
    buscar();
});

el("qualquerPeriodo").addEventListener("click", () => {
    el("de").value = "";
    el("ate").value = "";
    buscar();
});

// os atalhos preenchem de (agora - x minutos) até agora
for (const botao of document.querySelectorAll("[data-minutos]")) {
    botao.addEventListener("click", () => {
        const agora = Date.now();
        el("de").value = paraCampo(agora - botao.dataset.minutos * 60 * 1000);
        el("ate").value = paraCampo(agora);
        buscar();
    });
}

// o campo datetime-local quer "2026-10-05T14:30:00" no horário local
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
        regiao: el("regiao").value,
        categoria: el("categoria").value,
        tipo: el("tipo").value,
        soPendentes: el("soPendentes").checked,
        ordem: el("busca").ordem.value, // recentes, antigos ou prioridade
        // o período vira um intervalo de ids: do primeiro sufixo do segundo inicial até
        // o último sufixo do segundo final. sem data, vai do começo ao fim
        menor: de ? criarId(paraSegundos(de), 0) : 0,
        maior: ate ? criarId(paraSegundos(ate), 255) : Number.MAX_SAFE_INTEGER,
    });
    mostrarResultado(lista);
}

// janela de cadastro e edição

// a mesma janela serve pra criar e editar. editando é a ocorrência aberta, ou null se for nova
let editando = null;

el("nova").addEventListener("click", () => abrirJanela(null));

function abrirJanela(o) {
    editando = o;
    const f = el("editor");
    f.reset();
    el("botaoRemover").hidden = o === null;
    if (o === null) {
        el("tituloJanela").textContent = "Nova ocorrência (com a data e hora de agora)";
    } else {
        el("tituloJanela").textContent = `Ocorrência ${idParaTexto(o.id)}, de ${dataNaTela(o.id)}`;
        f.categoria.value = o.categoria;
        f.tipo.value = o.tipo;
        f.regiao.value = o.regiao;
        f.zip.value = o.zip;
        f.endereco.value = o.endereco;
        f.atendido.checked = o.atendido === 1;
    }
    el("janela").returnValue = ""; // o Esc fecha sem mudar isso, então conta como cancelar
    el("janela").showModal();
}

// o form da janela é method="dialog": qualquer botão fecha a janela, e o value do botão
// vira o returnValue
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
    // refaz o que estava na tela: a consulta por id, se tinha uma, ou a busca pelos filtros
    if (el("id").value !== "") el("consulta").requestSubmit();
    else buscar();
});

// tabela e páginas

// só a exibição é dividida em páginas: o resultado inteiro já foi calculado (a tela mostra
// o total e a ordem por prioridade precisa de todo mundo). é só pra não desenhar
// 10 mil linhas de uma vez

function mostrarResultado(lista) {
    const limite = Math.min(500, Math.floor(Number(el("viaturas").value)));
    if (limite > 0 && lista.length > 0) {
        const sim = otimizarViaturas(lista, limite);
        const dentro = lista.filter((o) => sim.selecionadas.buscar(o.id) === true);
        const fora = lista.filter((o) => sim.selecionadas.buscar(o.id) === undefined);
        resultado = dentro.concat(fora);
        simulacao = sim.selecionadas;
        el("resumoViaturas").textContent =
            `${dentro.length} selecionadas e ${fora.length} de fora ` +
            `(${sim.usadas}/${limite} viaturas empenhadas, prioridade total ${sim.prioridadeTotal})`;
    } else {
        resultado = lista;
        simulacao = null;
        el("resumoViaturas").textContent = "";
    }
    el("contagem").textContent = `${resultado.length} ocorrências`;
    pagina = 0;
    mostrar();
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
        const data = dataNaTela(o.id);
        let situacao = o.atendido ? "atendida" : "pendente";
        const tr = tabela.insertRow();
        if (simulacao !== null) {
            const entrou = simulacao.buscar(o.id) === true;
            situacao = entrou ? "selecionada" : "de fora";
            if (!entrou) tr.style.opacity = "0.45";
        }
        const valores = [idParaTexto(o.id), data, o.categoria, o.tipo, nivelDe(o), viaturasDe(o), o.regiao, o.endereco, situacao];
        for (const valor of valores) tr.insertCell().textContent = valor;
        const editar = document.createElement("button");
        editar.textContent = "editar";
        editar.addEventListener("click", () => abrirJanela(o));
        tr.insertCell().append(editar);
    }
    const totalPaginas = Math.max(1, Math.ceil(resultado.length / POR_PAGINA));
    el("pagina").textContent = `página ${pagina + 1} de ${totalPaginas}`;
    el("anterior").disabled = pagina === 0;
    el("proxima").disabled = pagina >= totalPaginas - 1;
}

mostrar();

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
    const n = ETAPAS.length;
    const pos = new TabelaHash();
    ETAPAS.forEach((v, i) => {
        const ang = (2 * Math.PI * i) / n - Math.PI / 2;
        pos.inserir(v, { x: 490 + 170 * Math.cos(ang), y: 220 + 160 * Math.sin(ang), cos: Math.cos(ang) });
    });

    const arestas = g.arestas();
    const linhas = [
        `<defs>
            <marker id="seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#444"/></marker>
            <marker id="setaCiclo" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#c00"/></marker>
        </defs>`,
    ];

    arestas.forEach(([u, v], i) => {
        const a = pos.buscar(u);
        const b = pos.buscar(v);
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
        const { x, y, cos } = pos.buscar(v);
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
