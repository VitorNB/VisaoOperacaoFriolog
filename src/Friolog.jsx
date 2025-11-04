import React, { useState, useEffect, useMemo } from 'react';
import { Filter, Download, RefreshCw, Package, TrendingUp, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Truck, User, RotateCw, Factory, Percent, Calendar } from 'lucide-react';

// =================================================================
// CONFIGURAÇÃO DA API: USANDO PROXY RELATIVOS
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

// --- Mapeamento de Ocorrências (Mantido) ---

const ocorrencias_para_codigo = {
    "Entrega Realizada Normalmente": "001", "Entregue com Devolução Parcial": "002", "Devolução Total": "003",
    "Reentrega Logística": "004", "Reentrega Comercial": "005", "Devolução Recebida": "006",
    "Reentrega Recebida": "015", "Entrega Realizada + Canhoto": "1", "Agendamento": "308",
    "Em Trânsito": "0", "Saiu para Entrega": "030", "Em Rota Para Entrega": "309",
    "Material chegou na unidade de entrega": "228", "SAIU PARA ENTREGA": "229", "Devolucao Total": "103",
    "devoluçao parcial": "104", "NF Refaturada": "010", "Coletado pelo cliente": "011",
    "Entrega com Indenização Efetuada": "031", "Entregue com Devolução Parcial Logística": "300",
    "Entregue com Devolução Parcial Comercial": "301", "Devolução Total Logística": "302",
    "Devolução Total Comercial": "303", "Devolução Total Logística Recebida": "304",
    "Devolução Total Comercial Recebida": "305", "Devolução Logística Devolvido a Indústria": "306",
    "Devolução Comercial Devolvido a Indústria": "307", "Reentrega Logística Recebida": "312",
    "Reentrega Comercial Recebida": "315", "Sem Ocorrência": "999",
};

const getStatusBiFromOcorrencia = (ocorrenciaDesc, dataEntrega) => {
    if (dataEntrega) return 'Entregue';
    const cleanDesc = ocorrenciaDesc.trim().replace(/[ \t\r\n]+/g, ' ');

    if (cleanDesc.includes("NF Refaturada") || cleanDesc.includes("Coletado pelo cliente") || cleanDesc.includes("Entrega com Indenização") || cleanDesc === "Entrega Realizada Normalmente") return 'Entregue';
    if (cleanDesc.includes("Devolução Total Logística Recebida") || cleanDesc.includes("Devolução Total Comercial Recebida") || cleanDesc.includes("Devolução Recebida") || cleanDesc.includes("Reentrega Logística Recebida") || cleanDesc.includes("Reentrega Comercial Recebida") || cleanDesc.includes("Agendamento") || cleanDesc.includes("Material chegou na unidade de entrega")) return 'Depósito Origem';
    if (cleanDesc.includes("Devolução Total") || cleanDesc.includes("Devolução Parcial") || cleanDesc.includes("Reentrega Logística") || cleanDesc.includes("Reentrega Comercial") || cleanDesc.includes("Devolução Total Logística") || cleanDesc.includes("Devolução Total Comercial") || cleanDesc.includes("Entregue com Devolução Parcial Logística") || cleanDesc.includes("Entregue com Devolução Parcial Comercial")) return 'Retornando para o CD';
    if (cleanDesc.includes("Em Trânsito") || cleanDesc.includes("Saiu para Entrega") || cleanDesc.includes("Em Rota Para Entrega") || cleanDesc.includes("SAIU PARA ENTREGA") || cleanDesc.includes("Material em transferência")) return 'Em Rota Para Entrega';
    if (cleanDesc.includes("Devolvido para Industria") || cleanDesc.includes("Devolução Logística Devolvido a Indústria") || cleanDesc.includes("Devolução Comercial Devolvido a Indústria")) return 'Devolvido Indústria';
    if (cleanDesc.includes("Anomalia") || cleanDesc.includes("Quebra do Veiculo") || cleanDesc.includes("Extravio") || cleanDesc.includes("Roubo de Carga") || cleanDesc.includes("Avaria")) return 'Anomalia';
    if (cleanDesc.includes("Débito")) return 'Débito Friolog';

    return 'Pendente/Outros';
};

