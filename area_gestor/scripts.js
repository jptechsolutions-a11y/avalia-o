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
    userFuncao: null,
    userNivel: null,
    userFilial: null,
    // Cache de dados do módulo
    meuTime: [],
    disponiveis: [],
    gestorConfig: [],
    todasAsFuncoes: []
};

// --- Funções de UI ---

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

// --- Função de Navegação ---
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
    
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileDropdown) profileDropdown.classList.remove('open');
    
    try {
        switch (viewId) {
            case 'meuTimeView':
                updateDashboardStats(state.meuTime);
                populateFilters(state.meuTime);
                applyFilters();
                break;
            case 'transferirView':
                loadTransferViewData();
                break;
            case 'atualizarQLPView':
                break;
            case 'configuracoesView':
                renderGestorConfigTable(state.gestorConfig);
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

// --- Funções de Lógica do Módulo ---

/**
 * ** CORREÇÃO APLICADA **
 * Carrega os dados essenciais do módulo de forma NÃO-RECURSIVA.
 * Busca subordinados diretos + times dos sub-gestores em 2 etapas.
 */
async function loadModuleData() {
    if (!state.userMatricula && !state.isAdmin) {
        console.warn("Usuário sem matrícula, não pode carregar dados de gestor.");
        return;
    }
    
    showLoading(true, 'Carregando dados do time...');
    
    try {
        // --- ETAPA 1: Carregar Configurações e Funções ---
        const [configRes, funcoesRes] = await Promise.allSettled([
            supabaseRequest('tabela_gestores_config?select=funcao,pode_ser_gestor,nivel_hierarquia', 'GET'),
            supabaseRequest('colaboradores?select=funcao', 'GET')
        ]);

        if (configRes.status === 'fulfilled' && configRes.value) {
            state.gestorConfig = configRes.value;
        } else {
            console.error("Erro ao carregar config:", configRes.reason);
        }
        
        if (funcoesRes.status === 'fulfilled' && funcoesRes.value) {
            const funcoesSet = new Set(funcoesRes.value.map(f => f.funcao));
            state.todasAsFuncoes = [...funcoesSet].filter(Boolean);
        } else {
            console.error("Erro ao carregar funções:", funcoesRes.reason);
        }

        // --- ETAPA 2: Preparar Mapa de Configuração ---
        const configMap = state.gestorConfig.reduce((acc, regra) => {
            if (regra.pode_ser_gestor) {
                acc[regra.funcao.toLowerCase()] = true; 
            }
            return acc;
        }, {});

        // --- ETAPA 3: Carregar Disponíveis (em paralelo) ---
        let disponiveisQuery = 'colaboradores?select=matricula,nome,funcao,filial,gestor_chapa,status';
        let filters = []; 

        if (!state.isAdmin) {
            if (Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
                filters.push(`filial.in.(${state.permissoes_filiais.map(f => `"${f}"`).join(',')})`);
            } else if (state.userFilial) {
                filters.push(`filial=eq.${state.userFilial}`);
            } else {
                console.warn("Gestor sem permissões de filial definidas.");
                filters.push('filial=eq.IMPOSSIVEL_FILIAL_FILTER');
            }
        }
        
        if (state.userMatricula) {
            filters.push(`matricula=neq.${state.userMatricula}`);
        }

        if (filters.length > 0) {
            disponiveisQuery += `&${filters.join('&')}`;
        }
        
        const disponiveisPromise = supabaseRequest(disponiveisQuery, 'GET');

        // --- ETAPA 4: LÓGICA CORRIGIDA DE CARREGAMENTO DE TIME ---
        
        let timeCompleto = [];
        let subManagerChapas = [];

        // 4a. Busca os subordinados DIRETOS do gestor logado (ex: Ana, Marcelo)
        const directReports = await supabaseRequest(`colaboradores?select=*&gestor_chapa=eq.${state.userMatricula}`, 'GET');
        
        if (directReports && directReports.length > 0) {
            console.log(`[Load] Encontrados ${directReports.length} subordinados diretos do gestor.`);
            
            // ** CORREÇÃO CRÍTICA: ADICIONA os subordinados diretos ao time **
            timeCompleto = [...directReports];
            
            // 4b. Identifica quais deles são sub-gestores
            subManagerChapas = directReports
                .filter(r => {
                    const func = r.funcao ? r.funcao.toLowerCase() : null;
                    const isManager = func && configMap[func];
                    if (isManager) {
                        console.log(`[Load] ${r.nome} (${r.matricula}) identificado como sub-gestor.`);
                    }
                    return isManager;
                })
                .map(r => r.matricula);
        }

        // 4c. Se houver sub-gestores, busca os times deles também (cascata)
        if (subManagerChapas.length > 0) {
            console.log(`[Load] Buscando times dos ${subManagerChapas.length} sub-gestor(es)...`);
            
            // Monta query para buscar colaboradores dos sub-gestores
            const subTeamQuery = `colaboradores?select=*&gestor_chapa=in.(${subManagerChapas.map(c => `"${c}"`).join(',')})`;
            console.log(`[Load] Query de sub-times: ${subTeamQuery}`);
            
            const subTeam = await supabaseRequest(subTeamQuery, 'GET');
            
            if (subTeam && subTeam.length > 0) {
                console.log(`[Load] Encontrados ${subTeam.length} colaboradores nos sub-times.`);
                // Adiciona os colaboradores dos sub-gestores, evitando duplicatas
                const chapasExistentes = new Set(timeCompleto.map(c => c.matricula));
                subTeam.forEach(colab => {
                    if (!chapasExistentes.has(colab.matricula)) {
                        timeCompleto.push(colab);
                        chapasExistentes.add(colab.matricula);
                    }
                });
            }
        }
        
        // 4d. Define o time no estado
        state.meuTime = timeCompleto;
        console.log(`[Load] Carregamento concluído. Total: ${state.meuTime.length} colaboradores (${directReports?.length || 0} diretos + ${timeCompleto.length - (directReports?.length || 0)} cascata).`);

        // 4e. Espera a promise de 'disponíveis'
        const disponiveisRes = await Promise.allSettled([disponiveisPromise]);
        if (disponiveisRes[0].status === 'fulfilled' && disponiveisRes[0].value) {
            state.disponiveis = disponiveisRes[0].value;
        } else {
            console.error("Erro ao carregar disponíveis:", disponiveisRes[0].reason);
        }
        
    } catch (err) {
        console.error("Erro fatal no loadModuleData:", err);
        state.meuTime = [];
    } finally {
        showLoading(false);
    }
}

/**
 * Mostra a view de setup pela primeira vez.
 */
function iniciarDefinicaoDeTime() {
    console.log("Iniciando definição de time...");
    document.querySelectorAll('.view-content').forEach(view => {
        view.classList.remove('active');
        view.classList.add('hidden');
    });
    
    const setupView = document.getElementById('primeiroAcessoView');
    setupView.classList.remove('hidden');
    setupView.classList.add('active');
    
    const sidebar = document.querySelector('.sidebar');
    sidebar.style.pointerEvents = 'none';
    sidebar.style.opacity = '0.7';

    let listaDisponiveisFiltrada = state.disponiveis;
    
    if (state.userNivel !== null && state.userNivel !== undefined) {
        const mapaNiveis = state.gestorConfig.reduce((acc, regra) => {
            acc[regra.funcao.toLowerCase()] = regra.nivel_hierarquia;
            return acc;
        }, {});

        listaDisponiveisFiltrada = state.disponiveis.filter(colaborador => {
            const colaboradorFuncao = colaborador.funcao;
            const colaboradorStatus = colaborador.status;
            const colaboradorGestor = colaborador.gestor_chapa;

            if (colaboradorGestor === state.userMatricula) {
                return true;
            }

            if (colaboradorGestor === null || colaboradorStatus === 'novato') {
                return true;
            }

            if (colaboradorFuncao) {
                const colaboradorNivel = mapaNiveis[colaboradorFuncao.toLowerCase()];
                
                if (colaboradorNivel !== undefined && colaboradorNivel !== null) {
                    if (colaboradorNivel < state.userNivel) {
                        return true;
                    }
                }
            }
            
            return false;
        });

        console.log(`Filtro de Hierarquia: Gestor Nível ${state.userNivel}. Disponíveis ${state.disponiveis.length} -> Filtrados ${listaDisponiveisFiltrada.length}`);
    }

    renderListasTimes(listaDisponiveisFiltrada, state.meuTime);
    
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
    
    const chapasMeuTime = new Set(meuTime.map(c => c.matricula));
    const disponiveisFiltrados = disponiveis.filter(c => !chapasMeuTime.has(c.matricula));

    disponiveisFiltrados.sort((a,b) => (a.nome || '').localeCompare(b.nome || '')).forEach(c => {
        listaDisponiveisEl.innerHTML += `<option value="${c.matricula}">${c.nome} (${c.matricula}) [${c.filial || 'S/F'}] - ${c.funcao || 'N/A'}</option>`;
    });
    
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
 * ** CORREÇÃO APLICADA **
 * Salva o time direto e depois BUSCA (não salva) a cascata para visualização.
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
        // --- ETAPA 1: Salvar os gestores diretos ---
        const promessas = chapasSelecionadas.map(chapa => {
            const payload = {
                gestor_chapa: state.userMatricula,
                status: 'ativo'
            };
            return supabaseRequest(`colaboradores?matricula=eq.${chapa}`, 'PATCH', payload);
        });

        await Promise.all(promessas);
        mostrarNotificacao('Time direto salvo! Carregando visualização completa...', 'success');
        
        // --- ETAPA 2: BUSCAR A VISUALIZAÇÃO COMPLETA (sem salvar cascata) ---
        showLoading(true, 'Carregando visualização do time...');

        // 2a. Pegar o mapa de configuração de gestores (quem é gestor?)
        const configMap = state.gestorConfig.reduce((acc, regra) => {
            if (regra.pode_ser_gestor) {
                acc[regra.funcao.toLowerCase()] = true; 
            }
            return acc;
        }, {});

        // 2b. Busca subordinados diretos (acabamos de salvar)
        const directReports = await supabaseRequest(`colaboradores?select=*&gestor_chapa=eq.${state.userMatricula}`, 'GET');
        
        let timeCompleto = directReports || [];
        
        // 2c. Identifica sub-gestores entre os diretos
        const subManagerChapas = timeCompleto
            .filter(r => {
                const func = r.funcao ? r.funcao.toLowerCase() : null;
                return func && configMap[func];
            })
            .map(r => r.matricula);

        // 2d. Se houver sub-gestores, busca os times deles
        if (subManagerChapas.length > 0) {
            console.log(`[Setup] Encontrados ${subManagerChapas.length} sub-gestor(es). Buscando seus times...`);
            
            const subTeamQuery = `colaboradores?select=*&gestor_chapa=in.(${subManagerChapas.map(c => `"${c}"`).join(',')})`;
            const subTeam = await supabaseRequest(subTeamQuery, 'GET');
            
            if (subTeam && subTeam.length > 0) {
                console.log(`[Setup] Adicionando ${subTeam.length} colaboradores dos sub-gestores.`);
                const chapasExistentes = new Set(timeCompleto.map(c => c.matricula));
                subTeam.forEach(colab => {
                    if (!chapasExistentes.has(colab.matricula)) {
                        timeCompleto.push(colab);
                    }
                });
            }
        }
        
        // --- ETAPA 3: Atualizar Estado e Navegar ---
        console.log(`[Setup] Time completo carregado: ${timeCompleto.length} colaboradores (${chapasSelecionadas.length} diretos + cascata)`);
        
        // 1. Atualiza o estado global
        state.meuTime = timeCompleto;
        
        // 2. Remove os movidos da lista de disponíveis
        const chapasTimeCompleto = new Set(timeCompleto.map(c => c.matricula));
        state.disponiveis = state.disponiveis.filter(c => !chapasTimeCompleto.has(c.matricula));
        
        // 3. Libera a sidebar
        const sidebar = document.querySelector('.sidebar');
        sidebar.style.pointerEvents = 'auto';
        sidebar.style.opacity = '1';

        mostrarNotificacao(`Time configurado com sucesso! ${timeCompleto.length} colaboradores no total.`, 'success');

        // 4. Navega para a view principal
        window.location.hash = '#meuTime'; 
        showView('meuTimeView', document.querySelector('a[href="#meuTime"]'));

    } catch (err) {
        mostrarNotificacao(`Erro ao salvar: ${err.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Atualiza os 4 cards do dashboard com base nos dados do time.
 */
function updateDashboardStats(data) {
    if (!data) data = [];
    const total = data.length;
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
        if (state.meuTime.length === 0) {
             tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-gray-500">Seu time ainda não possui colaboradores vinculados.</td></tr>';
        } else {
             tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-gray-500">Nenhum colaborador encontrado para os filtros aplicados.</td></tr>';
        }
        return;
    }
    
    message.classList.add('hidden');

    const fragment = document.createDocumentFragment();
    data.sort((a,b) => (a.nome || '').localeCompare(b.nome || '')).forEach(item => {
        const tr = document.createElement('tr');
        
        let dtAdmissao = '-';
        if (item.data_admissao) {
             try {
                let dateStr = item.data_admissao.split(' ')[0];
                const dateParts = dateStr.split('-');
                if (dateParts.length === 3) {
                     dtAdmissao = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                } else {
                     dtAdmissao = item.data_admissao;
                }
             } catch(e) {
                 dtAdmissao = item.data_admissao;
             }
        }
        
        const status = item.status || 'ativo';
        let statusClass = 'status-ativo';
        if (status === 'inativo') statusClass = 'status-inativo';
        if (status === 'novato') statusClass = 'status-aviso';

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

// --- Funções: Lógica da Aba Transferência ---

async function loadTransferViewData() {
    const selectColaborador = document.getElementById('selectColaboradorTransfer');
    const selectGestor = document.getElementById('selectNovoGestor');
    const btnConfirm = document.getElementById('btnConfirmTransfer');
    
    if (!selectColaborador || !selectGestor || !btnConfirm) {
        console.error("Elementos da view 'transferir' não encontrados.");
        return;
    }

    selectColaborador.innerHTML = '<option value="">Selecione um colaborador...</option>';
    state.meuTime.sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).forEach(c => {
        selectColaborador.innerHTML += `<option value="${c.matricula}">${c.nome} (${c.matricula})</option>`;
    });

    selectGestor.innerHTML = '<option value="">Carregando gestores...</option>';
    selectGestor.disabled = true;
    btnConfirm.disabled = true;

    try {
        const funcoesGestor = state.gestorConfig
            .filter(r => r.pode_ser_gestor)
            .filter(r => {
                if (state.userNivel === null || state.userNivel === undefined) {
                    return true;
                }
                return r.nivel_hierarquia < state.userNivel;
            })
            .map(r => `"${r.funcao.toUpperCase()}"`);
        
        if (funcoesGestor.length === 0) {
            throw new Error("Nenhum gestor de nível hierárquico inferior encontrado.");
        }
        
        let queryParts = [
            `funcao=in.(${funcoesGestor.join(',')})`,
            `matricula=neq.${state.userMatricula}`
        ];

        if (!state.isAdmin) {
            if (Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
                const filialFilter = `filial.in.(${state.permissoes_filiais.map(f => `"${f}"`).join(',')})`;
                queryParts.push(filialFilter);
                console.log("Aplicando filtro de filial (permissoes_filiais) na transferência:", filialFilter);
            } else if (state.userFilial) {
                 const filialFilter = `filial=eq.${state.userFilial}`;
                 queryParts.push(filialFilter);
                 console.log("Aplicando filtro de filial (userFilial) na transferência:", filialFilter);
            } else {
                 queryParts.push('filial=eq.IMPOSSIVEL_FILIAL_FILTER');
            }
        }
        
        const query = `colaboradores?select=nome,matricula,funcao,filial&${queryParts.join('&')}`;
        
        const gestores = await supabaseRequest(query, 'GET');

        if (!gestores || gestores.length === 0) {
            throw new Error("Nenhum outro gestor (na sua filial e nível) encontrado.");
        }

        selectGestor.innerHTML = '<option value="">Selecione um gestor de destino...</option>';
        gestores.sort((a,b) => (a.nome || '').localeCompare(b.nome || '')).forEach(g => {
            selectGestor.innerHTML += `<option value="${g.matricula}">${g.nome} [${g.filial || 'S/F'}] (${g.funcao})</option>`;
        });
        selectGestor.disabled = false;

    } catch (err) {
        mostrarNotificacao(`Erro ao carregar gestores: ${err.message}`, 'error');
        selectGestor.innerHTML = `<option value="">${err.message}</option>`;
    }
}

function checkTransferButtonState() {
    const selectColaborador = document.getElementById('selectColaboradorTransfer').value;
    const selectGestor = document.getElementById('selectNovoGestor').value;
    const btnConfirm = document.getElementById('btnConfirmTransfer');
    
    if (!btnConfirm) return;
    
    if (selectColaborador && selectGestor) {
        btnConfirm.disabled = false;
    } else {
        btnConfirm.disabled = true;
    }
}

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
        const payload = {
            gestor_chapa: novoGestorMatricula
        };
        
        await supabaseRequest(`colaboradores?matricula=eq.${colaboradorMatricula}`, 'PATCH', payload);

        mostrarNotificacao('Colaborador transferido com sucesso!', 'success');

        state.meuTime = state.meuTime.filter(c => c.matricula !== colaboradorMatricula);

        selectColaborador.value = "";
        selectGestor.value = "";
        
        showView('meuTimeView', document.querySelector('a[href="#meuTime"]'));

    } catch (err) {
        mostrarNotificacao(`Erro ao transferir: ${err.message}`, 'error');
    } finally {
        showLoading(false);
        checkTransferButtonState();
    }
}

// --- Funções: Lógica da Aba Configurações ---

function populateConfigFuncaoDropdown(todasAsFuncoes, gestorConfig) {
    const select = document.getElementById('configFuncaoSelect');
    if (!select) return;

    const funcoesConfiguradas = new Set(gestorConfig.map(c => c.funcao.toLowerCase()));
    
    const funcoesDisponiveis = todasAsFuncoes.filter(f => !funcoesConfiguradas.has(f.toLowerCase()));
    
    select.innerHTML = '';
    
    if (funcoesDisponiveis.length === 0) {
        select.innerHTML = '<option value="">Nenhuma nova função a configurar</option>';
        return;
    }
    
    select.innerHTML = '<option value="">Selecione uma função...</option>';
    funcoesDisponiveis.sort().forEach(funcao => {
        select.innerHTML += `<option value="${funcao}">${funcao}</option>`;
    });
}

async function handleSalvarConfig() {
    const funcao = document.getElementById('configFuncaoSelect').value;
    const nivel = document.getElementById('configNivel').value;
    const podeGestor = document.getElementById('configPodeSerGestor').value === 'true';

    if (!funcao || !nivel) {
        mostrarNotificacao('Por favor, selecione uma função e defina um nível.', 'warning');
        return;
    }
    
    const payload = {
        funcao: funcao.toUpperCase(),
        pode_ser_gestor: podeGestor,
        nivel_hierarquia: parseInt(nivel)
    };
    
    showLoading(true, 'Salvando regra...');
    
    try {
        const [resultado] = await supabaseRequest('tabela_gestores_config', 'POST', payload, {
            'Prefer': 'return=representation,resolution=merge-duplicates'
        });

        if (!resultado) {
            throw new Error("A API não retornou dados após salvar.");
        }

        state.gestorConfig = state.gestorConfig.filter(item => item.funcao.toUpperCase() !== resultado.funcao.toUpperCase());
        state.gestorConfig.push(resultado);

        renderGestorConfigTable(state.gestorConfig);
        populateConfigFuncaoDropdown(state.todasAsFuncoes, state.gestorConfig);
        document.getElementById('formConfigGestor').reset();

        mostrarNotificacao('Regra de gestão salva com sucesso!', 'success');

    } catch (err) {
        mostrarNotificacao(`Erro ao salvar regra: ${err.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

async function handleExcluirConfig(funcao) {
    if (!funcao || !confirm(`Tem certeza que deseja excluir a regra para a função "${funcao}"?`)) {
        return;
    }
    
    showLoading(true, 'Excluindo regra...');
    
    try {
        await supabaseRequest(`tabela_gestores_config?funcao=eq.${funcao.toUpperCase()}`, 'DELETE');

        state.gestorConfig = state.gestorConfig.filter(item => item.funcao.toUpperCase() !== funcao.toUpperCase());

        renderGestorConfigTable(state.gestorConfig);
        populateConfigFuncaoDropdown(state.todasAsFuncoes, state.gestorConfig);

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
            window.location.href = '../home.html';
            return;
        }
        
        state.auth = session;
        localStorage.setItem('auth_token', session.access_token);
        
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

        document.getElementById('topBarUserName').textContent = state.userNome;
        document.getElementById('dropdownUserName').textContent = state.userNome;
        document.getElementById('dropdownUserEmail').textContent = profile.email || session.user.email;
        if (profile.profile_picture_url) {
            document.getElementById('topBarUserAvatar').src = profile.profile_picture_url;
        }
        document.getElementById('gestorNameLabel').textContent = `${state.userNome} (Chapa: ${state.userMatricula || 'N/A'})`;
        document.getElementById('dashGestorName').textContent = `${state.userNome} (${state.userMatricula || 'N/A'})`;
        
        if(state.isAdmin) {
            document.getElementById('adminLinks').classList.remove('hidden');
            document.getElementById('adminConfigLink').style.display = 'block';
            document.getElementById('adminUpdateLink').style.display = 'block';
        }
        
        if (state.userMatricula) {
            const gestorData = await supabaseRequest(`colaboradores?select=funcao,filial&matricula=eq.${state.userMatricula}&limit=1`, 'GET');
            if (gestorData && gestorData[0]) {
                state.userFuncao = gestorData[0].funcao;
                state.userFilial = gestorData[0].filial;
            }
        }
        
        await loadModuleData();
        
        if (state.userFuncao && state.gestorConfig.length > 0) {
            const gestorRegra = state.gestorConfig.find(r => r.funcao.toUpperCase() === state.userFuncao.toUpperCase());
            if (gestorRegra) {
                state.userNivel = gestorRegra.nivel_hierarquia;
            }
        }
        console.log(`Gestor: ${state.userNome}, Funcao: ${state.userFuncao}, Nivel: ${state.userNivel}, Filial: ${state.userFilial}`);
        
        document.getElementById('appShell').style.display = 'flex';
        document.body.classList.add('system-active');
        
        if (state.meuTime.length === 0 && !state.isAdmin) {
            iniciarDefinicaoDeTime();
        } else {
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
        if (newViewId === 'meuTimeView' && state.meuTime.length === 0 && !state.isAdmin) {
            console.warn("Time vazio, forçando setup inicial.");
            iniciarDefinicaoDeTime();
            return;
        }

        const isAdminView = newViewId === 'configuracoesView' || newViewId === 'atualizarQLPView';
        if (isAdminView && !state.isAdmin) {
            mostrarNotificacao('Acesso negado. Você precisa ser administrador.', 'error');
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
    
    document.querySelectorAll('.sidebar .nav-item[href]').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('#') && href.length > 1) {
                e.preventDefault();
                if (window.location.hash !== href) {
                    window.location.hash = href;
                } else {
                    handleHashChange();
                }
            }
        });
    });

    document.getElementById('logoutButton').addEventListener('click', logout);
    
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
    
    document.getElementById('filterNome').addEventListener('input', applyFilters);
    document.getElementById('filterFilial').addEventListener('change', applyFilters);
    document.getElementById('filterFuncao').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);

    document.getElementById('searchDisponiveis').addEventListener('input', filtrarDisponiveis);
    document.getElementById('btnAdicionar').addEventListener('click', () => {
        moverColaboradores(document.getElementById('listaDisponiveis'), document.getElementById('listaMeuTime'));
    });
    document.getElementById('btnRemover').addEventListener('click', () => {
        moverColaboradores(document.getElementById('listaMeuTime'), document.getElementById('listaDisponiveis'));
    });
    document.getElementById('btnSalvarTime').addEventListener('click', handleSalvarTime);
    
    document.getElementById('btnSalvarConfig').addEventListener('click', handleSalvarConfig);

    const selColab = document.getElementById('selectColaboradorTransfer');
    const selGestor = document.getElementById('selectNovoGestor');
    const btnTransfer = document.getElementById('btnConfirmTransfer');
    
    if (selColab) selColab.addEventListener('change', checkTransferButtonState);
    if (selGestor) selGestor.addEventListener('change', checkTransferButtonState);
    if (btnTransfer) btnTransfer.addEventListener('click', handleConfirmTransfer);

    feather.replace();
});
