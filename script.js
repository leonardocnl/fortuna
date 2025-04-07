let gBloqueioRecursao = false;
let gGraficoEvolucao = null;
let gGraficoCarteira = null;
let gGraficoDividendos = null;
let gTimeoutSimulacao = null;
let historicoGlobal = null;
const MAX_MESES_SIMULACAO = 40 * 12;
const MIN_INVESTIMENTO_RELEVANTE = 0.01;
let imaskInstances = {};
let gSortableInstance = null;

function calcularYieldSeguro(dividendos, preco) {
    const dividendoNum = Number(dividendos) || 0;
    const precoNum = Number(preco) || 0;
    return precoNum === 0 ? 0 : dividendoNum / precoNum;
}

function formatarMoeda(valor) {
    const numero = Number(valor);
    if (isNaN(numero)) { return 'R$ 0,00'; }
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numero);
}

function parseFormattedNumber(valorString) {
    if (typeof valorString !== 'string') { valorString = String(valorString || '0'); }
    const numeroLimpo = valorString.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(numeroLimpo);
    return isNaN(parsed) ? 0 : parsed;
}

function arredondarParaMoeda(valor) {
    const numero = Number(valor);
    if (isNaN(numero)) { return 0; }
    return Math.round(numero * 100) / 100;
}

function mostrarMensagem(mensagem, tipo = 'success') {
    const container = document.getElementById('message-container');
    if (!container) { console.error("Elemento #message-container não encontrado."); alert(mensagem); return; }
    const mensagemElement = document.createElement('div');
    mensagemElement.className = tipo === 'success' ? 'success-message' : 'error-message';
    const iconClass = tipo === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    mensagemElement.innerHTML = `<i class="fas ${iconClass}"></i> ${mensagem}`;
    container.appendChild(mensagemElement);
    const animationDuration = 4000;
    setTimeout(() => { mensagemElement.remove(); }, animationDuration);
}
function mostrarMensagemSucesso(mensagem) { mostrarMensagem(mensagem, 'success'); }
function mostrarMensagemErro(mensagem) { mostrarMensagem(mensagem, 'error'); }

function limparResultadosVisuais(limparGraficos = true) {
    if (limparGraficos && typeof Chart !== 'undefined') {
        const destroyChart = (chartInstance) => { if (chartInstance instanceof Chart) { chartInstance.destroy(); } };
        destroyChart(gGraficoEvolucao); gGraficoEvolucao = null;
        destroyChart(gGraficoCarteira); gGraficoCarteira = null;
        destroyChart(gGraficoDividendos); gGraficoDividendos = null;
        if (document.getElementById('grafico-evolucao')) {
            try { inicializarGraficos(); } catch (e) { console.error("Falha ao reinicializar gráficos:", e); }
        }
    }
    const tblBody = document.getElementById('simulation-table')?.querySelector('tbody');
    if (tblBody) { tblBody.innerHTML = '<tr class="placeholder-row"><td colspan="9">Calcule a simulação para ver detalhes.</td></tr>'; }
    document.getElementById('tabela-detalhada')?.setAttribute('style', 'display: none;');
    const resDiv = document.getElementById('resultado-simulacao');
    if (resDiv) {
        resDiv.innerHTML = '';
        resDiv.className = 'result-placeholder card-body';
        const placeholderContent = document.createElement('div');
        placeholderContent.innerHTML = `<i class="fas fa-info-circle fa-2x" style="color: #aaa; margin-bottom: 1rem; display: block;"></i><p>Preencha os dados acima, adicione ativos (totalizando 100%) e clique em "Simular Resultados".</p>`;
        resDiv.appendChild(placeholderContent);
        resDiv.style.minHeight = null; resDiv.style.display = null;
        resDiv.style.alignItems = null; resDiv.style.justifyContent = null;
    }
    document.getElementById('graficos')?.setAttribute('style', 'display: none;');
}


function getChartDefaultOptions() {
   const cssRoot = document.documentElement;
   const getCssVar = (name, fallback) => getComputedStyle(cssRoot).getPropertyValue(name).trim() || fallback;
   const corFundoTooltip = getCssVar('--color-secondary', '#0a1128');
   const corTextoTooltip = getCssVar('--color-surface', '#ffffff');
   const corTextoMuted = getCssVar('--color-text-muted', '#6c757d');
   const corBordaGrid = getCssVar('--color-border', '#dee2e6');
   const corTextoLegenda = getCssVar('--color-text', '#0a1128');

   return {
       responsive: true, maintainAspectRatio: false,
       interaction: { mode: 'index', intersect: false },
       plugins: {
           tooltip: {
               backgroundColor: corFundoTooltip, titleColor: corTextoTooltip, bodyColor: corTextoTooltip,
               padding: 10, cornerRadius: 6, titleFont: { weight: 'bold' },
               callbacks: { label: ctx => `${ctx.dataset.label || ''}: ${formatarMoeda(ctx.raw)}` }
           },
           legend: { display: false, position: 'top', labels: { color: corTextoLegenda, padding: 10, usePointStyle: true, pointStyle: 'rectRounded', font: { size: 11 } } },
           datalabels:{ display: false }
       },
       scales: {
           y: { beginAtZero: true, ticks: { callback: val => formatarMoeda(val), color: corTextoMuted, font: { size: 11 } }, grid: { color: corBordaGrid, borderDash: [2, 3] } },
           x: { ticks: { display: true, maxRotation: 45, autoSkip: true, maxTicksLimit: 15, color: corTextoMuted, font: { size: 10 } }, grid: { display: false } }
       }
   };
}

function inicializarGraficos() {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js não carregado.');
        return;
    }
    const defaultOptions = getChartDefaultOptions();
    const ctxEvolucao = document.getElementById('grafico-evolucao')?.getContext('2d');
    if (ctxEvolucao) {
        if (gGraficoEvolucao instanceof Chart) gGraficoEvolucao.destroy();
        try {
             gGraficoEvolucao = new Chart(ctxEvolucao, {
                type: 'line', data: { labels: [], datasets: [] },
                options: { ...defaultOptions, plugins: { ...defaultOptions.plugins, legend: { ...defaultOptions.plugins.legend, display: true } }, scales: { ...defaultOptions.scales, x: { ...defaultOptions.scales.x, ticks: { ...defaultOptions.scales.x.ticks, display: false }}}}
             });
        } catch(e) {
             console.error("Erro ao inicializar Gráfico de Evolução:", e);
             gGraficoEvolucao = null;
        }
    } else {
        console.warn("Canvas #grafico-evolucao não encontrado.");
        if (gGraficoEvolucao instanceof Chart) gGraficoEvolucao.destroy();
        gGraficoEvolucao = null;
    }
    const ctxCarteira = document.getElementById('grafico-carteira')?.getContext('2d');
    if (ctxCarteira) {
         if (gGraficoCarteira instanceof Chart) gGraficoCarteira.destroy();
         try {
             gGraficoCarteira = new Chart(ctxCarteira, {
                type: 'doughnut', data: { labels: [], datasets: [] },
                options: { ...defaultOptions, cutout: '70%', plugins: { ...defaultOptions.plugins, tooltip: { ...defaultOptions.plugins.tooltip, callbacks: { label: ctx => `${ctx.label?.split(' (')[0]}: ${formatarMoeda(ctx.raw)}` } }, legend: { ...defaultOptions.plugins.legend, display: true, position: 'bottom', labels: { ...defaultOptions.plugins.legend.labels, padding: 15, boxWidth: 15 } } }, layout: { padding: 5 }, scales:{x: {display: false},y:{display: false}}}
             });
         } catch(e) {
              console.error("Erro ao inicializar Gráfico de Carteira:", e);
              gGraficoCarteira = null;
         }
    } else {
        console.warn("Canvas #grafico-carteira não encontrado.");
        if (gGraficoCarteira instanceof Chart) gGraficoCarteira.destroy();
        gGraficoCarteira = null;
    }
    const ctxDividendos = document.getElementById('grafico-dividendos')?.getContext('2d');
     if (ctxDividendos) {
         if (gGraficoDividendos instanceof Chart) gGraficoDividendos.destroy();
          try {
             gGraficoDividendos = new Chart(ctxDividendos, {
                type: 'bar', data: { labels: [], datasets: [] },
                options: { ...defaultOptions, plugins: { ...defaultOptions.plugins, legend: { display: false }, tooltip: { ...defaultOptions.plugins.tooltip, callbacks: { title: (items) => items[0]?.label || '', label: (ctx) => `Dividendos: ${formatarMoeda(ctx.parsed.y)}` } } }, scales: { ...defaultOptions.scales, x: { ...defaultOptions.scales.x, ticks: { ...defaultOptions.scales.x.ticks, display: false }}}}
             });
          } catch(e) {
               console.error("Erro ao inicializar Gráfico de Dividendos:", e);
               gGraficoDividendos = null;
          }
    } else {
        console.warn("Canvas #grafico-dividendos não encontrado.");
         if (gGraficoDividendos instanceof Chart) gGraficoDividendos.destroy();
         gGraficoDividendos = null;
    }
}

