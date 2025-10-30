// login.js

// -----------------------------------------------------------------
// ... (Configuração SUPABASE_URL e SUPABASE_ANON_KEY) ...
// -----------------------------------------------------------------
// !! SUBSTITUA PELAS SUAS CHAVES PÚBLICAS REAIS !!
const SUPABASE_URL = 'https://URL_DO_SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_CHAVE_PUBLICA_ANON_AQUI';
// -----------------------------------------------------------------

// Elementos da UI
const loginCard = document.getElementById('loginCard'); // NOVO
const requestAccessCard = document.getElementById('requestAccessCard'); // NOVO

const formTitle = document.getElementById('formTitle');
// ... existing code ... -->
const loginAlert = document.getElementById('loginAlert');
const passwordLabel = document.querySelector('label[for="password"]');

// Elementos do formulário de solicitação (NOVOS)
const requestAccessForm = document.getElementById('requestAccessForm');
const requestSubmitBtn = document.getElementById('requestSubmitBtn');
const toggleLinkRequest = document.getElementById('toggleLinkRequest');
const requestAlert = document.getElementById('requestAlert');

let isRequestAccess = false; // Substitui isSignUp
let isForgot = false;

// Inicializa o cliente Supabase
// ... existing code ... -->
try {
    if (!SUPABASE_URL || SUPABASE_URL.includes('URL_DO_SEU_PROJETO')) {
// ... existing code ... -->
    }
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (error) {
// ... existing code ... -->
    showAlert("Erro de configuração do cliente. Verifique o console.", 'error');
}


document.addEventListener('DOMContentLoaded', () => {
// ... existing code ... -->
    }

    checkHash(); // Verifica se a URL é #request ou #forgot
    window.addEventListener('hashchange', checkHash);

    googleLoginBtn.addEventListener('click', handleGoogleLogin);
    emailForm.addEventListener('submit', handleEmailFormSubmit);
    toggleLink.addEventListener('click', toggleMode);
    forgotLink.addEventListener('click', toggleForgotMode);
    
    // Novos listeners
    requestAccessForm.addEventListener('submit', handleRequestAccessSubmit);
    toggleLinkRequest.addEventListener('click', toggleMode);


    // Handler para quando o usuário clica no link de reset de senha no e-mail
// ... existing code ... -->
        } else if (event === 'SIGNED_IN') {
             // Redireciona se o login for bem-sucedido
             window.location.href = 'app.html';
// ... existing code ... -->
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session && window.location.hash !== '#reset') {
            window.location.href = 'app.html';
// ... existing code ... -->
});

function checkHash() {
    isRequestAccess = (window.location.hash === '#request'); // Alterado de isSignUp
    isForgot = (window.location.hash === '#forgot');
    
    if (window.location.hash === '#reset') {
// ... existing code ... -->
    } else if (isForgot) {
        updateUI('forgot');
    } else if (isRequestAccess) { // Alterado de isSignUp
        updateUI('request');
    } else {
        updateUI('login');
// ... existing code ... -->
}

function toggleMode(e) {
    if (e) e.preventDefault();
    isRequestAccess = !isRequestAccess; // Alterado de isSignUp
    isForgot = false;
    window.location.hash = isRequestAccess ? '#request' : ''; // Alterado de #signup
    checkHash();
}

function toggleForgotMode(e) {
// ... existing code ... -->
    isForgot = true;
    isRequestAccess = false; // Alterado de isSignUp
    window.location.hash = '#forgot';
    checkHash();
// ... existing code ... -->

function updateUI(mode) {
    loginAlert.innerHTML = '';
    requestAlert.innerHTML = ''; // Limpa o novo alerta
    const passwordGroup = document.getElementById('password').parentElement;

    if (mode === 'request') { // Alterado de 'signup'
        loginCard.style.display = 'none';
        requestAccessCard.style.display = 'block';
    } else if (mode === 'forgot') {
        loginCard.style.display = 'block';
        requestAccessCard.style.display = 'none';
        
        formTitle.textContent = 'Recuperar Senha';
// ... existing code ... -->
        passwordGroup.style.display = 'none';
    } else if (mode === 'reset') {
        loginCard.style.display = 'block';
        requestAccessCard.style.display = 'none';

        formTitle.textContent = 'Redefinir Senha';
// ... existing code ... -->
        passwordGroup.style.display = 'block';
    } else { // modo 'login'
        loginCard.style.display = 'block';
        requestAccessCard.style.display = 'none';

        formTitle.textContent = 'Sistema de Avaliação G&G';
// ... existing code ... -->
        passwordGroup.style.display = 'block';
    }
}

// Handler do formulário principal
async function handleEmailFormSubmit(e) {
// ... existing code ... -->
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const mode = window.location.hash;

    try {
        // REMOVIDO O BLOCO DE '#signup'
        
        if (mode === '#forgot') {
            // Modo Recuperar Senha
// ... existing code ... -->
            });
            if (error) throw error;
            showAlert('Link de recuperação enviado! Verifique seu e-mail.', 'success');
        
        } else if (mode === '#reset') {
// ... existing code ... -->
            // Modo Login
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
// ... existing code ... -->
    } catch (error) {
        console.error("Erro de autenticação:", error.message);
        showAlert(traduzirErroSupabase(error.message), 'error');
    } finally {
// ... existing code ... -->
    }
}

// NOVO: Handler para o formulário de Solicitação de Acesso
async function handleRequestAccessSubmit(e) {
    e.preventDefault();
    setLoading(true, 'request'); // Seta o loading no botão de solicitação

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


// Handler do Login com Google
async function handleGoogleLogin() {
// ... existing code ... -->
    if (error) {
        showAlert(traduzirErroSupabase(error.message), 'error');
        setLoading(false);
    }
// ... existing code ... -->
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
        // Restaura o texto original
        if (formType === 'request') {
            btn.innerHTML = 'Enviar Solicitação';
        } else {
            checkHash(); // Restaura o texto dos botões de login/reset/forgot
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
// ... existing code ... -->
}

function traduzirErroSupabase(message) {
// ... existing code ... -->
    if (message.includes('User already registered')) {
        // Este erro não deve mais acontecer, mas é bom manter
        return 'Este e-mail já está cadastrado. Tente fazer login.';
    }
    if (message.includes('Password should be at least 6 characters')) {
// ... existing code ... -->

