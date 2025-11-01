const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8';

// Apenas declaramos as variáveis aqui
let loginCard, requestAccessCard, formTitle, formSubtitle, emailForm, emailSubmitBtn;
let toggleLink, forgotLink, loginAlert, passwordLabel;
let requestAccessForm, requestSubmitBtn, toggleLinkRequest, requestAlert;
let supabaseClient;

let isRequestAccess = false; 
let isForgot = false;

try {
    if (!SUPABASE_URL || SUPABASE_URL.includes('URL_DO_SEU_PROJETO')) {
        console.error('ERRO: SUPABASE_URL não configurada em login.js. Use a URL do seu projeto.');
        throw new Error('Supabase URL não configurada.');
    }
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('SUA_CHAVE_PUBLICA')) {
        console.error('ERRO: SUPABASE_ANON_KEY não configurada em login.js. Use a chave "anon" do seu projeto.');
        throw new Error('Supabase Anon Key não configurada.');
    }
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (error) {
    console.error("Erro ao inicializar Supabase:", error.message);
    // Tentamos mostrar o alerta, mas o 'loginAlert' pode não estar definido ainda
    const tempAlert = document.getElementById('loginAlert');
    if (tempAlert) {
        tempAlert.innerHTML = `<div class="alert alert-error">Erro de configuração do cliente. Verifique o console.</div>`;
    }
}


document.addEventListener('DOMContentLoaded', () => {
    // Agora atribuímos os elementos DO INTERIOR do DOMContentLoaded
    loginCard = document.getElementById('loginCard');
    requestAccessCard = document.getElementById('requestAccessCard');

    formTitle = document.getElementById('formTitle');
    formSubtitle = document.getElementById('formSubtitle');
    emailForm = document.getElementById('emailForm');
    emailSubmitBtn = document.getElementById('emailSubmitBtn');

    // toggleText foi removido, não o procuramos mais.
    toggleLink = document.getElementById('toggleLink');
    forgotLink = document.getElementById('forgotLink');
    loginAlert = document.getElementById('loginAlert');
    passwordLabel = document.querySelector('label[for="password"]');

    requestAccessForm = document.getElementById('requestAccessForm');
    requestSubmitBtn = document.getElementById('requestSubmitBtn');
    toggleLinkRequest = document.getElementById('toggleLinkRequest');
    requestAlert = document.getElementById('requestAlert');


    if (!supabaseClient) {
        showAlert("Falha crítica ao carregar o Supabase. Verifique as chaves no login.js.", 'error');
        return;
    }
    
    // Verificação de segurança para garantir que os elementos HTML existem
    if (!loginCard || !requestAccessCard || !emailForm || !toggleLink || !forgotLink || !requestAccessForm) {
        console.error("Erro fatal: Elementos essenciais do DOM não encontrados. Verifique os IDs no index.html.");
        showAlert("Erro ao carregar a página. Elementos não encontrados.", 'error');
        return;
    }


    checkHash(); 
    window.addEventListener('hashchange', checkHash);

    // googleLoginBtn.addEventListener('click', handleGoogleLogin); // Removido
    emailForm.addEventListener('submit', handleEmailFormSubmit);
    toggleLink.addEventListener('click', toggleMode);
    forgotLink.addEventListener('click', toggleForgotMode);
    
    requestAccessForm.addEventListener('submit', handleRequestAccessSubmit);
    toggleLinkRequest.addEventListener('click', toggleMode);

    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('Auth Event:', event, session);
        if (event === 'PASSWORD_RECOVERY') {
            window.location.hash = '#reset';
            checkHash();
        } else if (event === 'SIGNED_IN') {
             window.location.href = 'app.html';
        }
    });


});

function checkHash() {
    isRequestAccess = (window.location.hash === '#request'); 
    isForgot = (window.location.hash === '#forgot');
    
    if (window.location.hash === '#reset') {
        updateUI('reset');
    } else if (isForgot) {
        updateUI('forgot');
    } else if (isRequestAccess) { 
        updateUI('request');
    } else {
        updateUI('login');
    }
}

function toggleMode(e) {
    if (e) e.preventDefault();
    isRequestAccess = !isRequestAccess; 
    isForgot = false;
    window.location.hash = isRequestAccess ? '#request' : ''; 
    checkHash();
}

function toggleForgotMode(e) {
    if (e) e.preventDefault();
    isForgot = true;
    isRequestAccess = false; 
    window.location.hash = '#forgot';
    checkHash();
}