function obterInputsSimulacao() {
    const formElements = {
        aporteInicial: document.getElementById('aporte-inicial'),
        aporteMensal: document.getElementById('aporte-mensal'),
        tipoSimulacao: document.getElementById('tipo-simulacao'),
        periodoValor: document.getElementById('periodo-valor'),
        periodoTipo: document.getElementById('periodo-tipo'),
        metaPatrimonio: document.getElementById('meta-patrimonio'),
        custoVida: document.getElementById('custo-vida'),
        estrategiaReinvestimento: document.getElementById('estrategia-reinvestimento'),
        inflacaoAnual: document.getElementById('inflacao-anual'),
        corrigirAporteInflacao: document.getElementById('corrigir-aporte-inflacao')
    };
    if (Object.keys(formElements).filter(k => !['estrategiaReinvestimento', 'inflacaoAnual', 'corrigirAporteInflacao'].includes(k)).some(key => !formElements[key])) {
        console.error("Elementos essenciais do formulário não encontrados.");
        mostrarMensagemErro("Erro ao ler dados do formulário.");
        return null;
    }
    let ativos = [];
    try {
        ativos = JSON.parse(localStorage.getItem('ativos') || '[]');
        if (!Array.isArray(ativos)) ativos = [];
    }
    catch(e){ console.error("Erro ao ler ativos do LS:", e); ativos = []; localStorage.removeItem('ativos'); }

    const inflacaoAnualPerc = parseFormattedNumber(formElements.inflacaoAnual?.value);
    const annualInflationRate = inflacaoAnualPerc / 100;

    return {
        aporteInicial: parseFormattedNumber(formElements.aporteInicial?.value),
        aporteMensal: parseFormattedNumber(formElements.aporteMensal.value),
        tipoSimulacao: formElements.tipoSimulacao.value,
        periodoValor: parseInt(formElements.periodoValor.value || '0', 10),
        periodoTipo: formElements.periodoTipo.value,
        metaPatrimonio: parseFormattedNumber(formElements.metaPatrimonio.value),
        custoVida: parseFormattedNumber(formElements.custoVida.value),
        estrategiaReinvestimento: formElements.estrategiaReinvestimento?.value || 'rebalancear',
        annualInflationRate: annualInflationRate,
        corrigirAporteInflacao: formElements.corrigirAporteInflacao?.checked || false,
        ativos: ativos
    };
}

function validarInputs(inputs) {
    let periodoMeses = 0;
    if (inputs.aporteInicial < 0) return { isValid: false, errorMsg: 'O aporte inicial não pode ser negativo.', periodoMeses };
    if (inputs.custoVida < 0) return { isValid: false, errorMsg: 'O custo de vida mensal não pode ser negativo.', periodoMeses };
    if (inputs.annualInflationRate < 0) return { isValid: false, errorMsg: 'A inflação anual não pode ser negativa.', periodoMeses }; // Valida taxa anual
    if (!inputs.ativos || inputs.ativos.length === 0) return { isValid: false, errorMsg: 'Adicione pelo menos um ativo para simular.', periodoMeses };

    const somaAlocacoes = inputs.ativos.reduce((soma, ativo) => soma + parseFormattedNumber(ativo.alocacao), 0);
    if (Math.abs(somaAlocacoes - 100) > 0.01) { return { isValid: false, errorMsg: `A soma das alocações deve ser 100% (atual: ${somaAlocacoes.toFixed(2)}%).`, periodoMeses }; }
    if (inputs.ativos.some(ativo => parseFormattedNumber(ativo.preco) <= 0)) { return { isValid: false, errorMsg: 'Todos os ativos devem ter um preço maior que zero.', periodoMeses }; }

    if (!['prioridade', 'rebalancear'].includes(inputs.estrategiaReinvestimento)) {
        return { isValid: false, errorMsg: 'Estratégia de reinvestimento selecionada é inválida.', periodoMeses };
    }

    if (inputs.tipoSimulacao === 'periodo') {
        periodoMeses = (inputs.periodoTipo === 'anos') ? inputs.periodoValor * 12 : inputs.periodoValor;
        if (inputs.periodoValor <= 0 || periodoMeses <= 0) return { isValid: false, errorMsg: 'O período da simulação deve ser maior que zero.', periodoMeses };
    } else if (inputs.tipoSimulacao === 'meta-patrimonio') {
        if (inputs.metaPatrimonio <= 0) return { isValid: false, errorMsg: 'A meta de patrimônio deve ser maior que zero.', periodoMeses };
        if (inputs.aporteMensal <= 0 && inputs.aporteInicial < inputs.metaPatrimonio) {
             return { isValid: false, errorMsg: 'O aporte mensal deve ser maior que zero para simular até atingir a meta.', periodoMeses };
        }
    } else { return { isValid: false, errorMsg: 'Tipo de simulação inválido.', periodoMeses }; }

    return { isValid: true, errorMsg: null, periodoMeses };
}

function processarAtivos(ativosRaw) {
    const ativosComPrioridade = ativosRaw.map((ativo, originalIndex) => {
        const precoNum = parseFormattedNumber(ativo.preco);
        const dividendosNum = parseFormattedNumber(ativo.dividendos);
        const alocacaoNum = parseFormattedNumber(ativo.alocacao);
        let prioridadeNum = parseInt(ativo.prioridade, 10);
        if (isNaN(prioridadeNum) || prioridadeNum <= 0) { prioridadeNum = 999; }

        return {
            originalIndex: originalIndex, nome: ativo.nome || 'Ativo Sem Nome',
            alocacaoRaw: ativo.alocacao, precoRaw: ativo.preco,
            dividendosRaw: ativo.dividendos, prioridadeRaw: ativo.prioridade,
            preco: precoNum, dividendos: dividendosNum, alocacao: alocacaoNum,
            prioridade: prioridadeNum,
            yieldMensal: calcularYieldSeguro(dividendosNum, precoNum)
        };
    });

    return ativosComPrioridade.sort((a, b) => {
        if (a.prioridade !== b.prioridade) { return a.prioridade - b.prioridade; }
        return a.originalIndex - b.originalIndex;
    });
}


