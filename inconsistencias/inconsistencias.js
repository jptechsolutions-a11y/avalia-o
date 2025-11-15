// --- CONFIGURAÇÕES E CONSTANTES ---

const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8'; 

const SUPABASE_PROXY_URL = '/api/proxy';
const IMPORT_API_URL = '/api/import-inconsistencias';

const DATA_TABLE = 'inconsistencias_data';
const META_TABLE = 'inconsistencias_meta';

// Colunas para importação/preview (Exatamente como no arquivo)
// ATUALIZADO: Removido 'REFERENCIA' e 'BANDEIRA'
const COLUMN_MAP_ORIGINAL = {
    'REGIONAL': 'Regional',
    'CODFILIAL': 'Cód. Filial',
    'CHAPA': 'Chapa',
    'NOME': 'Nome',
    'DESC_SECAO': 'Seção',
    'FUNCAO': 'Função',
    'TIPO': 'Tipo',
    'DATA': 'Data',
    'CODSITUACAO': 'Cód. Situação'
};
const COLUMN_ORDER_ORIGINAL = [
    'REGIONAL', 'CODFILIAL', 'CHAPA', 'NOME', 'DESC_SECAO', 'FUNCAO', 
    'TIPO', 'DATA', 'CODSITUACAO'
];

// Colunas para a tabela de Acompanhamento (visão resumida)
// (Sem alterações, já estava correto)
const COLUMN_MAP_ACOMP = {
    'CODFILIAL': 'Filial',
    'CHAPA': 'Chapa',
    'NOME': 'Nome',
    'FUNCAO': 'Função',
    'DESC_SECAO': 'Seção',
    'TIPO': 'Tipo',
    'DATA': 'Data'
};
const COLUMN_ORDER_ACOMP = [
    'CODFILIAL', 'CHAPA', 'NOME', 'FUNCAO', 'DESC_SECAO', 'TIPO', 'DATA'
];


const sessionStorageAdapter = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

let supabaseClient = null; 

// --- ESTADO GLOBAL ---
const state = {
    currentUser: null, 
    auth: null,
    userId: null,
    isAdmin: false,
    permissoes_filiais: null,
    allData: [], 
    listasFiltros: {
        regional: [],
        codfilial: [],
        funcao: [],
        secao: [],
        tipo: []
    },
    charts: { 
        chartSetor: null, 
        chartFuncao: null,
        chartTipo: null,
        chartFilial: null
    },
    setupCompleto: false,
};

// --- FUNÇÃO DE REQUISIÇÃO (Proxy) ---
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
    const authToken = localStorage.getItem('auth_token'); 
    
    if (!authToken) {
        console.error("Token JWT não encontrado no localStorage, deslogando.");
        logout();
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
            } catch(e) {}
            
            console.error("Erro Supabase (via Proxy):", errorData);
            const detailedError = errorData.message || errorData.error || `Erro na requisição (${response.status})`;
            
            if (response.status === 401) {
                throw new Error("Não autorizado. Sua sessão pode ter expirada. (Código 401)"); 
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
        if (error.message.includes("Não autorizado") || error.message.includes("expirada") || error.message.includes("(Código 401)")) {
            mostrarNotificacao("Sessão expirada ou token inválido. Redirecionando para login.", 'error', 5000);
            if(typeof logout === 'function') logout(); 
        }
        throw error; 
    }
}

// --- FUNÇÕES DE UI (Loading, Notificação, Logout) ---

function showLoading(show, text = 'Processando...') {
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    if (loading && loadingText) {
        loadingText.textContent = text;
        loading.style.display = show ? 'flex' : 'none';
    }
}

function showImportError(message) {
    const importError = document.getElementById('importError');
    const importErrorMessage = document.getElementById('importErrorMessage');
    if (importError && importErrorMessage) {
        importErrorMessage.textContent = message;
        importError.classList.remove('hidden');
        importError.className = "alert alert-error mb-4";
    }
}

