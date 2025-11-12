// Configuração do Supabase (baseado nos seus outros módulos)
const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8';
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
    userFuncao: null, // <-- NOVO
    userNivel: null,  // <-- NOVO
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
                loadTransferViewData();
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
 * ** NOVO: Função Recursiva para Carregar Time em Cascata **
 * Busca todos os colaboradores abaixo de um gestor, incluindo sub-gestores.
 * ** ATUALIZADO: para usar colunas minúsculas **
 */
async function loadRecursiveTeam(gestorChapa, configMap) {
    let team = [];
    
    // 1. Busca subordinados diretos (ASSUMINDO COLUNAS minúsculas)
    const reports = await supabaseRequest(`colaboradores?select=*&gestor_chapa=eq.${gestorChapa}`, 'GET');
    
    if (!reports || reports.length === 0) {
        return []; // Condição de parada: gestor sem time
    }

    // 2. Adiciona os subordinados diretos ao time
    team = team.concat(reports);

    // 3. Identifica quais desses subordinados são também gestores (ASSUMINDO COLUNAS minúsculas)
    const subManagerChapas = reports
        .filter(r => {
            const func = r.funcao ? r.funcao.toLowerCase() : null; // Pega funcao (upper) e converte
            return func && configMap[func]; // Compara com o configMap (lower)
        })
        .map(r => r.matricula); // Pega matricula (lower)

    if (subManagerChapas.length === 0) {
        return team; // Condição de parada: sem sub-gestores
    }

    // 4. Busca recursivamente o time de cada sub-gestor
    const subTeamPromises = subManagerChapas.map(chapa => loadRecursiveTeam(chapa, configMap));
    const subTeams = await Promise.all(subTeamPromises);

    // 5. Adiciona os times dos sub-gestores ao time principal
    subTeams.forEach(subTeam => {
        team = team.concat(subTeam);
    });

    return team;
}


/**
 * Carrega os dados essenciais do módulo (config, time, disponíveis e funções)
 * Chamado uma vez durante a inicialização.
 * ** ATUALIZADO para usar a função recursiva e colunas minúsculas **
 */