function executarMesSimulacao(estadoAnterior, aporteDoMes, ativosProcessadosPrioridade, estrategiaReinvestimento, annualInflationRate) { // Recebe taxa ANUAL
    const { cotasPorAtivo: cotasAtuais, dinheiroOciosoMes: ociosoAnterior } = estadoAnterior;
    const _aporteMensal = Number(aporteDoMes) || 0;
    const _ociosoAnterior = Number(ociosoAnterior) || 0;
    const _dividendosMesAnterior = cotasAtuais.reduce((soma, qtd, index) => {
        const ativo = ativosProcessadosPrioridade.find(a => a.originalIndex === index);
        return soma + (qtd * (ativo?.dividendos || 0));
    }, 0);
    let _valorInvestidoEsteMes = 0;
    const novasCotas = [...cotasAtuais];
    let _sobrasFase1Pool = 0;
    const ativosCompráveis = ativosProcessadosPrioridade.filter(a => a.preco > 0);
    if (ativosCompráveis.length === 0) {
        const patrimonioInvestidoMes = arredondarParaMoeda(cotasAtuais.reduce((s, q, i) => { const a = ativosProcessadosPrioridade.find(at => at.originalIndex === i); return s + (q * (a?.preco || 0)); }, 0));
        const dinheiroNaoUsado = _aporteMensal + _dividendosMesAnterior + _ociosoAnterior;
        return { novasCotas: cotasAtuais, dinheiroOciosoFinal: arredondarParaMoeda(dinheiroNaoUsado), dividendosMes: 0, investidoMes: 0, patrimonioInvestidoMes: patrimonioInvestidoMes };
    }
    const menorPrecoGeral = Math.min(...ativosCompráveis.map(a => a.preco));

    if (_aporteMensal > 0) {
       const ativosOrdemOriginal = [...ativosProcessadosPrioridade].sort((a,b) => a.originalIndex - b.originalIndex);
       ativosOrdemOriginal.forEach(ativo => {
           if (ativo.preco <= 0) return;
           const valorAlocarFase1 = _aporteMensal * (ativo.alocacao / 100);
           let gastoFase1Ativo = 0;
           if (valorAlocarFase1 >= ativo.preco) {
               const cotasComprar = Math.floor(valorAlocarFase1 / ativo.preco);
               if (cotasComprar > 0) {
                   gastoFase1Ativo = cotasComprar * ativo.preco;
                   novasCotas[ativo.originalIndex] += cotasComprar;
                   _valorInvestidoEsteMes += gastoFase1Ativo;
               }
           }
           _sobrasFase1Pool += (valorAlocarFase1 - gastoFase1Ativo);
       });
    }

    const _poolReinvestimento = _sobrasFase1Pool + _dividendosMesAnterior + _ociosoAnterior;
    let _dinheiroRestanteFase2 = _poolReinvestimento;

    if (_dinheiroRestanteFase2 >= menorPrecoGeral) {
        if (estrategiaReinvestimento === 'rebalancear') {
            const patrimonioInvestidoAntesFase2 = novasCotas.reduce((soma, qtd, index) => {
                 const ativo = ativosProcessadosPrioridade.find(a => a.originalIndex === index);
                 return soma + (qtd * (ativo?.preco || 0));
            }, 0);
            if (patrimonioInvestidoAntesFase2 > 0) {
                let ativosParaRebalancear = [];
                ativosProcessadosPrioridade.forEach(ativo => {
                    if (ativo.preco <= 0) return;
                    const valorAtualAtivo = novasCotas[ativo.originalIndex] * ativo.preco;
                    const percentualAtual = (valorAtualAtivo / patrimonioInvestidoAntesFase2) * 100;
                    const percentualMeta = ativo.alocacao;
                    const diferenca = percentualMeta - percentualAtual;
                    if (diferenca > 0 && _dinheiroRestanteFase2 >= ativo.preco) {
                        ativosParaRebalancear.push({ ...ativo, diferenca: diferenca });
                    }
                });
                if (ativosParaRebalancear.length > 0) {
                    ativosParaRebalancear.sort((a, b) => {
                        if (b.diferenca !== a.diferenca) { return b.diferenca - a.diferenca; }
                        return b.yieldMensal - a.yieldMensal;
                    });
                    const targetAsset = ativosParaRebalancear[0];
                    if (_dinheiroRestanteFase2 >= targetAsset.preco) {
                         const cotasComprar = Math.floor(_dinheiroRestanteFase2 / targetAsset.preco);
                         if (cotasComprar > 0) {
                             const gastoFase2a = cotasComprar * targetAsset.preco;
                             novasCotas[targetAsset.originalIndex] += cotasComprar;
                             _valorInvestidoEsteMes += gastoFase2a;
                             _dinheiroRestanteFase2 -= gastoFase2a;
                         }
                    }
                }
            }
            if (_dinheiroRestanteFase2 >= menorPrecoGeral) {
                 for (const ativo of ativosProcessadosPrioridade) {
                     if (ativo.preco <= 0 || _dinheiroRestanteFase2 < ativo.preco) continue;
                     const cotasComprar = Math.floor(_dinheiroRestanteFase2 / ativo.preco);
                     if (cotasComprar > 0) {
                         const gastoFase2b = cotasComprar * ativo.preco;
                         novasCotas[ativo.originalIndex] += cotasComprar;
                         _valorInvestidoEsteMes += gastoFase2b;
                         _dinheiroRestanteFase2 -= gastoFase2b;
                     }
                     if (_dinheiroRestanteFase2 < menorPrecoGeral) break;
                 }
            }
        } else {
            for (const ativo of ativosProcessadosPrioridade) {
                if (ativo.preco <= 0 || _dinheiroRestanteFase2 < ativo.preco) continue;
                const cotasComprar = Math.floor(_dinheiroRestanteFase2 / ativo.preco);
                if (cotasComprar > 0) {
                    const gastoFase2 = cotasComprar * ativo.preco;
                    novasCotas[ativo.originalIndex] += cotasComprar;
                    _valorInvestidoEsteMes += gastoFase2;
                    _dinheiroRestanteFase2 -= gastoFase2;
                }
                if (_dinheiroRestanteFase2 < menorPrecoGeral) break;
            }
        }
    }
    const _sobrasFinaisMes = _dinheiroRestanteFase2;
    const _dividendosGeradosMesAtual = novasCotas.reduce((soma, qtd, index) => {
        const ativo = ativosProcessadosPrioridade.find(a => a.originalIndex === index);
        return soma + (qtd * (ativo?.dividendos || 0));
    }, 0);
    const patrimonioInvestidoMes = arredondarParaMoeda(
        novasCotas.reduce((s, q, i) => {
            const a = ativosProcessadosPrioridade.find(at => at.originalIndex === i);
            return s + (q * (a?.preco || 0));
        }, 0)
    );
    return {
        novasCotas: novasCotas,
        dinheiroOciosoFinal: arredondarParaMoeda(_sobrasFinaisMes),
        dividendosMes: arredondarParaMoeda(_dividendosGeradosMesAtual),
        investidoMes: arredondarParaMoeda(_valorInvestidoEsteMes),
        patrimonioInvestidoMes: patrimonioInvestidoMes
    };
}

function calcularInvestimentoInicial(aporteInicial, ativosProcessadosPrioridade, estrategiaReinvestimento, annualInflationRate) {
    const estadoZero = { cotasPorAtivo: ativosProcessadosPrioridade.map(() => 0), dinheiroOciosoMes: 0 };
    const resultadoMesZero = executarMesSimulacao(estadoZero, aporteInicial, ativosProcessadosPrioridade, estrategiaReinvestimento, annualInflationRate);
    return {
        cotasPorAtivo: resultadoMesZero.novasCotas, dinheiroOciosoInicial: resultadoMesZero.dinheiroOciosoFinal,
        patrimonioInvestidoInicial: resultadoMesZero.patrimonioInvestidoMes, investidoNoInicio: resultadoMesZero.investidoMes
    };
}

function executarCicloSimulacao(params) {
    const { aporteInicial, aporteMensal, tipoSimulacao, periodoMeses, metaPatrimonio,
            custoVida, estrategiaReinvestimento, annualInflationRate,
            corrigirAporteInflacao, ativosProcessadosPrioridade } = params;

    const estadoInicial = calcularInvestimentoInicial(aporteInicial, ativosProcessadosPrioridade, estrategiaReinvestimento, annualInflationRate);
    historicoGlobal = {
        mesesLabels: [0], patrimonioInvestidoHist: [estadoInicial.patrimonioInvestidoInicial],
        totalAportadoHist: [0], dividendosHist: [0], investidoMesHist: [estadoInicial.investidoNoInicio],
        ociosoHist: [estadoInicial.dinheiroOciosoInicial],
        aporteMesHist: [aporteInicial]
    };

    let estadoAtual = { cotasPorAtivo: estadoInicial.cotasPorAtivo, dinheiroOciosoMes: estadoInicial.dinheiroOciosoInicial };
    let totalAportadoAcumulado = aporteInicial;
    let mes = 0;

    let continuar = (m, pInvestido, pOcioso) => m < periodoMeses;
    if (tipoSimulacao === 'meta-patrimonio') {
        continuar = (m, pInvestido, pOcioso) => {
            const anosCompletos = Math.floor(m / 12);
            const fatorInflacao = Math.pow(1 + annualInflationRate, anosCompletos);
            const metaCorrigida = metaPatrimonio * fatorInflacao;
            return (arredondarParaMoeda(pInvestido + pOcioso) < arredondarParaMoeda(metaCorrigida)) && m < MAX_MESES_SIMULACAO;
        }
    }

    while (continuar(mes, historicoGlobal.patrimonioInvestidoHist[mes], historicoGlobal.ociosoHist[mes])) {
        mes++;
        const anosCompletos = Math.floor((mes - 1) / 12);
        const fatorInflacaoAnualAcumulada = Math.pow(1 + annualInflationRate, anosCompletos);
        const aporteDoMes = corrigirAporteInflacao ? (aporteMensal * fatorInflacaoAnualAcumulada) : aporteMensal;
        const aporteDoMesArredondado = arredondarParaMoeda(aporteDoMes);

        const resultadoMes = executarMesSimulacao(estadoAtual, aporteDoMesArredondado, ativosProcessadosPrioridade, estrategiaReinvestimento, annualInflationRate);
        estadoAtual = { cotasPorAtivo: resultadoMes.novasCotas, dinheiroOciosoMes: resultadoMes.dinheiroOciosoFinal };
        totalAportadoAcumulado = arredondarParaMoeda(totalAportadoAcumulado + aporteDoMesArredondado); // Acumula desde o inicial

        historicoGlobal.mesesLabels.push(mes);
        historicoGlobal.patrimonioInvestidoHist.push(resultadoMes.patrimonioInvestidoMes);
        historicoGlobal.totalAportadoHist.push(totalAportadoAcumulado);
        historicoGlobal.dividendosHist.push(resultadoMes.dividendosMes);
        historicoGlobal.investidoMesHist.push(resultadoMes.investidoMes);
        historicoGlobal.ociosoHist.push(resultadoMes.dinheiroOciosoFinal);
        historicoGlobal.aporteMesHist.push(aporteDoMesArredondado);
    }

    if (tipoSimulacao === 'meta-patrimonio' && mes === MAX_MESES_SIMULACAO) {
         const patrimonioFinalTotal = arredondarParaMoeda(historicoGlobal.patrimonioInvestidoHist[mes] + historicoGlobal.ociosoHist[mes]);
         const anosCompletosFinais = Math.floor(mes / 12);
         const metaFinalCorrigida = arredondarParaMoeda(metaPatrimonio * Math.pow(1 + annualInflationRate, anosCompletosFinais));
         if (patrimonioFinalTotal < metaFinalCorrigida) {
             mostrarMensagemErro(`Meta (corrigida p/ inflação: ${formatarMoeda(metaFinalCorrigida)}) não atingida em ${MAX_MESES_SIMULACAO / 12} anos.`);
         }
    }

    const ultimoIndice = historicoGlobal.mesesLabels.length - 1;
    const dadosFinais = {
        patrimonioInvestidoFinal: historicoGlobal.patrimonioInvestidoHist[ultimoIndice],
        dinheiroOciosoFinal: historicoGlobal.ociosoHist[ultimoIndice],
        patrimonioTotalFinal: arredondarParaMoeda(historicoGlobal.patrimonioInvestidoHist[ultimoIndice] + historicoGlobal.ociosoHist[ultimoIndice]),
        totalAportadoFinal: totalAportadoAcumulado,
        dividendosUltimoMes: historicoGlobal.dividendosHist[ultimoIndice] || 0,
        mesesSimulados: mes,
        cotasPorAtivoFinal: estadoAtual.cotasPorAtivo,
        aporteInicialUtilizado: aporteInicial,
        custoVidaMensal: custoVida,
        tipoSimulacao: tipoSimulacao,
        metaPatrimonioOriginal: tipoSimulacao === 'meta-patrimonio' ? metaPatrimonio : undefined,
        annualInflationRate: annualInflationRate,
        corrigirAporteInflacao: corrigirAporteInflacao
    };
    return { historico: historicoGlobal, dadosFinais };
}


