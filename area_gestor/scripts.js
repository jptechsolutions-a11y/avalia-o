// Configuração do Supabase (baseado nos seus outros módulos)
const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8';
const SUPABASE_PROXY_URL = '/api/proxy';

let supabaseClient = null;
const sessionStorageAdapter = {
    getItem: (key) => sessionStorage.getItem(key),
    setItem: (key, value) => sessionStorage.setItem(key, value),
    removeItem: (key) => sessionStorage.removeItem(key),
};

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
    disponiveis: [], // NOVO: Cache para colaboradores disponíveis
    gestorConfig: []
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
        console.error("Token JWT não encontrado, deslogando.");
        logout();
        throw new Error("Sessão expirada. Faça login novamente.");
    }
    
    const url = `${SUPABASE_PROXY_URL}?endpoint=${encodeURIComponent(endpoint)}`;
    const config = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`, 
            'Prefer': 'return=representation',
            ...headers 
        }
    };
    if (body) config.body = JSON.stringify(body);

    try {
        const response = await fetch(url, config);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            const errorMessage = errorData.message || errorData.details || errorData.error || `Erro ${response.status}`;
            throw new Error(errorMessage);
        }
        if (response.status === 204) return null;
        return await response.json();
    } catch (error) {
        console.error("Erro na supabaseRequest:", error.message);
        if (error.message.includes("401") || error.message.toLowerCase().includes("jwt expired")) {
            mostrarNotificacao("Sua sessão expirou. Faça login novamente.", "error");
            logout();
        }
        throw error; 
    }
}

// --- Funções de Lógica do Módulo (NOVAS E ATUALIZADAS) ---

/**
 * Carrega os dados essenciais do módulo (config, time e disponíveis)
 * Chamado uma vez durante a inicialização.
 */
async function loadModuleData() {
    if (!state.userMatricula && !state.isAdmin) {
        mostrarNotificacao('Você não é um gestor configurado (sem matrícula).', 'warning');
        document.getElementById('tableBodyMeuTime').innerHTML = '<tr><td colspan="8" class="text-center py-10 text-gray-500">Você não parece ser um gestor. Matrícula de usuário não encontrada.</td></tr>';
        return;
    }
    
    showLoading(true, 'Carregando dados do time...');
    
    try {
        // ATUALIZADO: Carrega o time E os disponíveis em paralelo
        const [configRes, timeRes, disponiveisRes] = await Promise.allSettled([
            // 1. Busca a tabela de configuração (para admins)
            supabaseRequest('tabela_gestores_config?select=*', 'GET'),
            // 2. Busca o time direto do gestor
            supabaseRequest(`colaboradores?select=*&GESTOR_CHAPA=eq.${state.userMatricula}`, 'GET'),
            // 3. Busca colaboradores "novatos" ou "sem gestor"
            supabaseRequest(`colaboradores?select=CHAPA,NOME,FUNCAO&or=(GESTOR_CHAPA.is.null,STATUS.eq.novato)`, 'GET')
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
        
        // NOVO: Armazena os disponíveis
        if (disponiveisRes.status === 'fulfilled' && disponiveisRes.value) {
            state.disponiveis = disponiveisRes.value;
        } else {
            console.error("Erro ao carregar disponíveis:", disponiveisRes.reason);
        }
        
    } catch (err) {
        mostrarNotificacao(`Erro ao carregar dados: ${err.message}`, 'error');
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
    
    document.getElementById('statTotalColab').textContent = total;
    document.getElementById('statAtivos').textContent = ativos;
    document.getElementById('statNovatos').textContent = novatos;
    document.getElementById('statInativos').textContent = inativos;
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

    // Guarda os valores antigos para não resetar a seleção
    const oldFilial = filialSelect.value;
    const oldFuncao = funcaoSelect.value;

    filialSelect.innerHTML = '<option value="">Todas as filiais</option>';
    funcaoSelect.innerHTML = '<option value="">Todas as funções</option>';
    
    filiais.forEach(f => filialSelect.innerHTML += `<option value="${f}">${f}</option>`);
    funcoes.forEach(f => funcaoSelect.innerHTML += `<option value="${f}">${f}</option>`);

    // Restaura os valores
    filialSelect.value = oldFilial;
    funcaoSelect.value = oldFuncao;
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
    data.forEach(c => {
        const tr = document.createElement('tr');
        
        let dtAdmissao = 'N/A';
        if (c.DT_ADMISSAO) {
            try {
                // Tenta formatar a data. Assume que pode ser YYYY-MM-DD
                const dataObj = new Date(c.DT_ADMISSAO + 'T00:00:00Z'); // Adiciona T00:00:00Z para tratar como UTC
                dtAdmissao = dataObj.toLocaleDateString('pt-BR');
            } catch(e) { 
                dtAdmissao = c.DT_ADMISSAO; // Fallback se a data for inválida
            }
        }
        
        const status = c.STATUS || 'ativo';
        let statusClass = 'status-ativo';
        if (status === 'inativo') statusClass = 'status-inativo';
        if (status === 'novato') statusClass = 'status-aviso'; // Reusa a cor amarela (aviso)

        tr.innerHTML = `
            <td>${c.NOME || 'N/A'}</td>
            <td>${c.CHAPA || 'N/A'}</td>
            <td>${c.FUNCAO || 'N/A'}</td>
            <td>${c.SECAO || 'N/A'}</td>
            <td>${dtAdmissao}</td>
            <td>${c.CODFILIAL || 'N/A'}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td class="actions">
                <button class="btn btn-sm btn-info" onclick="/* showDetails('${c.CHAPA}') */" title="Ver Detalhes">
                    <i data-feather="eye" class="h-4 w-4"></i>
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

    let filteredData = state.meuTime;

    if (nomeFiltro) {
        filteredData = filteredData.filter(c => 
            (c.NOME && c.NOME.toLowerCase().includes(nomeFiltro)) ||
            (c.CHAPA && String(c.CHAPA).toLowerCase().includes(nomeFiltro))
        );
    }
    if (filialFiltro) {
        filteredData = filteredData.filter(c => c.CODFILIAL === filialFiltro);
    }
    if (funcaoFiltro) {
        filteredData = filteredData.filter(c => c.FUNCAO === funcaoFiltro);
    }
    if (statusFiltro) {
        filteredData = filteredData.filter(c => c.STATUS === statusFiltro);
    }
    
    renderMeuTimeTable(filteredData);
}