function mostrarNotificacao(message, type = 'info', timeout = 4000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
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

function logout() {
    localStorage.removeItem('auth_token');
    window.location.href = '../home.html'; 
}

// --- FUNÇÕES DE INICIALIZAÇÃO E NAVEGAÇÃO ---

async function initializeSupabaseAndUser() {
    showLoading(true, 'Verificando acesso...');
    
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                storage: sessionStorageAdapter,
                persistSession: true,
                autoRefreshToken: true
            }
        });
    } catch (e) {
        console.error("Erro ao inicializar Supabase Client:", e);
        mostrarNotificacao("Erro crítico na inicialização do Supabase.", 'error', 10000);
        throw new Error("Falha ao inicializar o cliente Supabase.");
    }
    
    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        
        if (sessionError || !session) {
            console.error("Sessão inválida, redirecionando para login.", sessionError);
            window.location.href = '../index.html';
            return;
        }

        state.auth = session;
        localStorage.setItem('auth_token', session.access_token); 
        
        // Busca o perfil do usuário (incluindo 'permissoes_filiais')
        // CORREÇÃO: Adicionado filtro pelo ID do usuário
        const endpoint = `usuarios?auth_user_id=eq.${session.user.id}&select=nome,role,profile_picture_url,permissoes_filiais,email`;
        const profileResponse = await supabaseRequest(endpoint, 'GET');
        
        if (!profileResponse || profileResponse.length === 0) {
            throw new Error("Perfil de usuário não encontrado.");
        }
        const profile = profileResponse[0];
        state.currentUser = profile; 
        
        state.isAdmin = (profile.role === 'admin');
        state.permissoes_filiais = profile.permissoes_filiais || null; 

        // Atualiza a UI do Header
        const userName = profile.nome || profile.email || 'Usuário';
        const userAvatar = profile.profile_picture_url || 'https://i.imgur.com/80SsE11.png'; 
        document.getElementById('topBarUserName').textContent = userName;
        document.getElementById('topBarUserAvatar').src = userAvatar;
        document.getElementById('dropdownUserName').textContent = userName;
        document.getElementById('dropdownUserEmail').textContent = profile.email || '...';
        
        // Mostra o link de Config/Importar se for admin
        document.getElementById('configLink').style.display = state.isAdmin ? 'block' : 'none';

        // Mostra a aplicação
        document.getElementById('appShell').style.display = 'flex';
        document.body.classList.add('system-active');

        // Carrega os dados e navega para a view correta
        await loadInitialData();
        handleHashChange();

    } catch (e) {
        console.error("Erro na inicialização do sistema:", e);
        if (!e.message.includes("(Código 401)") && !e.message.includes("Falha ao inicializar")) {
            mostrarNotificacao(`Erro crítico na inicialização: ${e.message}`, 'error', 10000);
        }
        if (!e.message.includes("Não autorizado")) throw e; 
    } finally {
        showLoading(false);
    }
}

async function loadInitialData() {
    showLoading(true, 'Carregando dados de inconsistências...');
    
    try {
        // 1. Busca os dados
        // A RLS configurada no SQL cuidará da filtragem por filial para não-admins
        const query = `${DATA_TABLE}?select=*`;
        const dataRes = await supabaseRequest(query, 'GET');
        
        state.allData = (dataRes && Array.isArray(dataRes)) ? dataRes : [];
        console.log(`Dados carregados: ${state.allData.length} registros.`);

        // 2. Busca os metadados
        const metaQuery = `${META_TABLE}?id=eq.1&select=lastupdatedat&limit=1`;
        const metaRes = await supabaseRequest(metaQuery, 'GET');
        
        const timestamp = (metaRes && metaRes[0]) ? formatTimestamp(metaRes[0].lastupdatedat) : 'Nenhuma importação registrada.';
        document.getElementById('lastUpdatedDash').textContent = timestamp;
        document.getElementById('lastUpdatedAcomp').textContent = timestamp;
        
        // 3. Popula filtros e redesenha o Dashboard (view padrão)
        populateFilterLists();
        initializeDashboard();
        
    } catch (e) {
        console.error("Falha ao carregar dados iniciais:", e);
        mostrarNotificacao(`Falha ao carregar dados: ${e.message}`, 'error');
        state.allData = [];
    } finally {
        showLoading(false);
    }
}

