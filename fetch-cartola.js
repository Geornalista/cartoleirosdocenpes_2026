// Script para buscar dados do Cartola FC e gerar um arquivo estático JSON

const fs = require('fs');

// ============================================================
// CONFIGURAÇÕES
// ============================================================

// API principal e fallback
const API_URLS = [
    'https://api.cartola.globo.com',
    'https://api.cartolafc.globo.com'
];

// Headers para evitar bloqueios contra requisições automatizadas
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Referer': 'https://cartola.globo.com/',
    'Origin': 'https://cartola.globo.com'
};

const TIMEOUT_MS = 15000;
const MAX_TENTATIVAS = 3;
const PAUSA_ENTRE_REQUISICOES = 300;


// ============================================================
// LISTA DOS JOGADORES DA LIGA
// ============================================================

const jogadores = [
    { nomeOriginal: 'GEORGE', id: 26323967 },
    { nomeOriginal: 'XINGU', id: 26331075 },
    { nomeOriginal: 'LEO', id: 20129034 },
    { nomeOriginal: 'PAULO', id: 27110420 },
    { nomeOriginal: 'VITOR', id: 5214103 },
    { nomeOriginal: 'RAFAEL', id: 22004383 }
];


// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function fetchComTimeout(url, options = {}, timeout = TIMEOUT_MS) {
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        return response;

    } finally {
        clearTimeout(timeoutId);
    }
}


// ============================================================
// FETCH COM RETRY E FALLBACK
// ============================================================

async function buscarJSON(endpoint) {

    let ultimoErro = null;

    // Testa os dois domínios da API
    for (const baseURL of API_URLS) {

        const url = `${baseURL}${endpoint}`;

        for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {

            try {

                console.log(`      Tentativa ${tentativa}/${MAX_TENTATIVAS}: ${url}`);

                const response = await fetchComTimeout(url, {
                    headers: HEADERS
                });

                if (response.ok) {

                    const contentType = response.headers.get('content-type') || '';

                    if (!contentType.includes('application/json')) {
                        throw new Error(
                            `Resposta inesperada. Content-Type: ${contentType}`
                        );
                    }

                    return await response.json();
                }

                // Diagnóstico detalhado
                const body = await response.text().catch(() => '');

                console.warn(
                    `      HTTP ${response.status} ${response.statusText}`
                );

                console.warn(
                    `      Resposta: ${body.substring(0, 300)}`
                );

                ultimoErro = new Error(
                    `HTTP ${response.status} ${response.statusText}`
                );

                // 403 = bloqueio
                // 429 = rate limit
                // nesses casos espera um pouco mais
                if (response.status === 403 || response.status === 429) {
                    const espera = tentativa * 3000;

                    console.log(
                        `      Aguardando ${espera / 1000}s antes de tentar novamente...`
                    );

                    await sleep(espera);
                }

            } catch (error) {

                ultimoErro = error;

                console.warn(
                    `      Erro: ${error.message}`
                );
            }

            if (tentativa < MAX_TENTATIVAS) {
                await sleep(1000 * tentativa);
            }
        }

        console.log(
            `      Falha no domínio ${baseURL}. Tentando próximo domínio...`
        );
    }

    throw ultimoErro || new Error('Não foi possível acessar a API do Cartola');
}


// ============================================================
// BUSCA E CONVERSÃO DO ESCUDO
// ============================================================

