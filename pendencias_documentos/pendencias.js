// --- CONFIGURAÇÕES E CONSTANTES ---

const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8'; 

const SUPABASE_PROXY_URL = '/api/proxy';
const IMPORT_API_URL = '/api/import-pendencias';

const DATA_TABLE = 'pendencias_documentos_data';
const META_TABLE = 'pendencias_documentos_meta';

const META_PORCENTAGEM = 3.0; // Meta: manter as pendências abaixo de 3.0%

const COLUMN_MAP = {
    'BANDEIRA': 'Bandeira',
    'REGIONAL': 'Regional',
    'CODFILIAL': 'Filial',
    'DOCUMENTO': 'Documento',
    'CHAPA': 'Chapa',
    'NOME': 'Nome',
    'FUNCAO': 'Função',
    'DATA_CRIACAO': 'Criação',
    'DATA_ASSINATURA': 'Assinatura',
    'DESC_STATUS': 'Status'
};
// AJUSTE: Removida a coluna 'FUNCAO' (apenas para a tabela de acompanhamento)
const COLUMN_ORDER = [
    'CODFILIAL', 'DOCUMENTO', 
    'CHAPA', 'NOME', 
    'DATA_CRIACAO', 'DATA_ASSINATURA', 'DESC_STATUS'
];

// Define o adaptador para sessionStorage (usado na criação do cliente Supabase)
const sessionStorageAdapter = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

let supabaseClient = null; 