function calcularSimulacaoPrincipal() {
    if (gBloqueioRecursao) { return; }
    gBloqueioRecursao = true;
    try {
        const inputs = obterInputsSimulacao();
        if (!inputs) { gBloqueioRecursao = false; return; }
        const validacao = validarInputs(inputs);
        if (!validacao.isValid) {
            mostrarMensagemErro(validacao.errorMsg);
            if (!validacao.errorMsg.toLowerCase().includes('ativo')) {
                 limparResultadosVisuais();
            } else {
                 limparResultadosVisuais(false);
            }
            gBloqueioRecursao = false; return;
        }
        const ativosProcessadosPrioridade = processarAtivos(inputs.ativos);
        if (ativosProcessadosPrioridade.length === 0 && inputs.ativos.length > 0) {
            mostrarMensagemErro("Erro ao processar ativos. Verifique os dados."); limparResultadosVisuais(); gBloqueioRecursao = false; return;
        }
        const paramsSimulacao = { ...inputs, periodoMeses: validacao.periodoMeses, ativosProcessadosPrioridade: ativosProcessadosPrioridade };
        let resultadoSimulacao = null;

         if(inputs.tipoSimulacao === 'meta-patrimonio' && arredondarParaMoeda(inputs.aporteInicial) >= arredondarParaMoeda(inputs.metaPatrimonio * Math.pow(1 + inputs.annualInflationRate, 0))) { // Compara com meta no tempo 0
             const estadoInicial = calcularInvestimentoInicial(inputs.aporteInicial, ativosProcessadosPrioridade, inputs.estrategiaReinvestimento, inputs.annualInflationRate);
             resultadoSimulacao = {
                historico: { mesesLabels: [0], patrimonioInvestidoHist: [estadoInicial.patrimonioInvestidoInicial], totalAportadoHist: [inputs.aporteInicial], dividendosHist: [0], investidoMesHist: [estadoInicial.investidoNoInicio], ociosoHist: [estadoInicial.dinheiroOciosoInicial], aporteMesHist: [inputs.aporteInicial] },
                dadosFinais: { patrimonioInvestidoFinal: estadoInicial.patrimonioInvestidoInicial, dinheiroOciosoFinal: estadoInicial.dinheiroOciosoInicial, patrimonioTotalFinal: arredondarParaMoeda(estadoInicial.patrimonioInvestidoInicial + estadoInicial.dinheiroOciosoInicial), totalAportadoFinal: inputs.aporteInicial, dividendosUltimoMes: 0, mesesSimulados: 0, cotasPorAtivoFinal: estadoInicial.cotasPorAtivo, aporteInicialUtilizado: inputs.aporteInicial, custoVidaMensal: inputs.custoVida, tipoSimulacao: 'periodo', metaPatrimonioOriginal: inputs.metaPatrimonio, annualInflationRate: inputs.annualInflationRate, corrigirAporteInflacao: inputs.corrigirAporteInflacao }
             };
             historicoGlobal = resultadoSimulacao.historico;
        } else {
            resultadoSimulacao = executarCicloSimulacao(paramsSimulacao);
        }
        if (resultadoSimulacao && resultadoSimulacao.historico) {
            atualizarInterfaceUsuario(resultadoSimulacao.dadosFinais, resultadoSimulacao.historico, ativosProcessadosPrioridade);
        } else {
            limparResultadosVisuais();
        }
    } catch (error) {
        console.error("Erro crítico durante a simulação:", error);
        mostrarMensagemErro(`Erro inesperado: ${error.message}. Verifique o console (F12).`);
        limparResultadosVisuais();
    } finally {
        gBloqueioRecursao = false;
    }
}


function renderResultListItem(label, value, iconClass, valueClass = '', smallText = '', title = '') {
    const finalIconClass = iconClass.startsWith('fa-') ? iconClass : `fa-${iconClass}`;
    const titleAttr = title ? ` title="${title}"` : '';
    return `
        <div class="result-list-item">
            <span class="result-label"${titleAttr}><i class="fas ${finalIconClass}"></i> ${label}</span>
            <span class="result-value ${valueClass}">${value} ${smallText ? `<small>${smallText}</small>` : ''}</span>
        </div>`;
}


function calculateMetricsSummary(dadosFinais, historico) {
    const { patrimonioTotalFinal, totalAportadoFinal, dividendosUltimoMes, aporteInicialUtilizado,
            custoVidaMensal, tipoSimulacao, mesesSimulados, annualInflationRate } = dadosFinais;
    const { dividendosHist, mesesLabels } = historico;
    let mesParaViverDeRenda = -1;
    if (custoVidaMensal > 0 && tipoSimulacao === 'periodo' && dividendosHist?.length > 1) {
        for (let i = 1; i < dividendosHist.length; i++) {
            const anosCompletos = Math.floor((i - 1) / 12);
            const fatorInflacaoAnual = Math.pow(1 + annualInflationRate, anosCompletos);
            const custoVidaCorrigido = custoVidaMensal * fatorInflacaoAnual;
            if (arredondarParaMoeda(dividendosHist[i]) >= arredondarParaMoeda(custoVidaCorrigido)) {
                mesParaViverDeRenda = mesesLabels[i];
                break;
            }
        }
    }
    const retornoTotalSobreAportes = arredondarParaMoeda(patrimonioTotalFinal - totalAportadoFinal); // Usa totalAportadoFinal
    const pctRetornoSobreTotalInvestido = totalAportadoFinal > 0 ? arredondarParaMoeda((retornoTotalSobreAportes / totalAportadoFinal) * 100) : 0;
    const anosCompletosFinais = Math.floor(mesesSimulados / 12);
    const fatorDeflacaoAnual = Math.pow(1 + annualInflationRate, anosCompletosFinais);
    const patrimonioTotalFinalReal = fatorDeflacaoAnual > 0 ? arredondarParaMoeda(patrimonioTotalFinal / fatorDeflacaoAnual) : patrimonioTotalFinal;
    const dividendosUltimoMesReal = fatorDeflacaoAnual > 0 ? arredondarParaMoeda(dividendosUltimoMes / fatorDeflacaoAnual) : dividendosUltimoMes;
    const custoVidaFinalCorrigido = custoVidaMensal * fatorDeflacaoAnual;
    const pctDividendosSobrePatrimonioFinal = patrimonioTotalFinal > 0 ? arredondarParaMoeda((dividendosUltimoMes / patrimonioTotalFinal) * 100) : 0;
    return {
        mesParaViverDeRenda, retornoTotalSobreAportes, pctRetornoSobreTotalInvestido,
        pctDividendosSobrePatrimonioFinal, patrimonioTotalFinalReal, dividendosUltimoMesReal,
        custoVidaFinalCorrigido, totalAportadoFinal: totalAportadoFinal
    };
}


