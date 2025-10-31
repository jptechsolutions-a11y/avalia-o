import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.error("[request-access] Variáveis de ambiente não configuradas.");
        return res.status(500).json({ error: 'Falha de configuração do servidor.' });
    }

    try {
        const { nome, email, motivo } = req.body;

        if (!nome || !email || !motivo) {
            return res.status(400).json({ error: 'Nome, e-mail e motivo são obrigatórios.' });
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const { data, error } = await supabaseAdmin
            .from('solicitacoes_acesso')
            .insert([
                { nome, email, motivo, status: 'pendente' }
            ]);

        if (error) {
            console.error("[request-access] Erro do Supabase:", error.message);
            throw new Error(`Falha ao registrar solicitação: ${error.message}`);
        }

        res.status(200).json({ message: 'Solicitação enviada com sucesso!' });

    } catch (error) {
        console.error("[request-access] Erro:", error.message);
        res.status(500).json({ error: error.message || 'Falha interna do servidor.' });
    }
};