// Funções utilitárias (Data, Parse, etc.)
const utils = {
    // Converte as chaves de um objeto para MAIÚSCULAS 
    mapKeysToUpperCase(dataArray) {
        // CORREÇÃO: ArrayArray foi trocado por Array
        if (!Array.isArray(dataArray)) return [];
        return dataArray.map(item => {
            const newItem = {};
            for (const key in item) {
                if (Object.prototype.hasOwnProperty.call(item, key)) {
                    newItem[key.toUpperCase()] = item[key];
                }
            }
            return newItem;
        });
    },
    // Converte data de DD/MM/YYYY ou DD/MM/YY para YYYY-MM-DD (ISO 8601)
    formatToISO(dateStr) {
        if (!dateStr || dateStr.toLowerCase().includes('n/a') || dateStr === '-') return null;
        const cleanedStr = dateStr.split(' ')[0].trim(); 
        
        const parts = cleanedStr.split('/');
        if (parts.length === 3) {
            let [day, month, year] = parts;
            if (year.length === 2) {
                year = '20' + year; 
            }
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        return null; 
    },
    // Converte data ISO (YYYY-MM-DD) para DD/MM/YYYY (para exibição)
    formatToBR(isoDateStr) {
        if (!isoDateStr || isoDateStr.toLowerCase().includes('n/a') || isoDateStr === '-') return '-';
        const parts = isoDateStr.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        }
        return isoDateStr;
    },
    // Retorna a data no formato YYYY-MM
    formatDateToMonth(dateStr) {
        if (!dateStr || dateStr.toLowerCase().includes('n/a') || dateStr === '-') return null;
        try {
            let isoDate = dateStr;
            if (dateStr.includes('/')) {
                 isoDate = utils.formatToISO(dateStr);
            }
            
            if (!isoDate) return null;
            
            return isoDate.substring(0, 7); // YYYY-MM
        } catch (e) {
            return null;
        }
    },
    // Formata o timestamp para exibição na UI
    formatTimestamp(isoString) {
        if (!isoString) return 'N/A';
        return new Date(isoString).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    },
    // Converte string de data para objeto Date (para cálculos de dias)
    parseDate(dateStr) {
        if (!dateStr || dateStr.toLowerCase().includes('n/a') || dateStr === '-') return null;
        try {
            const isoDate = dateStr.includes('/') ? utils.formatToISO(dateStr) : dateStr;
            if (!isoDate) return null;
            
            const date = new Date(isoDate + 'T00:00:00Z'); 
            return date;
        } catch (e) {
            return null;
        }
    },
    // Calcula a diferença em dias entre duas datas
    diffInDays(date1, date2) {
        if (!date1 || !date2) return NaN;
        const diffTime = Math.abs(date2.getTime() - date1.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },
    // Retorna se um documento *AINDA* está pendente (não assinado)
    isAberto(item) {
        return !item.DATA_ASSINATURA || 
                item.DATA_ASSINATURA.toLowerCase().includes('n/a') ||
                item.DATA_ASSINATURA === '-';
    },
    
    // Regra de Pendência Histórica
    isPendenciaHistorica(item, mesDeReferencia) {
        if (!item.DATA_CRIACAO) return false;
        
        const mesCriacao = utils.formatDateToMonth(item.DATA_CRIACAO);
        const mesAssinatura = utils.formatDateToMonth(item.DATA_ASSINATURA);

        // Se o filtro de mês estiver ativo, só conta a pendência SE for do mês de criação.
        // A exceção é para o acompanhamento (sem filtro de mês), onde contamos todos abertos.
        if (mesDeReferencia && mesCriacao !== mesDeReferencia) {
            return false;
        }

        // 1. Se ainda está aberto, é pendência.
        if (utils.isAberto(item)) {
            return true;
        }
        
        // 2. Se a assinatura foi em um mês posterior ao da criação, foi pendência.
        if (mesCriacao && mesAssinatura && mesAssinatura > mesCriacao) {
             return true;
        }
        
        return false;
    }
};

// --- ESTADO GLOBAL ---
const state = {
    currentUser: null, 
    auth: null,
    userId: null,
    isAdmin: false,
    permissoes_filiais: null,
    allData: [], 
    listasFiltros: {
        mes: [],
        regional: [],
        codfilial: [],
        documento: [],
        secao: [], 
        funcao: [] 
    },
    charts: {
        pendenciasMensais: null,
        rankingFilial: null, 
        // rankingSecao: null, // REMOVIDO: Pendência por Seção
        rankingFuncao: null 
    },
    setupCompleto: false,
};

// --- FUNÇÃO DE REQUISIÇÃO (Não alterada) ---
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
// --- FIM DA FUNÇÃO DE REQUISIÇÃO ---


// --- FUNÇÕES DE INICIALIZAÇÃO E UI (Não alteradas exceto por dependências) ---

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
    if (!container) {
        console.warn("Notification container not found, using alert().");
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

function logout() {
    localStorage.removeItem('auth_token');
    window.location.href = '../home.html'; 
}

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
        
        const endpoint = `usuarios?select=nome,role,profile_picture_url,permissoes_filiais,email`;
        const profileResponse = await supabaseRequest(endpoint, 'GET');
        
        if (!profileResponse || profileResponse.length === 0) {
            throw new Error("Perfil de usuário não encontrado.");
        }
        const profile = profileResponse[0];
        state.currentUser = profile; 
        
        state.isAdmin = (profile.role === 'admin');
        // ATENÇÃO: permissoes_filiais vem como ARRAY
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

async function loadInitialData() {
    showLoading(true, 'Carregando todos os dados de pendências...');
    
    try {
        const pageSize = 1000;
        let currentPage = 0;
        let hasMoreData = true;
        let allRecords = [];

        // 1. Paginação para buscar TODOS os dados
        while (hasMoreData) {
            const offset = currentPage * pageSize;
            const range = `&offset=${offset}&limit=${pageSize}`;

            // Ordena pela data de criação
            const query = `${DATA_TABLE}?select=*&order=data_criacao.desc${range}`;
            
            const dataRes = await supabaseRequest(query, 'GET', null, { 
                'Prefer': `return=representation,count=exact`
            });

            if (dataRes && Array.isArray(dataRes)) {
                allRecords = allRecords.concat(dataRes);
                
                if (dataRes.length < pageSize) {
                    hasMoreData = false;
                } else {
                    currentPage++;
                    showLoading(true, `Carregando dados... ${allRecords.length} registros...`);
                }
            } else {
                hasMoreData = false; 
            }
        }

        // 2. Busca os metadados
        const metaQuery = `${META_TABLE}?id=eq.1&select=lastupdatedat&limit=1`;
        const metaRes = await supabaseRequest(metaQuery, 'GET');
        
        state.allData = utils.mapKeysToUpperCase(allRecords);

        // Atualiza a data da última importação
        if (metaRes && metaRes.length > 0) {
            const timestamp = utils.formatTimestamp(metaRes[0].lastupdatedat);
            document.getElementById('lastUpdatedDash').textContent = timestamp;
        } else {
            document.getElementById('lastUpdatedDash').textContent = 'Nenhuma importação registrada.';
        }

        // 3. Popula filtros e redesenha o Dashboard
        populateFilterLists();
        
        // Otimização: Chama a inicialização da view ativa
        const hash = window.location.hash || '#dashboard';
        if (hash === '#dashboard') {
             initializeDashboard(); 
        } else if (hash === '#acompanhamento') {
             initializeAcompanhamento(); 
        }
        
    } catch (e) {
        console.error("Falha ao carregar dados iniciais:", e);
        mostrarNotificacao(`Falha ao carregar dados: ${e.message}`, 'error');
        state.allData = [];
    } finally {
        showLoading(false);
    }
}

// Preenche os selects de filtro do dashboard e do acompanhamento (Não alterada)
function populateFilterLists() {
    const allData = state.allData;
    const sets = {
        mes: new Set(),
        regional: new Set(),
        codfilial: new Set(),
        documento: new Set(),
        secao: new Set(), 
        funcao: new Set() 
    };

    allData.forEach(item => {
        const mesCriacao = utils.formatDateToMonth(item.DATA_CRIACAO);
        if (mesCriacao) sets.mes.add(mesCriacao);
        if (item.REGIONAL) sets.regional.add(item.REGIONAL);
        if (item.CODFILIAL) sets.codfilial.add(item.CODFILIAL);
        if (item.DOCUMENTO) sets.documento.add(item.DOCUMENTO);
        if (item.SECAO) sets.secao.add(item.SECAO); 
        if (item.FUNCAO) sets.funcao.add(item.FUNCAO); 
    });

    state.listasFiltros.mes = [...sets.mes].sort().reverse();
    state.listasFiltros.regional = [...sets.regional].sort();
    state.listasFiltros.codfilial = [...sets.codfilial].sort();
    state.listasFiltros.documento = [...sets.documento].sort();
    state.listasFiltros.secao = [...sets.secao].sort(); 
    state.listasFiltros.funcao = [...sets.funcao].sort(); 

    // Popula selects do Dashboard
    const mesDash = document.getElementById('filterMesDash');
    document.getElementById('filterRegionalDash').innerHTML = '<option value="">Todas as regionais</option>' + state.listasFiltros.regional.map(r => `<option value="${r}">${r}</option>`).join('');
    document.getElementById('filterCodFilialDash').innerHTML = '<option value="">Todas as filiais</option>' + state.listasFiltros.codfilial.map(f => `<option value="${f}">${f}</option>`).join('');
    
    mesDash.innerHTML = '<option value="">Todos os meses</option>';
    state.listasFiltros.mes.forEach(m => {
        const [year, month] = m.split('-');
        const date = new Date(year, month - 1);
        const display = date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'short' });
        mesDash.innerHTML += `<option value="${m}">${display}</option>`;
    });
    
    // Define o mês de referência para a meta (último mês disponível)
    const mesReferencia = state.listasFiltros.mes[0];
    if (mesReferencia) {
        const [year, month] = mesReferencia.split('-');
        const date = new Date(year, month - 1);
        document.getElementById('mesReferenciaMeta').textContent = date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long' });
        mesDash.value = mesReferencia; 
    } else {
        document.getElementById('mesReferenciaMeta').textContent = 'N/A';
        mesDash.value = '';
    }

    // Popula selects do Acompanhamento (usa a mesma lista para simplificar)
    const selectsAcomp = ['filterRegionalAcomp', 'filterCodFilialAcomp', 'filterDocumentoAcomp'];
    const filterKeys = ['regional', 'codfilial', 'documento'];
    
    selectsAcomp.forEach((id, index) => {
        const select = document.getElementById(id);
        const key = filterKeys[index];
        if (select) {
            select.innerHTML = '<option value="">Todas</option>';
            state.listasFiltros[key].forEach(val => {
                select.innerHTML += `<option value="${val}">${val}</option>`;
            });
        }
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
                initializeConfiguracoes();
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
        showLoading(true, 'Aguardando carregamento de dados...');
        return; 
    }

    showLoading(true, 'Calculando dashboard...');
    
    try {
        const mesFiltro = document.getElementById('filterMesDash').value;
        const regionalFiltro = document.getElementById('filterRegionalDash').value;
        const filialFiltro = document.getElementById('filterCodFilialDash').value;

        // 1. Filtra os dados conforme a UI para todos os cálculos
        let filteredData = state.allData;
        
        // Aplica filtros de permissão
        if (!state.isAdmin && Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
            filteredData = filteredData.filter(item => state.permissoes_filiais.includes(item.CODFILIAL));
        }

        if (mesFiltro) {
            // CORREÇÃO: Filtragem por Mês de Criação
            filteredData = filteredData.filter(item => utils.formatDateToMonth(item.DATA_CRIACAO) === mesFiltro);
        }
        if (regionalFiltro) {
            filteredData = filteredData.filter(item => item.REGIONAL === regionalFiltro);
        }
        if (filialFiltro) {
            filteredData = filteredData.filter(item => item.CODFILIAL === filialFiltro);
        }
        
        // 2. Processa Meta (SÓ se o filtro for por Mês e SEM outros filtros)
        const metaProgressContainer = document.getElementById('metaProgressContainer');
        
        if (metaProgressContainer) {
            if (mesFiltro && !regionalFiltro && !filialFiltro) {
                metaProgressContainer.style.display = 'block'; 
                processMeta(mesFiltro, filteredData); 
            } else {
                metaProgressContainer.style.display = 'block';
                
                const pendenciasMesEl = document.getElementById('pendenciasMesAtual');
                const totalCriadoEl = document.getElementById('totalCriadoMesAtual');
                const percentualEl = document.getElementById('percentualPendente');
                const statusMetaEl = document.getElementById('statusMeta');
                const progressFillEl = document.getElementById('progressFillMeta');
                
                if (pendenciasMesEl) pendenciasMesEl.textContent = '-';
                if (totalCriadoEl) totalCriadoEl.textContent = '-';
                if (percentualEl) percentualEl.textContent = 'N/A';
                if (statusMetaEl) statusMetaEl.innerHTML = `<span class="text-gray-500">A meta é calculada apenas com o filtro 'Mês de Criação'.</span>`;
                if (progressFillEl) progressFillEl.style.width = `0%`;
            }
        } else {
            console.warn('[Dashboard] Elemento metaProgressContainer não encontrado no DOM.');
        }

        // 3. Processa Ranking (usa os dados filtrados)
        processRanking(mesFiltro, filteredData); 
        
        // 4. Processa Gráficos de Pizza (usa os dados filtrados)
        processDashboardCharts(filteredData, mesFiltro);

        // 5. O gráfico de evolução (bottom) usa a nova regra de pendência.
        processChartPendenciasMensais(state.allData, regionalFiltro, filialFiltro);
        
        feather.replace();

    } catch (e) {
        console.error(`Erro ao processar dashboard: ${e}`);
        mostrarNotificacao(`Erro ao gerar dashboard: ${e.message}`, 'error');
    } finally {
        showLoading(false);
    }
}
// CORREÇÃO: A regra da meta agora usa a regra de pendência histórica
function processMeta(mesReferencia, dataFiltrada) {
    const elementos = {
        pendenciasMesAtual: document.getElementById('pendenciasMesAtual'),
        totalCriadoMesAtual: document.getElementById('totalCriadoMesAtual'),
        percentualPendente: document.getElementById('percentualPendente'),
        statusMeta: document.getElementById('statusMeta'),
        progressFillMeta: document.getElementById('progressFillMeta')
    };
    
    if (!elementos.pendenciasMesAtual || !elementos.totalCriadoMesAtual || !elementos.percentualPendente || !elementos.statusMeta) {
        console.warn('[processMeta] Elementos da meta não encontrados no DOM. Abortando cálculo.');
        return;
    }
    
    const totalCriado = dataFiltrada.length;
    const pendenciasNoMes = dataFiltrada.filter(item => utils.isPendenciaHistorica(item, mesReferencia));
    const totalPendencias = pendenciasNoMes.length;
    const percentualPendente = totalCriado > 0 ? (totalPendencias / totalCriado) * 100 : 0;
    
    const metaAtingida = percentualPendente <= META_PORCENTAGEM;
    const cor = metaAtingida ? 'text-pendencia-good' : 'text-pendencia-bad';
    const statusText = metaAtingida ? 'META ATINGIDA! 🎉' : 'NÃO ATINGIDA. 😞';
    
    elementos.pendenciasMesAtual.textContent = totalPendencias.toLocaleString('pt-BR');
    elementos.totalCriadoMesAtual.textContent = totalCriado.toLocaleString('pt-BR');
    elementos.percentualPendente.textContent = `${percentualPendente.toFixed(2)}%`;
    elementos.percentualPendente.className = cor;
    elementos.statusMeta.innerHTML = `<span class="${cor}">${statusText}</span>`;
    
    let progressWidth;
    if (metaAtingida) {
         progressWidth = Math.min(100, 100 - (percentualPendente / (META_PORCENTAGEM * 1.5)) * 100);
    } else {
        progressWidth = Math.min(100, percentualPendente * 100 / META_PORCENTAGEM);
    }

    if(elementos.progressFillMeta) {
        elementos.progressFillMeta.style.width = `${progressWidth}%`;
        elementos.progressFillMeta.className = `progress-fill-pendencias ${metaAtingida ? 'good' : 'bad'}`;
    }
}

// CORREÇÃO: processChartPendenciasMensais agora usa a regra histórica
function processChartPendenciasMensais(data, regionalFiltro, filialFiltro) {
    
    // Aplica os filtros de escopo para a série histórica
    let filteredData = data;
    if (!state.isAdmin && Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
        filteredData = filteredData.filter(item => state.permissoes_filiais.includes(item.CODFILIAL));
    }
    if (regionalFiltro) {
        filteredData = filteredData.filter(item => item.REGIONAL === regionalFiltro);
    }
    if (filialFiltro) {
        filteredData = filteredData.filter(item => item.CODFILIAL === filialFiltro);
    }

    const dadosAgregados = filteredData.reduce((acc, item) => {
        const mesCriacao = utils.formatDateToMonth(item.DATA_CRIACAO);
        
        if (!mesCriacao) return acc;
        
        if (!acc[mesCriacao]) {
            acc[mesCriacao] = { total: 0, pendentes: 0 };
        }
        
        acc[mesCriacao].total++;
        
        // CORREÇÃO CRÍTICA: Usa a regra de Pendência Histórica
        if (utils.isPendenciaHistorica(item, mesCriacao)) { 
             acc[mesCriacao].pendentes++;
        }
        
        return acc;
    }, {});
    
    const meses = Object.keys(dadosAgregados).sort(); 
    
    const labels = meses.map(m => {
        const [year, month] = m.split('-');
        const date = new Date(year, month - 1);
        return date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'short' }); 
    });
    
    const dataPendentes = meses.map(m => dadosAgregados[m].pendentes);
    const dataPercentual = meses.map(m => {
        const { total, pendentes } = dadosAgregados[m];
        return total > 0 ? (pendentes / total) * 100 : 0;
    });

    if (state.charts.pendenciasMensais) {
        state.charts.pendenciasMensais.destroy();
    }
    
    const ctx = document.getElementById('chartPendenciasMensais');
    if (!ctx) return;
    
    if (labels.length === 0) {
        ctx.style.display = 'none'; 
        return;
    }
    ctx.style.display = 'block'; 
    
    state.charts.pendenciasMensais = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Documentos Pendentes',
                    data: dataPendentes,
                    // COR: Vermelho/Pink (Bad)
                    backgroundColor: 'rgba(216, 59, 94, 0.8)', 
                    borderColor: 'rgba(216, 59, 94, 1)',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: '% Pendente',
                    data: dataPercentual,
                    type: 'line',
                    // COR: Azul (Neutro/Série)
                    borderColor: 'rgba(0, 180, 216, 1)', 
                    backgroundColor: 'rgba(0, 180, 216, 0.2)',
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Total de Pendências (un.)' },
                    beginAtZero: true
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: '% Pendente' },
                    grid: { drawOnChartArea: false }, 
                    suggestedMax: 20 
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                if (context.dataset.label.includes('%')) {
                                    return label + context.parsed.y.toFixed(2) + '%';
                                }
                                return label + context.parsed.y.toLocaleString('pt-BR');
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// CORREÇÃO: processRanking agora usa a regra de pendência histórica
function processRanking(mesReferencia, dataFiltrada) {
    
    const grupos = dataFiltrada.reduce((acc, item) => {
        const filial = item.CODFILIAL || 'N/A';
        if (filial === 'N/A') return acc;
        
        if (!acc[filial]) {
            acc[filial] = {
                filial: filial,
                regional: item.REGIONAL || 'N/A',
                totalDocumentos: 0,
                totalPendente: 0,
            };
        }
        
        acc[filial].totalDocumentos++;
        // CORREÇÃO: Usa a regra de Pendência Histórica
        if (utils.isPendenciaHistorica(item, mesReferencia)) {
            acc[filial].totalPendente++;
        }
        return acc;
    }, {});
    
    // Calcula o percentual e ordena pelo pior %
    const rankedData = Object.values(grupos).map(item => ({
        ...item,
        percentualPendente: item.totalDocumentos > 0 ? (item.totalPendente / item.totalDocumentos) * 100 : 0
    }))
    .sort((a, b) => b.percentualPendente - a.percentualPendente); 
    
    // Renderiza a tabela
    const tbody = document.getElementById('tableRankingFilialBody');
    if (!tbody) return; // Adicionado check de segurança

    tbody.innerHTML = '';
    
    if (rankedData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-gray-500">Nenhum dado para exibir no ranking.</td></tr>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    rankedData.forEach(item => {
        const tr = document.createElement('tr');
        // Usando o esquema de cores do Banco de Horas
        const corIndice = item.percentualPendente > META_PORCENTAGEM ? 'pendencia-alta' : 'pendencia-baixa';
        
        // Aplica text-align: right/center DENTRO do <td> para as colunas específicas
        tr.innerHTML = `
            <td style="text-align: center;">${item.filial}</td>
            <td style="text-align: center;">${item.regional}</td>
            <td style="text-align: center; font-family: monospace;">${item.totalDocumentos.toLocaleString('pt-BR')}</td>
            <td style="text-align: center; font-family: monospace;">${item.totalPendente.toLocaleString('pt-BR')}</td>
            <td style="text-align: center; font-family: monospace;" class="${corIndice}">${item.percentualPendente.toFixed(2)}%</td>
            <td style="text-align: center;">
                <span class="status-badge ${corIndice === 'pendencia-alta' ? 'status-demitido' : 'status-ativo'}" style="background-color: ${corIndice === 'pendencia-alta' ? 'var(--pendencia-bad)' : 'var(--pendencia-good)'}; color: white;">
                    ${corIndice === 'pendencia-alta' ? 'Acima Meta' : 'Abaixo Meta'}
                </span>
            </td>
        `;
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
}

// NOVO: Função para renderizar os gráficos de pizza/barra do dashboard
function processDashboardCharts(data, mesReferencia) {
    
    // Filtra SÓ as pendências históricas para os gráficos
    // Aqui usamos o filtro de mês da UI, se ele estiver ativo.
    const dataPendencia = data.filter(item => utils.isPendenciaHistorica(item, mesReferencia));
    
    // 1. Ranking por Filial (Total Pendente) -> VAI SER BARRA
    const gruposFilial = dataPendencia.reduce((acc, item) => {
        const key = item.CODFILIAL || 'N/A';
        if (!acc[key]) acc[key] = { filial: key, pendentes: 0, total: 0 };
        acc[key].pendentes++;
        return acc;
    }, {});
    
    // 2. Ranking por Função (Total Pendente)
    const gruposFuncao = dataPendencia.reduce((acc, item) => {
        const key = item.FUNCAO || 'N/A';
        if (!acc[key]) acc[key] = { funcao: key, pendentes: 0 };
        acc[key].pendentes++;
        return acc;
    }, {});
    
    
    // 3. Renderiza Filial (Gráfico 1) - MUDANÇA PARA GRÁFICO DE BARRAS
    const chartFilialData = aggregateChartData(Object.values(gruposFilial).map(g => [g.filial, g.pendentes]), 'Filial', 'Total de Pendentes (Filial)');
    renderChart(
        document.getElementById('chartRankingFilial'), 
        'rankingFilial', 
        'bar', // TIPO BARRA SOLICITADO
        chartFilialData.labels, 
        chartFilialData.values,
        'Total de Pendências por Filial'
    );
    
    // REMOVIDO: Ranking por Seção
    // if (state.charts.rankingSecao) {
    //    state.charts.rankingSecao.destroy();
    // }
    
    // 4. Renderiza Função (Gráfico 2 - Continua PIZZA/DOUGHNUT)
    const chartFuncaoData = aggregateChartData(Object.values(gruposFuncao).map(g => [g.funcao, g.pendentes]), 'Função', 'Total de Pendentes (Função)');
    renderChart(
        document.getElementById('chartRankingFuncao'), 
        'rankingFuncao', 
        'doughnut', 
        chartFuncaoData.labels, 
        chartFuncaoData.values,
        '% Pendência por Função'
    );
}

/**
 * Agrega dados para os gráficos (Top 10 + Outros).
 * @param {Array} dataArray - Array de arrays: [['chave', valor], ...].
 * @param {string} title - Título da agregação.
 */
function aggregateChartData(dataArray, keyName, valueName) {
    
    // Ordena e pega o Top 10
    const sorted = dataArray
        .filter(([, value]) => value > 0) // Remove 0
        .sort(([, a], [, b]) => b - a);
            
    const top10 = sorted.slice(0, 10);
    const others = sorted.slice(10);
        
    const labels = top10.map(([key]) => key || 'N/A');
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
    
    // Cores unificadas para os gráficos. Usamos as cores do tema:
    const primaryColor = '#16A34A'; // Verde (Good/Abaixo da Meta)
    const badColor = '#D83B5E';   // Vermelho/Pink (Bad/Acima da Meta)
    const accentColor = '#0077B6'; // Azul (Neutro/Destaque)

    const ctx = canvas.getContext('2d');
    
    let chartConfig = {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: [], // Definido abaixo
                borderColor: '#ffffff',
                borderWidth: (type === 'pie' || type === 'doughnut') ? 2 : 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right', 
                    labels: {
                        padding: 15,
                        boxWidth: 12
                    }
                },
                datalabels: {
                    display: (type === 'pie' || type === 'doughnut'), // Apenas para pie/doughnut
                    formatter: (value, ctx) => {
                        if (type !== 'pie' && type !== 'doughnut') return null;
                        let sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        let percentage = (value * 100 / sum);
                        return percentage < 3 ? '' : percentage.toFixed(1) + '%';
                    },
                    color: '#fff',
                    font: { weight: 'bold', size: 12 },
                    textShadowBlur: 2,
                    textShadowColor: 'rgba(0, 0, 0, 0.5)'
                }
            }
        }
    };

    if (type === 'bar') {
        // --- CONFIGURAÇÃO PARA GRÁFICO DE BARRAS (Filial) ---
        chartConfig.options.legend.display = false; // Não precisa de legenda em barras simples
        
        // Gerar cores dinâmicas (ex: gradiente de vermelho para azul)
        const barColors = labels.map((_, index) => {
            // Se for um gráfico de ranking (Filial), usamos o esquema BadColor (vermelho)
            if (chartStateKey === 'rankingFilial') {
                // Tenta dar um gradiente de BadColor a AccentColor
                const ratio = index / labels.length;
                
                // Exemplo de interpolação simples (BadColor sempre dominante)
                const r = parseInt(216 + ratio * (0 - 216));
                const g = parseInt(59 + ratio * (180 - 59));
                const b = parseInt(94 + ratio * (216 - 94));
                return `rgba(${r}, ${g}, ${b}, 0.8)`;
            }
            return accentColor; 
        });

        chartConfig.data.datasets[0].backgroundColor = barColors;
        chartConfig.data.datasets[0].borderColor = badColor; // Borda BadColor
        chartConfig.data.datasets[0].borderWidth = 1;

        chartConfig.options.scales = {
            x: {
                // Configurações para rótulos longos de Filial
                ticks: {
                    maxRotation: 45,
                    minRotation: 45
                }
            },
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Total de Pendências (un.)' }
            }
        };

    } else if (type === 'doughnut' || type === 'pie') {
        // --- CONFIGURAÇÃO PARA GRÁFICOS DE PIZZA/DONUT ---
        chartConfig.data.datasets[0].backgroundColor = [
            // Cores bonitas para os gráficos de pizza (Unificadas)
            badColor, primaryColor, accentColor, '#FFB703', '#90E0EF', 
            '#FB8500', '#023047', '#219EBC', '#8ECAE6', '#ADB5BD'
        ];
        chartConfig.data.datasets[0].borderColor = '#ffffff';
    }


    state.charts[chartStateKey] = new Chart(ctx, chartConfig);
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
    COLUMN_ORDER.forEach(key => {
        const th = document.createElement('th');
        th.textContent = COLUMN_MAP[key] || key;
        // Centralização para as colunas importantes
        if (['CODFILIAL', 'CHAPA', 'DATA_CRIACAO', 'DATA_ASSINATURA', 'DESC_STATUS'].includes(key)) {
            th.style.textAlign = 'center';
        }
        tr.appendChild(th);
    });
    const thDays = document.createElement('th');
    thDays.textContent = 'Dias Pendente';
    thDays.style.textAlign = 'center'; 
    tr.appendChild(thDays);
    document.getElementById('tableHeadAcomp').innerHTML = '';
    document.getElementById('tableHeadAcomp').appendChild(tr);
}