const getOcorrenciaCode = (descricao, codigoApi) => {
    const trimmedDesc = descricao ? descricao.trim() : '';
    if (!trimmedDesc || trimmedDesc === 'Sem Ocorrência' || trimmedDesc === 'N/A') return '999';
    const mappedCode = ocorrencias_para_codigo[trimmedDesc];
    if (mappedCode) return mappedCode;
    if (codigoApi && String(codigoApi).length <= 3) return String(codigoApi).padStart(3, '0');
    return '999';
}


// --- Funções de Ajuda para Datas (SYSDATE FIXO) ---

/** Retorna a data de hoje no formato YYYY-MM-DD para o input HTML (SYSDATE). */
const getTodayDateInputFormat = (date = new Date()) => {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${y}-${m}-${d}`;
};

/** Retorna a data de hoje no formato DDMMYYYY para a API (SYSDATE). */
const getTodayDateApiFormat = (date = new Date()) => {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}${m}${y}`;
};

/** Retorna o primeiro dia do MÊS ATUAL no formato DDMMYYYY para a API (para busca ampla). */
const getFirstDayOfMonthApiFormat = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const d = firstDay.getDate().toString().padStart(2, '0');
    const m = (firstDay.getMonth() + 1).toString().padStart(2, '0');
    const y = firstDay.getFullYear();
    return `${d}${m}${y}`;
};