function generateSummaryHtml(dadosFinais, metricas, historico, inputs) {
    const { aporteInicialUtilizado, patrimonioTotalFinal,
            custoVidaMensal, mesesSimulados, tipoSimulacao, metaPatrimonioOriginal, annualInflationRate } = dadosFinais;
    const { mesParaViverDeRenda, retornoTotalSobreAportes, pctRetornoSobreTotalInvestido,
            pctDividendosSobrePatrimonioFinal, patrimonioTotalFinalReal, dividendosUltimoMesReal,
            custoVidaFinalCorrigido, totalAportadoFinal } = metricas;
    const { dividendosUltimoMes } = dadosFinais;

    let resultadosItems = [];
    const inflacaoInfo = annualInflationRate > 0 ? ` (Inflação ${(annualInflationRate * 100).toFixed(1)}% a.a.)` : '';
    const valorRealTitle = annualInflationRate > 0 ? `Valor nominal no futuro / Valor real em poder de compra de hoje` : '';
    const aporteCorrigidoInfo = inputs.corrigirAporteInflacao && annualInflationRate > 0 ? '(Aportes corrigidos p/ Inflação)' : '';

    if (tipoSimulacao === 'periodo') {
        resultadosItems = [
            { label: 'Aporte Inicial', value: formatarMoeda(aporteInicialUtilizado), icon: 'coins' },
            { label: `Patrimônio Total Final${inflacaoInfo}`, value: formatarMoeda(patrimonioTotalFinal), icon: 'landmark', smallText: annualInflationRate > 0 ? `(Valor Real Hoje: ${formatarMoeda(patrimonioTotalFinalReal)})` : '', title: valorRealTitle },
            { label: 'Total Aportado (Acum.)', value: formatarMoeda(totalAportadoFinal), icon: 'piggy-bank', smallText: aporteCorrigidoInfo },
            { label: 'Dividendos Último Mês', value: formatarMoeda(dividendosUltimoMes), icon: 'hand-holding-usd', valueClass: 'positive', smallText: annualInflationRate > 0 ? `(Valor Real Hoje: ${formatarMoeda(dividendosUltimoMesReal)})` : `(${pctDividendosSobrePatrimonioFinal.toFixed(1)}% do Patrim.)`, title: valorRealTitle },
            { label: 'Ganho Sobre Aportes', value: formatarMoeda(retornoTotalSobreAportes), icon: retornoTotalSobreAportes >= 0 ? 'arrow-trend-up' : 'arrow-trend-down', valueClass: retornoTotalSobreAportes >= 0 ? 'positive' : 'negative', smallText: `(${pctRetornoSobreTotalInvestido.toFixed(2)}% Nominal)` }
        ];
        if (custoVidaMensal > 0) {
            const custoVidaLabel = `'Viver de Renda' (${formatarMoeda(custoVidaMensal)}/mês Hoje)`;
            if (mesParaViverDeRenda !== -1) {
                const anosCompletosRenda = Math.floor((mesParaViverDeRenda - 1) / 12);
                const custoVidaCorrigidoMes = arredondarParaMoeda(custoVidaMensal * Math.pow(1 + annualInflationRate, anosCompletosRenda));
                resultadosItems.push({ label: custoVidaLabel, value: `Atingido no Mês ${mesParaViverDeRenda}`, icon: 'umbrella-beach', valueClass: 'positive', smallText: annualInflationRate > 0 ? `(Custo Vida Corrigido Mês ${mesParaViverDeRenda}: ~${formatarMoeda(custoVidaCorrigidoMes)})` : '' });
            } else {
                const ultDividendoNominal = dividendosUltimoMes > 0 ? dividendosUltimoMes : (historico.dividendosHist?.slice(1).reverse().find(d => d > 0) || 0);
                const custoVidaFinal = arredondarParaMoeda(custoVidaFinalCorrigido);
                const gap = arredondarParaMoeda(custoVidaFinal - ultDividendoNominal);
                const smallText = gap > 0 && ultDividendoNominal >= 0 ? `(Faltam ${formatarMoeda(gap)}/mês para ${formatarMoeda(custoVidaFinal)})` : `(Dividendo final: ${formatarMoeda(ultDividendoNominal)})`;
                resultadosItems.push({ label: custoVidaLabel, value: `Não atingido em ${mesesSimulados} meses.`, icon: 'times-circle', valueClass: 'negative', smallText });
            }
        }
    } else if (tipoSimulacao === 'meta-patrimonio' && metaPatrimonioOriginal) {
        const anosCompletosFinais = Math.floor(mesesSimulados / 12);
        const metaCorrigidaFinal = arredondarParaMoeda(metaPatrimonioOriginal * Math.pow(1 + annualInflationRate, anosCompletosFinais));
        const metaAtingida = arredondarParaMoeda(patrimonioTotalFinal) >= metaCorrigidaFinal;
        const tempoAnos = (mesesSimulados / 12).toFixed(1);
        resultadosItems = [
            { label: `Meta de Patrimônio (Valor de Hoje)`, value: formatarMoeda(metaPatrimonioOriginal), icon: 'bullseye', smallText: annualInflationRate > 0 ? `(Meta Corrigida: ${formatarMoeda(metaCorrigidaFinal)})` : ''},
            { label: 'Aporte Inicial', value: formatarMoeda(aporteInicialUtilizado), icon: 'coins' },
            { label: 'Tempo Estimado', value: metaAtingida ? `${mesesSimulados} meses (${tempoAnos} anos)` : `Não atingida em ${mesesSimulados} meses`, icon: 'clock', valueClass: metaAtingida ? 'positive' : 'neutral' },
            { label: `Patrimônio Final Atingido${inflacaoInfo}`, value: formatarMoeda(patrimonioTotalFinal), icon: 'landmark', smallText: annualInflationRate > 0 ? `(Real Hoje: ${formatarMoeda(patrimonioTotalFinalReal)})` : '', title: valorRealTitle},
            { label: 'Total Aportado (Acum.)', value: formatarMoeda(totalAportadoFinal), icon: 'piggy-bank', smallText: aporteCorrigidoInfo },
            { label: `Dividendos (Mês ${mesesSimulados})`, value: formatarMoeda(dividendosUltimoMes), icon: 'hand-holding-usd', valueClass: 'positive', smallText: annualInflationRate > 0 ? `(Real Hoje: ${formatarMoeda(dividendosUltimoMesReal)})` : '', title: valorRealTitle }
        ];
    }
    return resultadosItems.map(item => renderResultListItem(item.label, item.value, item.icon, item.valueClass || '', item.smallText || '', item.title || '')).join('');
}

function updateGraficoEvolucao(labels, dadosPatrimonioInvestidoHist, dadosAportadoTotalAcum) {
    if (!(gGraficoEvolucao instanceof Chart)) { return; }
    const cssRoot = document.documentElement;
    const getCssVar = (name, fallback) => getComputedStyle(cssRoot).getPropertyValue(name).trim() || fallback;
    const corLinhaInvestido = getCssVar('--color-accent', '#17a2b8'); const corAreaInvestido = `rgba(${getCssVar('--color-accent-rgb', '23, 162, 184')}, 0.28)`;
    const corLinhaAportado = getCssVar('--color-secondary', '#0a1128'); const corAreaAportado = 'rgba(10, 17, 40, 0.40)'; const corSuperficie = getCssVar('--color-surface', '#ffffff');
    const dadosPatrimonioTotal = dadosPatrimonioInvestidoHist.map((pInv, i) => arredondarParaMoeda(pInv + (historicoGlobal?.ociosoHist[i] || 0)));
    gGraficoEvolucao.data.labels = labels;
    gGraficoEvolucao.data.datasets = [
        { label: 'Patrimônio Total (Nominal)', data: dadosPatrimonioTotal, borderColor: corLinhaInvestido, backgroundColor: corAreaInvestido, borderWidth: 2, fill: 1, tension: 0.2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBackgroundColor: corSuperficie, pointHoverBorderColor: corLinhaInvestido },
        { label: 'Total Aportado (Nominal)', data: dadosAportadoTotalAcum, borderColor: corLinhaAportado, backgroundColor: corAreaAportado, borderWidth: 2, fill: 'origin', tension: 0.2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBackgroundColor: corSuperficie, pointHoverBorderColor: corLinhaAportado }
    ];
    gGraficoEvolucao.options.plugins.tooltip.callbacks.label = ctx => `${ctx.dataset.label || ''}: ${formatarMoeda(ctx.raw)}`;
    gGraficoEvolucao.update();
}

function updateGraficoCarteira(ativosProcessadosEntrada, cotasFinais) {
    if (!(gGraficoCarteira instanceof Chart)) { return; }
    const dadosGrafico = ativosProcessadosEntrada.map(ativo => ({
        label: `${ativo.nome} (${(cotasFinais[ativo.originalIndex] || 0).toFixed(0)} c.)`,
        value: arredondarParaMoeda((cotasFinais[ativo.originalIndex] || 0) * ativo.preco)
    }))
    .filter(item => item.value >= MIN_INVESTIMENTO_RELEVANTE)
    .sort((a, b) => b.value - a.value);
    gGraficoCarteira.data.labels = dadosGrafico.map(d => d.label);
    const defaultColors = ['#17a2b8', '#0a1128', '#6c757d', '#f0ad4e', '#5cb85c', '#5bc0de', '#d9534f', '#337ab7', '#ff8c00', '#777'];
    const bgColors = dadosGrafico.map((_, i) => defaultColors[i % defaultColors.length]);
    if (!gGraficoCarteira.data.datasets[0]) { gGraficoCarteira.data.datasets[0] = {}; }
    gGraficoCarteira.data.datasets[0].data = dadosGrafico.map(d => d.value);
    gGraficoCarteira.data.datasets[0].backgroundColor = bgColors;
    gGraficoCarteira.data.datasets[0].borderColor = '#ffffff';
    gGraficoCarteira.data.datasets[0].hoverOffset = 4;
    gGraficoCarteira.update();
}

