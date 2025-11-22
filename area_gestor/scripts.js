// Configuração do Supabase (baseado nos seus outros módulos)
const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8';
const SUPABASE_PROXY_URL = '/api/proxy'; // Usando o proxy
const IMPORT_QLP_API_URL = '/api/import-qlp'; // Nova API

// Define o adaptador para sessionStorage
const sessionStorageAdapter = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

let supabaseClient = null;

// --- Função de Requisição (Proxy) ---
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
    const authToken = localStorage.getItem('auth_token'); 
    
    if (!authToken) {
        console.error("Token JWT não encontrado no localStorage, deslogando.");
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
            if (typeof logout === 'function') {
                logout();
            }
        }
        throw error; 
    }
}

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

    const orQueryPart = `or=(${orConditions.join(',')})`;
    const baseQuery = `colaboradores?select=${columns}&${orQueryPart}`;
    console.log(`[Load] Base Query: ${baseQuery}`);

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
            
            if (teamBatch.length < pageSize) {
                hasMoreData = false; 
            } else {
                currentPage++; 
            }
        } else {
            hasMoreData = false; 
        }
    }
    
    console.log(`[Load] Paginação concluída. Total de ${allTeamMembers.length} membros carregados.`);
    return allTeamMembers; 
}

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
    meuTime: [],
    disponiveis: [],
    gestorConfig: [],
    todasAsFuncoes: [],
    todosUsuarios: [], 
    mapaFotos: {}, 
    bancoHorasMap: {}, 
    bancoHorasHistoryMap: {}, 
    inconsistenciasMap: {}, 
    subordinadosComTimes: [] 
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

function showImportError(message) {
    const importError = document.getElementById('importError');
    const importErrorMessage = document.getElementById('importErrorMessage');
    if (importError && importErrorMessage) {
        importErrorMessage.textContent = message;
        importError.classList.remove('hidden');
        // Reseta para estilo de erro, caso estivesse verde antes
        importError.className = "alert alert-error mb-4";
    }
}

