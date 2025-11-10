import { createClient } from '@supabase/supabase-js';

// Carrega as variáveis de ambiente (mesmo padrão do seu proxy.js)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Nome da Tabela de Dados e Tabela de Metadados
const DATA_TABLE = 'pendencias_documentos_data';
const META_TABLE = 'pendencias_documentos_meta';

export default async (req, res) => {
    // ... (Validação do Método e Variáveis de Ambiente) ...

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        // 3. Validação do Usuário (Admin)
        const authHeader = req.headers.authorization;
        // JÁ ESTÁ VERIFICANDO SE O CABEÇALHO EXISTE E COMEÇA COM 'Bearer '
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // RETORNA 401 SE O TOKEN NÃO ESTIVER PRESENTE
            return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
        }
        const token = authHeader.split(' ')[1];
        
        // JÁ ESTÁ VALIDANDO O TOKEN CONTRA O SUPABASE
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) {
            // RETORNA 401 SE O TOKEN FOR INVÁLIDO/EXPIRADO
            return res.status(401).json({ error: 'Token inválido ou expirado.' });
        }

        // JÁ ESTÁ CHECANDO SE O USUÁRIO TEM A ROLE DE 'admin'
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('usuarios')
            .select('role')
            .eq('auth_user_id', user.id)
            .single();

        if (profileError || profile?.role !== 'admin') {
            // RETORNA 403 SE NÃO FOR ADMIN
            return res.status(403).json({ error: 'Acesso negado. Requer permissão de administrador.' });
        }
        
        // ... (Resto da Lógica de Importação) ...
        
    } catch (error) {
        // ...
    }
};
