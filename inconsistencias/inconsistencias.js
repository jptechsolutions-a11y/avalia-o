// --- CONFIGURAÇÕES E CONSTANTES ---

const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8'; 

const SUPABASE_PROXY_URL = '/api/proxy';
const IMPORT_API_URL = '/api/import-inconsistencias';

const DATA_TABLE = 'inconsistencias_data';
const META_TABLE = 'inconsistencias_meta';

// Colunas para importação/preview (Exatamente como no arquivo)
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

// ATUALIZADO: Colunas para a tabela de Acompanhamento (agrupada)
const COLUMN_MAP_ACOMP = {
    'CODFILIAL': 'Filial',
    'CHAPA': 'Chapa',
    'NOME': 'Nome',
    'FUNCAO': 'Função',
    'DESC_SECAO': 'Seção',
    'TOTAL': 'Total Inconsist.' // MUDANÇA
};
const COLUMN_ORDER_ACOMP = [ // MUDANÇA
    'CODFILIAL', 'CHAPA', 'NOME', 'FUNCAO', 'DESC_SECAO', 'TOTAL'
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
    allData: [], // Cache principal, nunca modificado após o load
    // ATUALIZADO: listasFiltros agora armazena apenas as *opções* disponíveis
    listasFiltros: {
        regional: [],
        codfilial: [],
        funcao: [],
        secao: [],
        tipo: []
    },
    // ATUALIZADO: valoresFiltros armazena o que está *selecionado*
    valoresFiltrosDash: {
        regional: '',
        codfilial: '',
        funcao: '',
        secao: '',
        tipo: ''
    },
    valoresFiltrosAcomp: {
        regional: '',
        codfilial: '',
        funcao: '',
        secao: '',
        tipo: ''
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
        
        const endpoint = `usuarios?auth_user_id=eq.${session.user.id}&select=nome,role,profile_picture_url,permissoes_filiais,email`;
        const profileResponse = await supabaseRequest(endpoint, 'GET');
        
        if (!profileResponse || profileResponse.length === 0) {
            throw new Error("Perfil de usuário não encontrado.");
        }
        const profile = profileResponse[0];
        state.currentUser = profile; 
        
        state.isAdmin = (profile.role === 'admin');
        state.permissoes_filiais = profile.permissoes_filiais || null; 

        const userName = profile.nome || profile.email || 'Usuário';
        const userAvatar = profile.profile_picture_url || 'https://i.imgur.com/80SsE11.png'; 
        document.getElementById('topBarUserName').textContent = userName;
        document.getElementById('topBarUserAvatar').src = userAvatar;
        document.getElementById('dropdownUserName').textContent = userName;
        document.getElementById('dropdownUserEmail').textContent = profile.email || '...';
        
        document.getElementById('configLink').style.display = state.isAdmin ? 'block' : 'none';

        document.getElementById('appShell').style.display = 'flex';
        document.body.classList.add('system-active');

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

function formatTimestamp(isoString) {
    if (!isoString) return 'N/A';
    return new Date(isoString).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

async function loadInitialData() {
    showLoading(true, 'Carregando dados de inconsistências...');
    
    try {
        const query = `${DATA_TABLE}?select=*`;
        const dataRes = await supabaseRequest(query, 'GET');
        
        state.allData = (dataRes && Array.isArray(dataRes)) ? dataRes : [];
        console.log(`Dados carregados: ${state.allData.length} registros.`);

        const metaQuery = `${META_TABLE}?id=eq.1&select=lastupdatedat&limit=1`;
        const metaRes = await supabaseRequest(metaQuery, 'GET');
        
        const timestamp = (metaRes && metaRes[0]) ? formatTimestamp(metaRes[0].lastupdatedat) : 'Nenhuma importação registrada.';
        document.getElementById('lastUpdatedDash').textContent = timestamp;
        document.getElementById('lastUpdatedAcomp').textContent = timestamp;
        
        // ATUALIZADO: Popula os filtros de forma inicial
        populateInitialFilterLists();
        initializeDashboard();
        
    } catch (e) {
        console.error("Falha ao carregar dados iniciais:", e);
        mostrarNotificacao(`Falha ao carregar dados: ${e.message}`, 'error');
        state.allData = [];
    } finally {
        showLoading(false);
    }
}

// ATUALIZADO: Renomeado para 'populateInitialFilterLists'
function populateInitialFilterLists() {
    const allData = state.allData;
    // Pega todas as opções únicas do cache principal
    state.listasFiltros = {
        regional: [...new Set(allData.map(item => item.regional).filter(Boolean))].sort(),
        codfilial: [...new Set(allData.map(item => item.codfilial).filter(Boolean))].sort(),
        funcao: [...new Set(allData.map(item => item.funcao).filter(Boolean))].sort(),
        secao: [...new Set(allData.map(item => item.desc_secao).filter(Boolean))].sort(),
        tipo: [...new Set(allData.map(item => item.tipo).filter(Boolean))].sort()
    };

    // Popula todos os selects (Dashboard e Acompanhamento) com todas as opções
    updateFilterOptions('dashboard', state.listasFiltros);
    updateFilterOptions('acompanhamento', state.listasFiltros);
}

// NOVO: Função para popular selects
function populateSelect(selectId, list, defaultOptionText, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // Salva o valor que estava selecionado
    // const selectedValue = select.value; 
    
    select.innerHTML = `<option value="">${defaultOptionText}</option>`;
    list.forEach(val => {
        // ATUALIZADO: Adiciona 'selected' se o valor for o que estava salvo
        const isSelected = val === selectedValue ? 'selected' : '';
        select.innerHTML += `<option value="${val}" ${isSelected}>${val}</option>`;
    });
}

// NOVO: Função central para atualizar filtros (cascading)
function updateFilterOptions(viewPrefix, availableOptions, resetMenores = true) {
    const isDash = viewPrefix === 'dashboard';
    const filterValues = isDash ? state.valoresFiltrosDash : state.valoresFiltrosAcomp;

    // Popula os selects com as opções disponíveis
    populateSelect(
        isDash ? 'filterRegionalDash' : 'filterRegional', 
        availableOptions.regional, 
        isDash ? 'Todas as regionais' : 'Todas',
        resetMenores ? '' : filterValues.regional // Mantém o valor se não for reset
    );
    populateSelect(
        isDash ? 'filterCodFilialDash' : 'filterCodFilial', 
        availableOptions.codfilial, 
        isDash ? 'Todas as filiais' : 'Todas',
        resetMenores ? '' : filterValues.codfilial
    );
    populateSelect(
        isDash ? 'filterTipoDash' : 'filterTipo', 
        availableOptions.tipo, 
        isDash ? 'Todos os tipos' : 'Todos',
        resetMenores ? '' : filterValues.tipo
    );
    
    // Função só existe no Dashboard e Acompanhamento
    populateSelect(
        isDash ? 'filterFuncaoDash' : 'filterFuncaoAcomp', // ID do filtro de função no acompanhamento
        availableOptions.funcao, 
        isDash ? 'Todas as funções' : 'Todas',
        resetMenores ? '' : filterValues.funcao
    );
}

// NOVO: Handler de mudança de filtro
function handleFilterChange(viewPrefix, changedFilterKey) {
    const isDash = viewPrefix === 'dashboard';
    const filterValues = isDash ? state.valoresFiltrosDash : state.valoresFiltrosAcomp;
    
    // 1. Atualiza o valor selecionado no state
    if (changedFilterKey === 'regional') {
        filterValues.regional = document.getElementById(isDash ? 'filterRegionalDash' : 'filterRegional').value;
        // Reseta os filhos
        filterValues.codfilial = '';
        filterValues.tipo = '';
        filterValues.funcao = '';
    } else if (changedFilterKey === 'codfilial') {
        filterValues.codfilial = document.getElementById(isDash ? 'filterCodFilialDash' : 'filterCodFilial').value;
        // Reseta os filhos
        filterValues.tipo = '';
        filterValues.funcao = '';
    } else if (changedFilterKey === 'tipo') {
        filterValues.tipo = document.getElementById(isDash ? 'filterTipoDash' : 'filterTipo').value;
    } else if (changedFilterKey === 'funcao') {
        filterValues.funcao = document.getElementById(isDash ? 'filterFuncaoDash' : 'filterFuncaoAcomp').value;
    }
    
    // 2. Filtra os dados base (allData) de acordo com os filtros selecionados
    let dadosFiltrados = state.allData;
    if (filterValues.regional) {
        dadosFiltrados = dadosFiltrados.filter(d => d.regional === filterValues.regional);
    }
    if (filterValues.codfilial) {
        dadosFiltrados = dadosFiltrados.filter(d => d.codfilial === filterValues.codfilial);
    }
    if (filterValues.funcao) {
        dadosFiltrados = dadosFiltrados.filter(d => d.funcao === filterValues.funcao);
    }
    if (filterValues.tipo) {
        dadosFiltrados = dadosFiltrados.filter(d => d.tipo === filterValues.tipo);
    }
    
    // 3. Recalcula as opções disponíveis *com base* nos dados filtrados
    const availableOptions = {
        // Se um filtro pai (ex: regional) está selecionado, as opções dele são SÓ ele mesmo.
        // Se não está selecionado, as opções são todas as disponíveis nos 'dadosFiltrados'
        regional: filterValues.regional ? [filterValues.regional] : [...new Set(dadosFiltrados.map(item => item.regional).filter(Boolean))].sort(),
        codfilial: filterValues.codfilial ? [filterValues.codfilial] : [...new Set(dadosFiltrados.map(item => item.codfilial).filter(Boolean))].sort(),
        tipo: filterValues.tipo ? [filterValues.tipo] : [...new Set(dadosFiltrados.map(item => item.tipo).filter(Boolean))].sort(),
        funcao: filterValues.funcao ? [filterValues.funcao] : [...new Set(dadosFiltrados.map(item => item.funcao).filter(Boolean))].sort(),
        secao: [...new Set(dadosFiltrados.map(item => item.desc_secao).filter(Boolean))].sort() // Seção é sempre recalculada
    };
    
    // 4. Repopula os selects
    updateFilterOptions(viewPrefix, availableOptions, false); // 'false' para não resetar os valores selecionados


    // 5. Dispara a atualização da view
    if (isDash) {
        initializeDashboard();
    } else {
        applyFiltersAcomp();
    }
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
                // ATUALIZADO: Garante que os filtros sejam populados antes de inicializar
                updateFilterOptions('dashboard', state.listasFiltros, true); // Reseta os filtros do dash
                state.valoresFiltrosDash = { regional: '', codfilial: '', funcao: '', secao: '', tipo: '' }; // Limpa o state
                initializeDashboard();
                break;
            case 'acompanhamentoView':
                // ATUALIZADO: Garante que os filtros sejam populados antes de inicializar
                updateFilterOptions('acompanhamento', state.listasFiltros, true); // Reseta os filtros do acomp
                state.valoresFiltrosAcomp = { regional: '', codfilial: '', funcao: '', secao: '', tipo: '' }; // Limpa o state
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
        // ATUALIZADO: Pega os filtros do state
        const { regional: regionalFiltro, codfilial: filialFiltro, tipo: tipoFiltro, funcao: funcaoFiltro } = state.valoresFiltrosDash;

        let filteredData = state.allData;
        
        // Aplica filtros de permissão
        if (!state.isAdmin && Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
            filteredData = filteredData.filter(item => state.permissoes_filiais.includes(item.codfilial));
        }
        
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
    const dataSetor = aggregateChartData(data, 'desc_secao');
    renderChart(
        document.getElementById('chartSetor'), 
        'chartSetor', 
        'doughnut', 
        dataSetor.labels, 
        dataSetor.values,
        'Inconsistências por Setor'
    );
    
    const dataFuncao = aggregateChartData(data, 'funcao');
    renderChart(
        document.getElementById('chartFuncao'), 
        'chartFuncao', 
        'doughnut', 
        dataFuncao.labels, 
        dataFuncao.values,
        'Inconsistências por Função'
    );

    const dataTipo = aggregateChartData(data, 'tipo');
    renderChart(
        document.getElementById('chartTipo'), 
        'chartTipo', 
        'bar', 
        dataTipo.labels, 
        dataTipo.values,
        'Inconsistências por Tipo'
    );
    
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

function aggregateChartData(data, field) {
    const groups = data.reduce((acc, item) => {
        const key = item[field] || 'Não Definido';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const sorted = Object.entries(groups)
        .sort(([, a], [, b]) => b - a);
            
    const topN = (field === 'tipo' || field === 'codfilial') ? 20 : 10;
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
            indexAxis: (type === 'bar') ? 'y' : 'x', 
            plugins: {
                legend: {
                    // ATUALIZADO: Legenda desligada para 'bar'
                    display: (type === 'pie' || type === 'doughnut'), 
                    position: 'right',
                },
                datalabels: {
                    display: (type === 'pie' || type === 'doughnut'), 
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
                y: { ticks: { autoSkip: false } } 
            } : {}
        }
    };
    
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
    // ATUALIZADO: Usa o novo COLUMN_ORDER_ACOMP
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

// ATUALIZADO: Lógica de filtro e agregação
function applyFiltersAcomp() {
    showLoading(true, 'Filtrando inconsistências...');
    
    const filtroNome = document.getElementById('filterNome').value.toLowerCase().trim();
    const filtroChapa = document.getElementById('filterChapa').value.toLowerCase().trim();
    
    // Pega filtros do state
    const { regional: filtroRegional, codfilial: filtroCodFilial, tipo: filtroTipo } = state.valoresFiltrosAcomp;

    let filteredData = state.allData;

    // Aplica filtros de permissão
    if (!state.isAdmin && Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
        filteredData = filteredData.filter(item => state.permissoes_filiais.includes(item.codfilial));
    }
    
    // Filtros de Texto
    if (filtroNome) {
        filteredData = filteredData.filter(item => item.nome && item.nome.toLowerCase().includes(filtroNome));
    }
    if (filtroChapa) {
        filteredData = filteredData.filter(item => item.chapa && item.chapa.toLowerCase().includes(filtroChapa));
    }
    
    // Filtros de Dropdown (já aplicados em 'filteredData' pela função de cascading)
    if (filtroRegional) {
        filteredData = filteredData.filter(item => item.regional === filtroRegional);
    }
    if (filtroCodFilial) {
        filteredData = filteredData.filter(item => item.codfilial === filtroCodFilial);
    }
    if (filtroTipo) {
        filteredData = filteredData.filter(item => item.tipo === filtroTipo);
    }
    
    // --- NOVA LÓGICA DE AGREGAÇÃO ---
    const agrupadoPorChapa = filteredData.reduce((acc, item) => {
        const chapa = item.chapa;
        if (!acc[chapa]) {
            acc[chapa] = {
                chapa: chapa,
                nome: item.nome,
                codfilial: item.codfilial,
                funcao: item.funcao,
                desc_secao: item.desc_secao,
                total: 0
            };
        }
        acc[chapa].total++; // Incrementa o total de inconsistências
        return acc;
    }, {});
    
    const aggregatedData = Object.values(agrupadoPorChapa);
    // --- FIM DA AGREGAÇÃO ---
    
    renderTableBodyAcomp(aggregatedData); // Renderiza os dados agrupados
    showLoading(false);
}

// ATUALIZADO: Renderiza a tabela agrupada
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
    
    // Ordena por total (mais recente primeiro)
    data.sort((a, b) => b.total - a.total);

    const fragment = document.createDocumentFragment();
    const dataToShow = data.slice(0, 500); 

    if (data.length > 500) {
        tableMessage.innerHTML = 'Exibindo os 500 colaboradores com mais inconsistências. Refine seus filtros.';
        tableMessage.classList.remove('hidden');
    }

    dataToShow.forEach(item => {
        const tr = document.createElement('tr');
        
        // ATUALIZADO: Loop pelas novas colunas
        COLUMN_ORDER_ACOMP.forEach(key => {
            const td = document.createElement('td');
            // 'key' está em maiúsculo (do MAP), 'item' está em minúsculo (do reduce)
            let value = item[key.toLowerCase()] || '-'; 
            
            if (key === 'NOME' || key === 'FUNCAO' || key === 'DESC_SECAO') {
                td.style.whiteSpace = 'normal';
            }
            
            if (key === 'TOTAL') {
                td.style.fontWeight = 'bold';
                td.style.textAlign = 'center';
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

    // Busca o primeiro item para pegar os dados do colaborador
    const colaborador = state.allData.find(item => item.chapa === chapa);
    if (!colaborador) {
        mostrarNotificacao('Colaborador não encontrado.', 'error');
        return;
    }

    // Pega todas as inconsistências (não agrupadas)
    const todasInconsistencias = state.allData
        .filter(item => item.chapa === chapa)
        .sort((a, b) => new Date(b.data) - new Date(a.data));

    document.getElementById('modalTitle').textContent = `Detalhes: ${colaborador.nome}`;
    document.getElementById('modalNome').value = colaborador.nome || 'N/A';
    document.getElementById('modalChapa').value = colaborador.chapa || 'N/A';
    document.getElementById('modalFuncao').value = colaborador.funcao || 'N/A';
    document.getElementById('modalSecao').value = colaborador.desc_secao || 'N/A';

    const detailsContainer = document.getElementById('modalDetailsContainer');
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
    const datePart = isoDateStr.split('T')[0];
    const parts = datePart.split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
    return isoDateStr; 
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
            if (key === 'DATA') {
                value = formatToBR(value); // Converte ISO (do parse) de volta para BR
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
    // Colunas esperadas (sem 'bandeira' e 'referencia')
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
                    obj[header] = formatToISO(values[index]); // || null é redundante
                } else {
                    obj[header] = values[index] || null; 
                }
            }
        });
        
        // ATUALIZADO: A verificação !obj.DATA foi removida.
        // Se a chapa não existir, a linha é inútil.
        if (!obj.CHAPA) {
            console.warn("Linha sem 'CHAPA' ignorada:", line);
            return null;
        }
        // Se DATA for null (inválido ou vazio), a linha ainda é válida.
        return obj;
    }).filter(Boolean); // Remove linhas nulas

    return data;
}

// ATUALIZADO: Lida com o formato "DD/MM/YYYY HH:MM:SS" de forma mais robusta
function formatToISO(dateStr) {
    if (!dateStr || dateStr.toLowerCase().includes('n/a') || dateStr === '-') return null;
    
    const cleanedStr = dateStr.split(' ')[0].trim(); // Pega "20/09/2025"

    // 1. Tenta formato YYYY-MM-DD (já está correto)
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanedStr)) {
        return cleanedStr;
    }

    // 2. Tenta formato DD/MM/YYYY (baseado nos seus exemplos)
    const parts = cleanedStr.split('/');
    if (parts.length === 3) {
        let day = parts[0];
        let month = parts[1];
        let year = parts[2];

        if (year.length === 2) {
            year = '20' + year; 
        }
        
        // Checagem de validade (mês 1-12, dia 1-31)
        if (year.length === 4 && 
            parseInt(month, 10) >= 1 && parseInt(month, 10) <= 12 &&
            parseInt(day, 10) >= 1 && parseInt(day, 10) <= 31) 
        {
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
    }
    
    console.warn(`[formatToISO] Data em formato não reconhecido, será enviada como nula: ${dateStr}`);
    return null; // Retorna nulo se nenhum formato bater
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
        await loadInitialData(); // Isso vai recarregar, repopular filtros e re-renderizar o dashboard
        
        showLoading(false);
        mostrarNotificacao(result.message || "Dados importados com sucesso!", 'success');
        
        window.location.hash = '#dashboard';
        handleHashChange(); // Garante que a view do dashboard seja exibida

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

    document.getElementById('logoutButton').addEventListener('click', logout);
    document.getElementById('logoutLink').addEventListener('click', logout);
    window.addEventListener('hashchange', handleHashChange);
    
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
    
    // ATUALIZADO: Listeners do Dashboard (chamam a nova função)
    document.getElementById('filterRegionalDash').addEventListener('change', () => handleFilterChange('dashboard', 'regional'));
    document.getElementById('filterCodFilialDash').addEventListener('change', () => handleFilterChange('dashboard', 'codfilial'));
    document.getElementById('filterTipoDash').addEventListener('change', () => handleFilterChange('dashboard', 'tipo'));
    document.getElementById('filterFuncaoDash').addEventListener('change', () => handleFilterChange('dashboard', 'funcao'));
    
    // ATUALIZADO: Listeners do Acompanhamento (chamam a nova função ou applyFiltersAcomp para texto)
    document.getElementById('filterRegional').addEventListener('change', () => handleFilterChange('acompanhamento', 'regional'));
    document.getElementById('filterCodFilial').addEventListener('change', () => handleFilterChange('acompanhamento', 'codfilial'));
    document.getElementById('filterTipo').addEventListener('change', () => handleFilterChange('acompanhamento', 'tipo'));
    
    let filterTimeout;
    ['filterNome', 'filterChapa'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(applyFiltersAcomp, 300); // Filtros de texto ainda chamam applyFiltersAcomp diretamente
        });
    });

    document.getElementById('importButton').addEventListener('click', handleImport);
    document.getElementById('previewButton').addEventListener('click', handlePreview);

    document.getElementById('modalClose').addEventListener('click', () => {
        document.getElementById('detailsModal').style.display = 'none';
    });
    window.addEventListener('click', (event) => {
        if (event.target == document.getElementById('detailsModal')) {
            document.getElementById('detailsModal').style.display = 'none';
        }
    });
    
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