function applyFiltersAcomp() {
    showLoading(true, 'Filtrando documentos pendentes...');
    
    const filtroNome = document.getElementById('filterNomeAcomp').value.toLowerCase().trim();
    const filtroRegional = document.getElementById('filterRegionalAcomp').value;
    const filtroCodFilial = document.getElementById('filterCodFilialAcomp').value;
    const filtroDocumento = document.getElementById('filterDocumentoAcomp').value;

    // Filtra por quem AINDA está aberto (isAberto)
    let filteredData = state.allData.filter(item => utils.isAberto(item));
    
    // Aplica filtros de permissão
    if (!state.isAdmin && Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
        filteredData = filteredData.filter(item => state.permissoes_filiais.includes(item.CODFILIAL));
    }

    if (filtroNome) {
        filteredData = filteredData.filter(item => 
            (item.NOME && item.NOME.toLowerCase().includes(filtroNome)) ||
            (item.CHAPA && item.CHAPA.toLowerCase().includes(filtroNome))
        );
    }
    if (filtroRegional) {
        filteredData = filteredData.filter(item => item.REGIONAL === filtroRegional);
    }
    if (filtroCodFilial) {
        filteredData = filteredData.filter(item => item.CODFILIAL === filtroCodFilial);
    }
    if (filtroDocumento) {
        filteredData = filteredData.filter(item => item.DOCUMENTO === filtroDocumento);
    }
    
    renderTableBodyAcomp(filteredData);
    showLoading(false);
}

