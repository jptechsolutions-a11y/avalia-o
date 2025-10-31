import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.error("[upload] Variáveis de ambiente não configuradas.");
        return res.status(500).json({ error: 'Falha de configuração do servidor.' });
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error("[upload] Token JWT não encontrado");
        return res.status(401).json({ error: 'Não autorizado' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.split(' ')[1];
    
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
        console.error("[upload] Token JWT inválido:", userError?.message);
        return res.status(401).json({ error: 'Token inválido' });
    }

    const { fileName, fileType } = req.query;
    if (!fileName || !fileType) {
        return res.status(400).json({ error: 'fileName e fileType são obrigatórios na query string.' });
    }

    const fileBuffer = [];
    for await (const chunk of req) {
        fileBuffer.push(chunk);
    }
    const buffer = Buffer.concat(fileBuffer);
    
    const BUCKET_NAME = 'profile-pictures';
    const filePath = `${user.id}/${Date.now()}_${fileName}`;

    try {
        const { data, error: uploadError } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .upload(filePath, buffer, {
                contentType: fileType || 'application/octet-stream',
                upsert: true
            });

        if (uploadError) {
            console.error("[upload] Erro no upload para o Storage:", uploadError.message);
            throw new Error(`Falha no upload: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabaseAdmin.storage
            .from(BUCKET_NAME)
            .getPublicUrl(data.path);

        if (!publicUrl) {
             throw new Error("Falha ao obter URL pública após o upload.");
        }

        res.status(200).json({ publicUrl: publicUrl });

    } catch (error) {
        console.error("[upload] Erro:", error.message);
        res.status(500).json({ error: error.message || 'Falha interna do servidor.' });
    }
};
