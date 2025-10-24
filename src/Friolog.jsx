import React, { useState, useEffect, useMemo } from 'react';
import { Filter, Download, RefreshCw, Package, TrendingUp, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Truck, User } from 'lucide-react';

// =================================================================
// CONFIGURAÇÃO DA API: USANDO PROXY RELATIVO /API/GW/
// =================================================================
const API_CONFIG = {
    // Rotas relativas sem a barra final
    URL_TOKEN: "/api/gw/v2/servicosGW/solicitarToken", 
    HEADERS_TOKEN: {
        "Login": "49576466000129",
        "Senha": "49576466000129",
        "GUID": "61dc471a-5d47-4459-9bd6-10e242be135e"
    },
    URL_CARGAS: "/api/gw/v2/servicosGW/listarCargas" 
};

// --- Funções de Ajuda para Datas ---

/**
 * Retorna a data no formato YYYY-MM-DD para o input.
 */
const getDateFormattedInput = (date = new Date()) => {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${y}-${m}-${d}`;
};

/**
 * Retorna o primeiro dia do mês atual no formato YYYY-MM-DD.
 */
const getFirstDayOfMonth = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return getDateFormattedInput(firstDay);
};

/**
 * Converte data de formato YYYY-MM-DD (do input HTML) para DDMMYYYY (para API)
 */
const apiDateFormat = (dateStr) => {
    if (!dateStr || dateStr.length !== 10) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}${month}${year}`;
};

/**
 * Converte data de formato DDMMYYYY[HHMM] para YYYY-MM-DD (para exibição)
 */
const parseDataApi = (dataStr) => {
    if (!dataStr || dataStr.length < 8) return '';
    try {
        const day = dataStr.substring(0, 2);
        const month = dataStr.substring(2, 4);
        const year = dataStr.substring(4, 8);
        return `${year}-${month}-${day}`;
    } catch {
        return '';
    }
};

// --- Mapeamento ETL e Transformação ---

const ocorrencia_vs_status_bi = {
    "Entregue com Devolução Parcial Logística": "Retornando para o CD", "Entregue com Devolução Parcial Comercial": "Retornando para o CD", "Entregue com Devolução Parcial": "Retornando para o CD", "Devolução Total Logística": "Retornando para o CD", "Devolução Total Comercial": "Retornando para o CD", "Devolução Total": "Retornando para o CD", "Reentrega Logística": "Retornando para o CD", "REENTREGA LOGISTICA": "Retornando para o CD", "Reentrega Comercial": "Retornando para o CD", "REENTREGA COMERCIAL": "Retornando para o CD", "Devolução Total Logística Recebida": "Depósito Origem", "Devolução Total Comercial Recebida": "Depósito Origem", "Devolução Parcial Logistica Recebida": "Depósito Origem", "Devolução Parcial Comercial Recebida": "Depósito Origem", "Devolução Recebida": "Depósito Origem", "Devolução Logística Devolvido a Indústria": "Devolvido Indústria", "Devolução Comercial Devolvido a Indústria": "Devolvido Indústria",
    "Devolvido para Industria": "Devolvido Indústria", "Anomalia": "Anomalia", "Débito Realizado Contra Friolog": "Débito Friolog", "NF Refaturada": "Entregue", "Coletado pelo cliente": "Entregue", "Tratativa Administrativa": "Entregue", "Reentrega Logística Recebida": "Depósito Origem", "Reentrega Comercial Recebida": "Depósito Origem", "Reentrega Recebida": "Depósito Origem", "Agendamento": "Depósito Origem", "Em Rota Para Entrega": "Em Rota Para Entrega",
};

/**
 * Aplica a lógica de transformação do script load_silver, limpando strings.
 */
