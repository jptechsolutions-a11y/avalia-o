const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8';

const loginCard = document.getElementById('loginCard');
const requestAccessCard = document.getElementById('requestAccessCard');

const formTitle = document.getElementById('formTitle');
const formSubtitle = document.getElementById('formSubtitle');
const emailForm = document.getElementById('emailForm');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const emailSubmitBtn = document.getElementById('emailSubmitBtn');
const toggleText = document.getElementById('toggleText');
const toggleLink = document.getElementById('toggleLink');
const forgotLink = document.getElementById('forgotLink');
const loginAlert = document.getElementById('loginAlert');
const passwordLabel = document.querySelector('label[for="password"]');

const requestAccessForm = document.getElementById('requestAccessForm');
const requestSubmitBtn = document.getElementById('requestSubmitBtn');
const toggleLinkRequest = document.getElementById('toggleLinkRequest');
const requestAlert = document.getElementById('requestAlert');

let isRequestAccess = false; 
let isForgot = false;
let supabaseClient;

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
    showAlert("Erro de configuração do cliente. Verifique o console.", 'error');
}


document.addEventListener('DOMContentLoaded', () => {
    if (!supabaseClient) {
        showAlert("Falha crítica ao carregar o Supabase. Verifique as chaves no login.js.", 'error');
        return;
    }

    checkHash(); 
    window.addEventListener('hashchange', checkHash);

    googleLoginBtn.addEventListener('click', handleGoogleLogin);
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

    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session && window.location.hash !== '#reset') {
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
    loginAlert.innerHTML = '';
    requestAlert.innerHTML = ''; 
    const passwordGroup = document.getElementById('password').parentElement;

    if (mode === 'request') { 
        loginCard.style.display = 'none';
        requestAccessCard.style.display = 'block';
    } else if (mode === 'forgot') {
        loginCard.style.display = 'block';
        requestAccessCard.style.display = 'none';
        
        formTitle.textContent = 'Recuperar Senha';
        formSubtitle.textContent = 'Digite seu e-mail para enviarmos um link de recuperação.';
        emailSubmitBtn.innerHTML = 'Enviar Link <i data-feather="arrow-right" class="h-4 w-4 ml-2"></i>';
        toggleText.textContent = 'Lembrou a senha?';
        toggleLink.textContent = 'Entrar';
        toggleLink.href = '#';
        passwordGroup.style.display = 'none';
    } else if (mode === 'reset') {
        loginCard.style.display = 'block';
        requestAccessCard.style.display = 'none';

        formTitle.textContent = 'Redefinir Senha';
        formSubtitle.textContent = 'Digite sua nova senha.';
        emailSubmitBtn.innerHTML = 'Salvar Nova Senha <i data-feather="save" class="h-4 w-4 ml-2"></i>';
        toggleText.textContent = '';
        toggleLink.textContent = '';
        toggleLink.href = '#';
        forgotLink.style.display = 'none';
        googleLoginBtn.style.display = 'none';
        document.querySelector('.flex.items-center.my-4').style.display = 'none'; 
        document.getElementById('email').parentElement.style.display = 'none'; 
        passwordGroup.style.display = 'block';
    } else { 
        loginCard.style.display = 'block';
        requestAccessCard.style.display = 'none';

        formTitle.textContent = 'Sistema de Avaliação G&G';
        formSubtitle.textContent = 'Acesse para continuar';
        emailSubmitBtn.innerHTML = 'Entrar';
        toggleText.textContent = 'Não tem uma conta?';
        toggleLink.textContent = 'Solicitar Acesso';
        toggleLink.href = '#request';
        forgotLink.style.display = 'block';
        googleLoginBtn.style.display = 'flex';
        document.querySelector('.flex.items-center.my-4').style.display = 'flex';
        document.getElementById('email').parentElement.style.display = 'block';
        passwordGroup.style.display = 'block';
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

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Falha ao enviar solicitação.');
        }

        showAlert('Solicitação enviada com sucesso! Você receberá um e-mail quando seu acesso for liberado.', 'success', 'request');
        requestAccessForm.reset();

    } catch (error) {
        console.error("Erro ao solicitar acesso:", error.message);
        showAlert(error.message, 'error', 'request');
    } finally {
        setLoading(false, 'request');
    }
}


async function handleGoogleLogin() {
    setLoading(true);
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/app.html' 
        }
    });

    if (error) {
        showAlert(traduzirErroSupabase(error.message), 'error');
        setLoading(false);
    }
}

function setLoading(isLoading, formType = 'login') {
    let btn;
    if (formType === 'request') {
        btn = requestSubmitBtn;
    } else {
        btn = emailSubmitBtn;
        googleLoginBtn.disabled = isLoading;
    }
    
    if (!btn) return;
    btn.disabled = isLoading;

    if (isLoading) {
        btn.innerHTML = `<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin: 0 auto;"></div>`;
    } else {
        if (formType === 'request') {
            btn.innerHTML = 'Enviar Solicitação';
        } else {
            checkHash(); 
        }
    }
}


function showAlert(message, type = 'error', formType = 'login') {
    const alertEl = (formType === 'request') ? requestAlert : loginAlert;
    if (!alertEl) return;
    
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