/** Converte data de formato YYYY-MM-DD (do input HTML) para DDMMYYYY (para API). */
const apiDateFormat = (dateStr) => {
    if (!dateStr || dateStr.length !== 10) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}${month}${year}`;
};

/** Converte data de formato DDMMYYYY[HHMM] para YYYY-MM-DD (para exibição). */
const parseDataApi = (dataStr) => {
    if (!dataStr || dataStr.length < 8) return '';
    try {
        const day = dataStr.substring(0, 2);
        const month = dataStr.substring(2, 4);
        const year = dataStr.substring(4, 8);
        return `${year}-${month}-${day}`;
    } catch { return ''; }
};

/** Converte data de formato YYYY-MM-DD para DD/MM/YYYY para exibição em títulos. */
const formatDateForTitle = (dateStr) => {
    if (!dateStr || dateStr.length !== 10) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
};

// --- Mapeamento ETL e Transformação (Mantido) ---

const applyEtlLogic = (rawData) => {
    if (!Array.isArray(rawData)) return [];

    return rawData
        .filter(carga => {
            const isPifPaf = (carga.remetente || '').trim() === "RIO BRANCO ALIMENTOS S/A" && (carga.tipo || '').trim() === "b";
            const isCteNormal = (carga.remetente || '').trim() !== "RIO BRANCO ALIMENTOS S/A" && (carga.tipo || '').trim() === "n";
            const isUnknownType = !(carga.remetente && carga.tipo);
            return isPifPaf || isCteNormal || isUnknownType;
        })
        .map(carga => {
            const rawOcorrencia = carga.descricaoUltimaOcorrencia ? carga.descricaoUltimaOcorrencia.trim() : '';
            const ultimaOcorrencia = rawOcorrencia === '' ? 'Sem Ocorrência' : rawOcorrencia;
            const dataEntregaParsed = parseDataApi(carga.dataEntrega);
            const codigoOcorrencia = getOcorrenciaCode(ultimaOcorrencia, carga.codigoUltimaOcorrencia);
            let statusAux = getStatusBiFromOcorrencia(ultimaOcorrencia, dataEntregaParsed);

            if ((statusAux === 'Retornando para o CD' || statusAux === 'Depósito Origem') && carga.dataRomaneio && carga.dataOcorrencia) {
                const dataRomaneioStr = carga.dataRomaneio;
                const dataOcorrenciaStr = carga.dataOcorrencia;
                if (dataRomaneioStr.length >= 8 && dataOcorrenciaStr.length >= 8) {
                    try {
                        const dataOcorrencia = new Date(parseDataApi(dataOcorrenciaStr));
                        const fullRomaneioStr = dataRomaneioStr.substring(0, 8) + '0000';
                        const dataRomaneio = new Date(parseDataApi(fullRomaneioStr));
                        if (dataRomaneio > dataOcorrencia) {
                            statusAux = carga.status || 'Pendente/Outros';
                        }
                    } catch (e) { /* ignore parse error */ }
                }
            }

            return {
                idNota: carga.idNota, notas: carga.notas, cte: carga.cte,
                destinatario: (carga.destinatario || 'N/A').trim(), remetente: (carga.remetente || 'N/A').trim(),
                consignatario: (carga.consignatario || 'N/A').trim(),
                emissaoCTE: parseDataApi(carga.emissaoCte), 
                dataRomaneio: parseDataApi(carga.dataRomaneio), // Campo principal de filtro
                numeroRomaneio: carga.numeroRomaneio || '',
                motoristaRomaneio: (carga.motoristaRomaneio || 'Sem Motorista').trim(),
                placa: carga.placa || '', pesoCarga: parseFloat(carga.pesoCarga || 0),
                status: carga.status, status_aux: statusAux,
                descricaoUltimaOcorrencia: ultimaOcorrencia, codigoUltimaOcorrencia: codigoOcorrencia,
                dataOcorrencia: parseDataApi(carga.dataOcorrencia), dataEntrega: dataEntregaParsed,
                cidadeDestinatario: carga.cidadeDestinatario || 'N/A',
                preRomaneio: (carga.dataRomaneio && carga.numeroRomaneio) ? 'SIM' : 'NÃO',
            };
        });
};


// --- Componente Principal ---
const FriologBI = () => {
    // 🚨 SYSDATE FIXO: Data de hoje nos formatos HTML
    const sysdateInputFormat = getTodayDateInputFormat();

    // Variáveis de Estado
    const [cargas, setCargas] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Estado inicial dos filtros que define a data de hoje como padrão para Romaneio
    const initialFilters = {
        emissaoCteInicio: '', emissaoCtefim: '',
        dataRomaneioInicio: sysdateInputFormat, // SYSDATE
        dataRomaneioFim: sysdateInputFormat,     // SYSDATE
        motorista: 'Todos', remetente: 'Todos', cliente: 'Todos', statusBi: 'Todos',
        notas: '', temRomaneio: 'Todos', preRomaneio: 'Todos', consignatario: 'Todos',
    };
    
    const [filters, setFilters] = useState(initialFilters);
    
    const [lastUpdate, setLastUpdate] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(25);


    // --- Funções de Carregamento (Força a busca com o SYSDATE do mês atual) ---
    useEffect(() => { 
        loadData(); 
    }, []); 

    const loadData = async () => {
        setLoading(true);
        setCurrentPage(1);

        // 1. Prepara as datas da API: Início do Mês e Data de Hoje (DDMMYYYY)
        // Busca ampla (mês atual) na API para garantir que os romaneios de hoje sejam capturados.
        const apiDateStart = getFirstDayOfMonthApiFormat();
        const apiDateEnd = getTodayDateApiFormat();
        
        // 🚨 ATUALIZA O ESTADO DO FILTRO PARA O SYSDATE (Visualmente no input)
        // Mantém a data de hoje no input de filtro de Romaneio
        setFilters(prevFilters => ({
            ...prevFilters,
            dataRomaneioInicio: sysdateInputFormat,
            dataRomaneioFim: sysdateInputFormat,
        }));
        
        if (apiDateStart.length !== 8 || apiDateEnd.length !== 8) {
            alert("Erro interno: Falha ao formatar a data do sistema para a API.");
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const tokenResponse = await fetch(API_CONFIG.URL_TOKEN, { headers: API_CONFIG.HEADERS_TOKEN });
            const responseData = await tokenResponse.json();

            if (!tokenResponse.ok) {
                throw new Error(`Erro ao obter token: ${tokenResponse.status}. Mensagem: ${responseData.mensagem || responseData.Message || 'N/A'}`);
            }

            const token = responseData.token;

            // 3. Obter Dados de Cargas: Usando Tipo 1 (Emissão CT-e) para o mês inteiro.
            const bodyCargas = { 
                tipo: 1, // Tipo 1: Data de emissão do CT-e 
                parametro1: apiDateStart, 
                parametro2: apiDateEnd  
            };
            
            const headersCargas = { "token": token, "Content-Type": "application/json" };

            const cargasResponse = await fetch(API_CONFIG.URL_CARGAS, {
                method: 'POST',
                headers: headersCargas,
                body: JSON.stringify(bodyCargas),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!cargasResponse.ok) throw new Error(`Erro ao listar cargas: ${cargasResponse.status}`);

            let rawData = await cargasResponse.json();

            if (!Array.isArray(rawData)) {
                rawData = [];
            }

            const transformedData = applyEtlLogic(rawData);

            setCargas(transformedData);
            setLastUpdate(new Date());

        } catch (error) {
            if (error.name === 'AbortError') {
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
            const motoristaCarga = (carga.motoristaRomaneio || 'Sem Motorista').trim();
            const remetenteCarga = (carga.remetente || 'N/A').trim();
            const clienteCarga = (carga.destinatario || 'N/A').trim();
            const consignatarioCarga = (carga.consignatario || 'N/A').trim();

            // Filtros de Data de Emissão do CT-e (Local - Secundário)
            if (filters.emissaoCteInicio && carga.emissaoCTE && carga.emissaoCTE < filters.emissaoCteInicio) return false;
            if (filters.emissaoCtefim && carga.emissaoCTE && carga.emissaoCTE > filters.emissaoCtefim) return false;

            // 🚨 FILTRO PRINCIPAL PELA DATA DE ROMANEIO (Filtro Local Obrigatório)
            // Aplica o filtro exato para o intervalo de Data de Romaneio selecionado (ou SYSDATE, por padrão)
            if (filters.dataRomaneioInicio && carga.dataRomaneio && carga.dataRomaneio < filters.dataRomaneioInicio) return false;
            if (filters.dataRomaneioFim && carga.dataRomaneio && carga.dataRomaneio > filters.dataRomaneioFim) return false;

            if (filters.motorista !== 'Todos' && motoristaCarga !== filters.motorista) return false;
            if (filters.remetente !== 'Todos' && remetenteCarga !== filters.remetente) return false;
            if (filters.cliente !== 'Todos' && clienteCarga !== filters.cliente) return false;
            if (filters.consignatario !== 'Todos' && consignatarioCarga !== filters.consignatario) return false;

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
        if (field === 'descricaoUltimaOcorrencia') {
             return ['Todos', 'Sem Ocorrência', ...new Set(cargas.map(c => (c[field] || 'N/A').trim()).filter(Boolean))].sort((a, b) => {
                 if (a === 'Todos') return -1;
                 if (b === 'Todos') return 1;
                 return a.localeCompare(b);
             });
        }
        
        return ['Todos', ...new Set(cargas.map(c => (c[field] || 'N/A').trim()).filter(Boolean))].sort((a, b) => {
            if (a === 'Todos') return -1;
            if (b === 'Todos') return 1;
            return a.localeCompare(b);
        });
    };

    const reportTitle = useMemo(() => {
        const start = formatDateForTitle(filters.dataRomaneioInicio);
        const end = formatDateForTitle(filters.dataRomaneioFim);

        if (filters.consignatario && filters.consignatario !== 'Todos') {
            return `Friolog BI - ${filters.consignatario}`;
        }
        if (filters.cliente && filters.cliente !== 'Todos') {
            return `Friolog BI - ${filters.cliente}`;
        }
        
        return `Friolog BI - Romaneio: ${start} a ${end}`;
    }, [filters]);

    useEffect(() => {
        document.title = reportTitle;
    }, [reportTitle]);


    // Lógica de Stats com os 16 KPIs (Mantida)
    const stats = useMemo(() => {
        const totalNotas = filteredData.length;
        const totalPeso = filteredData.reduce((sum, c) => sum + (c.pesoCarga || 0), 0).toFixed(2);
        
        const ocorrenciaCount = (code) => filteredData.filter(c => c.codigoUltimaOcorrencia === code).length;
        const nfsSemOcorrencia = ocorrenciaCount("999");
        
        const totalNFsExpedidas = totalNotas;
        const pesoTotalExpedido = totalPeso;
        const nfsEmDepositoOrigem = filteredData.filter(c => c.status_aux === 'Depósito Origem').length;
        const nfsEmRota = filteredData.filter(c => c.status_aux === 'Em Rota Para Entrega').length;
        
        const reentregaComercial = ocorrenciaCount("005");
        const reentregaLogistica = ocorrenciaCount("004");
        const reentregaRecebida = ocorrenciaCount("015");
        const totalReentregasLog = reentregaLogistica + reentregaComercial + reentregaRecebida;

        const devolucaoTotal = ocorrenciaCount("003");
        const devolucaoParcial = ocorrenciaCount("002");
        const devolucaoRecebida = ocorrenciaCount("006");
        const totalDevolucaoCompleta = devolucaoTotal + devolucaoParcial;

        const agendamentos = ocorrenciaCount("308");
        const entregasFeitas = filteredData.filter(c => c.dataEntrega || c.codigoUltimaOcorrencia === '001').length; 
        
        const percentReentregasLogisticas = totalReentregasLog > 0
            ? ((reentregaLogistica / totalReentregasLog) * 100).toFixed(2) 
            : 0.00;

        const percentDevolucoes = totalNFsExpedidas > 0
            ? ((totalDevolucaoCompleta / totalNFsExpedidas) * 100).toFixed(2) 
            : 0.00;

        const percentEntregasFeitas = totalNFsExpedidas > 0
            ? ((entregasFeitas / totalNFsExpedidas) * 100).toFixed(2) 
            : 0.00;
            
        const nfsComerciaisFoco = entregasFeitas + devolucaoParcial + reentregaComercial;
        const percentComercial = totalNFsExpedidas > 0
            ? ((nfsComerciaisFoco / totalNFsExpedidas) * 100).toFixed(2) 
            : 0.00;
            
        return {
            totalNFsExpedidas, pesoTotalExpedido, nfsEmDepositoOrigem, nfsEmRota,
            reentregaComercial, reentregaLogistica, reentregaRecebida, 
            percentReentregasLogisticas: `${percentReentregasLogisticas}%`,
            devolucaoTotal, devolucaoParcial, devolucaoRecebida, 
            percentDevolucoes: `${percentDevolucoes}%`,
            agendamentos, entregasFeitas, 
            percentEntregasFeitas: `${percentEntregasFeitas}%`,
            percentComercial: `${percentComercial}%`,
            nfsSemOcorrencia, 
        };
    }, [filteredData]);
    
    // Função de Exportar CSV (Mantida)
    const exportToCSV = () => {
        if (filteredData.length === 0) return;

        const headers = [
            "Emissão CT-e", "Data Romaneio", "Nº Romaneio", "Remetente", "Cliente", "Consignatário", 
            "Notas", "Peso (kg)", "Cód. Ocorrência", "Última Ocorrência", "Status BI", "Pré-Romaneio"
        ];

        const rows = filteredData.map(d => [
            d.emissaoCTE || '', d.dataRomaneio || '', d.numeroRomaneio || '', d.remetente || '',
            d.destinatario || '', d.consignatario || '', d.notas || '', d.pesoCarga.toFixed(2) || '0.00',
            d.codigoUltimaOcorrencia || '', 
            d.descricaoUltimaOcorrencia || '', d.status_aux || '', d.preRomaneio || ''
        ]);

        const escapeCsvField = (field) => {
            if (typeof field !== 'string') return field;
            if (field.includes(';') || field.includes('"') || field.includes('\n')) {
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        };

        const csvContent = [
            headers.map(escapeCsvField).join(";"),
            ...rows.map(e => e.map(escapeCsvField).join(";"))
        ].join("\n");

        const BOM = "\uFEFF";
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `friolog_bi_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log("Exportação CSV concluída.");
    };
    
    // --- Lógica de Paginação e JSX (Mantida) ---
    
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const paginate = (pageNumber) => {
        if (pageNumber > 0 && pageNumber <= totalPages) {
            setCurrentPage(pageNumber);
        }
    };
    
    const StatCard = ({ title, value, icon: Icon, colorClass, iconBgClass, subTitle = '' }) => (
        <div className="bg-white rounded-xl p-6 shadow-2xl flex flex-col justify-between transition transform hover:scale-[1.01] min-h-[140px]">
            <div className='flex justify-between items-start'>
                <div>
                    <p className="text-sm font-medium text-slate-500 mb-1 leading-tight">{title}</p>
                    <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
                </div>
                <div className={`p-3 rounded-full ${iconBgClass} shadow-md`}>
                    <Icon className={`w-6 h-6 ${colorClass}`} /> 
                </div>
            </div>
            {subTitle && (
                <p className="text-xs text-slate-400 mt-2">{subTitle}</p>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white pb-12"> 
            <header className="bg-white shadow-lg p-4 sticky top-0 z-10">
                <div className="max-w-[1800px] mx-auto px-6 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Truck className="w-8 h-8 text-blue-600" />
                        <h1 className="text-2xl font-extrabold text-slate-900">Friolog BI - Logística</h1>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="font-medium text-slate-700">Total de Notas (Expedidas): </span>
                        <span className="text-xl font-bold text-blue-600">{stats.totalNFsExpedidas}</span>
                        <User className="w-6 h-6 text-gray-500" />
                    </div>
                </div>
            </header>

            <div className="max-w-[1800px] mx-auto px-8 py-8">
                
                {/* Título e Atualização */}
                <div className="flex flex-col items-center justify-center mb-6">
                    <h2 className="text-4xl font-extrabold text-slate-900 text-center mb-1">
                        {reportTitle.replace('Friolog BI - ', '')}
                    </h2>
                    <span className="text-sm text-slate-500">
                        Última Atualização: {loading ? 'Carregando da API...' : (lastUpdate ? lastUpdate.toLocaleString('pt-BR') : 'Sem dados')}
                    </span>
                </div>

                {/* Stats Cards - QUATRO LINHAS DE 4 CARDS */}
                
                {/* LINHA 1: GERAIS */}
                <div className="grid grid-cols-4 gap-8 mb-6">
                    <StatCard 
                        title="Total de NFs Expedidas" 
                        value={stats.totalNFsExpedidas} 
                        icon={Package} 
                        colorClass="text-blue-600" iconBgClass="bg-blue-50"
                        subTitle="Contagem total de Notas/CT-e's no período do Romaneio."
                    />
                    <StatCard 
                        title="Peso Total Expedido" 
                        value={`${stats.pesoTotalExpedido} kg`}
                        icon={TrendingUp} 
                        colorClass="text-indigo-600" iconBgClass="bg-indigo-50"
                        subTitle="Soma total do peso (kg) dos documentos filtrados."
                    />
                    <StatCard 
                        title="NFs em Depósito de Origem" 
                        value={stats.nfsEmDepositoOrigem} 
                        icon={Factory} 
                        colorClass="text-cyan-600" iconBgClass="bg-cyan-50"
                        subTitle="Status: Depósito Origem (Ex: Ocorrência 015, 006)"
                    />
                    <StatCard 
                        title="Em Rota" 
                        value={stats.nfsEmRota} 
                        icon={Truck} 
                        colorClass="text-orange-600" iconBgClass="bg-orange-50"
                        subTitle="Status: Em Rota Para Entrega (Ex: Ocorrência 0, 030, 309)"
                    />
                </div>
                
                {/* LINHA 2: REENTREGAS */}
                <div className="grid grid-cols-4 gap-8 mb-6">
                    <StatCard 
                        title="Reentrega Comercial" 
                        value={stats.reentregaComercial} 
                        icon={User} 
                        colorClass="text-pink-600" iconBgClass="bg-pink-50"
                        subTitle="Contagem da Ocorrência 005"
                    />
                    <StatCard 
                        title="Reentrega Logística" 
                        value={stats.reentregaLogistica} 
                        icon={Truck} 
                        colorClass="text-red-600" iconBgClass="bg-red-50"
                        subTitle="Contagem da Ocorrência 004"
                    />
                    <StatCard 
                        title="Reentrega Recebida" 
                        value={stats.reentregaRecebida} 
                        icon={CheckCircle} 
                        colorClass="text-yellow-600" iconBgClass="bg-yellow-50"
                        subTitle="Contagem da Ocorrência 015"
                    />
                    <StatCard 
                        title="% de Reentregas Logísticas (004)" 
                        value={stats.percentReentregasLogisticas} 
                        icon={Percent} 
                        colorClass="text-purple-600" iconBgClass="bg-purple-50"
                        subTitle="(Ocorrência 004) / (004 + 005 + 015)"
                    />
                </div>

                {/* LINHA 3: DEVOLUÇÕES */}
                <div className="grid grid-cols-4 gap-8 mb-6">
                    <StatCard 
                        title="Devolução Total" 
                        value={stats.devolucaoTotal} 
                        icon={RotateCw} 
                        colorClass="text-red-700" iconBgClass="bg-red-100"
                        subTitle="Contagem da Ocorrência 003"
                    />
                    <StatCard 
                        title="Devolução Parcial" 
                        value={stats.devolucaoParcial} 
                        icon={RotateCw} 
                        colorClass="text-orange-700" iconBgClass="bg-orange-100"
                        subTitle="Contagem da Ocorrência 002"
                    />
                    <StatCard 
                        title="Devolução Recebida" 
                        value={stats.devolucaoRecebida} 
                        icon={CheckCircle} 
                        colorClass="text-green-700" iconBgClass="bg-green-100"
                        subTitle="Contagem da Ocorrência 006"
                    />
                    <StatCard 
                        title="% de Dev. Totais e Parciais" 
                        value={stats.percentDevolucoes} 
                        icon={Percent} 
                        colorClass="text-blue-700" iconBgClass="bg-blue-100"
                        subTitle="(002 + 003) / (Total NFs Expedidas)"
                    />
                </div>

                {/* LINHA 4: PERFORMANCE */}
                <div className="grid grid-cols-4 gap-8 mb-10">
                    <StatCard 
                        title="Agendamentos" 
                        value={stats.agendamentos} 
                        icon={Calendar} 
                        colorClass="text-teal-600" iconBgClass="bg-teal-50"
                        subTitle="Contagem da Ocorrência 308"
                    />
                    <StatCard 
                        title="Entregas Feitas" 
                        value={stats.entregasFeitas} 
                        icon={CheckCircle} 
                        colorClass="text-green-600" iconBgClass="bg-green-50"
                        subTitle="Contagem da Ocorrência 001"
                    />
                    <StatCard 
                        title="% de Entregas Feitas (001)" 
                        value={stats.percentEntregasFeitas} 
                        icon={Percent} 
                        colorClass="text-emerald-600" iconBgClass="bg-emerald-50"
                        subTitle="(Ocorrência 001) / (Total NFs Expedidas)"
                    />
                    <StatCard 
                        title="Foco Comercial" 
                        value={stats.percentComercial} 
                        icon={AlertCircle} 
                        colorClass="text-gray-700" iconBgClass="bg-gray-100"
                        subTitle="NFs sem registro de ocorrência ou status de trânsito."
                    />
                </div>


                {/* Filters & Actions Panel */}
                <div className="bg-white rounded-xl p-8 shadow-2xl mb-10">
                    <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
                        <Filter className="w-6 h-6 text-blue-600" />
                        <h2 className="text-xl font-semibold text-slate-800">Parâmetros de Pesquisa</h2>
                    </div>
                    
                    <div className="grid grid-cols-5 gap-6 mb-6">
                        {/* Datas de Emissão CT-e */}
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
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                            <h3 className="text-lg font-semibold text-slate-800">
                                {reportTitle.replace('Friolog BI - ', '')}
                            </h3>
                        </div>
                        
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
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Cód. Ocorrência</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Última Ocorrência</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Status BI</th>
                                    <th className="px-4 py-3 text-left font-medium text-slate-700">Pré-Romaneio</th> 
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100"> 
                                {loading ? (
                                    <tr><td colSpan="12" className="px-4 py-8 text-center text-slate-500">Carregando dados da API...</td></tr>
                                ) : filteredData.length === 0 ? (
                                    <tr><td colSpan="12" className="px-4 py-8 text-center text-slate-500">Nenhum dado encontrado com os filtros atuais.</td></tr>
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
                                            <td className="px-4 py-3 text-slate-700">{carga.pesoCarga.toFixed(2)}</td>
                                            <td className="px-4 py-3 text-slate-700">{carga.codigoUltimaOcorrencia}</td>
                                            <td className="px-4 py-3 text-slate-700">{carga.descricaoUltimaOcorrencia}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                                                    carga.status_aux === 'Entregue' ? 'bg-green-100 text-green-800' :
                                                    carga.status_aux === 'Em Rota Para Entrega' ? 'bg-blue-100 text-blue-800' :
                                                    carga.status_aux === 'Anomalia' ? 'bg-red-100 text-red-800' :
                                                    // Destaque para Pendente/Outros (que inclui o "Sem Ocorrência")
                                                    carga.status_aux === 'Pendente/Outros' ? 'bg-yellow-100 text-yellow-800' :
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
                                <span className="text-blue-600 ml-2">{stats.pesoTotalExpedido} kg</span>
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

            {/* NOVO FOOTER COM ASSINATURA */}
            <footer className="w-full mt-10 p-4 border-t border-gray-200">
                <div className="max-w-[1800px] mx-auto px-8 text-center text-xs text-slate-500 font-medium">
                    Criado por <span className="text-blue-600 font-semibold">VITOR NOGUEIRA</span> | {new Date().getFullYear()}
                </div>
            </footer>
        </div>
    );
};

export default FriologBI;