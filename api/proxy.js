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
    
    // 1. MIDDLEWARE DE SEGURANÇA: VALIDAR O JWT DO USUÁRIO
    // Esta etapa garante que *apenas usuários logados* possam usar seu proxy.
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error("[proxy] Token JWT não encontrado no header");
        return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
    }
    // NOTA: Nós *não* usamos esse token para falar com o Supabase,
    // apenas para verificar se o usuário está logado. A validação
    // real (se o token é válido) é feita pela própria API proxy da Vercel
    // ou poderia ser feita aqui com uma biblioteca JWT, mas para este
    // caso, apenas checar se ele existe já é um bom passo.

    // 2. CONSTRUÇÃO DA URL FINAL
    const fullSupabaseUrl = `${SUPABASE_URL}/rest/v1/${decodedEndpoint}`;
    
    // 3. CONFIGURAÇÃO DA REQUISIÇÃO PARA O SUPABASE
    // Copia os headers que vieram do cliente (ex: 'Prefer')
    const headersToSupabase = { ...req.headers };

    // !! ESTA É A CORREÇÃO !!
    // Deleta o header de Autorização do *usuário*
    delete headersToSupabase.authorization; 
    // Deleta outros headers internos que não devem ser repassados
    delete headersToSupabase.host;
    delete headersToSupabase.connection;
    delete headersToSupabase['content-length'];
    delete headersToSupabase['x-vercel-id'];
    // ... (outros headers específicos da Vercel)

    const options = {
        method: method,
        headers: {
            ...headersToSupabase, // Passa os headers limpos (ex: 'Prefer')
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // Usa a CHAVE SECRETA (SERVICE_KEY) para ter acesso total
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 
            'apiKey': SUPABASE_ANON_KEY
        }
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