function updateUI(mode) {
    if (!loginAlert || !requestAlert || !document.getElementById('password')) return; // Proteção extra

    loginAlert.innerHTML = '';
    requestAlert.innerHTML = ''; 
    
    // **** INÍCIO DA CORREÇÃO ****
    const passwordEl = document.getElementById('password'); // Pegar o elemento password
    const emailEl = document.getElementById('email'); // Pegar o elemento email
    const passwordGroup = passwordEl.parentElement;
    const emailGroup = emailEl.parentElement; // Pegar o grupo do email
    // **** FIM DA CORREÇÃO ****
    
    // const googleLoginBtn = document.getElementById('googleLoginBtn'); // Removido
    // const orSeparator = document.querySelector('.flex.items-center.my-4'); // Removido

    if (mode === 'request') { 
        loginCard.style.display = 'none';
        requestAccessCard.style.display = 'block';
    } else if (mode === 'forgot') {
        loginCard.style.display = 'block';
        requestAccessCard.style.display = 'none';
        
        formTitle.textContent = 'Recuperar Senha';
        formSubtitle.textContent = 'Digite seu e-mail para enviarmos um link de recuperação.';
        emailSubmitBtn.innerHTML = 'Enviar Link <i data-feather="arrow-right" class="h-4 w-4 ml-2"></i>';
        
        // toggleText.textContent = 'Lembrou a senha?'; // toggleText removido
        toggleLink.textContent = 'Entrar';
        toggleLink.href = '#';
        
        // **** INÍCIO DA CORREÇÃO ****
        passwordGroup.style.display = 'none';
        passwordEl.required = false; // <-- CORREÇÃO: Campo escondido não é obrigatório
        
        emailGroup.style.display = 'block'; // Garantir que email esteja visível
        emailEl.required = true; // <-- CORREÇÃO: Campo visível é obrigatório
        // **** FIM DA CORREÇÃO ****
        
        // if (googleLoginBtn) googleLoginBtn.style.display = 'none'; 
        // if (orSeparator) orSeparator.style.display = 'none'; 
    } else if (mode === 'reset') {
        loginCard.style.display = 'block';
        requestAccessCard.style.display = 'none';

        formTitle.textContent = 'Redefinir Senha';
        formSubtitle.textContent = 'Digite sua nova senha.';
        emailSubmitBtn.innerHTML = 'Salvar Nova Senha <i data-feather="save" class="h-4 w-4 ml-2"></i>';
        
        // toggleText.textContent = ''; // toggleText removido
        toggleLink.textContent = '';
        toggleLink.href = '#';
        forgotLink.style.display = 'none';

        // if (googleLoginBtn) googleLoginBtn.style.display = 'none'; 
        // if (orSeparator) orSeparator.style.display = 'none'; 
        
        // **** INÍCIO DA CORREÇÃO ****
        if (emailEl) emailEl.parentElement.style.display = 'none'; 
        emailEl.required = false; // <-- CORREÇÃO: Campo escondido não é obrigatório
        
        passwordGroup.style.display = 'block';
        passwordEl.required = true; // <-- CORREÇÃO: Campo visível é obrigatório
        // **** FIM DA CORREÇÃO ****
    } else { 
        // Modo 'login' padrão
        loginCard.style.display = 'block';
        requestAccessCard.style.display = 'none';

        formTitle.textContent = 'Acesso ao Sistema'; // Corrigido para o novo layout
        formSubtitle.textContent = 'Avaliação de Desempenho G&G'; // Corrigido
        emailSubmitBtn.innerHTML = 'ENTRAR'; // Corrigido
        
        // toggleText.textContent = 'Não tem uma conta?'; // toggleText removido
        toggleLink.textContent = 'Solicitar Acesso';
        toggleLink.href = '#request';
        // CORREÇÃO: Alterado de 'block' para 'inline' para permitir o alinhamento
        forgotLink.style.display = 'inline'; 

        // if (googleLoginBtn) googleLoginBtn.style.display = 'none'; 
        // if (orSeparator) orSeparator.style.display = 'none'; 
        
        // **** INÍCIO DA CORREÇÃO ****
        if (emailEl) emailEl.parentElement.style.display = 'block';
        emailEl.required = true; // <-- CORREÇÃO: Campo visível é obrigatório
        
        passwordGroup.style.display = 'block';
        passwordEl.required = true; // <-- CORREÇÃO: Campo visível é obrigatório
        // **** FIM DA CORREÇÃO ****
    }
    feather.replace();
}

