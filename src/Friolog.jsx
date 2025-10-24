import React, { useState, useEffect, useMemo } from 'react';
import { Filter, Download, RefreshCw, Package, TrendingUp, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Truck, User } from 'lucide-react';

const API_CONFIG = {
    URL_TOKEN: "http://gwfiscal.gwcloud.com.br/webresources/v2/servicosGW/solicitarToken/",
    HEADERS_TOKEN: {
        "Login": "49576466000129",
        "Senha": "49576466000129",
        "GUID": "61dc471a-5d47-4459-9bd6-10e242be135e"
    },
    URL_CARGAS: "http://gwfiscal.gwcloud.com.br/webresources/v2/servicosGW/listarCargas/"
};

// --- Funções de Transformação (Baseadas na lógica Python) ---

const ocorrencia_vs_status_bi = {
    // ... (Mapeamento de ocorrências do seu script load_silver) ...
    "Entregue com Devolução Parcial Logística": "Retornando para o CD",
    "Entregue com Devolução Parcial Comercial": "Retornando para o CD",
    "Entregue com Devolução Parcial": "Retornando para o CD",
    "Devolução Total Logística": "Retornando para o CD",
    "Devolução Total Comercial": "Retornando para o CD",
    "Devolução Total": "Retornando para o CD",
    "Reentrega Logística": "Retornando para o CD",
    "REENTREGA LOGISTICA": "Retornando para o CD",
    "Reentrega Comercial": "Retornando para o CD",
    "REENTREGA COMERCIAL": "Retornando para o CD",
    "Devolução Total Logística Recebida": "Depósito Origem",
    "Devolução Total Comercial Recebida": "Depósito Origem",
    "Devolução Parcial Logistica Recebida": "Depósito Origem",
    "Devolução Parcial Comercial Recebida": "Depósito Origem",
    "Devolução Recebida": "Depósito Origem",
    "Devolução Logística Devolvido a Indústria": "Devolvido Indústria",
    "Devolução Comercial Devolvido a Indústria": "Devolvido Indústria",
    "Devolvido para Industria": "Devolvido Indústria",
    "Anomalia": "Anomalia",
    "Débito Realizado Contra Friolog": "Débito Friolog",
    "NF Refaturada": "Entregue",
    "Coletado pelo cliente": "Entregue",
    "Tratativa Administrativa": "Entregue",
    "Reentrega Logística Recebida": "Depósito Origem",
    "Reentrega Comercial Recebida": "Depósito Origem",
    "Reentrega Recebida": "Depósito Origem",
    "Agendamento": "Depósito Origem",
    "Em Rota Para Entrega": "Em Rota Para Entrega",
};

/**
 * Converte data de formato DDMMYYYY[HHMM] para YYYY-MM-DD
 * @param {string} dataStr 
 * @returns {string} no formato YYYY-MM-DD
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

/**
 * Aplica a lógica de transformação do script load_silver.
 * @param {Array<Object>} rawData - Dados brutos da API.
 * @returns {Array<Object>} Dados transformados e limpos.
 */
