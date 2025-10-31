const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8';

const SUPABASE_PROXY_URL = '/api/proxy';

window.GG = {
    supabaseClient: null,
    currentUser: null, 
    authUser: null, 
    
    dados: {
        avaliacoes: [], 
        colaboradores: {}, 
        gestores: {}, 
        indicadores: [], 
        resultadosIndicadores: [],
        metas: [], 
        usuarios: [], 
        solicitacoes: [], 
        colaboradoresGestores: [], 
        avaliacaoAtual: null, 
        dadosCarregados: false, 
        avaliacoesFiltradas: []
    },
    
    COMPETENCIAS: [
        // ... (competências, sem alterações) ...
        { 
            nome: 'COMUNICAÇÃO E INFLUÊNCIA', 
            fatores: [
                'Respeita as opiniões divergentes, escuta de maneira aberta e respeitosa?',
                'Cria um ambiente de segurança e confiança mútua?'
            ] 
        },
        { 
            nome: 'DISCIPLINA DE EXECUÇÃO', 
            fatores: [
                'Garante planejamento e execução dentro dos prazos.',
                'Assume responsabilidade, cumpre normas e procedimentos.',
                'Conhece o negócio e acompanha resultados através de dados.'
            ] 
        },
        { 
            nome: 'GESTÃO DE CONFLITOS', 
            fatores: [
                'Consegue resolver conflitos/discussões na equipe?',
                'Trata de forma imparcial nas resoluções ?'
            ] 
        },
        { 
            nome: 'LIDERANÇA E GESTÃO DE PESSOAS', 
            fatores: [
                'Age com clareza na distribuição das atividades e responsabilidades.',
                'Tem facilidade em desenvolver atividades com perfis diferentes do seu',
                'Possui preocupação para o desenvolvimento dos liderados?'
            ],
            dissertativa: 'Cite uma promoção recente do setor (opcional):' 
        }
    ],

    init() {
        console.log('🚀 Iniciando Sistema G&G v5.4 (Filtros Pessoal)...');
        
        try {
            if (!SUPABASE_URL || SUPABASE_URL.includes('URL_DO_SEU_PROJETO')) {
                throw new Error('Supabase URL não configurada em script.js');
            }
            if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('SUA_CHAVE_PUBLICA')) {
                throw new Error('Supabase Anon Key não configurada em script.js');
            }
            const { createClient } = supabase;
            this.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } catch (error) {
            console.error("Erro ao inicializar Supabase:", error.message);
            this.mostrarAlerta("Erro crítico na configuração do cliente. Verifique o console.", 'error', 60000);
            return;
        }

        this.injectIndicatorStyles();
        this.setupUIListeners();

        window.addEventListener('hashchange', () => this.handleHashChange());

        this.supabaseClient.auth.onAuthStateChange((event, session) => {
            console.log("Auth Event:", event);
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                if (session) {
                    this.initializeApp(session);
                }
            } else if (event === 'SIGNED_OUT') {
                window.location.href = 'index.html'; 
            }
        });

        this.supabaseClient.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                console.log("Sessão encontrada. Inicializando app.");
                this.initializeApp(session);
            } else {
                console.log("Nenhuma sessão encontrada. Redirecionando para login.");
                window.location.href = 'index.html'; 
            }
        }).catch(error => {
            console.error("Erro ao pegar sessão:", error);
            window.location.href = 'index.html'; 
        });
    },

    async initializeApp(session) {
        this.authUser = session.user;
        localStorage.setItem('auth_token', session.access_token);

        try {
            const endpoint = `usuarios?auth_user_id=eq.${this.authUser.id}&select=*`;
            let profileResponse = await this.supabaseRequest(endpoint, 'GET');

            if (!profileResponse || !profileResponse[0]) {
                console.warn("Perfil não encontrado na tabela 'usuarios'. Criando um novo...");
                const newProfile = {
                    auth_user_id: this.authUser.id,
                    email: this.authUser.email,
                    nome: this.authUser.user_metadata?.full_name || this.authUser.email.split('@')[0],
                    profile_picture_url: this.authUser.user_metadata?.avatar_url || null,
                    role: 'user', 
                    status: 'ativo' 
                };
                const createResponse = await this.supabaseRequest('usuarios', 'POST', newProfile);
                if (!createResponse || !createResponse[0]) {
                    throw new Error("Falha ao criar o perfil de usuário no banco de dados.");
                }
                this.currentUser = createResponse[0];
                console.log("Novo perfil criado com sucesso!", this.currentUser);
            } else {
                this.currentUser = profileResponse[0];
                console.log("Perfil 'usuarios' encontrado:", this.currentUser);
            }

            this.showMainSystem();
            
            await this.carregarDadosIniciais();
            
            this.handleHashChange();
            
        } catch (error) {
            console.error("Erro detalhado na inicialização do app:", error);
            this.mostrarAlerta(`Erro ao carregar dados: ${error.message}`, 'error', 10000);
            this.logout(); 
        }
    },

    logout() {
        // ... (função existente, sem alterações) ...
        console.log("Deslogando usuário...");
        this.currentUser = null;
        this.authUser = null;
        localStorage.removeItem('auth_token');
        
        if (this.supabaseClient) {
            this.supabaseClient.auth.signOut();
        } else {
            window.location.href = 'index.html';
        }
    },

    setupUIListeners() {
        // ... (função existente, sem alterações) ...
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.querySelector('.sidebar');
        const appShell = document.getElementById('appShell');
        const sidebarOverlay = document.getElementById('sidebarOverlay');

        if (sidebarToggle && sidebar && appShell && sidebarOverlay) {
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

            document.querySelectorAll('.sidebar .nav-item').forEach(item => {
                item.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        document.body.classList.remove('sidebar-open');
                    }
                });
            });
        }

        const profileButton = document.getElementById('profileDropdownButton');
        const profileDropdown = document.getElementById('profileDropdown');

        if (profileButton && profileDropdown) {
            profileButton.addEventListener('click', (e) => {
                e.stopPropagation();
                profileDropdown.classList.toggle('open');
            });
            
            document.addEventListener('click', (e) => {
                if (profileDropdown && !profileDropdown.contains(e.target)) {
                    profileDropdown.classList.remove('open');
                }
            });
        }
    },

    showMainSystem() {
        // ... (função existente, sem alterações) ...
        document.getElementById('appShell').style.display = 'flex';
        document.body.classList.add('system-active');

        const userName = this.currentUser?.nome || this.currentUser?.email || 'Usuário';
        const userAvatar = this.currentUser?.profile_picture_url || 'https://i.imgur.com/80SsE11.png'; 

        document.getElementById('topBarUserName').textContent = userName;
        document.getElementById('topBarUserAvatar').src = userAvatar;
        document.getElementById('dropdownUserName').textContent = userName;
        document.getElementById('dropdownUserEmail').textContent = this.currentUser?.email || '...';
        
        this.loadPerfilView();
        
        feather.replace();
    },
    
    showView(viewId, element = null) {
        // ... (função existente, sem alterações) ...
        document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
        const viewEl = document.getElementById(viewId);
        if(viewEl) viewEl.classList.add('active');

        document.querySelectorAll('.sidebar nav .nav-item').forEach(item => item.classList.remove('active'));
        if (element) {
            element.classList.add('active');
        } else {
            const matchingLink = document.querySelector(`.sidebar nav .nav-item[href="#${viewId.replace('View', '')}"]`);
            if (matchingLink) matchingLink.classList.add('active');
        }

        const newHash = '#' + viewId.replace('View', '');
        if (window.location.hash !== newHash) {
            history.pushState(null, '', newHash);
        }

        const profileDropdown = document.getElementById('profileDropdown');
        if (profileDropdown) profileDropdown.classList.remove('open');

        try {
            switch (viewId) {
                case 'homeView': this.atualizarEstatisticasHome(); break;
                case 'avaliacaoView': this.inicializarFormularioAvaliacao(); break;
                case 'historicoView': this.carregarHistorico(); break;
                case 'relatoriosView': this.gerarRelatorios(); break;
                case 'configuracoesView': this.inicializarConfiguracoes(); break;
                case 'perfilView': this.loadPerfilView(); break;
            }
        } catch(e) { console.error(`Erro ao carregar view ${viewId}:`, e); }
        feather.replace();
    },

    handleHashChange() {
        // ... (função existente, sem alterações) ...
        if (!this.currentUser) return; 
        
        const hash = window.location.hash;
        let viewId = 'homeView'; 
        let navElement = document.querySelector('a[href="#home"]');

        if (hash && hash !== '#') {
            const cleanHash = hash.substring(1);
            const newViewId = cleanHash + 'View';
            const newNavElement = document.querySelector(`a[href="${hash}"]`);
            
            if (document.getElementById(newViewId)) {
                viewId = newViewId;
                navElement = newNavElement;
            }
        }
        
        const currentActive = document.querySelector('.view-content.active');
        if (!currentActive || currentActive.id !== viewId) {
             this.showView(viewId, navElement);
        }
    },

    async supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
        // ... (função existente, sem alterações) ...
        const authToken = localStorage.getItem('auth_token');
        if (!authToken) {
            console.error("Token JWT não encontrado, deslogando.");
            this.logout();
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
                 this.logout(); 
            }
            throw error; 
        }
    },
    
    
    async carregarDadosIniciais() {
        // ... (função existente, sem alterações) ...
        this.mostrarLoading(true);
        this.atualizarStatusDados('🔄 Carregando dados...', 'info');
        try {
            const results = await Promise.allSettled([
                this.supabaseRequest('colaboradores?select=*', 'GET'), 
                this.supabaseRequest('gestores?select=*', 'GET'),
                this.supabaseRequest('avaliacoes?select=*', 'GET'), 
                this.supabaseRequest('indicadores?select=*&order=indicador.asc', 'GET'),
                this.supabaseRequest('resultados_indicadores?select=*', 'GET'),
                this.supabaseRequest('indicadores_metas?select=*', 'GET') 
            ]);
            
            const [colabRes, gestRes, avalRes, indRes, resIndRes, metasRes] = results;

            this.dados.colaboradores = (colabRes.status === 'fulfilled' && colabRes.value) ? colabRes.value.reduce((acc, c) => { if(c.matricula) acc[String(c.matricula).trim()] = c; return acc; }, {}) : {};
            this.dados.gestores = (gestRes.status === 'fulfilled' && gestRes.value) ? gestRes.value.reduce((acc, g) => { if(g.matricula) acc[String(g.matricula).trim()] = g; return acc; }, {}) : {};
            this.dados.avaliacoes = (avalRes.status === 'fulfilled' && avalRes.value) ? avalRes.value : [];
            this.dados.indicadores = (indRes.status === 'fulfilled' && indRes.value) ? indRes.value : [];
            this.dados.resultadosIndicadores = (resIndRes.status === 'fulfilled' && resIndRes.value) ? resIndRes.value : [];
            this.dados.metas = (metasRes.status === 'fulfilled' && metasRes.value) ? metasRes.value : []; 
            
            results.forEach((res, i) => {
                if (res.status === 'rejected') {
                    console.error(`Falha ao carregar dados [${i}]:`, res.reason);
                }
            });

            console.log("Dados carregados:", this.dados);

            this.dados.dadosCarregados = true;
            this.atualizarStatusConexaoHome(true);
            this.atualizarEstatisticasHome();
            this.atualizarStatusDados(`✅ Dados carregados!`, 'success', 3000);
            console.log("✅ Sistema inicializado!");
        } catch (e) {
            this.atualizarStatusConexaoHome(false);
            this.atualizarStatusDados(`❌ Falha ao carregar dados: ${e.message}`, 'danger');
            console.error('❌ Erro fatal no carregamento:', e);
        } finally {
            this.mostrarLoading(false);
        }
    },

    buscarColaborador(matricula) {
        // ... (lógica de status existente, sem alterações) ...
        this.limparIndicadores();
        if (!matricula) { this.limparCamposColaborador(); return; }
        const colaborador = this.dados.colaboradores[String(matricula).trim()];
        const campoMatricula = document.getElementById('matriculaAvaliado');
        
        if (colaborador) {
            if (colaborador.status && colaborador.status !== 'ativo') {
                this.limparCamposColaborador();
                campoMatricula.style.borderColor = '#f59e0b'; 
                this.mostrarAlerta(`Colaborador ${matricula} não está 'ativo'. Status: ${colaborador.status}.`, 'warning');
                return;
            }

            document.getElementById('nomeAvaliado').value = colaborador.nome || '';
            document.getElementById('funcaoAvaliado').value = colaborador.funcao || '';
            document.getElementById('filial').value = colaborador.filial || '';
            campoMatricula.style.borderColor = 'var(--primary)';
            this.atualizarIndicadoresExibidos();
        } else {
            this.limparCamposColaborador();
            campoMatricula.style.borderColor = '#dc2626';
            this.mostrarAlerta(`Colaborador ${matricula} não encontrado.`, 'warning');
        }
    },
    
    atualizarIndicadoresExibidos() {
        // ... (função existente, sem alterações) ...
        const container = document.getElementById('indicadoresContainer'); 
        const matricula = document.getElementById('matriculaAvaliado').value;
        const mesReferenciaInput = document.getElementById('mesReferencia').value;
        if (!matricula || !mesReferenciaInput) { this.limparIndicadores(); return; }
        
        const colaborador = this.dados.colaboradores[String(matricula).trim()];
        if (!colaborador) { this.limparIndicadores(); return; }
        
        const secao = colaborador.secao || 'GERAL'; 
        const filial = colaborador.filial; 
        const mesFormatado = `${mesReferenciaInput}-01`;

        if (!filial) {
            container.innerHTML = `<p style="color: #dc2626; font-style: italic;">Colaborador sem filial definida. Não é possível carregar indicadores.</p>`;
            return;
        }

        const indicadoresAplicaveis = this.dados.indicadores.filter(ind => ind.secao === 'GERAL' || ind.secao === secao);
        const metasDaFilial = this.dados.metas.filter(m => m.filial === filial);
        const resultadosDaFilial = this.dados.resultadosIndicadores.filter(res => 
            res.mes_referencia === mesFormatado && res.filial === filial
        );
        
        this.renderizarIndicadores(indicadoresAplicaveis, metasDaFilial, resultadosDaFilial);
    },
    
    parseIndicadorValor(valorStr) {
        // ... (função existente, sem alterações) ...
        if (typeof valorStr !== 'string' || !valorStr) return NaN;
        
        let cleanStr = valorStr.replace(/R\$|%|<|>|=/g, "").trim();
        
        if (cleanStr.includes(',') && cleanStr.includes('.')) {
            cleanStr = cleanStr.replace(/\./g, ''); 
            cleanStr = cleanStr.replace(',', '.'); 
        } 
        else if (cleanStr.includes(',')) {
             cleanStr = cleanStr.replace(',', '.'); 
        }
        return parseFloat(cleanStr);
    },

    renderizarIndicadores(indicadores, metasDaFilial, resultadosDaFilial) {
        // ... (função existente, sem alterações) ...
        const container = document.getElementById('indicadoresContainer');
        if (!indicadores || indicadores.length === 0) {
            container.innerHTML = `<p style="color: #6c757d; font-style: italic;">Nenhum indicador aplicável para esta seção.</p>`; return;
        }
        
        const mapaMetas = metasDaFilial.reduce((acc, m) => {
            acc[m.indicador_id] = { meta: m.meta, tipo: m.tipo };
            return acc;
        }, {});
        
        const mapaResultados = resultadosDaFilial.reduce((acc, res) => {
            acc[res.indicador_id] = res.valor_realizado;
            return acc;
        }, {});
        
        let html = '<div class="indicator-grid">'; 
        let indicadoresRenderizados = 0;
        
        indicadores.forEach((ind) => {
            const metaObj = mapaMetas[ind.id];
            const realizadoStr = mapaResultados[ind.id] !== undefined ? String(mapaResultados[ind.id]) : 'N/A';

            if (!metaObj) {
                return;
            }

            indicadoresRenderizados++;
            const metaStr = metaObj.meta || 'N/A';
            const tipo = metaObj.tipo || 'texto'; 

            const metaNum = this.parseIndicadorValor(metaStr);
            const realizadoNum = this.parseIndicadorValor(realizadoStr);
            
            let vizHtml = '';
            
            if (tipo === 'texto' || isNaN(metaNum) || isNaN(realizadoNum) || metaNum === 0) {
                vizHtml = `
                    <div class="indicador-texto">
                        <div>Meta: <span>${this.escapeHTML(metaStr)}</span></div>
                        <div>Realizado: <span>${this.escapeHTML(realizadoStr)}</span></div>
                    </div>
                `;
            } else {
                const isInverse = metaStr.includes('<') || tipo === 'inverso'; 
                let percent = (realizadoNum / metaNum) * 100;
                
                let isGood = false;
                if (isInverse) {
                    isGood = (realizadoNum <= metaNum);
                } else {
                    isGood = (realizadoNum >= metaNum);
                }
                
                let barWidthPercent = percent;

                if (isInverse) {
                     if (realizadoNum <= metaNum) {
                        barWidthPercent = (realizadoNum / metaNum) * 100; 
                     } else {
                        barWidthPercent = 100; 
                     }
                }
                
                barWidthPercent = Math.max(0, Math.min(barWidthPercent, 100)); 
                
                let barColorClass = isGood ? 'bar-good' : 'bar-bad';
                if (percent > 100 && !isInverse) {
                    barColorClass = 'bar-excellent';
                    barWidthPercent = 100; 
                }

                vizHtml = `
                    <div class="indicador-numerico">
                        <div class="indicador-valores">
                            <span>Meta: ${this.escapeHTML(metaStr)}</span>
                            <strong>${this.escapeHTML(realizadoStr)}</strong>
                        </div>
                        <div class="progress-bar-viz">
                            <div class="progress-bar-inner ${barColorClass}" style="width: ${barWidthPercent}%;"></div>
                        </div>
                    </div>
                `;
            }

            html += `
                <div class="indicator-viz-card">
                    <label>${this.escapeHTML(ind.indicador)}</label>
                    ${vizHtml}
                </div>
            `;
        });
        
        html += '</div>';
        
        if (indicadoresRenderizados === 0) {
            container.innerHTML = `<p style="color: #6c757d; font-style: italic;">Nenhuma meta de indicador cadastrada para a filial deste colaborador.</p>`;
            return;
        }

        container.innerHTML = html;
    },
    
    limparIndicadores() { document.getElementById('indicadoresContainer').innerHTML = `<p style="color: #6c757d;">Selecione o colaborador e o mês de referência.</p>`; },
    
    limparCamposColaborador() {
        // ... (função existente, sem alterações) ...
        ['matriculaAvaliado', 'nomeAvaliado', 'funcaoAvaliado', 'filial'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('matriculaAvaliado').style.borderColor = '#d1d5db';
        this.limparIndicadores();
    },
    
    buscarGestor(matricula) {
        // ... (lógica de status existente, sem alterações) ...
        if (!matricula) { this.limparCamposGestor(); return; }
        const gestor = this.dados.gestores[String(matricula).trim()];
        const campoMatricula = document.getElementById('matriculaGestor');
        
        if (gestor) {
            if (gestor.status && gestor.status !== 'ativo') {
                this.limparCamposGestor();
                campoMatricula.style.borderColor = '#f59e0b'; 
                this.mostrarAlerta(`Gestor ${matricula} não está 'ativo'. Status: ${gestor.status}.`, 'warning');
                return;
            }
            
            document.getElementById('nomeGestor').value = gestor.nome || '';
            campoMatricula.style.borderColor = 'var(--primary)';
        } else {
            this.limparCamposGestor();
            campoMatricula.style.borderColor = '#dc2626';
            this.mostrarAlerta(`Gestor ${matricula} não encontrado.`, 'warning');
        }
    },
    
    limparCamposGestor() {
        // ... (função existente, sem alterações) ...
        ['matriculaGestor', 'nomeGestor'].forEach(id => document.getElementById(id).value = '');
         document.getElementById('matriculaGestor').style.borderColor = '#d1d5db';
    },

    calcularResultado() {
        // ... (função existente, sem alterações) ...
        const { fatoresAvaliados, totalFatores } = this.atualizarProgresso();
        if (fatoresAvaliados === 0) { this.mostrarAlerta('Avalie pelo menos um fator de competência!', 'danger'); return; }
        
        let somaNotas = 0;
        document.querySelectorAll('#competenciasContainer input[type="radio"]:checked').forEach(radio => { somaNotas += parseInt(radio.value); });
        
        const pontuacao = (somaNotas / totalFatores); 
        let classificacao = 'PRECISA MELHORAR';
        if (pontuacao >= 4.5) classificacao = 'EXCELENTE';
        else if (pontuacao >= 3.5) classificacao = 'BOM';
        else if (pontuacao >= 2.5) classificacao = 'REGULAR';
        
        const classDisplay = document.getElementById('classificacaoDisplay');
        document.getElementById('pontuacaoDisplay').textContent = pontuacao.toFixed(1);
        classDisplay.textContent = classificacao;
        classDisplay.className = `classificacao-display classificacao-${classificacao.replace(' ', '-')}`; 
        
        document.getElementById('resultadoCard').classList.add('show');
        
        this.dados.avaliacaoAtual = { pontuacao, classificacao, fatoresAvaliados, totalFatores };
        
        const podeHabilitar = (fatoresAvaliados === totalFatores) && document.getElementById('nomeAvaliado').value && document.getElementById('nomeGestor').value && document.getElementById('mesReferencia').value;
        document.getElementById('btnSalvar').disabled = !podeHabilitar;
        
        if (podeHabilitar) {
            this.mostrarAlerta('Resultado calculado. Pronto para salvar!', 'success');
        } else if (fatoresAvaliados < totalFatores) {
             this.mostrarAlerta(`Continue avaliando. Faltam ${totalFatores - fatoresAvaliados} fatores.`, 'warning');
        } else {
            this.mostrarAlerta('Preencha todos os dados (*) para habilitar o salvamento.', 'warning');
        }
    },
    
    async salvarAvaliacao() {
        // ... (função existente, sem alterações) ...
        if (!this.dados.avaliacaoAtual) { this.mostrarAlerta('Calcule o resultado primeiro!', 'danger'); return; }
        if (this.dados.avaliacaoAtual.fatoresAvaliados !== this.dados.avaliacaoAtual.totalFatores) {
            this.mostrarAlerta('Responda todas as perguntas de competência antes de salvar.', 'warning');
            return;
        }
        
        const matriculaAvaliado = document.getElementById('matriculaAvaliado').value;
        const nomeAvaliado = document.getElementById('nomeAvaliado').value;
        const matriculaGestor = document.getElementById('matriculaGestor').value;
        const nomeGestor = document.getElementById('nomeGestor').value;
        const filial = document.getElementById('filial').value;
        const mesReferenciaInput = document.getElementById('mesReferencia').value;

        if (!matriculaAvaliado || !nomeAvaliado || !matriculaGestor || !nomeGestor || !filial || !mesReferenciaInput) {
            this.mostrarAlerta('Preencha todos os campos obrigatórios (*)!', 'danger'); return;
        }
        const mesReferencia = `${mesReferenciaInput}-01`;
        
        const dissertativaLideranca = document.getElementById('dissertativa_lideranca')?.value || null;

        const avaliacao = {
            nome_avaliado: nomeAvaliado, matricula_avaliado: matriculaAvaliado, 
            nome_gestor: nomeGestor, matricula_gestor: matriculaGestor, 
            filial: filial,
            pontuacao: parseFloat(this.dados.avaliacaoAtual.pontuacao.toFixed(1)), 
            classificacao: this.dados.avaliacaoAtual.classificacao,
            comentarios: document.getElementById('comentarios').value || null, 
            pontos_fortes: document.getElementById('pontosFortes').value || null, 
            oportunidades: document.getElementById('oportunidades').value || null,
            mes_referencia: mesReferencia,
            dissertativa_lideranca: dissertativaLideranca,
            avaliador_user_id: this.currentUser.id 
        };
        
        try {
            this.mostrarLoading(true);
            const resultado = await this.supabaseRequest('avaliacoes', 'POST', avaliacao);
            
            if (resultado && resultado.length > 0) {
                this.dados.avaliacoes.push(resultado[0]); 
                this.atualizarEstatisticasHome(); 
                this.mostrarAlerta(`Avaliação de ${mesReferenciaInput} salva!`, 'success');
                this.limparFormulario(true); 
            } else { throw new Error('Falha ao salvar. Nenhum dado retornado.'); }
        } catch (error) { 
            this.mostrarAlerta('Erro ao salvar: ' + error.message, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },
    
    limparFormulario(force = false) {
        // ... (função existente, sem alterações) ...
         if (force || confirm('🗑️ Deseja limpar todos os campos?')) {
             document.getElementById('form-avaliacao').reset();
             document.querySelectorAll('#competenciasContainer input[type="radio"]').forEach(radio => radio.checked = false);
             this.limparCamposColaborador(); this.limparCamposGestor();
             document.getElementById('resultadoCard').classList.remove('show');
             document.getElementById('btnSalvar').disabled = true;
             this.atualizarProgresso(); this.dados.avaliacaoAtual = null;
         }
     },
     
    inicializarFormularioAvaliacao() { 
        // ... (função existente, sem alterações) ...
        this.criarFormularioCompetencias(); 
        this.atualizarProgresso(); 
        this.limparIndicadores(); 
    },
    
    criarFormularioCompetencias() {
        // ... (função existente, sem alterações) ...
        const container = document.getElementById('competenciasContainer'); container.innerHTML = '';
        let fatorIndex = 0;
        this.COMPETENCIAS.forEach((c, ci) => {
            let cardHtml = `<div class="competencia-card"><div class="competencia-header">${this.escapeHTML(c.nome)}</div>`;
            c.fatores.forEach((f, fi) => {
                cardHtml += `<div class="fator-item"><div class="fator-texto">${this.escapeHTML(f)}</div><div class="rating-container"><span class="rating-label">Inadequado</span>`;
                for (let i = 1; i <= 5; i++) {
                    cardHtml += `<label class="rating-option"><input type="radio" name="fator_${fatorIndex}" value="${i}" onchange="window.GG.atualizarProgresso()"><span>${i}</span></label>`;
                }
                cardHtml += '<span class="rating-label">Excelente</span></div></div>';
                fatorIndex++;
            });
            
            if (c.dissertativa) {
                cardHtml += `
                    <div class="fator-item">
                        <div class="form-group">
                            <label for="dissertativa_lideranca">${this.escapeHTML(c.dissertativa)}</label>
                            <textarea id="dissertativa_lideranca" rows="3" placeholder="Descreva aqui..."></textarea>
                        </div>
                    </div>
                `;
            }
            
            cardHtml += '</div>'; container.innerHTML += cardHtml;
        });
    },
    
    atualizarProgresso() {
        // ... (função existente, sem alterações) ...
        const totalFatores = this.COMPETENCIAS.reduce((sum, c) => sum + c.fatores.length, 0);
        const fatoresAvaliados = document.querySelectorAll('#competenciasContainer input[type="radio"]:checked').length;
        
        const porcentagem = totalFatores > 0 ? (fatoresAvaliados / totalFatores) * 100 : 0;
        document.getElementById('progressFill').style.width = porcentagem + '%';
        document.getElementById('progressText').textContent = `${fatoresAvaliados} de ${totalFatores} fatores avaliados`;
        
        return { fatoresAvaliados, totalFatores };
    },

    async carregarHistorico(){ 
        // ... (função existente, sem alterações) ...
        this.mostrarLoading(true);
        if (!this.dados.dadosCarregados) {
            await this.carregarDadosIniciais();
        }
        
        if (!this.dados.dadosCarregados) {
            this.mostrarAlerta("Não foi possível carregar os dados. Verifique a conexão.", 'error');
            this.mostrarLoading(false);
            return;
        }

        this.preencherFiltroFiliaisHistorico();
        this.aplicarFiltros(); 
        
        const statusEl = document.getElementById('accessStatusHistorico');
        if (this.currentUser.role === 'admin') {
            statusEl.textContent = 'Modo Administrador: Visualizando todos os registros.';
            statusEl.style.display = 'block';
        } else {
             statusEl.textContent = 'Modo Usuário: Visualizando apenas suas avaliações.';
             statusEl.style.display = 'block';
        }
        
        this.mostrarLoading(false);
    },
    
    preencherFiltroFiliaisHistorico() {
        // ... (função existente, sem alterações) ...
        const filtroFilial = document.getElementById('filtroFilial');
        const filiais = [...new Set(this.dados.avaliacoes.map(av => av.filial))].sort();
        filtroFilial.innerHTML = '<option value="">Todas</option>';
        filiais.forEach(f => { if(f) filtroFilial.innerHTML += `<option value="${f}">Filial ${f}</option>`; });
    },
    
    aplicarFiltros() {
        // ... (função existente, sem alterações) ...
        let dadosFiltrados;
        
        if (this.currentUser.role !== 'admin') {
            dadosFiltrados = this.dados.avaliacoes.filter(av => av.avaliador_user_id === this.currentUser.id);
        } else {
            dadosFiltrados = [...this.dados.avaliacoes];
        }

        const filtroMes = document.getElementById('filtroMes').value;
        const filtroFilial = document.getElementById('filtroFilial').value;
        const filtroClass = document.getElementById('filtroClassificacao').value;
        const filtroNome = document.getElementById('filtroNome').value.toLowerCase();
        const filtroGestor = document.getElementById('filtroGestor').value.toLowerCase();

        if (filtroMes) dadosFiltrados = dadosFiltrados.filter(av => av.mes_referencia && av.mes_referencia.startsWith(filtroMes));
        if (filtroFilial) dadosFiltrados = dadosFiltrados.filter(av => av.filial === filtroFilial);
        if (filtroClass) dadosFiltrados = dadosFiltrados.filter(av => av.classificacao === filtroClass);
        if (filtroNome) dadosFiltrados = dadosFiltrados.filter(av => av.nome_avaliado && av.nome_avaliado.toLowerCase().includes(filtroNome));
        if (filtroGestor) dadosFiltrados = dadosFiltrados.filter(av => av.nome_gestor && av.nome_gestor.toLowerCase().includes(filtroGestor));

        if (this.currentUser.role !== 'admin' && this.currentUser.filial) {
             if (Array.isArray(this.currentUser.permissoes_filiais) && this.currentUser.permissoes_filiais.length > 0) {
                 dadosFiltrados = dadosFiltrados.filter(av => this.currentUser.permissoes_filiais.includes(av.filial));
             } 
             else if (this.currentUser.filial) {
                 dadosFiltrados = dadosFiltrados.filter(av => av.filial === this.currentUser.filial);
             }
        }

        this.dados.avaliacoesFiltradas = dadosFiltrados;
        this.renderizarTabelaHistorico(dadosFiltrados);
    },
    
    renderizarTabelaHistorico(dados) {
        // ... (função existente, sem alterações) ...
        const container = document.getElementById('tabelaHistorico');
        if (dados.length === 0) { container.innerHTML = `<p style="text-align: center; padding: 20px; color: #6c757d;">Nenhuma avaliação encontrada para os filtros selecionados.</p>`; return; }
        
        let html = '<table class="tabela"><thead><tr><th>Mês Ref.</th><th>Avaliado</th><th>Gestor</th><th>Filial</th><th>Pontuação</th><th>Classificação</th></tr></thead><tbody>';
        dados.sort((a,b) => new Date(b.mes_referencia || b.created_at) - new Date(a.mes_referencia || a.created_at));
        
        dados.forEach(av => {
            const mesAno = av.mes_referencia ? new Date(av.mes_referencia + 'T05:00:00').toLocaleDateString('pt-BR', { year: 'numeric', month: 'short'}) : 'N/A';
            html += `<tr>
                        <td>${mesAno}</td>
                        <td>${this.escapeHTML(av.nome_avaliado)}</td>
                        <td>${this.escapeHTML(av.nome_gestor)}</td>
                        <td>${this.escapeHTML(av.filial)}</td>
                        <td><strong>${av.pontuacao}</strong></td>
                        <td>${this.escapeHTML(av.classificacao)}</td>
                    </tr>`;
        });
        html += '</tbody></table>'; container.innerHTML = html;
    },
    
    limparFiltros() {
        // ... (função existente, sem alterações) ...
        ['filtroMes', 'filtroFilial', 'filtroClassificacao', 'filtroNome', 'filtroGestor'].forEach(id => document.getElementById(id).value = '');
        this.aplicarFiltros();
    },
    
    exportarDados() {
        // ... (função existente, sem alterações) ...
        if (this.dados.avaliacoesFiltradas.length === 0) { this.mostrarAlerta("Nenhum dado para exportar.", "warning"); return; }
        let csv = 'mes_referencia,nome_avaliado,matricula_avaliado,nome_gestor,matricula_gestor,filial,pontuacao,classificacao,pontos_fortes,oportunidades,comentarios,dissertativa_lideranca\n';
        this.dados.avaliacoesFiltradas.forEach(av => {
            const row = [
                av.mes_referencia, av.nome_avaliado, av.matricula_avaliado, 
                av.nome_gestor, av.matricula_gestor, av.filial, 
                av.pontuacao, av.classificacao,
                `"${(av.pontos_fortes || '').replace(/"/g, '""')}"`, 
                `"${(av.oportunidades || '').replace(/"/g, '""')}"`, 
                `"${(av.comentarios || '').replace(/"/g, '""')}"`,
                `"${(av.dissertativa_lideranca || '').replace(/"/g, '""')}"`
            ];
            csv += row.join(',') + '\n';
        });
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `historico_avaliacoes_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.mostrarAlerta("Download iniciado.", "success");
    },
    
    async inicializarConfiguracoes() {
        // ... (função existente, atualizada na v5.3) ...
        if (this.currentUser.role !== 'admin') {
            document.getElementById('configAdminOnly').style.display = 'none';
            document.getElementById('configUserOnly').style.display = 'block';
            document.getElementById('accessStatusConfig').textContent = 'Acesso negado. Requer permissão de Administrador.';
            document.getElementById('accessStatusConfig').className = 'access-status alert alert-error'; 
            document.getElementById('accessStatusConfig').style.display = 'block';
            return;
        }
        
        document.getElementById('configAdminOnly').style.display = 'block';
        document.getElementById('configUserOnly').style.display = 'none';
        document.getElementById('accessStatusConfig').textContent = 'Acesso de Administrador concedido.';
        document.getElementById('accessStatusConfig').className = 'access-status'; 
        document.getElementById('accessStatusConfig').style.display = 'block';

        this.mostrarLoading(true);
        if (!this.dados.dadosCarregados) {
            await this.carregarDadosIniciais(); 
        }
        
        await this.carregarDadosAdmin(); 

        this.renderizarTabelasAdmin(); 
        
        this.renderizarTabelaIndicadores(); 
        this.renderizarTabelaMetas();       
        this.popularDropdownsConfig();    
        this.renderizarTabelaResultados();  
        
        this.renderizarTabelaColaboradoresGestores(); 
        
        this.limparFormIndicador(); 
        this.limparFormMeta(); 
        this.limparFormResultado();

        this.showConfigTab('usuarios', document.querySelector('.config-tab-item')); 
        
        this.mostrarLoading(false);
        feather.replace(); 
    },

    showConfigTab(tabId, element) {
        // ... (função existente, sem alterações) ...
        document.querySelectorAll('#configAdminOnly .config-tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.config-tabs .config-tab-item').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const content = document.getElementById(`configTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
        if (content) {
            content.classList.add('active');
        }
        if (element) {
            element.classList.add('active');
        }
        feather.replace();
    },
    
    // -----------------------------------------------------------------
    // FUNÇÕES DE ADMINISTRAÇÃO (Aba Usuários)
    // -----------------------------------------------------------------

    async carregarDadosAdmin() {
        // ... (função existente, sem alterações) ...
        try {
            const [usuariosRes, solicitacoesRes] = await Promise.allSettled([
                this.supabaseRequest('usuarios?select=*&order=nome.asc', 'GET'),
                this.supabaseRequest('solicitacoes_acesso?status=eq.pendente&order=created_at.desc', 'GET')
            ]);

            this.dados.usuarios = (usuariosRes.status === 'fulfilled' && usuariosRes.value) ? usuariosRes.value : [];
            this.dados.solicitacoes = (solicitacoesRes.status === 'fulfilled' && solicitacoesRes.value) ? solicitacoesRes.value : [];
            
        } catch (e) {
            this.mostrarAlerta(`Erro ao carregar dados de admin: ${e.message}`, 'error');
            console.error(e);
        }
    },
    
    renderizarTabelasAdmin() {
        // ... (função existente, sem alterações) ...
        this.renderizarTabelaUsuarios();
        this.renderizarTabelaSolicitacoes();
        feather.replace();
    },

    renderizarTabelaSolicitacoes() {
        // ... (função existente, sem alterações) ...
        const tbody = document.querySelector('#tabela-solicitacoes-admin tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (this.dados.solicitacoes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma solicitação pendente.</td></tr>';
            return;
        }
        
        this.dados.solicitacoes.forEach(s => {
            const data = new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            tbody.innerHTML += `<tr>
                <td>${this.escapeHTML(s.nome)}</td>
                <td>${this.escapeHTML(s.email)}</td>
                <td style="white-space: normal; min-width: 250px;">${this.escapeHTML(s.motivo)}</td>
                <td>${data}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-success" onclick="window.GG.mostrarAlerta('Função (Aprovar) ainda não implementada. Crie o usuário manualmente e rejeite a solicitação.', 'info', 10000)">
                        <i data-feather="check" class="h-4 w-4"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="window.GG.rejeitarSolicitacao(${s.id})">
                        <i data-feather="x" class="h-4 w-4"></i>
                    </button>
                </td>
            </tr>`;
        });
    },

    async rejeitarSolicitacao(id) {
        // ... (função existente, sem alterações) ...
        if (!confirm('Tem certeza que deseja rejeitar esta solicitação?')) return;
        try {
            this.mostrarLoading(true);
            await this.supabaseRequest(`solicitacoes_acesso?id=eq.${id}`, 'PATCH', { status: 'rejeitado' });
            this.mostrarAlerta('Solicitação rejeitada.', 'success');
            await this.carregarDadosAdmin(); 
            this.renderizarTabelasAdmin(); 
        } catch(e) {
            this.mostrarAlerta(`Erro ao rejeitar: ${e.message}`, 'error');
        } finally {
            this.mostrarLoading(false);
        }
    },

    renderizarTabelaUsuarios() {
        // ... (função existente, sem alterações) ...
        const tbody = document.querySelector('#tabela-usuarios-admin tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (this.dados.usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum usuário encontrado.</td></tr>';
            return;
        }
        
        this.dados.usuarios.forEach(u => {
            const statusClass = u.status === 'ativo' ? 'text-green-600' : 'text-red-600';
            const roleClass = u.role === 'admin' ? 'font-bold text-blue-600' : 'text-gray-700';
            
            tbody.innerHTML += `<tr>
                <td>${this.escapeHTML(u.nome)}</td>
                <td>${this.escapeHTML(u.email)}</td>
                <td>${this.escapeHTML(u.matricula || '--')}</td>
                <td class="${roleClass}">${this.escapeHTML(u.role || 'user')}</td>
                <td>${this.escapeHTML(u.filial || '--')}</td>
                <td class="${statusClass}">${this.escapeHTML(u.status || 'inativo')}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="window.GG.abrirModalEdicaoUsuario(${u.id})">
                        <i data-feather="edit-2" class="h-4 w-4"></i>
                    </button>
                </td>
            </tr>`;
        });
    },

    abrirModalEdicaoUsuario(id) {
        // ... (função existente, sem alterações) ...
        const usuario = this.dados.usuarios.find(u => u.id === id);
        if (!usuario) {
            this.mostrarAlerta('Usuário não encontrado.', 'error');
            return;
        }
        
        document.getElementById('modal-user-id').value = usuario.id;
        document.getElementById('modal-user-nome').value = usuario.nome || '';
        document.getElementById('modal-user-email').value = usuario.email || '';
        document.getElementById('modal-user-matricula').value = usuario.matricula || '';
        document.getElementById('modal-user-filial').value = usuario.filial || '';
        document.getElementById('modal-user-role').value = usuario.role || 'user';
        document.getElementById('modal-user-status').value = usuario.status || 'inativo';

        document.getElementById('userEditModal').style.display = 'flex';
        feather.replace();
    },

    fecharModalUsuario() {
        // ... (função existente, sem alterações) ...
        document.getElementById('userEditModal').style.display = 'none';
        document.getElementById('userEditForm').reset();
    },

    async salvarModalUsuario() {
        // ... (função existente, sem alterações) ...
        const id = document.getElementById('modal-user-id').value;
        const payload = {
            nome: document.getElementById('modal-user-nome').value,
            matricula: document.getElementById('modal-user-matricula').value || null,
            filial: document.getElementById('modal-user-filial').value || null,
            role: document.getElementById('modal-user-role').value,
            status: document.getElementById('modal-user-status').value
        };

        if (!id || !payload.nome) {
            this.mostrarAlerta('Nome é obrigatório.', 'warning');
            return;
        }

        try {
            this.mostrarLoading(true);
            const resultado = await this.supabaseRequest(`usuarios?id=eq.${id}`, 'PATCH', payload);
            
            const index = this.dados.usuarios.findIndex(u => u.id == id);
            if (index > -1) {
                this.dados.usuarios[index] = { ...this.dados.usuarios[index], ...resultado[0] };
            }
            
            if (this.currentUser.id == id) {
                this.currentUser = { ...this.currentUser, ...resultado[0] };
                this.showMainSystem(); 
            }
            
            this.renderizarTabelaUsuarios();
            this.fecharModalUsuario();
            this.mostrarAlerta('Usuário atualizado com sucesso!', 'success');
            
        } catch (e) {
            this.mostrarAlerta(`Erro ao salvar usuário: ${e.message}`, 'error');
        } finally {
            this.mostrarLoading(false);
        }
    },
    
    // -----------------------------------------------------------------
    // FUNÇÕES DE ADMINISTRAÇÃO (Aba Pessoal) - ATUALIZADAS
    // -----------------------------------------------------------------

    renderizarTabelaColaboradoresGestores() {
        const tbody = document.querySelector('#tabela-colaboradores-gestores tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        // Combina as listas
        const colabs = Object.values(this.dados.colaboradores).map(c => ({...c, tipo: 'Colaborador'}));
        const gests = Object.values(this.dados.gestores).map(g => ({...g, tipo: 'Gestor'}));
        let pessoal = [...colabs, ...gests];
        this.dados.colaboradoresGestores = pessoal; // Salva a lista combinada

        // APLICA FILTROS
        const filtroNome = document.getElementById('filtroPessoalNome').value.toLowerCase();
        const filtroFilial = document.getElementById('filtroPessoalFilial').value;
        const filtroTipo = document.getElementById('filtroPessoalTipo').value;
        const filtroStatus = document.getElementById('filtroPessoalStatus').value;

        if (filtroNome) {
            pessoal = pessoal.filter(p => 
                (p.nome && p.nome.toLowerCase().includes(filtroNome)) || 
                (p.matricula && p.matricula.toLowerCase().includes(filtroNome))
            );
        }
        if (filtroFilial) {
            pessoal = pessoal.filter(p => p.filial === filtroFilial);
        }
        if (filtroTipo) {
            pessoal = pessoal.filter(p => p.tipo === filtroTipo);
        }
        if (filtroStatus) {
            pessoal = pessoal.filter(p => (p.status || 'ativo') === filtroStatus);
        }

        pessoal.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        
        if (pessoal.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum colaborador ou gestor encontrado para os filtros.</td></tr>';
            return;
        }
        
        pessoal.forEach(p => {
            const status = p.status || 'ativo'; 
            let statusClass = '';
            switch(status) {
                case 'ativo': statusClass = 'status-ativo'; break;
                case 'inativo': statusClass = 'status-inativo'; break;
                case 'demitido': statusClass = 'status-demitido'; break;
                case 'aviso': statusClass = 'status-aviso'; break;
                default: statusClass = 'status-inativo';
            }
            
            tbody.innerHTML += `<tr>
                <td>${this.escapeHTML(p.nome)}</td>
                <td>${this.escapeHTML(p.matricula)}</td>
                <td>${this.escapeHTML(p.tipo)}</td>
                <td>${this.escapeHTML(p.filial || '--')}</td>
                <td>${this.escapeHTML(p.secao || '--')}</td>
                <td><span class="status-badge ${statusClass}">${this.escapeHTML(status)}</span></td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="window.GG.abrirModalEdicaoPessoal('${p.tipo}', '${p.matricula}')">
                        <i data-feather="edit-2" class="h-4 w-4"></i>
                    </button>
                </td>
            </tr>`;
        });
        feather.replace();
    },

    // NOVO: Abre o modal em modo "Adicionar"
    abrirModalNovoPessoal() {
        document.getElementById('pessoalEditForm').reset();
        document.getElementById('modalPessoalTitle').textContent = 'Adicionar Novo Pessoal';
        document.getElementById('modal-pessoal-matricula-original').value = ''; // Limpa a chave
        
        // Habilita campos-chave
        document.getElementById('modal-pessoal-matricula').readOnly = false;
        document.getElementById('modal-pessoal-tipo').disabled = false;
        document.getElementById('modal-pessoal-status').value = 'ativo'; // Padrão

        document.getElementById('pessoalEditModal').style.display = 'flex';
        feather.replace();
    },

    abrirModalEdicaoPessoal(tipo, matricula) {
        const TabelaDados = (tipo === 'Colaborador') ? this.dados.colaboradores : this.dados.gestores;
        const pessoa = TabelaDados[String(matricula).trim()];
        
        if (!pessoa) {
            this.mostrarAlerta('Pessoa não encontrada.', 'error');
            return;
        }
        
        document.getElementById('modalPessoalTitle').textContent = `Editar ${tipo}`;
        document.getElementById('modal-pessoal-matricula-original').value = matricula; // Guarda a chave
        
        document.getElementById('modal-pessoal-matricula').value = pessoa.matricula || '';
        document.getElementById('modal-pessoal-tipo').value = tipo;
        document.getElementById('modal-pessoal-nome').value = pessoa.nome || '';
        document.getElementById('modal-pessoal-funcao').value = pessoa.funcao || '';
        document.getElementById('modal-pessoal-filial').value = pessoa.filial || '';
        document.getElementById('modal-pessoal-secao').value = pessoa.secao || ''; // Campo novo
        document.getElementById('modal-pessoal-status').value = pessoa.status || 'ativo';

        // Desabilita campos-chave na edição
        document.getElementById('modal-pessoal-matricula').readOnly = true;
        document.getElementById('modal-pessoal-tipo').disabled = true;

        document.getElementById('pessoalEditModal').style.display = 'flex';
        feather.replace();
    },

    fecharModalPessoal() {
        document.getElementById('pessoalEditModal').style.display = 'none';
        document.getElementById('pessoalEditForm').reset();
    },

    async salvarModalPessoal() {
        const matriculaOriginal = document.getElementById('modal-pessoal-matricula-original').value;
        const isEditMode = (matriculaOriginal !== '');
        
        const matricula = document.getElementById('modal-pessoal-matricula').value.trim();
        const tipo = document.getElementById('modal-pessoal-tipo').value;
        
        if (!matricula || !tipo) {
            this.mostrarAlerta('Erro: Matrícula e Tipo são obrigatórios.', 'error');
            return;
        }
        
        const payload = {
            matricula: matricula, // Sempre envia a matrícula
            nome: document.getElementById('modal-pessoal-nome').value,
            funcao: document.getElementById('modal-pessoal-funcao').value || null,
            filial: document.getElementById('modal-pessoal-filial').value || null,
            secao: document.getElementById('modal-pessoal-secao').value.trim().toUpperCase() || null, // Campo novo
            status: document.getElementById('modal-pessoal-status').value
        };

        if (!payload.nome) {
             this.mostrarAlerta('Erro: Nome é obrigatório.', 'error');
            return;
        }
        
        const TabelaNome = (tipo === 'Colaborador') ? 'colaboradores' : 'gestores';
        const TabelaDados = (tipo === 'Colaborador') ? this.dados.colaboradores : this.dados.gestores;

        try {
            this.mostrarLoading(true);
            let resultado;
            
            if (isEditMode) {
                // MODO EDIÇÃO (UPDATE)
                // Remove matricula do payload, pois não queremos alterar a chave primária
                delete payload.matricula; 
                resultado = await this.supabaseRequest(`${TabelaNome}?matricula=eq.${matriculaOriginal}`, 'PATCH', payload);
                
                if (resultado && resultado[0]) {
                    // Atualiza o objeto local
                    TabelaDados[String(matriculaOriginal).trim()] = { ...TabelaDados[String(matriculaOriginal).trim()], ...resultado[0] };
                    this.mostrarAlerta('Dados atualizados com sucesso!', 'success');
                } else {
                    throw new Error('Nenhum dado retornado após a atualização.');
                }
                
            } else {
                // MODO ADIÇÃO (INSERT)
                // Verifica se a matrícula já existe
                if (TabelaDados[matricula]) {
                    this.mostrarAlerta(`Erro: Matrícula '${matricula}' já existe para um ${tipo}.`, 'error');
                    this.mostrarLoading(false);
                    return;
                }
                
                resultado = await this.supabaseRequest(TabelaNome, 'POST', payload);

                if (resultado && resultado[0]) {
                     // Adiciona o novo registro ao objeto local
                    TabelaDados[String(matricula).trim()] = resultado[0];
                    this.mostrarAlerta('Novo registro salvo com sucesso!', 'success');
                } else {
                     throw new Error('Nenhum dado retornado após a inserção.');
                }
            }
            
            this.renderizarTabelaColaboradoresGestores(); // Re-renderiza a tabela
            this.fecharModalPessoal();
            
        } catch (e) {
            this.mostrarAlerta(`Erro ao salvar: ${e.message}`, 'error');
        } finally {
            this.mostrarLoading(false);
        }
    },

    // -----------------------------------------------------------------
    // FUNÇÕES DE ADMINISTRAÇÃO (Aba Indicadores)
    // -----------------------------------------------------------------

    renderizarTabelaIndicadores() {
        // ... (função existente, sem alterações) ...
        const tbody = document.querySelector('#tabela-indicadores tbody');
        tbody.innerHTML = '';
        if (!this.dados.indicadores || this.dados.indicadores.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum indicador cadastrado.</td></tr>'; 
            return; 
        }
        
        this.dados.indicadores.forEach(ind => {
            tbody.innerHTML += `<tr id="indicador-row-${ind.id}">
                <td>${ind.id}</td>
                <td>${this.escapeHTML(ind.indicador)}</td>
                <td>${this.escapeHTML(ind.secao)}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="window.GG.editarIndicador(${ind.id})"><i data-feather="edit-2" class="h-4 w-4"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="window.GG.excluirIndicador(${ind.id})"><i data-feather="trash-2" class="h-4 w-4"></i></button>
                </td></tr>`;
        });
        feather.replace();
    },

    async salvarIndicador() {
        // ... (função existente, sem alterações) ...
        if (this.currentUser.role !== 'admin') return;
        const id = document.getElementById('edit-indicador-id').value;
        const dadosIndicador = {
            indicador: document.getElementById('add-indicador-nome').value.trim(),
            secao: document.getElementById('add-indicador-secao').value.trim().toUpperCase() || 'GERAL',
        };
        if (!dadosIndicador.indicador || !dadosIndicador.secao) { 
            this.mostrarAlerta('Nome e Seção são obrigatórios.', 'warning'); 
            return; 
        }
        
        try {
            this.mostrarLoading(true);
            if (id) { 
                const resultado = await this.supabaseRequest(`indicadores?id=eq.${id}`, 'PATCH', dadosIndicador);
                const index = this.dados.indicadores.findIndex(ind => ind.id == id);
                if (index > -1) this.dados.indicadores[index] = resultado[0];
                this.mostrarAlerta('Indicador atualizado!', 'success');
            } else { 
                const resultado = await this.supabaseRequest('indicadores', 'POST', dadosIndicador);
                this.dados.indicadores.push(resultado[0]);
                this.mostrarAlerta('Indicador adicionado!', 'success');
            }
            this.dados.indicadores.sort((a,b) => a.indicador.localeCompare(b.indicador)); 
            this.limparFormIndicador();
            this.renderizarTabelaIndicadores();
            this.popularDropdownsConfig(); 
        } catch (e) { 
            this.mostrarAlerta(`Erro ao salvar indicador: ${e.message}`, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },

    editarIndicador(id) {
        // ... (função existente, sem alterações) ...
        if (this.currentUser.role !== 'admin') return;
        const indicador = this.dados.indicadores.find(ind => ind.id === id);
        if (!indicador) return; 
        
        document.getElementById('edit-indicador-id').value = id;
        document.getElementById('add-indicador-nome').value = indicador.indicador;
        document.getElementById('add-indicador-secao').value = indicador.secao; 
        document.getElementById('add-indicador-nome').focus();
        this.mostrarAlerta(`Editando Indicador #${id}. Altere e clique em Salvar.`, 'info');
    },

    limparFormIndicador(){ 
        // ... (função existente, sem alterações) ...
        document.getElementById('form-add-indicador').reset(); 
        document.getElementById('edit-indicador-id').value = ''; 
    },

    async excluirIndicador(id) {
        // ... (função existente, sem alterações) ...
        if (this.currentUser.role !== 'admin') return;
        if (!confirm(`Tem certeza que deseja excluir o indicador ID ${id}? ISSO EXCLUIRÁ TODAS AS METAS E RESULTADOS associados a ele.`)) return;
        try {
            this.mostrarLoading(true);
            await this.supabaseRequest(`indicadores?id=eq.${id}`, 'DELETE');
            
            this.dados.indicadores = this.dados.indicadores.filter(ind => ind.id !== id);
            this.dados.metas = this.dados.metas.filter(m => m.indicador_id !== id);
            this.dados.resultadosIndicadores = this.dados.resultadosIndicadores.filter(res => res.indicador_id !== id);
            
            this.renderizarTabelaIndicadores(); 
            this.renderizarTabelaMetas();
            this.renderizarTabelaResultados();
            this.popularDropdownsConfig();
            
            this.mostrarAlerta('Indicador excluído!', 'success');
        } catch (e) { 
            this.mostrarAlerta(`Erro ao excluir: ${e.message}`, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },

    renderizarTabelaMetas() {
        // ... (função existente, sem alterações) ...
        const tbody = document.querySelector('#tabela-metas tbody');
        tbody.innerHTML = '';
        if (!this.dados.metas || this.dados.metas.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma meta cadastrada.</td></tr>'; 
            return; 
        }
        
        const indicadorMap = this.dados.indicadores.reduce((map, ind) => {
            map[ind.id] = ind.indicador;
            return map;
        }, {});

        this.dados.metas.forEach(meta => {
            const nomeIndicador = indicadorMap[meta.indicador_id] || `ID ${meta.indicador_id}`;
            tbody.innerHTML += `<tr id="meta-row-${meta.id}">
                <td>${meta.id}</td>
                <td>${this.escapeHTML(nomeIndicador)}</td>
                <td>${this.escapeHTML(meta.filial)}</td>
                <td>${this.escapeHTML(meta.meta || '--')}</td>
                <td>${this.escapeHTML(meta.tipo || '--')}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="window.GG.editarMeta(${meta.id})"><i data-feather="edit-2" class="h-4 w-4"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="window.GG.excluirMeta(${meta.id})"><i data-feather="trash-2" class="h-4 w-4"></i></button>
                </td></tr>`;
        });
        feather.replace();
    },
    
    async salvarMeta() {
        // ... (função existente, sem alterações) ...
        if (this.currentUser.role !== 'admin') return;
        const id = document.getElementById('edit-meta-id').value;
        
        const dadosMeta = {
            indicador_id: document.getElementById('add-meta-indicador').value,
            filial: document.getElementById('add-meta-filial').value,
            meta: document.getElementById('add-meta-meta').value.trim() || null,
            tipo: document.getElementById('add-meta-tipo').value.trim() || null
        };

        if (!dadosMeta.indicador_id || !dadosMeta.filial || !dadosMeta.meta || !dadosMeta.tipo) { 
            this.mostrarAlerta('Todos os campos da meta são obrigatórios.', 'warning'); 
            return; 
        }
        
        try {
            this.mostrarLoading(true);
            if (id) { 
                const updateData = { meta: dadosMeta.meta, tipo: dadosMeta.tipo };
                const resultado = await this.supabaseRequest(`indicadores_metas?id=eq.${id}`, 'PATCH', updateData);
                const index = this.dados.metas.findIndex(m => m.id == id);
                if (index > -1) this.dados.metas[index] = resultado[0];
                this.mostrarAlerta('Meta atualizada!', 'success');
            } else { 
                const endpoint = 'indicadores_metas?on_conflict=indicador_id,filial';
                const headers = { 'Prefer': 'return=representation,resolution=merge-duplicates' };
                const resultado = await this.supabaseRequest(endpoint, 'POST', dadosMeta, headers);

                const existingIndex = this.dados.metas.findIndex(m => m.id == resultado[0].id);
                if (existingIndex > -1) this.dados.metas[existingIndex] = resultado[0];
                else this.dados.metas.push(resultado[0]);
                
                this.mostrarAlerta('Meta salva (criada ou atualizada)!', 'success');
            }
            
            this.limparFormMeta();
            this.renderizarTabelaMetas();
        } catch (e) { 
            this.mostrarAlerta(`Erro ao salvar meta: ${e.message}`, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },
    
    editarMeta(id) {
        // ... (função existente, sem alterações) ...
        if (this.currentUser.role !== 'admin') return;
        const meta = this.dados.metas.find(m => m.id === id);
        if (!meta) return; 
        
        document.getElementById('edit-meta-id').value = id;
        document.getElementById('add-meta-indicador').value = meta.indicador_id;
        document.getElementById('add-meta-filial').value = meta.filial;
        document.getElementById('add-meta-meta').value = meta.meta || '';
        document.getElementById('add-meta-tipo').value = meta.tipo || '';

        document.getElementById('add-meta-indicador').disabled = true;
        document.getElementById('add-meta-filial').disabled = true;

        document.getElementById('add-meta-meta').focus();
        this.mostrarAlerta(`Editando Meta #${id}. Altere e clique em Salvar.`, 'info');
    },
    
    limparFormMeta(){ 
        // ... (função existente, sem alterações) ...
        document.getElementById('form-add-meta').reset(); 
        document.getElementById('edit-meta-id').value = ''; 
        document.getElementById('add-meta-indicador').disabled = false;
        document.getElementById('add-meta-filial').disabled = false;
    },
    
    async excluirMeta(id) {
        // ... (função existente, sem alterações) ...
        if (this.currentUser.role !== 'admin') return;
        if (!confirm(`Tem certeza que deseja excluir esta meta (ID ${id})?`)) return;
        try {
            this.mostrarLoading(true);
            await this.supabaseRequest(`indicadores_metas?id=eq.${id}`, 'DELETE');
            this.dados.metas = this.dados.metas.filter(m => m.id !== id);
            this.renderizarTabelaMetas();
            this.mostrarAlerta('Meta excluída!', 'success');
        } catch (e) { 
            this.mostrarAlerta(`Erro ao excluir meta: ${e.message}`, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },
    
    editarResultado(id) {
        // ... (função existente, sem alterações) ...
        if (this.currentUser.role !== 'admin') return;
        const resultado = this.dados.resultadosIndicadores.find(res => res.id === id);
        if (!resultado) return;
        
        document.getElementById('add-resultado-indicador').value = resultado.indicador_id;
        document.getElementById('add-resultado-filial').value = resultado.filial; 
        document.getElementById('add-resultado-mes').value = resultado.mes_referencia.substring(0, 7);
        document.getElementById('add-resultado-valor').value = resultado.valor_realizado || '';
        document.getElementById('edit-resultado-id').value = id;
        
        document.getElementById('add-resultado-indicador').disabled = true;
        document.getElementById('add-resultado-filial').disabled = true;

        document.getElementById('add-resultado-valor').focus();
        this.mostrarAlerta(`Editando resultado. Altere o valor e salve.`, 'info');
    },
    
    // ATUALIZADO: Popula também o novo filtro da aba Pessoal
    popularDropdownsConfig() {
        const filiaisSet = new Set(
            Object.values(this.dados.colaboradores)
                .map(c => c.filial)
                .filter(s => s)
        );
        // Adiciona filiais dos gestores também
        Object.values(this.dados.gestores).forEach(g => {
            if(g.filial) filiaisSet.add(g.filial);
        });
        const filiais = [...filiaisSet].sort();

        const secoesSet = new Set(
            Object.values(this.dados.colaboradores)
                .map(c => c.secao)
                .filter(s => s)
        );
        // Adiciona seções dos gestores também
        Object.values(this.dados.gestores).forEach(g => {
            if(g.secao) secoesSet.add(g.secao);
        });
        const secoes = [...secoesSet].sort();

        const tiposEstaticos = [
            { valor: "numérico", texto: "Numérico (Ex: 10, 15.5)" },
            { valor: "percentual", texto: "Percentual (Ex: 90%)" },
            { valor: "monetário", texto: "Monetário (Ex: R$ 500)" },
            { valor: "texto", texto: "Texto (Ex: Conforme)" },
            { valor: "inverso", texto: "Numérico Inverso (Ex: < 5)" }
        ];

        // --- Pega os Elementos SELECT ---
        const selectIndicadorResultado = document.getElementById('add-resultado-indicador');
        const selectFilialResultado = document.getElementById('add-resultado-filial');
        const selectFilialFiltroRes = document.getElementById('filtro-resultado-filial');
        
        const selectSecaoIndicador = document.getElementById('add-indicador-secao');
        
        const selectIndicadorMeta = document.getElementById('add-meta-indicador');
        const selectFilialMeta = document.getElementById('add-meta-filial');
        const selectTipoMeta = document.getElementById('add-meta-tipo');

        // NOVO: Select de filtro da aba Pessoal
        const selectFilialFiltroPessoal = document.getElementById('filtroPessoalFilial');

        // --- Popula Dropdowns de RESULTADOS ---
        selectIndicadorResultado.innerHTML = '<option value="">Selecione Indicador...</option>';
        this.dados.indicadores.forEach(ind => { 
            selectIndicadorResultado.innerHTML += `<option value="${ind.id}">${this.escapeHTML(ind.indicador)} (${this.escapeHTML(ind.secao)})</option>`; 
        });

        selectFilialResultado.innerHTML = '<option value="">Selecione Filial...</option>';
        selectFilialFiltroRes.innerHTML = '<option value="">Todas</option>';
        selectFilialFiltroPessoal.innerHTML = '<option value="">Todas</option>'; // Popula o novo
        filiais.forEach(f => {
            const opt = `<option value="${this.escapeHTML(f)}">${this.escapeHTML(f)}</option>`;
            selectFilialResultado.innerHTML += opt;
            selectFilialFiltroRes.innerHTML += opt;
            selectFilialFiltroPessoal.innerHTML += opt; // Popula o novo
        });

        // --- Popula Dropdowns de INDICADORES (Definição) ---
        selectSecaoIndicador.innerHTML = '<option value="">Selecione a Seção...</option>';
        selectSecaoIndicador.innerHTML += '<option value="GERAL">GERAL (Para todos)</option>';
        secoes.forEach(s => {
            if (s && s.toUpperCase() !== 'GERAL') {
                selectSecaoIndicador.innerHTML += `<option value="${this.escapeHTML(s)}">${this.escapeHTML(s)}</option>`;
            }
        });

        // --- Popula Dropdowns de METAS ---
        selectIndicadorMeta.innerHTML = '<option value="">Selecione Indicador...</option>';
        this.dados.indicadores.forEach(ind => { 
            selectIndicadorMeta.innerHTML += `<option value="${ind.id}">${this.escapeHTML(ind.indicador)} (${this.escapeHTML(ind.secao)})</option>`; 
        });

        selectFilialMeta.innerHTML = '<option value="">Selecione Filial...</option>';
        filiais.forEach(f => {
            selectFilialMeta.innerHTML += `<option value="${this.escapeHTML(f)}">${this.escapeHTML(f)}</option>`;
        });
        
        selectTipoMeta.innerHTML = '<option value="">Selecione o Tipo...</option>';
        tiposEstaticos.forEach(t => {
            selectTipoMeta.innerHTML += `<option value="${t.valor}">${t.texto}</option>`;
        });
    },
    
    async adicionarOuAtualizarResultado() {
        // ... (função existente, sem alterações) ...
        if (this.currentUser.role !== 'admin') return;
        
        const indicadorId = document.getElementById('add-resultado-indicador').value;
        const filial = document.getElementById('add-resultado-filial').value; 
        const mesInput = document.getElementById('add-resultado-mes').value;
        const valor = document.getElementById('add-resultado-valor').value.trim();
        const editId = document.getElementById('edit-resultado-id').value;

        if (!indicadorId || !filial || !mesInput || valor === '') { this.mostrarAlerta('Todos os campos são obrigatórios.', 'warning'); return; } 
        const mesReferencia = `${mesInput}-01`;
        
        const dadosResultado = { indicador_id: parseInt(indicadorId), filial: filial, mes_referencia: mesReferencia, valor_realizado: valor };

        try {
            this.mostrarLoading(true);
            if (editId) {
                const resultado = await this.supabaseRequest(`resultados_indicadores?id=eq.${editId}`, 'PATCH', { valor_realizado: valor });
                const index = this.dados.resultadosIndicadores.findIndex(r => r.id == editId);
                if (index > -1) this.dados.resultadosIndicadores[index] = resultado[0];
                this.mostrarAlerta('Resultado atualizado!', 'success');
            } else { 
                const endpoint = 'resultados_indicadores?on_conflict=indicador_id,mes_referencia,filial';
                const headers = { 'Prefer': 'return=representation,resolution=merge-duplicates' };
                const resultado = await this.supabaseRequest(endpoint, 'POST', dadosResultado, headers);
                 
                 const existingIndex = this.dados.resultadosIndicadores.findIndex(r => r.id == resultado[0].id);
                 if (existingIndex > -1) this.dados.resultadosIndicadores[existingIndex] = resultado[0];
                 else this.dados.resultadosIndicadores.push(resultado[0]);
                 this.mostrarAlerta('Resultado salvo (criado ou atualizado)!', 'success');
            }
            this.limparFormResultado();
            this.renderizarTabelaResultados();
        } catch(e) { this.mostrarAlerta(`Erro ao salvar resultado: ${e.message}`, 'danger'); }
        finally { this.mostrarLoading(false); }
    },
    
    renderizarTabelaResultados() {
        // ... (função existente, sem alterações) ...
        const tbody = document.querySelector('#tabela-resultados tbody');
        const mesFiltro = document.getElementById('filtro-resultado-mes').value;
        const filialFiltro = document.getElementById('filtro-resultado-filial').value; 
        tbody.innerHTML = '';
        let resultadosFiltrados = this.dados.resultadosIndicadores;
        if (mesFiltro) resultadosFiltrados = resultadosFiltrados.filter(r => r.mes_referencia === `${mesFiltro}-01`);
        if (filialFiltro) resultadosFiltrados = resultadosFiltrados.filter(r => r.filial === filialFiltro); 
        
        if (resultadosFiltrados.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum resultado para os filtros.</td></tr>'; return; }
        
        const indicadorMap = this.dados.indicadores.reduce((map, ind) => {
            map[ind.id] = ind.indicador;
            return map;
        }, {});

        resultadosFiltrados.sort((a,b) => new Date(b.mes_referencia) - new Date(a.mes_referencia)).slice(0, 100).forEach(res => {
            const nomeIndicador = indicadorMap[res.indicador_id] || `ID ${res.indicador_id}`;
            const mesAno = new Date(res.mes_referencia + 'T05:00:00').toLocaleDateString('pt-BR', { year: 'numeric', month: 'short'});
            tbody.innerHTML += `<tr id="resultado-row-${res.id}">
                <td>${mesAno}</td> 
                <td>${this.escapeHTML(res.filial)}</td> 
                <td>${this.escapeHTML(nomeIndicador)}</td> 
                <td>${this.escapeHTML(res.valor_realizado || '--')}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="window.GG.editarResultado(${res.id})"><i data-feather="edit-2" class="h-4 w-4"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="window.GG.excluirResultado(${res.id})"><i data-feather="trash-2" class="h-4 w-4"></i></button>
                </td></tr>`;
        });
        feather.replace();
    },
    
    limparFormResultado(){ 
        // ... (função existente, sem alterações) ...
        document.getElementById('form-add-resultado').reset(); 
        document.getElementById('edit-resultado-id').value = ''; 
        document.getElementById('add-resultado-indicador').disabled = false;
        document.getElementById('add-resultado-filial').disabled = false;
    },
    
    async excluirResultado(id) {
        // ... (função existente, sem alterações) ...
        if (this.currentUser.role !== 'admin') return;
        if (!confirm(`Excluir este resultado (ID ${id})?`)) return;
        try {
            this.mostrarLoading(true);
            await this.supabaseRequest(`resultados_indicadores?id=eq.${id}`, 'DELETE');
            this.dados.resultadosIndicadores = this.dados.resultadosIndicadores.filter(res => res.id !== id);
            this.renderizarTabelaResultados();
            this.mostrarAlerta('Resultado excluído!', 'success');
        } catch (e) { this.mostrarAlerta(`Erro ao excluir: ${e.message}`, 'danger'); }
        finally { this.mostrarLoading(false); }
    },
    
    // -----------------------------------------------------------------
    // FUNÇÕES DE PERFIL E UTILITÁRIOS
    // -----------------------------------------------------------------

    loadPerfilView() {
        // ... (função existente, sem alterações) ...
        const form = document.getElementById('perfilForm');
        const alertContainer = document.getElementById('perfilAlert');
        if (!form || !alertContainer || !this.currentUser) return; 
        alertContainer.innerHTML = '';
        form.reset();

        document.getElementById('perfilEmail').value = this.currentUser.email || '';
        document.getElementById('perfilNome').value = this.currentUser.nome || '';
        document.getElementById('perfilMatricula').value = this.currentUser.matricula || '';
        document.getElementById('perfilPicturePreview').src = this.currentUser.profile_picture_url || 'https://i.imgur.com/80SsE11.png';
        feather.replace();
    },

    previewProfilePicture(event) {
        // ... (função existente, sem alterações) ...
        const reader = new FileReader();
        reader.onload = function(){
            const output = document.getElementById('perfilPicturePreview');
            output.src = reader.result;
        };
        if (event.target.files[0]) {
            reader.readAsDataURL(event.target.files[0]);
        } else {
             if(window.GG && window.GG.currentUser) {
                 document.getElementById('perfilPicturePreview').src = window.GG.currentUser.profile_picture_url || 'https://i.imgur.com/80SsE11.png';
             }
        }
    },

    async handlePerfilFormSubmit(event) {
        // ... (função existente, sem alterações) ...
        if (event) event.preventDefault(); 
        
        const alertContainer = document.getElementById('perfilAlert');
        const saveButton = document.querySelector('#perfilForm button[type="submit"]');
        if (!saveButton || !alertContainer) return;
        
        const originalButtonText = saveButton.innerHTML;
        alertContainer.innerHTML = '';
        saveButton.disabled = true;
        saveButton.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div> Salvando...';

        let profilePicUrl = this.currentUser.profile_picture_url;
        let newPictureUploaded = false; 

        const pictureFile = document.getElementById('perfilPicture').files[0];
        if (pictureFile) {
            try {
                newPictureUploaded = true; 
                const apiUrl = `/api/upload?fileName=${encodeURIComponent(pictureFile.name)}&fileType=${encodeURIComponent(pictureFile.type || 'application/octet-stream')}`;
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream', 
                        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                    },
                    body: pictureFile,
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Erro ${response.status} ao enviar foto: ${errorData.details || errorData.error}`);
                }
                const result = await response.json();
                if (result.publicUrl) {
                    profilePicUrl = result.publicUrl;
                } else {
                     throw new Error("API de upload não retornou URL pública.");
                }
            } catch (uploadError) {
                console.error("Falha no upload da foto:", uploadError);
                alertContainer.innerHTML = `<div class="alert alert-error">Falha ao enviar a nova foto: ${uploadError.message}.</div>`;
                 saveButton.disabled = false;
                 saveButton.innerHTML = originalButtonText;
                 feather.replace();
                 return; 
            }
        }

        const profileData = {
            nome: document.getElementById('perfilNome').value,
            matricula: document.getElementById('perfilMatricula').value || null,
            profile_picture_url: profilePicUrl || null
        };

        try {
            const updatedUser = await this.supabaseRequest(`usuarios?id=eq.${this.currentUser.id}`, 'PATCH', profileData);

            if (updatedUser && updatedUser[0]) {
                this.currentUser = { ...this.currentUser, ...updatedUser[0] };
                
                this.showMainSystem();
                if (!newPictureUploaded) {
                     document.getElementById('perfilPicturePreview').src = this.currentUser.profile_picture_url || 'https://i.imgur.com/80SsE11.png';
                }
                
                this.mostrarAlerta('Perfil atualizado com sucesso!', 'success');
            } else {
                 throw new Error("Resposta inesperada do servidor ao atualizar perfil.");
            }

        } catch (error) {
            console.error("Erro ao salvar perfil:", error);
            if (!alertContainer.innerHTML) { 
                 alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar dados: ${error.message}</div>`;
            }
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i data-feather="save" class="h-4 w-4 mr-2"></i> Salvar Alterações';
            feather.replace();
            document.getElementById('perfilPicture').value = ''; 
        }
    },
    
    gerarRelatorios(){ this.mostrarAlerta("Relatórios em desenvolvimento.", "info"); },
    
    fecharModal() { document.getElementById('editModal').style.display = 'none'; },
    salvarEdicaoModal() { 
        this.mostrarAlerta('Função de salvar modal genérico não implementada.', 'info');
    },

    atualizarStatusDados(mensagem, tipo, timeout = 0) {
        // ... (função existente, sem alterações) ...
        const el = document.getElementById('statusDados');
        if(el) { el.className = `alert alert-${tipo}`; el.innerHTML = `<p>${mensagem}</p>`; el.style.display = 'block';
            if(timeout > 0) setTimeout(() => { el.style.display = 'none'; }, timeout);
        }
    },
    
    atualizarStatusConexaoHome(conectado) {
        // ... (função existente, sem alterações) ...
        const el = document.getElementById('statusConexaoHome');
        if(el) {
            el.className = `status-conexao status-${conectado ? 'conectado' : 'desconectado'}`;
            el.querySelector('span').innerHTML = `<i class="fas ${conectado ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${conectado ? 'Conectado e dados carregados' : 'Falha na Conexão'}`;
        }
    },
    
    mostrarAlerta(msg, tipo = 'info', duracao = 4000) {
        // ... (função existente, sem alterações) ...
        this.mostrarNotificacao(msg, tipo, duracao);
    },
    
    mostrarNotificacao(message, type = 'info', timeout = 4000) {
        // ... (função existente, sem alterações) ...
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
            <div class="notification-body">${this.escapeHTML(message)}</div>`;
        container.appendChild(notification);
        feather.replace();
        setTimeout(() => {
            notification.classList.add('hide');
            notification.addEventListener('animationend', () => notification.remove());
        }, timeout);
    },

    mostrarLoading(mostrar) { document.getElementById('loading').style.display = mostrar ? 'flex' : 'none'; },
    
    atualizarEstatisticasHome() {
        // ... (função existente, sem alterações) ...
        if (!this.dados.dadosCarregados) return;
        const totalColabs = Object.keys(this.dados.colaboradores).length;
        const totalGests = Object.keys(this.dados.gestores).length;
        const totalAvs = this.dados.avaliacoes.length;
        const media = totalAvs > 0 ? (this.dados.avaliacoes.reduce((sum, av) => sum + (parseFloat(av.pontuacao) || 0), 0) / totalAvs) : 0;
        
        document.getElementById('totalColaboradoresHome').textContent = totalColabs;
        document.getElementById('totalGestoresHome').textContent = totalGests;
        document.getElementById('totalAvaliacoesHome').textContent = totalAvs;
        document.getElementById('mediaGeralHome').textContent = media.toFixed(1);
    },
    
    injectIndicatorStyles() {
        // ... (função existente, sem alterações) ...
        const oldStyle = document.getElementById('indicator-styles');
        if (oldStyle) oldStyle.remove();

        const style = document.createElement('style');
        style.id = 'indicator-styles';
        style.innerHTML = `
            /* NOVOS ESTILOS PARA VISUALIZAÇÃO DE INDICADORES */
            #indicadoresContainer {
                padding-top: 10px;
            }
            .indicator-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: 16px;
            }
            .indicator-viz-card {
                background-color: #f9fafb;
                padding: 14px;
                border-radius: 8px;
                border-left: 4px solid var(--secondary);
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            }
            .indicator-viz-card label {
                font-size: 0.85em;
                font-weight: 600;
                color: var(--dark);
                display: block;
                margin-bottom: 10px;
            }
            
            .indicador-texto div {
                font-size: 0.9em;
                color: #495057;
                display: flex;
                justify-content: space-between;
            }
            .indicador-texto div span {
                font-weight: 600;
            }

            .indicador-numerico .indicador-valores {
                display: flex;
                justify-content: space-between;
                font-size: 0.8em;
                color: #495057;
                margin-bottom: 6px;
            }
            .indicador-numerico .indicador-valores strong {
                font-size: 1.1em;
                font-weight: 700;
                color: var(--dark);
            }
            .progress-bar-viz {
                width: 100%;
                height: 12px;
                background: #e9ecef;
                border-radius: 6px;
                overflow: hidden;
            }
            .progress-bar-inner {
                height: 100%;
                border-radius: 6px;
                transition: width 0.5s ease;
                background-color: var(--accent);
            }
            .progress-bar-inner.bar-good {
                background-color: var(--primary); 
            }
            .progress-bar-inner.bar-bad {
                background-color: #dc2626; 
            }
            .progress-bar-inner.bar-excellent {
                background: linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%);
            }
        `;
        document.head.appendChild(style);
    },

    escapeHTML(str) {
        // ... (função existente, sem alterações) ...
        if (str === null || str === undefined) return '';
        return String(str)
             .replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&#39;');
    }
}; 

document.addEventListener('DOMContentLoaded', () => {
    if (window.GG && typeof window.GG.init === 'function') {
        window.GG.init();
    } else { 
        console.error("❌ Falha crítica: Objeto GG não inicializado."); 
        alert("Erro crítico. Verifique o console.");
    }
});