/**
 * Renderiza a tabela de Configuração de Gestores (Admin)
 */
function renderGestorConfigTable(data) {
    const tbody = document.getElementById('tableBodyGestorConfig');
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5">Nenhum dado de configuração carregado.</td></tr>';
        return;
    }
    data.sort((a,b) => a.NIVEL_HIERARQUIA - b.NIVEL_HIERARQUIA); // Ordenar por nível
    data.forEach(config => {
        tbody.innerHTML += `
            <tr>
                <td>${config.FUNCAO}</td>
                <td>${config.PODE_SER_GESTOR ? '<span class="status-badge status-ativo">Sim</span>' : '<span class="status-badge status-inativo">Não</span>'}</td>
                <td>${config.NIVEL_HIERARQUIA}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="/* editConfig('${config.FUNCAO}') */" title="Editar">
                        <i data-feather="edit-2" class="h-4 w-4"></i>
                    </button>
                     <button class="btn btn-sm btn-danger" onclick="/* deleteConfig('${config.FUNCAO}') */" title="Excluir">
                        <i data-feather="trash-2" class="h-4 w-4"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    feather.replace();
}


// --- Inicialização ---
async function initializeApp() {
    showLoading(true, 'Conectando...');
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
            throw new Error("Sessão não encontrada. Redirecionando para login.");
        }

        state.auth = session;
        state.userId = session.user.id;
        localStorage.setItem('auth_token', session.access_token);

        // Buscar perfil do usuário
        const endpoint = `usuarios?auth_user_id=eq.${state.userId}&select=nome,role,profile_picture_url,permissoes_filiais,matricula`;
        const profileResponse = await supabaseRequest(endpoint, 'GET');
        
        if (!profileResponse || profileResponse.length === 0) {
             throw new Error("Perfil de usuário não encontrado.");
        }
        
        const profile = profileResponse[0];
        state.isAdmin = (profile.role === 'admin');
        state.userMatricula = profile.matricula || null;
        state.permissoes_filiais = profile.permissoes_filiais || null;
        state.userNome = profile.nome || session.user.email.split('@')[0];

        // Atualizar UI
        document.getElementById('topBarUserName').textContent = state.userNome;
        document.getElementById('dropdownUserName').textContent = state.userNome;
        document.getElementById('dropdownUserEmail').textContent = session.user.email;
        if (profile.profile_picture_url) {
            document.getElementById('topBarUserAvatar').src = profile.profile_picture_url;
        }
        document.getElementById('gestorNameLabel').textContent = `${state.userNome} (Chapa: ${state.userMatricula || 'N/A'})`;
        
        // Mostrar links de Admin
        if (state.isAdmin) {
            document.getElementById('configLink').style.display = 'block';
            document.getElementById('adminUpdateLink').style.display = 'block';
        }
        
        // Carrega TODOS os dados (time e disponíveis)
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
        console.error("Erro na inicialização:", err);
        mostrarNotificacao(err.message, 'error');
        // Atraso para o usuário ler a notificação antes de ser deslogado
        setTimeout(logout, 3000);
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
        if ((newViewId === 'atualizarQLPView' || newViewId === 'configuracoesView') && !state.isAdmin) {
            console.warn("Acesso negado a view de admin.");
            mostrarNotificacao("Acesso negado. Esta área é restrita a administradores.", "warning");
            window.location.hash = '#meuTime'; // Volta para o padrão
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

    // NOVO: Listeners para a tela de Setup
    document.getElementById('searchDisponiveis').addEventListener('input', filtrarDisponiveis);
    document.getElementById('btnAdicionar').addEventListener('click', () => {
        moverColaboradores(document.getElementById('listaDisponiveis'), document.getElementById('listaMeuTime'));
    });
    document.getElementById('btnRemover').addEventListener('click', () => {
        moverColaboradores(document.getElementById('listaMeuTime'), document.getElementById('listaDisponiveis'));
    });
    document.getElementById('btnSalvarTime').addEventListener('click', handleSalvarTime);

    feather.replace();
});
