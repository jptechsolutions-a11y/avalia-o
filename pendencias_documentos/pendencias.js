// --- CONFIGURAÇÕES E CONSTANTES ---

const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co'; // ADICIONADO
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8'; // ADICIONADO

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
// Ordem para exibição e parse (AJUSTADO: REMOVIDO BANDEIRA E REGIONAL)
const COLUMN_ORDER = [
    'CODFILIAL', 'DOCUMENTO', 
    'CHAPA', 'NOME', 'FUNCAO', 
    'DATA_CRIACAO', 'DATA_ASSINATURA', 'DESC_STATUS'
];

// Define o adaptador para sessionStorage (usado na criação do cliente Supabase)
const sessionStorageAdapter = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

let supabaseClient = null; // ADICIONADO: Variável global para o cliente Supabase

// Funções utilitárias (Data, Parse, etc.)
const utils = {
    // NOVO: Converte as chaves de um objeto para MAIÚSCULAS (Correção para Case Sensitivity do DB)
    mapKeysToUpperCase(dataArray) {
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
    // NOVO: Converte data de DD/MM/YYYY ou DD/MM/YY para YYYY-MM-DD (ISO 8601)
    formatToISO(dateStr) {
        if (!dateStr || dateStr.toLowerCase().includes('n/a') || dateStr === '-') return null;
        const cleanedStr = dateStr.split(' ')[0].trim(); // Remove a parte da hora (00:00:00)
        
        // Tenta formatos DD/MM/YYYY ou DD/MM/YY
        const parts = cleanedStr.split('/');
        if (parts.length === 3) {
            let [day, month, year] = parts;
            // Corrige ano de 2 dígitos (se for o caso)
            if (year.length === 2) {
                year = '20' + year; // Assume anos 2000+
            }
            // Retorna o formato ISO YYYY-MM-DD
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        return null; // Retorna nulo se não for um formato reconhecido
    },
    // NOVO: Converte data ISO (YYYY-MM-DD) para DD/MM/YYYY (para exibição)
    formatToBR(isoDateStr) {
        if (!isoDateStr || isoDateStr.toLowerCase().includes('n/a') || isoDateStr === '-') return '-';
        // Tenta parsear a string ISO
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
            // Usa a função de conversão para garantir o formato correto (ISO)
            // Se for DD/MM/YYYY, o parseDate vai falhar, então usamos o formatToISO
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
            // Usa a função de conversão para obter o formato ISO
            const isoDate = utils.formatToISO(dateStr);
            if (!isoDate) return null;
            
            // Cria a data a partir do formato ISO (garantindo que o fuso horário não cause erros de dia)
            const date = new Date(isoDate + 'T00:00:00Z'); // Adiciona T00:00:00Z para tratar como UTC e evitar desvios
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
        // Verifica se DATA_ASSINATURA é nula ou se a string indica não-assinatura
        return !item.DATA_ASSINATURA || 
                item.DATA_ASSINATURA.toLowerCase().includes('n/a') ||
                item.DATA_ASSINATURA === '-';
    }
};

// --- ESTADO GLOBAL ---
const state = {
    // CORREÇÃO: Adicionando currentUser para armazenar o perfil completo
    currentUser: null, 
    auth: null,
    userId: null,
    isAdmin: false,
    permissoes_filiais: null,
    allData: [], // Dados brutos importados (TODOS)
    listasFiltros: {
        mes: [],
        regional: [],
        codfilial: [],
        documento: []
    },
    charts: {
        pendenciasMensais: null
    },
    setupCompleto: false,
};

// --- FUNÇÃO DE REQUISIÇÃO (Copiada e Adaptada do banco_horas.js) ---
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
                // CORREÇÃO: Lança o erro 401 para ser pego e notificado no frontend
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
            // CORREÇÃO: Adicionando Notificação de erro antes do logout
            mostrarNotificacao("Sessão expirada ou token inválido. Redirecionando para login.", 'error', 5000);
            if(typeof logout === 'function') logout(); 
        }
        throw error; 
    }
}
// --- FIM DA FUNÇÃO DE REQUISIÇÃO ---


