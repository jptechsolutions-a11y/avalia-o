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
 * ** CORREÇÃO (JP): **
 * A função recursiva anterior (`loadRecursiveTeam`) era lenta e causava
 * timeouts (erros) para gestores N2+.
 *
 * Esta nova função (`loadAllTeamMembers`) usa a lógica correta para
 * esta estrutura de banco de dados: ela busca de uma só vez em todas
 * as colunas de hierarquia (N1 a N5), o que é muito mais rápido
 * e eficiente.
 */
async function loadAllTeamMembers(gestorChapa) {
    const columns = 'matricula,gestor_chapa,funcao,nome,secao,filial,status';
    const chapaStr = String(gestorChapa); // Garante que a chapa seja string para a query
    
    // Busca em TODOS os 5 níveis hierárquicos de uma vez
    const query = `colaboradores?select=${columns}&or=(gestor_chapa.eq.${chapaStr},gestor_n2_chapa.eq.${chapaStr},gestor_n3_chapa.eq.${chapaStr},gestor_n4_chapa.eq.${chapaStr},gestor_n5_chapa.eq.${chapaStr})`;
    
    const team = await supabaseRequest(query, 'GET');
    
    return team || [];
}


/**
 * Carrega os dados essenciais do módulo (config, time, disponíveis e funções)
 * Chamado uma vez during a inicialização.
 * ** REVERTIDO: para usar a função recursiva em JS **
 */
