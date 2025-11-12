// Configuração do Supabase (baseado nos seus outros módulos)
const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8';
const SUPABASE_PROXY_URL = '/api/proxy'; // Usando o proxy

// Define o adaptador para sessionStorage
const sessionStorageAdapter = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

let supabaseClient = null;

// Estado global básico
const state = {
    auth: null,
    userId: null,
    isAdmin: false,
    permissoes_filiais: null,
    userMatricula: null,
    userNome: 'Usuário',
    // Cache de dados do módulo
    meuTime: [],
    disponiveis: [],
    gestorConfig: [],
    todasAsFuncoes: [] // NOVO: Cache para todas as funções
};

// --- Funções de UI (Idênticas aos outros módulos) ---

function showLoading(show, text = 'Processando...') {
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    if (loading && loadingText) {
        loadingText.textContent = text;
        loading.style.display = show ? 'flex' : 'none';
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
    
    if (supabaseClient) {
        supabaseClient.auth.signOut().then(() => {
            window.location.href = '../home.html';
        }).catch((error) => {
            console.error("Erro ao sair:", error);
            window.location.href = '../home.html';
        });
    } else {
        window.location.href = '../home.html';
    }
}

// --- Função de Navegação (Atualizada com lógica) ---
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
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileDropdown) profileDropdown.classList.remove('open');
    
    // Lógica específica da view
    try {
        switch (viewId) {
            case 'meuTimeView':
                // Funções que usam os dados carregados no state
                updateDashboardStats(state.meuTime);
                populateFilters(state.meuTime);
                applyFilters(); // Renderiza a tabela inicial
                break;
            case 'transferirView':
                // (Ainda a implementar)
                break;
            case 'atualizarQLPView':
                // (Ainda a implementar)
                break;
            case 'configuracoesView':
                // Renderiza a tabela de config
                renderGestorConfigTable(state.gestorConfig);
                // NOVO: Popula o dropdown
                populateConfigFuncaoDropdown(state.todasAsFuncoes, state.gestorConfig);
                break;
        }
    } catch(e) {
        console.error(`Erro ao carregar view ${viewId}:`, e);
    }
    
    feather.replace();
}

// --- Função de Requisição (Proxy) ---
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
                throw new Error("Não autorizado. Sua sessão pode ter expirada.");
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

// --- Funções de Lógica do Módulo (NOVAS E ATUALIZADAS) ---

/**
 * Carrega os dados essenciais do módulo (config, time, disponíveis e funções)
 * Chamado uma vez durante a inicialização.
 */
async function loadModuleData() {
    // Se não tiver matrícula, não pode ser gestor, pula o carregamento
    if (!state.userMatricula && !state.isAdmin) {
        console.warn("Usuário sem matrícula, não pode carregar dados de gestor.");
        return;
    }
    
    showLoading(true, 'Carregando dados do time...');
    
    try {
        // ATUALIZADO: Carrega o time, disponíveis, config E todas as funções
        const [configRes, timeRes, disponiveisRes, funcoesRes] = await Promise.allSettled([
            // 1. Busca a tabela de configuração (para admins)
            supabaseRequest('tabela_gestores_config?select=*', 'GET'),
            // 2. Busca o time direto do gestor
            supabaseRequest(`colaboradores?select=*&GESTOR_CHAPA=eq.${state.userMatricula}`, 'GET'),
            // 3. Busca colaboradores "novatos" ou "sem gestor"
            supabaseRequest(`colaboradores?select=CHAPA,NOME,FUNCAO&or=(GESTOR_CHAPA.is.null,STATUS.eq.novato)`, 'GET'),
            // 4. NOVO: Busca todas as funções únicas usando a função RPC
            supabaseRequest('rpc/get_distinct_funcoes', 'POST')
        ]);

        if (configRes.status === 'fulfilled' && configRes.value) {
            state.gestorConfig = configRes.value;
        } else {
            console.error("Erro ao carregar config:", configRes.reason);
        }

        if (timeRes.status === 'fulfilled' && timeRes.value) {
            state.meuTime = timeRes.value;
        } else {
            console.error("Erro ao carregar time:", timeRes.reason);
        }
        
        if (disponiveisRes.status === 'fulfilled' && disponiveisRes.value) {
            state.disponiveis = disponiveisRes.value;
        } else {
            console.error("Erro ao carregar disponíveis:", disponiveisRes.reason);
        }
        
        // NOVO: Armazena todas as funções
        if (funcoesRes.status === 'fulfilled' && funcoesRes.value) {
            // A RPC retorna [{funcao_distinta: 'A'}, {funcao_distinta: 'B'}]
            state.todasAsFuncoes = funcoesRes.value.map(f => f.funcao_distinta);
        } else {
            console.error("Erro ao carregar funções:", funcoesRes.reason);
        }
        
    } catch (err) {
        console.error("Erro fatal no loadModuleData:", err);
    } finally {
        showLoading(false);
    }
}

