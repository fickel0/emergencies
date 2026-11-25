// o mapa da rede: desenho em SVG, calor das ocorrências, zoom e arrasto.
// usa resultado, regiaoFiltro e buscar do pagina.js.

const CENTRAL = "Norristown";
const CONTORNO_CONDADO = [
    [40.2419, -75.6968], [40.2366, -75.6905], [40.2361, -75.6876], [40.2446, -75.6707], [40.2446, -75.6631], [40.2413, -75.6575],
    [40.2419, -75.6509], [40.2303, -75.6201], [40.2248, -75.6161], [40.2229, -75.6119], [40.2241, -75.6067], [40.2268, -75.6033],
    [40.2288, -75.6032], [40.2337, -75.6077], [40.2372, -75.6061], [40.2380, -75.6018], [40.2366, -75.5966], [40.2188, -75.5899],
    [40.2066, -75.5812], [40.2004, -75.5794], [40.1976, -75.5772], [40.1937, -75.5706], [40.1943, -75.5669], [40.1974, -75.5629],
    [40.1996, -75.5623], [40.2062, -75.5649], [40.2090, -75.5643], [40.2097, -75.5609], [40.2071, -75.5571], [40.1899, -75.5494],
    [40.1872, -75.5466], [40.1828, -75.5456], [40.1757, -75.5406], [40.1684, -75.5288], [40.1595, -75.5269], [40.1501, -75.5277],
    [40.1490, -75.5264], [40.1471, -75.5228], [40.1477, -75.5195], [40.1585, -75.5127], [40.1600, -75.5091], [40.1595, -75.5035],
    [40.1572, -75.5009], [40.1545, -75.5008], [40.1449, -75.5095], [40.1407, -75.5111], [40.1334, -75.5069], [40.1273, -75.4955],
    [40.1255, -75.4893], [40.1292, -75.4715], [40.1249, -75.4618], [40.1197, -75.4622], [40.1174, -75.4686], [40.1124, -75.4716],
    [40.1063, -75.4682], [40.1030, -75.4618], [40.0974, -75.4630], [40.0945, -75.4567], [40.0876, -75.4563], [40.0938, -75.4421],
    [40.0891, -75.4386], [40.0972, -75.4200], [40.0608, -75.3930], [40.0724, -75.3669], [40.0655, -75.3611], [40.0662, -75.3601],
    [40.0628, -75.3565], [40.0162, -75.3207], [40.0198, -75.3114], [39.9770, -75.2765], [40.0091, -75.2098], [40.0117, -75.2058],
    [40.0130, -75.2080], [40.0213, -75.2185], [40.0278, -75.2317], [40.0333, -75.2398], [40.0541, -75.2644], [40.0929, -75.2236],
    [40.0728, -75.1885], [40.0847, -75.1765], [40.0457, -75.1089], [40.0493, -75.1061], [40.0571, -75.0930], [40.0635, -75.0870],
    [40.0689, -75.0963], [40.0787, -75.0869], [40.0858, -75.0778], [40.1058, -75.0584], [40.1323, -75.0206], [40.1380, -75.0151],
    [40.2551, -75.2100], [40.3045, -75.2946], [40.4470, -75.5297],
];
const svgMapa = document.getElementById("redeSvg");

let vb = { x: 70, y: 35, w: 490, h: 290 };
let arrastando = null;
let arrastouMapa = false;