const applyEtlLogic = (rawData) => {
    if (!Array.isArray(rawData)) return [];
    
    return rawData
        .filter(carga => {
            const isPifPaf = carga.remetente === "RIO BRANCO ALIMENTOS S/A" && carga.tipo === "b";
            const isCteNormal = carga.remetente !== "RIO BRANCO ALIMENTOS S/A" && carga.tipo === "n";
            return isPifPaf || isCteNormal;
        })
        .map(carga => {
            const dataRomaneioStr = carga.dataRomaneio || '';
            const dataOcorrenciaStr = carga.dataOcorrencia || '';
            let statusAux = carga.status;

            if (!carga.dataEntrega) { 
                const ultimaOcorrencia = carga.descricaoUltimaOcorrencia || 'Sem Ocorrência';
                const statusBiValue = ocorrencia_vs_status_bi[ultimaOcorrencia];

                if (statusBiValue) {
                    statusAux = statusBiValue;
                }
                
                if (statusAux === 'Retornando para o CD' || statusAux === 'Depósito Origem') {
                    if (dataRomaneioStr.length >= 8 && dataOcorrenciaStr.length >= 8) {
                        try {
                            const dataOcorrencia = new Date(parseDataApi(dataOcorrenciaStr));
                            const fullRomaneioStr = dataRomaneioStr.substring(0, 8) + '0000'; 
                            const dataRomaneio = new Date(parseDataApi(fullRomaneioStr)); 

                            if (dataRomaneio > dataOcorrencia) {
                                statusAux = carga.status; 
                            }
                        } catch (e) { /* ignore parse error */ }
                    }
                }
            } else {
                 statusAux = 'Entregue'; 
            }

            // Mapeamento final e NORMALIZAÇÃO DE STRINGS (CORREÇÃO DE FILTROS)
            return {
                idNota: carga.idNota,
                notas: carga.notas,
                cte: carga.cte,
                destinatario: (carga.destinatario || 'N/A').trim(),
                remetente: (carga.remetente || 'N/A').trim(),
                consignatario: (carga.consignatario || 'N/A').trim(), 
                emissaoCTE: parseDataApi(carga.emissaoCTE),
                dataRomaneio: parseDataApi(carga.dataRomaneio),
                numeroRomaneio: carga.numeroRomaneio || '',
                motoristaRomaneio: (carga.motoristaRomaneio || 'Sem Motorista').trim(),
                placa: carga.placa || '',
                pesoCarga: parseFloat(carga.pesoCarga || 0).toFixed(2),
                status: carga.status,
                status_aux: statusAux,
                descricaoUltimaOcorrencia: carga.descricaoUltimaOcorrencia || 'Sem Ocorrência',
                dataOcorrencia: parseDataApi(carga.dataOcorrencia),
                dataEntrega: parseDataApi(carga.dataEntrega),
                cidadeDestinatario: carga.cidadeDestinatario || 'N/A',
                preRomaneio: (carga.dataRomaneio && carga.numeroRomaneio) ? 'SIM' : 'NÃO',
            };
        });
};


