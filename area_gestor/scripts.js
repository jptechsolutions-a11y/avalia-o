// Configuração do Supabase (baseado nos seus outros módulos)
const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIJoIkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8';
const SUPABASE_PROXY_URL = '/api/proxy'; // Usando o proxy

// Define o adaptador para sessionStorage
const sessionStorageAdapter = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

let supabaseClient = null;

// --- INÍCIO DA ATUALIZAÇÃO: Função movida para o topo ---
// --- Função de Requisição (Proxy) ---
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
    const authToken = localStorage.getItem('auth_token'); 
    
    if (!authToken) {
        console.error("Token JWT não encontrado no localStorage, deslogando.");
        // ATUALIZAÇÃO: Verifica se 'logout' existe antes de chamar
        if (typeof logout === 'function') {
            logout();
        }
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
            // Log do erro 500 para depuração
            if (response.status === 500) {
                 console.error(`[supabaseRequest] Erro 500! Endpoint: ${endpoint}`, errorData);
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
             // ATUALIZAÇÃO: Verifica se 'logout' existe antes de chamar
            if (typeof logout === 'function') {
                logout();
            }
        }
        throw error; 
    }
}

/**
 * ** MODIFICAÇÃO (JP): **
 * A função agora busca TODOS os colaboradores usando paginação,
 * em vez de depender do limite padrão de 1000 do Supabase.
 */
async function loadAllTeamMembers(gestorChapa, nivelGestor) {
    const columns = 'matricula,gestor_chapa,funcao,nome,secao,filial,status';
    const chapaStr = String(gestorChapa);
    
    const colunasGestor = ['gestor_chapa', 'gestor_n2_chapa', 'gestor_n3_chapa', 'gestor_n4_chapa', 'gestor_n5_chapa'];
    let orConditions = [];
    
    if (nivelGestor === null || nivelGestor === undefined || nivelGestor > 5) {
        console.log(`[Load] Nível não definido ou admin. Buscando em todas as ${colunasGestor.length} colunas.`);
        orConditions = colunasGestor.map(col => `${col}.eq.${chapaStr}`);
    } else {
        const niveisParaBuscar = Math.max(1, nivelGestor); 
        console.log(`[Load] Gestor Nível ${nivelGestor}. Buscando nas ${niveisParaBuscar} primeiras colunas.`);
        orConditions = colunasGestor.slice(0, niveisParaBuscar).map(col => `${col}.eq.${chapaStr}`);
    }
    
    if (orConditions.length === 0) {
        orConditions.push(`gestor_chapa.eq.${chapaStr}`);
    }

    // --- INÍCIO DA MODIFICAÇÃO (PAGINAÇÃO) ---
    const orQueryPart = `or=(${orConditions.join(',')})`;
    const baseQuery = `colaboradores?select=${columns}&${orQueryPart}`;
    console.log(`[Load] Base Query: ${baseQuery}`);

    const pageSize = 1000; // O Supabase tem um limite padrão de 1000, vamos usar ele para paginar
    let currentPage = 0;
    let hasMoreData = true;
    let allTeamMembers = [];

    while (hasMoreData) {
        const offset = currentPage * pageSize;
        // A query agora inclui offset e limit
        const query = `${baseQuery}&offset=${offset}&limit=${pageSize}`;
        
        showLoading(true, `Carregando time... ${allTeamMembers.length} membros...`);
        
        const teamBatch = await supabaseRequest(query, 'GET');

        if (teamBatch && Array.isArray(teamBatch)) {
            allTeamMembers = allTeamMembers.concat(teamBatch);
            
            if (teamBatch.length < pageSize) {
                hasMoreData = false; // Fim dos dados
            } else {
                currentPage++; // Prepara para a próxima página
            }
        } else {
            hasMoreData = false; // Erro ou array vazio
        }
    }
    
    console.log(`[Load] Paginação concluída. Total de ${allTeamMembers.length} membros carregados.`);
    return allTeamMembers; // Retorna a lista completa
    // --- FIM DA MODIFICAÇÃO ---
}
// --- FIM DA ATUALIZAÇÃO ---


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
    todasAsFuncoes: [],
    todosUsuarios: [], // Cache para fotos de perfil
    mapaFotos: {}, // Mapa de matricula -> foto
    bancoHorasMap: {}, // NOVO: Cache para banco de horas
    bancoHorasHistoryMap: {}, // NOVO: Cache para o histórico
    inconsistenciasMap: {}, // NOVO: Cache para contagem de inconsistências
    subordinadosComTimes: [] // Cache para a nova view
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
                updateDashboardStats(state.meuTime); // <-- USA O CACHE COMPLETO
                populateFilters(state.meuTime, 'all'); // MODIFICAÇÃO: Popula TUDO na primeira carga
                applyFilters(); // Renderiza a tabela inicial (agora com limite)
                break;
            case 'meusGestoresView':
                loadMeusGestoresView();
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
// ... ATUALIZAÇÃO: A função foi movida para o topo ...


// --- Funções de Lógica do Módulo (NOVAS E ATUALIZADAS) ---

/**
 * NOVO: Helper para converter string de horas "1.234,56" para float 1234.56
 */
function parseHoras(horasStr) {
    if (typeof horasStr !== 'string' || !horasStr) return 0;
    // Remove pontos de milhar, substitui vírgula por ponto
    const cleanStr = horasStr.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(cleanStr);
    return isNaN(val) ? 0 : val;
}

/**
 * NOVO: Helper para retornar o ícone de tendência
 * Tendência 'up' (vermelho) = mais horas, 'down' (verde) = menos horas
 */
function getTendenciaIcon(tendencia) {
    if (tendencia === 'up') {
        return '<i data-feather="arrow-up" class="h-3 w-3 diff-up"></i>'; // Piorou (mais horas)
    }
    if (tendencia === 'down') {
        return '<i data-feather="arrow-down" class="h-3 w-3 diff-down"></i>'; // Melhorou (menos horas)
    }
    if (tendencia === 'new') {
        return '<i data-feather="star" class="h-3 w-3 diff-new" title="Novo"></i>'; // Novo
    }
    // 'same'
    return '<i data-feather="minus" class="h-3 w-3 diff-same"></i>'; // Manteve
}