async function handleEmailFormSubmit(e) {
    e.preventDefault();
    setLoading(true);

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const mode = window.location.hash;

    try {
        if (mode === '#forgot') {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/index.html#reset', 
            });
            if (error) throw error;
            showAlert('Link de recuperação enviado! Verifique seu e-mail.', 'success');
        
        } else if (mode === '#reset') {
            const { error } = await supabaseClient.auth.updateUser({ password: password });
            if (error) throw error;
            showAlert('Senha redefinida com sucesso! Você já pode entrar.', 'success');
            window.location.hash = ''; 
            checkHash();

        } else {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password,
            });
            if (error) throw error;
            // O redirecionamento agora é tratado pelo onAuthStateChange
        }
    } catch (error) {
        console.error("Erro de autenticação:", error.message);
        showAlert(traduzirErroSupabase(error.message), 'error');
    } finally {
        setLoading(false);
    }
}

async function handleRequestAccessSubmit(e) {
    e.preventDefault();
    setLoading(true, 'request'); 

    const nome = document.getElementById('requestNome').value;
    const email = document.getElementById('requestEmail').value;
    const motivo = document.getElementById('requestMotivo').value;

    try {
        const response = await fetch('/api/request-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, motivo })
        });

        // Verifica se a resposta HTTP foi bem-sucedida (ex: 200 OK)
        if (!response.ok) {
            let errorMsg = `Falha ao enviar: ${response.status} ${response.statusText}`;
            try {
                // Tenta ler uma resposta de erro JSON da API
                const errorResult = await response.json();
                errorMsg = errorResult.error || errorResult.message || errorMsg;
            } catch (jsonError) {
                // Falha ao ler JSON (ex: é uma página 404 HTML, como no seu screenshot)
                console.warn("A resposta de erro não era JSON:", jsonError.message);
                if (response.status === 404) {
                    errorMsg = 'Não foi possível encontrar o endpoint da API (/api/request-access). Verifique a configuração do servidor.';
                }
            }
            // Lança o erro para ser pego pelo bloco catch
            throw new Error(errorMsg);
        }

        // Se a resposta foi OK, aí sim lemos o JSON
        const result = await response.json();

        showAlert('Solicitação enviada com sucesso! Você receberá um e-mail quando seu acesso for liberado.', 'success', 'request');
        requestAccessForm.reset();

    } catch (error) {
        console.error("Erro ao solicitar acesso:", error.message);
        // Exibe a mensagem de erro melhorada
        showAlert(error.message, 'error', 'request');
    } finally {
        setLoading(false, 'request');
    }
}


/* Removido
async function handleGoogleLogin() {
    // ...
}
*/

function setLoading(isLoading, formType = 'login') {
    let btn;
    if (formType === 'request') {
        btn = requestSubmitBtn;
    } else {
        btn = emailSubmitBtn;
        // googleLoginBtn.disabled = isLoading; // Removido
    }
    
    if (!btn) return;
    btn.disabled = isLoading;

    if (isLoading) {
        btn.innerHTML = `<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin: 0 auto;"></div>`;
    } else {
        if (formType === 'request') {
            btn.innerHTML = 'Enviar Solicitação';
        } else {
            // Rechamamos updateUI para garantir que o texto do botão (ENTRAR) esteja correto
            updateUI(window.location.hash || 'login'); 
        }
    }
}


function showAlert(message, type = 'error', formType = 'login') {
    const alertEl = (formType === 'request') ? requestAlert : loginAlert;
    if (!alertEl) {
        console.error("Elemento de Alerta não encontrado:", formType);
        return;
    }
    
    const alertClass = type === 'success' ? 'alert-success' : 'alert-error';
    alertEl.innerHTML = `<div class="alert ${alertClass}">${escapeHTML(message)}</div>`;
}

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#39;');
}

function traduzirErroSupabase(message) {
    if (message.includes('Invalid login credentials')) {
        return 'E-mail ou senha inválidos. Tente novamente.';
    }
    if (message.includes('User already registered')) {
        return 'Este e-mail já está cadastrado. Tente fazer login.';
    }
    if (message.includes('Password should be at least 6 characters')) {
        return 'A senha deve ter pelo menos 6 caracteres.';
    }
    if (message.includes('Email rate limit exceeded')) {
        return 'Muitas tentativas. Tente novamente mais tarde.';
    }
    return message; 
}