// --- Componente Principal ---
const FriologBI = () => { 
    // Inicialização de datas para o MÊS ATUAL
    const todayForInput = getDateFormattedInput();
    const initialDateStart = getFirstDayOfMonth(); // Primeiro dia do mês atual

    // Variáveis de Estado
    const [cargas, setCargas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        // Datas de Emissão CT-e (Filtros secundários, sem inicialização obrigatória do mês)
        emissaoCteInicio: '', 
        emissaoCtefim: '',
        // DATA ROMANEIO: Inicializa no mês atual e controla a API
        dataRomaneioInicio: initialDateStart, 
        dataRomaneioFim: todayForInput,
        motorista: 'Todos', remetente: 'Todos', cliente: 'Todos', statusBi: 'Todos',
        notas: '', temRomaneio: 'Todos', preRomaneio: 'Todos', consignatario: 'Todos',
    });
    const [lastUpdate, setLastUpdate] = useState(null);
    
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(25); 

    
    // --- Funções de Carregamento (Busca controlada pelos filtros de Romaneio) ---
    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        setCurrentPage(1);

        // 1. Validar e Formatar Datas de ROMANEIO (para o API Call)
        const param1 = apiDateFormat(filters.dataRomaneioInicio); 
        const param2 = apiDateFormat(filters.dataRomaneioFim); 

        if (!param1 || !param2 || param1.length !== 8 || param2.length !== 8) {
            alert("Por favor, preencha as datas de Romaneio (Início e Fim) no formato correto (YYYY-MM-DD).");
            setLoading(false);
            return;
        }
        
        // 🚨 TIMEOUT CONFIG
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos
        

        try {
            // 2. Obter Token
            console.log("Requisitando Token...");
            const tokenResponse = await fetch(API_CONFIG.URL_TOKEN, { headers: API_CONFIG.HEADERS_TOKEN });
            
            const responseData = await tokenResponse.json();
            console.log("Resposta da API de Token:", responseData); 

            if (!tokenResponse.ok) {
                throw new Error(`Erro ao obter token: ${tokenResponse.status}. Mensagem: ${responseData.mensagem || responseData.Message || 'N/A'}`);
            }
            
            const token = responseData.token;

            if (!token) {
                 throw new Error("Token não recebido na resposta. Verifique 'Resposta da API de Token' no console para a mensagem de erro da API.");
            }
            
            console.log("Token obtido com sucesso.");
            
            // 3. Obter Dados de Cargas
            console.log(`Requisitando cargas de ${param1} a ${param2}...`);
            const bodyCargas = { tipo: 1, parametro1: param1, parametro2: param2 };
            const headersCargas = { "token": token, "Content-Type": "application/json" };
            
            const cargasResponse = await fetch(API_CONFIG.URL_CARGAS, {
                method: 'POST',
                headers: headersCargas,
                body: JSON.stringify(bodyCargas),
                signal: controller.signal // Aplica o timeout
            });

            clearTimeout(timeoutId); // Limpa o timeout se a busca for rápida

            if (!cargasResponse.ok) throw new Error(`Erro ao listar cargas: ${cargasResponse.status}`);
            const rawData = await cargasResponse.json();
            
            if (!Array.isArray(rawData)) throw new Error("Resposta da API de cargas não é uma lista.");

            // 4. Aplicar a Lógica ETL/Transformação
            const transformedData = applyEtlLogic(rawData);

            setCargas(transformedData);
            setLastUpdate(new Date());
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Erro no fluxo de API: Tempo esgotado (Timeout de 15s na busca de cargas).');
                alert('A busca de dados falhou por tempo esgotado. Por favor, tente um período de data menor.');
            } else {
                console.error('Erro no fluxo de API:', error);
                alert('Houve um erro ao carregar os dados da API. Verifique o console.');
            }
            setCargas([]); 
        } finally {
            setLoading(false);
        }
    };

    // --- Lógica de Filtros e Stats ---
    
    const getFilteredData = () => { 
        return cargas.filter(carga => {
            // 🚨 CORREÇÃO DE FILTROS: Garante que o valor da Carga é limpo antes da comparação
            const motoristaCarga = (carga.motoristaRomaneio || 'Sem Motorista').trim();
            const remetenteCarga = (carga.remetente || 'N/A').trim();
            const clienteCarga = (carga.destinatario || 'N/A').trim();
            const consignatarioCarga = (carga.consignatario || 'N/A').trim();

            // Filtros de Emissão CT-e (Filtros secundários aplicados aos dados carregados)
            if (filters.emissaoCteInicio && carga.emissaoCTE < filters.emissaoCteInicio) return false;
            if (filters.emissaoCtefim && carga.emissaoCTE > filters.emissaoCtefim) return false;
            
            // Filtros de Data Romaneio (Filtros secundários aplicados aos dados carregados)
            if (filters.dataRomaneioInicio && carga.dataRomaneio && carga.dataRomaneio < filters.dataRomaneioInicio) return false;
            if (filters.dataRomaneioFim && carga.dataRomaneio && carga.dataRomaneio > filters.dataRomaneioFim) return false;
            
            // Filtros de Dropdown (usando valores limpos)
            if (filters.motorista !== 'Todos' && motoristaCarga !== filters.motorista) return false;
            if (filters.remetente !== 'Todos' && remetenteCarga !== filters.remetente) return false;
            if (filters.cliente !== 'Todos' && clienteCarga !== filters.cliente) return false;
            if (filters.consignatario !== 'Todos' && consignatarioCarga !== filters.consignatario) return false; 
            
            // Outros filtros
            if (filters.statusBi !== 'Todos' && carga.status_aux !== filters.statusBi) return false;
            if (filters.notas && !carga.notas.includes(filters.notas)) return false;
            if (filters.temRomaneio === 'SIM' && !carga.numeroRomaneio) return false;
            if (filters.temRomaneio === 'NÃO' && carga.numeroRomaneio) return false;
            if (filters.preRomaneio !== 'Todos' && carga.preRomaneio !== filters.preRomaneio) return false;
            return true;
        });
    };
    
    const filteredData = useMemo(() => {
        setCurrentPage(1);
        return getFilteredData();
    }, [cargas, filters]);

    const getUniqueValues = (field) => {
        return ['Todos', ...new Set(cargas.map(c => (c[field] || 'N/A').trim()).filter(Boolean))];
    };
    
    // Lógica de Stats com os novos KPIs
    const stats = useMemo(() => {
        const STATUS_RETORNO_CD = 'Retornando para o CD';
        const STATUS_DEPOSITO_ORIGEM = 'Depósito Origem';
        const STATUS_ENTREGUE = 'Entregue';
        const STATUS_EM_ROTA = 'Em Rota Para Entrega';

        const totalNotas = filteredData.length;
        const totalEntregues = filteredData.filter(c => c.status_aux === STATUS_ENTREGUE).length;
        const totalEmRota = filteredData.filter(c => c.status_aux === STATUS_EM_ROTA).length;
        const totalPeso = filteredData.reduce((sum, c) => sum + parseFloat(c.pesoCarga || 0), 0).toFixed(2);
        
        const notasRetornoDevolucao = filteredData.filter(c => 
            c.status_aux === STATUS_RETORNO_CD || c.status_aux === STATUS_DEPOSITO_ORIGEM
        );
        
        const reentregaComercial = notasRetornoDevolucao.filter(c => 
            (c.descricaoUltimaOcorrencia.includes('Reentrega') || c.descricaoUltimaOcorrencia.includes('REENTREGA')) &&
            (c.descricaoUltimaOcorrencia.includes('Comercial') || c.descricaoUltimaOcorrencia.includes('COMERCIAL'))
        ).length;
        
        const reentregaLogistica = notasRetornoDevolucao.filter(c => 
            (c.descricaoUltimaOcorrencia.includes('Reentrega') || c.descricaoUltimaOcorrencia.includes('REENTREGA')) &&
            (c.descricaoUltimaOcorrencia.includes('Logística') || c.descricaoUltimaOcorrencia.includes('LOGISTICA'))
        ).length;

        const totalDevolucao = notasRetornoDevolucao.filter(c => 
            (c.descricaoUltimaOcorrencia.includes('Devolução') || c.descricaoUltimaOcorrencia.includes('DEVOLUÇÃO'))
        ).length;

        const notasNoDeposito = filteredData.filter(c => 
            c.status_aux === STATUS_DEPOSITO_ORIGEM
        ).length;

        const notasPendentes = filteredData.filter(c => 
            c.status_aux !== STATUS_ENTREGUE && 
            c.status_aux !== STATUS_EM_ROTA &&
            c.status_aux !== STATUS_RETORNO_CD &&
            c.status_aux !== STATUS_DEPOSITO_ORIGEM 
        ).length;
        
        // CÁLCULO DO PERCENTUAL DE ENTREGA: (Total Entregues) / (Total Entregues + Em Rota no momento)
        const notasComStatusAtingivel = totalEntregues + totalEmRota;

        const percentualEntregue = notasComStatusAtingivel > 0 
            ? ((totalEntregues / notasComStatusAtingivel) * 100).toFixed(2) + '%' 
            : '0.00%';

        return {
            total: totalNotas,
            pesoTotal: totalPeso,
            entregues: totalEntregues,
            emRota: totalEmRota,
            
            reentregaComercial: reentregaComercial,
            reentregaLogistica: reentregaLogistica,
            totalDevolucao: totalDevolucao,
            notasNoDeposito: notasNoDeposito, 
            notasPendentes: notasPendentes,
            percentualEntregue: percentualEntregue,
        };
    }, [filteredData]);
    
    // Função de Exportar CSV
    const exportToCSV = () => {
        if (filteredData.length === 0) return;

        const headers = [
            "Emissão CT-e", "Data Romaneio", "Nº Romaneio", "Remetente", "Cliente", "Consignatário", 
            "Notas", "Peso (kg)", "Última Ocorrência", "Status BI", "Pré-Romaneio"
        ];

        const rows = filteredData.map(d => [
            d.emissaoCTE || '',
            d.dataRomaneio || '',
            d.numeroRomaneio || '',
            d.remetente || '',
            d.destinatario || '',
            d.consignatario || '',
            d.notas || '',
            d.pesoCarga || '0.00',
            d.descricaoUltimaOcorrência || '',
            d.status_aux || '',
            d.preRomaneio || ''
        ]);

        const csvContent = [
            headers.join(";"),
            ...rows.map(e => e.join(";"))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `friolog_bi_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log("Exportação CSV concluída.");
    };
    
    // --- Lógica de Paginação e JSX ---
    
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const paginate = (pageNumber) => {
        if (pageNumber > 0 && pageNumber <= totalPages) {
            setCurrentPage(pageNumber);
        }
    };
    
    const StatCard = ({ title, value, icon: Icon, colorClass, iconBgClass }) => (
        <div className="bg-white rounded-xl p-6 shadow-2xl flex items-center justify-between transition transform hover:scale-[1.01]">
            <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
            </div>
            <div className={`p-4 rounded-full ${iconBgClass} shadow-md`}>
                <Icon className={`w-7 h-7 ${colorClass}`} />
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white pb-12"> 
            <header className="bg-white shadow-lg p-4 sticky top-0 z-10">
                <div className="max-w-[1800px] mx-auto px-6 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Truck className="w-8 h-8 text-blue-600" />
                        <h1 className="text-2xl font-extrabold text-slate-900">Friolog BI</h1>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="font-medium text-slate-700">Total de Notas: </span>
                        <span className="text-xl font-bold text-blue-600">{stats.total}</span>
                        <User className="w-6 h-6 text-gray-500" />
                    </div>
                </div>
            </header>

            <div className="max-w-[1800px] mx-auto px-8 py-8">
                
                {/* Título e Atualização */}
                <div className="flex justify-between items-end mb-8">
                    <h2 className="text-3xl font-bold text-slate-800">Visão Geral da Operação</h2>
                    <span className="text-sm text-slate-500">
                        Última Ocorrência: {loading ? 'Atualizando...' : (lastUpdate ? lastUpdate.toLocaleString('pt-BR') : 'Sem dados')}
                    </span>
                </div>

                {/* Stats Cards - PRIMEIRA LINHA */}
                <div className="grid grid-cols-4 gap-8 mb-10">
                    <StatCard 
                        title="Total de Notas" 
                        value={stats.total} 
                        icon={Package} 
                        colorClass="text-blue-600"
                        iconBgClass="bg-blue-50"
                    />
                    <StatCard 
                        title="Peso Total (kg)" 
                        value={stats.pesoTotal} 
                        icon={TrendingUp} 
                        colorClass="text-indigo-600" 
                        iconBgClass="bg-indigo-50"
                    />
                    <StatCard 
                        title="Entregues" 
                        value={stats.entregues} 
                        icon={CheckCircle} 
                        colorClass="text-green-600" 
                        iconBgClass="bg-green-50"
                    />
                    <StatCard 
                        title="Em Rota" 
                        value={stats.emRota} 
                        icon={AlertCircle} 
                        colorClass="text-orange-600" 
                        iconBgClass="bg-orange-50"
                    />
                </div>

                {/* Stats Cards - SEGUNDA LINHA (Nova Sequência) */}
                <div className="grid grid-cols-4 gap-8 mb-10">
                    <StatCard 
                        title="Reentrega Comercial" 
                        value={stats.reentregaComercial} 
                        icon={User} 
                        colorClass="text-pink-600"
                        iconBgClass="bg-pink-50"
                    />
                    <StatCard 
                        title="Reentrega Logística" 
                        value={stats.reentregaLogistica} 
                        icon={Truck} 
                        colorClass="text-red-600"
                        iconBgClass="bg-red-50"
                    />
                    <StatCard 
                        title="Notas no Depósito/Origem" 
                        value={stats.notasNoDeposito} 
                        icon={Package} 
                        colorClass="text-cyan-600" 
                        iconBgClass="bg-cyan-50"
                    />
                    <StatCard 
                        title="% de Entregas Feitas" 
                        value={stats.percentualEntregue} 
                        icon={TrendingUp} 
                        colorClass="text-yellow-600" 
                        iconBgClass="bg-yellow-50"
                    />
                </div>

                {/* Filters & Actions Panel */}
                <div className="bg-white rounded-xl p-8 shadow-2xl mb-10">
                    <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
                        <Filter className="w-6 h-6 text-blue-600" />
                        <h2 className="text-xl font-semibold text-slate-800">Parâmetros de Pesquisa</h2>
                    </div>
                    
                    {/* Inputs - Linhas e colunas uniformes */}
                    <div className="grid grid-cols-5 gap-6 mb-6">
                        {/* Linha 1: Datas de Emissão CT-e */}
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Emissão CT-e (Início)</label>
                            <input type="date" value={filters.emissaoCteInicio} onChange={(e) => setFilters({...filters, emissaoCteInicio: e.target.value})} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Emissão CT-e (Fim)</label>
                            <input type="date" value={filters.emissaoCtefim} onChange={(e) => setFilters({...filters, emissaoCtefim: e.target.value})} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        {/* Filtros Primários: Data Romaneio */}
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Data Romaneio (Início)</label>
                            <input type="date" value={filters.dataRomaneioInicio} onChange={(e) => setFilters({...filters, dataRomaneioInicio: e.target.value})} 
                                className="w-full px-3 py-2 bg-yellow-50 border border-yellow-500 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Data Romaneio (Fim)</label>
                            <input type="date" value={filters.dataRomaneioFim} onChange={(e) => setFilters({...filters, dataRomaneioFim: e.target.value})} 
                                className="w-full px-3 py-2 bg-yellow-50 border border-yellow-500 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Motorista</label>
                            <select value={filters.motorista} onChange={(e) => setFilters({...filters, motorista: e.target.value})} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500">
                                {getUniqueValues('motoristaRomaneio').map(m => (<option key={m} value={m}>{m}</option>))}
                            </select>
                        </div>
                    </div>
                    
                    {/* Linha 2 - Entidades e Status */}
                    <div className="grid grid-cols-5 gap-6">
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Remetente</label>
                            <select value={filters.remetente} onChange={(e) => setFilters({...filters, remetente: e.target.value})} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500">
                                {getUniqueValues('remetente').map(r => (<option key={r} value={r}>{r}</option>))}
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Cliente (Destinatário)</label>
                            <select value={filters.cliente} onChange={(e) => setFilters({...filters, cliente: e.target.value})} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500">
                                {getUniqueValues('destinatario').map(c => (<option key={c} value={c}>{c}</option>))}
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Consignatário</label>
                            <select value={filters.consignatario} onChange={(e) => setFilters({...filters, consignatario: e.target.value})} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500">
                                {getUniqueValues('consignatario').map(c => (<option key={c} value={c}>{c}</option>))}
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Status BI</label>
                            <select value={filters.statusBi} onChange={(e) => setFilters({...filters, statusBi: e.target.value})} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500">
                                {getUniqueValues('status_aux').map(s => (<option key={s} value={s}>{s}</option>))}
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Buscar Notas</label>
                            <input type="text" value={filters.notas} onChange={(e) => setFilters({...filters, notas: e.target.value})} placeholder="Ex: 88546" 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex gap-4 pt-6 mt-8 border-t border-gray-100 justify-end">
                        {/* Filtros de Toggle */}
                        <select value={filters.temRomaneio} onChange={(e) => setFilters({...filters, temRomaneio: e.target.value})} 
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-slate-700">
                            <option value="Todos">Tem Romaneio: Todos</option>
                            <option value="SIM">Com Romaneio</option>
                            <option value="NÃO">Sem Romaneio</option>
                        </select>
                        <select value={filters.preRomaneio} onChange={(e) => setFilters({...filters, preRomaneio: e.target.value})} 
                            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-slate-700">
                            <option value="Todos">Pré-Romaneio: Todos</option>
                            <option value="SIM">Pré-Romaneio: SIM</option>
                            <option value="NÃO">Pré-Romaneio: NÃO</option>
                        </select>
                        
                        {/* Botões Principais */}
                        <button
                            onClick={loadData} // Chama a API com as datas dos filtros de Romaneio
                            disabled={loading}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-semibold shadow-md"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Atualizar Dados
                        </button>
                        <button
                            onClick={exportToCSV} // FUNÇÃO EXPORTAR CSV IMPLEMENTADA
                            disabled={filteredData.length === 0}
                            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 font-semibold shadow-md"
                        >
                            <Download className="w-4 h-4" />
                            Exportar CSV
                        </button>
                    </div>
                </div>

                {/* Data Table */}
                <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Emissão CT-e</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Data Romaneio</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Nº Romaneio</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Remetente</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Cliente</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Consignatário</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Notas</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Peso (kg)</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Última Ocorrência</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Status BI</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Pré-Romaneio</th> 
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100"> 
                                {loading ? (
                                    <tr><td colSpan="11" className="px-4 py-8 text-center text-slate-500">Carregando dados da API...</td></tr>
                                ) : filteredData.length === 0 ? (
                                    <tr><td colSpan="11" className="px-4 py-8 text-center text-slate-500">Nenhum dado encontrado com os filtros atuais.</td></tr>
                                ) : (
                                    currentItems.map((carga, idx) => (
                                        <tr key={idx} className="hover:bg-blue-50 transition duration-150">
                                            <td className="px-4 py-3 text-slate-700">{carga.emissaoCTE}</td>
                                            <td className="px-4 py-3 text-slate-700">{carga.dataRomaneio || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700">{carga.numeroRomaneio || '-'}</td>
                                            <td className="px-4 py-3 text-slate-700 max-w-[150px] truncate">{carga.remetente}</td>
                                            <td className="px-4 py-3 text-slate-700 max-w-[150px] truncate">{carga.destinatario}</td>
                                            <td className="px-4 py-3 text-slate-700 max-w-[150px] truncate">{carga.consignatario}</td> 
                                            <td className="px-4 py-3 text-slate-700 font-medium">{carga.notas}</td>
                                            <td className="px-4 py-3 text-slate-700">{carga.pesoCarga}</td>
                                            <td className="px-4 py-3 text-slate-700">{carga.descricaoUltimaOcorrência}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                                                    carga.status_aux === 'Entregue' ? 'bg-green-100 text-green-800' :
                                                    carga.status_aux === 'Em Rota Para Entrega' ? 'bg-blue-100 text-blue-800' :
                                                    carga.status_aux === 'Anomalia' ? 'bg-red-100 text-red-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>{carga.status_aux}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                                                    carga.preRomaneio === 'SIM' ? 'bg-purple-100 text-purple-800' : 'bg-yellow-100 text-yellow-800'
                                                }`}>{carga.preRomaneio}</span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    {/* Footer e Paginação */}
                    {filteredData.length > 0 && (
                        <div className="bg-gray-50 p-4 flex justify-between items-center border-t border-gray-100">
                            <div className="flex justify-start items-center text-sm font-semibold text-slate-700">
                                <span>Total de Peso na Tela:</span>
                                <span className="text-blue-600 ml-2">{stats.pesoTotal} kg</span>
                            </div>
                            
                            <div className='flex items-center gap-4'>
                                <span className='text-sm text-slate-600'>
                                    Exibindo {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredData.length)} de {filteredData.length} registros
                                </span>
                                <button
                                    onClick={() => paginate(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className='p-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'
                                    aria-label="Página anterior"
                                ><ChevronLeft className='w-4 h-4 text-slate-700' /></button>
                                <button
                                    onClick={() => paginate(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    className='p-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'
                                    aria-label="Próxima página"
                                ><ChevronRight className='w-4 h-4 text-slate-700' /></button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

        {/* 🚨 NOVO FOOTER COM ASSINATURA */}
        <footer className="w-full mt-10 p-4 border-t border-gray-200">
            <div className="max-w-[1800px] mx-auto px-8 text-center text-xs text-slate-500 font-medium">
                Criado por <span className="text-blue-600 font-semibold">VITOR NOGUEIRA</span> | {new Date().getFullYear()}
            </div>
        </footer>
    </div>
    );
};

export default FriologBI;