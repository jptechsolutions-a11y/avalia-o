// ATENÇÃO: Copie esta constante do seu script.js para cá.
const COMPETENCIAS = [
    { 
        nome: 'COMUNICAÇÃO E INFLUÊNCIA', 
        fatores: [
            'Respeita as opiniões divergentes, escuta de maneira aberta e respeitosa?',
            'Cria um ambiente de segurança e confiança mútua?'
        ] 
    },
    { 
        nome: 'DISCIPLINA DE EXECUÇÃO', 
        fatores: [
            'Garante planejamento e execução dentro dos prazos.',
            'Assume responsabilidade, cumpre normas e procedimentos.',
            'Conhece o negócio e acompanha resultados através de dados.'
        ] 
    },
    { 
        nome: 'GESTÃO DE CONFLITOS', 
        fatores: [
            'Consegue resolver conflitos/discussões na equipe?',
            'Trata de forma imparcial nas resoluções ?'
        ] 
    },
    { 
        nome: 'LIDERANÇA E GESTÃO DE PESSOAS', 
        fatores: [
            'Age com clareza na distribuição das atividades e responsabilidades.',
            'Tem facilidade em desenvolver atividades com perfis diferentes do seu',
            'Possui preocupação para o desenvolvimento dos liderados?'
        ],
        dissertativa: 'Cite uma promoção recente do setor (opcional):' 
    }
];

// Função para formatar o mês/ano
function formatarMesAno(dataString) {
    try {
        return new Date(dataString + 'T05:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    } catch (e) {
        return dataString; // Retorna a string original em caso de erro
    }
}

// Função para escapar HTML (segurança)
function escapeHTML(str) {
    if (str === null || str === undefined) return '(Não preenchido)';
    return String(str)
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#39;');
}

// Função principal que preenche o laudo
function preencherLaudo() {
    const dados = localStorage.getItem('avaliacaoParaLaudo');
    if (!dados) {
        document.body.innerHTML = '<h1>Erro: Dados da avaliação não encontrados.</h1><p>Por favor, feche esta aba e tente novamente.</p>';
        return;
    }

    const avaliacao = JSON.parse(dados);

    // 1. Dados da Avaliação
    document.getElementById('laudo-nome-avaliado').textContent = avaliacao.nome_avaliado;
    document.getElementById('laudo-mat-avaliado').textContent = avaliacao.matricula_avaliado;
    document.getElementById('laudo-filial').textContent = avaliacao.filial;
    document.getElementById('laudo-nome-gestor').textContent = avaliacao.nome_gestor;
    document.getElementById('laudo-mat-gestor').textContent = avaliacao.matricula_gestor;
    document.getElementById('laudo-mes').textContent = formatarMesAno(avaliacao.mes_referencia);

    // 2. Resultado Final
    document.getElementById('laudo-pontuacao').textContent = avaliacao.pontuacao;
    const classEl = document.getElementById('laudo-classificacao');
    classEl.textContent = avaliacao.classificacao;
    classEl.className = `laudo-classificacao classificacao-${avaliacao.classificacao.replace(' ', '-')}`;

    // 3. Competências
    const containerCompetencias = document.getElementById('laudo-competencias-container');
    containerCompetencias.innerHTML = '';
    let fatorIndex = 0;
    COMPETENCIAS.forEach(c => {
        let grupoHtml = `<div class="laudo-competencia-grupo">
                            <div class="laudo-competencia-header">${escapeHTML(c.nome)}</div>`;
        
        c.fatores.forEach(f => {
            const resposta = avaliacao.respostas_competencias ? avaliacao.respostas_competencias[`fator_${fatorIndex}`] : 'N/A';
            grupoHtml += `<div class="laudo-fator-item">
                            <span class="laudo-fator-nota">${resposta || 'N/A'}</span>
                            <span class="laudo-fator-texto">${escapeHTML(f)}</span>
                         </div>`;
            fatorIndex++;
        });

        if (c.dissertativa) {
            grupoHtml += `
                <div class="laudo-fator-item fator-item-dissertativa">
                    <strong>${escapeHTML(c.dissertativa)}</strong>
                    <p>${escapeHTML(avaliacao.dissertativa_lideranca)}</p>
                </div>`;
        }
        
        grupoHtml += `</div>`;
        containerCompetencias.innerHTML += grupoHtml;
    });

    // 4. Indicadores
    const containerIndicadores = document.getElementById('laudo-indicadores-container');
    containerIndicadores.innerHTML = avaliacao.html_indicadores || '<p><i>Indicadores não registrados para esta avaliação.</i></p>';

    // 5. Feedback
    document.getElementById('laudo-pontos-fortes').innerHTML = escapeHTML(avaliacao.pontos_fortes);
    document.getElementById('laudo-oportunidades').innerHTML = escapeHTML(avaliacao.oportunidades);
    document.getElementById('laudo-comentarios').innerHTML = escapeHTML(avaliacao.comentarios);

    // 6. Assinaturas e Data
    document.getElementById('laudo-ass-gestor').textContent = avaliacao.nome_gestor;
    document.getElementById('laudo-ass-avaliado').textContent = avaliacao.nome_avaliado;
    document.getElementById('laudo-data-geracao').textContent = new Date().toLocaleString('pt-BR');
    
    // 7. Limpa o localStorage para não guardar dados sensíveis
    localStorage.removeItem('avaliacaoParaLaudo');
}

// Roda a função quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', preencherLaudo);
