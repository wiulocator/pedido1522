document.addEventListener('DOMContentLoaded', () => {
    
    // --- CONFIGURAÇÃO DA VIAGEM ---
    const TEMPO_TOTAL_HORAS = 48; // Duração alterada para 48 horas
    const SENHA_ACESSO = "GO2026"; 

    // Coordenadas Reais
    // Start: Montes Claros, MG
    // End: Rua Turvolândia, SP (CEP 03939-060)
    const COORDS = {
        start: [-43.8670745, -16.7291552], // [Longitude, Latitude] de Montes Claros
        end:   [-46.5028223, -23.5971367]  // [Longitude, Latitude] do CEP 03939-060
    };

    // Variáveis de Controle
    let map, polyline, carMarker;
    let fullRoute = []; // Armazena os milhares de pontos da estrada

    // --- SISTEMA DE LOGIN ---
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            const input = document.getElementById('access-code');
            const errorMsg = document.getElementById('error-msg');
            const btn = document.getElementById('btn-login');

            if (input.value.toUpperCase() === SENHA_ACESSO) {
                // Inicia a sessão
                localStorage.setItem('rastreio_ativo', 'true');
                
                // Salva a hora de início APENAS SE for o primeiro acesso
                if (!localStorage.getItem('inicio_viagem_go_sp')) {
                    localStorage.setItem('inicio_viagem_go_sp', Date.now());
                }

                // Feedback visual
                btn.innerText = "Carregando Rota...";
                btn.disabled = true;
                errorMsg.style.display = 'none';

                // Busca a rota e inicia
                iniciarSistema();
            } else {
                errorMsg.style.display = 'block';
                input.style.borderColor = '#dc2626';
            }
        });
    }

    // Auto-login se já tiver acessado antes
    if(localStorage.getItem('rastreio_ativo') === 'true') {
        document.getElementById('access-code').value = SENHA_ACESSO;
        // Opcional: clicar automaticamente
        // document.getElementById('btn-login').click();
    }

    // --- FUNÇÕES PRINCIPAIS ---

    async function iniciarSistema() {
        try {
            await buscarRotaReal();
            
            // Esconde login e mostra mapa
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('info-card').style.display = 'flex';
            
            criarMapa();
            
            // Inicia o loop de atualização de posição (1 frame por segundo)
            setInterval(atualizarPosicao, 1000);
            atualizarPosicao(); // Executa imediatamente

        } catch (erro) {
            console.error(erro);
            alert("Erro ao traçar rota. Verifique sua conexão.");
            document.getElementById('btn-login').disabled = false;
            document.getElementById('btn-login').innerText = "Tentar Novamente";
        }
    }

    async function buscarRotaReal() {
        // API OSRM (Open Source Routing Machine)
        const url = `https://router.project-osrm.org/route/v1/driving/${COORDS.start[0]},${COORDS.start[1]};${COORDS.end[0]},${COORDS.end[1]}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            // A API devolve [Long, Lat], mas o Leaflet precisa de [Lat, Long]. Invertemos aqui:
            fullRoute = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        } else {
            throw new Error("Rota não encontrada pela API.");
        }
    }

    function criarMapa() {
        // Centraliza inicialmente no meio do caminho
        map = L.map('map', { zoomControl: false }).setView(fullRoute[0], 7);

        // Estilo do Mapa (Clean / Logística)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; CartoDB', maxZoom: 18
        }).addTo(map);

        // Desenha a linha da estrada (Azul Logística)
        polyline = L.polyline(fullRoute, {
            color: '#2563eb',
            weight: 5,
            opacity: 0.8,
            lineJoin: 'round'
        }).addTo(map);

        // Ajusta o zoom para caber a rota inteira
        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });

        // Marcador de Início
        L.marker(fullRoute[0]).addTo(map).bindPopup("<b>Origem:</b> Montes Claros - MG");

        // Marcador de Fim
        L.marker(fullRoute[fullRoute.length - 1]).addTo(map).bindPopup("<b>Destino:</b> São Paulo - SP");

        // Ícone do Caminhão
        const truckIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div class="car-icon">🚛</div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        carMarker = L.marker(fullRoute[0], { icon: truckIcon, zIndexOffset: 1000 }).addTo(map);
    }

    function atualizarPosicao() {
        if (fullRoute.length === 0) return;

        // Cálculos de Tempo
        const inicio = parseInt(localStorage.getItem('inicio_viagem_go_sp'));
        const agora = Date.now();
        const tempoDecorrido = agora - inicio;
        const tempoTotalMs = TEMPO_TOTAL_HORAS * 60 * 60 * 1000;

        // Porcentagem da viagem (0.0 a 1.0)
        let progresso = tempoDecorrido / tempoTotalMs;

        // Limites
        if (progresso < 0) progresso = 0;
        if (progresso > 1) progresso = 1;

        // Atualizar Interface (Texto e Barra)
        atualizarUI(progresso, tempoTotalMs, tempoDecorrido);

        // Encontrar a coordenada correspondente na estrada
        const coordenadaAtual = getPontoNaRota(progresso);

        // Mover o caminhão
        carMarker.setLatLng(coordenadaAtual);

        // Opcional: Manter o caminhão centralizado se der muito zoom
        // map.panTo(coordenadaAtual); 
    }

    function getPontoNaRota(porcentagem) {
        // Matemática para achar o ponto exato no array gigante de coordenadas
        const totalPontos = fullRoute.length - 1;
        const indiceVirtual = porcentagem * totalPontos;
        
        const indiceAnterior = Math.floor(indiceVirtual);
        const indiceProximo = Math.ceil(indiceVirtual);
        
        // Se chegou no fim
        if (indiceAnterior >= totalPontos) return fullRoute[totalPontos];

        const p1 = fullRoute[indiceAnterior];
        const p2 = fullRoute[indiceProximo];
        const decimal = indiceVirtual - indiceAnterior;

        // Interpolação Linear entre os dois pontos mais próximos
        const lat = p1[0] + (p2[0] - p1[0]) * decimal;
        const lng = p1[1] + (p2[1] - p1[1]) * decimal;

        return [lat, lng];
    }

    function atualizarUI(progresso, totalMs, decorridoMs) {
        const badge = document.getElementById('time-badge');
        const bar = document.getElementById('progress-bar');
        
        // Atualiza a largura da barra
        bar.style.width = `${(progresso * 100).toFixed(2)}%`;

        if (progresso >= 1) {
            badge.innerText = "CHEGADA CONFIRMADA";
            badge.style.background = "#d1fae5"; // Verde claro
            badge.style.color = "#065f46";
        } else {
            const horasRestantes = ((totalMs - decorridoMs) / (1000 * 60 * 60)).toFixed(1);
            badge.innerText = `EM TRÂNSITO: FALTA ${horasRestantes}h`;
        }
    }

});
