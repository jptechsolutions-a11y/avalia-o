import { createClient } from '@supabase/supabase-js';

// Carrega as variáveis de ambiente (mesmo padrão do seu proxy.js)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async (req, res) => {
    // 1. Validação do Método
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    // 2. Validação das Variáveis de Ambiente
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.error("[import-banco-horas] Variáveis de ambiente Supabase não configuradas.");
        return res.status(500).json({ 
            error: 'Falha de Configuração do Servidor', 
            details: 'Variáveis de ambiente do Supabase não configuradas' 
        });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        // 3. Validação do Usuário (Admin)
        // Pega o token do header (enviado pelo banco_horas.html)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error("[import-banco-horas] Token JWT do usuário não encontrado");
            return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
        }
        const token = authHeader.split(' ')[1];

        // Verifica a validade do token
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) {
            console.error("[import-banco-horas] Token JWT inválido:", userError?.message);
            return res.status(401).json({ error: 'Token inválido ou expirado.' });
        }

        // VERIFICA SE O USUÁRIO É ADMIN (ESSENCIAL PARA SEGURANÇA)
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('usuarios')
            .select('role')
            .eq('auth_user_id', user.id)
            .single();

        if (profileError || profile?.role !== 'admin') {
            console.error(`[import-banco-horas] Usuário ${user.email} não é admin.`);
            return res.status(403).json({ error: 'Acesso negado. Requer permissão de administrador.' });
        }

        // 4. Recebimento e Validação dos Dados
        const newData = req.body;
        if (!Array.isArray(newData) || newData.length === 0) {
            return res.status(400).json({ error: 'Corpo da requisição deve ser um array não-vazio de dados.' });
        }
        
        console.log(`[import-banco-horas] Recebidos ${newData.length} registros do admin ${user.email}`);

        // --- INÍCIO DO PROCESSO DE IMPORTAÇÃO ---

        // Etapa 1: Buscar dados atuais para salvar no histórico
        const { data: currentData, error: fetchError } = await supabaseAdmin
            .from('banco_horas_data')
            .select('*');

        if (fetchError) {
            throw new Error(`Falha ao buscar dados atuais para histórico: ${fetchError.message}`);
        }

        // Etapa 2: Salvar o histórico (apenas se existir algo para salvar)
        if (currentData && currentData.length > 0) {
            const { error: historyError } = await supabaseAdmin
                .from('banco_horas_history')
                .insert({
                    data: currentData, // Salva o array de dados antigos
                    imported_by_user_id: user.id
                });
            
            if (historyError) {
                throw new Error(`Falha ao salvar histórico: ${historyError.message}`);
            }
        }
        
        // Etapa 3: Fazer o "Upsert" dos novos dados.
        // O Supabase (PostgreSQL) atualiza automaticamente se a Primary Key ('CHAPA') já existir.
        const { error: upsertError } = await supabaseAdmin
            .from('banco_horas_data')
            .upsert(newData, { onConflict: 'CHAPA' });

        if (upsertError) {
            throw new Error(`Falha ao importar (upsert) novos dados: ${upsertError.message}`);
        }

        // Etapa 4: Atualizar os metadados (data da última atualização)
        const { error: metaError } = await supabaseAdmin
            .from('banco_horas_meta')
            .upsert({ id: 1, lastUpdatedAt: new Date().toISOString() }, { onConflict: 'id' });

        if (metaError) {
            // Não é um erro fatal, mas é bom avisar
            console.warn(`[import-banco-horas] Falha ao atualizar metadados: ${metaError.message}`);
        }

        // 5. Sucesso
        res.status(200).json({ 
            message: `Importação concluída! ${newData.length} registros processados.` 
        });

    } catch (error) {
        console.error('[import-banco-horas] Erro fatal na API:', error.message);
        res.status(500).json({ 
            error: 'Falha interna do servidor', 
            details: error.message 
        });
    }
};
