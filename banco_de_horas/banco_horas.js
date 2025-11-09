// Mapeamento de Cabeçalhos
const COLUMN_MAP_ORIGINAL = { // Manter o original para o parse e preview
    'CHAPA': 'Chapa', 'NOME': 'Nome', 'REGIONAL': 'Regional', 'BANDEIRA': 'Bandeira',
    'CODFILIAL': 'Cód. Filial', 'FUNCAO': 'Função', 'SECAO': 'Seção', 
    'TOTAL_EM_HORA': 'Total (Hora)', 'TOTAL_NEGATIVO': 'Total Negativo',
    'VAL_PGTO_BHS': 'Valor Pgto. BH', 'SITUACAO': 'Situação', 'Total Geral': 'Total Geral'
};
const COLUMN_ORDER_ORIGINAL = [
    'CHAPA', 'NOME', 'REGIONAL', 'BANDEIRA', 'CODFILIAL', 'FUNCAO', 'SECAO', 
    'TOTAL_EM_HORA', 'TOTAL_NEGATIVO', 'VAL_PGTO_BHS', 'SITUACAO', 'Total Geral'
];

// NOVAS CONSTANTES PARA EXIBIÇÃO (SOLICITAÇÃO DO JP)
const COLUMN_MAP = {
    'CODFILIAL': 'Filial',
    'CHAPA': 'Matrícula',
    'NOME': 'Nome',
    'FUNCAO': 'Função',
    'TOTAL_EM_HORA': 'Horas',
    'VAL_PGTO_BHS': 'Valor'
};
const COLUMN_ORDER = [
    'CODFILIAL',
    'CHAPA',
    'NOME',
    'FUNCAO',
    'TOTAL_EM_HORA',
    'VAL_PGTO_BHS'
];


// ADICIONADO: URL do Proxy
const SUPABASE_PROXY_URL = '/api/proxy';

let supabaseClient = null;
const sessionStorageAdapter = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