const applyEtlLogic = (rawData) => {
    if (!Array.isArray(rawData)) return [];
    
    return rawData
        // 1. Filtragem (similar ao PifPaf/CTe Normal do seu script)
        .filter(carga => {
            const isPifPaf = carga.remetente === "RIO BRANCO ALIMENTOS S/A" && carga.tipo === "b";
            const isCteNormal = carga.remetente !== "RIO BRANCO ALIMENTOS S/A" && carga.tipo === "n";
            return isPifPaf || isCteNormal;
        })
        // 2. Transformação de campos (Datas e Status BI)
        .map(carga => {
            const dataRomaneioStr = carga.dataRomaneio || ''; // Assume que a API retorna em CamelCase
            const dataOcorrenciaStr = carga.dataOcorrencia || '';
            const horaOcorrenciaStr = carga.horaOcorrencia || '0000';
            let statusAux = carga.status;

            // Lógica de Status Auxiliar
            if (!carga.dataEntrega) { // Se a data de entrega for NULA
                const ultimaOcorrencia = carga.descricaoUltimaOcorrencia || 'Sem Ocorrência';
                const statusBiValue = ocorrencia_vs_status_bi[ultimaOcorrencia];

                if (statusBiValue) {
                    statusAux = statusBiValue;
                }
                
                // Lógica de Reentrega/Romaneio (similar ao Python, comparando datas)
                if (statusAux === 'Retornando para o CD' || statusAux === 'Depósito Origem') {
                    if (dataRomaneioStr.length >= 8 && dataOcorrenciaStr.length >= 8) {
                        try {
                            // Converte a data de ocorrência para objeto Date
                            const dataOcorrencia = new Date(parseDataApi(dataOcorrenciaStr));
                            
                            // Converte a data/hora do romaneio para objeto Date
                            // Zera a hora do romaneio se só tiver a data (seu script python fez isso)
                            const fullRomaneioStr = dataRomaneioStr.substring(0, 8) + '0000'; 
                            const dataRomaneio = new Date(parseDataApi(fullRomaneioStr)); 

                            if (dataRomaneio > dataOcorrencia) {
                                statusAux = carga.status; // Volta ao status original (do GW)
                            }
                        } catch (e) { /* ignore parse error */ }
                    }
                }
            } else {
                 statusAux = 'Entregue'; // Força 'Entregue' se tiver data de entrega
            }

            // Mapeamento final de campos (limpeza e formatação)
            return {
                idNota: carga.idNota,
                notas: carga.notas,
                cte: carga.cte,
                destinatario: carga.destinatario || 'N/A',
                remetente: carga.remetente || 'N/A',
                consignatario: carga.consignatario || 'N/A', // <-- CAMPO CONSIGNATARIO ADICIONADO AQUI
                emissaoCTE: parseDataApi(carga.emissaoCTE),
                dataRomaneio: parseDataApi(dataRomaneioStr),
                numeroRomaneio: carga.numeroRomaneio || '',
                motoristaRomaneio: carga.motoristaRomaneio || 'Sem Motorista',
                placa: carga.placa || '',
                pesoCarga: parseFloat(carga.pesoCarga || 0).toFixed(2),
                status: carga.status,
                status_aux: statusAux,
                descricaoUltimaOcorrencia: carga.descricaoUltimaOcorrencia || 'Sem Ocorrência',
                dataOcorrencia: parseDataApi(dataOcorrenciaStr),
                dataEntrega: parseDataApi(carga.dataEntrega),
                cidadeDestinatario: carga.cidadeDestinatario || 'N/A',
                preRomaneio: (carga.dataRomaneio && carga.numeroRomaneio) ? 'SIM' : 'NÃO',
            };
        });
};