/**
 * ** CORREÇÃO (JP): **
// ... existing code ... */
async function loadModuleData() {
    // Se não tiver matrícula, não pode ser gestor, pula o carregamento
    if (!state.userMatricula && !state.isAdmin) {
        console.warn("Usuário sem matrícula, não pode carregar dados de gestor.");
        return;
    }
    
    showLoading(true, 'Carregando dados do time...');
    
    try {
        // --- ETAPA 1: Carregar Configs, Nomes de Gestores, Funções e BANCO DE HORAS (em paralelo) ---
        const [configRes, funcoesRes, gestorMapRes, usuariosRes, bancoHorasRes, bancoHorasHistoryRes, inconsistenciasRes] = await Promise.allSettled([
            supabaseRequest('tabela_gestores_config?select=funcao,pode_ser_gestor,nivel_hierarquia', 'GET'),
            supabaseRequest('colaboradores?select=funcao', 'GET'),
            supabaseRequest('colaboradores?select=matricula,nome', 'GET'), // Pega TODOS os nomes para o mapa
            supabaseRequest('usuarios?select=matricula,profile_picture_url', 'GET'), // NOVO: Pega fotos de perfil
            
            // ATUALIZAÇÃO: Corrigido o nome da coluna de "Total Geral" para "TOTAL_EM_HORA"
            supabaseRequest('banco_horas_data?select="CHAPA","TOTAL_EM_HORA","VAL_PGTO_BHS"', 'GET'), // NOVO: Pega banco de horas
            
            // ATUALIZAÇÃO: Corrigido o endpoint para remover o '?'
            supabaseRequest('banco_horas_history&select=data&order=created_at.desc&limit=1', 'GET'), // NOVO: Pega o último histórico
            
            // NOVO: Pega contagem de inconsistências
            supabaseRequest('inconsistencias_data?select=chapa', 'GET')
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

        // Processa Fotos de Perfil
        if (usuariosRes.status === 'fulfilled' && usuariosRes.value) {
            state.todosUsuarios = usuariosRes.value;
            state.mapaFotos = state.todosUsuarios.reduce((acc, u) => {
                if(u.matricula) acc[u.matricula] = u.profile_picture_url;
                return acc;
            }, {});
        } else {
            console.error("Erro ao carregar fotos de perfil:", usuariosRes.reason);
        }

        // NOVO: Processa Banco de Horas
        if (bancoHorasRes.status === 'fulfilled' && bancoHorasRes.value) {
            console.log(`[Load] Banco de Horas data received: ${bancoHorasRes.value.length} records.`); // DEBUG
            state.bancoHorasMap = bancoHorasRes.value.reduce((acc, item) => {
                // A tabela banco_horas usa CHAPA (string)
                // ATUALIZAÇÃO: Acessa as colunas com os nomes exatos (maiúsculas/espaços)
                if (item.CHAPA) { 
                    const normalizedChapa = String(item.CHAPA).trim(); // CORREÇÃO: Normaliza a chave
                    acc[normalizedChapa] = { 
                        horas: item['TOTAL_EM_HORA'] || '0,00', // CORRIGIDO
                        valor: item['VAL_PGTO_BHS'] || 'R$ 0,00'
                    };
                }
                return acc;
            }, {});
            console.log(`[Load] Banco de Horas map created with ${Object.keys(state.bancoHorasMap).length} entries.`); // DEBUG
        } else {
            console.error("Erro ao carregar banco de horas:", bancoHorasRes.reason);
            state.bancoHorasMap = {};
        }

        // NOVO: Processa Histórico do Banco de Horas
        // ATUALIZAÇÃO: Adicionado 'reason' para logar o erro 400
        if (bancoHorasHistoryRes.status === 'fulfilled' && bancoHorasHistoryRes.value && bancoHorasHistoryRes.value[0]) {
            const historyData = bancoHorasHistoryRes.value[0].data; // Isto é um array JSON
            if (Array.isArray(historyData)) {
                state.bancoHorasHistoryMap = historyData.reduce((acc, item) => {
                    // O histórico também usa CHAPA e TOTAL_EM_HORA
                    if (item.CHAPA) { 
                        const normalizedChapa = String(item.CHAPA).trim();
                        acc[normalizedChapa] = { 
                            horas: item['TOTAL_EM_HORA'] || '0,00',
                            valor: item['VAL_PGTO_BHS'] || 'R$ 0,00'
                        };
                    }
                    return acc;
                }, {});
                 console.log(`[Load] Histórico do Banco de Horas map created with ${Object.keys(state.bancoHorasHistoryMap).length} entries.`); // DEBUG
            }
        } else {
             // ATUALIZAÇÃO: Loga o motivo da falha (ex: "relation does not exist")
             console.warn("Nenhum histórico de banco de horas encontrado para comparação.", bancoHorasHistoryRes.reason || 'Resposta vazia');
             state.bancoHorasHistoryMap = {};
        }
        
        // NOVO: Processa Inconsistências
        if (inconsistenciasRes.status === 'fulfilled' && inconsistenciasRes.value) {
            console.log(`[Load] Inconsistencias data received: ${inconsistenciasRes.value.length} records.`);
            // Cria um mapa contando as ocorrências por chapa
            state.inconsistenciasMap = inconsistenciasRes.value.reduce((acc, item) => {
                if (item.chapa) {
                    const normalizedChapa = String(item.chapa).trim();
                    acc[normalizedChapa] = (acc[normalizedChapa] || 0) + 1;
                }
                return acc;
            }, {});
            console.log(`[Load] Inconsistencias map created with ${Object.keys(state.inconsistenciasMap).length} entries.`);
        } else {
            console.error("Erro ao carregar inconsistências:", inconsistenciasRes.reason);
            state.inconsistenciasMap = {};
        }


        // --- *** NOVA ETAPA (MOVILDA) *** ---
        // --- ETAPA 1.5: Definir o Nível do Gestor AGORA ---
        if (state.userFuncao && state.gestorConfig.length > 0) {
            const gestorRegra = state.gestorConfig.find(r => r.funcao.toUpperCase() === state.userFuncao.toUpperCase());
            if (gestorRegra) {
                state.userNivel = gestorRegra.nivel_hierarquia; // Armazena o nível
            }
        }
        console.log(`[Load] Gestor: ${state.userNome}, Funcao: ${state.userFuncao}, Nivel: ${state.userNivel}`);
        // --- *** FIM DA NOVA ETAPA *** ---


        // --- ETAPA 2: Preparar Mapas de Configuração ---
        // Mapa 1: (Função -> Nível)
        const configMapNivel = state.gestorConfig.reduce((acc, regra) => {
            acc[regra.funcao.toLowerCase()] = regra.nivel_hierarquia; 
            return acc;
        }, {});
        
        // --- ETAPA 3: Carregar Disponíveis (em paralelo com o time) ---
        let disponiveisQuery = 'colaboradores?select=matricula,nome,funcao,filial,gestor_chapa,status'; 
        
        let filterParts = []; // Todos os filtros irão aqui
        let filialFilterPart = null; // O filtro de filial
        
        if (Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
            if (state.permissoes_filiais.length === 1) {
                filialFilterPart = `filial.eq.${state.permissoes_filiais[0]}`; 
            } else {
                filialFilterPart = `or(${state.permissoes_filiais.map(f => `filial.eq.${f}`).join(',')})`; 
            }
            console.log(`[Load Disponíveis] Aplicando filtro 'eq' por 'permissoes_filiais': ${state.permissoes_filiais.join(',')}`);

        } else if (state.userFilial) {
            filialFilterPart = `filial.eq.${state.userFilial}`; 
            console.log(`[Load Disponíveis] Aplicando filtro 'eq' por 'userFilial': ${state.userFilial}`);
        
        } else {
            filialFilterPart = 'filial.eq.IMPOSSIVEL_FILIAL_FILTER'; 
            console.warn("[Load Disponíveis] Usuário sem 'permissoes_filiais' ou 'userFilial'. Lista de disponíveis estará vazia.");
        }
        
        filterParts.push(filialFilterPart); 

        if (state.userMatricula) {
            filterParts.push(`matricula.neq.${state.userMatricula}`); 
        }

        if (filterParts.length > 0) {
            if (filterParts.length > 1) { 
                 disponiveisQuery += `&and=(${filterParts.join(',')})`;
            } else {
                 disponiveisQuery += `&${filterParts[0]}`; 
            }
        }
        
        console.log(`[Load Disponíveis] Query final: ${disponiveisQuery}`);
        const disponiveisPromise = supabaseRequest(disponiveisQuery, 'GET');

        
        // --- ETAPA 4: Carregar Time (COM A NOVA FUNÇÃO DINÂMICA) ---
        let timeRes = [];
        if (state.isAdmin) {
            console.log("[Load] Admin detectado. Carregando TODOS os colaboradores...");
            const columns = 'matricula,gestor_chapa,funcao,nome,secao,filial,status';
            
            // MODIFICAÇÃO: Admin não usa loadAllTeamMembers. Admin busca tudo com paginação.
            const baseQuery = `colaboradores?select=${columns}`;
            const pageSize = 1000;
            let currentPage = 0;
            let hasMoreData = true;
            let allTeamMembers = [];
            
            while (hasMoreData) {
                const offset = currentPage * pageSize;
                const query = `${baseQuery}&offset=${offset}&limit=${pageSize}`;
                showLoading(true, `Carregando time... ${allTeamMembers.length} membros...`);
                const teamBatch = await supabaseRequest(query, 'GET');
                
                if (teamBatch && Array.isArray(teamBatch)) {
                    allTeamMembers = allTeamMembers.concat(teamBatch);
                    if (teamBatch.length < pageSize) hasMoreData = false;
                    else currentPage++;
                } else {
                    hasMoreData = false;
                }
            }
            console.log(`[Load] Admin: Paginação concluída. Total de ${allTeamMembers.length} membros carregados.`);
            timeRes = allTeamMembers;
            
        } else {
            console.log(`[Load] 1. Buscando time hierárquico (Nível ${state.userNivel || 'N/A'}) de ${state.userMatricula}...`);
            // MODIFICAÇÃO: Chama a função de paginação
            timeRes = await loadAllTeamMembers(state.userMatricula, state.userNivel);
        }

        if (!timeRes) timeRes = [];
        console.log(`[Load] ...encontrados ${timeRes.length} colaboradores.`);

        // --- ETAPA 5: Processar o Time (Adicionar Nível, Nome do Gestor e BANCO DE HORAS) ---
        const bancoHorasMap = state.bancoHorasMap || {};
        const bancoHorasHistoryMap = state.bancoHorasHistoryMap || {}; // NOVO
        
        state.meuTime = timeRes.map(c => {
            const nivel_hierarquico = configMapNivel[c.funcao?.toLowerCase()] || null;
            const gestor_imediato_nome = gestorMap[c.gestor_chapa] || 'N/A';
            
            // CORREÇÃO: Normaliza a matrícula para a busca
            const normalizedMatricula = String(c.matricula).trim();
            const banco = bancoHorasMap[normalizedMatricula] || { horas: '0,00', valor: 'R$ 0,00' }; 
            const bancoHistory = bancoHorasHistoryMap[normalizedMatricula]; // NOVO: Pega o histórico
            
            // NOVO: Pega contagem de inconsistências
            const inconsistencias_count = state.inconsistenciasMap[normalizedMatricula] || 0;

            // NOVO: Calcula a tendência
            let tendencia = 'same';
            if (!bancoHistory) {
                tendencia = 'new'; // Colaborador não existia no histórico
            } else {
                const horasAtual = parseHoras(banco.horas);
                const horasAnterior = parseHoras(bancoHistory.horas);
                if (horasAtual > horasAnterior) tendencia = 'up'; // Piorou (mais horas)
                if (horasAtual < horasAnterior) tendencia = 'down'; // Melhorou (menos horas)
            }
            
            // Debugging log for the first 3 items
            if (timeRes.indexOf(c) < 3) {
                 console.log(`[Debug] Mapping: Colab Matricula '${c.matricula}' -> Trimmed '${normalizedMatricula}'. Found in Map:`, bancoHorasMap[normalizedMatricula] ? 'YES' : 'NO');
            }
            
            return {
                ...c,
                nivel_hierarquico,
                gestor_imediato_nome,
                banco_horas: banco.horas, // Adiciona as horas
                banco_valor: banco.valor,  // Adiciona o valor
                banco_tendencia: tendencia, // NOVO: Adiciona a tendência
                inconsistencias_count // NOVO: Adiciona contagem
            };
        });

        // --- ETAPA 6: Finalizar "Disponíveis" ---
        const disponiveisRes = await Promise.allSettled([disponiveisPromise]);
        if (disponiveisRes[0].status === 'fulfilled' && disponiveisRes[0].value) {
            state.disponiveis = disponiveisRes[0].value;
            console.log(`[Load Disponíveis] Sucesso: ${state.disponiveis.length} disponíveis encontrados.`);
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
// ... (O restante da função loadModuleData permanece o mesmo) ...

/**
 * Mostra a view de setup pela primeira vez.
 */
function iniciarDefinicaoDeTime(isPrimeiroAcesso = false) {
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
    
    // Trava a sidebar para forçar o setup SOMENTE se for o primeiro acesso
    if (isPrimeiroAcesso) {
        const sidebar = document.querySelector('.sidebar');
        sidebar.style.pointerEvents = 'none';
        sidebar.style.opacity = '0.7';
    }

    // **NOTA:** state.disponiveis (passado para listaDisponiveisFiltrada)
    // já foi filtrado por filial dentro de loadModuleData.
    let listaDisponiveisFiltrada = state.disponiveis;
    
    // --- INÍCIO DA CORREÇÃO 1 ---
    // Filtra a lista 'state.disponiveis' (que já é da filial do usuário)
    // para mostrar APENAS quem não tem gestor E não é gestor de mesmo nível.

    // 1. Criar um mapa de Níveis
    const mapaNiveis = state.gestorConfig.reduce((acc, regra) => {
        acc[regra.funcao.toLowerCase()] = regra.nivel_hierarquia; // Chave minúscula
        return acc;
    }, {});
    
    listaDisponiveisFiltrada = listaDisponiveisFiltrada.filter(colaborador => {
        const colaboradorGestor = colaborador.gestor_chapa;
        const colaboradorStatus = colaborador.status;
        const colaboradorFuncao = colaborador.funcao;

        // REGRA 1: Deve ser "disponível" (sem gestor ou novato)
        if (colaboradorGestor !== null && colaboradorStatus !== 'novato') {
            return false; // Já tem gestor e não é novato, não pode ser adicionado.
        }

        // Se chegou aqui, é "disponível". Agora, checa a REGRA 2 (não ser gestor de mesmo nível)
        
        // REGRA 2: Checar o nível (exceção pedida pelo JP)
        if (state.userNivel !== null && state.userNivel !== undefined && colaboradorFuncao) {
            const colaboradorNivel = mapaNiveis[colaboradorFuncao.toLowerCase()];
            
            if (colaboradorNivel !== undefined && colaboradorNivel !== null) {
                // É um gestor (tem nível).
                if (colaboradorNivel === state.userNivel) {
                    // É do MESMO nível, então EXCLUI.
                    return false; 
                }
            }
        }
        
        // Se for "disponível" E (não é gestor OU é gestor de nível diferente), INCLUI.
        return true;
    });
    // --- FIM DA CORREÇÃO 1 ---

    console.log(`Filtro de "Sem Gestor" e "Nível": Disponíveis ${state.disponiveis.length} -> Filtrados ${listaDisponiveisFiltrada.length}`);
    
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
        listaDisponiveisEl.innerHTML += `<option value="${c.matricula}">${c.nome} (${c.matricula}) [${c.filial || 'S/F'}] - ${c.funcao || 'N/A'}</option>`;
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
 * ** ATUALIZADO PARA CHAMAR A FUNÇÃO RPC DE CASCATA **
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
        // O Trigger BEFORE 'set_gestor_hierarchy' vai rodar aqui para cada um,
        // atualizando a hierarquia DELES (ex: Marcelo).
        const promessasPatch = chapasSelecionadas.map(chapa => {
            const payload = {
                gestor_chapa: state.userMatricula, 
                status: 'ativo'
            };
            // ATENÇÃO: A query para PATCH deve usar a PKey (matricula)
            return supabaseRequest(`colaboradores?matricula=eq.${chapa}`, 'PATCH', payload);
        });

        await Promise.all(promessasPatch);
        mostrarNotificacao('Time direto salvo! Atualizando hierarquia de subordinados (N2-N5)...', 'success');
        
        // --- ETAPA 2: Chamar RPC para atualizar a CASCATA (Ex: Juliano e Felipe) ---
        // Isso é o que faltava.
        showLoading(true, 'Atualizando cascata N2-N5...');
        
        const promessasRPC = chapasSelecionadas.map(chapa => {
            // Chama a função RPC 'atualizar_subordinados' para cada gestor que foi movido
            return supabaseRequest(
                'rpc/atualizar_subordinados', // Endpoint RPC
                'POST',                      // Método
                { matricula_pai: chapa }     // Payload
            );
        });
        
        await Promise.all(promessasRPC);
        mostrarNotificacao('Hierarquia em cascata atualizada! Recarregando time...', 'success');


        // --- ETAPA 3: Recarregar TUDO (Nível 1-5) ---
        // A busca dinâmica agora vai funcionar, pois os dados no DB estão corretos.
        await loadModuleData(); 
        
        // --- ETAPA 4: Atualizar Estado e Navegar ---
        
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
 * MODIFICAÇÃO: Esta função agora lê o cache 'data' (state.meuTime),
 * que já foi carregado com TODOS os membros pela paginação.
 */
function updateDashboardStats(data) {
    if (!data) data = [];
    const total = data.length;
    const ativos = data.filter(c => c.status === 'ativo').length;
    const inativos = data.filter(c => c.status === 'inativo').length;
    const novatos = data.filter(c => c.status === 'novato').length;
    
    // NOVO: Calcular total de horas
    let totalHoras = 0;
    // NOVO: Calcular total de inconsistências
    let totalInconsistencias = 0;
    
    data.forEach(c => {
        // Usa a propriedade 'banco_horas' adicionada no loadModuleData
        const horasVal = parseFloat((c.banco_horas || '0,00').replace(',', '.'));
        if (!isNaN(horasVal)) {
            totalHoras += horasVal;
        }
        // NOVO: Soma inconsistências
        totalInconsistencias += (c.inconsistencias_count || 0);
    });
    
    document.getElementById('statTotalTime').textContent = total;
    document.getElementById('statAtivos').textContent = ativos;
    document.getElementById('statInativos').textContent = inativos;
    document.getElementById('statNovatos').textContent = novatos;
    // NOVO: Atualiza o card de horas
    document.getElementById('statTotalBancoHoras').textContent = totalHoras.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // NOVO: Atualiza o card de inconsistências
    document.getElementById('statTotalInconsistencias').textContent = totalInconsistencias;
}

/**
 * Preenche os <select> de filtro com base nos dados do time.
 * MODIFICAÇÃO: Esta função agora é dinâmica e chamada pelo applyFilters.
 * Ela preserva o valor selecionado se ele ainda for válido.
 */
function populateFilters(sourceData, filterTypeToPopulate) { // filterTypeToPopulate can be 'filial', 'funcao', or null/'all'
    if (!sourceData) sourceData = [];
    const filialSelect = document.getElementById('filterFilial');
    const funcaoSelect = document.getElementById('filterFuncao');
    
    if (!filialSelect || !funcaoSelect) return; // Checagem de segurança

    if (filterTypeToPopulate === 'filial' || !filterTypeToPopulate || filterTypeToPopulate === 'all') {
        const filiais = [...new Set(sourceData.map(c => c.filial).filter(Boolean))].sort();
        const currentValue = filialSelect.value; // Mantém o valor atual
        filialSelect.innerHTML = '<option value="">Todas as filiais</option>';
        filiais.forEach(f => {
            // Só seleciona se ainda for uma opção válida
            const selected = (f === currentValue) ? 'selected' : ''; 
            filialSelect.innerHTML += `<option value="${f}" ${selected}>${f}</option>`;
        });
    }

    if (filterTypeToPopulate === 'funcao' || !filterTypeToPopulate || filterTypeToPopulate === 'all') {
        const funcoes = [...new Set(sourceData.map(c => c.funcao).filter(Boolean))].sort();
        const currentValue = funcaoSelect.value; // Mantém o valor atual
        funcaoSelect.innerHTML = '<option value="">Todas as funções</option>';
        funcoes.forEach(f => {
            const selected = (f === currentValue) ? 'selected' : '';
            funcaoSelect.innerHTML += `<option value="${f}" ${selected}>${f}</option>`;
        });
    }
}

/**
 * Renderiza a tabela principal de "Meu Time"
 * MODIFICAÇÃO: A mensagem de "nenhum dado" foi simplificada
 * e agora é controlada pela função applyFilters.
 */
function renderMeuTimeTable(data) {
    const tbody = document.getElementById('tableBodyMeuTime');
    // const message = document.getElementById('tableMessageMeuTime'); // Mensagem agora é controlada pelo applyFilters
    tbody.innerHTML = '';

    if (data.length === 0) {
        // A mensagem de "Nenhum dado" é definida em applyFilters.
        // Apenas garantimos que o tbody esteja vazio.
        // MODIFICAÇÃO: Ajuste de colspan para 9
        if (state.meuTime.length === 0) { // Se o cache original está vazio
             tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-gray-500">Seu time ainda não possui colaboradores vinculados.</td></tr>';
        } else { // Se o cache tem dados, mas o filtro limpou
             tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-gray-500">Nenhum colaborador encontrado para os filtros aplicados.</td></tr>';
        }
        return;
    }
    
    // message.classList.add('hidden'); // Controlado por applyFilters

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
        // const gestorImediato = item.gestor_imediato_nome || '-'; // REMOVIDO
        
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

        // NOVO: Lógica de cor do Banco de Horas
        const horasVal = parseHoras(item.banco_horas); // Usa o helper
        let horasClass = 'text-gray-600';
        if (horasVal > 0) horasClass = 'text-green-600 font-medium'; // Positivo (banco positivo)
        if (horasVal < 0) horasClass = 'text-red-600 font-medium'; // Negativo (banco negativo)
        
        // NOVO: Lógica de cor Inconsistências
        const inconsistenciasVal = item.inconsistencias_count || 0;
        let inconsistenciasClass = 'text-gray-600';
        if (inconsistenciasVal > 0) inconsistenciasClass = 'text-yellow-600 font-medium';

        tr.innerHTML = `
            <td ${nomeStyle}>${item.nome || '-'}</td>
            <td>${item.matricula || '-'}</td>
            <!-- ATUALIZADO: Coluna de Banco de Horas com Valor e Tendência -->
            <td style="text-align: center;">
                <div class="banco-horas-principal ${horasClass}" style="font-family: monospace;">
                    <span>${item.banco_horas || '0,00'}</span>
                    ${getTendenciaIcon(item.banco_tendencia)}
                </div>
                <small class="banco-horas-valor">${item.banco_valor || 'R$ 0,00'}</small>
            </td>
            <!-- NOVO: Coluna Inconsistências -->
            <td style="text-align: center;" class="${inconsistenciasClass}">
                ${inconsistenciasVal}
            </td>
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
 * ** MODIFICAÇÃO (JP): **
 * Aplica os filtros da UI na tabela "Meu Time"
 * Adiciona a lógica de limite de exibição (600) se não estiver filtrando,
 * ou mostra todos os resultados se estiver filtrando.
 * ADICIONA LÓGICA DE FILTRO CASCADING.
 */
function applyFilters() {
    const nomeFiltro = document.getElementById('filterNome').value.toLowerCase();
    const filialFiltro = document.getElementById('filterFilial').value;
    const funcaoFiltro = document.getElementById('filterFuncao').value;
    const statusFiltro = document.getElementById('filterStatus').value;
    
    // --- INÍCIO DA LÓGICA CASCADING ---
    
    // 1a. Define a fonte de dados para o dropdown FUNÇÃO
    // (Filtra o time por Filial e Status)
    let dataForFuncaoFilter = state.meuTime;
    if (filialFiltro) {
        dataForFuncaoFilter = dataForFuncaoFilter.filter(item => item.filial === filialFiltro);
    }
    if (statusFiltro) {
         dataForFuncaoFilter = dataForFuncaoFilter.filter(item => (item.status || 'ativo') === statusFiltro);
    }
    // (Não filtramos dropdown por nome, apenas a tabela)
    populateFilters(dataForFuncaoFilter, 'funcao'); // Repopula o dropdown de Função

    // 1b. Define a fonte de dados para o dropdown FILIAL
    // (Filtra o time por Função e Status)
    let dataForFilialFilter = state.meuTime;
    if (funcaoFiltro) {
        dataForFilialFilter = dataForFilialFilter.filter(item => item.funcao === funcaoFiltro);
    }
    if (statusFiltro) {
        dataForFilialFilter = dataForFilialFilter.filter(item => (item.status || 'ativo') === statusFiltro);
    }
    populateFilters(dataForFilialFilter, 'filial'); // Repopula o dropdown de Filial
    
    // --- FIM DA LÓGICA CASCADING ---

    // 2. Agora, aplica TODOS os filtros para renderizar a tabela
    const finalFilteredData = state.meuTime.filter(item => {
        const nomeChapaMatch = nomeFiltro === '' || 
            (item.nome && item.nome.toLowerCase().includes(nomeFiltro)) ||
            (item.matricula && item.matricula.toLowerCase().includes(nomeFiltro));
        
        const filialMatch = filialFiltro === '' || item.filial === filialFiltro;
        const funcaoMatch = funcaoFiltro === '' || item.funcao === funcaoFiltro;
        const statusMatch = statusFiltro === '' || (item.status || 'ativo') === statusFiltro;
        
        return nomeChapaMatch && filialMatch && funcaoMatch && statusMatch;
    });
    
    // --- INÍCIO DA MODIFICAÇÃO (LIMITE DE EXIBIÇÃO) ---
    const totalResultados = finalFilteredData.length; // Usa finalFilteredData
    const isFiltering = nomeFiltro || filialFiltro || funcaoFiltro || statusFiltro;
    const tableMessage = document.getElementById('tableMessageMeuTime');
    
    let dadosParaRenderizar = [];
    let mensagem = '';
    
    const LIMITE_EXIBICAO = 600; // Conforme solicitado pelo JP

    if (totalResultados === 0) {
        if (isFiltering) {
            mensagem = "Nenhum colaborador encontrado para os filtros aplicados.";
        } else {
            mensagem = "Seu time ainda não possui colaboradores vinculados.";
        }
    } else if (isFiltering) {
        // Se está filtrando, mostra todos os resultados
        dadosParaRenderizar = finalFilteredData; // CORREÇÃO: Era filteredData
        mensagem = `Exibindo ${totalResultados} resultado(s) para sua busca.`;
        
    } else {
        // Se NÃO está filtrando, mostra apenas o limite (600)
        dadosParaRenderizar = finalFilteredData.slice(0, LIMITE_EXIBICAO); // CORREÇÃO: Era filteredData
        
        if (totalResultados > LIMITE_EXIBICAO) {
            mensagem = `Exibindo os ${LIMITE_EXIBICAO} primeiros de ${totalResultados} registros. Use os filtros para buscar.`;
        } else {
             mensagem = `Exibindo ${totalResultados} registro(s).`;
        }
    }
    
    if (tableMessage) {
        tableMessage.textContent = mensagem;
        if(totalResultados === 0) {
             tableMessage.classList.remove('hidden'); // Mostra se for 0
        } else {
             // Esconde se for > 0 E não estiver filtrando E estiver dentro do limite
             const hideMessage = !isFiltering && totalResultados <= LIMITE_EXIBICAO;
             tableMessage.classList.toggle('hidden', hideMessage);
        }
    }
    
    // 2. Renderiza apenas os dados selecionados (dadosParaRenderizar)
    renderMeuTimeTable(dadosParaRenderizar);
    // --- FIM DA MODIFICAÇÃO ---
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
// NOVAS FUNÇÕES: Lógica da Aba "Meus Gestores" (Nível 2+)
// ====================================================================

/**
 * Carrega e renderiza a view "Meus Gestores"
 */
async function loadMeusGestoresView() {
    showLoading(true, 'Carregando gestores e times...');
    const container = document.getElementById('gestoresCardsContainer');
    container.innerHTML = '';

    let gestoresParaExibir = [];
    const funcoesGestor = new Set(state.gestorConfig.filter(g => g.pode_ser_gestor).map(g => g.funcao.toUpperCase())); // Funções em UPPERCASE

    // --- INÍCIO DA MODIFICAÇÃO (JP) ---
    // A lógica foi unificada. state.meuTime já contém a hierarquia
    // completa do gestor logado (N1, N2, N3...) ou todos os
    // colaboradores (se for admin).
    // Agora, filtramos por todos que são gestores (têm nível)
    // e não são o próprio usuário.
    
    gestoresParaExibir = state.meuTime.filter(c => 
        c.matricula !== state.userMatricula && // Não é o próprio usuário
        c.nivel_hierarquico !== null && c.nivel_hierarquico !== undefined // E é um gestor (tem nível)
    );
    // --- FIM DA MODIFICAÇÃO ---
    
    if (gestoresParaExibir.length === 0) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Nenhum gestor subordinado encontrado.</p>';
        showLoading(false);
        return;
    }

    // Agora, para CADA gestor, carrega o time DELE e calcula os stats.
    const promises = gestoresParaExibir.map(async (gestor) => {
        // Re-usa a função de carregar time!
        const timeDoGestor = await loadAllTeamMembers(gestor.matricula, gestor.nivel_hierarquico);
        
        // NOVO: Calcular total de horas do sub-time (Atual e Anterior)
        let totalHorasSubTime = 0;
        let totalHorasSubTimeAnterior = 0; // NOVO
        let totalInconsistenciasSubTime = 0; // NOVO
        const bancoHorasMap = state.bancoHorasMap || {};
        const bancoHorasHistoryMap = state.bancoHorasHistoryMap || {}; // NOVO
        
        timeDoGestor.forEach(colaborador => {
            const normalizedMatricula = String(colaborador.matricula).trim(); // Garante a normalização
            const banco = bancoHorasMap[normalizedMatricula];
            const bancoHist = bancoHorasHistoryMap[normalizedMatricula];

            if (banco) {
                totalHorasSubTime += parseHoras(banco.horas);
            }
            if (bancoHist) {
                totalHorasSubTimeAnterior += parseHoras(bancoHist.horas); // Soma o anterior
            }
            
            // NOVO: Soma inconsistências
            const inconsistencias = state.inconsistenciasMap[normalizedMatricula] || 0;
            totalInconsistenciasSubTime += inconsistencias;
        });
        
        // NOVO: Calcula a tendência do time
        let tendenciaHorasTotal = 'same';
        if (totalHorasSubTime > totalHorasSubTimeAnterior) tendenciaHorasTotal = 'up';
        if (totalHorasSubTime < totalHorasSubTimeAnterior) tendenciaHorasTotal = 'down';
        // FIM NOVO

        const total = timeDoGestor.length;
        const ativos = timeDoGestor.filter(c => c.status === 'ativo').length;
        const inativos = timeDoGestor.filter(c => c.status === 'inativo').length;
        const novatos = timeDoGestor.filter(c => c.status === 'novato').length;
        
        return {
            ...gestor, // dados do gestor (nome, matricula, funcao, filial)
            foto: state.mapaFotos[gestor.matricula] || 'https://i.imgur.com/80SsE11.png',
            stats: { 
                total, ativos, inativos, novatos, 
                totalHoras: totalHorasSubTime, 
                tendenciaHoras: tendenciaHorasTotal, // NOVO
                totalInconsistencias: totalInconsistenciasSubTime // NOVO
            }, 
            timeCompleto: timeDoGestor // Armazena o time para o modal
        };
    });
    
    const resultados = await Promise.allSettled(promises);
    
    state.subordinadosComTimes = []; // Limpa e preenche o cache
    
    resultados.forEach(res => {
        if (res.status === 'fulfilled') {
            state.subordinadosComTimes.push(res.value);
        } else {
            console.warn("Falha ao carregar time de um gestor:", res.reason);
        }
    });

    // Agora, renderiza os cards
    renderGestorCards(state.subordinadosComTimes);
    showLoading(false);
}

/**
 * Renderiza os cards dos gestores subordinados
 */
function renderGestorCards(gestores) {
    const container = document.getElementById('gestoresCardsContainer');
    container.innerHTML = ''; // Limpa

    if (gestores.length === 0) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Nenhum gestor encontrado.</p>';
        return;
    }
    
    gestores.sort((a,b) => (a.nome || '').localeCompare(b.nome || ''));

    gestores.forEach(gestor => {
        const card = document.createElement('div');
        card.className = 'stat-card-dash flex items-start gap-4'; // Reutiliza a classe dos cards
        
        // NOVO: Define a cor do total de horas e pega o ícone de tendência
        const horasFormatadas = gestor.stats.totalHoras.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        let horasClass = 'text-cyan-700';
        if (gestor.stats.totalHoras < 0) horasClass = 'text-red-700'; // Negativo
        if (gestor.stats.totalHoras > 0) horasClass = 'text-green-700'; // Positivo
        
        const tendenciaIcon = getTendenciaIcon(gestor.stats.tendenciaHoras); // NOVO

        card.innerHTML = `
            <img src="${gestor.foto}" class="w-16 h-16 rounded-full object-cover bg-gray-200 flex-shrink-0">
            <div class="flex-1">
                <h4 class="font-bold text-lg text-accent">${gestor.nome || 'N/A'}</h4>
                <p class="text-sm text-gray-600 -mt-1">${gestor.funcao || 'N/A'} (Filial: ${gestor.filial || 'N/A'})</p>
                <!-- MODIFICAÇÃO: Adicionada a linha "Gestor Imediato" -->
                <p class="text-xs text-blue-600 font-medium mb-2">Gestor Imediato: <strong>${gestor.gestor_imediato_nome || 'N/A'}</strong></p>
                <!-- ATUALIZADO: Grid de stats com Banco de Horas -->
                <div class="text-xs grid grid-cols-2 gap-1">
                    <span><i data-feather="users" class="h-3 w-3 inline-block mr-1"></i>Total: <strong>${gestor.stats.total}</strong></span>
                    <span><i data-feather="user-check" class="h-3 w-3 inline-block mr-1 text-green-600"></i>Ativos: <strong>${gestor.stats.ativos}</strong></span>
                    <span><i data-feather="user-plus" class="h-3 w-3 inline-block mr-1 text-yellow-600"></i>Novatos: <strong>${gestor.stats.novatos}</strong></span>
                    <span><i data-feather="user-x" class="h-3 w-3 inline-block mr-1 text-red-600"></i>Inativos: <strong>${gestor.stats.inativos}</strong></span>
                    <!-- NOVO: Inconsistências -->
                    <span><i data-feather="alert-octagon" class="h-3 w-3 inline-block mr-1 text-yellow-600"></i>Inconsist.: <strong>${gestor.stats.totalInconsistencias}</strong></span>
                    
                    <!-- NOVO ITEM ATUALIZADO com tendência -->
                    <span class="col-span-2 mt-1 ${horasClass} banco-horas-principal !justify-start">
                        <i data-feather="clock" class="h-3 w-3 inline-block mr-1"></i>Total Horas: <strong>${horasFormatadas}</strong>
                        ${tendenciaIcon}
                    </span>
                </div>
                <button class="btn btn-sm btn-primary mt-3" onclick="showGestorTimeModal('${gestor.matricula}')">
                    <i data-feather="eye" class="h-4 w-4 mr-1"></i> Ver Time Completo
                </button>
            </div>
        `;
        container.appendChild(card);
    });
    
    feather.replace();
}

/**
 * Abre o modal e renderiza o time do gestor selecionado
 */
function showGestorTimeModal(matriculaGestor) {
    const gestor = state.subordinadosComTimes.find(g => g.matricula === matriculaGestor);
    if (!gestor) {
        mostrarNotificacao('Erro: Não foi possível encontrar os dados desse gestor.', 'error');
        return;
    }

    document.getElementById('modalGestorTitle').textContent = `Time de ${gestor.nome}`;
    
    // Renderiza a tabela
    renderModalTimeTable(gestor.timeCompleto);

    document.getElementById('gestorTimeModal').style.display = 'flex';
    feather.replace();
}

/**
 * Renderiza a tabela de time para o Modal (versão simplificada)
 */
function renderModalTimeTable(data) {
    const tbody = document.getElementById('modalGestorTableBody');
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        // ATUALIZADO: Colspan para 9
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-gray-500">Este gestor não possui colaboradores vinculados.</td></tr>';
        return;
    }

    // Re-processa os nomes dos gestores imediatos (necessário se a função foi chamada isoladamente)
    const gestorMap = (state.todosUsuarios || []).reduce((acc, c) => { acc[c.matricula] = c.nome; return acc; }, {});
    if (state.userMatricula && !gestorMap[state.userMatricula]) {
        gestorMap[state.userMatricula] = state.userNome;
    }
    state.subordinadosComTimes.forEach(g => gestorMap[g.matricula] = g.nome); // Adiciona os gestores N-1

    data.sort((a,b) => (a.nome || '').localeCompare(b.nome || ''));

    const fragment = document.createDocumentFragment();
    data.forEach(item => {
        const tr = document.createElement('tr');
        
        const gestorImediato = gestorMap[item.gestor_chapa] || item.gestor_chapa || '-';
        
        const status = item.status || 'ativo';
        let statusClass = 'status-ativo';
        if (status === 'inativo') statusClass = 'status-inativo';
        if (status === 'novato') statusClass = 'status-aviso';

        // NOVO: Lógica de cor e tendência do Banco de Horas
        const normalizedMatricula = String(item.matricula).trim();
        const banco = state.bancoHorasMap[normalizedMatricula] || { horas: '0,00', valor: 'R$ 0,00' };
        const bancoHistory = state.bancoHorasHistoryMap[normalizedMatricula];
        
        // NOVO: Pega inconsistências
        const inconsistencias = state.inconsistenciasMap[normalizedMatricula] || 0;
        
        let tendencia = 'same';
        if (!bancoHistory) {
            tendencia = 'new';
        } else {
            const horasAtual = parseHoras(banco.horas);
            const horasAnterior = parseHoras(bancoHistory.horas);
            if (horasAtual > horasAnterior) tendencia = 'up';
            if (horasAtual < horasAnterior) tendencia = 'down';
        }
        
        const horasVal = parseHoras(banco.horas);
        let horasClass = 'text-gray-600';
        if (horasVal > 0) horasClass = 'text-green-600 font-medium'; // Positivo
        if (horasVal < 0) horasClass = 'text-red-600 font-medium'; // Negativo
        
        // NOVO: Lógica de cor Inconsistências
        let inconsistenciasClass = 'text-gray-600';
        if (inconsistencias > 0) inconsistenciasClass = 'text-yellow-600 font-medium';
        // FIM NOVO

        tr.innerHTML = `
            <td>${item.nome || '-'}</td>
            <td>${item.matricula || '-'}}</td>
            <td>${gestorImediato}</td>
            <!-- ATUALIZADO: Coluna de Banco de Horas com Valor e Tendência -->
             <td style="text-align: center;">
                <div class="banco-horas-principal ${horasClass}" style="font-family: monospace;">
                    <span>${banco.horas}</span>
                    ${getTendenciaIcon(tendencia)}
                </div>
                <small class="banco-horas-valor">${banco.valor}</small>
            </td>
            <!-- NOVO: Coluna Inconsistências -->
            <td style="text-align: center;" class="${inconsistenciasClass}">
                ${inconsistencias}
            </td>
            <td>${item.funcao || '-'}</td>
            <td>${item.secao || '-'}</td>
            <td>${item.filial || '-'}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
        `;
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
    feather.replace();
}

/**
 * Fecha o modal do time do gestor
 */
function closeGestorTimeModal() {
    document.getElementById('gestorTimeModal').style.display = 'none';
    document.getElementById('modalGestorTableBody').innerHTML = ''; // Limpa a tabela
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
        selectColaborador.innerHTML += `<option value="${c.matricula}">${c.nome} (${c.matricula})</option>`;
    });

    // 2. Popula gestores de destino
    selectGestor.innerHTML = '<option value="">Carregando gestores...</option>';
    selectGestor.disabled = true;
    btnConfirm.disabled = true; 

    try {
        // Pega funções que podem ser gestor (do cache)
        const funcoesGestor = state.gestorConfig
            .filter(r => r.pode_ser_gestor)
            .filter(r => {
                // AJUSTE: Força todos (incluindo admins) a só verem o mesmo nível
                if (state.userNivel === null || state.userNivel === undefined) {
                    return false; 
                }
                return r.nivel_hierarquia === state.userNivel;
            })
            .map(r => `"${r.funcao.toUpperCase()}"`); 
        
        if (funcoesGestor.length === 0) {
            throw new Error("Nenhum gestor de nível hierárquico igual ao seu encontrado.");
        }
        
        // #################### INÍCIO DA CORREÇÃO (BUG 500) ####################
        // Troca de 'like' para 'eq' (igualdade exata)
        // ####################
        let queryParts = [
            `funcao=in.(${funcoesGestor.join(',')})`, 
            `matricula.neq.${state.userMatricula}`      
        ];

        // 2. Adiciona o filtro de FILIAL (com 'eq' e 'or')
        let filialFilterPart = null;
        if (Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
            if (state.permissoes_filiais.length === 1) {
                // ANTES: filial.like...
                filialFilterPart = `filial.eq.${state.permissoes_filiais[0]}`; // CORRIGIDO
            } else {
                // ANTES: or(filial.like...)
                filialFilterPart = `or(${state.permissoes_filiais.map(f => `filial.eq.${f}`).join(',')})`; // CORRIGIDO
            }
        } else if (state.userFilial) {
             // ANTES: filial.like...
             filialFilterPart = `filial.eq.${state.userFilial}`; // CORRIGIDO
        } else {
             filialFilterPart = 'filial.eq.IMPOSSIVEL_FILIAL_FILTER';
        }
        queryParts.push(filialFilterPart);

        // 3. Combina TUDO com '&' em vez de 'and=()'
        // A sintaxe and=() falha quando os valores (funcao) contêm vírgulas ou espaços.
        // const query = `colaboradores?select=nome,matricula,funcao,filial&and=(${queryParts.join(',')})`; // <-- ANTIGO (COM ERRO 400)
        const query = `colaboradores?select=nome,matricula,funcao,filial&${queryParts.join('&')}`; // <-- NOVO (CORRIGIDO)
        
        console.log(`[Load Transfer] Query: ${query}`);
        // #################### FIM DA CORREÇÃO (BUG 400) ######################
        
        const gestores = await supabaseRequest(query, 'GET');

        if (!gestores || gestores.length === 0) {
            throw new Error("Nenhum outro gestor (na sua filial e mesmo nível) encontrado.");
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
            // O TRIGGER 'set_gestor_hierarchy' VAI ATUALIZAR N2-N5 DESTE COLABORADOR
        };
        
        await supabaseRequest(`colaboradores?matricula=eq.${colaboradorMatricula}`, 'PATCH', payload);
        
        // --- NOVO: CHAMA A FUNÇÃO RPC PARA ATUALIZAR OS FILHOS DELE ---
        await supabaseRequest(
            'rpc/atualizar_subordinados',
            'POST',
            { matricula_pai: colaboradorMatricula }
        );
        
        // Sucesso!
        mostrarNotificacao('Colaborador transferido e hierarquia atualizada! Recarregando...', 'success');

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
        
        // --- ESTA É A CORREÇÃO ---
        // Garante que a matrícula vinda da tabela 'usuarios' não tenha espaços
        state.userMatricula = profile.matricula ? String(profile.matricula).trim() : null; 
        // --- FIM DA CORREÇÃO ---
        
        state.permissoes_filiais = profile.permissoes_filiais || null;
        state.userNome = profile.nome || session.user.email.split('@')[0];

        // Atualizar UI
        document.getElementById('topBarUserName').textContent = state.userNome;
        document.getElementById('dropdownUserName').textContent = state.userNome;
        document.getElementById('dropdownUserEmail').textContent = profile.email || session.user.email;
        if (profile.profile_picture_url) {
            document.getElementById('topBarUserAvatar').src = profile.profile_picture_url;
        }
        // document.getElementById('gestorNameLabel').textContent = `${state.userNome} (Chapa: ${state.userMatricula || 'N/A'})`;
        document.getElementById('dashGestorName').textContent = `${state.userNome} (${state.userMatricula || 'N/A'})`;
        
        // Mostrar links de Admin se for admin
        if(state.isAdmin) {
            document.getElementById('adminLinks').classList.remove('hidden');
            document.getElementById('adminConfigLink').style.display = 'block';
            document.getElementById('adminUpdateLink').style.display = 'block';
        }
        
        // 4. Buscar a função e FILIAL do gestor logado
        if (state.userMatricula) {
            // A query aqui agora usa a matrícula limpa (sem espaços)
            const gestorData = await supabaseRequest(`colaboradores?select=funcao,filial&matricula=eq.${state.userMatricula}&limit=1`, 'GET');
            if (gestorData && gestorData[0]) {
                state.userFuncao = gestorData[0].funcao; 
                state.userFilial = gestorData[0].filial; 
            }
        }
        
        // 5. Carrega TODOS os dados (a definição do nível agora está AQUI DENTRO)
        await loadModuleData();
        
        // 6. REMOVIDA: A definição do state.userNivel foi movida para dentro do loadModuleData()
        
        // *** CORREÇÃO: Movido para DEPOIS do loadModuleData() ***
        // NOVO: Mostrar link "Meus Gestores" para Nível 2+ ou Admin
        if (state.isAdmin || (state.userNivel && state.userNivel >= 2)) {
            document.getElementById('meusGestoresLink').style.display = 'flex';
        }

        document.getElementById('appShell').style.display = 'flex';
        document.body.classList.add('system-active');
        
        // ** O CHECK CRÍTICO (CORRIGIDO) **
        // Se, DEPOIS de rodar a recursão, o time ainda estiver vazio (e não for admin)
        // força o setup.
        if (state.meuTime.length === 0 && !state.isAdmin) {
            iniciarDefinicaoDeTime(true);
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

        // NOVO: Checagem de segurança para a view "Meus Gestores"
        if (newViewId === 'meusGestoresView' && !state.isAdmin && (!state.userNivel || state.userNivel < 2)) {
            mostrarNotificacao('Acesso negado. Esta visão é para Nível 2 ou superior.', 'error');
            showView('meuTimeView', document.querySelector('a[href="#meuTime"]'));
            return;
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
    } else if (cleanHash === 'adicionarTime') {
        // NOVO: Link para a view de "Adicionar" (reutiliza a "primeiroAcessoView")
        viewId = 'primeiroAcessoView';
        navElement = newNavElement;
        iniciarDefinicaoDeTime(); // Chama a função de setup (sem travar a sidebar)
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