async function loadModuleData() {
    // Se não tiver matrícula, não pode ser gestor, pula o carregamento
    if (!state.userMatricula && !state.isAdmin) {
        console.warn("Usuário sem matrícula, não pode carregar dados de gestor.");
        return;
    }
    
    showLoading(true, 'Carregando dados do time...');
    
    try {
        // --- ETAPA 1: Carregar Configurações e Funções (Necessário para a cascata) ---
        const [configRes, funcoesRes] = await Promise.allSettled([
            supabaseRequest('tabela_gestores_config?select=funcao,pode_ser_gestor,nivel_hierarquia', 'GET'),
            supabaseRequest('colaboradores?select=funcao', 'GET') // ASSUME lowercase
        ]);

        if (configRes.status === 'fulfilled' && configRes.value) {
            state.gestorConfig = configRes.value;
        } else {
            console.error("Erro ao carregar config:", configRes.reason);
        }
        
        if (funcoesRes.status === 'fulfilled' && funcoesRes.value) {
            const funcoesSet = new Set(funcoesRes.value.map(f => f.funcao)); // ASSUME lowercase
            state.todasAsFuncoes = [...funcoesSet].filter(Boolean);
        } else {
            console.error("Erro ao carregar funções:", funcoesRes.reason);
        }

        // --- ETAPA 2: Preparar Mapa de Configuração ---
        // Cria um mapa (ex: {'supervisor': true, 'coordenador': true})
        const configMap = state.gestorConfig.reduce((acc, regra) => {
            if (regra.pode_ser_gestor) {
                // A chave no mapa é minúscula (vem da tabela config, que é minúscula)
                acc[regra.funcao.toLowerCase()] = true; 
            }
            return acc;
        }, {});

        // --- ETAPA 3: Carregar Time (Recursivo) e Disponíveis (Paralelo) ---
        
        // Query de Disponíveis (ASSUME lowercase)
        let disponiveisQuery = 'colaboradores?select=matricula,nome,funcao,filial,gestor_chapa,status'; // Pega mais colunas para o filtro
        let filters = []; 

        // Adiciona filtro de filial (se não for admin)
        if (!state.isAdmin && Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
            filters.push(`filial.in.(${state.permissoes_filiais.map(f => `"${f}"`).join(',')})`); // ASSUME lowercase
        }
        
        // Adiciona filtro para não incluir o próprio gestor
        if (state.userMatricula) {
            filters.push(`matricula=neq.${state.userMatricula}`); // ASSUME lowercase
        }

        // Combina os filtros
        if (filters.length > 0) {
            disponiveisQuery += `&${filters.join('&')}`;
        }
        
        // Executa a busca recursiva e a busca de disponíveis
        const [timeRes, disponiveisRes] = await Promise.allSettled([
            loadRecursiveTeam(state.userMatricula, configMap), // <-- NOVO
            supabaseRequest(disponiveisQuery, 'GET')
        ]);
        
        if (timeRes.status === 'fulfilled' && timeRes.value) {
            state.meuTime = timeRes.value;
            console.log(`Carregamento em cascata concluído. Total: ${state.meuTime.length} colaboradores.`);
        } else {
            console.error("Erro ao carregar time (recursivo):", timeRes.reason);
        }
        
        if (disponiveisRes.status === 'fulfilled' && disponiveisRes.value) {
            state.disponiveis = disponiveisRes.value;
        } else {
            console.error("Erro ao carregar disponíveis:", disponiveisRes.reason);
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

    let listaDisponiveisFiltrada = state.disponiveis;
    
    // Só aplica o filtro de hierarquia se o gestor tiver um nível definido
    if (state.userNivel !== null && state.userNivel !== undefined) {
        
        // 1. Criar um mapa de Níveis (funcao -> nivel) para consulta rápida
        const mapaNiveis = state.gestorConfig.reduce((acc, regra) => {
            acc[regra.funcao.toLowerCase()] = regra.nivel_hierarquia; // Chave minúscula
            return acc;
        }, {});

        // 2. Filtrar a lista
        listaDisponiveisFiltrada = state.disponiveis.filter(colaborador => {
            // ASSUME lowercase
            const colaboradorFuncao = colaborador.funcao;
            const colaboradorStatus = colaborador.status;
            const colaboradorGestor = colaborador.gestor_chapa;

            // Regra 1: É "Disponível" (Sem Gestor ou Novato)
            if (colaboradorGestor === null || colaboradorStatus === 'novato') {
                return true;
            }

            // Regra 2: É Líder de Nível Inferior (Hierarquia)
            if (colaboradorFuncao) {
                // Compara a funcao (que é UPPERCASE) com o mapa (que é lowercase)
                const colaboradorNivel = mapaNiveis[colaboradorFuncao.toLowerCase()];
                
                if (colaboradorNivel !== undefined && colaboradorNivel !== null) {
                    // Gestor Nível 2 (Fabio) vê Nível 1 (Marcelo)
                    // 1 < 2 = true
                    if (colaboradorNivel < state.userNivel) {
                        return true; // É de nível inferior, permite
                    }
                }
            }
            
            // Se não passou em nenhum, filtra fora
            return false;
        });

        console.log(`Filtro de Hierarquia/Disponível: Gestor Nível ${state.userNivel}. Disponíveis ${state.disponiveis.length} -> Filtrados ${listaDisponiveisFiltrada.length}`);
    }

    // Popula as listas
    renderListasTimes(listaDisponiveisFiltrada, state.meuTime); // <-- USA A LISTA FILTRADA
    
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
    
    // Filtra disponíveis para não mostrar quem JÁ ESTÁ no meu time (ASSUME lowercase)
    const chapasMeuTime = new Set(meuTime.map(c => c.matricula));
    const disponiveisFiltrados = disponiveis.filter(c => !chapasMeuTime.has(c.matricula));

    // ASSUME lowercase
    disponiveisFiltrados.sort((a,b) => (a.nome || '').localeCompare(b.nome || '')).forEach(c => {
        listaDisponiveisEl.innerHTML += `<option value="${c.matricula}">${c.nome} (${c.matricula}) [${c.filial || 'S/F'}] - ${c.funcao || 'N/A'}</option>`;
    });
    
    // ASSUME lowercase
    meuTime.sort((a,b) => (a.nome || '').localeCompare(b.nome || '')).forEach(c => {
        listaMeuTimeEl.innerHTML += `<option value="${c.matricula}">${c.nome} (${c.matricula}) [${c.filial || 'S/F'}] - ${c.funcao || 'N/A'}</option>`;
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
    // Re-ordena a lista de destino
    const options = Array.from(destinoEl.options);
    options.sort((a, b) => a.text.localeCompare(b.text));
    destinoEl.innerHTML = '';
    options.forEach(opt => destinoEl.appendChild(opt));
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
            // ASSUME lowercase
            const payload = {
                gestor_chapa: state.userMatricula,
                status: 'ativo' // Tira do status 'novato'
            };
            // Usamos o matricula como chave de update (ASSUME lowercase)
            return supabaseRequest(`colaboradores?matricula=eq.${chapa}`, 'PATCH', payload);
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
    // ASSUME lowercase
    const ativos = data.filter(c => c.status === 'ativo').length;
    const inativos = data.filter(c => c.status === 'inativo').length;
    const novatos = data.filter(c => c.status === 'novato').length;
    
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
    
    // ASSUME lowercase
    const filiais = [...new Set(data.map(c => c.filial).filter(Boolean))].sort();
    const funcoes = [...new Set(data.map(c => c.funcao).filter(Boolean))].sort();
    
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
    data.sort((a,b) => (a.nome || '').localeCompare(b.nome || '')).forEach(item => {
        const tr = document.createElement('tr');
        
        // ASSUME lowercase
        let dtAdmissao = '-';
        if (item.data_admissao) {
             try {
                // Tenta formatar a data, seja qual for o formato (ISO ou DD/MM/YYYY)
                let dateStr = item.data_admissao.split(' ')[0]; // Remove timestamp se houver
                const dateParts = dateStr.split('-'); // Tenta formato ISO
                if (dateParts.length === 3) {
                     dtAdmissao = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                } else {
                     dtAdmissao = item.data_admissao; // Mantém o original se não for ISO
                }
             } catch(e) {
                 dtAdmissao = item.data_admissao; // Fallback
             }
        }
        
        const status = item.status || 'ativo';
        let statusClass = 'status-ativo';
        if (status === 'inativo') statusClass = 'status-inativo';
        if (status === 'novato') statusClass = 'status-aviso'; // Reutilizando a cor 'aviso'

        tr.innerHTML = `
            <td>${item.nome || '-'}</td>
            <td>${item.matricula || '-'}</td>
            <td>${item.funcao || '-'}</td>
            <td>${item.secao || '-'}</td>
            <td>${item.filial || '-'}</td>
            <td>${dtAdmissao}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td class="actions">
                <button class="btn btn-sm btn-info" title="Visualizar Perfil (em breve)" disabled>
                    <i data-feather="eye" class="h-4 w-4"></i>
                </button>
                <button class="btn btn-sm btn-warning" title="Transferir Colaborador" onclick="window.location.hash='#transferir'">
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
        // ASSUME lowercase
        const nomeChapaMatch = nomeFiltro === '' || 
            (item.nome && item.nome.toLowerCase().includes(nomeFiltro)) ||
            (item.matricula && item.matricula.toLowerCase().includes(nomeFiltro));
        
        const filialMatch = filialFiltro === '' || item.filial === filialFiltro;
        const funcaoMatch = funcaoFiltro === '' || item.funcao === funcaoFiltro;
        const statusMatch = statusFiltro === '' || (item.status || 'ativo') === statusFiltro;
        
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

    // (tabela_gestores_config usa minúsculas, está correto)
    data.sort((a, b) => (a.nivel_hierarquia || 0) - (b.nivel_hierarquia || 0));

    data.forEach(item => {
        const tr = document.createElement('tr');
        const podeGestorText = item.pode_ser_gestor ? 'Sim' : 'Não';
        const podeGestorClass = item.pode_ser_gestor ? 'status-ativo' : 'status-inativo';

        tr.innerHTML = `
            <td>${item.funcao}</td>
            <td><span class="status-badge ${podeGestorClass}">${podeGestorText}</span></td>
            <td>${item.nivel_hierarquia}</td>
            <td class="actions">
                <button class="btn btn-sm btn-danger" title="Excluir Regra" onclick="handleExcluirConfig('${item.funcao}')">
                    <i data-feather="trash-2" class="h-4 w-4"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    feather.replace();
}

// ====================================================================
// NOVAS FUNÇÕES: Lógica da Aba Transferência
// ====================================================================

/**
 * Carrega os dados para a view de Transferência
 */
async function loadTransferViewData() {
    const selectColaborador = document.getElementById('selectColaboradorTransfer');
    const selectGestor = document.getElementById('selectNovoGestor');
    const btnConfirm = document.getElementById('btnConfirmTransfer');
    
    if (!selectColaborador || !selectGestor || !btnConfirm) {
        console.error("Elementos da view 'transferir' não encontrados.");
        return;
    }

    // 1. Popula colaboradores do time atual (AGORA COM A CASCATA COMPLETA)
    selectColaborador.innerHTML = '<option value="">Selecione um colaborador...</option>';
    // ASSUME lowercase
    state.meuTime.sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).forEach(c => {
        selectColaborador.innerHTML += `<option value="${c.matricula}">${c.nome} (${c.matricula})</option>`;
    });

    // 2. Popula gestores de destino
    selectGestor.innerHTML = '<option value="">Carregando gestores...</option>';
    selectGestor.disabled = true;
    btnConfirm.disabled = true; // Desabilita o botão até que ambos sejam selecionados

    try {
        // Pega funções que podem ser gestor (do cache)
        const funcoesGestor = state.gestorConfig
            .filter(r => r.pode_ser_gestor)
            .filter(r => {
                // Se o usuário não tiver nível (ex: admin), permite todos
                if (state.userNivel === null || state.userNivel === undefined) {
                    return true;
                }
                // Gestor Nível 2 (Fabio) vê Nível 1 (Marcelo)
                // 1 < 2 = true
                return r.nivel_hierarquia < state.userNivel;
            })
            // O nome da função na tabela config é minúsculo
            .map(r => `"${r.funcao.toUpperCase()}"`); // Converte para UPPERCASE para bater com a tabela 'colaboradores'
        
        if (funcoesGestor.length === 0) {
            throw new Error("Nenhum gestor de nível hierárquico inferior encontrado.");
        }
        
        // 1. Define os filtros base (ASSUME lowercase)
        let queryParts = [
            `funcao=in.(${funcoesGestor.join(',')})`, // Filtro de Função/Nível (funcao é UPPERCASE)
            `matricula=neq.${state.userMatricula}`      // Excluir a si mesmo
        ];

        // 2. Adiciona o filtro de FILIAL (se não for admin)
        if (!state.isAdmin && Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
            const filialFilter = `filial.in.(${state.permissoes_filiais.map(f => `"${f}"`).join(',')})`; // ASSUME lowercase
            queryParts.push(filialFilter);
            console.log("Aplicando filtro de filial na transferência:", filialFilter);
        }
        
        // 3. Monta a query final (ASSUME lowercase)
        const query = `colaboradores?select=nome,matricula,funcao,filial&${queryParts.join('&')}`;
        
        const gestores = await supabaseRequest(query, 'GET');

        if (!gestores || gestores.length === 0) {
            throw new Error("Nenhum outro gestor (na sua filial e nível) encontrado.");
        }

        selectGestor.innerHTML = '<option value="">Selecione um gestor de destino...</option>';
        // ASSUME lowercase
        gestores.sort((a,b) => (a.nome || '').localeCompare(b.nome || '')).forEach(g => {
            selectGestor.innerHTML += `<option value="${g.matricula}">${g.nome} [${g.filial || 'S/F'}] (${g.funcao})</option>`;
        });
        selectGestor.disabled = false;

    } catch (err) {
        mostrarNotificacao(`Erro ao carregar gestores: ${err.message}`, 'error');
        selectGestor.innerHTML = `<option value="">${err.message}</option>`;
    }
}

/**
 * Habilita o botão de confirmar transferência
 */
function checkTransferButtonState() {
    const selectColaborador = document.getElementById('selectColaboradorTransfer').value;
    const selectGestor = document.getElementById('selectNovoGestor').value;
    const btnConfirm = document.getElementById('btnConfirmTransfer');
    
    if (!btnConfirm) return; // Proteção caso o elemento não exista
    
    if (selectColaborador && selectGestor) {
        btnConfirm.disabled = false;
    } else {
        btnConfirm.disabled = true;
    }
}

/**
 * Executa a transferência do colaborador
 */
async function handleConfirmTransfer() {
    const selectColaborador = document.getElementById('selectColaboradorTransfer');
    const selectGestor = document.getElementById('selectNovoGestor');
    const btnConfirm = document.getElementById('btnConfirmTransfer');

    const colaboradorMatricula = selectColaborador.value;
    const novoGestorMatricula = selectGestor.value;

    if (!colaboradorMatricula || !novoGestorMatricula) {
        mostrarNotificacao('Selecione um colaborador e um gestor de destino.', 'warning');
        return;
    }

    const colaboradorNome = selectColaborador.options[selectColaborador.selectedIndex].text;
    const gestorNome = selectGestor.options[selectGestor.selectedIndex].text;
    
    showLoading(true, `Transferindo ${colaboradorNome} para ${gestorNome}...`);
    btnConfirm.disabled = true;

    try {
        // ASSUME lowercase
        const payload = {
            gestor_chapa: novoGestorMatricula
        };
        
        await supabaseRequest(`colaboradores?matricula=eq.${colaboradorMatricula}`, 'PATCH', payload);

        // Sucesso!
        mostrarNotificacao('Colaborador transferido com sucesso!', 'success');

        // Atualiza o estado local (ASSUME lowercase)
        state.meuTime = state.meuTime.filter(c => c.matricula !== colaboradorMatricula);

        // Reseta a view de transferência
        selectColaborador.value = "";
        selectGestor.value = "";
        
        // Vai para a view "Meu Time" para ver o resultado
        showView('meuTimeView', document.querySelector('a[href="#meuTime"]'));

    } catch (err) {
        mostrarNotificacao(`Erro ao transferir: ${err.message}`, 'error');
    } finally {
        showLoading(false);
        checkTransferButtonState();
    }
}


// ====================================================================
// NOVAS FUNÇÕES: Lógica da Aba Configurações
// ====================================================================

/**
 * Popula o dropdown de Funções na aba Configurações.
 */
function populateConfigFuncaoDropdown(todasAsFuncoes, gestorConfig) {
    const select = document.getElementById('configFuncaoSelect');
    if (!select) return;

    // A tabela config usa 'funcao' minúscula
    const funcoesConfiguradas = new Set(gestorConfig.map(c => c.funcao.toLowerCase()));
    
    // 'todasAsFuncoes' vem de 'colaboradores.funcao' (UPPERCASE)
    // Comparamos o minúsculo de ambas
    const funcoesDisponiveis = todasAsFuncoes.filter(f => !funcoesConfiguradas.has(f.toLowerCase()));
    
    select.innerHTML = ''; // Limpa
    
    if (funcoesDisponiveis.length === 0) {
        select.innerHTML = '<option value="">Nenhuma nova função a configurar</option>';
        return;
    }
    
    select.innerHTML = '<option value="">Selecione uma função...</option>';
    funcoesDisponiveis.sort().forEach(funcao => {
        // O valor salvo no dropdown é o UPPERCASE original
        select.innerHTML += `<option value="${funcao}">${funcao}</option>`;
    });
}

/**
 * Salva a nova regra de gestão no banco de dados.
 */
async function handleSalvarConfig() {
    const funcao = document.getElementById('configFuncaoSelect').value; // (vem UPPERCASE)
    const nivel = document.getElementById('configNivel').value;
    const podeGestor = document.getElementById('configPodeSerGestor').value === 'true';

    if (!funcao || !nivel) {
        mostrarNotificacao('Por favor, selecione uma função e defina um nível.', 'warning');
        return;
    }
    
    const payload = {
        funcao: funcao.toUpperCase(), // Salva em UPPERCASE (para bater com o banco config)
        pode_ser_gestor: podeGestor,
        nivel_hierarquia: parseInt(nivel)
    };
    
    showLoading(true, 'Salvando regra...');
    
    try {
        // Tabela config usa minúsculas
        const [resultado] = await supabaseRequest('tabela_gestores_config', 'POST', payload, {
            'Prefer': 'return=representation,resolution=merge-duplicates'
        });

        if (!resultado) {
            throw new Error("A API não retornou dados após salvar.");
        }

        // Atualiza o estado local
        // Remove a antiga, se existir (caso de 'merge-duplicates')
        state.gestorConfig = state.gestorConfig.filter(item => item.funcao.toUpperCase() !== resultado.funcao.toUpperCase());
        // Adiciona a nova/atualizada
        state.gestorConfig.push(resultado);

        // Re-renderiza a UI
        renderGestorConfigTable(state.gestorConfig);
        populateConfigFuncaoDropdown(state.todasAsFuncoes, state.gestorConfig); // Atualiza o dropdown de adicionar
        document.getElementById('formConfigGestor').reset(); // Limpa o formulário

        mostrarNotificacao('Regra de gestão salva com sucesso!', 'success');

    } catch (err) {
        mostrarNotificacao(`Erro ao salvar regra: ${err.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Exclui uma regra de gestão.
 */
async function handleExcluirConfig(funcao) {
    // 'funcao' (key) vem da tabela config (UPPERCASE)
    if (!funcao || !confirm(`Tem certeza que deseja excluir a regra para a função "${funcao}"?`)) {
        return;
    }
    
    showLoading(true, 'Excluindo regra...');
    
    try {
        // Usa 'funcao' (UPPERCASE) como a chave para exclusão
        await supabaseRequest(`tabela_gestores_config?funcao=eq.${funcao.toUpperCase()}`, 'DELETE');

        // Atualiza o estado local
        state.gestorConfig = state.gestorConfig.filter(item => item.funcao.toUpperCase() !== funcao.toUpperCase());

        // Re-renderiza a UI
        renderGestorConfigTable(state.gestorConfig);
        populateConfigFuncaoDropdown(state.todasAsFuncoes, state.gestorConfig); // Atualiza o dropdown de adicionar

        mostrarNotificacao('Regra de gestão excluída com sucesso!', 'success');

    } catch (err) {
        mostrarNotificacao(`Erro ao excluir regra: ${err.message}`, 'error');
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
        // (Tabela 'usuarios' usa lowercase)
        const endpoint = `usuarios?auth_user_id=eq.${state.auth.user.id}&select=nome,role,profile_picture_url,permissoes_filiais,matricula,email`;
        const profileResponse = await supabaseRequest(endpoint, 'GET');
        
        if (!profileResponse || profileResponse.length === 0) {
             throw new Error("Perfil de usuário não encontrado.");
        }
        
        const profile = profileResponse[0];
        state.userId = state.auth.user.id;
        state.isAdmin = (profile.role === 'admin');
        state.userMatricula = profile.matricula || null; // (matricula é lowercase)
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
        
        // 4. Buscar a função do gestor logado
        if (state.userMatricula) {
            // (Tabela 'colaboradores' usa lowercase)
            const gestorData = await supabaseRequest(`colaboradores?select=funcao&matricula=eq.${state.userMatricula}&limit=1`, 'GET');
            if (gestorData && gestorData[0]) {
                state.userFuncao = gestorData[0].funcao; // Armazena a função (que é UPPERCASE)
            }
        }
        
        // 5. Carrega TODOS os dados (time, disponíveis, config, funções)
        await loadModuleData();
        
        // 6. Encontrar o nível do gestor (agora que o config foi carregado)
        if (state.userFuncao && state.gestorConfig.length > 0) {
            // Compara a funcao (UPPERCASE) com a config (UPPERCASE)
            const gestorRegra = state.gestorConfig.find(r => r.funcao.toUpperCase() === state.userFuncao.toUpperCase());
            if (gestorRegra) {
                state.userNivel = gestorRegra.nivel_hierarquia; // Armazena o nível
            }
        }
        console.log(`Gestor: ${state.userNome}, Funcao: ${state.userFuncao}, Nivel: ${state.userNivel}`);
        
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
        if (err.message && !err.message.includes("Sessão expirada")) {
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

    // NOVO: Listeners para a view de Transferência
    const selColab = document.getElementById('selectColaboradorTransfer');
    const selGestor = document.getElementById('selectNovoGestor');
    const btnTransfer = document.getElementById('btnConfirmTransfer');
    
    if (selColab) selColab.addEventListener('change', checkTransferButtonState);
    if (selGestor) selGestor.addEventListener('change', checkTransferButtonState);
    if (btnTransfer) btnTransfer.addEventListener('click', handleConfirmTransfer);

    feather.replace();
});