function updateGraficoDividendos(labels, dadosDividendos) {
    if (!(gGraficoDividendos instanceof Chart)) { return; }
    const cssRoot = document.documentElement;
    const getCssVar = (name, fallback) => getComputedStyle(cssRoot).getPropertyValue(name).trim() || fallback;
    gGraficoDividendos.data.labels = labels;
     if (!gGraficoDividendos.data.datasets[0]) { gGraficoDividendos.data.datasets[0] = {}; }
    gGraficoDividendos.data.datasets[0] = {
        label: 'Dividendos Mensais (Nominal)',
        data: dadosDividendos,
        backgroundColor: getCssVar('--color-success', '#28a745'),
        borderColor: getCssVar('--color-success', '#28a745'),
        hoverBackgroundColor: '#218838', hoverBorderColor: '#218838',
        borderRadius: 4, borderWidth: 0, barPercentage: 0.7, categoryPercentage: 0.8
    };
     gGraficoDividendos.options.plugins.tooltip.callbacks.label = (ctx) => `Dividendos (Nominal): ${formatarMoeda(ctx.parsed.y)}`;
    gGraficoDividendos.update();
}

function popularTabelaDetalhada(historico, aporteInicial) {
    const tblBody = document.getElementById('simulation-table')?.querySelector('tbody');
    if (!tblBody) return false;
    tblBody.innerHTML = '';
    const { mesesLabels, patrimonioInvestidoHist, dividendosHist, ociosoHist, aporteMesHist } = historico;
    const annualInflationRate = historicoGlobal?.dadosFinais?.annualInflationRate || 0;

    const row0 = tblBody.insertRow();
    row0.insertCell().textContent = 0;
    row0.insertCell().textContent = formatarMoeda(aporteInicial);
    row0.insertCell().textContent = formatarMoeda(0);
    const pInv0 = patrimonioInvestidoHist[0] || 0;
    const pOc0 = ociosoHist[0] || 0;
    const pTot0 = arredondarParaMoeda(pInv0 + pOc0);
    row0.insertCell().textContent = formatarMoeda(pInv0);
    row0.insertCell().textContent = formatarMoeda(pTot0);
    row0.insertCell().textContent = formatarMoeda(pTot0);

    for (let j = 1; j < row0.cells.length; j++) { row0.cells[j].style.textAlign = 'right'; }
    row0.cells[0].style.textAlign = 'center';

    if (mesesLabels.length > 1) {
        for (let i = 1; i < mesesLabels.length; i++) {
            const row = tblBody.insertRow();
            if (i > 0 && i % 12 === 1) {
                row.classList.add('year-start');
            }

            const pInv = patrimonioInvestidoHist[i] || 0;
            const pOc = ociosoHist[i] || 0;
            const pTotNominal = arredondarParaMoeda(pInv + pOc);
            const anosCompletos = Math.floor((i - 1) / 12);
            const fatorDeflacaoAnual = Math.pow(1 + annualInflationRate, anosCompletos);
            const pTotReal = fatorDeflacaoAnual > 0 ? arredondarParaMoeda(pTotNominal / fatorDeflacaoAnual) : pTotNominal;

            row.insertCell().textContent = mesesLabels[i];
            row.insertCell().textContent = formatarMoeda(aporteMesHist[i] || 0);
            row.insertCell().textContent = formatarMoeda(dividendosHist[i] || 0);
            row.insertCell().textContent = formatarMoeda(pInv);
            row.insertCell().textContent = formatarMoeda(pTotNominal);
            row.insertCell().textContent = formatarMoeda(pTotReal);

            for (let j = 1; j < row.cells.length; j++) { row.cells[j].style.textAlign = 'right'; }
            row.cells[0].style.textAlign = 'center';
        }
        return true;
    } else {
        tblBody.innerHTML = '<tr class="placeholder-row"><td colspan="6">Nenhum mês simulado para detalhar.</td></tr>'; // Colspan 6
        return false;
    }
}

function controlarVisibilidadeSecoes(tipoSimulacao, calculoValido = true) {
    const gCont = document.getElementById('graficos');
    const tblSec = document.getElementById('tabela-detalhada');
    if (gCont) gCont.style.display = calculoValido ? 'block' : 'none';
    if (tblSec) {
        const tabelaPopulada = calculoValido && tblSec.querySelector('tbody tr:not(.placeholder-row)') !== null;
        tblSec.style.display = tabelaPopulada ? 'block' : 'none';
    }
}

function atualizarInterfaceUsuario(dadosFinais, historico, ativosProcessadosPrioridade) {
    historicoGlobal = { ...historico, dadosFinais };
    const resDiv = document.getElementById('resultado-simulacao');
    if (!resDiv) { console.error("#resultado-simulacao não encontrado."); return; }
    resDiv.innerHTML = '';
    resDiv.classList.remove('result-placeholder', 'card-body');
    resDiv.classList.add('results-list-container');
    resDiv.style.minHeight = 'auto'; resDiv.style.display = 'block';
    const metricas = calculateMetricsSummary(dadosFinais, historico);
    const inputs = obterInputsSimulacao();
    resDiv.innerHTML = generateSummaryHtml(dadosFinais, metricas, historico, inputs);

    const labelsGraficos = historico.mesesLabels.map(m => `Mês ${m}`);
    const totalAportadoGrafico = historico.totalAportadoHist.slice(1).map(v => arredondarParaMoeda(v));

    if (typeof Chart !== 'undefined') {
         if (!(gGraficoEvolucao instanceof Chart) || !(gGraficoCarteira instanceof Chart) || !(gGraficoDividendos instanceof Chart)) {
            console.warn("Gráficos não inicializados ao tentar atualizar UI. Tentando reinicializar...");
            try { inicializarGraficos(); }
            catch (e) { console.error("Falha crítica ao reinicializar gráficos em atualizarInterfaceUsuario:", e); }
        }
    } else { console.error("Chart.js não está definido ao tentar atualizar a UI."); return; }

    updateGraficoEvolucao(labelsGraficos, historico.patrimonioInvestidoHist, historico.totalAportadoHist); // Passa o array completo do histórico
    updateGraficoCarteira(ativosProcessadosPrioridade, dadosFinais.cotasPorAtivoFinal);
    updateGraficoDividendos(labelsGraficos.slice(1), historico.dividendosHist.slice(1));
    popularTabelaDetalhada(historico, dadosFinais.aporteInicialUtilizado);
    controlarVisibilidadeSecoes(dadosFinais.tipoSimulacao, true);
}