function logout() {
    localStorage.removeItem('auth_token');
    if (supabaseClient) {
        supabaseClient.auth.signOut().then(() => {
            window.location.href = '../home.html';
        }).catch(() => window.location.href = '../home.html');
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
                populateFilters(state.meuTime, 'all'); 
                applyFilters(); 
                break;
            case 'meusGestoresView':
                loadMeusGestoresView();
                break;
            case 'transferirView':
                loadTransferViewData();
                break;
            case 'atualizarQLPView':
                // Limpa mensagens anteriores ao abrir a view
                const importError = document.getElementById('importError');
                const previewContainer = document.getElementById('previewContainer');
                if(importError) importError.classList.add('hidden');
                if(previewContainer) previewContainer.style.display = 'none';
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

function parseHoras(horasStr) {
    if (typeof horasStr !== 'string' || !horasStr) return 0;
    const cleanStr = horasStr.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(cleanStr);
    return isNaN(val) ? 0 : val;
}

function getTendenciaIcon(tendencia) {
    if (tendencia === 'up') return '<i data-feather="arrow-up" class="h-3 w-3 diff-up"></i>'; 
    if (tendencia === 'down') return '<i data-feather="arrow-down" class="h-3 w-3 diff-down"></i>'; 
    if (tendencia === 'new') return '<i data-feather="star" class="h-3 w-3 diff-new" title="Novo"></i>';
    return '<i data-feather="minus" class="h-3 w-3 diff-same"></i>'; 
}

async function loadModuleData() {
    if (!state.userMatricula && !state.isAdmin) {
        console.warn("Usuário sem matrícula, não pode carregar dados de gestor.");
        return;
    }
    
    showLoading(true, 'Carregando dados do time...');
    
    try {
        const [configRes, funcoesRes, gestorMapRes, usuariosRes, bancoHorasRes, bancoHorasHistoryRes, inconsistenciasRes] = await Promise.allSettled([
            supabaseRequest('tabela_gestores_config?select=funcao,pode_ser_gestor,nivel_hierarquia', 'GET'),
            supabaseRequest('colaboradores?select=funcao', 'GET'),
            supabaseRequest('colaboradores?select=matricula,nome', 'GET'), 
            supabaseRequest('usuarios?select=matricula,profile_picture_url', 'GET'), 
            supabaseRequest('banco_horas_data?select="CHAPA","TOTAL_EM_HORA","VAL_PGTO_BHS"', 'GET'), 
            supabaseRequest('banco_horas_history&select=data&order=created_at.desc&limit=1', 'GET'), 
            supabaseRequest('inconsistencias_data?select=chapa', 'GET')
        ]);

        if (configRes.status === 'fulfilled' && configRes.value) {
            state.gestorConfig = configRes.value;
        }
        
        if (funcoesRes.status === 'fulfilled' && funcoesRes.value) {
            const funcoesSet = new Set(funcoesRes.value.map(f => f.funcao)); 
            state.todasAsFuncoes = [...funcoesSet].filter(Boolean);
        }
        
        const gestorMap = (gestorMapRes.status === 'fulfilled' && gestorMapRes.value) 
            ? gestorMapRes.value.reduce((acc, c) => { acc[c.matricula] = c.nome; return acc; }, {}) 
            : {};
        if (state.userMatricula && !gestorMap[state.userMatricula]) {
            gestorMap[state.userMatricula] = state.userNome;
        }

        if (usuariosRes.status === 'fulfilled' && usuariosRes.value) {
            state.todosUsuarios = usuariosRes.value;
            state.mapaFotos = state.todosUsuarios.reduce((acc, u) => {
                if(u.matricula) acc[u.matricula] = u.profile_picture_url;
                return acc;
            }, {});
        }

        if (bancoHorasRes.status === 'fulfilled' && bancoHorasRes.value) {
            state.bancoHorasMap = bancoHorasRes.value.reduce((acc, item) => {
                if (item.CHAPA) { 
                    const normalizedChapa = String(item.CHAPA).trim(); 
                    acc[normalizedChapa] = { 
                        horas: item['TOTAL_EM_HORA'] || '0,00', 
                        valor: item['VAL_PGTO_BHS'] || 'R$ 0,00'
                    };
                }
                return acc;
            }, {});
        } else {
            state.bancoHorasMap = {};
        }

        if (bancoHorasHistoryRes.status === 'fulfilled' && bancoHorasHistoryRes.value && bancoHorasHistoryRes.value[0]) {
            const historyData = bancoHorasHistoryRes.value[0].data; 
            if (Array.isArray(historyData)) {
                state.bancoHorasHistoryMap = historyData.reduce((acc, item) => {
                    if (item.CHAPA) { 
                        const normalizedChapa = String(item.CHAPA).trim();
                        acc[normalizedChapa] = { 
                            horas: item['TOTAL_EM_HORA'] || '0,00',
                            valor: item['VAL_PGTO_BHS'] || 'R$ 0,00'
                        };
                    }
                    return acc;
                }, {});
            }
        } else {
             state.bancoHorasHistoryMap = {};
        }
        
        if (inconsistenciasRes.status === 'fulfilled' && inconsistenciasRes.value) {
            state.inconsistenciasMap = inconsistenciasRes.value.reduce((acc, item) => {
                if (item.chapa) {
                    const normalizedChapa = String(item.chapa).trim();
                    acc[normalizedChapa] = (acc[normalizedChapa] || 0) + 1;
                }
                return acc;
            }, {});
        } else {
            state.inconsistenciasMap = {};
        }

        if (state.userFuncao && state.gestorConfig.length > 0) {
            const gestorRegra = state.gestorConfig.find(r => r.funcao.toUpperCase() === state.userFuncao.toUpperCase());
            if (gestorRegra) {
                state.userNivel = gestorRegra.nivel_hierarquia; 
            }
        }

        const configMapNivel = state.gestorConfig.reduce((acc, regra) => {
            acc[regra.funcao.toLowerCase()] = regra.nivel_hierarquia; 
            return acc;
        }, {});
        
        let disponiveisQuery = 'colaboradores?select=matricula,nome,funcao,filial,gestor_chapa,status'; 
        
        let filterParts = []; 
        let filialFilterPart = null; 
        
        if (Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
            if (state.permissoes_filiais.length === 1) {
                filialFilterPart = `filial.eq.${state.permissoes_filiais[0]}`; 
            } else {
                filialFilterPart = `or(${state.permissoes_filiais.map(f => `filial.eq.${f}`).join(',')})`; 
            }
        } else if (state.userFilial) {
            filialFilterPart = `filial.eq.${state.userFilial}`; 
        } else {
            filialFilterPart = 'filial.eq.IMPOSSIVEL_FILIAL_FILTER'; 
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
        
        const disponiveisPromise = supabaseRequest(disponiveisQuery, 'GET');

        let timeRes = [];
        if (state.isAdmin) {
            const columns = 'matricula,gestor_chapa,funcao,nome,secao,filial,status';
            const baseQuery = `colaboradores?select=${columns}`;
            const pageSize = 1000;
            let currentPage = 0;
            let hasMoreData = true;
            let allTeamMembers = [];
            
            while (hasMoreData) {
                const offset = currentPage * pageSize;
                const query = `${baseQuery}&offset=${offset}&limit=${pageSize}`;
                const teamBatch = await supabaseRequest(query, 'GET');
                
                if (teamBatch && Array.isArray(teamBatch)) {
                    allTeamMembers = allTeamMembers.concat(teamBatch);
                    if (teamBatch.length < pageSize) hasMoreData = false;
                    else currentPage++;
                } else {
                    hasMoreData = false;
                }
            }
            timeRes = allTeamMembers;
            
        } else {
            timeRes = await loadAllTeamMembers(state.userMatricula, state.userNivel);
        }

        if (!timeRes) timeRes = [];

        const bancoHorasMap = state.bancoHorasMap || {};
        const bancoHorasHistoryMap = state.bancoHorasHistoryMap || {}; 
        
        state.meuTime = timeRes.map(c => {
            const nivel_hierarquico = configMapNivel[c.funcao?.toLowerCase()] || null;
            const gestor_imediato_nome = gestorMap[c.gestor_chapa] || 'N/A';
            
            const normalizedMatricula = String(c.matricula).trim();
            const banco = bancoHorasMap[normalizedMatricula] || { horas: '0,00', valor: 'R$ 0,00' }; 
            const bancoHistory = bancoHorasHistoryMap[normalizedMatricula]; 
            
            const inconsistencias_count = state.inconsistenciasMap[normalizedMatricula] || 0;

            let tendencia = 'same';
            if (!bancoHistory) {
                tendencia = 'new'; 
            } else {
                const horasAtual = parseHoras(banco.horas);
                const horasAnterior = parseHoras(bancoHistory.horas);
                if (horasAtual > horasAnterior) tendencia = 'up'; 
                if (horasAtual < horasAnterior) tendencia = 'down'; 
            }
            
            return {
                ...c,
                nivel_hierarquico,
                gestor_imediato_nome,
                banco_horas: banco.horas, 
                banco_valor: banco.valor,  
                banco_tendencia: tendencia, 
                inconsistencias_count 
            };
        });

        const disponiveisRes = await Promise.allSettled([disponiveisPromise]);
        if (disponiveisRes[0].status === 'fulfilled' && disponiveisRes[0].value) {
            state.disponiveis = disponiveisRes[0].value;
        }
        
    } catch (err) {
        console.error("Erro fatal no loadModuleData:", err);
        state.meuTime = []; 
    } finally {
        showLoading(false);
    }
}

function iniciarDefinicaoDeTime(isPrimeiroAcesso = false) {
    document.querySelectorAll('.view-content').forEach(view => {
        view.classList.remove('active');
        view.classList.add('hidden'); 
    });
    
    const setupView = document.getElementById('primeiroAcessoView');
    setupView.classList.remove('hidden');
    setupView.classList.add('active'); 
    
    if (isPrimeiroAcesso) {
        const sidebar = document.querySelector('.sidebar');
        sidebar.style.pointerEvents = 'none';
        sidebar.style.opacity = '0.7';
    }

    let listaDisponiveisFiltrada = state.disponiveis;
    
    const mapaNiveis = state.gestorConfig.reduce((acc, regra) => {
        acc[regra.funcao.toLowerCase()] = regra.nivel_hierarquia; 
        return acc;
    }, {});
    
    listaDisponiveisFiltrada = listaDisponiveisFiltrada.filter(colaborador => {
        const colaboradorGestor = colaborador.gestor_chapa;
        const colaboradorStatus = colaborador.status;
        const colaboradorFuncao = colaborador.funcao;

        if (colaboradorGestor !== null && colaboradorStatus !== 'novato') {
            return false; 
        }

        if (state.userNivel !== null && state.userNivel !== undefined && colaboradorFuncao) {
            const colaboradorNivel = mapaNiveis[colaboradorFuncao.toLowerCase()];
            
            if (colaboradorNivel !== undefined && colaboradorNivel !== null) {
                if (colaboradorNivel === state.userNivel) {
                    return false; 
                }
            }
        }
        return true;
    });

    renderListasTimes(listaDisponiveisFiltrada, state.meuTime); 
    feather.replace();
}

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

async function handleSalvarTime() {
    showLoading(true, 'Salvando seu time (Nível 1)...');
    const listaMeuTimeEl = document.getElementById('listaMeuTime');
    const chapasSelecionadas = Array.from(listaMeuTimeEl.options).map(opt => opt.value);
    
    if (chapasSelecionadas.length === 0) {
        mostrarNotificacao('Selecione pelo menos um colaborador para o seu time (Nível 1).', 'warning');
        showLoading(false);
        return;
    }

    try {
        const promessasPatch = chapasSelecionadas.map(chapa => {
            const payload = {
                gestor_chapa: state.userMatricula, 
                status: 'ativo'
            };
            return supabaseRequest(`colaboradores?matricula=eq.${chapa}`, 'PATCH', payload);
        });

        await Promise.all(promessasPatch);
        mostrarNotificacao('Time direto salvo! Atualizando hierarquia de subordinados (N2-N5)...', 'success');
        
        showLoading(true, 'Atualizando cascata N2-N5...');
        
        const promessasRPC = chapasSelecionadas.map(chapa => {
            return supabaseRequest(
                'rpc/atualizar_subordinados', 
                'POST',                      
                { matricula_pai: chapa }     
            );
        });
        
        await Promise.all(promessasRPC);
        mostrarNotificacao('Hierarquia em cascata atualizada! Recarregando time...', 'success');

        await loadModuleData(); 
        
        const sidebar = document.querySelector('.sidebar');
        sidebar.style.pointerEvents = 'auto';
        sidebar.style.opacity = '1';

        window.location.hash = '#meuTime'; 
        showView('meuTimeView', document.querySelector('a[href="#meuTime"]'));

    } catch (err) {
        mostrarNotificacao(`Erro ao salvar: ${err.message}`, 'error');
    } finally {
        showLoading(false); 
    }
}

function updateDashboardStats(data) {
    if (!data) data = [];
    const total = data.length;
    const ativos = data.filter(c => c.status === 'ativo').length;
    const inativos = data.filter(c => c.status === 'inativo').length;
    const novatos = data.filter(c => c.status === 'novato').length;
    
    let totalHoras = 0;
    let totalInconsistencias = 0;
    
    data.forEach(c => {
        const horasVal = parseFloat((c.banco_horas || '0,00').replace(',', '.'));
        if (!isNaN(horasVal)) {
            totalHoras += horasVal;
        }
        totalInconsistencias += (c.inconsistencias_count || 0);
    });
    
    document.getElementById('statTotalTime').textContent = total;
    document.getElementById('statAtivos').textContent = ativos;
    document.getElementById('statInativos').textContent = inativos;
    document.getElementById('statNovatos').textContent = novatos;
    document.getElementById('statTotalBancoHoras').textContent = totalHoras.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('statTotalInconsistencias').textContent = totalInconsistencias;
}

function populateFilters(sourceData, filterTypeToPopulate) { 
    if (!sourceData) sourceData = [];
    const filialSelect = document.getElementById('filterFilial');
    const funcaoSelect = document.getElementById('filterFuncao');
    
    if (!filialSelect || !funcaoSelect) return; 

    if (filterTypeToPopulate === 'filial' || !filterTypeToPopulate || filterTypeToPopulate === 'all') {
        const filiais = [...new Set(sourceData.map(c => c.filial).filter(Boolean))].sort();
        const currentValue = filialSelect.value; 
        filialSelect.innerHTML = '<option value="">Todas as filiais</option>';
        filiais.forEach(f => {
            const selected = (f === currentValue) ? 'selected' : ''; 
            filialSelect.innerHTML += `<option value="${f}" ${selected}>${f}</option>`;
        });
    }

    if (filterTypeToPopulate === 'funcao' || !filterTypeToPopulate || filterTypeToPopulate === 'all') {
        const funcoes = [...new Set(sourceData.map(c => c.funcao).filter(Boolean))].sort();
        const currentValue = funcaoSelect.value; 
        funcaoSelect.innerHTML = '<option value="">Todas as funções</option>';
        funcoes.forEach(f => {
            const selected = (f === currentValue) ? 'selected' : '';
            funcaoSelect.innerHTML += `<option value="${f}" ${selected}>${f}</option>`;
        });
    }
}

function renderMeuTimeTable(data) {
    const tbody = document.getElementById('tableBodyMeuTime');
    tbody.innerHTML = '';

    if (data.length === 0) {
        if (state.meuTime.length === 0) { 
             tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-gray-500">Seu time ainda não possui colaboradores vinculados.</td></tr>';
        } else { 
             tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-gray-500">Nenhum colaborador encontrado para os filtros aplicados.</td></tr>';
        }
        return;
    }
    
    data.sort((a, b) => {
        if (a.nivel_hierarquico !== b.nivel_hierarquico) {
            return (a.nivel_hierarquico || 99) - (b.nivel_hierarquico || 99); 
        }
        if (a.gestor_imediato_nome !== b.gestor_imediato_nome) {
            return (a.gestor_imediato_nome || '').localeCompare(b.gestor_imediato_nome || '');
        }
        return (a.nome || '').localeCompare(b.nome || '');
    });

    const fragment = document.createDocumentFragment();
    data.forEach(item => {
        const tr = document.createElement('tr');
        const nivel = item.nivel_hierarquico;
        let rowClass = '';
        
        if (item.gestor_chapa === state.userMatricula) {
            rowClass = 'direct-report-row';
        } else {
            rowClass = 'indirect-report-row';
        }

        const status = item.status || 'ativo';
        let statusClass = 'status-ativo';
        if (status === 'inativo') statusClass = 'status-inativo';
        if (status === 'novato') statusClass = 'status-aviso';
        
        tr.className = rowClass;
        const nomeStyle = (nivel && nivel > 0) ? `style="padding-left: ${nivel * 0.75}rem;"` : '';

        const horasVal = parseHoras(item.banco_horas); 
        let horasClass = 'text-gray-600';
        if (horasVal > 0) horasClass = 'text-green-600 font-medium'; 
        if (horasVal < 0) horasClass = 'text-red-600 font-medium'; 
        
        const inconsistenciasVal = item.inconsistencias_count || 0;
        let inconsistenciasClass = 'text-gray-600';
        if (inconsistenciasVal > 0) inconsistenciasClass = 'text-yellow-600 font-medium';

        tr.innerHTML = `
            <td ${nomeStyle}>${item.nome || '-'}</td>
            <td>${item.matricula || '-'}</td>
            <td style="text-align: center;">
                <div class="banco-horas-principal ${horasClass}" style="font-family: monospace;">
                    <span>${item.banco_horas || '0,00'}</span>
                    ${getTendenciaIcon(item.banco_tendencia)}
                </div>
                <small class="banco-horas-valor">${item.banco_valor || 'R$ 0,00'}</small>
            </td>
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
    
    const styleEl = document.getElementById('dynamic-styles') || document.createElement('style');
    styleEl.id = 'dynamic-styles';
    styleEl.innerHTML = `
        .indirect-report-row td {
            background-color: #f9fafb; 
            font-size: 0.875rem;
        }
        .direct-report-row {
        }
    `;
    document.head.appendChild(styleEl);
}

function applyFilters() {
    const nomeFiltro = document.getElementById('filterNome').value.toLowerCase();
    const filialFiltro = document.getElementById('filterFilial').value;
    const funcaoFiltro = document.getElementById('filterFuncao').value;
    const statusFiltro = document.getElementById('filterStatus').value;
    
    let dataForFuncaoFilter = state.meuTime;
    if (filialFiltro) {
        dataForFuncaoFilter = dataForFuncaoFilter.filter(item => item.filial === filialFiltro);
    }
    if (statusFiltro) {
         dataForFuncaoFilter = dataForFuncaoFilter.filter(item => (item.status || 'ativo') === statusFiltro);
    }
    populateFilters(dataForFuncaoFilter, 'funcao'); 

    let dataForFilialFilter = state.meuTime;
    if (funcaoFiltro) {
        dataForFilialFilter = dataForFilialFilter.filter(item => item.funcao === funcaoFiltro);
    }
    if (statusFiltro) {
        dataForFilialFilter = dataForFilialFilter.filter(item => (item.status || 'ativo') === statusFiltro);
    }
    populateFilters(dataForFilialFilter, 'filial'); 
    
    const finalFilteredData = state.meuTime.filter(item => {
        const nomeChapaMatch = nomeFiltro === '' || 
            (item.nome && item.nome.toLowerCase().includes(nomeFiltro)) ||
            (item.matricula && item.matricula.toLowerCase().includes(nomeFiltro));
        
        const filialMatch = filialFiltro === '' || item.filial === filialFiltro;
        const funcaoMatch = funcaoFiltro === '' || item.funcao === funcaoFiltro;
        const statusMatch = statusFiltro === '' || (item.status || 'ativo') === statusFiltro;
        
        return nomeChapaMatch && filialMatch && funcaoMatch && statusMatch;
    });
    
    const totalResultados = finalFilteredData.length; 
    const isFiltering = nomeFiltro || filialFiltro || funcaoFiltro || statusFiltro;
    const tableMessage = document.getElementById('tableMessageMeuTime');
    
    let dadosParaRenderizar = [];
    let mensagem = '';
    
    const LIMITE_EXIBICAO = 600; 

    if (totalResultados === 0) {
        if (isFiltering) {
            mensagem = "Nenhum colaborador encontrado para os filtros aplicados.";
        } else {
            mensagem = "Seu time ainda não possui colaboradores vinculados.";
        }
    } else if (isFiltering) {
        dadosParaRenderizar = finalFilteredData; 
        mensagem = `Exibindo ${totalResultados} resultado(s) para sua busca.`;
        
    } else {
        dadosParaRenderizar = finalFilteredData.slice(0, LIMITE_EXIBICAO); 
        
        if (totalResultados > LIMITE_EXIBICAO) {
            mensagem = `Exibindo os ${LIMITE_EXIBICAO} primeiros de ${totalResultados} registros. Use os filtros para buscar.`;
        } else {
             mensagem = `Exibindo ${totalResultados} registro(s).`;
        }
    }
    
    if (tableMessage) {
        tableMessage.textContent = mensagem;
        if(totalResultados === 0) {
             tableMessage.classList.remove('hidden'); 
        } else {
             const hideMessage = !isFiltering && totalResultados <= LIMITE_EXIBICAO;
             tableMessage.classList.toggle('hidden', hideMessage);
        }
    }
    
    renderMeuTimeTable(dadosParaRenderizar);
}

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

async function loadMeusGestoresView() {
    showLoading(true, 'Carregando gestores e times...');
    const container = document.getElementById('gestoresCardsContainer');
    container.innerHTML = '';

    let gestoresParaExibir = [];
    const funcoesGestor = new Set(state.gestorConfig.filter(g => g.pode_ser_gestor).map(g => g.funcao.toUpperCase())); 

    gestoresParaExibir = state.meuTime.filter(c => 
        c.matricula !== state.userMatricula && 
        c.nivel_hierarquico !== null && c.nivel_hierarquico !== undefined 
    );
    
    if (gestoresParaExibir.length === 0) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Nenhum gestor subordinado encontrado.</p>';
        showLoading(false);
        return;
    }

    const promises = gestoresParaExibir.map(async (gestor) => {
        const timeDoGestor = await loadAllTeamMembers(gestor.matricula, gestor.nivel_hierarquico);
        
        let totalHorasSubTime = 0;
        let totalHorasSubTimeAnterior = 0; 
        let totalInconsistenciasSubTime = 0; 
        const bancoHorasMap = state.bancoHorasMap || {};
        const bancoHorasHistoryMap = state.bancoHorasHistoryMap || {}; 
        
        timeDoGestor.forEach(colaborador => {
            const normalizedMatricula = String(colaborador.matricula).trim(); 
            const banco = bancoHorasMap[normalizedMatricula];
            const bancoHist = bancoHorasHistoryMap[normalizedMatricula];

            if (banco) {
                totalHorasSubTime += parseHoras(banco.horas);
            }
            if (bancoHist) {
                totalHorasSubTimeAnterior += parseHoras(bancoHist.horas); 
            }
            
            const inconsistencias = state.inconsistenciasMap[normalizedMatricula] || 0;
            totalInconsistenciasSubTime += inconsistencias;
        });
        
        let tendenciaHorasTotal = 'same';
        if (totalHorasSubTime > totalHorasSubTimeAnterior) tendenciaHorasTotal = 'up';
        if (totalHorasSubTime < totalHorasSubTimeAnterior) tendenciaHorasTotal = 'down';

        const total = timeDoGestor.length;
        const ativos = timeDoGestor.filter(c => c.status === 'ativo').length;
        const inativos = timeDoGestor.filter(c => c.status === 'inativo').length;
        const novatos = timeDoGestor.filter(c => c.status === 'novato').length;
        
        return {
            ...gestor, 
            foto: state.mapaFotos[gestor.matricula] || 'https://i.imgur.com/80SsE11.png',
            stats: { 
                total, ativos, inativos, novatos, 
                totalHoras: totalHorasSubTime, 
                tendenciaHoras: tendenciaHorasTotal, 
                totalInconsistencias: totalInconsistenciasSubTime 
            }, 
            timeCompleto: timeDoGestor 
        };
    });
    
    const resultados = await Promise.allSettled(promises);
    
    state.subordinadosComTimes = []; 
    
    resultados.forEach(res => {
        if (res.status === 'fulfilled') {
            state.subordinadosComTimes.push(res.value);
        } else {
            console.warn("Falha ao carregar time de um gestor:", res.reason);
        }
    });

    renderGestorCards(state.subordinadosComTimes);
    showLoading(false);
}

function renderGestorCards(gestores) {
    const container = document.getElementById('gestoresCardsContainer');
    container.innerHTML = ''; 

    if (gestores.length === 0) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Nenhum gestor encontrado.</p>';
        return;
    }
    
    gestores.sort((a,b) => (a.nome || '').localeCompare(b.nome || ''));

    gestores.forEach(gestor => {
        const card = document.createElement('div');
        card.className = 'stat-card-dash flex items-start gap-4'; 
        
        const horasFormatadas = gestor.stats.totalHoras.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        let horasClass = 'text-cyan-700';
        if (gestor.stats.totalHoras < 0) horasClass = 'text-red-700'; 
        if (gestor.stats.totalHoras > 0) horasClass = 'text-green-700'; 
        
        const tendenciaIcon = getTendenciaIcon(gestor.stats.tendenciaHoras); 

        card.innerHTML = `
            <img src="${gestor.foto}" class="w-16 h-16 rounded-full object-cover bg-gray-200 flex-shrink-0">
            <div class="flex-1">
                <h4 class="font-bold text-lg text-accent">${gestor.nome || 'N/A'}</h4>
                <p class="text-sm text-gray-600 -mt-1">${gestor.funcao || 'N/A'} (Filial: ${gestor.filial || 'N/A'})</p>
                <p class="text-xs text-blue-600 font-medium mb-2">Gestor Imediato: <strong>${gestor.gestor_imediato_nome || 'N/A'}</strong></p>
                <div class="text-xs grid grid-cols-2 gap-1">
                    <span><i data-feather="users" class="h-3 w-3 inline-block mr-1"></i>Total: <strong>${gestor.stats.total}</strong></span>
                    <span><i data-feather="user-check" class="h-3 w-3 inline-block mr-1 text-green-600"></i>Ativos: <strong>${gestor.stats.ativos}</strong></span>
                    <span><i data-feather="user-plus" class="h-3 w-3 inline-block mr-1 text-yellow-600"></i>Novatos: <strong>${gestor.stats.novatos}</strong></span>
                    <span><i data-feather="user-x" class="h-3 w-3 inline-block mr-1 text-red-600"></i>Inativos: <strong>${gestor.stats.inativos}</strong></span>
                    <span><i data-feather="alert-octagon" class="h-3 w-3 inline-block mr-1 text-yellow-600"></i>Inconsist.: <strong>${gestor.stats.totalInconsistencias}</strong></span>
                    
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

function showGestorTimeModal(matriculaGestor) {
    const gestor = state.subordinadosComTimes.find(g => g.matricula === matriculaGestor);
    if (!gestor) {
        mostrarNotificacao('Erro: Não foi possível encontrar os dados desse gestor.', 'error');
        return;
    }

    document.getElementById('modalGestorTitle').textContent = `Time de ${gestor.nome}`;
    
    renderModalTimeTable(gestor.timeCompleto);

    document.getElementById('gestorTimeModal').style.display = 'flex';
    feather.replace();
}

function renderModalTimeTable(data) {
    const tbody = document.getElementById('modalGestorTableBody');
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-gray-500">Este gestor não possui colaboradores vinculados.</td></tr>';
        return;
    }

    const gestorMap = (state.todosUsuarios || []).reduce((acc, c) => { acc[c.matricula] = c.nome; return acc; }, {});
    if (state.userMatricula && !gestorMap[state.userMatricula]) {
        gestorMap[state.userMatricula] = state.userNome;
    }
    state.subordinadosComTimes.forEach(g => gestorMap[g.matricula] = g.nome); 

    data.sort((a,b) => (a.nome || '').localeCompare(b.nome || ''));

    const fragment = document.createDocumentFragment();
    data.forEach(item => {
        const tr = document.createElement('tr');
        
        const gestorImediato = gestorMap[item.gestor_chapa] || item.gestor_chapa || '-';
        
        const status = item.status || 'ativo';
        let statusClass = 'status-ativo';
        if (status === 'inativo') statusClass = 'status-inativo';
        if (status === 'novato') statusClass = 'status-aviso';

        const normalizedMatricula = String(item.matricula).trim();
        const banco = state.bancoHorasMap[normalizedMatricula] || { horas: '0,00', valor: 'R$ 0,00' };
        const bancoHistory = state.bancoHorasHistoryMap[normalizedMatricula];
        
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
        if (horasVal > 0) horasClass = 'text-green-600 font-medium'; 
        if (horasVal < 0) horasClass = 'text-red-600 font-medium'; 
        
        let inconsistenciasClass = 'text-gray-600';
        if (inconsistencias > 0) inconsistenciasClass = 'text-yellow-600 font-medium';

        tr.innerHTML = `
            <td>${item.nome || '-'}</td>
            <td>${item.matricula || '-'}}</td>
            <td>${gestorImediato}</td>
             <td style="text-align: center;">
                <div class="banco-horas-principal ${horasClass}" style="font-family: monospace;">
                    <span>${banco.horas}</span>
                    ${getTendenciaIcon(tendencia)}
                </div>
                <small class="banco-horas-valor">${banco.valor}</small>
            </td>
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

function closeGestorTimeModal() {
    document.getElementById('gestorTimeModal').style.display = 'none';
    document.getElementById('modalGestorTableBody').innerHTML = ''; 
}

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
                    return false; 
                }
                return r.nivel_hierarquia === state.userNivel;
            })
            .map(r => `"${r.funcao.toUpperCase()}"`); 
        
        if (funcoesGestor.length === 0) {
            throw new Error("Nenhum gestor de nível hierárquico igual ao seu encontrado.");
        }
        
        let queryParts = [
            `funcao=in.(${funcoesGestor.join(',')})`, 
            `matricula.neq.${state.userMatricula}`      
        ];

        let filialFilterPart = null;
        if (Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
            if (state.permissoes_filiais.length === 1) {
                filialFilterPart = `filial.eq.${state.permissoes_filiais[0]}`; 
            } else {
                filialFilterPart = `or(${state.permissoes_filiais.map(f => `filial.eq.${f}`).join(',')})`; 
            }
        } else if (state.userFilial) {
             filialFilterPart = `filial.eq.${state.userFilial}`; 
        } else {
             filialFilterPart = 'filial.eq.IMPOSSIVEL_FILIAL_FILTER';
        }
        queryParts.push(filialFilterPart);

        const query = `colaboradores?select=nome,matricula,funcao,filial&${queryParts.join('&')}`; 
        
        console.log(`[Load Transfer] Query: ${query}`);
        
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
        
        await supabaseRequest(
            'rpc/atualizar_subordinados',
            'POST',
            { matricula_pai: colaboradorMatricula }
        );
        
        mostrarNotificacao('Colaborador transferido e hierarquia atualizada! Recarregando...', 'success');

        state.meuTime = state.meuTime.filter(c => c.matricula !== colaboradorMatricula);
        
        await loadModuleData();

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

// ====================================================================
// FUNÇÕES DE IMPORTAÇÃO (NOVO)
// ====================================================================

function handlePreviewQLP() {
    const dataInput = document.getElementById('dataInput');
    const importError = document.getElementById('importError');
    const importErrorMessage = document.getElementById('importErrorMessage');
    const previewContainer = document.getElementById('previewContainer');
    const previewTableContainer = document.getElementById('previewTableContainer');

    if (!dataInput || !previewTableContainer) return;

    // Reset UI
    importError.classList.add('hidden');
    previewContainer.style.display = 'none';
    previewTableContainer.innerHTML = '';

    const text = dataInput.value.trim();
    if (!text) {
        showImportError("A área de texto está vazia.");
        return;
    }

    try {
        const parsedData = parsePastedDataQLP(text);
        if (parsedData.length === 0) {
            throw new Error("Nenhum dado válido encontrado.");
        }

        // Renderiza preview
        const previewData = parsedData.slice(0, 15);
        let html = '<table class="tabela"><thead><tr>';
        const headers = Object.keys(previewData[0]);
        headers.forEach(h => html += `<th>${h}</th>`);
        html += '</tr></thead><tbody>';
        
        previewData.forEach(row => {
            html += '<tr>';
            headers.forEach(h => html += `<td>${row[h] || '-'}</td>`);
            html += '</tr>';
        });
        html += '</tbody></table>';
        
        previewTableContainer.innerHTML = html;
        previewContainer.style.display = 'block';
        
        // Mostra msg sucesso (hack usando o elemento de erro)
        importErrorMessage.textContent = `Pré-visualização: ${previewData.length} de ${parsedData.length} linhas.`;
        importError.className = "alert alert-success mb-4";
        importError.classList.remove('hidden');

    } catch (e) {
        showImportError(e.message);
    }
}

async function handleImportQLP() {
    const dataInput = document.getElementById('dataInput');
    const text = dataInput.value.trim();
    if (!text) {
        showImportError("A área de texto está vazia.");
        return;
    }

    try {
        const parsedData = parsePastedDataQLP(text);
        if (parsedData.length === 0) {
            throw new Error("Nenhum dado válido encontrado.");
        }

        showLoading(true, `Enviando ${parsedData.length} registros...`);

        // Usamos fetch direto pois é uma API customizada nova
        const authToken = localStorage.getItem('auth_token');
        const response = await fetch(IMPORT_QLP_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(parsedData)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || `Erro na importação (${response.status})`);
        }

        const result = await response.json();
        mostrarNotificacao(result.message, 'success');
        
        // Limpa o input
        dataInput.value = '';
        document.getElementById('previewContainer').style.display = 'none';
        document.getElementById('importError').classList.add('hidden');

    } catch (e) {
        showImportError(`Erro na importação: ${e.message}`);
    } finally {
        showLoading(false);
    }
}

function parsePastedDataQLP(text) {
    const lines = text.split('\n');
    if (lines.length < 2) throw new Error("O arquivo deve ter cabeçalho e dados.");

    // Detecta delimitador
    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : (firstLine.includes(';') ? ';' : ',');

    const headers = lines[0].split(delimiter).map(h => h.trim().toUpperCase().replace(/"/g, ''));
    
    // Validação básica de colunas
    const required = ['MATRICULA', 'NOME']; // Mínimo
    // Mapeamento flexível: CHAPA -> MATRICULA
    const mapHeader = (h) => {
        if (h === 'CHAPA') return 'MATRICULA';
        if (h === 'FUNC') return 'FUNCAO';
        return h;
    };

    const normalizedHeaders = headers.map(mapHeader);
    
    const missing = required.filter(r => !normalizedHeaders.includes(r));
    if (missing.length > 0) {
        // Se faltar MATRICULA, tenta ver se tem CHAPA (já tratado acima, mas por segurança)
        throw new Error(`Colunas obrigatórias faltando: ${missing.join(', ')}`);
    }

    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''));
        const obj = {};
        let hasData = false;

        normalizedHeaders.forEach((header, index) => {
            const val = values[index];
            if (val) hasData = true;
            obj[header] = val;
        });

        if (hasData && obj['MATRICULA']) {
            result.push(obj);
        }
    }
    return result;
}


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
        
        state.userMatricula = profile.matricula ? String(profile.matricula).trim() : null; 
        
        state.permissoes_filiais = profile.permissoes_filiais || null;
        state.userNome = profile.nome || session.user.email.split('@')[0];

        document.getElementById('topBarUserName').textContent = state.userNome;
        document.getElementById('dropdownUserName').textContent = state.userNome;
        document.getElementById('dropdownUserEmail').textContent = profile.email || session.user.email;
        if (profile.profile_picture_url) {
            document.getElementById('topBarUserAvatar').src = profile.profile_picture_url;
        }
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
        
        if (state.isAdmin || (state.userNivel && state.userNivel >= 2)) {
            document.getElementById('meusGestoresLink').style.display = 'flex';
        }

        document.getElementById('appShell').style.display = 'flex';
        document.body.classList.add('system-active');
        
        if (state.meuTime.length === 0 && !state.isAdmin) {
            iniciarDefinicaoDeTime(true);
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
            console.warn("Time vazio, forçando setup.");
            iniciarDefinicaoDeTime();
            return; 
        }

        if (newViewId === 'meusGestoresView' && !state.isAdmin && (!state.userNivel || state.userNivel < 2)) {
            mostrarNotificacao('Acesso negado. Esta visão é para Nível 2 ou superior.', 'error');
            showView('meuTimeView', document.querySelector('a[href="#meuTime"]'));
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
    } else if (cleanHash === 'adicionarTime') {
        viewId = 'primeiroAcessoView';
        navElement = newNavElement;
        iniciarDefinicaoDeTime(); 
    }
    
    showView(viewId, navElement);
}

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

    // --- LISTENERS DA IMPORTAÇÃO QLP (NOVO) ---
    const btnPreviewQLP = document.getElementById('previewButton');
    const btnImportQLP = document.getElementById('importButton');
    if (btnPreviewQLP) btnPreviewQLP.addEventListener('click', handlePreviewQLP);
    if (btnImportQLP) btnImportQLP.addEventListener('click', handleImportQLP);

    feather.replace();
});
