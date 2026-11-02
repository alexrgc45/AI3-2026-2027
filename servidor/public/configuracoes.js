export function lerConfiguracoes() {
    const valoresPorOmissao = { tema: 'claro', ordenacao: 'recentes' };
    const bruto = localStorage.getItem('configuracoes');

    if (!bruto) {
        return valoresPorOmissao;
    }

    try {
        const config = JSON.parse(bruto);

        if (!config || typeof config !== 'object') {
            return valoresPorOmissao;
        }

        const tema = ['claro', 'escuro'].includes(config.tema) 
            ? config.tema 
            : valoresPorOmissao.tema;

        const ordenacao = ['recentes', 'estado'].includes(config.ordenacao) 
            ? config.ordenacao 
            : valoresPorOmissao.ordenacao;

        return { tema, ordenacao };
    } catch {
        return valoresPorOmissao;
    }
}

export function guardarConfiguracoes(configuracoes) {
    localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
}