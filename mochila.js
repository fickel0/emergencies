// mochila 0/1 bottom-up: devolve o subconjunto que maximiza a soma de níveis de prioridade
function otimizarViaturas(lista, limite) {
    const n = lista.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(limite + 1));

    for (let i = 1; i <= n; i++) {
        const peso = viaturasDe(lista[i - 1]);
        const valor = nivelDe(lista[i - 1]);
        for (let j = 0; j <= limite; j++) {
            const deixa = dp[i - 1][j];
            dp[i][j] = peso <= j ? Math.max(deixa, valor + dp[i - 1][j - peso]) : deixa;
        }
    }

    const escolhidas = [];
    let j = limite;
    for (let i = n; i >= 1; i--) {
        if (dp[i][j] !== dp[i - 1][j]) {
            escolhidas.push(lista[i - 1]);
            j -= viaturasDe(lista[i - 1]);
        }
    }
    return escolhidas.reverse();
}