function renderTableBodyAcomp(data) {
    const tbody = document.getElementById('tableBodyAcomp');
    const tableMessage = document.getElementById('tableMessageAcomp');
    tbody.innerHTML = '';
    tableMessage.classList.add('hidden');

    if (data.length === 0) {
        tableMessage.innerHTML = 'Nenhum documento *ainda* pendente encontrado para os filtros aplicados.';
        tableMessage.classList.remove('hidden');
        return;
    }
    
    const dataComDias = data.map(item => {
        const dataCriacao = utils.parseDate(item.DATA_CRIACAO); // Usa a função parseDate
        const diasPendente = dataCriacao ? utils.diffInDays(dataCriacao, new Date()) : 0;
        return { ...item, diasPendente };
    }).sort((a, b) => b.diasPendente - a.diasPendente);

    const fragment = document.createDocumentFragment();

    dataComDias.forEach(item => {
        const tr = document.createElement('tr');
        
        let diasClass = 'text-gray-500';
        // CORES UNIFICADAS DO BANCO DE HORAS: Vermelho (Bad/5+ dias) e Verde (Good/1-4 dias)
        if (item.diasPendente >= 5) { // >= 5 dias: Vermelho (Ruim)
            diasClass = 'diff-pendencia-bad'; 
        } else if (item.diasPendente >= 1) { // >= 1 dia: Verde (Ainda é Pendência, mas está no prazo)
             diasClass = 'diff-pendencia-good'; // Usa cor verde (Good)
        } else {
             diasClass = 'text-gray-500'; // 0 dias
        }


        COLUMN_ORDER.forEach(key => {
            const td = document.createElement('td');
            let value = item[key] || '-';
            
            if (key.includes('DATA_')) {
                value = utils.formatToBR(value); 
                td.style.fontFamily = 'monospace';
                td.style.fontSize = '0.85rem';
                td.style.textAlign = 'center';
            }
            
            if (['CODFILIAL', 'CHAPA', 'DESC_STATUS'].includes(key)) {
                td.style.textAlign = 'center';
            } else if (['NOME', 'DOCUMENTO'].includes(key)) { 
                 td.style.whiteSpace = 'normal';
            }
            
            td.textContent = value;
            tr.appendChild(td);
        });

        const tdDays = document.createElement('td');
        tdDays.innerHTML = `<strong class="${diasClass}">${item.diasPendente}</strong>`;
        tdDays.style.textAlign = 'center';
        tr.appendChild(tdDays);
        
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
}


// --- FUNÇÕES DE CONFIGURAÇÃO (IMPORT - Não alteradas) ---

function initializeConfiguracoes() {
    const adminPanel = document.getElementById('adminPanel');
    const accessStatusConfig = document.getElementById('accessStatusConfig');
    
    if (!state.isAdmin) {
        adminPanel.style.display = 'none';
        accessStatusConfig.textContent = 'Acesso negado. Requer permissão de Administrador.';
        accessStatusConfig.className = 'access-status alert alert-error';
        accessStatusConfig.style.display = 'block';
    } else {
        adminPanel.style.display = 'block';
        accessStatusConfig.textContent = 'Acesso de Administrador concedido.';
        accessStatusConfig.className = 'access-status';
        accessStatusConfig.style.display = 'block';
    }
}

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
    // Usa as colunas do COLUMN_ORDER (sem Função)
    const headers = COLUMN_ORDER; 
    
    let tableHTML = '<table class="tabela"><thead><tr>';
    headers.forEach(key => {
        tableHTML += `<th>${COLUMN_MAP[key] || key}</th>`;
    });
    tableHTML += '</tr></thead><tbody>';

    previewData.forEach(item => {
        tableHTML += '<tr>';
        headers.forEach(key => {
            let value = item[key] || '-';
            if (key.includes('DATA_')) {
                // Converte a data (que está em ISO) para BR para o preview
                value = utils.formatToBR(value); 
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
    // Colunas esperadas: Incluem BANDEIRA e REGIONAL para passar para a API
    const EXPECTED_HEADERS = [
        'BANDEIRA', 'REGIONAL', 'CODFILIAL', 'DOCUMENTO', 'CHAPA', 'NOME', 'FUNCAO', 'SECAO',
        'DATA_CRIACAO', 'DATA_ASSINATURA', 'DESC_STATUS'
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
                obj[header] = values[index] || null; 
            }
        });
        
        // Conversão de Datas (DD/MM/YYYY para ISO YYYY-MM-DD)
        if (obj.DATA_CRIACAO) {
            obj.DATA_CRIACAO = utils.formatToISO(obj.DATA_CRIACAO) || obj.DATA_CRIACAO;
        }
        if (obj.DATA_ASSINATURA) {
            obj.DATA_ASSINATURA = utils.formatToISO(obj.DATA_ASSINATURA) || obj.DATA_ASSINATURA;
        }

        if (!obj.CHAPA || !obj.DATA_CRIACAO) {
            console.warn("Linha sem 'CHAPA' ou 'DATA_CRIACAO' ignorada:", line);
            return null;
        }
        return obj;
    }).filter(Boolean);

    return data;
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
    
    let authToken = localStorage.getItem('auth_token');
    
    if (!authToken && supabaseClient) {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (session) {
            authToken = session.access_token;
            localStorage.setItem('auth_token', authToken); 
        } else if (error) {
            console.error("Erro ao obter sessão Supabase antes da importação:", error);
        }
    }
    
    if (!authToken) {
        showImportError("Erro: Token de autenticação não encontrado. Faça login novamente.");
        showLoading(false);
        return;
    }
    
    try {
        const response = await fetch(IMPORT_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}` 
            },
            body: JSON.stringify(newData) 
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Erro da API /api/import-pendencias:", errorData); 
            if (response.status === 401 || response.status === 403) {
                mostrarNotificacao("Sessão expirada ou permissão insuficiente. Faça login novamente.", 'error', 8000);
            }
            throw new Error(errorData.details || errorData.error || `Erro do servidor: ${response.statusText}`); 
        }

        const result = await response.json();
        
        ui.dataInput.value = '';
        
        showLoading(true, 'Recarregando dados...');
        await loadInitialData(); 
        
        showLoading(false);
        mostrarNotificacao(result.message || "Dados importados com sucesso!", 'success');

    } catch (err) {
        console.error("Erro durante a importação:", err);
        showLoading(false);
        showImportError(`Erro fatal: ${err.message}.`); 
    }
}


// --- INICIALIZAÇÃO E EVENTOS (Não alterados) ---

document.addEventListener('DOMContentLoaded', () => {
    // Registra o plugin do Chart.js
    Chart.register(ChartDataLabels);
    
    initializeSupabaseAndUser();

    document.getElementById('logoutButton').addEventListener('click', logout);
    document.getElementById('logoutLink').addEventListener('click', logout);
    
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

    window.addEventListener('hashchange', handleHashChange);
    
    // 3. Listeners do Dashboard
    document.getElementById('filterMesDash').addEventListener('change', initializeDashboard);
    document.getElementById('filterRegionalDash').addEventListener('change', initializeDashboard);
    document.getElementById('filterCodFilialDash').addEventListener('change', initializeDashboard);
    
    // 4. Listeners do Acompanhamento (usando debounce para inputs de texto)
    document.getElementById('filterRegionalAcomp').addEventListener('change', applyFiltersAcomp);
    document.getElementById('filterCodFilialAcomp').addEventListener('change', applyFiltersAcomp);
    document.getElementById('filterDocumentoAcomp').addEventListener('change', applyFiltersAcomp);

    let filterTimeoutAcomp;
    document.getElementById('filterNomeAcomp').addEventListener('input', () => {
        clearTimeout(filterTimeoutAcomp);
        filterTimeoutAcomp = setTimeout(applyFiltersAcomp, 300);
    });

    // 5. Listeners de Configuração
    document.getElementById('importButton').addEventListener('click', handleImport);
    document.getElementById('previewButton').addEventListener('click', handlePreview);
    
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