// --- FUNÇÕES DE INICIALIZAÇÃO E UI ---

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
    // Redireciona para a home de seleção de sistemas
    window.location.href = '../home.html'; 
}

async function initializeSupabaseAndUser() {
    showLoading(true, 'Verificando acesso...');
    
    // 1. Inicializa o cliente Supabase (ADICIONADO)
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
        // Exibe o alerta e lança o erro para o finally/catch do main
        mostrarNotificacao("Erro crítico na inicialização do Supabase.", 'error', 10000);
        throw new Error("Falha ao inicializar o cliente Supabase.");
    }
    
    // 2. Tenta obter a sessão mais fresca
    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        
        if (sessionError || !session) {
            console.error("Sessão inválida, redirecionando para login.", sessionError);
            window.location.href = '../index.html';
            return;
        }

        state.auth = session;
        // CRÍTICO: Garantir que o token mais fresco está no localStorage
        localStorage.setItem('auth_token', session.access_token); 
        
        // Buscando dados do usuário/permissão (o token no localStorage está fresco)
        const endpoint = `usuarios?select=nome,role,profile_picture_url,permissoes_filiais,email`;
        const profileResponse = await supabaseRequest(endpoint, 'GET');
        
        if (!profileResponse || profileResponse.length === 0) {
            throw new Error("Perfil de usuário não encontrado.");
        }
        const profile = profileResponse[0];
        state.currentUser = profile; // Guarda o perfil completo
        
        state.isAdmin = (profile.role === 'admin');
        state.permissoes_filiais = profile.permissoes_filiais || null;

        // --- ATUALIZA A UI COM DADOS DO USUÁRIO ---
        const userName = profile.nome || profile.email || 'Usuário';
        const userAvatar = profile.profile_picture_url || 'https://i.imgur.com/80SsE11.png'; 

        // Barra Superior
        document.getElementById('topBarUserName').textContent = userName;
        document.getElementById('topBarUserAvatar').src = userAvatar;
        // Dropdown
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
        // Se o erro não for do SupabaseRequest (que já trata o 401), lança
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

        // 1. Paginação para buscar TODOS os dados (CORREÇÃO DE LIMITE)
        while (hasMoreData) {
            const offset = currentPage * pageSize;
            const range = `&offset=${offset}&limit=${pageSize}`;

            // Usa o 'range' e pede a contagem exata na primeira requisição para estimar
            const query = `${DATA_TABLE}?select=*&order=data_criacao.desc${range}`;
            
            // Faz a requisição de dados. Não precisamos da contagem exata no header, 
            // mas o Supabase limita o range se ele for o único parâmetro de paginação.
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
                hasMoreData = false; // Parada de segurança
            }
        }

        // 2. Busca os metadados
        const metaQuery = `${META_TABLE}?id=eq.1&select=lastupdatedat&limit=1`;
        const metaRes = await supabaseRequest(metaQuery, 'GET');
        
        // CORREÇÃO CRÍTICA: Converter todas as chaves para MAIÚSCULAS
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

        // NOVO: Renderiza o gráfico de evolução geral (independente dos filtros)
        processChartPendenciasMensais(state.allData);
        
    } catch (e) {
        console.error("Falha ao carregar dados iniciais:", e);
        mostrarNotificacao(`Falha ao carregar dados: ${e.message}`, 'error');
        state.allData = [];
    } finally {
        showLoading(false);
    }
}

