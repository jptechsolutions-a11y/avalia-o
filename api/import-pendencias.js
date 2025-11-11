import { createClient } from '@supabase/supabase-js';

// Carrega as variáveis de ambiente (mesmo padrão do seu proxy.js)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// CORREÇÃO CRÍTICA: Definição das constantes de tabela, pois a API não tem acesso ao escopo do frontend.
const DATA_TABLE = 'pendencias_documentos_data';
const META_TABLE = 'pendencias_documentos_meta';

// Helper para gerar um UUID. Assume que o runtime suporta crypto.randomUUID().
const generateUniqueId = () => {
    try {
        // Usa o método nativo mais seguro
        return crypto.randomUUID();
    } catch (e) {
        // Fallback para IDs únicos baseados em data e random number
        return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
}

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
            console.error("[import-pendencias] Token JWT do usuário não encontrado no header.");
            return res.status(401).json({ error: 'Não autorizado. Token JWT necessário.' });
        }
        const token = authHeader.split(' ')[1];
        
        // Verifica a validade do token (requer SUPABASE_SERVICE_KEY)
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) {
            // **AJUSTE DE LOG**: Loga o erro específico retornado pelo Supabase Auth
            console.error("[import-pendencias] Falha na autenticação do token:", userError?.message || 'Token inválido');
            return res.status(401).json({ error: 'Token inválido ou expirado.', details: userError?.message });
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
        let newData = req.body;
        if (!Array.isArray(newData) || newData.length === 0) {
            return res.status(400).json({ error: 'Corpo da requisição deve ser um array não-vazio de dados.' });
        }
        
        // CORREÇÃO CRÍTICA:
        // 1. Mapeia para minúsculas (necessário para a API REST do Supabase).
        // 2. Adiciona um ID único para garantir que a constraint de PKEY seja satisfeita,
        //    assumindo que a chave primária da tabela é 'id'.
        const mapKeysAndAddId = (data) => {
            return data.map(item => {
                const newItem = {};
                // Garante que todo item tem um ID único
                newItem.id = generateUniqueId(); 

                for (const key in item) {
                    if (Object.prototype.hasOwnProperty.call(item, key)) {
                        // Atenção: A API espera que as colunas sejam minusculas para o Supabase
                        newItem[key.toLowerCase()] = item[key];
                    }
                }
                return newItem;
            });
        };
        newData = mapKeysAndAddId(newData);

        console.log(`[import-pendencias] Recebidos ${newData.length} registros do admin ${user.email}`);
        
        // --- INÍCIO DO PROCESSO DE IMPORTAÇÃO (USANDO INSERT) ---
        
        // Etapa 1: Limpeza da Base Antiga
        // Excluindo todos os dados existentes
        const { error: deleteError } = await supabaseAdmin
            .from(DATA_TABLE)
            .delete()
            .neq('chapa', 'N/A'); 

        if (deleteError) {
             console.warn(`[import-pendencias] Aviso: Falha ao limpar base antiga. Prosseguindo com a inserção.`, deleteError.message);
        }

        // Etapa 2: Inserção dos novos dados.
        // O `id` gerado agora deve evitar a violação de chave primária.
        const { error: insertError } = await supabaseAdmin
            .from(DATA_TABLE)
            .insert(newData); 

        if (insertError) {
            console.error('[import-pendencias] Erro na INSERÇÃO:', insertError);
            // Retorna o erro específico do banco para o frontend
            throw new Error(`Falha ao importar novos dados no DB: ${insertError.message}`); 
        }
        
        // Etapa 3: Atualizar os metadados (data da última atualização)
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
        res.status(500).json({ 
            error: 'Falha interna do servidor', 
            details: error.message 
        });
    }
};