/**
 * Mostra a view de setup pela primeira vez.
 */
function iniciarDefinicaoDeTime() {
    console.log("Iniciando definição de time...");
    // Esconde todas as views
    document.querySelectorAll('.view-content').forEach(view => {
        view.classList.remove('active');
        view.classList.add('hidden'); // Garante que todas sumam
    });
    
    // Mostra a view de setup
    const setupView = document.getElementById('primeiroAcessoView');
    setupView.classList.remove('hidden');
    setupView.classList.add('active'); // Torna ativa
    
    // Trava a sidebar para forçar o setup
    const sidebar = document.querySelector('.sidebar');
    sidebar.style.pointerEvents = 'none';
    sidebar.style.opacity = '0.7';

    // Popula as listas
    // O time inicial (state.meuTime) estará vazio
    renderListasTimes(state.disponiveis, state.meuTime);
    
    feather.replace();
}

/**
 * Renderiza as duas listas (Disponíveis e Meu Time)
 */
function renderListasTimes(disponiveis, meuTime) {
    const listaDisponiveisEl = document.getElementById('listaDisponiveis');
    const listaMeuTimeEl = document.getElementById('listaMeuTime');
    
    listaDisponiveisEl.innerHTML = '';
    listaMeuTimeEl.innerHTML = '';
    
    // Filtra disponíveis para não mostrar quem JÁ ESTÁ no meu time (caso de 'novato' que já foi pego)
    const chapasMeuTime = new Set(meuTime.map(c => c.CHAPA));
    const disponiveisFiltrados = disponiveis.filter(c => !chapasMeuTime.has(c.CHAPA));

    disponiveisFiltrados.forEach(c => {
        listaDisponiveisEl.innerHTML += `<option value="${c.CHAPA}">${c.NOME} (${c.CHAPA}) - ${c.FUNCAO || 'N/A'}</option>`;
    });
    
    meuTime.forEach(c => {
        listaMeuTimeEl.innerHTML += `<option value="${c.CHAPA}">${c.NOME} (${c.CHAPA}) - ${c.FUNCAO || 'N/A'}</option>`;
    });
}

/**
 * Move itens selecionados de uma lista para outra
 */
function moverColaboradores(origemEl, destinoEl) {
    const selecionados = Array.from(origemEl.selectedOptions);
    selecionados.forEach(option => {
        destinoEl.appendChild(option);
    });
}

/**
 * Filtra a lista de disponíveis baseado no input de busca
 */
function filtrarDisponiveis() {
    const filtro = document.getElementById('searchDisponiveis').value.toLowerCase();
    const listaDisponiveisEl = document.getElementById('listaDisponiveis');
    
    Array.from(listaDisponiveisEl.options).forEach(option => {
        const texto = option.textContent.toLowerCase();
        if (texto.includes(filtro)) {
            option.style.display = '';
        } else {
            option.style.display = 'none';
        }
    });
}

/**
 * Salva o time no banco de dados (Passo 3 da funcionalidade)
 */