// --- Componente Principal ---
const FriologBI = () => { 
    // ... (useState e variáveis de estado permanecem as mesmas)
    const [cargas, setCargas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        emissaoCteInicio: '2025-01-01',
        emissaoCtefim: new Date().toISOString().split('T')[0],
        dataRomaneioInicio: '',
        dataRomaneioFim: '',
        motorista: 'Todos',
        remetente: 'Todos',
        cliente: 'Todos',
        statusBi: 'Todos',
        notas: '',
        temRomaneio: 'Todos',
        preRomaneio: 'Todos',
        consignatario: 'Todos', // Campo de filtro já existia
    });
    const [lastUpdate, setLastUpdate] = useState(null);
    
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(25); 

    
    // --- Funções de Carregamento (Utilizando a API real) ---
    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        setCurrentPage(1);
        try {
            // 1. Obter Token
            console.log("Requisitando Token...");
            const tokenResponse = await fetch(API_CONFIG.URL_TOKEN, { headers: API_CONFIG.HEADERS_TOKEN });
            if (!tokenResponse.ok) throw new Error(`Erro ao obter token: ${tokenResponse.status}`);
            const { token } = await tokenResponse.json();
            if (!token) throw new Error("Token não recebido na resposta.");
            console.log("Token obtido com sucesso.");

            // 2. Preparar Datas (DDMMYYYY) para a API
            const today = new Date();
            const last30Days = new Date(today);
            last30Days.setDate(today.getDate() - 30);

            const formatApiDate = (date) => {
                const d = date.getDate().toString().padStart(2, '0');
                const m = (date.getMonth() + 1).toString().padStart(2, '0');
                const y = date.getFullYear();
                return `${d}${m}${y}`;
            };
            
            const param1 = formatApiDate(last30Days);
            const param2 = formatApiDate(today);
            
            // 3. Obter Dados de Cargas
            console.log(`Requisitando cargas de ${param1} a ${param2}...`);
            const bodyCargas = { tipo: 1, parametro1: param1, parametro2: param2 };
            const headersCargas = { "token": token, "Content-Type": "application/json" };
            
            const cargasResponse = await fetch(API_CONFIG.URL_CARGAS, {
                method: 'POST',
                headers: headersCargas,
                body: JSON.stringify(bodyCargas)
            });

            if (!cargasResponse.ok) throw new Error(`Erro ao listar cargas: ${cargasResponse.status}`);
            const rawData = await cargasResponse.json();
            
            if (!Array.isArray(rawData)) throw new Error("Resposta da API de cargas não é uma lista.");

            // 4. Aplicar a Lógica ETL/Transformação
            const transformedData = applyEtlLogic(rawData);

            setCargas(transformedData);
            setLastUpdate(new Date());
            
        } catch (error) {
            console.error('Erro no fluxo de API:', error);
            alert('Houve um erro ao carregar os dados da API. Verifique o console.');
            setCargas([]); // Limpa dados em caso de falha
        } finally {
            setLoading(false);
        }
    };

    // --- Funções Auxiliares e Lógica de Exibição ---
    
    const getFilteredData = () => { /* ... (Filter logic, SEM ALTERAÇÃO) ... */
        return cargas.filter(carga => {
            if (filters.emissaoCteInicio && carga.emissaoCTE < filters.emissaoCteInicio) return false;
            if (filters.emissaoCtefim && carga.emissaoCTE > filters.emissaoCtefim) return false;
            if (filters.dataRomaneioInicio && carga.dataRomaneio && carga.dataRomaneio < filters.dataRomaneioInicio) return false;
            if (filters.dataRomaneioFim && carga.dataRomaneio && carga.dataRomaneio > filters.dataRomaneioFim) return false;
            if (filters.motorista !== 'Todos' && carga.motoristaRomaneio !== filters.motorista) return false;
            if (filters.remetente !== 'Todos' && carga.remetente !== filters.remetente) return false;
            if (filters.cliente !== 'Todos' && carga.destinatario !== filters.cliente) return false;
            if (filters.consignatario !== 'Todos' && carga.consignatario !== filters.consignatario) return false; // Filtro Consignatário
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
        return ['Todos', ...new Set(cargas.map(c => c[field]).filter(Boolean))];
    };
    
    const stats = useMemo(() => ({
        total: filteredData.length,
        pesoTotal: filteredData.reduce((sum, c) => sum + parseFloat(c.pesoCarga || 0), 0).toFixed(2),
        entregues: filteredData.filter(c => c.status_aux === 'Entregue').length,
        emRota: filteredData.filter(c => c.status_aux === 'Em Rota Para Entrega').length
    }), [filteredData]);
    
    const exportToCSV = () => { console.log("Exportando CSV..."); /* Lógica de exportação */ };
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

                {/* Stats Cards */}
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

                {/* Filters & Actions Panel */}
                <div className="bg-white rounded-xl p-8 shadow-2xl mb-10">
                    <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
                        <Filter className="w-6 h-6 text-blue-600" />
                        <h2 className="text-xl font-semibold text-slate-800">Parâmetros de Pesquisa</h2>
                    </div>
                    
                    {/* Inputs - Linhas e colunas uniformes */}
                    <div className="grid grid-cols-5 gap-6 mb-6">
                        {/* Linha 1 */}
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
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Data Romaneio (Início)</label>
                            <input type="date" value={filters.dataRomaneioInicio} onChange={(e) => setFilters({...filters, dataRomaneioInicio: e.target.value})} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-slate-600 mb-1">Data Romaneio (Fim)</label>
                            <input type="date" value={filters.dataRomaneioFim} onChange={(e) => setFilters({...filters, dataRomaneioFim: e.target.value})} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
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
                            onClick={loadData}
                            disabled={loading}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-semibold shadow-md"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Atualizar Dados
                        </button>
                        <button
                            onClick={exportToCSV}
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
                                            <td className="px-4 py-3 text-slate-700 max-w-[150px] truncate">{carga.consignatario}</td> {/* Coluna Consignatário */}
                                            <td className="px-4 py-3 text-slate-700 font-medium">{carga.notas}</td>
                                            <td className="px-4 py-3 text-slate-700">{carga.pesoCarga}</td>
                                            <td className="px-4 py-3 text-slate-700">{carga.descricaoUltimaOcorrencia}</td>
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
        </div>
    );
};

export default FriologBI;