// Preenche os selects de filtro
function populateFilterLists() {
    const allData = state.allData;
    const sets = {
        regional: new Set(),
        codfilial: new Set(),
        funcao: new Set(),
        secao: new Set(),
        tipo: new Set()
    };

    allData.forEach(item => {
        if (item.regional) sets.regional.add(item.regional);
        if (item.codfilial) sets.codfilial.add(item.codfilial);
        if (item.funcao) sets.funcao.add(item.funcao);
        if (item.desc_secao) sets.secao.add(item.desc_secao);
        if (item.tipo) sets.tipo.add(item.tipo);
    });

    state.listasFiltros = {
        regional: [...sets.regional].sort(),
        codfilial: [...sets.codfilial].sort(),
        funcao: [...sets.funcao].sort(),
        secao: [...sets.secao].sort(),
        tipo: [...sets.tipo].sort()
    };

    // Popula selects do Dashboard
    populateSelect('filterRegionalDash', state.listasFiltros.regional, 'Todas as regionais');
    populateSelect('filterCodFilialDash', state.listasFiltros.codfilial, 'Todas as filiais');
    populateSelect('filterTipoDash', state.listasFiltros.tipo, 'Todos os tipos');
    populateSelect('filterFuncaoDash', state.listasFiltros.funcao, 'Todas as funções');
    
    // Popula selects do Acompanhamento
    populateSelect('filterRegional', state.listasFiltros.regional, 'Todas');
    populateSelect('filterCodFilial', state.listasFiltros.codfilial, 'Todas');
    populateSelect('filterTipo', state.listasFiltros.tipo, 'Todos');
}

function populateSelect(selectId, list, defaultOptionText) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = `<option value="">${defaultOptionText}</option>`;
    list.forEach(val => {
        select.innerHTML += `<option value="${val}">${val}</option>`;
    });
}

function handleHashChange() {
    const hash = window.location.hash || '#dashboard';
    let viewId = 'dashboardView'; 
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
    
    try {
        switch (viewId) {
            case 'dashboardView':
                initializeDashboard();
                break;
            case 'acompanhamentoView':
                initializeAcompanhamento();
                break;
            case 'configuracoesView':
                // Nenhuma ação extra necessária
                break;
        }
    } catch(e) {
        console.error(`Erro ao carregar view ${viewId}:`, e);
    }
    
    if (window.innerWidth <= 768) {
        document.body.classList.remove('sidebar-open');
    }
    feather.replace();
}

// --- FUNÇÕES DO DASHBOARD ---

