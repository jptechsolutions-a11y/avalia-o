import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TABLE_NAME = 'colaboradores';

export default async (req, res) => {
    // 1. Validações Básicas
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.error("[import-qlp] Variáveis de ambiente ausentes.");
        return res.status(500).json({ error: 'Erro de configuração do servidor.' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        // 2. Segurança (Admin Check)
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token ausente.' });
        
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        
        if (userError || !user) return res.status(401).json({ error: 'Token inválido.' });

        const { data: profile } = await supabaseAdmin.from('usuarios').select('role').eq('auth_user_id', user.id).single();
        if (profile?.role !== 'admin') return res.status(403).json({ error: 'Acesso negado. Apenas admins.' });

        // 3. Processamento dos Dados
        const newData = req.body;
        if (!Array.isArray(newData) || newData.length === 0) return res.status(400).json({ error: 'Nenhum dado enviado.' });

        console.log(`[import-qlp] Iniciando processamento de ${newData.length} registros.`);

        // Normaliza os dados e garante que MATRICULA exista
        const cleanData = newData.map(item => {
            const matricula = String(item.CHAPA || item.MATRICULA || '').trim();
            if (!matricula) return null;

            return {
                matricula: matricula,
                nome: item.NOME ? item.NOME.toUpperCase().trim() : null,
                funcao: item.FUNCAO ? item.FUNCAO.toUpperCase().trim() : (item.FUNC ? item.FUNC.toUpperCase().trim() : null),
                secao: item.SECAO ? item.SECAO.toUpperCase().trim() : null,
                filial: item.CODFILIAL ? String(item.CODFILIAL).trim() : (item.FILIAL ? String(item.FILIAL).trim() : null),
                gestor_chapa: item.GESTOR_CHAPA ? String(item.GESTOR_CHAPA).trim() : null,
                status: 'ativo',
                updated_at: new Date().toISOString()
            };
        }).filter(Boolean); // Remove nulos

        // --- FASE 1: Dados Básicos (Sem Gestor) ---
        // Insere todo mundo primeiro para garantir que as matrículas existam.
        // Removemos 'gestor_chapa' deste payload para evitar erro de Foreign Key.
        
        const phase1Data = cleanData.map(({ gestor_chapa, ...rest }) => rest);
        const BATCH_SIZE = 500;
        let errors = [];

        for (let i = 0; i < phase1Data.length; i += BATCH_SIZE) {
            const batch = phase1Data.slice(i, i + BATCH_SIZE);
            const { error } = await supabaseAdmin.from(TABLE_NAME).upsert(batch, { onConflict: 'matricula' });
            
            if (error) {
                console.error(`[import-qlp] Erro Fase 1 (Lote ${i}):`, error.message);
                errors.push(`Base Lote ${i}: ${error.message}`);
            }
        }

        if (errors.length > 0) {
            return res.status(500).json({ error: 'Falha crítica ao importar colaboradores (Base).', details: errors });
        }

        // --- FASE 2: Vínculo Hierárquico (Apenas Gestor) ---
        // Agora que todos existem, atualizamos apenas o campo gestor_chapa.
        
        const phase2Data = cleanData
            .filter(item => item.gestor_chapa) // Só quem tem gestor
            .map(item => ({
                matricula: item.matricula,
                gestor_chapa: item.gestor_chapa,
                updated_at: new Date().toISOString() // Atualiza timestamp
            }));

        if (phase2Data.length > 0) {
            for (let i = 0; i < phase2Data.length; i += BATCH_SIZE) {
                const batch = phase2Data.slice(i, i + BATCH_SIZE);
                // Upsert aqui funciona como um Update pois a matrícula já existe da Fase 1
                const { error } = await supabaseAdmin.from(TABLE_NAME).upsert(batch, { onConflict: 'matricula' });
                
                if (error) {
                    console.warn(`[import-qlp] Erro Fase 2 (Hierarquia Lote ${i}):`, error.message);
                    // Não paramos o processo aqui, pois a base já foi importada. Apenas avisamos.
                    errors.push(`Hierarquia Lote ${i}: ${error.message}`);
                }
            }
        }

        if (errors.length > 0) {
            return res.status(207).json({ 
                message: 'Importação Parcial: Colaboradores salvos, mas houve falha ao vincular alguns gestores.', 
                details: errors 
            });
        }

        res.status(200).json({ message: `Sucesso! ${cleanData.length} colaboradores atualizados e hierarquia definida.` });

    } catch (error) {
        console.error('[import-qlp] Erro fatal:', error);
        res.status(500).json({ error: 'Erro interno no servidor.', details: error.message });
    }
};