// Preenche os selects de filtro do dashboard e do acompanhamento
function populateFilterLists() {
    const allData = state.allData;
    const sets = {
        mes: new Set(),
        regional: new Set(),
        codfilial: new Set(),
        documento: new Set()
    };

    allData.forEach(item => {
        // CORREÇÃO: Usa a data de criação para agrupar o mês
        const mesCriacao = utils.formatDateToMonth(item.DATA_CRIACAO);
        if (mesCriacao) sets.mes.add(mesCriacao);
        if (item.REGIONAL) sets.regional.add(item.REGIONAL);
        if (item.CODFILIAL) sets.codfilial.add(item.CODFILIAL);
        if (item.DOCUMENTO) sets.documento.add(item.DOCUMENTO);
    });

    state.listasFiltros.mes = [...sets.mes].sort().reverse();
    state.listasFiltros.regional = [...sets.regional].sort();
    state.listasFiltros.codfilial = [...sets.codfilial].sort();
    state.listasFiltros.documento = [...sets.documento].sort();

    // Popula selects do Dashboard
    const mesDash = document.getElementById('filterMesDash');
    document.getElementById('filterRegionalDash').innerHTML = '<option value="">Todas as regionais</option>' + state.listasFiltros.regional.map(r => `<option value="${r}">${r}</option>`).join('');
    document.getElementById('filterCodFilialDash').innerHTML = '<option value="">Todas as filiais</option>' + state.listasFiltros.codfilial.map(f => `<option value="${f}">${f}</option>`).join('');
    
    mesDash.innerHTML = '<option value="">Todos os meses</option>';
    state.listasFiltros.mes.forEach(m => {
        // Formata para exibição (ex: 2024-05 -> Mai/2024)
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
        mesDash.value = mesReferencia; // Seta o filtro para o mês mais recente
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
    
    // Garante que o loading está desligado e a view correta é mostrada
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
    
    // Tenta fechar o overlay mobile se estiver aberto
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

        // 1. Filtra os dados conforme a UI para o Ranking/Meta
        let filteredData = state.allData;
        
        // Aplica filtros de permissão
        if (!state.isAdmin && Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
            filteredData = filteredData.filter(item => state.permissoes_filiais.includes(item.CODFILIAL));
        }

        if (mesFiltro) {
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
        if (mesFiltro && !regionalFiltro && !filialFiltro) {
            metaProgressContainer.style.display = 'block';
            processMeta(mesFiltro, filteredData); 
        } else {
            // Limpa o painel da meta se houver filtros adicionais (não faz sentido o cálculo)
            metaProgressContainer.style.display = 'none';
            // Mensagem de informação (JÁ TEM NO HTML)
        }

        // 3. Processa Ranking (usa os filtros)
        processRanking(mesFiltro, filteredData); 

        // 4. O gráfico de evolução é sempre geral (para manter a série histórica completa)
        // processChartPendenciasMensais(state.allData);
        
        feather.replace();

    } catch (e) {
        console.error(`Erro ao processar dashboard: ${e}`);
        mostrarNotificacao(`Erro ao gerar dashboard: ${e.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

function processMeta(mesReferencia, dataFiltrada) {
    // A dataFiltrada JÁ CONTÉM SOMENTE OS REGISTROS DO mesReferencia (filtrado em initializeDashboard)
    
    // Pendência: Criado no mês 'M' (já filtrado) e AINDA está aberto.
    const totalCriado = dataFiltrada.length;
    
    // Pendência: Documento criado no mês de referência E AINDA não assinado
    const pendenciasNoMes = dataFiltrada.filter(item => utils.isAberto(item));
    
    const totalPendencias = pendenciasNoMes.length;
    const percentualPendente = totalCriado > 0 ? (totalPendencias / totalCriado) * 100 : 0;
    
    const metaAtingida = percentualPendente <= META_PORCENTAGEM;
    const cor = metaAtingida ? 'text-pendencia-good' : 'text-pendencia-bad';
    const statusText = metaAtingida ? 'META ATINGIDA! 🎉' : 'NÃO ATINGIDA. 😞';
    
    // Preenche os valores
    document.getElementById('pendenciasMesAtual').textContent = totalPendencias.toLocaleString('pt-BR');
    document.getElementById('totalCriadoMesAtual').textContent = totalCriado.toLocaleString('pt-BR');
    document.getElementById('percentualPendente').textContent = `${percentualPendente.toFixed(2)}%`;
    document.getElementById('percentualPendente').className = cor;
    document.getElementById('statusMeta').innerHTML = `<span class="${cor}">${statusText}</span>`;
    
    // Preenche a barra de progresso (Inverso: quanto menor, melhor)
    let progressWidth;
    
    // A barra deve refletir o percentual de pendência até o limite da meta
    if (percentualPendente <= META_PORCENTAGEM) {
        // Se abaixo da meta (bom), a barra reflete o quão longe está da meta (ex: 1% de 3% é 66%)
        progressWidth = Math.min(100, 100 - (percentualPendente / META_PORCENTAGEM) * 100); 
    } else {
        // Se acima da meta (ruim), a barra reflete o quanto ultrapassou
        // 100% da barra é 2*META_PORCENTAGEM para dar uma visualização de "ultrapassagem"
        progressWidth = Math.min(100, (percentualPendente / (META_PORCENTAGEM * 2)) * 100); 
    }
    
    const progressFill = document.getElementById('progressFillMeta');
    // CORREÇÃO: Progressão Inversa (quanto menor o %, mais a barra VERDE deve estar cheia)
    if (metaAtingida) {
         progressWidth = Math.min(100, 100 - (percentualPendente / META_PORCENTAGEM) * 100);
    } else {
        // Barra vermelha, enchendo conforme ultrapassa a meta
        progressWidth = Math.min(100, percentualPendente * 100 / (META_PORCENTAGEM * 2));
    }

    progressFill.style.width = `${progressWidth}%`;
    progressFill.className = `progress-fill-pendencias ${metaAtingida ? 'good' : 'bad'}`;
}

// CORREÇÃO: processChartPendenciasMensais agora aceita dados como argumento
function processChartPendenciasMensais(data) {
    const dadosAgregados = data.reduce((acc, item) => {
        // CORREÇÃO: Garante que o mês é obtido da DATA_CRIACAO
        const mesCriacao = utils.formatDateToMonth(item.DATA_CRIACAO);
        
        if (!mesCriacao) return acc;
        
        if (!acc[mesCriacao]) {
            acc[mesCriacao] = { total: 0, pendentes: 0 };
        }
        
        acc[mesCriacao].total++;
        
        // CORREÇÃO: Pendência é se AINDA está em aberto (snapshot do banco)
        if (utils.isAberto(item)) { 
             acc[mesCriacao].pendentes++;
        }
        
        return acc;
    }, {});
    
    // CORREÇÃO: Garante que os meses estão em ordem cronológica (sort)
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

    // Se o gráfico existir, destrói
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
                    backgroundColor: 'rgba(216, 59, 94, 0.8)', 
                    borderColor: 'rgba(216, 59, 94, 1)',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: '% Pendente',
                    data: dataPercentual,
                    type: 'line',
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
                    suggestedMax: 20 // Sugere um máximo para o %
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

// CORREÇÃO: processRanking agora aceita a data filtrada para o cálculo
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
        // Pendência: Documento criado no mês de referência (já filtrado) E AINDA não assinado
        if (utils.isAberto(item)) {
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
    tbody.innerHTML = '';
    
    if (rankedData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-gray-500">Nenhum dado para exibir no ranking.</td></tr>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    rankedData.forEach(item => {
        const tr = document.createElement('tr');
        const corIndice = item.percentualPendente > META_PORCENTAGEM ? 'pendencia-alta' : 'pendencia-baixa';
        
        tr.innerHTML = `
            <td style="text-align: center;">${item.filial}</td>
            <td style="text-align: center;">${item.regional}</td>
            <td style="text-align: right; font-family: monospace;">${item.totalDocumentos.toLocaleString('pt-BR')}</td>
            <td style="text-align: right; font-family: monospace;">${item.totalPendente.toLocaleString('pt-BR')}</td>
            <td style="text-align: right; font-family: monospace;" class="${corIndice}">${item.percentualPendente.toFixed(2)}%</td>
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
    // CORREÇÃO: Renderiza apenas as colunas em COLUMN_ORDER
    COLUMN_ORDER.forEach(key => {
        const th = document.createElement('th');
        th.textContent = COLUMN_MAP[key] || key;
        // NOVO: Centralização para as colunas importantes
        if (['CODFILIAL', 'DATA_CRIACAO', 'DATA_ASSINATURA', 'DESC_STATUS'].includes(key)) {
            th.style.textAlign = 'center';
        }
        tr.appendChild(th);
    });
    const thDays = document.createElement('th');
    thDays.textContent = 'Dias Pendente';
    thDays.style.textAlign = 'center'; // Centraliza o cabeçalho
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

    // Filtra por quem AINDA está aberto
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
    
    // Calcula os dias pendentes e ordena por quem está pendente há mais tempo
    const dataComDias = data.map(item => {
        // CORREÇÃO: Usa o item.DATA_CRIACAO que JÁ está no formato ISO (se o parsePastedData rodou)
        const dataCriacao = item.DATA_CRIACAO ? new Date(item.DATA_CRIACAO + 'T00:00:00Z') : null;
        const diasPendente = dataCriacao ? utils.diffInDays(dataCriacao, new Date()) : 0;
        return { ...item, diasPendente };
    }).sort((a, b) => b.diasPendente - a.diasPendente);

    const fragment = document.createDocumentFragment();

    dataComDias.forEach(item => {
        const tr = document.createElement('tr');
        
        let diasClass = 'text-gray-500';
        // 3 dias ou mais = vermelho/bad
        if (item.diasPendente >= 3) {
            diasClass = 'diff-pendencia-bad'; 
        } else if (item.diasPendente >= 1) {
             diasClass = 'diff-pendencia-good'; 
        }

        // CORREÇÃO: Renderiza apenas as colunas definidas em COLUMN_ORDER
        COLUMN_ORDER.forEach(key => {
            const td = document.createElement('td');
            let value = item[key] || '-';
            
            // AJUSTE CRÍTICO: Formatação de Data para DD/MM/YYYY
            if (key.includes('DATA_')) {
                value = utils.formatToBR(value); // Converte o ISO para DD/MM/YYYY
                td.style.fontFamily = 'monospace';
                td.style.fontSize = '0.85rem';
                td.style.textAlign = 'center';
            }
            
            // Centralização/Alinhamento adicional
            if (['CODFILIAL', 'CHAPA', 'DESC_STATUS'].includes(key)) {
                td.style.textAlign = 'center';
            } else if (['NOME', 'DOCUMENTO', 'FUNCAO'].includes(key)) {
                 td.style.whiteSpace = 'normal';
            }
            
            td.textContent = value;
            tr.appendChild(td);
        });

        const tdDays = document.createElement('td');
        // CORREÇÃO: Aplica a classe de cor de pendência e centraliza
        tdDays.innerHTML = `<strong class="${diasClass}">${item.diasPendente}</strong>`;
        tdDays.style.textAlign = 'center';
        tr.appendChild(tdDays);
        
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
}


// --- FUNÇÕES DE CONFIGURAÇÃO (IMPORT) ---

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
    // CORREÇÃO: Usa as colunas do COLUMN_ORDER (sem Bandeira/Regional)
    const headers = COLUMN_ORDER; 
    
    let tableHTML = '<table class="tabela"><thead><tr>';
    headers.forEach(key => {
        tableHTML += `<th>${COLUMN_MAP[key] || key}</th>`;
    });
    tableHTML += '</tr></thead><tbody>';

    previewData.forEach(item => {
        tableHTML += '<tr>';
        headers.forEach(key => {
            // CORREÇÃO: Formata a data para a pré-visualização também
            let value = item[key] || '-';
            if (key.includes('DATA_')) {
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
        'BANDEIRA', 'REGIONAL', 'CODFILIAL', 'DOCUMENTO', 'CHAPA', 'NOME', 'FUNCAO', 
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
                // CORREÇÃO: Mapeia o valor para a chave em MAIÚSCULAS
                obj[header] = values[index] || null; 
            }
        });
        
        // ** NOVO: Conversão de Datas (DD/MM/YYYY para ISO YYYY-MM-DD)**
        if (obj.DATA_CRIACAO) {
            obj.DATA_CRIACAO = utils.formatToISO(obj.DATA_CRIACAO) || obj.DATA_CRIACAO;
        }
        if (obj.DATA_ASSINATURA) {
            obj.DATA_ASSINATURA = utils.formatToISO(obj.DATA_ASSINATURA) || obj.DATA_ASSINATURA;
        }

        // Validação Mínima: Requer CHAPA e DATA_CRIACAO
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
    
    console.log("Token de autenticação encontrado e será enviado.");


    try {
        const response = await fetch(IMPORT_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}` 
            },
            // O newData tem as chaves em MAIÚSCULAS no formato correto (incluindo as datas ISO)
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


// --- INICIALIZAÇÃO E EVENTOS ---

document.addEventListener('DOMContentLoaded', () => {
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
