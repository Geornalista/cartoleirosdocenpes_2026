const fs = require('fs');

const jogadores = [
    { nomeOriginal: 'GEORGE', id: 26323967 },
    { nomeOriginal: 'XINGU', id: 26331075 },
    { nomeOriginal: 'LEO', id: 20129034 },
    { nomeOriginal: 'PAULO', id: 27110420 },
    { nomeOriginal: 'VITOR', id: 5214103 },
    { nomeOriginal: 'RAFAEL', id: 22004383 }
];

async function fetchImageAsBase64(url) {
    if (!url) return 'https://via.placeholder.com/150';
    try {
        const response = await fetch(url);
        if (!response.ok) return 'https://via.placeholder.com/150';
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return `data:image/png;base64,${buffer.toString('base64')}`;
    } catch (e) {
        return 'https://via.placeholder.com/150';
    }
}

async function run() {
    console.log("-> Buscando status do mercado do Cartola...");
    
    try {
        // Headers adicionados para evitar bloqueio por parte da Globo
        const statusRes = await fetch('https://api.cartola.globo.com/mercado/status', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        if (!statusRes.ok) throw new Error("Falha ao acessar status do mercado");
        const statusData = await statusRes.json();
        
        // Garante que só pegamos rodadas finalizadas (status_mercado 1 = aberto para a PRÓXIMA rodada)
        let rodadaAtual = Math.max(1, statusData.rodada_atual - 1);
        console.log(`-> Rodada do Mercado: ${statusData.rodada_atual} | Rodada Válida para a Liga: ${rodadaAtual}`);

        const appData = [];
        let falhasTotais = 0;

        for (const jogador of jogadores) {
            console.log(`\n-> Baixando dados de: ${jogador.nomeOriginal}`);
            const history = [];
            let sucessosJogador = 0;
            
            for (let r = 1; r <= rodadaAtual; r++) {
                try {
                    const res = await fetch(`https://api.cartola.globo.com/time/id/${jogador.id}/${r}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        // Validação robusta: Verifica se o JSON realmente tem os pontos do time
                        if (data && data.time && data.pontos !== undefined) {
                            history.push({ rodada: r, data: data, error: false });
                            sucessosJogador++;
                            console.log(`   [✓] Rodada ${r} carregada: ${data.pontos} pts`);
                        } else {
                            console.log(`   [!] Rodada ${r} vazia ou sem pontos consolidados.`);
                            history.push({ rodada: r, data: null, error: true });
                        }
                    } else {
                        console.log(`   [X] Rodada ${r} falhou na API (Status: ${res.status})`);
                        history.push({ rodada: r, data: null, error: true });
                    }
                } catch (e) {
                    console.log(`   [X] Rodada ${r} falhou (Erro de rede)`);
                    history.push({ rodada: r, data: null, error: true });
                }
            }
            
            if (sucessosJogador === 0) falhasTotais++;

            const sucessos = history.filter(h => !h.error);
            const latest = sucessos.length > 0 ? sucessos[sucessos.length - 1].data : null;
            const rawEscudo = latest?.time?.url_escudo_png || 'https://via.placeholder.com/150';
            const escudoBase64 = await fetchImageAsBase64(rawEscudo);

            appData.push({ ...jogador, history, escudoBase64 });
        }

        // TRAVA DE SEGURANÇA: Se a API retornou tudo vazio, impede de quebrar o app
        if (falhasTotais === jogadores.length) {
            throw new Error("A API da Globo retornou dados vazios para todos. O arquivo data.json NÃO será alterado para proteger o App.");
        }

        const finalOutput = {
            maxRound: rodadaAtual,
            appData: appData,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync('data.json', JSON.stringify(finalOutput));
        console.log("\n-> SUCESSO! Arquivo data.json gerado e abastecido com sucesso.");

    } catch (error) {
        console.error("\n-> ERRO FATAL:", error.message);
        process.exit(1); 
    }
}

run();
