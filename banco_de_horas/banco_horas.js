// Mapeamento de Cabeçalhos
const COLUMN_MAP_ORIGINAL = { // Manter o original para o parse e preview
    'CHAPA': 'Chapa', 'NOME': 'Nome', 'REGIONAL': 'Regional', 'BANDEIRA': 'Bandeira',
    'CODFILIAL': 'Cód. Filial', 'FUNCAO': 'Função', 'SECAO': 'Seção', 
    'TOTAL_EM_HORA': 'Total (Hora)', 'TOTAL_NEGATIVO': 'Total Negativo',
    'VAL_PGTO_BHS': 'Valor Pgto. BH', 'SITUACAO': 'Situação', 'Total Geral': 'Total Geral'
};
const COLUMN_ORDER_ORIGINAL = [
    'CHAPA', 'NOME', 'REGIONAL', 'BANDEIRA', 'CODFILIAL', 'FUNCAO', 'SECAO', 
    'TOTAL_EM_HORA', 'TOTAL_NEGATIVO', 'VAL_PGTO_BHS', 'SITUACAO', 'Total Geral'
];

// NOVAS CONSTANTES PARA EXIBIÇÃO (SOLICITAÇÃO DO JP)
const COLUMN_MAP = {
    'CODFILIAL': 'Filial',
    'CHAPA': 'Matrícula',
    'NOME': 'Nome',
    'FUNCAO': 'Função',
    'HORA_ANTERIOR': 'Hora Ant.', // NOVO
    'TOTAL_EM_HORA': 'Hora Atual', // Renomeado
    'TENDENCIA': 'Tendência', // NOVO
    'VAL_PGTO_BHS': 'Valor'
};
const COLUMN_ORDER = [
    'CODFILIAL',
    'CHAPA',
    'NOME',
    'FUNCAO',
    'HORA_ANTERIOR', // NOVO
    'TOTAL_EM_HORA', // Renomeado
    'TENDENCIA', // NOVO
    'VAL_PGTO_BHS'
];


// ADICIONADO: URL do Proxy
const SUPABASE_PROXY_URL = '/api/proxy';

let supabaseClient = null;
const sessionStorageAdapter = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

