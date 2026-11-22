const ETAPAS = [
    "Identificar e classificar região",
    "Definir unidade responsável",
    "Designar equipe",
    "Encaminhar ocorrência para atendimento",
    "Isolar área e prestar atendimento",
    "Liberar recurso para outra ocorrência",
    "Encerrar operação",
];

const protocolos = new TabelaHash();

function definirProtocolo(categoria, dependencias) {
    const g = new Grafo(ETAPAS);
    for (const [i, j] of dependencias) g.adicionarAresta(ETAPAS[i], ETAPAS[j]);
    protocolos.inserir(categoria, g);
}

definirProtocolo("EMS", [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
]);

definirProtocolo("Fire", [
    [0, 1],
    [1, 2],
    [2, 4],
    [4, 3],
    [3, 5],
    [5, 6],
]);

definirProtocolo("Traffic", [
    [0, 2],
    [2, 4],
    [4, 1],
    [1, 5],
    [5, 6],
]);
