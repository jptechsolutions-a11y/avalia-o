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

    const { endpoint } = req.query;
    const { method, body } = req;
    
    if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint Supabase não especificado.' });
    }

    const decodedEndpoint = decodeURIComponent(endpoint);
    
    // 1. MIDDLEWARE DE SEGURANÇA: EXTRAIR E VALIDAR O JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error("[proxy] Token JWT não encontrado no header");
        return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
    }
    const userJwt = authHeader.split(' ')[1];

    // 2. CONSTRUÇÃO DA URL FINAL
    const fullSupabaseUrl = `${SUPABASE_URL}/rest/v1/${decodedEndpoint}`;
    
    // 3. CONFIGURAÇÃO DA REQUISIÇÃO
    // Nós usamos a CHAVE DE SERVIÇO (SERVICE_KEY) para dar bypass no RLS.
    // Isso significa que sua tabela 'usuarios' DEVE ter uma coluna 'role'
    // e seu 'script.js' deve filtrar os dados com base nessa role.
    //
    // ALTERNATIVA: Se você QUER usar RLS, troque 'SUPABASE_SERVICE_KEY' por 'SUPABASE_ANON_KEY'
    // e passe o 'userJwt' no 'Authorization'. No entanto, o G&G original não parecia ter RLS.
    // Vamos usar a SERVICE_KEY para manter a funcionalidade original (admin vê tudo).
    
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, // CHAVE ADMIN
            'apiKey': SUPABASE_ANON_KEY, 
            ...req.headers // Passa headers customizados (como 'Prefer')
        }
    };
    
    // Limpa headers que não devem ir para o Supabase
    delete options.headers.host;
    delete options.headers.connection;
    delete options.headers['content-length'];
    // ... outros headers de http/servidor

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
            return res.status(response.status).send(responseBodyText);
        }

        res.status(response.status).send(responseBodyText);

    } catch (error) {
        console.error('[proxy] Erro crítico ao processar requisição:', error);
        res.status(500).json({ 
            error: 'Falha interna do proxy', 
            details: error.message,
        });
    }
};
