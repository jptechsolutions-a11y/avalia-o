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
        console.error(`[import-${DATA_TABLE}] Variáveis de ambiente Supabase não configuradas.`);
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
            return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
        }
        const token = authHeader.split(' ')[1];

        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) {
            return res.status(401).json({ error: 'Token inválido ou expirado.' });
        }

        // VERIFICA SE O USUÁRIO É ADMIN (ESSENCIAL PARA SEGURANÇA)
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('usuarios')
            .select('role')
            .eq('auth_user_id', user.id)
            .single();

        if (profileError || profile?.role !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado. Requer permissão de administrador.' });
        }

        // 4. Recebimento e Validação dos Dados
        const newData = req.body;
        if (!Array.isArray(newData) || newData.length === 0) {
            return res.status(400).json({ error: 'Corpo da requisição deve ser um array não-vazio de dados.' });
        }
        
        console.log(`[import-${DATA_TABLE}] Recebidos ${newData.length} registros do admin ${user.email}`);

        // --- INÍCIO DO PROCESSO DE IMPORTAÇÃO (Limpa e Insere) ---

        // Etapa 1: Limpar a tabela existente (como solicitado: "ele limpe tudo e traga atualizado")
        const { error: deleteError } = await supabaseAdmin
            .from(DATA_TABLE)
            .delete()
            .neq('CHAPA', 'NÃO_EXISTE'); // Usa uma condição que apaga tudo

        if (deleteError) {
            throw new Error(`Falha ao limpar dados existentes: ${deleteError.message}`);
        }
        
        // Etapa 2: Inserir os novos dados
        const { error: insertError } = await supabaseAdmin
            .from(DATA_TABLE)
            .insert(newData);

        if (insertError) {
            // Tenta inserir em lotes menores em caso de erro de limite de payload
            if (insertError.message.includes('Payload too large')) {
                console.warn(`[import-${DATA_TABLE}] Tentando importação em lotes menores...`);
                // Implementação simplificada: tenta inserir em 10 lotes
                const batchSize = Math.ceil(newData.length / 10);
                for (let i = 0; i < newData.length; i += batchSize) {
                    const batch = newData.slice(i, i + batchSize);
                    const { error: batchError } = await supabaseAdmin
                        .from(DATA_TABLE)
                        .insert(batch);
                    if (batchError) {
                         throw new Error(`Falha ao inserir lote ${i/batchSize + 1}: ${batchError.message}`);
                    }
                }
            } else {
                 throw new Error(`Falha ao importar novos dados: ${insertError.message}`);
            }
        }

        // Etapa 3: Atualizar os metadados (data da última atualização)
        const { error: metaError } = await supabaseAdmin
            .from(META_TABLE)
            .upsert({ id: 1, lastUpdatedAt: new Date().toISOString() }, { onConflict: 'id' });

        if (metaError) {
            console.warn(`[import-${DATA_TABLE}] Falha ao atualizar metadados: ${metaError.message}`);
        }

        // 5. Sucesso
        res.status(200).json({ 
            message: `Importação concluída! ${newData.length} registros inseridos.` 
        });

    } catch (error) {
        console.error(`[import-${DATA_TABLE}] Erro fatal na API:`, error.message);
        res.status(500).json({ 
            error: 'Falha interna do servidor', 
            details: error.message 
        });
    }
};
