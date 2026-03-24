// Script para buscar dados do Cartola FC e gerar um arquivo estático JSON
const fs = require('fs');

// Lista dos jogadores da sua liga
const jogadores = [
    { nomeOriginal: 'GEORGE', id: 26323967 },
    { nomeOriginal: 'XINGU', id: 26331075 },
    { nomeOriginal: 'LEO', id: 20129034 },
    { nomeOriginal: 'PAULO', id: 27110420 },
    { nomeOriginal: 'VITOR', id: 5214103 },
    { nomeOriginal: 'RAFAEL', id: 22004383 }
];

// Transforma os escudos em Base64 para garantir a partilha no WhatsApp sem erros de CORS
async function fetchImageAsBase64(url) {
    if (!url) return 'https://via.placeholder.com/150';
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Falha no download da imagem');
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return `data:image/png;base64,${buffer.toString('base64')}`;
    } catch (e) {
        console.error(`Erro ao baixar imagem ${url}:`, e.message);
        return 'https://via.placeholder.com/150';
    }
}

async function run() {
    console.log("-> Buscando status do mercado do Cartola...");
    
    try {
        // 1. Descobre a rodada atual finalizada
        const statusRes = await fetch('https://api.cartola.globo.com/mercado/status');
        const statusData = await statusRes.json();
        
        let rodadaAtual = statusData.rodada_atual;
        
        // Se o mercado está aberto (1) ou com jogos a decorrer (2), a rodada atual não finalizou
        if (statusData.status_mercado === 1 || statusData.status_mercado === 2) {
            rodadaAtual = rodadaAtual - 1; 
        }
        rodadaAtual = Math.max(1, rodadaAtual);
        console.log(`-> Última rodada finalizada identificada: ${rodadaAtual}`);

        const appData = [];

        // 2. Busca o histórico consolidado de cada jogador
        for (const jogador of jogadores) {
            console.log(`   Baixando dados de ${jogador.nomeOriginal}...`);
            const history = [];
            
            for (let r = 1; r <= rodadaAtual; r++) {
                try {
                    const res = await fetch(`https://api.cartola.globo.com/time/id/${jogador.id}/${r}`);
                    if (res.ok) {
                        const data = await res.json();
                        history.push({ rodada: r, data: data, error: false });
                    } else {
                        history.push({ rodada: r, data: null, error: true });
                    }
                } catch (e) {
                    history.push({ rodada: r, data: null, error: true });
                }
            }
            
            // Pega o escudo mais recente do histórico
            const sucessos = history.filter(h => !h.error);
            const latest = sucessos.length > 0 ? sucessos[sucessos.length - 1].data : null;
            const rawEscudo = latest?.time?.url_escudo_png || 'https://via.placeholder.com/150';
            
            // Converte a imagem
            const escudoBase64 = await fetchImageAsBase64(rawEscudo);

            appData.push({
                ...jogador,
                history,
                escudoBase64
            });
        }

        // 3. Estrutura o JSON Final
        const finalOutput = {
            maxRound: rodadaAtual,
            appData: appData,
            lastUpdate: new Date().toISOString()
        };

        // 4. Salva o arquivo no disco do servidor do GitHub
        fs.writeFileSync('data.json', JSON.stringify(finalOutput));
        console.log("-> SUCESSO! Arquivo data.json gerado com sucesso.");

    } catch (error) {
        console.error("-> ERRO FATAL no processo:", error);
        process.exit(1); // Força a action a falhar caso dê erro grave
    }
}

// Inicia o processo
run();
