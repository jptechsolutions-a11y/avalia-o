const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; 

export default async (req, res) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
        console.error("ERRO CRÍTICO [proxy]: Variáveis de ambiente Supabase não configuradas.");
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
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error("[proxy] Token JWT do usuário não encontrado no header");
        return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
    }
    
    const fullSupabaseUrl = `${SUPABASE_URL}/rest/v1/${decodedEndpoint}`;
    
    const headersToSupabase = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 
        'apiKey': SUPABASE_ANON_KEY
    };

    if (req.headers.prefer) {
        headersToSupabase.Prefer = req.headers.prefer;
    }
    
    const options = {
        method: method,
        headers: headersToSupabase
    };
    
    if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
        options.body = JSON.stringify(body);
    }
    
    try {
        const response = await fetch(fullSupabaseUrl, options);
        
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
