import { createClient } from '@supabase/supabase-js';

// Carrega as variáveis de ambiente
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TABLE_NAME = 'colaboradores';

export default async (req, res) => {
    // 1. Validação do Método
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    // 2. Validação das Variáveis de Ambiente
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.error("[import-qlp] Variáveis de ambiente Supabase não configuradas.");
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

        // Verifica se é admin
        const { data: profile } = await supabaseAdmin
            .from('usuarios')
            .select('role')
            .eq('auth_user_id', user.id)
            .single();

        if (profile?.role !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado. Requer permissão de administrador.' });
        }

        // 4. Recebimento e Validação dos Dados
        const newData = req.body;
        if (!Array.isArray(newData) || newData.length === 0) {
            return res.status(400).json({ error: 'Corpo da requisição deve ser um array não-vazio de dados.' });
        }

        console.log(`[import-qlp] Processando ${newData.length} registros...`);

        // --- PROCESSO DE IMPORTAÇÃO INTELIGENTE ---
        
        // Estratégia:
        // 1. Todos os registros que vêm no arquivo são definidos como 'ativo'.
        // 2. Fazemos um UPSERT (Atualiza se existe, cria se não existe).
        // 3. (Opcional/Futuro) Para marcar como inativo quem NÃO veio, seria necessário garantir 
        //    que o arquivo é a base completa. Por segurança, esta API foca em ATUALIZAR/CRIAR.

        const preparedData = newData.map(item => {
            // Normaliza os campos para o banco de dados
            return {
                matricula: String(item.CHAPA || item.MATRICULA).trim(),
                nome: item.NOME ? item.NOME.toUpperCase().trim() : null,
                funcao: item.FUNCAO ? item.FUNCAO.toUpperCase().trim() : null,
                secao: item.SECAO ? item.SECAO.toUpperCase().trim() : null,
                filial: item.CODFILIAL ? String(item.CODFILIAL).trim() : (item.FILIAL ? String(item.FILIAL).trim() : null),
                // Se tiver gestor na planilha, atualiza. Se não, mantém null (ou o banco mantém o antigo se não enviarmos? 
                // No upsert do Supabase, se enviarmos null, ele sobrescreve. 
                // Vamos assumir que a QLP traz o gestor se a coluna existir.
                gestor_chapa: item.GESTOR_CHAPA ? String(item.GESTOR_CHAPA).trim() : undefined,
                status: 'ativo', // Força status ativo para quem está na lista importada
                updated_at: new Date().toISOString()
            };
        });

        // Remove chaves undefined para não apagar dados existentes acidentalmente (ex: gestor_chapa)
        const cleanData = preparedData.map(obj => {
            return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
        });

        // Executa o Upsert em lotes de 500 para não estourar limites
        const BATCH_SIZE = 500;
        let processedCount = 0;
        let errors = [];

        for (let i = 0; i < cleanData.length; i += BATCH_SIZE) {
            const batch = cleanData.slice(i, i + BATCH_SIZE);
            
            const { error } = await supabaseAdmin
                .from(TABLE_NAME)
                .upsert(batch, { onConflict: 'matricula' }); // Chave primária é matricula

            if (error) {
                console.error(`[import-qlp] Erro no lote ${i}:`, error);
                errors.push(`Erro no lote ${i}: ${error.message}`);
            } else {
                processedCount += batch.length;
            }
        }

        if (errors.length > 0) {
            return res.status(500).json({ 
                error: 'Houve erros durante a importação de alguns lotes.', 
                details: errors 
            });
        }

        res.status(200).json({ 
            message: `Importação concluída com sucesso! ${processedCount} colaboradores atualizados/criados.` 
        });

    } catch (error) {
        console.error('[import-qlp] Erro fatal:', error);
        res.status(500).json({ error: 'Falha interna do servidor', details: error.message });
    }
};