async function loadModuleData() {
    // Se não tiver matrícula, não pode ser gestor, pula o carregamento
    if (!state.userMatricula && !state.isAdmin) {
        console.warn("Usuário sem matrícula, não pode carregar dados de gestor.");
        return;
    }
    
    showLoading(true, 'Carregando dados do time...');
    
    try {
        // --- ETAPA 1: Carregar Configs, Nomes de Gestores, e Funções (em paralelo) ---
        const [configRes, funcoesRes, gestorMapRes] = await Promise.allSettled([
            supabaseRequest('tabela_gestores_config?select=funcao,pode_ser_gestor,nivel_hierarquia', 'GET'),
            supabaseRequest('colaboradores?select=funcao', 'GET'),
            supabaseRequest('colaboradores?select=matricula,nome', 'GET') // Pega TODOS os nomes para o mapa
        ]);

        // Processa Config
        if (configRes.status === 'fulfilled' && configRes.value) {
            state.gestorConfig = configRes.value;
        } else {
            console.error("Erro ao carregar config:", configRes.reason);
        }
        
        // Processa Funções
        if (funcoesRes.status === 'fulfilled' && funcoesRes.value) {
            const funcoesSet = new Set(funcoesRes.value.map(f => f.funcao)); 
            state.todasAsFuncoes = [...funcoesSet].filter(Boolean);
        } else {
            console.error("Erro ao carregar funções:", funcoesRes.reason);
        }
        
        // Processa Nomes de Gestores
        const gestorMap = (gestorMapRes.status === 'fulfilled' && gestorMapRes.value) 
            ? gestorMapRes.value.reduce((acc, c) => { acc[c.matricula] = c.nome; return acc; }, {}) 
            : {};
        // Adiciona o próprio usuário ao mapa
        if (state.userMatricula && !gestorMap[state.userMatricula]) {
            gestorMap[state.userMatricula] = state.userNome;
        }

        // --- ETAPA 2: Preparar Mapas de Configuração ---
        // Mapa 1: (Função -> Nível)
        const configMapNivel = state.gestorConfig.reduce((acc, regra) => {
            acc[regra.funcao.toLowerCase()] = regra.nivel_hierarquia; 
            return acc;
        }, {});
        
        // REMOVIDO: O configMapGestor não é mais necessário
        // const configMapGestor = ...


        // --- ETAPA 3: Carregar Disponíveis (em paralelo com o time) ---
        let disponiveisQuery = 'colaboradores?select=matricula,nome,funcao,filial,gestor_chapa,status'; 
        let filters = []; 
        
        // **AQUI ESTÁ A CORREÇÃO PARA O PROBLEMA 2 (FILIAL)**
        if (!state.isAdmin) {
            if (Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
                filters.push(`filial.in.(${state.permissoes_filiais.map(f => `"${f}"`).join(',')})`);
            } else if (state.userFilial) {
                filters.push(`filial=eq.${state.userFilial}`);
            } else {
                console.warn("Gestor não-admin sem 'permissoes_filiais' ou 'filial'. A lista de disponíveis pode estar vazia.");
                filters.push('filial=eq.IMPOSSIVEL_FILIAL_FILTER');
            }
        }
        // Fim da Correção 2

        if (state.userMatricula) {
            filters.push(`matricula=neq.${state.userMatricula}`); 
        }
        if (filters.length > 0) {
            disponiveisQuery += `&${filters.join('&')}`;
        }
        const disponiveisPromise = supabaseRequest(disponiveisQuery, 'GET');

        
        // --- ETAPA 4: Carregar Time (COM A NOVA FUNÇÃO) ---
        let timeRes = [];
        if (state.isAdmin) {
            console.log("[Load] Admin detectado. Carregando TODOS os colaboradores...");
            // OTIMIZAÇÃO: Admin também não precisa de todas as colunas
            const columns = 'matricula,gestor_chapa,funcao,nome,secao,filial,status';
            timeRes = await supabaseRequest(`colaboradores?select=${columns}`, 'GET');
        } else {
            // **AQUI ESTÁ A CORREÇÃO (JP) **
            console.log(`[Load] 1. Buscando time hierárquico (Query Otimizada N1-N5) de ${state.userMatricula}...`);
            timeRes = await loadAllTeamMembers(state.userMatricula);
        }

        if (!timeRes) timeRes = [];
        console.log(`[Load] ...encontrados ${timeRes.length} colaboradores (Nível 1-5).`);

        // --- ETAPA 5: Processar o Time (Adicionar Nível e Nome do Gestor) ---
        state.meuTime = timeRes.map(c => {
            const nivel_hierarquico = configMapNivel[c.funcao?.toLowerCase()] || null;
            const gestor_imediato_nome = gestorMap[c.gestor_chapa] || 'N/A';
            
            return {
                ...c,
                nivel_hierarquico,
                gestor_imediato_nome
            };
        });

        // --- ETAPA 6: Finalizar "Disponíveis" ---
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

    // **NOTA:** state.disponiveis (passado para listaDisponiveisFiltrada)
    // já foi filtrado por filial dentro de loadModuleData.
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
            const colaboradorFuncao = colaborador.funcao;
            const colaboradorStatus = colaborador.status;
            const colaboradorGestor = colaborador.gestor_chapa;

            // Regra 0: Já é um subordinado direto do gestor logado (ex: Ana)
            if (colaboradorGestor === state.userMatricula) {
                return true;
            }

            // Regra 1: É "Disponível" (Sem Gestor ou Novato)
            if (colaboradorGestor === null || colaboradorStatus === 'novato') {
                return true;
            }
            
            // --- INÍCIO DA CORREÇÃO ---
            // Regra 2: É Líder de Nível Inferior OU Colaborador Regular
            if (colaboradorFuncao) {
                const colaboradorNivel = mapaNiveis[colaboradorFuncao.toLowerCase()];
                
                if (colaboradorNivel !== undefined && colaboradorNivel !== null) {
                    // É um líder (tem nível)
                    if (colaboradorNivel < state.userNivel) {
                        return true; // É de nível inferior, permite (ex: L2 vê L1)
                    } else {
                        return false; // É um líder de nível igual/superior, bloqueia (ex: L2 não vê L2)
                    }
                } else {
                    // É um colaborador regular (Nível undefined)
                    // Permite que o gestor adicione colaboradores regulares.
                    return true;
                }
            }
            
            // Fallback: Se não tem função, é um colaborador regular, permite.
            return true;
            // --- FIM DA CORREÇÃO ---
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
    
    // Filtra disponíveis para não mostrar quem JÁ ESTÁ no meu time
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
 * Salva o time (Nível 1) e recarrega a hierarquia completa (Nível 1-5).
 */
async function handleSalvarTime() {
    showLoading(true, 'Salvando seu time (Nível 1)...');
    const listaMeuTimeEl = document.getElementById('listaMeuTime');
    // Pega apenas quem o usuário *selecionou* como Nível 1.
    const chapasSelecionadas = Array.from(listaMeuTimeEl.options).map(opt => opt.value);
    
    if (chapasSelecionadas.length === 0) {
        mostrarNotificacao('Selecione pelo menos um colaborador para o seu time (Nível 1).', 'warning');
        showLoading(false);
        return;
    }

    try {
        // --- ETAPA 1: Salvar os gestores/colaboradores diretos (Nível 1) ---
        const promessas = chapasSelecionadas.map(chapa => {
            const payload = {
                gestor_chapa: state.userMatricula, 
                status: 'ativo' // Tira do status 'novato'
            };
            // ATENÇÃO: A query para PATCH deve usar a PKey (matricula)
            return supabaseRequest(`colaboradores?matricula=eq.${chapa}`, 'PATCH', payload);
        });

        await Promise.all(promessas);
        mostrarNotificacao('Time direto salvo! Recarregando hierarquia completa (Nível 1-5)...', 'success');
        
        // --- ETAPA 2: Recarregar TUDO (Nível 1-5) ---
        // ** CORREÇÃO (JP): **
        // Não precisamos mais da recursão JS aqui. Apenas recarregamos
        // os dados usando a nova função principal.
        await loadModuleData(); 
        
        // --- ETAPA 3: Atualizar Estado e Navegar ---
        
        // 1. Libera a sidebar
        const sidebar = document.querySelector('.sidebar');
        sidebar.style.pointerEvents = 'auto';
        sidebar.style.opacity = '1';

        // 2. Navega para a view principal (SEM RELOAD)
        window.location.hash = '#meuTime'; 
        // Chama o showView diretamente para carregar a tabela
        showView('meuTimeView', document.querySelector('a[href="#meuTime"]'));

    } catch (err) {
        mostrarNotificacao(`Erro ao salvar: ${err.message}`, 'error');
    } finally {
        showLoading(false); // Esconde o loading
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
 * ** ATUALIZADO: para ler os dados da nova query plana **
 */
function renderMeuTimeTable(data) {
    const tbody = document.getElementById('tableBodyMeuTime');
    const message = document.getElementById('tableMessageMeuTime');
    tbody.innerHTML = '';

    if (data.length === 0) {
        message.classList.remove('hidden');
        if (state.meuTime.length === 0) { // Se o cache original está vazio
             tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-gray-500">Seu time ainda não possui colaboradores vinculados.</td></tr>'; // Colspan 8
        } else { // Se o cache tem dados, mas o filtro limpou
             tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-gray-500">Nenhum colaborador encontrado para os filtros aplicados.</td></tr>'; // Colspan 8
        }
        return;
    }
    
    message.classList.add('hidden');

    // --- LÓGICA DE HIERARQUIA (Nível 1-5) ---
        
    // 1. Ordenar os dados:
    //    - Nível (da função)
    //    - Nome do gestor
    //    - Nome do colaborador
    data.sort((a, b) => {
        // A (Nível) vs B (Nível)
        if (a.nivel_hierarquico !== b.nivel_hierarquico) {
            return (a.nivel_hierarquico || 99) - (b.nivel_hierarquico || 99); // Joga nulos para o fim
        }
        
        // Se o nível for o mesmo, ordena pelo NOME do gestor
        if (a.gestor_imediato_nome !== b.gestor_imediato_nome) {
            return (a.gestor_imediato_nome || '').localeCompare(b.gestor_imediato_nome || '');
        }
        
        // Se o gestor for o mesmo, ordena por nome
        return (a.nome || '').localeCompare(b.nome || '');
    });

    const fragment = document.createDocumentFragment();
    data.forEach(item => {
        const tr = document.createElement('tr');
        
        // Define Nível (da função) e Gestor (imediato)
        const nivel = item.nivel_hierarquico;
        const gestorImediato = item.gestor_imediato_nome || '-';
        
        let rowClass = '';
        
        // Define a classe da linha (Direto vs Indireto)
        if (item.gestor_chapa === state.userMatricula) {
            rowClass = 'direct-report-row';
        } else {
            rowClass = 'indirect-report-row';
        }

        // Status
        const status = item.status || 'ativo';
        let statusClass = 'status-ativo';
        if (status === 'inativo') statusClass = 'status-inativo';
        if (status === 'novato') statusClass = 'status-aviso';
        
        tr.className = rowClass;
        
        // Adiciona padding baseado no nível (se a função tiver nível)
        const nomeStyle = (nivel && nivel > 0) ? `style="padding-left: ${nivel * 0.75}rem;"` : '';

        tr.innerHTML = `
            <td ${nomeStyle}>${item.nome || '-'}</td>
            <td>${item.matricula || '-'}</td>
            <td>${gestorImediato}</td>
            <td>${item.funcao || '-'}</td>
            <td>${item.secao || '-'}</td>
            <td>${item.filial || '-'}</td>
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
    
    // Adiciona um estilo leve para diferenciar Direto de Indireto
    const styleEl = document.getElementById('dynamic-styles') || document.createElement('style');
    styleEl.id = 'dynamic-styles';
    styleEl.innerHTML = `
        .indirect-report-row td {
            background-color: #f9fafb; /* Um cinza bem leve */
            font-size: 0.875rem;
        }
        .direct-report-row {
             /* font-weight: 600; */ /* Opcional: Destaca Nível 1 */
        }
    `;
    document.head.appendChild(styleEl);
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

    // 1. Popula colaboradores do time atual (Nível 1-5)
    selectColaborador.innerHTML = '<option value="">Selecione um colaborador...</option>';
    state.meuTime.sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).forEach(c => {
        selectColaborador.innerHTML += `<option value="${c.matricula}">${c.nome} (Nível ${c.nivel_hierarquico || 'N/A'})</option>`;
    });

    // 2. Popula gestores de destino
    selectGestor.innerHTML = '<option value="">Carregando gestores...</option>';
    selectGestor.disabled = true;
    btnConfirm.disabled = true; 

    try {
        // Pega funções que podem ser gestor (do cache)
        const funcoesGestor = state.gestorConfig
            .filter(r => r.pode_ser_gestor)
            // Filtra gestores que são Nível ABAIXO do usuário (Nível 1 < Nível 2)
            // (Assumindo que o Admin (Nível null) pode ver todos)
            .filter(r => {
                if (state.userNivel === null || state.userNivel === undefined) return true;
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

        // 2. Adiciona o filtro de FILIAL (se não for admin)
        if (!state.isAdmin) {
            if (Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
                const filialFilter = `filial.in.(${state.permissoes_filiais.map(f => `"${f}"`).join(',')})`;
                queryParts.push(filialFilter);
            } else if (state.userFilial) {
                 const filialFilter = `filial=eq.${state.userFilial}`;
                 queryParts.push(filialFilter);
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

/**
 * Habilita o botão de confirmar transferência
 */
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
    
    // ATENÇÃO: Esta é uma operação complexa.
    // Mudar o 'gestor_chapa' requer recalcular
    // gestor_n2_chapa, gestor_n3_chapa, etc. para o colaborador
    // E para TODOS os seus subordinados (a cascata abaixo dele).
    
    // TODO: Esta operação deve, idealmente, ser feita no backend
    // (via uma SQL Function) para garantir a integridade da hierarquia.
    
    // Por agora, vamos apenas atualizar o NÍVEL 1 (imediato)
    // e recarregar os dados.

    const colaboradorNome = selectColaborador.options[selectColaborador.selectedIndex].text;
    const gestorNome = selectGestor.options[selectGestor.selectedIndex].text;
    
    showLoading(true, `Transferindo ${colaboradorNome} para ${gestorNome}...`);
    btnConfirm.disabled = true;

    try {
        const payload = {
            gestor_chapa: novoGestorMatricula
            // IDEALMENTE: A trigger no DB deve recalcular N2, N3, N4, N5...
        };
        
        await supabaseRequest(`colaboradores?matricula=eq.${colaboradorMatricula}`, 'PATCH', payload);

        // Sucesso!
        mostrarNotificacao('Colaborador transferido com sucesso! Recarregando time...', 'success');

        // Atualiza o estado local (Removendo o colaborador do time antigo)
        state.meuTime = state.meuTime.filter(c => c.matricula !== colaboradorMatricula);
        
        // RECARREGA OS DADOS (para garantir que a hierarquia Nível 1-5 esteja 100% correta)
        await loadModuleData();

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

    const funcoesConfiguradas = new Set(gestorConfig.map(c => c.funcao.toLowerCase()));
    const funcoesDisponiveis = todasAsFuncoes.filter(f => !funcoesConfiguradas.has(f.toLowerCase()));
    
    select.innerHTML = ''; // Limpa
    
    if (funcoesDisponiveis.length === 0) {
        select.innerHTML = '<option value="">Nenhuma nova função a configurar</option>';
        return;
    }
    
    select.innerHTML = '<option value="">Selecione uma função...</option>';
    funcoesDisponiveis.sort().forEach(funcao => {
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

        // Atualiza o estado local
        state.gestorConfig = state.gestorConfig.filter(item => item.funcao.toUpperCase() !== resultado.funcao.toUpperCase());
        state.gestorConfig.push(resultado);

        // Re-renderiza a UI
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

/**
 * Exclui uma regra de gestão.
 */
async function handleExcluirConfig(funcao) {
    if (!funcao || !confirm(`Tem certeza que deseja excluir a regra para a função "${funcao}"?`)) {
        return;
    }
    
    showLoading(true, 'Excluindo regra...');
    
    try {
        await supabaseRequest(`tabela_gestores_config?funcao=eq.${funcao.toUpperCase()}`, 'DELETE');

        // Atualiza o estado local
        state.gestorConfig = state.gestorConfig.filter(item => item.funcao.toUpperCase() !== funcao.toUpperCase());

        // Re-renderiza a UI
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
        
        // 4. Buscar a função e FILIAL do gestor logado
        if (state.userMatricula) {
            const gestorData = await supabaseRequest(`colaboradores?select=funcao,filial&matricula=eq.${state.userMatricula}&limit=1`, 'GET');
            if (gestorData && gestorData[0]) {
                state.userFuncao = gestorData[0].funcao; 
                state.userFilial = gestorData[0].filial; 
            }
        }
        
        // 5. Carrega TODOS os dados (time (Recursivo N1-5), disponíveis, config, funções)
        await loadModuleData();
        
        // 6. Encontrar o nível do gestor (agora que o config foi carregado)
        if (state.userFuncao && state.gestorConfig.length > 0) {
            const gestorRegra = state.gestorConfig.find(r => r.funcao.toUpperCase() === state.userFuncao.toUpperCase());
            if (gestorRegra) {
                state.userNivel = gestorRegra.nivel_hierarquia; // Armazena o nível
            }
        }
        console.log(`Gestor: ${state.userNome}, Funcao: ${state.userFuncao}, Nivel: ${state.userNivel}, Filial: ${state.userFilial}`);
        
        document.getElementById('appShell').style.display = 'flex';
        document.body.classList.add('system-active');
        
        // ** O CHECK CRÍTICO (CORRIGIDO) **
        // Se, DEPOIS de rodar a recursão, o time ainda estiver vazio (e não for admin)
        // força o setup.
        if (state.meuTime.length === 0 && !state.isAdmin) {
            iniciarDefinicaoDeTime();
        } else {
            // Se o time já existe, carrega a view do hash
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
        // ** O CHECK CRÍTICO (CORRIGIDO) **
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
    
    // Força a chamada do showView para garantir o carregamento dos dados da view
    showView(viewId, navElement);
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