// --- FUNÇÃO DE REQUISIÇÃO CORRIGIDA (Baseada no script.js) ---
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
    // *** CORREÇÃO APLICADA AQUI ***
    // Trocado de 'state.auth.access_token' para 'localStorage.getItem'
    const authToken = localStorage.getItem('auth_token'); 
    
    if (!authToken) {
        console.error("Token JWT não encontrado no localStorage, deslogando.");
        logout(); // A função logout será definida mais abaixo
        throw new Error("Sessão expirada. Faça login novamente.");
    }
    
    const url = `${SUPABASE_PROXY_URL}?endpoint=${encodeURIComponent(endpoint)}`;
    
    const config = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`, 
            ...headers 
        }
    };

    if (!config.headers['Prefer']) {
        config.headers['Prefer'] = 'return=representation';
    }

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, config);

        if (!response.ok) {
            let errorData = { message: `Erro ${response.status}: ${response.statusText}` };
            try { 
                errorData = await response.json(); 
            } catch(e) {
                // Resposta não-JSON
            }
            
            console.error("Erro Supabase (via Proxy):", errorData);
            const detailedError = errorData.message || errorData.error || `Erro na requisição (${response.status})`;
            
            if (response.status === 401) {
                throw new Error("Não autorizado. Sua sessão pode ter expirado.");
            }
            throw new Error(detailedError);
        }

        if (config.headers['Prefer'] === 'count=exact') {
            const countRange = response.headers.get('content-range'); 
            const count = countRange ? countRange.split('/')[1] : '0';
            return { count: parseInt(count || '0', 10) };
        }

        if (response.status === 204 || response.headers.get('content-length') === '0' ) {
            return null; 
        }

        return await response.json(); 

    } catch (error) {
        console.error("Erro na função supabaseRequest:", error.message);
        if (error.message.includes("Não autorizado") || error.message.includes("expirada")) {
            if(typeof logout === 'function') logout(); 
        }
        throw error; 
    }
}
// --- FIM DA FUNÇÃO CORRIGIDA ---


// --- O estado global permanece o mesmo ---
const state = {
    auth: null,
    userId: null,
    isAdmin: false,
    permissoes_filiais: null, // NOVO: Para permissão
    userMatricula: null, // <-- ADICIONADO
    allData: [], // MUDANÇA: Isso não é mais "TUDO", é apenas a VIEW ATUAL
    previousData: {}, // NOVO: Cache para dados anteriores
    setupCompleto: false, // <-- NOVA FLAG
    
    // NOVO: Estado do Dashboard
    charts: { 
        resumoSecao: null, 
        resumoFuncao: null 
    },
    dashboardData: [],
    dashboardHistory: [],
    // Listas únicas para filtros do dashboard
    listasFiltros: {
        regional: [],
        codfilial: [],
        secao: [],
        funcao: []
    }
};


document.addEventListener('DOMContentLoaded', () => {
    
    // As variáveis de configuração ficam aqui dentro
    const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8';

    // Elementos da UI
    const ui = {
        appShell: document.getElementById('appShell'),
        userName: document.getElementById('topBarUserName'),
        dropdownUserName: document.getElementById('dropdownUserName'),
        dropdownUserEmail: document.getElementById('dropdownUserEmail'),
        userAvatar: document.getElementById('topBarUserAvatar'),
        adminPanel: document.getElementById('adminPanel'),
        importButton: document.getElementById('importButton'),
        dataInput: document.getElementById('dataInput'),
        importError: document.getElementById('importError'),
        importErrorMessage: document.getElementById('importErrorMessage'),
        previewButton: document.getElementById('previewButton'), // NOVO
        previewContainer: document.getElementById('previewContainer'), // NOVO
        previewTableContainer: document.getElementById('previewTableContainer'), // NOVO
        lastUpdated: document.getElementById('lastUpdated'),
        tableHead: document.getElementById('tableHead'),
        tableBody: document.getElementById('tableBody'),
        tableMessage: document.getElementById('tableMessage'),
        filterChapa: document.getElementById('filterChapa'),
        filterNome: document.getElementById('filterNome'),
        filterRegional: document.getElementById('filterRegional'),
        filterCodFilial: document.getElementById('filterCodFilial'),
        modal: document.getElementById('detailsModal'),
        modalClose: document.getElementById('modalClose'),
        modalTitle: document.getElementById('modalTitle'),
        modalBody: document.getElementById('modalBody'),
        modalNome: document.getElementById('modalNome'),
        modalChapa: document.getElementById('modalChapa'),
        modalComparison: document.getElementById('modalComparison'),
        modalNoHistory: document.getElementById('modalNoHistory'),
        loading: document.getElementById('loading'),
        loadingText: document.getElementById('loadingText'),
        logoutButton: document.getElementById('logoutButton'),
        logoutLink: document.getElementById('logoutLink'),
        profileDropdown: document.getElementById('profileDropdown'),
        profileDropdownButton: document.getElementById('profileDropdownButton'),
        configLink: document.getElementById('configLink'),
        
        // Views
        acompanhamentoView: document.getElementById('acompanhamentoView'),
        configuracoesView: document.getElementById('configuracoesView'),
        dashboardView: document.getElementById('dashboardView'),
        
        // Elementos do Dashboard
        lastUpdatedDash: document.getElementById('lastUpdatedDash'),
        filterRegionalDash: document.getElementById('filterRegionalDash'),
        filterCodFilialDash: document.getElementById('filterCodFilialDash'),
        filterSecaoDash: document.getElementById('filterSecaoDash'),
        filterFuncaoDash: document.getElementById('filterFuncaoDash'),
        statTotalColab: document.getElementById('statTotalColab'),
        statTotalHoras: document.getElementById('statTotalHoras'),
        statTotalValor: document.getElementById('statTotalValor'),
        statChangeColab: document.getElementById('statChangeColab'),
        statChangeHoras: document.getElementById('statChangeHoras'),
        statChangeValor: document.getElementById('statChangeValor'),
        canvasResumoSecao: document.getElementById('chartResumoSecao'),
        canvasResumoFuncao: document.getElementById('chartResumoFuncao'),
        tableRankingFilialBody: document.querySelector('#tableRankingFilial tbody'),
    };

    // --- FUNÇÕES ---

    function showLoading(show, text = 'Processando...') {
        ui.loadingText.textContent = text;
        ui.loading.style.display = show ? 'flex' : 'none';
    }

    function showImportError(message) {
        ui.importErrorMessage.textContent = message;
        ui.importError.classList.remove('hidden');
    }

    function formatTimestamp(isoString) {
        if (!isoString) return 'N/A';
        return new Date(isoString).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    async function initializeSupabase() {
        try {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    storage: sessionStorageAdapter,
                    persistSession: true,
                    autoRefreshToken: true
                }
            });
            
            const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
            if (sessionError || !session) {
                console.error("Sem sessão, redirecionando para login.", sessionError);
                window.location.href = '../home.html'; // ATUALIZADO: Caminho do link
                return;
            }

            state.auth = session;
            state.userId = session.user.id;
            
            // *** CORREÇÃO APLICADA AQUI ***
            // Adicionado o 'localStorage.setItem' para igualar ao 'script.js'
            localStorage.setItem('auth_token', session.access_token);


            // --- ATUALIZAÇÃO: Usando o Proxy e buscando permissões ---
            // CORREÇÃO: Removido 'filial' do select, pois a coluna não existe (conforme erro)
            // ADICIONADO: 'matricula' ao select
            const endpoint = `usuarios?auth_user_id=eq.${state.userId}&select=nome,role,profile_picture_url,permissoes_filiais,matricula`;
            let profile = null;
            let profileError = null;

            try {
                const profileResponse = await supabaseRequest(endpoint, 'GET');
                if (profileResponse && profileResponse.length > 0) {
                    profile = profileResponse[0];
                } else {
                    profileError = { message: "Perfil não encontrado ou resposta vazia do proxy." };
                }
            } catch (err) {
                profileError = err;
            }
            // --- FIM DA ATUALIZAÇÃO ---

            if (profileError) {
                console.warn("Erro ao buscar perfil (via proxy):", profileError.message);
                const emailName = session.user.email.split('@')[0];
                ui.userName.textContent = emailName;
                ui.dropdownUserName.textContent = emailName;
                ui.dropdownUserEmail.textContent = session.user.email;
            } else {
                const nome = profile.nome || session.user.email.split('@')[0];
                ui.userName.textContent = nome;
                ui.dropdownUserName.textContent = nome;
                ui.dropdownUserEmail.textContent = session.user.email;
                if (profile.profile_picture_url) {
                    ui.userAvatar.src = profile.profile_picture_url;
                }
                // *** NOVO: Armazena permissões no state ***
                state.isAdmin = (profile.role === 'admin');
                state.userMatricula = profile.matricula || null; // <-- ADICIONADO
                state.permissoes_filiais = profile.permissoes_filiais || null; // Vem como array do Supabase
            }
            
            // Mostra/oculta painel admin e exibe o app
            ui.configLink.style.display = state.isAdmin ? 'block' : 'none'; // Mostra/Oculta o LINK
            ui.appShell.style.display = 'flex';
            document.body.classList.add('system-active');


        } catch (err) {
            console.error("Erro na inicialização do Supabase:", err);
            throw err; // Lança o erro para a função 'main' tratar
        }
    }

    function logout() {
        // *** CORREÇÃO APLICADA AQUI ***
        localStorage.removeItem('auth_token'); // Limpa o token
        
        if (supabaseClient) {
            supabaseClient.auth.signOut().then(() => {
                window.location.href = '../home.html'; // ATUALIZADO: Caminho do link
            }).catch((error) => {
                console.error("Erro ao sair:", error);
                window.location.href = '../home.html'; // ATUALIZADO: Caminho do link
            });
        } else {
            window.location.href = '../home.html'; // ATUALIZADO: Caminho do link
        }
    }

    async function listenToMetadata() {
        // ATUALIZADO: Usando supabaseRequest
        try {
            const data = await supabaseRequest('banco_horas_meta?id=eq.1&select=lastUpdatedAt&limit=1', 'GET');
            
            if (data && data.length > 0) {
                const timestamp = formatTimestamp(data[0].lastUpdatedAt);
                ui.lastUpdated.textContent = timestamp;
                ui.lastUpdatedDash.textContent = timestamp; // NOVO: Atualiza o dashboard também
            } else {
                ui.lastUpdated.textContent = 'Nenhuma atualização registrada.';
                ui.lastUpdatedDash.textContent = 'Nenhuma atualização registrada.'; // NOVO
            }
        } catch (error) {
             ui.lastUpdated.textContent = 'Erro ao buscar.';
             ui.lastUpdatedDash.textContent = 'Erro ao buscar.'; // NOVO
             console.warn("Erro ao buscar metadados:", error);
        }
    }

    // --- Nova Função: showView ---
    // ****** FUNÇÃO MODIFICADA (Remove 'if state.allData.length === 0') ******
    function showView(viewId, element) {
        document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
        const viewEl = document.getElementById(viewId);
        if(viewEl) viewEl.classList.add('active');

        document.querySelectorAll('.sidebar nav .nav-item').forEach(item => item.classList.remove('active'));
        if (element) {
            element.classList.add('active');
        }

        const newHash = '#' + viewId.replace('View', '');
        if (window.location.hash !== newHash) {
            history.pushState(null, '', newHash);
        }

        // Fecha o dropdown de perfil se estiver aberto
        if (ui.profileDropdown) ui.profileDropdown.classList.remove('open');
        
        
        // **** NOVO: Bloco de setup único ****
        // Roda a configuração inicial (filtros, histórico) APENAS UMA VEZ
        if (!state.setupCompleto && state.auth) {
            console.log("Executando setup de inicialização único...");
            // Essas funções carregam dados essenciais na primeira vez
            listenToMetadata(); // Data da última atualização
            renderTableHeader(); // Cabeçalho da tabela de acompanhamento
            populateFilterDatalists(); // Listas de filtros (para ambas as views)
            loadHistoryData(); // Cache de histórico (para modais e dashboard)
            
            state.setupCompleto = true; // Marca como feito para não repetir
        }
        // **** FIM DO BLOCO ****
        
        
        // Carrega dados específicos da view
        try {
            switch (viewId) {
                case 'dashboardView':
                    initializeDashboard(); // Chama a função do dashboard
                    break;
                case 'acompanhamentoView':
                    // O setup já foi feito, agora só aplica os filtros da tabela
                    applyFilters(); 
                    break;
                case 'configuracoesView':
                    // Nenhuma carga de dados necessária ao apenas *mostrar*
                    break;
                
                // Adicionar outros casos se houverem mais views
            }
        } catch(e) {
            console.error(`Erro ao carregar view ${viewId}:`, e);
        }
        
        feather.replace();
    }
    // ****** FIM DA MODIFICAÇÃO ******


    // --- Nova Função: handleHashChange ---
    function handleHashChange() {
        if (!state.auth) return; // Não faz nada se não estiver logado
        
        const hash = window.location.hash || '#dashboard'; // NOVO: Dashboard é o padrão
        let viewId = 'dashboardView'; // NOVO: Dashboard é o padrão
        let navElement = document.querySelector('a[href="#dashboard"]');

        if (hash === '#acompanhamento') {
            viewId = 'acompanhamentoView';
            navElement = document.querySelector('a[href="#acompanhamento"]');
        } else if (hash === '#configuracoes' && state.isAdmin) {
            viewId = 'configuracoesView';
            navElement = document.querySelector('a[href="#configuracoes"]');
        }
        
        const currentActive = document.querySelector('.view-content.active');
        if (!currentActive || currentActive.id !== viewId) {
            showView(viewId, navElement);
        }
    }


    function renderTableHeader() {
        const tr = document.createElement('tr');
        COLUMN_ORDER.forEach(key => {
            const th = document.createElement('th');
            th.textContent = COLUMN_MAP[key] || key;
            tr.appendChild(th);
        });
        const thAction = document.createElement('th');
        thAction.textContent = 'Ações';
        tr.appendChild(thAction);
        ui.tableHead.innerHTML = '';
        ui.tableHead.appendChild(tr);
    }

    // ****** NOVA FUNÇÃO ******
    // Carrega SÓ o histórico para os modais.
    async function loadHistoryData() {
        try {
            // Pega o último registro de histórico
            const historyRes = await supabaseRequest('banco_horas_history?select=data&order=timestamp.desc&limit=1', 'GET');
            if (historyRes && historyRes.length > 0) {
                const oldDataArray = historyRes[0].data;
                // Salva o array bruto
                state.dashboardHistory = oldDataArray; 
                // Salva o mapa por CHAPA (para a tabela e modal)
                state.previousData = oldDataArray.reduce((acc, item) => {
                    if (item.CHAPA) acc[item.CHAPA] = item;
                    return acc;
                }, {});
                console.log("Dados de histórico (previousData e dashboardHistory) carregados.");
            } else {
                console.warn("Nenhum dado de histórico encontrado.");
                state.previousData = {};
                state.dashboardHistory = [];
            }
        } catch (e) {
            console.error("Falha ao carregar histórico:", e.message);
        }
    }
    
    // ****** FUNÇÃO MODIFICADA (PARA USAR RPC E POPULAR FILTROS DO DASHBOARD) ******
    async function populateFilterDatalists() { 
        // Filtros da Tabela
        const regionalList = document.getElementById('regionalList');
        const filialList = document.getElementById('filialList');
        
        // Filtros do Dashboard
        const regionalListDash = document.getElementById('regionalListDash');
        const filialListDash = document.getElementById('filialListDash');
        const secaoListDash = document.getElementById('secaoListDash');
        const funcaoListDash = document.getElementById('funcaoListDash');

        console.log("Populando filtros (datalists) via RPC...");
        try {
            // Chama todas as RPCs em paralelo
            const [filiaisRes, regionaisRes, secoesRes, funcoesRes] = await Promise.all([
                supabaseRequest('rpc/get_distinct_codfilial', 'POST'),
                supabaseRequest('rpc/get_distinct_regional', 'POST'),
                supabaseRequest('rpc/get_distinct_secao', 'POST'),
                supabaseRequest('rpc/get_distinct_funcao', 'POST')
            ]);

            // Processa Filiais
            if (filiaisRes && filiaisRes.length > 0) {
                state.listasFiltros.codfilial = filiaisRes
                    .map(item => item.codfilial)
                    .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
                
                const filialOptions = state.listasFiltros.codfilial.map(f => `<option value="${f}"></option>`).join('');
                if(filialList) filialList.innerHTML = filialOptions;
                if(filialListDash) filialListDash.innerHTML = filialOptions;
            }

            // Processa Regionais
            if (regionaisRes && regionaisRes.length > 0) {
                state.listasFiltros.regional = regionaisRes.map(item => item.regional).sort();
                
                const regionalOptions = state.listasFiltros.regional.map(r => `<option value="${r}"></option>`).join('');
                if(regionalList) regionalList.innerHTML = regionalOptions;
                if(regionalListDash) regionalListDash.innerHTML = regionalOptions;
            }
            
            // Processa Seções (só dashboard)
            if (secoesRes && secoesRes.length > 0) {
                state.listasFiltros.secao = secoesRes.map(item => item.secao).sort();
                if(secaoListDash) secaoListDash.innerHTML = state.listasFiltros.secao.map(s => `<option value="${s}"></option>`).join('');
            }
            
            // Processa Funções (só dashboard)
            if (funcoesRes && funcoesRes.length > 0) {
                state.listasFiltros.funcao = funcoesRes.map(item => item.funcao).sort();
                if(funcaoListDash) funcaoListDash.innerHTML = state.listasFiltros.funcao.map(f => `<option value="${f}"></option>`).join('');
            }
            
            console.log("Filtros populados:", state.listasFiltros);
    
        } catch (e) {
            console.error("Falha ao popular datalists via RPC:", e);
            mostrarNotificacao("Erro ao carregar filtros. Verifique as funções RPC no banco de dados.", "error", 10000);
        }
    }
    // ****** FIM DA FUNÇÃO MODIFICADA ******


    // NOVA FUNÇÃO: Helper para converter horas em minutos para ordenação/comparação
    function parseHorasParaMinutos(horaString) {
        if (!horaString || typeof horaString !== 'string' || horaString === '-') {
            return 0;
        }
        
        let isNegative = horaString.startsWith('-');
        if (isNegative) {
            horaString = horaString.substring(1);
        }
        
        const parts = horaString.split(':');
        let totalMinutos = 0;
        
        if (parts.length === 2) {
            const hours = parseInt(parts[0], 10) || 0;
            const minutes = parseInt(parts[1], 10) || 0;
            totalMinutos = (hours * 60) + minutes;
        } else if (!isNaN(parseFloat(horaString.replace(',', '.')))) {
             totalMinutos = parseFloat(horaString.replace(',', '.')) * 60; // Assume hora decimal
        }

        return isNegative ? -totalMinutos : totalMinutos;
    }
    
    // NOVA FUNÇÃO: Helper para converter valor string (Ex: "1.461,60")
    function parseValor(valorString) {
        if (!valorString || typeof valorString !== 'string') {
            return 0;
        }
        // Remove 'R$ ', pontos de milhar, e substitui vírgula por ponto
        const cleanString = String(valorString)
            .replace('R$', '')
            .replace(/\./g, '')
            .replace(',', '.')
            .trim();
        
        const valor = parseFloat(cleanString);
        return isNaN(valor) ? 0 : valor;
    }


    // ****** FUNÇÃO MODIFICADA (AGORA É ASYNC E FAZ FETCH) ******
    async function applyFilters() {
        const filterChapa = ui.filterChapa.value.toLowerCase().trim();
        const filterNome = ui.filterNome.value.toLowerCase().trim();
        const filterRegional = ui.filterRegional.value.toLowerCase().trim();
        const filterCodFilial = ui.filterCodFilial.value.toLowerCase().trim();

        showLoading(true, 'Filtrando dados...');
        
        // 1. Constrói a string de query do Supabase
        let query = 'banco_horas_data?select=*'; // Pega todas as colunas

        // Aplica filtros de permissão
        if (!state.isAdmin) {
            if (Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
                const filiaisQuery = state.permissoes_filiais.map(f => `"${String(f).trim()}"`).join(',');
                query += `&CODFILIAL=in.(${filiaisQuery})`;
            } else if (state.userMatricula) {
                query += `&CHAPA=eq.${state.userMatricula}`;
            } else {
                query += '&limit=0'; // Não-admin sem permissão não vê nada
            }
        }
        
        // Aplica filtros da UI
        if (filterChapa) {
            query += `&CHAPA=ilike.${filterChapa}*`; // "começa com" (case-insensitive)
        }
        if (filterNome) {
            // ****** MUDANÇA (Correção Erro 500) ******
            // Trocado de 'contém' (%filter%) para 'começa com' (filter*)
            // Isso usa o índice do banco e evita o timeout (Erro 500)
            query += `&NOME=ilike.${filterNome}*`; // "começa com" (case-insensitive)
            // ****** FIM DA MUDANÇA ******
        }
        if (filterRegional) {
            query += `&REGIONAL=eq.${filterRegional}`; // "Exato" (melhor para datalist)
        }
        if (filterCodFilial) {
            query += `&CODFILIAL=eq.${filterCodFilial}`; // "Exato"
        }

        const hasFilters = filterChapa || filterNome || filterRegional || filterCodFilial;
        
        // ****** MUDANÇA (Busca Top 200) ******
        let limit;
        if (hasFilters) {
            limit = 500; // User está filtrando, mostra 500 resultados
        } else {
            limit = 1000; // SEM filtros, busca 1000 para ordenar em JS e achar os 200 maiores
        }
        query += `&limit=${limit}`;
        // ****** FIM DA MUDANÇA ******
        
        // 2. Faz a chamada da API
        try {
            console.log("Executando query:", query);
            const filteredData = await supabaseRequest(query, 'GET');
            
            // 3. Processa os dados (ordenar em JS, pois `TOTAL_EM_HORA` é string)
            const dataComMinutos = filteredData.map(item => ({
                ...item,
                _minutos: parseHorasParaMinutos(item.TOTAL_EM_HORA)
            }));

            // Ordena os resultados (seja os 1000 ou 500)
            dataComMinutos.sort((a, b) => b._minutos - a._minutos); // Ordena (desc)
            
            // ****** MUDANÇA (Slice Top 200) ******
            let dadosParaRenderizar;
            if (hasFilters) {
                dadosParaRenderizar = dataComMinutos; // Mostra todos os 500 resultados filtrados
            } else {
                dadosParaRenderizar = dataComMinutos.slice(0, 200); // Mostra SÓ o TOP 200 dos 1000 buscados
            }
            // ****** FIM DA MUDANÇA ******
            
            state.allData = dadosParaRenderizar; // Salva SÓ O QUE VAI RENDERIZAR

            // 4. Mensagens
            if (dataComMinutos.length === 1000 && !hasFilters) {
                 ui.tableMessage.innerHTML = `Exibindo os 200 maiores saldos (de 1000 analisados). Use os filtros para buscar.`;
                 ui.tableMessage.classList.remove('hidden');
            } else if (dataComMinutos.length === 500 && hasFilters) {
                 ui.tableMessage.innerHTML = `Exibindo os 500 principais resultados para sua busca. Refine os filtros.`;
                 ui.tableMessage.classList.remove('hidden');
            } else if (dataComMinutos.length === 0) {
                ui.tableMessage.innerHTML = 'Nenhum dado encontrado para os filtros aplicados.';
                ui.tableMessage.classList.remove('hidden');
            } else {
                ui.tableMessage.classList.add('hidden');
            }

            renderTableBody(dadosParaRenderizar); // Renderiza a lista final

        } catch (err) {
            console.error("Erro ao aplicar filtros:", err);
            mostrarNotificacao(`Erro ao buscar dados: ${err.message}`, 'error');
            ui.tableMessage.innerHTML = `Erro ao buscar dados: ${err.message}.`;
            ui.tableMessage.classList.remove('hidden');
        } finally {
            showLoading(false);
        }
    }

    function renderTableBody(data) {
        ui.tableBody.innerHTML = '';
        
        // A mensagem de "nenhum dado" é tratada pelo applyFilters
        if (data.length === 0) {
            // Não faz nada, applyFilters cuida da mensagem
            return;
        }

        const fragment = document.createDocumentFragment();

        data.forEach(item => {
            const tr = document.createElement('tr');
            
            // *** NOVO: CÁLCULO DA TENDÊNCIA E HORA ANTERIOR ***
            const oldItem = state.previousData[item.CHAPA];
            const horaAnterior = oldItem ? (oldItem.TOTAL_EM_HORA || '-') : '-';
            
            const minutosAtuais = item._minutos; // USA O VALOR JÁ CALCULADO
            const minutosAnteriores = parseHorasParaMinutos(horaAnterior);
            
            // ****** MUDANÇA (Cores, Ícone de Tendência E Centralização) ******
            let tendenciaIcon = '<span style="color: #6b7280;">-</span>'; // Cinza (neutro) - Default
            
            if (horaAnterior !== '-') { // Só calcula se tiver histórico
                if (minutosAtuais > minutosAnteriores) {
                    // Piorou (aumentou o saldo)
                    // Adicionado wrapper div para centralizar
                    tendenciaIcon = '<div class="flex justify-center items-center"><i data-feather="arrow-up-right" style="color: #dc2626;"></i></div>'; // Vermelho
                } else if (minutosAtuais < minutosAnteriores) {
                    // Melhorou (diminuiu o saldo)
                    // Adicionado wrapper div para centralizar
                    tendenciaIcon = '<div class="flex justify-center items-center"><i data-feather="arrow-down-right" style="color: #16a34a;"></i></div>'; // Verde
                } else {
                    // Manteve igual
                    tendenciaIcon = '<span style="color: #f59e0b; font-weight: bold; font-family: monospace; font-size: 1.2em;">=</span>'; // Amarelo
                }
            }
            // ****** FIM DA MUDANÇA ******
            
            // Adiciona os valores calculados ao item para o loop
            item.HORA_ANTERIOR = horaAnterior;
            item.TENDENCIA = tendenciaIcon; 
            // *** FIM DO CÁLCULO ***


            // APLICA ESTILOS VISUAIS
            COLUMN_ORDER.forEach(key => {
                const td = document.createElement('td');
                const value = item[key] || '-';
                
                // Lógica especial para TENDENCIA
                if (key === 'TENDENCIA') {
                    td.innerHTML = value; // value é o <i>
                    td.style.textAlign = 'center';
                } else {
                    td.textContent = value;
                }
                
                // Adiciona classes para melhorar a visualização
                if (key === 'NOME' || key === 'FUNCAO') {
                    td.style.whiteSpace = 'normal'; // Permite quebra de linha
                    td.style.minWidth = '200px';
                }
                
                if (key === 'TOTAL_EM_HORA' || key === 'VAL_PGTO_BHS' || key === 'CODFILIAL' || key === 'CHAPA') {
                    td.style.textAlign = 'right'; // Alinha números à direita
                    td.style.fontFamily = 'monospace'; // Melhora leitura de números
                    td.style.paddingRight = '1.5rem';
                }

                // Novo styling para HORA_ANTERIOR
                if (key === 'HORA_ANTERIOR') {
                     td.style.textAlign = 'right';
                     td.style.fontFamily = 'monospace';
                     td.style.paddingRight = '1.5rem';
                     td.style.color = '#6b7280'; // Cinza
                }
                
                if (key === 'TOTAL_EM_HORA') {
                    if (String(value).includes('-')) {
                        td.style.color = '#dc2626'; // Vermelho (tailwind red-600)
                        td.style.fontWeight = 'bold';
                    } else if (value !== '-' && value !== '0,00' && value !== '0' && value !== '00:00') {
                        td.style.color = '#16a34a'; // Verde (tailwind green-600)
                        td.style.fontWeight = 'bold';
                    }
                }
                
                if (key === 'VAL_PGTO_BHS') {
                     if (value !== '-' && value !== '0,00' && value !== '0' && !String(value).includes('-')) {
                        td.style.color = '#0077B6'; // Azul (accent)
                        td.style.fontWeight = 'bold';
                    }
                }

                tr.appendChild(td);
            });

            const tdAction = document.createElement('td');
            const viewButton = document.createElement('button');
            // Aplicando classes de botão do style.css
            viewButton.innerHTML = '<i data-feather="eye" class="h-4 w-4"></i>';
            viewButton.className = "btn btn-sm btn-info"; 
            viewButton.title = "Ver Detalhes e Comparar";
            viewButton.onclick = () => showDetails(item.CHAPA);
            tdAction.appendChild(viewButton);
            
            tr.appendChild(tdAction);
            fragment.appendChild(tr);
        });

        ui.tableBody.appendChild(fragment);
        feather.replace();
    }

    function resetModal() {
        ui.modalNome.textContent = '...';
        ui.modalChapa.textContent = '...';
        ui.modalComparison.innerHTML = '';
        ui.modalNoHistory.classList.add('hidden');
    }

    function createComparisonRow(label, oldVal, newVal) {
        oldVal = oldVal || 0;
        newVal = newVal || 0;
        
        let diff = 0;
        let diffClass = 'diff-same';
        
        // Usa as funções de parse corretas
        let oldNum, newNum;
        if (label.includes('Hora')) {
            oldNum = parseHorasParaMinutos(oldVal);
            newNum = parseHorasParaMinutos(newVal);
            // Converte para horas para exibição
            oldVal = (oldNum / 60).toFixed(2);
            newVal = (newNum / 60).toFixed(2);
            diff = newNum - oldNum;
        } else {
            oldNum = parseValor(oldVal);
            newNum = parseValor(newVal);
            oldVal = oldNum.toFixed(2);
            newVal = newNum.toFixed(2);
            diff = newNum - oldNum;
        }

        if (diff > 0.01) diffClass = 'diff-up';
        else if (diff < -0.01) diffClass = 'diff-down';
        
        const diffText = diff.toFixed(2);
        const diffDisplay = diff > 0 ? `+${diffText}` : diffText;


        return `
            <div class="grid grid-cols-3 gap-2 p-2 rounded-md ${diff !== 0 ? 'bg-gray-100' : ''}">
                <span class="font-medium text-gray-700">${label}:</span>
                <span class="text-gray-600">${oldVal}</span>
                <span class="font-bold">${newVal} <span class="${diffClass}">(${diff === 0 ? '-' : diffDisplay})</span></span>
            </div>
        `;
    }

    async function showDetails(chapa) {
        resetModal();
        ui.modal.style.display = 'flex'; // Alterado para 'flex'
        showLoading(true, 'Buscando detalhes...');

        try {
            // MUDANÇA: Busca o item no state.allData (view atual)
            let currentData = state.allData.find(item => item.CHAPA === chapa);
            
            if (!currentData) {
                // Fallback: Se não achar, busca no banco (não deveria acontecer, mas é seguro)
                console.warn(`Fallback: Buscando ${chapa} no banco...`);
                const currentDataArr = await supabaseRequest(`banco_horas_data?select=*&CHAPA=eq.${chapa}`, 'GET');
                if (!currentDataArr || currentDataArr.length === 0) {
                    throw new Error("Colaborador não encontrado na base de dados.");
                }
                currentData = currentDataArr[0];
            }
            
            ui.modalTitle.textContent = `Detalhes: ${currentData.NOME}`;
            ui.modalNome.textContent = currentData.NOME;
            ui.modalChapa.textContent = currentData.CHAPA;

            // Usa o cache de histórico
            const oldData = state.previousData[chapa];
            
            if (oldData) {
                ui.modalNoHistory.classList.add('hidden');
                let comparisonHTML = `
                    <div class="grid grid-cols-3 gap-2 p-2 font-bold text-gray-500 text-sm">
                        <span>Campo</span>
                        <span>Valor Anterior</span>
                        <span>Valor Atual (Diferença)</span>
                    </div>
                `;
                // Ajusta os labels e usa as funções de parse corretas
                comparisonHTML += createComparisonRow('Total (Horas)', oldData.TOTAL_EM_HORA, currentData.TOTAL_EM_HORA);
                comparisonHTML += createComparisonRow('Total Neg. (Horas)', oldData.TOTAL_NEGATIVO, currentData.TOTAL_NEGATIVO);
                comparisonHTML += createComparisonRow('Valor Pgto. (R$)', oldData.VAL_PGTO_BHS, currentData.VAL_PGTO_BHS);
                comparisonHTML += createComparisonRow('Total Geral (R$)', oldData['Total Geral'], currentData['Total Geral']);

                ui.modalComparison.innerHTML = comparisonHTML;
            } else {
                ui.modalNoHistory.classList.remove('hidden');
                ui.modalComparison.innerHTML = '';
            }

        } catch (err) {
            console.error("Erro ao buscar detalhes:", err);
            ui.modalBody.innerHTML = `<p class="alert alert-error">${err.message}</p>`;
        } finally {
            showLoading(false);
        }
    }
    
    // NOVA FUNÇÃO DE PRÉ-VISUALIZAÇÃO
    function handlePreview() {
        ui.importError.classList.add('hidden');
        ui.previewContainer.style.display = 'none';
        ui.previewTableContainer.innerHTML = '';
        const pastedData = ui.dataInput.value;

        if (!pastedData) {
            showImportError("A área de texto está vazia para pré-visualizar.");
            return;
        }

        let parsedData;
        try {
            parsedData = parsePastedData(pastedData);
        } catch (err) {
            showImportError(err.message);
            return;
        }

        if (parsedData.length === 0) {
            showImportError("Nenhum dado válido encontrado.");
            return;
        }

        const previewData = parsedData.slice(0, 15);
        
        // Usa as colunas originais (COLUMN_ORDER_ORIGINAL) para o preview
        const headers = COLUMN_ORDER_ORIGINAL;
        
        let tableHTML = '<table class="tabela"><thead><tr>';
        headers.forEach(key => {
            tableHTML += `<th>${COLUMN_MAP_ORIGINAL[key] || key}</th>`;
        });
        tableHTML += '</tr></thead><tbody>';

        previewData.forEach(item => {
            tableHTML += '<tr>';
            headers.forEach(key => {
                tableHTML += `<td>${item[key] || '-'}</td>`;
            });
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';

        ui.previewTableContainer.innerHTML = tableHTML;
        ui.previewContainer.style.display = 'block';
        
        // Mostra uma mensagem de sucesso no lugar do erro
        ui.importErrorMessage.textContent = `Mostrando ${previewData.length} de ${parsedData.length} registros.`;
        ui.importError.className = "alert alert-success mb-4"; // Muda a cor para verde
        ui.importError.classList.remove('hidden');
    }

    function parsePastedData(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) throw new Error("Os dados precisam de pelo menos 2 linhas (cabeçalho e dados).");

        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''));
        
        // USA O ORIGINAL MAP PARA VALIDAR
        const missingHeaders = COLUMN_ORDER_ORIGINAL.filter(col => !headers.includes(col));
        if (missingHeaders.length > 0) {
            throw new Error(`Cabeçalhos faltando: ${missingHeaders.join(', ')}`);
        }

        const data = lines.slice(1).map(line => {
            const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''));
            const obj = {};
            headers.forEach((header, index) => {
                // USA O ORIGINAL MAP PARA PARSEAR
                if (COLUMN_ORDER_ORIGINAL.includes(header)) {
                     obj[header] = values[index] || null;
                }
            });
            if (!obj.CHAPA) {
                // Não lança erro, apenas ignora a linha
                console.warn("Linha sem 'CHAPA' ignorada:", line);
                return null;
            }
            return obj;
        }).filter(Boolean); // Remove linhas nulas (ignoradas)

        return data;
    }

    async function handleImport() {
        ui.importError.classList.add('hidden');
        ui.previewContainer.style.display = 'none'; // NOVO: Esconde o preview ao importar
        const pastedData = ui.dataInput.value;
        if (!pastedData) {
            showImportError("A área de texto está vazia.");
            return;
        }

        let newData;
        try {
            newData = parsePastedData(pastedData);
        } catch (err) {
            showImportError(err.message);
            return;
        }

        if (newData.length === 0) {
            showImportError("Nenhum dado válido para importar.");
            return;
        }

        showLoading(true, `Enviando ${newData.length} registros para o servidor...`);

        try {
            // *** CORREÇÃO APLICADA AQUI ***
            
            // Revertendo para a chamada da API Serverless, pois é mais provável
            const response = await fetch('/api/import-banco-horas', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}` // Pega o token correto
                },
                body: JSON.stringify(newData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro do servidor: ${response.statusText}`);
            }

            const result = await response.json();
            // Fim da chamada serverless

            ui.dataInput.value = '';
            
            // MUDANÇA: Recarrega tudo
            showLoading(true, 'Recarregando dados...');
            await Promise.all([
                populateFilterDatalists(),
                loadHistoryData(),
                listenToMetadata()
            ]);
            // NOVO: Navega para o dashboard e o recarrega
            window.location.hash = '#dashboard';
            handleHashChange(); // Força o recarregamento da view do dashboard
            
            showLoading(false);
            mostrarNotificacao(result.message || "Dados importados com sucesso!", 'success');

        } catch (err) {
            console.error("Erro durante a importação:", err);
            showLoading(false);
            showImportError(`Erro fatal: ${err.message}.`);
        }
    }
    
    // Função de Notificação (copiada do script.js para consistência)
    function mostrarNotificacao(message, type = 'info', timeout = 4000) {
        const container = document.getElementById('notificationContainer');
        if (!container) {
            console.warn("Notification container not found, using alert().");
            alert(message);
            return;
        }
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        let icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'x-circle' : 'info');
        if (type === 'warning') icon = 'alert-triangle';
        
        notification.innerHTML = `
            <div class="notification-header">
                <i data-feather="${icon}" class="h-5 w-5 mr-2"></i>
                <span>${type === 'success' ? 'Sucesso!' : (type === 'error' ? 'Erro!' : (type === 'warning' ? 'Atenção!' : 'Aviso'))}</span>
            </div>
            <div class="notification-body">${message}</div>`;
        container.appendChild(notification);
        feather.replace();
        setTimeout(() => {
            notification.classList.add('hide');
            notification.addEventListener('animationend', () => notification.remove());
        }, timeout);
    }
    
    
    // -----------------------------------------------------------------
    // --- NOVAS FUNÇÕES DO DASHBOARD ---
    // -----------------------------------------------------------------

    /**
     * Função principal para carregar e renderizar o dashboard.
     */
    async function initializeDashboard() {
        showLoading(true, 'Carregando dashboard...');
        
        try {
            // 1. Monta a query com base nos filtros do dashboard
            let query = 'banco_horas_data?select=CODFILIAL,FUNCAO,SECAO,TOTAL_EM_HORA,VAL_PGTO_BHS'; // Apenas colunas necessárias
            
            const regional = ui.filterRegionalDash.value;
            const filial = ui.filterCodFilialDash.value;
            const secao = ui.filterSecaoDash.value;
            const funcao = ui.filterFuncaoDash.value;

            // Aplica filtros de permissão
            if (!state.isAdmin) {
                if (Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
                    const filiaisQuery = state.permissoes_filiais.map(f => `"${String(f).trim()}"`).join(',');
                    query += `&CODFILIAL=in.(${filiaisQuery})`;
                } else if (state.userMatricula) {
                    query += `&CHAPA=eq.${state.userMatricula}`;
                } else {
                    query += '&limit=0'; // Não vê nada
                }
            }
            
            // Aplica filtros da UI do Dashboard
            if (regional) query += `&REGIONAL=eq.${regional}`;
            if (filial) query += `&CODFILIAL=eq.${filial}`;
            if (secao) query += `&SECAO=eq.${secao}`;
            if (funcao) query += `&FUNCAO=eq.${funcao}`;

            // 2. Busca os dados
            // Omitir 'limit' para tentar buscar tudo (o proxy/supabase pode limitar a 1000)
            const data = await supabaseRequest(query, 'GET');
            state.dashboardData = data;
            
            // 3. O histórico já foi carregado em 'loadHistoryData' (state.dashboardHistory)
            // Apenas filtramos o histórico para bater com os filtros da UI
            let historyData = state.dashboardHistory;
            if (regional) historyData = historyData.filter(item => item.REGIONAL === regional);
            if (filial) historyData = historyData.filter(item => item.CODFILIAL === filial);
            if (secao) historyData = historyData.filter(item => item.SECAO === secao);
            if (funcao) historyData = historyData.filter(item => item.FUNCAO === funcao);

            // 4. Processa e renderiza os componentes
            processDashboardTotals(data, historyData);
            processDashboardCharts(data);
            processDashboardTable(data);
            
            feather.replace(); // Para os ícones de tendência de alta/baixa

        } catch (err) {
            console.error("Erro ao inicializar dashboard:", err);
            mostrarNotificacao(`Erro ao carregar dashboard: ${err.message}`, 'error');
        } finally {
            showLoading(false);
        }
    }

    /**
     * Calcula e exibe os totais nos cards de estatística.
     * Inclui o indicador de mudança (aumento/diminuição).
     */
    function processDashboardTotals(data, historyData) {
        let totalColab = data.length;
        let totalMinutos = 0;
        let totalValor = 0;
        
        data.forEach(item => {
            totalMinutos += parseHorasParaMinutos(item.TOTAL_EM_HORA);
            totalValor += parseValor(item.VAL_PGTO_BHS);
        });

        let histTotalColab = historyData.length;
        let histTotalMinutos = 0;
        let histTotalValor = 0;
        
        historyData.forEach(item => {
            histTotalMinutos += parseHorasParaMinutos(item.TOTAL_EM_HORA);
            histTotalValor += parseValor(item.VAL_PGTO_BHS);
        });

        // Formata para exibição
        const totalHoras = (totalMinutos / 60).toFixed(0);
        
        ui.statTotalColab.textContent = totalColab;
        ui.statTotalHoras.textContent = totalHoras;
        ui.statTotalValor.textContent = `R$ ${(totalValor / 1000).toFixed(1)} mil`;

        // Renderiza indicadores de mudança
        renderChangeIndicator(ui.statChangeColab, totalColab, histTotalColab, false); // Colab: 'down' é bom?
        renderChangeIndicator(ui.statChangeHoras, totalMinutos, histTotalMinutos, true); // Horas: 'down' é bom (verde)
        renderChangeIndicator(ui.statChangeValor, totalValor, histTotalValor, true); // Valor: 'down' é bom (verde)
    }
    
    /**
     * Helper para renderizar o indicador de mudança (aumento/diminuição).
     * @param {boolean} isBadNews - Se true, um aumento é ruim (vermelho).
     */
    function renderChangeIndicator(element, current, previous, isBadNews = true) {
        if (previous === 0) {
            element.innerHTML = `<span class="text-gray-500">Sem histórico</span>`;
            return;
        }
        
        const diff = current - previous;
        const percentChange = (diff / previous) * 100;
        
        if (Math.abs(diff) < 0.01) {
            element.innerHTML = `
                <i data-feather="minus" class="h-4 w-4 text-gray-500"></i>
                <span class="text-gray-500">Manteve</span>
            `;
            return;
        }
        
        const isUp = diff > 0;
        const formattedPercent = `${Math.abs(percentChange).toFixed(1)}%`;
        
        let colorClass = isUp ? 'diff-up' : 'diff-down'; // Vermelho / Verde
        let icon = isUp ? 'arrow-up-right' : 'arrow-down-right';
        
        // Inverte as cores se a notícia for boa (isBadNews = false)
        // ou se a notícia for ruim e o valor caiu (isBadNews = true e isUp = false)
        if ((isUp && !isBadNews) || (!isUp && isBadNews)) {
            colorClass = 'diff-down'; // Verde
        } else {
            colorClass = 'diff-up'; // Vermelho
        }

        element.innerHTML = `
            <i data-feather="${icon}" class="h-4 w-4 ${colorClass}"></i>
            <span class="${colorClass}">${formattedPercent}</span>
            <span class="text-gray-500 hidden md:inline">vs. última carga</span>
        `;
    }

    /**
     * Agrega dados (por Seção ou Função) e renderiza os gráficos de pizza.
     */
    function processDashboardCharts(data) {
        const dataSecao = aggregateData(data, 'SECAO', 'VAL_PGTO_BHS');
        const dataFuncao = aggregateData(data, 'FUNCAO', 'VAL_PGTO_BHS');
        
        // Renderiza Gráfico 1 (Seção)
        renderChart(
            ui.canvasResumoSecao, 
            'resumoSecao', // chave do state.charts
            'pie', 
            dataSecao.labels, 
            dataSecao.values,
            'Valor por Seção'
        );
        
        // Renderiza Gráfico 2 (Função)
        renderChart(
            ui.canvasResumoFuncao, 
            'resumoFuncao', // chave do state.charts
            'pie', 
            dataFuncao.labels, 
            dataFuncao.values,
            'Valor por Função'
        );
    }
    
    /**
     * Agrega dados para os gráficos de pizza (Top 10 + Outros).
     * @param {Array} data - Os dados filtrados.
     * @param {string} field - O campo para agrupar (ex: 'SECAO').
     * @param {string} sumField - O campo para somar (ex: 'VAL_PGTO_BHS').
     */
    function aggregateData(data, field, sumField) {
        const groups = data.reduce((acc, item) => {
            const key = item[field] || 'Não Definido';
            const value = parseValor(item[sumField]);
            
            if (!acc[key]) {
                acc[key] = 0;
            }
            acc[key] += value;
            return acc;
        }, {});

        // Converte para array, ordena e pega o Top 10
        const sorted = Object.entries(groups)
            .sort(([, a], [, b]) => b - a);
            
        const top10 = sorted.slice(0, 10);
        const others = sorted.slice(10);
        
        const labels = top10.map(([key]) => key);
        const values = top10.map(([, value]) => value);
        
        // Agrupa o 'resto' em 'Outros'
        if (others.length > 0) {
            labels.push('Outros');
            values.push(others.reduce((sum, [, value]) => sum + value, 0));
        }
        
        return { labels, values };
    }
    
    /**
     * Renderiza ou atualiza um gráfico do Chart.js.
     */
    function renderChart(canvas, chartStateKey, type, labels, data, label) {
        if (!canvas) return;

        // Destrói gráfico antigo, se existir
        if (state.charts[chartStateKey]) {
            state.charts[chartStateKey].destroy();
        }
        
        const ctx = canvas.getContext('2d');
        state.charts[chartStateKey] = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    // Cores bonitas para os gráficos de pizza
                    backgroundColor: [
                        '#0077B6', '#00B4D8', '#90E0EF', '#023047', '#00D4AA',
                        '#FFB703', '#FB8500', '#219EBC', '#8ECAE6', '#ADB5BD'
                    ],
                    borderColor: '#ffffff',
                    borderWidth: (type === 'pie' || type === 'doughnut') ? 2 : 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            boxWidth: 12
                        }
                    }
                }
            }
        });
    }


    /**
     * Agrega dados por Filial e renderiza a tabela de ranking.
     */
    function processDashboardTable(data) {
        const groups = data.reduce((acc, item) => {
            const key = item.CODFILIAL || 'N/A';
            const valor = parseValor(item.VAL_PGTO_BHS);
            const minutos = parseHorasParaMinutos(item.TOTAL_EM_HORA);
            
            if (!acc[key]) {
                acc[key] = {
                    filial: key,
                    totalValor: 0,
                    totalMinutos: 0,
                    colaboradores: 0
                };
            }
            
            acc[key].totalValor += valor;
            acc[key].totalMinutos += minutos;
            acc[key].colaboradores += 1;
            return acc;
        }, {});

        // Converte para array e ordena por Valor (descendente)
        const rankedData = Object.values(groups)
            .sort((a, b) => b.totalValor - a.totalValor);
            
        // Renderiza a tabela
        ui.tableRankingFilialBody.innerHTML = '';
        if (rankedData.length === 0) {
            ui.tableRankingFilialBody.innerHTML = '<tr><td colspan="4" class="text-center py-5 text-gray-500">Nenhum dado para exibir.</td></tr>';
            return;
        }
        
        const fragment = document.createDocumentFragment();
        rankedData.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-bold" style="text-align: right; padding-right: 1.5rem; font-family: monospace;">${item.filial}</td>
                <td style="text-align: right; padding-right: 1.5rem; font-family: monospace; color: #0077B6; font-weight: bold;">R$ ${item.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="text-align: right; padding-right: 1.5rem; font-family: monospace;">${(item.totalMinutos / 60).toFixed(0)}</td>
                <td style="text-align: right; padding-right: 1.5rem; font-family: monospace;">${item.colaboradores}</td>
            `;
            fragment.appendChild(tr);
        });
        ui.tableRankingFilialBody.appendChild(fragment);
    }


    // --- INICIALIZAÇÃO E EVENTOS ---
    async function main() {
        showLoading(true, 'Conectando...');
        try {
            await initializeSupabase(); // Espera a inicialização

            // *** CORREÇÃO ADICIONADA AQUI ***
            // Desliga o loading "Conectando..." após a inicialização.
            // As funções chamadas por handleHashChange (como loadAllData)
            // irão gerenciar seus próprios estados de loading.
            showLoading(false); 

            if (state.auth) {
                // --- SESSÃO VÁLIDA ---
                handleHashChange(); 
                window.addEventListener('hashchange', handleHashChange);

                // --- Listeners ---
                ui.importButton.addEventListener('click', handleImport);
                ui.previewButton.addEventListener('click', handlePreview); // NOVO
                ui.modalClose.addEventListener('click', () => ui.modal.style.display = 'none');
                window.addEventListener('click', (event) => {
                    if (event.target == ui.modal) {
                        ui.modal.style.display = 'none';
                    }
                });
                
                // Links da Sidebar (agora gerenciados pelo handleHashChange)
                document.querySelector('a[href="#dashboard"]').addEventListener('click', (e) => {
                    e.preventDefault();
                    if (window.location.hash !== '#dashboard') {
                        window.location.hash = '#dashboard';
                    }
                });
                document.querySelector('a[href="#acompanhamento"]').addEventListener('click', (e) => {
                    e.preventDefault();
                     if (window.location.hash !== '#acompanhamento') {
                        window.location.hash = '#acompanhamento';
                    }
                });
                document.querySelector('a[href="#configuracoes"]').addEventListener('click', (e) => {
                    e.preventDefault();
                     if (window.location.hash !== '#configuracoes') {
                        window.location.hash = '#configuracoes';
                    }
                });

                // MUDANÇA: Debounce (atraso) para os filtros da tabela
                let filterTimeout;
                [ui.filterChapa, ui.filterNome, ui.filterRegional, ui.filterCodFilial].forEach(input => {
                    input.addEventListener('input', () => {
                        clearTimeout(filterTimeout);
                        filterTimeout = setTimeout(() => {
                            applyFilters();
                        }, 300); // 300ms de atraso
                    });
                });
                
                // NOVO: Listeners para os filtros do Dashboard (sem debounce, usam 'change')
                [ui.filterRegionalDash, ui.filterCodFilialDash, ui.filterSecaoDash, ui.filterFuncaoDash].forEach(input => {
                    // Usamos 'change' pois são datalists, o usuário seleciona ou digita e sai
                    input.addEventListener('change', initializeDashboard);
                });

                ui.logoutButton.addEventListener('click', logout);
                ui.logoutLink.addEventListener('click', logout);
                
                ui.profileDropdownButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    ui.profileDropdown.classList.toggle('open');
                });
                document.addEventListener('click', (e) => {
                    if (ui.profileDropdown && !ui.profileDropdown.contains(e.target)) {
                        ui.profileDropdown.classList.remove('open');
                    }
                });
                // --- Fim dos listeners ---

            } else {
                // --- SESSÃO INVÁLIDA (ou expirada) ---
                showLoading(false);
                console.warn("Nenhuma sessão de autenticação encontrada. A aplicação não será totalmente carregada.");
            }
        } catch (err) {
            // --- ERRO FATAL ---
            console.error("Falha crítica ao carregar a aplicação (main):", err.message);
            mostrarNotificacao(`Falha crítica: ${err.message}`, 'error', 10000);
            showLoading(false); // Garante que o loading saia.
        }
    }

    main();
    
    // Lógica da Sidebar (copiado do app.html)
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (sidebarToggle && sidebar && sidebarOverlay) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.innerWidth <= 768) {
                document.body.classList.toggle('sidebar-open');
            } else {
                sidebar.classList.toggle('collapsed');
            }
        });
        
        sidebarOverlay.addEventListener('click', () => {
            document.body.classList.remove('sidebar-open');
        });
    }
    
    feather.replace(); // Chamada final
});