async function handleSalvarTime() {
    showLoading(true, 'Salvando seu time...');
    const listaMeuTimeEl = document.getElementById('listaMeuTime');
    const chapasSelecionadas = Array.from(listaMeuTimeEl.options).map(opt => opt.value);
    
    if (chapasSelecionadas.length === 0) {
        mostrarNotificacao('Selecione pelo menos um colaborador para o seu time.', 'warning');
        showLoading(false);
        return;
    }

    try {
        // Cria um array de Promises, uma para cada colaborador a ser atualizado
        const promessas = chapasSelecionadas.map(chapa => {
            const payload = {
                GESTOR_CHAPA: state.userMatricula,
                STATUS: 'ativo' // Tira do status 'novato'
            };
            // Usamos o CHAPA como chave de update
            return supabaseRequest(`colaboradores?CHAPA=eq.${chapa}`, 'PATCH', payload);
        });

        // Executa todas as atualizações em paralelo
        await Promise.all(promessas);

        mostrarNotificacao('Time salvo com sucesso! Recarregando o sistema...', 'success');
        
        // Recarrega a página para o initializeApp rodar novamente com o time definido
        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (err) {
        mostrarNotificacao(`Erro ao salvar: ${err.message}`, 'error');
        showLoading(false);
    }
}


/**
 * Atualiza os 4 cards do dashboard com base nos dados do time.
 */
function updateDashboardStats(data) {
    if (!data) data = [];
    const total = data.length;
    const ativos = data.filter(c => c.STATUS === 'ativo').length;
    const inativos = data.filter(c => c.STATUS === 'inativo').length;
    const novatos = data.filter(c => c.STATUS === 'novato').length;
    
    document.getElementById('statTotalTime').textContent = total;
    document.getElementById('statAtivos').textContent = ativos;
    document.getElementById('statInativos').textContent = inativos;
    document.getElementById('statNovatos').textContent = novatos;
}

/**
 * Preenche os <select> de filtro com base nos dados do time.
 */
function populateFilters(data) {
    if (!data) data = [];
    const filialSelect = document.getElementById('filterFilial');
    const funcaoSelect = document.getElementById('filterFuncao');
    
    const filiais = [...new Set(data.map(c => c.CODFILIAL).filter(Boolean))].sort();
    const funcoes = [...new Set(data.map(c => c.FUNCAO).filter(Boolean))].sort();
    
    filialSelect.innerHTML = '<option value="">Todas as filiais</option>';
    funcaoSelect.innerHTML = '<option value="">Todas as funções</option>';
    
    filiais.forEach(f => filialSelect.innerHTML += `<option value="${f}">${f}</option>`);
    funcoes.forEach(f => funcaoSelect.innerHTML += `<option value="${f}">${f}</option>`);
}

/**
 * Renderiza a tabela principal de "Meu Time"
 */
function renderMeuTimeTable(data) {
    const tbody = document.getElementById('tableBodyMeuTime');
    const message = document.getElementById('tableMessageMeuTime');
    tbody.innerHTML = '';

    if (data.length === 0) {
        message.classList.remove('hidden');
        if (state.meuTime.length === 0) { // Se o cache original está vazio
             tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-gray-500">Seu time ainda não possui colaboradores vinculados.</td></tr>';
        } else { // Se o cache tem dados, mas o filtro limpou
             tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-gray-500">Nenhum colaborador encontrado para os filtros aplicados.</td></tr>';
        }
        return;
    }
    
    message.classList.add('hidden');

    const fragment = document.createDocumentFragment();
    data.forEach(item => {
        const tr = document.createElement('tr');
        
        const dtAdmissao = item.DT_ADMISSAO ? new Date(item.DT_ADMISSAO).toLocaleDateString('pt-BR') : '-';
        const status = item.STATUS || 'ativo';
        let statusClass = 'status-ativo';
        if (status === 'inativo') statusClass = 'status-inativo';
        if (status === 'novato') statusClass = 'status-aviso'; // Reutilizando a cor 'aviso'

        tr.innerHTML = `
            <td>${item.NOME || '-'}</td>
            <td>${item.CHAPA || '-'}</td>
            <td>${item.FUNCAO || '-'}</td>
            <td>${item.SECAO || '-'}</td>
            <td>${item.CODFILIAL || '-'}</td>
            <td>${dtAdmissao}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td class="actions">
                <button class="btn btn-sm btn-info" title="Visualizar Perfil (em breve)">
                    <i data-feather="eye" class="h-4 w-4"></i>
                </button>
                <button class="btn btn-sm btn-warning" title="Transferir (em breve)">
                    <i data-feather="repeat" class="h-4 w-4"></i>
                </button>
            </td>
        `;
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
    feather.replace();
}

/**
 * Aplica os filtros da UI na tabela "Meu Time"
 */
function applyFilters() {
    const nomeFiltro = document.getElementById('filterNome').value.toLowerCase();
    const filialFiltro = document.getElementById('filterFilial').value;
    const funcaoFiltro = document.getElementById('filterFuncao').value;
    const statusFiltro = document.getElementById('filterStatus').value;
    
    const filteredData = state.meuTime.filter(item => {
        const nomeChapaMatch = nomeFiltro === '' || 
            (item.NOME && item.NOME.toLowerCase().includes(nomeFiltro)) ||
            (item.CHAPA && item.CHAPA.toLowerCase().includes(nomeFiltro));
        
        const filialMatch = filialFiltro === '' || item.CODFILIAL === filialFiltro;
        const funcaoMatch = funcaoFiltro === '' || item.FUNCAO === funcaoFiltro;
        const statusMatch = statusFiltro === '' || (item.STATUS || 'ativo') === statusFiltro;
        
        return nomeChapaMatch && filialMatch && funcaoMatch && statusMatch;
    });
    
    renderMeuTimeTable(filteredData);
}

/**
 * Renderiza a tabela de Configuração de Gestores (Admin)
 */
function renderGestorConfigTable(data) {
    const tbody = document.getElementById('tableBodyGestorConfig');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-10 text-gray-500">Nenhuma regra de gestão configurada.</td></tr>';
        return;
    }

    // Ordena por nível
    data.sort((a, b) => a.NIVEL_HIERARQUIA - b.NIVEL_HIERARQUIA);

    data.forEach(item => {
        const tr = document.createElement('tr');
        const podeGestorText = item.PODE_SER_GESTOR ? 'Sim' : 'Não';
        const podeGestorClass = item.PODE_SER_GESTOR ? 'status-ativo' : 'status-inativo';

        tr.innerHTML = `
            <td>${item.FUNCAO}</td>
            <td><span class="status-badge ${podeGestorClass}">${podeGestorText}</span></td>
            <td>${item.NIVEL_HIERARQUIA}</td>
            <td class="actions">
                <button class="btn btn-sm btn-danger" title="Excluir Regra (em breve)">
                    <i data-feather="trash-2" class="h-4 w-4"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    feather.replace();
}

// ====================================================================
// NOVAS FUNÇÕES: Lógica da Aba Configurações
// ====================================================================

/**
 * Popula o dropdown de Funções na aba Configurações.
 * Mostra apenas as funções que AINDA NÃO ESTÃO na tabela de config.
 */
function populateConfigFuncaoDropdown(todasAsFuncoes, gestorConfig) {
    const select = document.getElementById('configFuncaoSelect');
    if (!select) return;

    // Cria um Set (lista rápida) das funções que já foram configuradas
    const funcoesConfiguradas = new Set(gestorConfig.map(c => c.FUNCAO));
    
    // Filtra 'todasAsFuncoes' para mostrar apenas as que não estão no Set
    const funcoesDisponiveis = todasAsFuncoes.filter(f => !funcoesConfiguradas.has(f));
    
    select.innerHTML = ''; // Limpa
    
    if (funcoesDisponiveis.length === 0) {
        select.innerHTML = '<option value="">Nenhuma nova função a configurar</option>';
        return;
    }
    
    select.innerHTML = '<option value="">Selecione uma função...</option>';
    funcoesDisponiveis.forEach(funcao => {
        select.innerHTML += `<option value="${funcao}">${funcao}</option>`;
    });
}

/**
 * Salva a nova regra de gestão no banco de dados.
 */
async function handleSalvarConfig() {
    const funcao = document.getElementById('configFuncaoSelect').value;
    const nivel = document.getElementById('configNivel').value;
    const podeGestor = document.getElementById('configPodeSerGestor').value === 'true';

    if (!funcao || !nivel) {
        mostrarNotificacao('Por favor, selecione uma função e defina um nível.', 'warning');
        return;
    }
    
    const payload = {
        FUNCAO: funcao,
        PODE_SER_GESTOR: podeGestor,
        NIVEL_HIERARQUIA: parseInt(nivel)
    };
    
    showLoading(true, 'Salvando regra...');
    
    try {
        const resultado = await supabaseRequest('tabela_gestores_config', 'POST', payload);
        
        if (resultado && resultado.length > 0) {
            // Atualiza o cache local
            state.gestorConfig.push(resultado[0]);
            
            // Limpa o formulário
            document.getElementById('configFuncaoSelect').value = '';
            document.getElementById('configNivel').value = '';
            document.getElementById('configPodeSerGestor').value = 'true';
            
            // Re-renderiza a tabela e o dropdown
            renderGestorConfigTable(state.gestorConfig);
            populateConfigFuncaoDropdown(state.todasAsFuncoes, state.gestorConfig);
            
            mostrarNotificacao('Nova regra de gestão salva!', 'success');
        } else {
            throw new Error('O servidor não retornou dados após salvar.');
        }

    } catch (err) {
        mostrarNotificacao(`Erro ao salvar: ${err.message}`, 'error');
    } finally {
        showLoading(false);
    }
}


// --- Inicialização ---
async function initializeApp() {
    showLoading(true, 'Conectando...');
    try {
        // 1. Inicializa o Supabase
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                storage: sessionStorageAdapter,
                persistSession: true,
                autoRefreshToken: true
            }
        });
        
        // 2. Verifica a Sessão
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError || !session) {
            console.error("Sem sessão, redirecionando para login.", sessionError);
            window.location.href = '../home.html';
            return;
        }
        
        state.auth = session;
        localStorage.setItem('auth_token', session.access_token);
        
        // 3. Busca o Perfil do Usuário
        const endpoint = `usuarios?auth_user_id=eq.${state.auth.user.id}&select=nome,role,profile_picture_url,permissoes_filiais,matricula,email`;
        const profileResponse = await supabaseRequest(endpoint, 'GET');
        
        if (!profileResponse || profileResponse.length === 0) {
             throw new Error("Perfil de usuário não encontrado.");
        }
        
        const profile = profileResponse[0];
        state.userId = state.auth.user.id;
        state.isAdmin = (profile.role === 'admin');
        state.userMatricula = profile.matricula || null;
        state.permissoes_filiais = profile.permissoes_filiais || null;
        state.userNome = profile.nome || session.user.email.split('@')[0];

        // Atualizar UI
        document.getElementById('topBarUserName').textContent = state.userNome;
        document.getElementById('dropdownUserName').textContent = state.userNome;
        document.getElementById('dropdownUserEmail').textContent = profile.email || session.user.email;
        if (profile.profile_picture_url) {
            document.getElementById('topBarUserAvatar').src = profile.profile_picture_url;
        }
        document.getElementById('gestorNameLabel').textContent = `${state.userNome} (Chapa: ${state.userMatricula || 'N/A'})`;
        document.getElementById('dashGestorName').textContent = `${state.userNome} (${state.userMatricula || 'N/A'})`;
        
        // Mostrar links de Admin se for admin
        if(state.isAdmin) {
            document.getElementById('adminLinks').classList.remove('hidden');
            document.getElementById('adminConfigLink').style.display = 'block';
            document.getElementById('adminUpdateLink').style.display = 'block';
        }
        
        // Carrega TODOS os dados (time, disponíveis, config, funções)
        await loadModuleData();
        
        document.getElementById('appShell').style.display = 'flex';
        document.body.classList.add('system-active');
        
        // ATUALIZADO: Decide qual view mostrar
        if (state.meuTime.length === 0 && !state.isAdmin) {
            // Se o time está vazio E não é admin, força o setup
            iniciarDefinicaoDeTime();
        } else {
            // Se o time já existe (ou é admin), carrega a view do hash
            handleHashChange();
        }

    } catch (err) {
        console.error("Erro fatal na inicialização:", err);
        showLoading(false);
        if (!err.message.includes("Sessão expirada")) {
            mostrarNotificacao(`Erro ao carregar: ${err.message}`, 'error', 10000);
        }
    } finally {
        showLoading(false);
    }
}

function handleHashChange() {
    if (!state.auth) return;
    
    const hash = window.location.hash || '#meuTime';
    let viewId = 'meuTimeView';
    let navElement = document.querySelector('a[href="#meuTime"]');

    const cleanHash = hash.substring(1);
    const newViewId = cleanHash + 'View';
    const newNavElement = document.querySelector(`a[href="${hash}"]`);

    if (document.getElementById(newViewId)) {
        // *** NOVO CHECK ***
        // Se o time está vazio, não deixa navegar para "Meu Time"
        if (newViewId === 'meuTimeView' && state.meuTime.length === 0 && !state.isAdmin) {
            console.warn("Time vazio, forçando setup.");
            iniciarDefinicaoDeTime();
            return; // Impede a navegação
        }

        // Verificar permissão de admin para views restritas
        const isAdminView = newViewId === 'configuracoesView' || newViewId === 'atualizarQLPView';
        if (isAdminView && !state.isAdmin) {
            mostrarNotificacao('Acesso negado. Você precisa ser administrador.', 'error');
            // Recarrega a view padrão
            showView('meuTimeView', document.querySelector('a[href="#meuTime"]'));
            return;
        }
        viewId = newViewId;
        navElement = newNavElement;
    }
    
    const currentActive = document.querySelector('.view-content.active');
    if (!currentActive || currentActive.id !== viewId) {
        showView(viewId, navElement);
    }
}

// --- Event Listeners da UI ---
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    
    window.addEventListener('hashchange', handleHashChange);
    
    // Links da Sidebar
    document.querySelectorAll('.sidebar .nav-item[href]').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('#') && href.length > 1) {
                e.preventDefault();
                if (window.location.hash !== href) {
                    window.location.hash = href;
                } else {
                    // Se já está na view, força a chamada
                    handleHashChange();
                }
            }
        });
    });

    // Logout
    document.getElementById('logoutButton').addEventListener('click', logout);
    // (logoutLink já está coberto pelo seletor acima)
    
    // Dropdown de Perfil
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
    
    // Toggle da Sidebar
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
    
    // Listeners para os filtros
    document.getElementById('filterNome').addEventListener('input', applyFilters);
    document.getElementById('filterFilial').addEventListener('change', applyFilters);
    document.getElementById('filterFuncao').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);

    // Listeners para a tela de Setup
    document.getElementById('searchDisponiveis').addEventListener('input', filtrarDisponiveis);
    document.getElementById('btnAdicionar').addEventListener('click', () => {
        moverColaboradores(document.getElementById('listaDisponiveis'), document.getElementById('listaMeuTime'));
    });
    document.getElementById('btnRemover').addEventListener('click', () => {
        moverColaboradores(document.getElementById('listaMeuTime'), document.getElementById('listaDisponiveis'));
    });
    document.getElementById('btnSalvarTime').addEventListener('click', handleSalvarTime);
    
    // NOVO: Listener para salvar Configuração
    document.getElementById('btnSalvarConfig').addEventListener('click', handleSalvarConfig);

    feather.replace();
});