function initializeDashboard() {
    if (state.allData.length === 0) {
        console.warn("Dashboard inicializado, mas 'allData' está vazio.");
    }
    showLoading(true, 'Calculando dashboard...');
    
    try {
        const regionalFiltro = document.getElementById('filterRegionalDash').value;
        const filialFiltro = document.getElementById('filterCodFilialDash').value;
        const tipoFiltro = document.getElementById('filterTipoDash').value;
        const funcaoFiltro = document.getElementById('filterFuncaoDash').value;

        // Filtra os dados (state.allData já está filtrado por RLS)
        let filteredData = state.allData;
        if (regionalFiltro) {
            filteredData = filteredData.filter(item => item.regional === regionalFiltro);
        }
        if (filialFiltro) {
            filteredData = filteredData.filter(item => item.codfilial === filialFiltro);
        }
        if (tipoFiltro) {
            filteredData = filteredData.filter(item => item.tipo === tipoFiltro);
        }
        if (funcaoFiltro) {
            filteredData = filteredData.filter(item => item.funcao === funcaoFiltro);
        }
        
        // Processa e renderiza os gráficos
        processDashboardCharts(filteredData);
        
        feather.replace();

    } catch (e) {
        console.error(`Erro ao processar dashboard: ${e.message}`, e);
        mostrarNotificacao(`Erro ao gerar dashboard: ${e.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

function processDashboardCharts(data) {
    // 1. Agrega dados por Setor (DESC_SECAO)
    const dataSetor = aggregateChartData(data, 'desc_secao');
    renderChart(
        document.getElementById('chartSetor'), 
        'chartSetor', 
        'doughnut', 
        dataSetor.labels, 
        dataSetor.values,
        'Inconsistências por Setor'
    );
    
    // 2. Agrega dados por Função (FUNCAO)
    const dataFuncao = aggregateChartData(data, 'funcao');
    renderChart(
        document.getElementById('chartFuncao'), 
        'chartFuncao', 
        'doughnut', 
        dataFuncao.labels, 
        dataFuncao.values,
        'Inconsistências por Função'
    );

    // 3. Agrega dados por Tipo (TIPO)
    const dataTipo = aggregateChartData(data, 'tipo');
    renderChart(
        document.getElementById('chartTipo'), 
        'chartTipo', 
        'bar', 
        dataTipo.labels, 
        dataTipo.values,
        'Inconsistências por Tipo'
    );
    
    // 4. Agrega dados por Filial (CODFILIAL)
    const dataFilial = aggregateChartData(data, 'codfilial');
    renderChart(
        document.getElementById('chartFilial'), 
        'chartFilial', 
        'bar', 
        dataFilial.labels, 
        dataFilial.values,
        'Total por Filial'
    );
}

/**
 * Agrega dados para os gráficos (Top 10 + Outros).
 * @param {Array} data - Os dados filtrados.
 * @param {string} field - O campo para agrupar (ex: 'tipo').
 */
function aggregateChartData(data, field) {
    const groups = data.reduce((acc, item) => {
        const key = item[field] || 'Não Definido';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const sorted = Object.entries(groups)
        .sort(([, a], [, b]) => b - a);
            
    const topN = (field === 'tipo' || field === 'codfilial') ? 20 : 10; // Mais barras para Tipo e Filial
    const topItems = sorted.slice(0, topN);
    const others = sorted.slice(topN);
    
    const labels = topItems.map(([key]) => key);
    const values = topItems.map(([, value]) => value);
    
    if (others.length > 0) {
        labels.push('Outros');
        values.push(others.reduce((sum, [, value]) => sum + value, 0));
    }
    
    return { labels, values };
}

function renderChart(canvas, chartStateKey, type, labels, data, label) {
    if (!canvas) return;

    if (state.charts[chartStateKey]) {
        state.charts[chartStateKey].destroy();
    }
    
    const accentColor = '#0077B6';
    const primaryColor = '#00D4AA';
    
    const chartConfig = {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: [
                    accentColor, primaryColor, '#FFB703', '#FB8500', '#90E0EF', 
                    '#023047', '#219EBC', '#8ECAE6', '#ADB5BD', '#D83B5E'
                ],
                borderColor: (type === 'bar') ? accentColor : '#ffffff',
                borderWidth: (type === 'pie' || type === 'doughnut') ? 2 : 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: (type === 'bar') ? 'y' : 'x', // Coloca barras na horizontal para melhor leitura
            plugins: {
                legend: {
                    display: (type === 'pie' || type === 'doughnut'), // Apenas para pizza
                    position: 'right',
                },
                datalabels: {
                    display: (type === 'pie' || type === 'doughnut'), // Apenas para pizza
                    formatter: (value, ctx) => {
                        let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        let percentage = (value * 100 / sum);
                        return percentage < 3 ? '' : percentage.toFixed(1) + '%';
                    },
                    color: '#fff',
                    font: { weight: 'bold', size: 12 }
                }
            },
            scales: (type === 'bar') ? {
                x: { beginAtZero: true },
                y: { ticks: { autoSkip: false } } // Garante que todos os labels apareçam
            } : {}
        }
    };
    
    // Se for barra, usa uma cor só
    if (type === 'bar') {
        chartConfig.data.datasets[0].backgroundColor = accentColor;
    }

    state.charts[chartStateKey] = new Chart(canvas.getContext('2d'), chartConfig);
}

// --- FUNÇÕES DO ACOMPANHAMENTO ---

function initializeAcompanhamento() {
    if (state.allData.length === 0) {
        showLoading(true, 'Aguardando carregamento de dados...');
        return; 
    }
    renderTableHeaderAcomp();
    applyFiltersAcomp();
}

function renderTableHeaderAcomp() {
    const tr = document.createElement('tr');
    COLUMN_ORDER_ACOMP.forEach(key => {
        const th = document.createElement('th');
        th.textContent = COLUMN_MAP_ACOMP[key] || key;
        tr.appendChild(th);
    });
    const thAction = document.createElement('th');
    thAction.textContent = 'Ações';
    tr.appendChild(thAction);
    document.getElementById('tableHead').innerHTML = '';
    document.getElementById('tableHead').appendChild(tr);
}

function applyFiltersAcomp() {
    showLoading(true, 'Filtrando inconsistências...');
    
    const filtroNome = document.getElementById('filterNome').value.toLowerCase().trim();
    const filtroChapa = document.getElementById('filterChapa').value.toLowerCase().trim();
    const filtroRegional = document.getElementById('filterRegional').value;
    const filtroCodFilial = document.getElementById('filterCodFilial').value;
    const filtroTipo = document.getElementById('filterTipo').value;

    let filteredData = state.allData;
    
    if (filtroNome) {
        filteredData = filteredData.filter(item => item.nome && item.nome.toLowerCase().includes(filtroNome));
    }
    if (filtroChapa) {
        filteredData = filteredData.filter(item => item.chapa && item.chapa.toLowerCase().includes(filtroChapa));
    }
    if (filtroRegional) {
        filteredData = filteredData.filter(item => item.regional === filtroRegional);
    }
    if (filtroCodFilial) {
        filteredData = filteredData.filter(item => item.codfilial === filtroCodFilial);
    }
    if (filtroTipo) {
        filteredData = filteredData.filter(item => item.tipo === filtroTipo);
    }
    
    renderTableBodyAcomp(filteredData);
    showLoading(false);
}

function renderTableBodyAcomp(data) {
    const tbody = document.getElementById('tableBody');
    const tableMessage = document.getElementById('tableMessage');
    tbody.innerHTML = '';
    tableMessage.classList.add('hidden');

    if (data.length === 0) {
        tableMessage.innerHTML = 'Nenhuma inconsistência encontrada para os filtros aplicados.';
        tableMessage.classList.remove('hidden');
        return;
    }
    
    // Ordena por data (mais recente primeiro)
    data.sort((a, b) => new Date(b.data) - new Date(a.data));

    const fragment = document.createDocumentFragment();
    const dataToShow = data.slice(0, 500); // Limita a 500 linhas para performance

    if (data.length > 500) {
        tableMessage.innerHTML = 'Exibindo as 500 inconsistências mais recentes. Refine seus filtros.';
        tableMessage.classList.remove('hidden');
    }

    dataToShow.forEach(item => {
        const tr = document.createElement('tr');
        
        COLUMN_ORDER_ACOMP.forEach(key => {
            const td = document.createElement('td');
            let value = item[key.toLowerCase()] || '-'; // Dados do supabase vêm minúsculos
            
            if (key === 'DATA') {
                value = formatToBR(value); 
            }
            if (key === 'NOME' || key === 'FUNCAO' || key === 'TIPO') {
                td.style.whiteSpace = 'normal';
            }
            
            td.textContent = value;
            tr.appendChild(td);
        });

        const tdAction = document.createElement('td');
        const viewButton = document.createElement('button');
        viewButton.innerHTML = '<i data-feather="eye" class="h-4 w-4"></i>';
        viewButton.className = "btn btn-sm btn-info"; 
        viewButton.title = "Ver Detalhes do Colaborador";
        viewButton.onclick = () => showDetails(item.chapa);
        tdAction.appendChild(viewButton);
        
        tr.appendChild(tdAction);
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
    feather.replace();
}

function showDetails(chapa) {
    const modal = document.getElementById('detailsModal');
    if (!chapa) return;

    // 1. Encontra o primeiro registro para pegar os dados do colaborador
    const colaborador = state.allData.find(item => item.chapa === chapa);
    if (!colaborador) {
        mostrarNotificacao('Colaborador não encontrado.', 'error');
        return;
    }

    // 2. Encontra TODAS as inconsistências desse colaborador
    const todasInconsistencias = state.allData
        .filter(item => item.chapa === chapa)
        .sort((a, b) => new Date(b.data) - new Date(a.data));

    // 3. Preenche os campos do modal
    document.getElementById('modalTitle').textContent = `Detalhes: ${colaborador.nome}`;
    document.getElementById('modalNome').value = colaborador.nome || 'N/A';
    document.getElementById('modalChapa').value = colaborador.chapa || 'N/A';
    document.getElementById('modalFuncao').value = colaborador.funcao || 'N/A';
    document.getElementById('modalSecao').value = colaborador.desc_secao || 'N/A';

    // 4. Cria a tabela de detalhes
    const detailsContainer = document.getElementById('modalDetailsContainer');
    // ATUALIZADO: Removido 'Referência'
    let tableHTML = '<table class="tabela"><thead><tr><th>Tipo</th><th>Data</th><th>Situação</th></tr></thead><tbody>';
    
    if (todasInconsistencias.length === 0) {
        tableHTML += '<tr><td colspan="3" class="text-center py-4">Nenhum registro encontrado.</td></tr>';
    } else {
        todasInconsistencias.forEach(item => {
            tableHTML += `
                <tr>
                    <td style="white-space: normal;">${item.tipo || '-'}</td>
                    <td>${formatToBR(item.data) || '-'}</td>
                    <td>${item.codsituacao || '-'}</td>
                </tr>
            `;
        });
    }
    tableHTML += '</tbody></table>';
    detailsContainer.innerHTML = tableHTML;
    
    modal.style.display = 'flex';
}

function formatToBR(isoDateStr) {
    if (!isoDateStr) return '-';
    // Pega apenas a parte da data (YYYY-MM-DD)
    const datePart = isoDateStr.split('T')[0];
    const parts = datePart.split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
    return isoDateStr; // Retorna o original se não for YYYY-MM-DD
}


// --- FUNÇÕES DE CONFIGURAÇÃO (IMPORT) ---

function handlePreview() {
    const ui = {
        importError: document.getElementById('importError'),
        importErrorMessage: document.getElementById('importErrorMessage'),
        previewContainer: document.getElementById('previewContainer'),
        previewTableContainer: document.getElementById('previewTableContainer'),
        dataInput: document.getElementById('dataInput')
    };

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
    const headers = COLUMN_ORDER_ORIGINAL;
    
    let tableHTML = '<table class="tabela"><thead><tr>';
    headers.forEach(key => {
        tableHTML += `<th>${COLUMN_MAP_ORIGINAL[key] || key}</th>`;
    });
    tableHTML += '</tr></thead><tbody>';

    previewData.forEach(item => {
        tableHTML += '<tr>';
        headers.forEach(key => {
            let value = item[key] || '-';
            // Formata a data ISO (YYYY-MM-DD) de volta para BR (DD/MM/YYYY) para o preview
            if (key === 'DATA') {
                value = formatToBR(value); 
            }
            tableHTML += `<td>${value}</td>`;
        });
        tableHTML += '</tr>';
    });

    tableHTML += '</tbody></table>';

    ui.previewTableContainer.innerHTML = tableHTML;
    ui.previewContainer.style.display = 'block';
    
    ui.importErrorMessage.textContent = `Mostrando ${previewData.length} de ${parsedData.length} registros.`;
    ui.importError.className = "alert alert-success mb-4";
    ui.importError.classList.remove('hidden');
}

function parsePastedData(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error("Os dados precisam de pelo menos 2 linhas (cabeçalho e dados).");

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    // Colunas esperadas: ATUALIZADO
    const EXPECTED_HEADERS = [
        'REGIONAL', 'CODFILIAL', 'CHAPA', 'NOME', 'DESC_SECAO', 'FUNCAO', 
        'TIPO', 'DATA', 'CODSITUACAO'
    ]; 
    const headers = lines[0].split(delimiter).map(h => h.trim().toUpperCase().replace(/"/g, ''));
    
    const missingHeaders = EXPECTED_HEADERS.filter(col => !headers.includes(col));
    if (missingHeaders.length > 0) {
        throw new Error(`Cabeçalhos faltando: ${missingHeaders.join(', ')}`);
    }

    const data = lines.slice(1).map(line => {
        const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''));
        const obj = {};
        
        headers.forEach((header, index) => {
            if (EXPECTED_HEADERS.includes(header)) {
                // Converte data (DD/MM/YYYY HH:MM:SS) para ISO (YYYY-MM-DD)
                if (header === 'DATA') {
                    obj[header] = formatToISO(values[index]) || null;
                } else {
                    obj[header] = values[index] || null; 
                }
            }
        });
        
        if (!obj.CHAPA || !obj.DATA) {
            console.warn("Linha sem 'CHAPA' ou 'DATA' ignorada:", line);
            return null;
        }
        return obj;
    }).filter(Boolean); // Remove linhas nulas

    return data;
}

// ATUALIZADO: Lida com o formato "DD/MM/YYYY HH:MM:SS"
function formatToISO(dateStr) {
    if (!dateStr || dateStr.toLowerCase().includes('n/a') || dateStr === '-') return null;
    const cleanedStr = dateStr.split(' ')[0].trim(); // Pega só a parte da data
    const parts = cleanedStr.split('/');
    if (parts.length === 3) {
        let [day, month, year] = parts;
        if (year.length === 2) {
            year = '20' + year; 
        }
        // Garante que o ano tenha 4 dígitos (ex: 2025)
        if (year.length === 4) {
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
    }
    return null; // Retorna nulo se o formato for inválido
}


async function handleImport() {
    const ui = {
        importError: document.getElementById('importError'),
        previewContainer: document.getElementById('previewContainer'),
        dataInput: document.getElementById('dataInput')
    };

    ui.importError.classList.add('hidden');
    ui.previewContainer.style.display = 'none';
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
        const response = await fetch(IMPORT_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}` 
            },
            body: JSON.stringify(newData) 
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || errorData.error || `Erro do servidor: ${response.statusText}`); 
        }

        const result = await response.json();
        
        ui.dataInput.value = '';
        
        showLoading(true, 'Recarregando dados...');
        await loadInitialData(); // Recarrega tudo
        
        showLoading(false);
        mostrarNotificacao(result.message || "Dados importados com sucesso!", 'success');
        
        // Navega para o dashboard para ver o resultado
        window.location.hash = '#dashboard';
        handleHashChange();

    } catch (err) {
        console.error("Erro durante a importação:", err);
        showLoading(false);
        showImportError(`Erro fatal: ${err.message}.`); 
    }
}


