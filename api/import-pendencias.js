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
        
        // --- INÍCIO DO PROCESSO DE IMPORTAÇÃO (Usando UPSERT) ---
        
        // Etapa 1: Fazer o Upsert dos novos dados.
        // A chave de conflito é a chave primária composta: 'chapa, documento'.
        const { error: upsertError } = await supabaseAdmin
            .from(DATA_TABLE)
            .upsert(newData, { onConflict: 'chapa,documento' });

        if (upsertError) {
            // Se falhar, registra no log do servidor e retorna 500.
            console.error('[import-pendencias] Erro no UPSERT:', upsertError);
            throw new Error(`Falha ao importar novos dados: ${upsertError.message}`);
        }
        
        // Etapa 2 (NOVA): Excluir dados que NÃO ESTÃO na nova lista.
        // Como o usuário quer que "limpe tudo e traga atualizado",
        // precisamos de uma etapa para remover os documentos que sumiram da planilha.
        
        // Mapeia todas as chaves (chapa + documento) da nova lista.
        const newKeys = newData.map(d => `${d.chapa}|${d.documento}`);
        
        // A Supabase não suporta DELETE por 'not in' de forma eficiente na API.
        // O método mais seguro, mantendo a simplicidade do código, é confiar no 
        // UPSERT para atualizar o que existe. 
        
        // Para simular o "limpar tudo", vamos reverter a lógica para a que funcionou
        // no Banco de Horas (que não tem DELETE ALL, mas tem UPSERT).
        // Se a sua tabela tem apenas a chave composta, o UPSERT é o suficiente
        // para atualizar as linhas existentes. O que não for atualizado, permanece.
        // Para um "limpar TUDO e colocar NOVO", o UPSERT é incorreto, pois deixa os antigos.
        
        // *** REVERTENDO AO MODELO DE DELETE, mas com proteção extra ***
        // O erro 500 PODE ser causado pela perda do formato de data no payload.
        
        // Tentativa 2: Excluir tudo e inserir, confiando que o problema de permissão foi sanado.

        const { error: deleteError } = await supabaseAdmin
            .from(DATA_TABLE)
            .delete()
            .neq('codfilial', 'NULL_SENTINEL'); // Excluir por uma coluna que existe.

        if (deleteError) {
            // Se falhar o DELETE ALL, é aqui que o 500 acontece.
             throw new Error(`Falha ao limpar a base de dados: ${deleteError.message}`);
        }
        
        // Etapa 2: Inserir os novos dados (INSERT)
        const { error: insertError } = await supabaseAdmin
            .from(DATA_TABLE)
            .insert(newData);

        if (insertError) {
            throw new Error(`Falha ao importar novos dados: ${insertError.message}`);
        }
        
        // FIM DA REVERSÃO. Mantemos o DELETE + INSERT, pois é o que o usuário quer.
        
        // Etapa 3: Atualizar os metadados (data da última atualização)
        const { error: metaError } = await supabaseAdmin
            .from(META_TABLE)
            .upsert({ id: 1, lastupdatedat: new Date().toISOString() }, { onConflict: 'id' }); 

        if (metaError) {
            console.warn(`[import-pendencias] Falha ao atualizar metadados: ${metaError.message}`);
        }

        // 5. Sucesso
        res.status(200).json({ 
            message: `Importação concluída! ${newData.length} registros inseridos.` 
        });

    } catch (error) {
        console.error('[import-pendencias] Erro fatal na API:', error.message);
        // Garante que o frontend receba um JSON com o erro
        res.status(500).json({ 
            error: 'Falha interna do servidor', 
            details: error.message 
        });
    }
};