async function fetchImageAsBase64(url) {

    if (!url) {
        return 'https://via.placeholder.com/150';
    }

    try {

        const response = await fetchComTimeout(url, {
            headers: {
                'User-Agent': HEADERS['User-Agent'],
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
        });

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status} ao baixar imagem`
            );
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Detecta o tipo da imagem
        const contentType =
            response.headers.get('content-type') || 'image/png';

        return `data:${contentType};base64,${buffer.toString('base64')}`;

    } catch (e) {

        console.error(
            `Erro ao baixar imagem ${url}: ${e.message}`
        );

        return 'https://via.placeholder.com/150';
    }
}


// ============================================================
// PROCESSO PRINCIPAL
// ============================================================

async function run() {

    console.log('');
    console.log('================================================');
    console.log(' INICIANDO ATUALIZAÇÃO DOS DADOS DO CARTOLA');
    console.log('================================================');
    console.log('');

    try {

        // --------------------------------------------------------
        // 1. BUSCA STATUS DO MERCADO
        // --------------------------------------------------------

        console.log('-> Buscando status do mercado do Cartola...');

        const statusData = await buscarJSON('/mercado/status');

        if (!statusData || !statusData.rodada_atual) {
            throw new Error(
                'A API respondeu, mas não retornou rodada_atual.'
            );
        }

        // Sempre utiliza a última rodada finalizada
        const rodadaAtual = Math.max(
            1,
            statusData.rodada_atual - 1
        );

        console.log(
            `-> Rodada atual do Cartola: ${statusData.rodada_atual}`
        );

        console.log(
            `-> Última rodada finalizada: ${rodadaAtual}`
        );

        console.log('');

        const appData = [];


        // --------------------------------------------------------
        // 2. BUSCA HISTÓRICO DOS JOGADORES
        // --------------------------------------------------------

        for (const jogador of jogadores) {

            console.log(
                `-> Baixando dados de ${jogador.nomeOriginal} (ID: ${jogador.id})`
            );

            const history = [];

            for (let r = 1; r <= rodadaAtual; r++) {

                try {

                    console.log(
                        `   Rodada ${r}/${rodadaAtual}`
                    );

                    const data = await buscarJSON(
                        `/time/id/${jogador.id}/${r}`
                    );

                    history.push({
                        rodada: r,
                        data: data,
                        error: false
                    });

                } catch (error) {

                    console.error(
                        `   ERRO na rodada ${r}: ${error.message}`
                    );

                    history.push({
                        rodada: r,
                        data: null,
                        error: true
                    });
                }

                // Pequena pausa entre requisições
                await sleep(PAUSA_ENTRE_REQUISICOES);
            }


            // ----------------------------------------------------
            // BUSCA ESCUDO MAIS RECENTE
            // ----------------------------------------------------

            const sucessos = history.filter(h => !h.error);

            const latest =
                sucessos.length > 0
                    ? sucessos[sucessos.length - 1].data
                    : null;

            if (!latest) {

                console.warn(
                    `   ⚠ Nenhum dado válido encontrado para ${jogador.nomeOriginal}`
                );
            }

            const rawEscudo =
                latest?.time?.url_escudo_png ||
                'https://via.placeholder.com/150';

            console.log(
                `   Baixando escudo...`
            );

            const escudoBase64 =
                await fetchImageAsBase64(rawEscudo);


            appData.push({
                ...jogador,
                history,
                escudoBase64
            });

            console.log(
                `   ✓ ${jogador.nomeOriginal} concluído`
            );

            console.log('');
        }


        // --------------------------------------------------------
        // 3. VALIDAÇÃO DOS RESULTADOS
        // --------------------------------------------------------

        const totalRegistros = appData.reduce(
            (total, jogador) =>
                total + jogador.history.filter(h => !h.error).length,
            0
        );

        const totalEsperado =
            jogadores.length * rodadaAtual;

        console.log('================================================');
        console.log(' RESUMO DA COLETA');
        console.log('================================================');

        console.log(
            `Registros válidos: ${totalRegistros}/${totalEsperado}`
        );

        if (totalRegistros === 0) {

            throw new Error(
                'Nenhum dado foi obtido da API. O processo foi interrompido para evitar gerar um data.json vazio.'
            );
        }


        // --------------------------------------------------------
        // 4. ESTRUTURA JSON FINAL
        // --------------------------------------------------------

        const finalOutput = {
            maxRound: rodadaAtual,
            appData: appData,
            lastUpdate: new Date().toISOString()
        };


        // --------------------------------------------------------
        // 5. SALVA O ARQUIVO
        // --------------------------------------------------------

        fs.writeFileSync(
            'data.json',
            JSON.stringify(finalOutput, null, 2)
        );

        console.log('');
        console.log('================================================');
        console.log(' SUCESSO!');
        console.log('================================================');

        console.log(
            '-> Arquivo data.json gerado com sucesso.'
        );

        console.log(
            `-> Última atualização: ${finalOutput.lastUpdate}`
        );

    } catch (error) {

        console.error('');
        console.error('================================================');
        console.error(' ERRO FATAL');
        console.error('================================================');

        console.error(error);

        process.exit(1);
    }
}


// ============================================================
// INICIA O PROCESSO
// ============================================================

run();