function atualizarListaAtivos() {
    let ativosLS = [];
    try { ativosLS = JSON.parse(localStorage.getItem('ativos') || '[]'); if (!Array.isArray(ativosLS)) ativosLS = []; }
    catch (e) { console.error("Erro LS:", e); localStorage.removeItem('ativos'); ativosLS = []; }
    const listEl = document.getElementById('ativos-list');
    const priorityListEl = document.getElementById('priority-sort-list');
    const placeholder = listEl?.querySelector('.lista-vazia-placeholder');
    const totalAlocadoEl = document.getElementById('total-alocado');
    const feedbackEl = document.getElementById('alocacao-feedback');
    if (!listEl || !totalAlocadoEl || !feedbackEl || !priorityListEl) { console.error("Elementos da lista de ativos ou lista de prioridade não encontrados."); return; }
    listEl.querySelectorAll('.ativo-item').forEach(el => el.remove());
    priorityListEl.innerHTML = '';
    let somaAlocacoes = 0;
    if (ativosLS.length === 0) {
        if (placeholder) placeholder.style.display = 'flex';
        priorityListEl.innerHTML = '<li class="priority-placeholder">Adicione ativos para definir a prioridade.</li>';
    } else {
        if (placeholder) placeholder.style.display = 'none';
        const ativosOrdenadosPrioridade = [...ativosLS].sort((a,b) => (parseInt(a.prioridade, 10) || 999) - (parseInt(b.prioridade, 10) || 999));
        ativosOrdenadosPrioridade.forEach(ativo => {
            const indexNoLS = ativosLS.findIndex(a => a.nome === ativo.nome && a.preco === ativo.preco && a.alocacao === ativo.alocacao);
            if(indexNoLS === -1) return;
            const nome = ativo.nome || 'S/Nome';
            const preco = parseFormattedNumber(ativo.preco);
            const dividendo = parseFormattedNumber(ativo.dividendos);
            const alocacao = parseFormattedNumber(ativo.alocacao);
            const yieldMensal = calcularYieldSeguro(dividendo, preco);
            const yieldAnual = (yieldMensal * 12 * 100);
            somaAlocacoes += alocacao;
            const el = document.createElement('div'); el.className = 'ativo-item';
            el.innerHTML = `
                <div class="ativo-info"><p title="${nome}">${nome}</p>
                    <div class="ativo-details">
                        <span><i class="fas fa-percentage" title="Alocação Aporte"></i> ${alocacao.toFixed(2)}%</span>
                        <span><i class="fas fa-dollar-sign" title="Preço"></i> ${formatarMoeda(preco)}</span>
                        <span><i class="fas fa-hand-holding-usd" title="Dividendo/Cota"></i> ${formatarMoeda(dividendo)}/mês</span>
                        <span><i class="fas fa-chart-line" title="Yield Anual Estimado"></i> ~${yieldAnual.toFixed(1)}% a.a.</span>
                    </div>
                </div>
                <div class="ativo-actions">
                     <button class="btn btn-icon editar" data-index="${indexNoLS}" title="Editar"><i class="fas fa-edit"></i></button>
                     <button class="btn btn-icon remover" data-index="${indexNoLS}" title="Remover"><i class="fas fa-trash"></i></button>
                </div>`;
            el.querySelector('.editar').addEventListener('click', (e) => {
                 const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                 if (!isNaN(idx)) abrirModalEdicaoAtivo(idx, e);
             });
            el.querySelector('.remover').addEventListener('click', (e) => {
                 const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                 if (!isNaN(idx)) removerAtivo(idx, e);
             });
            listEl.appendChild(el);
            const prioEl = document.createElement('li');
            prioEl.className = 'priority-item';
            prioEl.setAttribute('data-ls-index', indexNoLS);
            prioEl.innerHTML = `
                <i class="fas fa-grip-vertical drag-handle" title="Arrastar para reordenar"></i>
                <span class="asset-name">${nome}</span>
            `;
            priorityListEl.appendChild(prioEl);
        });
        if (typeof Sortable !== 'undefined') {
            if (gSortableInstance) { gSortableInstance.destroy(); }
            gSortableInstance = new Sortable(priorityListEl, {
                animation: 150, ghostClass: 'sortable-ghost', dragClass: 'sortable-drag', handle: '.drag-handle', onEnd: handlePriorityReorder
            });
        } else { console.error("SortableJS não carregado. Funcionalidade de arrastar prioridade desativada."); }
    }
    totalAlocadoEl.textContent = somaAlocacoes.toFixed(2);
    const diffAlocacao = Math.abs(somaAlocacoes - 100);
    feedbackEl.className = '';
    if (diffAlocacao < 0.01) { feedbackEl.textContent = '(100% OK)'; feedbackEl.classList.add('text-success'); }
    else { feedbackEl.textContent = `(${somaAlocacoes.toFixed(2)}% - Ajuste para 100%)`; feedbackEl.classList.add('text-danger'); }
    clearTimeout(gTimeoutSimulacao);
    gTimeoutSimulacao = setTimeout(() => { if (!gBloqueioRecursao) calcularSimulacaoPrincipal(); }, 400);
}

function handlePriorityReorder(event) {
    const items = event.to.children;
    const newOrderIndices = Array.from(items).map(item => parseInt(item.getAttribute('data-ls-index'), 10));
    try {
        let ativos = JSON.parse(localStorage.getItem('ativos') || '[]');
        if (!Array.isArray(ativos)) { mostrarMensagemErro("Erro ao ler ativos para reordenar."); return; }
        const reorderedAtivos = newOrderIndices.map(index => {
             if (index >= 0 && index < ativos.length) { return ativos[index]; } return null;
         }).filter(ativo => ativo !== null);
         if (reorderedAtivos.length !== ativos.length) {
              console.error("Erro na reordenação: índices inválidos encontrados.", newOrderIndices, ativos);
              mostrarMensagemErro("Erro ao processar a nova ordem dos ativos."); return;
         }
        reorderedAtivos.forEach((ativo, i) => { ativo.prioridade = (i + 1).toString(); });
        localStorage.setItem('ativos', JSON.stringify(reorderedAtivos));
        mostrarMensagemSucesso("Ordem de prioridade salva!");
        atualizarListaAtivos();
    } catch (e) {
        console.error("Erro ao reordenar ou salvar prioridade:", e);
        mostrarMensagemErro("Erro ao salvar nova ordem de prioridade.");
    }
}

function abrirModalAdicaoAtivo() {
    const form = document.getElementById('form-ativo');
    const modal = document.getElementById('modal-ativo');
    if (!form || !modal) return;
    form.reset();
    document.getElementById('ativo-index').value = '-1';
    document.getElementById('modal-titulo').innerHTML = '<i class="fas fa-plus-circle"></i> Adicionar Novo Ativo';
    document.getElementById('modal-botao').innerHTML = '<i class="fas fa-plus"></i> Adicionar Ativo';
    ['ativo-nome', 'ativo-alocacao', 'ativo-preco', 'ativo-dividendos'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.value = '';
            input.classList.remove('is-invalid');
            imaskInstances[id]?.updateValue();
        }
    });
    modal.classList.add('show');
    document.getElementById('ativo-nome')?.focus();
}

function abrirModalEdicaoAtivo(index, event) {
    event?.stopPropagation();
    const ativos = JSON.parse(localStorage.getItem('ativos') || '[]');
    const modal = document.getElementById('modal-ativo');
    const form = document.getElementById('form-ativo');
    if (index >= 0 && index < ativos.length && modal && form) {
        const ativo = ativos[index];
        form.reset();
        document.querySelectorAll('#form-ativo input').forEach(input => input.classList.remove('is-invalid'));
        document.getElementById('ativo-nome').value = ativo.nome || '';
        document.getElementById('ativo-index').value = index;
        ['alocacao', 'preco', 'dividendos'].forEach(key => {
            const input = document.getElementById(`ativo-${key}`);
            if (input) {
                const valorNumerico = parseFormattedNumber(ativo[key] || '0');
                input.value = valorNumerico.toString().replace('.', ',');
                imaskInstances[`ativo-${key}`]?.updateValue();
            }
        });
        document.getElementById('modal-titulo').innerHTML = '<i class="fas fa-edit"></i> Editar Ativo';
        document.getElementById('modal-botao').innerHTML = '<i class="fas fa-save"></i> Salvar Alterações';
        modal.classList.add('show');
        document.getElementById('ativo-nome')?.focus();
    } else { mostrarMensagemErro("Ativo não encontrado para edição."); }
}


function salvarAtivo(event) {
    event.preventDefault();
    document.querySelectorAll('#form-ativo input').forEach(input => input.classList.remove('is-invalid'));
    const index = parseInt(document.getElementById('ativo-index')?.value ?? '-1', 10);
    const nome = document.getElementById('ativo-nome')?.value.trim() ?? '';
    const getValueFromMask = (elementId) => {
        const mask = imaskInstances[elementId];
        return mask ? (parseFloat(mask.unmaskedValue) || 0) : (parseFormattedNumber(document.getElementById(elementId)?.value) || 0);
    };
    const alocacao = getValueFromMask('ativo-alocacao');
    const preco = getValueFromMask('ativo-preco');
    const dividendos = getValueFromMask('ativo-dividendos');
    let isValid = true;
    if (!nome) { mostrarMensagemErro('Nome é obrigatório.'); document.getElementById('ativo-nome')?.classList.add('is-invalid'); isValid = false; }
    if (isNaN(preco) || preco <= 0) { mostrarMensagemErro('Preço inválido ou zero.'); document.getElementById('ativo-preco')?.classList.add('is-invalid'); isValid = false; }
    if (isNaN(dividendos) || dividendos < 0) { mostrarMensagemErro('Rendimento inválido ou negativo.'); document.getElementById('ativo-dividendos')?.classList.add('is-invalid'); isValid = false; }
    if (isNaN(alocacao) || alocacao <= 0 || alocacao > 100) { mostrarMensagemErro('Alocação inválida (0.01% a 100%).'); document.getElementById('ativo-alocacao')?.classList.add('is-invalid'); isValid = false; }
    if (!isValid) return;
    const ativos = JSON.parse(localStorage.getItem('ativos') || '[]');
    const alocacaoAtualSemItemEditado = ativos.reduce((soma, ativo, i) => {
        return (index !== -1 && i === index) ? soma : soma + parseFormattedNumber(ativo.alocacao);
    }, 0);
    const novaSomaTotal = arredondarParaMoeda(alocacaoAtualSemItemEditado + alocacao);
    if (novaSomaTotal > 100.005) {
         mostrarMensagemErro(`Alocação total excederia 100% (${novaSomaTotal.toFixed(2)}%). Ajuste as alocações.`);
         document.getElementById('ativo-alocacao')?.classList.add('is-invalid');
         return;
    }
    const ativoSalvar = {
        nome: nome,
        alocacao: alocacao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        preco: preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        dividendos: dividendos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        prioridade: (index === -1) ? (ativos.length + 1).toString() : ativos[index]?.prioridade || (ativos.length + 1).toString()
    };
    if (index === -1) {
        ativos.push(ativoSalvar);
        mostrarMensagemSucesso(`Ativo "${nome}" adicionado!`);
    } else {
        if (index >= 0 && index < ativos.length) {
            ativoSalvar.prioridade = ativos[index].prioridade;
            ativos[index] = ativoSalvar;
            mostrarMensagemSucesso(`Ativo "${nome}" atualizado!`);
        } else { mostrarMensagemErro("Erro ao encontrar ativo para atualizar."); return; }
    }
    try {
        if(index === -1) {
             ativos.sort((a,b) => (parseInt(a.prioridade,10)||999) - (parseInt(b.prioridade,10)||999));
             ativos.forEach((a, i) => a.prioridade = (i+1).toString());
        }
        localStorage.setItem('ativos', JSON.stringify(ativos));
        document.getElementById('modal-ativo')?.classList.remove('show');
        atualizarListaAtivos();
    } catch (e) { console.error("Erro ao salvar no localStorage:", e); mostrarMensagemErro("Erro ao salvar ativos."); }
}

