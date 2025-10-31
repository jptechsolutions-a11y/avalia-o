// /api/proxy.js
// Esta é uma função serverless (Vercel, Netlify, etc.)
// Ela protege suas chaves secretas do Supabase.

// As chaves são carregadas das Variáveis de Ambiente (configuradas no painel da Vercel)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // A CHAVE SECRETA!

export default async (req, res) => {
    // --- VERIFICAÇÃO CRÍTICA DE VARIÁVEIS ---
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
        console.error("ERRO CRÍTICO [proxy]: Variáveis de ambiente Supabase não configuradas na Vercel.");
        return res.status(500).json({ 
            error: 'Falha de Configuração do Servidor', 
            details: 'Variáveis de ambiente do Supabase não configuradas' 
        });
    }

    // Pega o 'endpoint' da query string (ex: "usuarios?id=eq.1")
    const { endpoint } = req.query;
    const { method, body } = req;
    
    if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint Supabase não especificado.' });
    }

    // Decodifica o endpoint para caso tenha caracteres especiais
    const decodedEndpoint = decodeURIComponent(endpoint);
    
    // 1. VERIFICAÇÃO DE SEGURANÇA (Verifica se o usuário está logado)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error("[proxy] Token JWT do usuário não encontrado no header");
        return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
    }
    // (Nós não usamos esse token, mas verificamos se ele existe)
    
    // 2. CONSTRUÇÃO DA URL FINAL
    const fullSupabaseUrl = `${SUPABASE_URL}/rest/v1/${decodedEndpoint}`;
    
    // 3. CONFIGURAÇÃO DA REQUISIÇÃO (A CORREÇÃO ESTÁ AQUI)
    // Criamos um objeto de headers "limpo"
    const headersToSupabase = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Usa a CHAVE SECRETA (SERVICE_KEY) para ter acesso total e BURLAR O RLS
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 
        'apiKey': SUPABASE_ANON_KEY
    };

    // Passa o header 'Prefer' (para contagem, upsert, etc.) se ele foi enviado pelo cliente
    if (req.headers.prefer) {
        headersToSupabase.Prefer = req.headers.prefer;
    }
    
    const options = {
        method: method,
        headers: headersToSupabase // Usa o objeto de headers limpo e seguro
    };
    
    if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
        options.body = JSON.stringify(body);
    }
    
    // 4. EXECUÇÃO E TRATAMENTO DE ERROS
    try {
        const response = await fetch(fullSupabaseUrl, options);
        
        // Repassa os headers de 'content-range' (importante para contagem)
        if (response.headers.has('content-range')) {
            res.setHeader('content-range', response.headers.get('content-range'));
        }
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');

        const responseBodyText = await response.text();

        if (!response.ok) {
            console.error(`[proxy] Resposta não OK do Supabase (${response.status}):`, responseBodyText);
            // Repassa o erro do Supabase para o cliente
            return res.status(response.status).send(responseBodyText);
        }

        // Repassa a resposta de sucesso do Supabase para o cliente
        res.status(response.status).send(responseBodyText);

    } catch (error) {
        console.error('[proxy] Erro crítico ao processar requisição:', error);
        res.status(500).json({ 
            error: 'Falha interna do proxy', 
            details: error.message,
        });
    }
};

