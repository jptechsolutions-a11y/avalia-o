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
        avaliacaoAtual: null, 
        dadosCarregados: false, 
        avaliacoesFiltradas: []
    },
    
    COMPETENCIAS: [
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
        console.log('🚀 Iniciando Sistema G&G v5.0 (Proxy)...');
        
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

        this.setupUIListeners();

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
                    profile_picture_url: this.authUser.user_metadata?.avatar_url || null
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
            
            this.showView('homeView', document.querySelector('a[href="#home"]'));
            
        } catch (error) {
            console.error("Erro detalhado na inicialização do app:", error);
            this.mostrarAlerta(`Erro ao carregar dados: ${error.message}`, 'error', 10000);
            this.logout(); 
        }
    },

    logout() {
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

    async supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
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
        this.mostrarLoading(true);
        this.atualizarStatusDados('🔄 Carregando dados...', 'info');
        try {
            const results = await Promise.allSettled([
                this.supabaseRequest('colaboradores?select=*', 'GET'), 
                this.supabaseRequest('gestores?select=*', 'GET'),
                this.supabaseRequest('avaliacoes?select=*', 'GET'), 
                this.supabaseRequest('indicadores?select=*&order=indicador.asc', 'GET'),
                this.supabaseRequest('resultados_indicadores?select=*', 'GET')
            ]);
            
            const [colabRes, gestRes, avalRes, indRes, resIndRes] = results;

            this.dados.colaboradores = (colabRes.status === 'fulfilled' && colabRes.value) ? colabRes.value.reduce((acc, c) => { if(c.matricula) acc[String(c.matricula).trim()] = c; return acc; }, {}) : {};
            this.dados.gestores = (gestRes.status === 'fulfilled' && gestRes.value) ? gestRes.value.reduce((acc, g) => { if(g.matricula) acc[String(g.matricula).trim()] = g; return acc; }, {}) : {};
            this.dados.avaliacoes = (avalRes.status === 'fulfilled' && avalRes.value) ? avalRes.value : [];
            this.dados.indicadores = (indRes.status === 'fulfilled' && indRes.value) ? indRes.value : [];
            this.dados.resultadosIndicadores = (resIndRes.status === 'fulfilled' && resIndRes.value) ? resIndRes.value : [];
            
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
        this.limparIndicadores();
        if (!matricula) { this.limparCamposColaborador(); return; }
        const colaborador = this.dados.colaboradores[String(matricula).trim()];
        const campoMatricula = document.getElementById('matriculaAvaliado');
        if (colaborador) {
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
        const matricula = document.getElementById('matriculaAvaliado').value;
        const mesReferenciaInput = document.getElementById('mesReferencia').value;
        if (!matricula || !mesReferenciaInput) { this.limparIndicadores(); return; }
        const colaborador = this.dados.colaboradores[String(matricula).trim()];
        if (!colaborador) { this.limparIndicadores(); return; }
        
        const secao = colaborador.secao || 'GERAL'; 
        const mesFormatado = `${mesReferenciaInput}-01`;
        const indicadoresAplicaveis = this.dados.indicadores.filter(ind => ind.secao === 'GERAL' || ind.secao === secao);
        const resultadosDoMes = this.dados.resultadosIndicadores.filter(res => res.mes_referencia === mesFormatado && (res.secao === secao || res.secao === 'GERAL'));
        
        this.renderizarIndicadores(indicadoresAplicaveis, resultadosDoMes);
    },
    
    renderizarIndicadores(indicadores, resultados) {
        const container = document.getElementById('indicadoresContainer');
        if (!indicadores || indicadores.length === 0) {
            container.innerHTML = `<p style="color: #6c757d; font-style: italic;">Nenhum indicador aplicável para esta seção.</p>`; return;
        }
        const mapaResultados = resultados.reduce((acc, res) => { acc[res.indicador_id] = res.valor_realizado; return acc; }, {});
        let html = '<div class="form-row">';
        indicadores.forEach((ind, i) => {
            const valorRealizado = mapaResultados[ind.id];
            const valorExibido = (valorRealizado !== null && valorRealizado !== undefined && valorRealizado !== '') ? valorRealizado : '--';
            html += `<div class="form-group"> <label>${this.escapeHTML(ind.indicador)}</label> <div> <span style="font-size: 0.8em;">Meta: ${this.escapeHTML(ind.meta || 'N/A')}</span> <span style="float: right; font-weight: bold; font-size: 1.1em;">${this.escapeHTML(valorExibido)}</span> </div> </div>`;
            if ((i + 1) % 2 === 0 && (i + 1) < indicadores.length) html += '</div><div class="form-row">';
        });
        html += '</div>'; container.innerHTML = html;
    },
    
    limparIndicadores() { document.getElementById('indicadoresContainer').innerHTML = `<p style="color: #6c757d;">Selecione o colaborador e o mês de referência.</p>`; },
    
    limparCamposColaborador() {
        ['matriculaAvaliado', 'nomeAvaliado', 'funcaoAvaliado', 'filial'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('matriculaAvaliado').style.borderColor = '#d1d5db';
        this.limparIndicadores();
    },
    
    buscarGestor(matricula) {
        if (!matricula) { this.limparCamposGestor(); return; }
        const gestor = this.dados.gestores[String(matricula).trim()];
        const campoMatricula = document.getElementById('matriculaGestor');
        if (gestor) {
            document.getElementById('nomeGestor').value = gestor.nome || '';
            campoMatricula.style.borderColor = 'var(--primary)';
        } else {
            this.limparCamposGestor();
            campoMatricula.style.borderColor = '#dc2626';
            this.mostrarAlerta(`Gestor ${matricula} não encontrado.`, 'warning');
        }
    },
    
    limparCamposGestor() {
        ['matriculaGestor', 'nomeGestor'].forEach(id => document.getElementById(id).value = '');
         document.getElementById('matriculaGestor').style.borderColor = '#d1d5db';
    },

    calcularResultado() {
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
        this.criarFormularioCompetencias(); 
        this.atualizarProgresso(); 
        this.limparIndicadores(); 
    },
    
    criarFormularioCompetencias() {
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
        const totalFatores = this.COMPETENCIAS.reduce((sum, c) => sum + c.fatores.length, 0);
        const fatoresAvaliados = document.querySelectorAll('#competenciasContainer input[type="radio"]:checked').length;
        
        const porcentagem = totalFatores > 0 ? (fatoresAvaliados / totalFatores) * 100 : 0;
        document.getElementById('progressFill').style.width = porcentagem + '%';
        document.getElementById('progressText').textContent = `${fatoresAvaliados} de ${totalFatores} fatores avaliados`;
        
        return { fatoresAvaliados, totalFatores };
    },

    async carregarHistorico(){ 
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
        const filtroFilial = document.getElementById('filtroFilial');
        const filiais = [...new Set(this.dados.avaliacoes.map(av => av.filial))].sort();
        filtroFilial.innerHTML = '<option value="">Todas</option>';
        filiais.forEach(f => { if(f) filtroFilial.innerHTML += `<option value="${f}">Filial ${f}</option>`; });
    },
    
    aplicarFiltros() {
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

        this.dados.avaliacoesFiltradas = dadosFiltrados;
        this.renderizarTabelaHistorico(dadosFiltrados);
    },
    
    renderizarTabelaHistorico(dados) {
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
        ['filtroMes', 'filtroFilial', 'filtroClassificacao', 'filtroNome', 'filtroGestor'].forEach(id => document.getElementById(id).value = '');
        this.aplicarFiltros();
    },
    
    exportarDados() {
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
        this.limparFormIndicador(); this.limparFormResultado();
        this.renderizarTabelaIndicadores();
        this.popularDropdownsConfig();
        this.renderizarTabelaResultados();
        this.mostrarLoading(false);
    },
    
    renderizarTabelaIndicadores() {
        const tbody = document.querySelector('#tabela-indicadores tbody');
        tbody.innerHTML = '';
        if (!this.dados.indicadores || this.dados.indicadores.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum indicador cadastrado.</td></tr>'; return; }
        
        this.dados.indicadores.forEach(ind => {
            tbody.innerHTML += `<tr id="indicador-row-${ind.id}">
                <td>${ind.id}</td><td>${this.escapeHTML(ind.indicador)}</td>
                <td>${this.escapeHTML(ind.secao)}</td><td>${this.escapeHTML(ind.meta || '--')}</td>
                <td>${this.escapeHTML(ind.tipo || '--')}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="window.GG.editarIndicador(${ind.id})"><i data-feather="edit-2" class="h-4 w-4"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="window.GG.excluirIndicador(${ind.id})"><i data-feather="trash-2" class="h-4 w-4"></i></button>
                </td></tr>`;
        });
        feather.replace();
    },
    
    async salvarIndicador() {
        if (this.currentUser.role !== 'admin') return;
        const id = document.getElementById('edit-indicador-id').value;
        const dadosIndicador = {
            indicador: document.getElementById('add-indicador-nome').value.trim(),
            secao: document.getElementById('add-indicador-secao').value.trim().toUpperCase() || 'GERAL',
            meta: document.getElementById('add-indicador-meta').value.trim() || null,
            tipo: document.getElementById('add-indicador-tipo').value.trim() || null
        };
        if (!dadosIndicador.indicador || !dadosIndicador.secao) { this.mostrarAlerta('Nome e Seção são obrigatórios.', 'warning'); return; }
        
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
        } catch (e) { this.mostrarAlerta(`Erro ao salvar indicador: ${e.message}`, 'danger'); }
        finally { this.mostrarLoading(false); }
    },
    
    editarIndicador(id) {
        if (this.currentUser.role !== 'admin') return;
        const indicador = this.dados.indicadores.find(ind => ind.id === id);
        if (!indicador) return;
        document.getElementById('edit-indicador-id').value = id;
        document.getElementById('add-indicador-nome').value = indicador.indicador;
        document.getElementById('add-indicador-secao').value = indicador.secao;
        document.getElementById('add-indicador-meta').value = indicador.meta || '';
        document.getElementById('add-indicador-tipo').value = indicador.tipo || '';
        document.getElementById('add-indicador-nome').focus();
        this.mostrarAlerta(`Editando Indicador #${id}. Altere e clique em Salvar.`, 'info');
    },
    
    limparFormIndicador(){ document.getElementById('form-add-indicador').reset(); document.getElementById('edit-indicador-id').value = ''; },
    
    async excluirIndicador(id) {
        if (this.currentUser.role !== 'admin') return;
        if (!confirm(`Tem certeza que deseja excluir o indicador ID ${id}? Isso PODE excluir resultados históricos associados (se o CASCADE estiver ativo no banco).`)) return;
        try {
            this.mostrarLoading(true);
            await this.supabaseRequest(`indicadores?id=eq.${id}`, 'DELETE');
            this.dados.indicadores = this.dados.indicadores.filter(ind => ind.id !== id);
            this.dados.resultadosIndicadores = this.dados.resultadosIndicadores.filter(res => res.indicador_id !== id);
            this.renderizarTabelaIndicadores(); this.popularDropdownsConfig(); this.renderizarTabelaResultados();
            this.mostrarAlerta('Indicador excluído!', 'success');
        } catch (e) { this.mostrarAlerta(`Erro ao excluir: ${e.message}`, 'danger'); }
        finally { this.mostrarLoading(false); }
    },
    
    popularDropdownsConfig() {
        const selectIndicador = document.getElementById('add-resultado-indicador');
        const selectSecaoAdd = document.getElementById('add-resultado-secao');
        const selectSecaoFiltro = document.getElementById('filtro-resultado-secao');
        
        selectIndicador.innerHTML = '<option value="">Selecione Indicador...</option>';
        this.dados.indicadores.forEach(ind => { selectIndicador.innerHTML += `<option value="${ind.id}">${this.escapeHTML(ind.indicador)} (${this.escapeHTML(ind.secao)})</option>`; });

        const secoes = [...new Set(this.dados.indicadores.map(i => i.secao))].sort();
        selectSecaoAdd.innerHTML = '<option value="">Selecione Seção...</option>';
        selectSecaoFiltro.innerHTML = '<option value="">Todas</option>';
        secoes.forEach(s => {
            selectSecaoAdd.innerHTML += `<option value="${s}">${this.escapeHTML(s)}</option>`;
            selectSecaoFiltro.innerHTML += `<option value="${s}">${this.escapeHTML(s)}</option>`;
        });
    },
    
    async adicionarOuAtualizarResultado() {
        if (this.currentUser.role !== 'admin') return;
        const indicadorId = document.getElementById('add-resultado-indicador').value;
        const secao = document.getElementById('add-resultado-secao').value;
        const mesInput = document.getElementById('add-resultado-mes').value;
        const valor = document.getElementById('add-resultado-valor').value.trim();
        const editId = document.getElementById('edit-resultado-id').value;
        if (!indicadorId || !secao || !mesInput || valor === '') { this.mostrarAlerta('Todos os campos são obrigatórios.', 'warning'); return; }
        const mesReferencia = `${mesInput}-01`;
        
        const dadosResultado = { indicador_id: parseInt(indicadorId), secao: secao, mes_referencia: mesReferencia, valor_realizado: valor };

        try {
            this.mostrarLoading(true);
            if (editId) {
                const resultado = await this.supabaseRequest(`resultados_indicadores?id=eq.${editId}`, 'PATCH', { valor_realizado: valor });
                const index = this.dados.resultadosIndicadores.findIndex(r => r.id == editId);
                if (index > -1) this.dados.resultadosIndicadores[index] = resultado[0];
                this.mostrarAlerta('Resultado atualizado!', 'success');
            } else { 
                const endpoint = 'resultados_indicadores?on_conflict=indicador_id,mes_referencia,secao';
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
        const tbody = document.querySelector('#tabela-resultados tbody');
        const mesFiltro = document.getElementById('filtro-resultado-mes').value;
        const secaoFiltro = document.getElementById('filtro-resultado-secao').value;
        tbody.innerHTML = '';
        let resultadosFiltrados = this.dados.resultadosIndicadores;
        if (mesFiltro) resultadosFiltrados = resultadosFiltrados.filter(r => r.mes_referencia === `${mesFiltro}-01`);
        if (secaoFiltro) resultadosFiltrados = resultadosFiltrados.filter(r => r.secao === secaoFiltro);
        
        if (resultadosFiltrados.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum resultado para os filtros.</td></tr>'; return; }
        
        const indicadorMap = this.dados.indicadores.reduce((map, ind) => {
            map[ind.id] = ind.indicador;
            return map;
        }, {});

        resultadosFiltrados.sort((a,b) => new Date(b.mes_referencia) - new Date(a.mes_referencia)).slice(0, 100).forEach(res => {
            const nomeIndicador = indicadorMap[res.indicador_id] || `ID ${res.indicador_id}`;
            const mesAno = new Date(res.mes_referencia + 'T05:00:00').toLocaleDateString('pt-BR', { year: 'numeric', month: 'short'});
            tbody.innerHTML += `<tr id="resultado-row-${res.id}">
                <td>${mesAno}</td> <td>${this.escapeHTML(res.secao)}</td> <td>${this.escapeHTML(nomeIndicador)}</td> 
                <td>${this.escapeHTML(res.valor_realizado || '--')}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="window.GG.editarResultado(${res.id})"><i data-feather="edit-2" class="h-4 w-4"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="window.GG.excluirResultado(${res.id})"><i data-feather="trash-2" class="h-4 w-4"></i></button>
                </td></tr>`;
        });
        feather.replace();
    },
    
    editarResultado(id) {
        if (this.currentUser.role !== 'admin') return;
        const resultado = this.dados.resultadosIndicadores.find(res => res.id === id);
        if (!resultado) return;
        document.getElementById('add-resultado-indicador').value = resultado.indicador_id;
        document.getElementById('add-resultado-secao').value = resultado.secao;
        document.getElementById('add-resultado-mes').value = resultado.mes_referencia.substring(0, 7);
        document.getElementById('add-resultado-valor').value = resultado.valor_realizado || '';
        document.getElementById('edit-resultado-id').value = id;
        document.getElementById('add-resultado-valor').focus();
        this.mostrarAlerta(`Editando resultado. Altere o valor e salve.`, 'info');
    },
    
    limparFormResultado(){ document.getElementById('form-add-resultado').reset(); document.getElementById('edit-resultado-id').value = ''; },
    
    async excluirResultado(id) {
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
    
    loadPerfilView() {
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
    salvarEdicaoModal() { },

    atualizarStatusDados(mensagem, tipo, timeout = 0) {
        const el = document.getElementById('statusDados');
        if(el) { el.className = `alert alert-${tipo}`; el.innerHTML = `<p>${mensagem}</p>`; el.style.display = 'block';
            if(timeout > 0) setTimeout(() => { el.style.display = 'none'; }, timeout);
        }
    },
    
    atualizarStatusConexaoHome(conectado) {
        const el = document.getElementById('statusConexaoHome');
        if(el) {
            el.className = `status-conexao status-${conectado ? 'conectado' : 'desconectado'}`;
            el.querySelector('span').innerHTML = `<i class="fas ${conectado ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${conectado ? 'Conectado e dados carregados' : 'Falha na Conexão'}`;
        }
    },
    
    mostrarAlerta(msg, tipo = 'info', duracao = 4000) {
        this.mostrarNotificacao(msg, tipo, duracao);
    },
    
    mostrarNotificacao(message, type = 'info', timeout = 4000) {
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
    
    escapeHTML(str) {
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