// --- INICIALIZAÇÃO E EVENTOS ---

document.addEventListener('DOMContentLoaded', () => {
    Chart.register(ChartDataLabels);
    
    initializeSupabaseAndUser();

    // Listeners de Navegação
    document.getElementById('logoutButton').addEventListener('click', logout);
    document.getElementById('logoutLink').addEventListener('click', logout);
    window.addEventListener('hashchange', handleHashChange);
    
    // Listeners do Dropdown de Perfil
    const profileDropdownButton = document.getElementById('profileDropdownButton');
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileDropdownButton) {
        profileDropdownButton.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('open');
        });
    }
    document.addEventListener('click', (e) => {
        if (profileDropdown && !profileDropdown.contains(e.target)) {
            profileDropdown.classList.remove('open');
        }
    });
    
    // Listeners do Dashboard
    document.getElementById('filterRegionalDash').addEventListener('change', initializeDashboard);
    document.getElementById('filterCodFilialDash').addEventListener('change', initializeDashboard);
    document.getElementById('filterTipoDash').addEventListener('change', initializeDashboard);
    document.getElementById('filterFuncaoDash').addEventListener('change', initializeDashboard);
    
    // Listeners do Acompanhamento
    document.getElementById('filterRegional').addEventListener('change', applyFiltersAcomp);
    document.getElementById('filterCodFilial').addEventListener('change', applyFiltersAcomp);
    document.getElementById('filterTipo').addEventListener('change', applyFiltersAcomp);
    let filterTimeout;
    ['filterNome', 'filterChapa'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(applyFiltersAcomp, 300);
        });
    });

    // Listeners de Configuração (Import)
    document.getElementById('importButton').addEventListener('click', handleImport);
    document.getElementById('previewButton').addEventListener('click', handlePreview);

    // Listener do Modal
    document.getElementById('modalClose').addEventListener('click', () => {
        document.getElementById('detailsModal').style.display = 'none';
    });
    window.addEventListener('click', (event) => {
        if (event.target == document.getElementById('detailsModal')) {
            document.getElementById('detailsModal').style.display = 'none';
        }
    });
    
    // Lógica da Sidebar
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

    feather.replace();
});