function removerAtivo(index, event) {
    event?.stopPropagation();
    let ativos = JSON.parse(localStorage.getItem('ativos') || '[]');
    if (index >= 0 && index < ativos.length) {
        const nomeAtivo = ativos[index].nome || 'este ativo';
        if (confirm(`Tem certeza que deseja remover o ativo "${nomeAtivo}"?`)) {
            ativos.splice(index, 1);
            ativos.sort((a,b) => (parseInt(a.prioridade,10)||999) - (parseInt(b.prioridade,10)||999));
            ativos.forEach((a, i) => a.prioridade = (i+1).toString());
            try {
                 localStorage.setItem('ativos', JSON.stringify(ativos));
                 mostrarMensagemSucesso(`Ativo "${nomeAtivo}" removido.`);
                 atualizarListaAtivos();
            }
            catch (e) { console.error("Erro ao remover ativo do LS:", e); mostrarMensagemErro("Erro ao remover ativo."); }
        }
    } else { mostrarMensagemErro("Ativo não encontrado para remoção."); }
}

function inicializarMascarasModal() {
    if (typeof IMask === 'undefined') { console.error("imask.js não carregado."); return; }
    Object.values(imaskInstances).forEach(inst => inst?.destroy());
    imaskInstances = {};
    const idsComMascara = ['ativo-alocacao', 'ativo-preco', 'ativo-dividendos', 'inflacao-anual'];
    idsComMascara.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            let options;
            if (id === 'ativo-alocacao' || id === 'inflacao-anual') {
                options = { mask: 'num%', lazy: false, blocks: { num: { mask: Number, scale: 2, signed: false, thousandsSeparator: '', padFractionalZeros: true, normalizeZeros: true, radix: ',', mapToRadix: ['.'], min: 0, max: 100 }}};
                 if(id === 'inflacao-anual') {
                     options.blocks.num.padFractionalZeros = true;
                     options.blocks.num.min = 0;
                 } else {
                      options.blocks.num.padFractionalZeros = false;
                      options.blocks.num.min = 0.01;
                 }
            } else {
                options = { mask: 'R$ num', lazy: false, blocks: { num: { mask: Number, scale: 2, signed: false, thousandsSeparator: '.', padFractionalZeros: true, normalizeZeros: true, radix: ',', mapToRadix: ['.'], min: (id === 'ativo-preco' ? 0.01 : 0) }}};
            }
            imaskInstances[id] = IMask(element, options);
        }
    });
}

function setupEventListeners() {
    const modal = document.getElementById('modal-ativo');
    const inputsSimulador = ['aporte-inicial', 'aporte-mensal', 'periodo-valor', 'periodo-tipo', 'meta-patrimonio', 'custo-vida', 'tipo-simulacao', 'estrategia-reinvestimento', 'inflacao-anual', 'corrigir-aporte-inflacao'];
    inputsSimulador.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            const eventType = (element.tagName === 'SELECT' || element.type === 'number' || element.type === 'checkbox') ? 'change' : 'input';
            element.addEventListener(eventType, () => {
                clearTimeout(gTimeoutSimulacao); gTimeoutSimulacao = setTimeout(() => { if (!gBloqueioRecursao) calcularSimulacaoPrincipal(); }, 500);
            });
            if (element.type === 'text' && element.inputMode === 'numeric' && !imaskInstances[id]) {
                 element.addEventListener('blur', (event) => {
                     const valorNum = parseFormattedNumber(event.target.value);
                     event.target.value = valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                     clearTimeout(gTimeoutSimulacao); gTimeoutSimulacao = setTimeout(() => { if (!gBloqueioRecursao) calcularSimulacaoPrincipal(); }, 150);
                 });
                 if(element.value) {
                     const valorNum = parseFormattedNumber(element.value);
                     element.value = valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                 }
            } else if (element.type === 'text' && imaskInstances[id]) {
                 imaskInstances[id].on('accept', () => {
                     clearTimeout(gTimeoutSimulacao); gTimeoutSimulacao = setTimeout(() => { if (!gBloqueioRecursao) calcularSimulacaoPrincipal(); }, 500);
                 });
            }
        }
    });
    document.getElementById('tipo-simulacao')?.addEventListener('change', function() {
        const tipo = this.value;
        const periodoGroup = document.getElementById('periodo-container')?.closest('.input-group');
        const metaGroup = document.getElementById('meta-patrimonio-container');
        const custoVidaGroup = document.getElementById('custo-vida-container');
        const periodoInput = document.getElementById('periodo-valor');
        const metaInput = document.getElementById('meta-patrimonio');
        if (periodoGroup && metaGroup && custoVidaGroup && periodoInput && metaInput) {
            const displayFlex = 'flex'; const displayNone = 'none';
            if (tipo === 'meta-patrimonio') { periodoGroup.style.display = displayNone; metaGroup.style.display = displayFlex; custoVidaGroup.style.display = displayNone; periodoInput.required = false; metaInput.required = true; }
            else { periodoGroup.style.display = displayFlex; metaGroup.style.display = displayNone; custoVidaGroup.style.display = displayFlex; periodoInput.required = true; metaInput.required = false; }
             limparResultadosVisuais(false);
        }
    });
    document.getElementById('abrir-modal')?.addEventListener('click', abrirModalAdicaoAtivo);
    modal?.querySelectorAll('.fechar-modal').forEach(btn => {
         btn.addEventListener('click', () => modal?.classList.remove('show'));
    });
    modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal?.classList.contains('show')) modal.classList.remove('show'); });
    document.getElementById('form-ativo')?.addEventListener('submit', salvarAtivo);
     document.getElementById('simular-btn')?.addEventListener('click', () => { if (!gBloqueioRecursao) calcularSimulacaoPrincipal(); });
     document.getElementById('export-csv-btn')?.addEventListener('click', () => {
         if(typeof exportTableToCSV === 'function') { exportTableToCSV('simulation-table'); }
         else { mostrarMensagemErro('Função de exportação não encontrada.'); console.error('Função exportTableToCSV não definida.'); }
     });
}

function exportTableToCSV(tableId, filename = 'simulacao_fortuna.csv') {
    const table = document.getElementById(tableId);
    if (!table) { mostrarMensagemErro(`Tabela "${tableId}" não encontrada.`); return; }
    let csv = [];
    const rows = table.querySelectorAll("tr");
    rows.forEach(row => {
        const cols = row.querySelectorAll("td, th");
        const rowData = [];
        cols.forEach(col => {
            let data = col.innerText.replace(/R\$\s?/g, '').trim();
            const num = parseFormattedNumber(data);
            if (!isNaN(num) && col.tagName === 'TD' && col.cellIndex !== 0 ) {
                 data = num.toString().replace('.', ',');
            } else {
                 data = `"${col.innerText.trim().replace(/"/g, '""')}"`;
            }
            rowData.push(data);
        });
        csv.push(rowData.join(";"));
    });
    const csvString = csv.join("\n");
    const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        mostrarMensagemSucesso("Dados exportados para CSV!");
    } else { mostrarMensagemErro("Download direto não suportado pelo navegador."); }
}


function onDOMContentLoaded() {
    try {
        inicializarGraficos();
        setupEventListeners();
        inicializarMascarasModal();
        const tipoSimSelect = document.getElementById('tipo-simulacao');
        if(tipoSimSelect) { tipoSimSelect.dispatchEvent(new Event('change')); }
        atualizarListaAtivos();
        const temAtivos = (JSON.parse(localStorage.getItem('ativos') || '[]')).length > 0;
        if(!temAtivos){ limparResultadosVisuais(true); }
    } catch (error) {
        console.error("ERRO FATAL NA INICIALIZAÇÃO:", error);
        mostrarMensagemErro(`Erro grave na inicialização: ${error.message}.`);
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = "background: var(--color-danger,#dc3545); color:white; padding:20px; text-align:center; position:fixed; top:0; left:0; width:100%; z-index:9999; border-bottom:3px solid rgba(0,0,0,0.2); font-family: sans-serif; font-size: 1rem;";
        errorDiv.innerHTML = `<strong>ERRO FATAL:</strong> ${error.message}<br>Recarregue a página ou verifique o console (F12).`;
        document.body.prepend(errorDiv);
    }
}

document.addEventListener('DOMContentLoaded', onDOMContentLoaded);