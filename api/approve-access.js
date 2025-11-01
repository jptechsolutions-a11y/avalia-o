import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.error("[approve-access] Variáveis de ambiente não configuradas.");
        return res.status(500).json({ error: 'Falha de configuração do servidor.' });
    }

    // Validação de segurança (simplificada): 
    // Em um app real, verifique aqui se o usuário que chama é um admin.
    // O proxy.js já checa o token JWT, o que é um bom começo.

    const { solicitacao_id, email, nome } = req.body;

    if (!solicitacao_id || !email || !nome) {
        return res.status(400).json({ error: 'solicitacao_id, email e nome são obrigatórios.' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        // Etapa 1: Convidar o usuário para o sistema de autenticação
        // Isso envia um e-mail para o usuário definir sua própria senha.
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            email,
            { data: { full_name: nome } } // Passa metadados (como o nome)
        );

        if (inviteError) {
            console.error("[approve-access] Erro ao convidar usuário (auth):", inviteError.message);
            // Trata erro comum de usuário já existente
            if (inviteError.message.includes('User already registered')) {
                return res.status(409).json({ error: 'Este e-mail já está cadastrado no sistema.' });
            }
            throw new Error(`Falha ao convidar usuário: ${inviteError.message}`);
        }

        const newAuthUser = inviteData.user;

        // Etapa 2: Criar o perfil do usuário na tabela 'usuarios'
        // Seu script.js (initializeApp) já faz isso no primeiro login, 
        // mas criar aqui garante que o usuário já tenha permissões.
        const { error: profileError } = await supabaseAdmin
            .from('usuarios')
            .insert({
                auth_user_id: newAuthUser.id,
                email: newAuthUser.email,
                nome: nome,
                role: 'user', // Define a permissão padrão
                status: 'ativo'
            });

        if (profileError) {
            // Se o perfil já existir (talvez de um convite anterior), não trate como erro fatal
            console.warn("[approve-access] Aviso ao criar perfil (pode já existir):", profileError.message);
        }

        // Etapa 3: Atualizar o status da solicitação original para 'aprovado'
        const { error: updateError } = await supabaseAdmin
            .from('solicitacoes_acesso')
            .update({ status: 'aprovado' })
            .eq('id', solicitacao_id);

        if (updateError) {
            // Isso é um problema, mas o usuário já foi convidado.
            console.error("[approve-access] Erro ao atualizar solicitação:", updateError.message);
        }

        // Se tudo deu certo:
        res.status(200).json({ message: 'Usuário convidado e solicitação aprovada!' });

    } catch (error) {
        console.error("[approve-access] Erro:", error.message);
        res.status(500).json({ error: error.message || 'Falha interna do servidor.' });
    }
};
