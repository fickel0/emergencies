"""
Gera o dados.csv a partir do 911.csv (Kaggle, montcoalert).
Uso: python preparar_dados.py [entrada] [saida]

As datas são puxadas pro presente, pra que o último chamado seja "agora".
O id e o hash são calculados igual ao ocorrencia.js da página.
Se mudar aqui, tem que mudar lá também.
"""

import calendar
import csv
import hashlib
import math
import random
import re
import statistics
import sys
import time

N = 10000
COLUNAS = ["id", "categoria", "tipo", "zip", "regiao", "endereco", "atendido", "hash"]


# id: segundos desde 1970 (UTC) × 256 + sufixo. no texto, base 36 e "-sufixo" se não for 0
def criar_id(segundos, sufixo):
    return segundos * 256 + sufixo


def id_para_texto(id):
    segundos = id // 256
    sufixo = id % 256
    digitos = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    texto = ""
    while segundos > 0:
        texto = digitos[segundos % 36] + texto
        segundos //= 36
    if sufixo == 0:
        return texto
    return texto + "-" + str(sufixo)


# SHA-256 do texto da ocorrência. o sufixo do id fica de fora do texto
def hash_da_ocorrencia(o):
    data_hora = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(o["id"] // 256))
    campos = [
        o["categoria"],
        o["tipo"],
        data_hora,
        o["zip"],
        o["regiao"],
        o["endereco"],
        str(o["atendido"]),
    ]
    return hashlib.sha256("|".join(campos).encode("utf-8")).hexdigest()


# o 911.csv vem todo em maiúsculas. o endereço fica assim, mas tipo e região são arrumados.
# no tipo, só a primeira letra fica maiúscula, menos as siglas: "CVA/STROKE" vira "CVA/stroke"
def arrumar_tipo(tipo):
    tipo = tipo.capitalize()
    for sigla in ["CVA", "EMS", "CO", "S/B"]:
        tipo = re.sub(r"\b" + sigla + r"\b", sigla, tipo, flags=re.IGNORECASE)
    return tipo


def dividir_title(title):
    categoria, _, tipo = title.partition(":")
    tipo = tipo.split(" -")[0]
    return categoria.strip(), tipo.strip()


def segundos_utc(timestamp):
    return calendar.timegm(time.strptime(timestamp.strip(), "%Y-%m-%d %H:%M:%S"))


def main():
    entrada = sys.argv[1] if len(sys.argv) > 1 else "911.csv"
    saida = sys.argv[2] if len(sys.argv) > 2 else "dados.csv"

    with open(entrada, newline="", encoding="utf-8") as f:
        todas = [l for l in csv.DictReader(f) if l["zip"].strip() and l["twp"].strip()]
    todas.sort(key=lambda l: l["timeStamp"])

    # mediana de lat e lng das regiões nas chamadas recentes pra escolher as cidades do mapa.
    # as escolhidas ficam a pelo menos 3,2 km uma da outra, pra os nomes não encavalarem
    lats, lngs = {}, {}
    for l in todas[-25000:]:
        r = l["twp"].strip().title()
        la, ln = float(l["lat"]), float(l["lng"])
        if 39.9 < la < 40.5 and -75.8 < ln < -75.0:
            lats.setdefault(r, []).append(la)
            lngs.setdefault(r, []).append(ln)

    centros = []
    for r in sorted(lats, key=lambda r: -len(lats[r])):
        la, ln = statistics.median(lats[r]), statistics.median(lngs[r])
        if all(math.hypot((la - a) * 111, (ln - b) * 85) >= 3.2 for _, a, b in centros):
            centros.append((r, la, ln))
    escolhidas = {r for r, _, _ in centros}

    linhas = [l for l in todas if l["twp"].strip().title() in escolhidas][-N:]

    # quanto somar em todas as datas pro último chamado cair em "agora"
    ultimo = segundos_utc(linhas[-1]["timeStamp"])
    deslocamento = int(time.time()) - ultimo

    # semente fixa: toda vez que roda, os mesmos chamados ficam pendentes
    random.seed(42)

    ocorrencias = []
    sufixos = {}  # segundo -> quantos chamados já caíram nele
    for l in linhas:
        original = segundos_utc(l["timeStamp"])
        segundos = original + deslocamento
        sufixo = sufixos.get(segundos, 0)
        sufixos[segundos] = sufixo + 1

        # pendente com chance e^(-idade/12), só nas últimas 48 h.
        # 12 h: 37%, 24 h: 14%, 48 h: 2%
        idade = (ultimo - original) / 3600
        pendente = idade <= 48 and random.random() < math.exp(-idade / 12)

        categoria, tipo = dividir_title(l["title"])
        o = {
            "id": criar_id(segundos, sufixo),
            "categoria": categoria,
            "tipo": arrumar_tipo(tipo),
            "zip": l["zip"].strip(),
            "regiao": l["twp"].strip().title(),
            "endereco": l["addr"].strip(),
            "atendido": 0 if pendente else 1,
        }
        o["hash"] = hash_da_ocorrencia(o)
        ocorrencias.append(o)

    cidades = [f"{r}:{la:.4f}:{ln:.4f}" for r, la, ln in sorted(centros)]

    with open(saida, "w", newline="", encoding="utf-8") as f:
        f.write("#" + ";".join(cidades) + "\n")
        w = csv.DictWriter(f, fieldnames=COLUNAS, lineterminator="\n")
        w.writeheader()
        for o in ocorrencias:
            w.writerow({**o, "id": id_para_texto(o["id"])})

    pendentes = sum(1 for o in ocorrencias if o["atendido"] == 0)
    print(f"{len(ocorrencias)} linhas gravadas em {saida} ({pendentes} pendentes, {len(centros)} regiões)")


if __name__ == "__main__":
    main()
