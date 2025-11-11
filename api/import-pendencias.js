import { createClient } from '@supabase/supabase-js';

// Carrega as variáveis de ambiente (mesmo padrão do seu proxy.js)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Nome da Tabela de Dados e Tabela de Metadados
const DATA_TABLE = 'pendencias_documentos_data';
const META_TABLE = 'pendencias_documentos_meta';

export default async (req, res) => {
    // 1. Validação do Método
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    // 2. Validação das Variáveis de Ambiente
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.error("[import-pendencias] Variáveis de ambiente Supabase não configuradas.");
        return res.status(500).json({ 
            error: 'Falha de Configuração do Servidor', 
            details: 'Variáveis de ambiente do Supabase não configuradas' 
        });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        // 3. Validação do Usuário (Admin)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error("[import-pendencias] Token JWT do usuário não encontrado");
            return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
        }
        const token = authHeader.split(' ')[1];
        
        // Verifica a validade do token
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) {
            console.error("[import-pendencias] Token JWT inválido/expirado:", userError?.message || 'Token inválido');
            // Retorna 401 para que o frontend entenda que a sessão expirou
            return res.status(401).json({ error: 'Token inválido ou expirado.' });
        }

        // VERIFICA SE O USUÁRIO É ADMIN (ESSENCIAL PARA SEGURANÇA)
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('usuarios')
            .select('role')
            .eq('auth_user_id', user.id)
            .single();

        if (profileError || profile?.role !== 'admin') {
            console.error(`[import-pendencias] Usuário ${user.email || user.id} não é admin. Role: ${profile?.role}`);
            return res.status(403).json({ error: 'Acesso negado. Requer permissão de administrador.' });
        }
        
        // 4. Recebimento e Validação dos Dados
        const newData = req.body;
        if (!Array.isArray(newData) || newData.length === 0) {
            return res.status(400).json({ error: 'Corpo da requisição deve ser um array não-vazio de dados.' });
        }
        
        console.log(`[import-pendencias] Recebidos ${newData.length} registros do admin ${user.email}`);
        
        // --- INÍCIO DO PROCESSO DE IMPORTAÇÃO (USANDO UPSERT) ---
        
        // Etapa 1: Fazer o Upsert dos novos dados.
        // Chave de conflito composta: CHAPA, DOCUMENTO
        const { error: upsertError } = await supabaseAdmin
            .from(DATA_TABLE)
            .upsert(newData, { onConflict: 'CHAPA,DOCUMENTO' }); 

        if (upsertError) {
            console.error('[import-pendencias] Erro no UPSERT:', upsertError);
            // CORREÇÃO: Passa a mensagem de erro do Supabase para o frontend
            throw new Error(`Falha ao importar novos dados no DB: ${upsertError.message}`); 
        }
        
        // Etapa 2: Atualizar os metadados (data da última atualização)
        const { error: metaError } = await supabaseAdmin
            .from(META_TABLE)
            .upsert({ id: 1, lastupdatedat: new Date().toISOString() }, { onConflict: 'id' }); 

        if (metaError) {
            console.warn(`[import-pendencias] Falha ao atualizar metadados: ${metaError.message}`);
        }

        // 5. Sucesso
        res.status(200).json({ 
            message: `Importação concluída! ${newData.length} registros processados.` 
        });

    } catch (error) {
        console.error('[import-pendencias] Erro fatal na API:', error.message);
        // CORREÇÃO: Inclui a mensagem detalhada da exceção no retorno 500
        res.status(500).json({ 
            error: 'Falha interna do servidor', 
            details: error.message 
        });
    }
};