function mostrarRede() {
    const svg = svgMapa;
    const nomes = rede.cidades.chaves();
    if (nomes.length === 0) {
        svg.innerHTML = "";
        if (el("escalaMapa")) el("escalaMapa").hidden = true;
        if (el("distanciaRota")) el("distanciaRota").hidden = true;
        return;
    }

    const contagem = new TabelaHash();
    let maxQtd = 0;
    for (const o of resultado) {
        const qtd = (contagem.buscar(o.regiao) ?? 0) + 1;
        contagem.inserir(o.regiao, qtd);
        if (qtd > maxQtd) maxQtd = qtd;
    }

    const s = vb.w / 660;
    const rota = regiaoFiltro !== "" ? rede.caminhoMinimo(CENTRAL, regiaoFiltro) : null;

    const todos = rede.cidades.valores().concat(CONTORNO_CONDADO.map(([lat, lng]) => ({ lat, lng })));
    const minLat = Math.min(...todos.map((c) => c.lat)), maxLat = Math.max(...todos.map((c) => c.lat));
    const minLng = Math.min(...todos.map((c) => c.lng)), maxLng = Math.max(...todos.map((c) => c.lng));
    const pos = (c) => ({
        x: 55 + ((c.lng - minLng) / (maxLng - minLng || 1)) * 540,
        y: 372 - ((c.lat - minLat) / (maxLat - minLat || 1)) * 350,
    });

    const escala = Math.min((svg.clientWidth || 660) / vb.w, (svg.clientHeight || 390) / vb.h);
    const pxPorKm = (540 / ((maxLng - minLng || 1) * 85)) * escala;
    const kmBarra = pxPorKm * 10 > 110 ? 5 : 10;
    if (el("escalaMapa")) {
        el("escalaMapa").hidden = false;
        el("textoEscala").textContent = `${kmBarra} km`;
        el("barraEscala").style.width = `${Math.round(pxPorKm * kmBarra)}px`;
    }

    const distEl = el("distanciaRota");
    if (distEl) {
        if (rota !== null && regiaoFiltro !== "") {
            distEl.textContent = `${rota.km} km`;
            distEl.hidden = false;
        } else {
            distEl.hidden = true;
        }
    }

    const pontosMapa = CONTORNO_CONDADO.map(([lat, lng]) => {
        const p = pos({ lat, lng });
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(" ");
    const linhas = [`<polygon points="${pontosMapa}" fill="#fff" stroke="#d0d7de" stroke-width="${1.5 * s}"/>`];

    for (const a of rede.listaArestas) {
        const p1 = pos(rede.cidades.buscar(a.u));
        const p2 = pos(rede.cidades.buscar(a.v));
        const par = `${a.u}|${a.v}`;
        const naRota = rota !== null && rota.arestas.buscar(par) === true;
        const naAgm = rede.agm.arestas.buscar(par) === true;
        const cor = naRota ? "#0969da" : naAgm ? "#57606a" : "#d0d7de";
        const larg = (naRota ? 2.5 : naAgm ? 1.5 : 1) * s;
        linhas.push(`<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${cor}" stroke-width="${larg}"/>`);
    }

    const tamFonte = 11.5 * s;
    const largHalo = 2.5 * s;

    nomes.forEach((nome, i) => {
        const p = pos(rede.cidades.buscar(nome));
        const qtd = contagem.buscar(nome) ?? 0;
        const t = maxQtd > 0 ? qtd / maxQtd : 0;
        const gb = Math.round(235 - t * 185);
        const corFundo = qtd > 0 ? `rgb(245,${gb},${gb})` : "#fff";
        const corBorda = nome === regiaoFiltro ? "#0969da" : qtd > 0 ? "#cf222e" : "#57606a";
        const esq = p.x > 520;
        const rotulo = qtd > 0 ? `${nome} (${qtd})` : nome;
        linhas.push(`<g data-cidade="${i}" style="cursor:pointer">`);
        if (nome === CENTRAL) {
            linhas.push(`<circle cx="${p.x}" cy="${p.y}" r="${8.5 * s}" fill="none" stroke="#1f2328" stroke-width="${1.2 * s}"/>`);
        }
        linhas.push(
            `<circle cx="${p.x}" cy="${p.y}" r="${(nome === regiaoFiltro ? 6.5 : 5) * s}" fill="${corFundo}" stroke="${corBorda}" stroke-width="${1.5 * s}"/>`,
            `<text x="${p.x + (esq ? -9 : 9) * s}" y="${p.y + 4 * s}" text-anchor="${esq ? "end" : "start"}" font-size="${tamFonte}" font-weight="${nome === regiaoFiltro || nome === CENTRAL ? "bold" : "500"}" fill="${nome === regiaoFiltro ? "#0969da" : "#1f2328"}" paint-order="stroke" stroke="#fff" stroke-width="${largHalo}">${rotulo}</text>`,
            `</g>`
        );
    });

    svg.innerHTML = linhas.join("");
    for (const no of svg.querySelectorAll("[data-cidade]")) {
        const nome = nomes[no.dataset.cidade];
        no.addEventListener("click", () => {
            if (arrastouMapa) return;
            el("id").value = "";
            el("viaturas").value = "";
            regiaoFiltro = regiaoFiltro === nome ? "" : nome;
            buscar();
        });
    }
}

function atualizarViewBox() {
    svgMapa.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}

function aplicarViewBox() {
    atualizarViewBox();
    mostrarRede();
}

svgMapa.addEventListener("wheel", (e) => {
    e.preventDefault();
    const fator = e.deltaY < 0 ? 0.85 : 1 / 0.85;
    const nw = Math.min(660, Math.max(150, vb.w * fator));
    const nh = (nw * 390) / 660;
    const rx = e.offsetX / (svgMapa.clientWidth || 660);
    const ry = e.offsetY / (svgMapa.clientHeight || 390);
    vb.x = Math.max(0, Math.min(660 - nw, vb.x + (vb.w - nw) * rx));
    vb.y = Math.max(0, Math.min(390 - nh, vb.y + (vb.h - nh) * ry));
    vb.w = nw;
    vb.h = nh;
    aplicarViewBox();
});

svgMapa.addEventListener("mousedown", (e) => {
    arrastando = { x: e.clientX, y: e.clientY, vbx: vb.x, vby: vb.y };
    arrastouMapa = false;
});

window.addEventListener("mousemove", (e) => {
    if (!arrastando) return;
    const dx = e.clientX - arrastando.x;
    const dy = e.clientY - arrastando.y;
    if (Math.hypot(dx, dy) > 4) arrastouMapa = true;
    vb.x = Math.max(0, Math.min(660 - vb.w, arrastando.vbx - (dx * vb.w) / 660));
    vb.y = Math.max(0, Math.min(390 - vb.h, arrastando.vby - (dy * vb.h) / 390));
    atualizarViewBox();
});

window.addEventListener("mouseup", () => {
    if (arrastando && arrastouMapa) mostrarRede();
    arrastando = null;
});