// --- FUNÇÃO DE REQUISIÇÃO CORRIGIDA (Baseada no script.js) ---
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
    // *** CORREÇÃO APLICADA AQUI ***
    // Trocado de 'state.auth.access_token' para 'localStorage.getItem'
    const authToken = localStorage.getItem('auth_token'); 
    
    if (!authToken) {
        console.error("Token JWT não encontrado no localStorage, deslogando.");
        logout(); // A função logout será definida mais abaixo
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
            } catch(e) {
                // Resposta não-JSON
            }
            
            console.error("Erro Supabase (via Proxy):", errorData);
            const detailedError = errorData.message || errorData.error || `Erro na requisição (${response.status})`;
            
            if (response.status === 401) {
                throw new Error("Não autorizado. Sua sessão pode ter expirado.");
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
// --- FIM DA FUNÇÃO CORRIGIDA ---


// --- O estado global permanece o mesmo ---
const state = {
    auth: null,
    userId: null,
    isAdmin: false,
    permissoes_filiais: null, // NOVO: Para permissão
    // filial: null, // REMOVIDO: A coluna não existe
    allData: [] // Cache local
};


document.addEventListener('DOMContentLoaded', () => {
    
    // As variáveis de configuração ficam aqui dentro
    const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8';

    // Elementos da UI
    const ui = {
        appShell: document.getElementById('appShell'),
        userName: document.getElementById('topBarUserName'),
        dropdownUserName: document.getElementById('dropdownUserName'),
        dropdownUserEmail: document.getElementById('dropdownUserEmail'),
        userAvatar: document.getElementById('topBarUserAvatar'),
        adminPanel: document.getElementById('adminPanel'),
        importButton: document.getElementById('importButton'),
        dataInput: document.getElementById('dataInput'),
        importError: document.getElementById('importError'),
        importErrorMessage: document.getElementById('importErrorMessage'),
        previewButton: document.getElementById('previewButton'), // NOVO
        previewContainer: document.getElementById('previewContainer'), // NOVO
        previewTableContainer: document.getElementById('previewTableContainer'), // NOVO
        lastUpdated: document.getElementById('lastUpdated'),
        tableHead: document.getElementById('tableHead'),
        tableBody: document.getElementById('tableBody'),
        tableMessage: document.getElementById('tableMessage'),
        filterChapa: document.getElementById('filterChapa'),
        filterNome: document.getElementById('filterNome'),
        filterRegional: document.getElementById('filterRegional'),
        filterCodFilial: document.getElementById('filterCodFilial'),
        modal: document.getElementById('detailsModal'),
        modalClose: document.getElementById('modalClose'),
        modalTitle: document.getElementById('modalTitle'),
        modalBody: document.getElementById('modalBody'),
        modalNome: document.getElementById('modalNome'),
        modalChapa: document.getElementById('modalChapa'),
        modalComparison: document.getElementById('modalComparison'),
        modalNoHistory: document.getElementById('modalNoHistory'),
        loading: document.getElementById('loading'),
        loadingText: document.getElementById('loadingText'),
        logoutButton: document.getElementById('logoutButton'),
        logoutLink: document.getElementById('logoutLink'),
        profileDropdown: document.getElementById('profileDropdown'),
        profileDropdownButton: document.getElementById('profileDropdownButton'),
        configLink: document.getElementById('configLink'),
        acompanhamentoView: document.getElementById('acompanhamentoView'),
        configuracoesView: document.getElementById('configuracoesView')
    };

    // --- FUNÇÕES ---

    function showLoading(show, text = 'Processando...') {
        ui.loadingText.textContent = text;
        ui.loading.style.display = show ? 'flex' : 'none';
    }

    function showImportError(message) {
        ui.importErrorMessage.textContent = message;
        ui.importError.classList.remove('hidden');
    }

    function formatTimestamp(isoString) {
        if (!isoString) return 'N/A';
        return new Date(isoString).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    async function initializeSupabase() {
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
                window.location.href = '../home.html'; // ATUALIZADO: Caminho do link
                return;
            }

            state.auth = session;
            state.userId = session.user.id;
            
            // *** CORREÇÃO APLICADA AQUI ***
            // Adicionado o 'localStorage.setItem' para igualar ao 'script.js'
            localStorage.setItem('auth_token', session.access_token);


            // --- ATUALIZAÇÃO: Usando o Proxy e buscando permissões ---
            // CORREÇÃO: Removido 'filial' do select, pois a coluna não existe (conforme erro)
            const endpoint = `usuarios?auth_user_id=eq.${state.userId}&select=nome,role,profile_picture_url,permissoes_filiais`;
            let profile = null;
            let profileError = null;

            try {
                const profileResponse = await supabaseRequest(endpoint, 'GET');
                if (profileResponse && profileResponse.length > 0) {
                    profile = profileResponse[0];
                } else {
                    profileError = { message: "Perfil não encontrado ou resposta vazia do proxy." };
                }
            } catch (err) {
                profileError = err;
            }
            // --- FIM DA ATUALIZAÇÃO ---

            if (profileError) {
                console.warn("Erro ao buscar perfil (via proxy):", profileError.message);
                const emailName = session.user.email.split('@')[0];
                ui.userName.textContent = emailName;
                ui.dropdownUserName.textContent = emailName;
                ui.dropdownUserEmail.textContent = session.user.email;
            } else {
                const nome = profile.nome || session.user.email.split('@')[0];
                ui.userName.textContent = nome;
                ui.dropdownUserName.textContent = nome;
                ui.dropdownUserEmail.textContent = session.user.email;
                if (profile.profile_picture_url) {
                    ui.userAvatar.src = profile.profile_picture_url;
                }
                // *** NOVO: Armazena permissões no state ***
                state.isAdmin = (profile.role === 'admin');
                // state.filial = profile.filial || null; // REMOVIDO: Coluna não existe
                state.permissoes_filiais = profile.permissoes_filiais || null; // Vem como array do Supabase
            }
            
            // Mostra/oculta painel admin e exibe o app
            ui.configLink.style.display = state.isAdmin ? 'block' : 'none'; // Mostra/Oculta o LINK
            ui.appShell.style.display = 'flex';
            document.body.classList.add('system-active');


        } catch (err) {
            console.error("Erro na inicialização do Supabase:", err);
            throw err; // Lança o erro para a função 'main' tratar
        }
    }

    function logout() {
        // *** CORREÇÃO APLICADA AQUI ***
        localStorage.removeItem('auth_token'); // Limpa o token
        
        if (supabaseClient) {
            supabaseClient.auth.signOut().then(() => {
                window.location.href = '../home.html'; // ATUALIZADO: Caminho do link
            }).catch((error) => {
                console.error("Erro ao sair:", error);
                window.location.href = '../home.html'; // ATUALIZADO: Caminho do link
            });
        } else {
            window.location.href = '../home.html'; // ATUALIZADO: Caminho do link
        }
    }

    async function listenToMetadata() {
        // ATUALIZADO: Usando supabaseRequest
        try {
            const data = await supabaseRequest('banco_horas_meta?id=eq.1&select=lastUpdatedAt&limit=1', 'GET');
            
            if (data && data.length > 0) {
                ui.lastUpdated.textContent = formatTimestamp(data[0].lastUpdatedAt);
            } else {
                ui.lastUpdated.textContent = 'Nenhuma atualização registrada.';
            }
        } catch (error) {
             ui.lastUpdated.textContent = 'Erro ao buscar.';
             console.warn("Erro ao buscar metadados:", error);
        }
    }

    // --- Nova Função: showView ---
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
        if (ui.profileDropdown) ui.profileDropdown.classList.remove('open');
        
        // Carrega dados específicos da view
        if (viewId === 'acompanhamentoView') {
            // Carrega os dados da tabela só na primeira vez que a view é aberta
            if (state.allData.length === 0) { 
                listenToMetadata();
                renderTableHeader();
                loadAllData();
            }
        } else if (viewId === 'configuracoesView') {
            // A view de config é só HTML, não precisa carregar dados
        }
        feather.replace();
    }

    // --- Nova Função: handleHashChange ---
    function handleHashChange() {
        if (!state.auth) return; // Não faz nada se não estiver logado
        
        const hash = window.location.hash || '#acompanhamento';
        let viewId = 'acompanhamentoView';
        let navElement = document.querySelector('a[href="#acompanhamento"]');

        if (hash === '#configuracoes' && state.isAdmin) {
            viewId = 'configuracoesView';
            navElement = document.querySelector('a[href="#configuracoes"]');
        }
        
        const currentActive = document.querySelector('.view-content.active');
        if (!currentActive || currentActive.id !== viewId) {
            showView(viewId, navElement);
        }
    }


    function renderTableHeader() {
        const tr = document.createElement('tr');
        COLUMN_ORDER.forEach(key => {
            const th = document.createElement('th');
            th.textContent = COLUMN_MAP[key] || key;
            tr.appendChild(th);
        });
        const thAction = document.createElement('th');
        thAction.textContent = 'Ações';
        tr.appendChild(thAction);
        ui.tableHead.innerHTML = '';
        ui.tableHead.appendChild(tr);
    }

    async function loadAllData() {
        showLoading(true, 'Carregando dados...');
        try {
            // ATUALIZADO: Usando supabaseRequest
            const data = await supabaseRequest('banco_horas_data?select=*', 'GET');
            if (!data) throw new Error("A resposta dos dados está vazia.");
            
            state.allData = data;
            applyFilters();
        } catch (err) {
            console.error("Erro ao carregar dados:", err);
            mostrarNotificacao(`Erro ao carregar dados: ${err.message}`, 'error');
        } finally {
            showLoading(false);
        }
    }

    function applyFilters() {
        const filterChapa = ui.filterChapa.value.toLowerCase();
        const filterNome = ui.filterNome.value.toLowerCase();
        const filterRegional = ui.filterRegional.value.toLowerCase();
        const filterCodFilial = ui.filterCodFilial.value.toLowerCase();

        // *** NOVO: Filtro de Permissão ***
        let dataToFilter;
        if (state.isAdmin) {
            dataToFilter = state.allData; // Admin vê tudo
        } else if (Array.isArray(state.permissoes_filiais) && state.permissoes_filiais.length > 0) {
            // Usuário com lista de filiais permitidas
            dataToFilter = state.allData.filter(item => 
                state.permissoes_filiais.includes(String(item.CODFILIAL).trim())
            );
        // CORREÇÃO: Removido o 'else if (state.filial)' pois a coluna não existe
        } else {
            // Usuário não-admin sem filiais setadas = não vê nada
            dataToFilter = []; 
            console.warn("Usuário não é admin e não possui filiais permitidas.");
        }
        // *** FIM DO FILTRO DE PERMISSÃO ***

        const filteredData = dataToFilter.filter(item => { // <-- MUDADO DE state.allData
            const chapa = String(item.CHAPA || '').toLowerCase();
            const nome = String(item.NOME || '').toLowerCase();
            const regional = String(item.REGIONAL || '').toLowerCase();
            const codfilial = String(item.CODFILIAL || '').toLowerCase();

            return (filterChapa === '' || chapa.includes(filterChapa)) &&
                   (filterNome === '' || nome.includes(filterNome)) &&
                   (filterRegional === '' || regional.includes(filterRegional)) &&
                   (filterCodFilial === '' || codfilial.includes(filterCodFilial));
        });

        renderTableBody(filteredData);
    }

    function renderTableBody(data) {
        ui.tableBody.innerHTML = '';
        if (data.length === 0) {
            ui.tableMessage.classList.remove('hidden');
            return;
        }

        ui.tableMessage.classList.add('hidden');
        const fragment = document.createDocumentFragment();

        data.forEach(item => {
            const tr = document.createElement('tr');
            
            // APLICA ESTILOS VISUAIS
            COLUMN_ORDER.forEach(key => {
                const td = document.createElement('td');
                const value = item[key] || '-';
                td.textContent = value;
                
                // Adiciona classes para melhorar a visualização
                if (key === 'NOME' || key === 'FUNCAO') {
                    td.style.whiteSpace = 'normal'; // Permite quebra de linha
                    td.style.minWidth = '200px';
                }
                
                if (key === 'TOTAL_EM_HORA' || key === 'VAL_PGTO_BHS' || key === 'CODFILIAL' || key === 'CHAPA') {
                    td.style.textAlign = 'right'; // Alinha números à direita
                    td.style.fontFamily = 'monospace'; // Melhora leitura de números
                    td.style.paddingRight = '1.5rem';
                }
                
                if (key === 'TOTAL_EM_HORA') {
                    if (String(value).includes('-')) {
                        td.style.color = '#dc2626'; // Vermelho (tailwind red-600)
                        td.style.fontWeight = 'bold';
                    } else if (value !== '-' && value !== '0,00' && value !== '0' && value !== '00:00') {
                        td.style.color = '#16a34a'; // Verde (tailwind green-600)
                        td.style.fontWeight = 'bold';
                    }
                }
                
                if (key === 'VAL_PGTO_BHS') {
                     if (value !== '-' && value !== '0,00' && value !== '0' && !String(value).includes('-')) {
                        td.style.color = '#0077B6'; // Azul (accent)
                        td.style.fontWeight = 'bold';
                    }
                }

                tr.appendChild(td);
            });

            const tdAction = document.createElement('td');
            const viewButton = document.createElement('button');
            // Aplicando classes de botão do style.css
            viewButton.innerHTML = '<i data-feather="eye" class="h-4 w-4"></i>';
            viewButton.className = "btn btn-sm btn-info"; 
            viewButton.title = "Ver Detalhes e Comparar";
            viewButton.onclick = () => showDetails(item.CHAPA);
            tdAction.appendChild(viewButton);
            
            tr.appendChild(tdAction);
            fragment.appendChild(tr);
        });

        ui.tableBody.appendChild(fragment);
        feather.replace();
    }

    function resetModal() {
        ui.modalNome.textContent = '...';
        ui.modalChapa.textContent = '...';
        ui.modalComparison.innerHTML = '';
        ui.modalNoHistory.classList.add('hidden');
    }

    function createComparisonRow(label, oldVal, newVal) {
        oldVal = oldVal || 0;
        newVal = newVal || 0;
        
        let diff = 0;
        let diffClass = 'diff-same';
        
        const oldNum = parseFloat(String(oldVal).replace(',', '.'));
        const newNum = parseFloat(String(newVal).replace(',', '.'));

        if (!isNaN(oldNum) && !isNaN(newNum)) {
            diff = newNum - oldNum;
            if (diff > 0) diffClass = 'diff-up';
            else if (diff < 0) diffClass = 'diff-down';
        }
        
        // Arredonda para 2 casas decimais apenas se for decimal
        const diffText = diff % 1 !== 0 ? diff.toFixed(2) : diff.toString();
        const diffDisplay = diff > 0 ? `+${diffText}` : diffText;


        return `
            <div class="grid grid-cols-3 gap-2 p-2 rounded-md ${diff !== 0 ? 'bg-gray-100' : ''}">
                <span class="font-medium text-gray-700">${label}:</span>
                <span class="text-gray-600">${oldVal}</span>
                <span class="font-bold">${newVal} <span class="${diffClass}">(${diff === 0 ? '-' : diffDisplay})</span></span>
            </div>
        `;
    }

    async function showDetails(chapa) {
        resetModal();
        ui.modal.style.display = 'flex'; // Alterado para 'flex'
        showLoading(true, 'Buscando detalhes...');

        try {
            // ATUALIZADO: Usando supabaseRequest para dados atuais
            const currentDataArr = await supabaseRequest(`banco_horas_data?select=*&CHAPA=eq.${chapa}`, 'GET');
            if (!currentDataArr || currentDataArr.length === 0) {
                throw new Error("Colaborador não encontrado na base de dados.");
            }
            const currentData = currentDataArr[0];

            ui.modalTitle.textContent = `Detalhes: ${currentData.NOME}`;
            ui.modalNome.textContent = currentData.NOME;
            ui.modalChapa.textContent = currentData.CHAPA;

            // ATUALIZADO: Usando supabaseRequest para histórico
            const historyData = await supabaseRequest('banco_horas_history?select=data&order=timestamp.desc&limit=1', 'GET');
            
            if (!historyData || historyData.length === 0) {
                ui.modalNoHistory.classList.remove('hidden');
            } else {
                const oldData = historyData[0].data.find(item => item.CHAPA === chapa);

                if (oldData) {
                    let comparisonHTML = `
                        <div class="grid grid-cols-3 gap-2 p-2 font-bold text-gray-500 text-sm">
                            <span>Campo</span>
                            <span>Valor Anterior</span>
                            <span>Valor Atual (Diferença)</span>
                        </div>
                    `;
                    comparisonHTML += createComparisonRow('Total (Hora)', oldData.TOTAL_EM_HORA, currentData.TOTAL_EM_HORA);
                    comparisonHTML += createComparisonRow('Total Negativo', oldData.TOTAL_NEGATIVO, currentData.TOTAL_NEGATIVO);
                    comparisonHTML += createComparisonRow('Valor Pgto. BH', oldData.VAL_PGTO_BHS, currentData.VAL_PGTO_BHS);
                    comparisonHTML += createComparisonRow('Total Geral', oldData['Total Geral'], currentData['Total Geral']);

                    ui.modalComparison.innerHTML = comparisonHTML;
                } else {
                    ui.modalNoHistory.classList.remove('hidden');
                }
            }

        } catch (err) {
            console.error("Erro ao buscar detalhes:", err);
            ui.modalBody.innerHTML = `<p class="alert alert-error">${err.message}</p>`;
        } finally {
            showLoading(false);
        }
    }
    
    // NOVA FUNÇÃO DE PRÉ-VISUALIZAÇÃO
    function handlePreview() {
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
        
        // Usa as colunas originais (COLUMN_ORDER_ORIGINAL) para o preview
        const headers = COLUMN_ORDER_ORIGINAL;
        
        let tableHTML = '<table class="tabela"><thead><tr>';
        headers.forEach(key => {
            tableHTML += `<th>${COLUMN_MAP_ORIGINAL[key] || key}</th>`;
        });
        tableHTML += '</tr></thead><tbody>';

        previewData.forEach(item => {
            tableHTML += '<tr>';
            headers.forEach(key => {
                tableHTML += `<td>${item[key] || '-'}</td>`;
            });
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';

        ui.previewTableContainer.innerHTML = tableHTML;
        ui.previewContainer.style.display = 'block';
        
        // Mostra uma mensagem de sucesso no lugar do erro
        ui.importErrorMessage.textContent = `Mostrando ${previewData.length} de ${parsedData.length} registros.`;
        ui.importError.className = "alert alert-success mb-4"; // Muda a cor para verde
        ui.importError.classList.remove('hidden');
    }

    function parsePastedData(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) throw new Error("Os dados precisam de pelo menos 2 linhas (cabeçalho e dados).");

        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''));
        
        // USA O ORIGINAL MAP PARA VALIDAR
        const missingHeaders = COLUMN_ORDER_ORIGINAL.filter(col => !headers.includes(col));
        if (missingHeaders.length > 0) {
            throw new Error(`Cabeçalhos faltando: ${missingHeaders.join(', ')}`);
        }

        const data = lines.slice(1).map(line => {
            const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''));
            const obj = {};
            headers.forEach((header, index) => {
                // USA O ORIGINAL MAP PARA PARSEAR
                if (COLUMN_ORDER_ORIGINAL.includes(header)) {
                     obj[header] = values[index] || null;
                }
            });
            if (!obj.CHAPA) {
                // Não lança erro, apenas ignora a linha
                console.warn("Linha sem 'CHAPA' ignorada:", line);
                return null;
            }
            return obj;
        }).filter(Boolean); // Remove linhas nulas (ignoradas)

        return data;
    }

    async function handleImport() {
        ui.importError.classList.add('hidden');
        ui.previewContainer.style.display = 'none'; // NOVO: Esconde o preview ao importar
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
            // *** CORREÇÃO APLICADA AQUI ***
            // Não precisamos mais do 'getSession' aqui, pois o token já está
            // no localStorage e será usado pelo 'supabaseRequest'
            
            // O 'fetch' manual foi substituído pelo 'supabaseRequest'
            
            // AJUSTE: O bloco duplicado foi comentado
            /* REMOVIDO: Esta chamada estava duplicada e causando o erro.
            const result = await supabaseRequest(
                'rpc/import_banco_horas_batch', // Usando uma RPC (função)
                'POST', 
                { data_payload: newData } // Enviando os dados em um payload
            );
            */

            // Se você não tiver uma RPC 'import_banco_horas_batch',
            // a chamada da API serverless '/api/import-banco-horas' ainda é válida.
            // Vamos manter a chamada à API serverless que já existia.
            
            // Revertendo para a chamada da API Serverless, pois é mais provável
            const response = await fetch('/api/import-banco-horas', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}` // Pega o token correto
                },
                body: JSON.stringify(newData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro do servidor: ${response.statusText}`);
            }

            const result = await response.json();
            // Fim da chamada serverless

            ui.dataInput.value = '';
            await loadAllData(); 
            await listenToMetadata(); 
            showLoading(false);
            
            mostrarNotificacao(result.message || "Dados importados com sucesso!", 'success');

        } catch (err) {
            console.error("Erro durante a importação:", err);
            showLoading(false);
            showImportError(`Erro fatal: ${err.message}.`);
        }
    }
    
    // Função de Notificação (copiada do script.js para consistência)
    function mostrarNotificacao(message, type = 'info', timeout = 4000) {
        const container = document.getElementById('notificationContainer');
        if (!container) {
            console.warn("Notification container not found, using alert().");
            alert(message);
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


    // --- INICIALIZAÇÃO E EVENTOS ---
    async function main() {
        showLoading(true, 'Conectando...');
        try {
            await initializeSupabase(); // Espera a inicialização

            // *** CORREÇÃO ADICIONADA AQUI ***
            // Desliga o loading "Conectando..." após a inicialização.
            // As funções chamadas por handleHashChange (como loadAllData)
            // irão gerenciar seus próprios estados de loading.
            showLoading(false); 

            if (state.auth) {
                // --- SESSÃO VÁLIDA ---
                handleHashChange(); 
                window.addEventListener('hashchange', handleHashChange);

                // --- Listeners ---
                ui.importButton.addEventListener('click', handleImport);
                ui.previewButton.addEventListener('click', handlePreview); // NOVO
                ui.modalClose.addEventListener('click', () => ui.modal.style.display = 'none');
                window.addEventListener('click', (event) => {
                    if (event.target == ui.modal) {
                        ui.modal.style.display = 'none';
                    }
                });

                document.querySelector('a[href="#acompanhamento"]').addEventListener('click', (e) => {
                    e.preventDefault();
                    showView('acompanhamentoView', e.currentTarget);
                });
                document.querySelector('a[href="#configuracoes"]').addEventListener('click', (e) => {
                    e.preventDefault();
                    showView('configuracoesView', e.currentTarget);
                });

                [ui.filterChapa, ui.filterNome, ui.filterRegional, ui.filterCodFilial].forEach(input => {
                    input.addEventListener('input', applyFilters);
                });

                ui.logoutButton.addEventListener('click', logout);
                ui.logoutLink.addEventListener('click', logout);
                
                ui.profileDropdownButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    ui.profileDropdown.classList.toggle('open');
                });
                document.addEventListener('click', (e) => {
                    if (ui.profileDropdown && !ui.profileDropdown.contains(e.target)) {
                        ui.profileDropdown.classList.remove('open');
                    }
                });
                // --- Fim dos listeners ---

            } else {
                // --- SESSÃO INVÁLIDA (ou expirada) ---
                showLoading(false);
                console.warn("Nenhuma sessão de autenticação encontrada. A aplicação não será totalmente carregada.");
            }
        } catch (err) {
            // --- ERRO FATAL ---
            console.error("Falha crítica ao carregar a aplicação (main):", err.message);
            mostrarNotificacao(`Falha crítica: ${err.message}`, 'error', 10000);
            showLoading(false); // Garante que o loading saia.
        }
    }

    main();
    
    // Lógica da Sidebar (copiado do app.html)
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
    
    feather.replace(); // Chamada final
});
