
import React, { useState, useMemo, useRef } from 'react';
import type { Employee, StoredClockEvent, BackupEntry, AppState } from '../types';
import { ClockType } from '../types';
import { PIN_LENGTH } from '../constants';
import { LogoutIcon, EditIcon, DownloadIcon, DeleteIcon, UploadIcon, DatabaseIcon } from './Icons';

interface AdminDashboardProps {
  admin: Employee;
  allEvents: StoredClockEvent[];
  employees: Employee[];
  backupHistory: BackupEntry[];
  onAddEmployee: (employee: Omit<Employee, 'id'>) => void;
  onDeleteEmployee: (id: number) => void;
  onUpdateEmployee: (employee: Employee) => void;
  onImportEmployees: (employees: Omit<Employee, 'id'>[]) => Promise<{ added: number, updated: number, errors: string[] }>;
  onLogout: () => void;
  onUpdateEvent: (eventId: number, newTimestamp: Date) => void;
  onAddManualEvent: (details: { employeeId: number; type: ClockType; timestamp: Date; }) => Promise<boolean>;
  onDeleteEvent: (eventId: number) => void;
  onRestoreFromFile: (backupData: AppState) => Promise<boolean>;
  onRestoreFromHistory: (backupEntry: BackupEntry) => Promise<boolean>;
  onDownloadBackup: () => void;
}

const NORMAL_WORK_MILLISECONDS = 8 * 60 * 60 * 1000;
const NORMAL_HOUR_RATE = 8.15;
const EXTRA_HOUR_RATE = 16.30;


interface WorkDetails {
    total: number;
    normal: number;
    extra: number;
    payment: {
        normal: number;
        extra: number;
        total: number;
    };
    status: 'complete' | 'incomplete' | 'error' | 'no_entry';
}

const formatMilliseconds = (totalMillis: number): string => {
    if (totalMillis < 0) return "Erro";
    const hours = Math.floor(totalMillis / (1000 * 60 * 60));
    const minutes = Math.floor((totalMillis % (1000 * 60 * 60)) / (1000 * 60));
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${pad(hours)}h ${pad(minutes)}m`;
};

const formatCurrency = (value: number): string => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};


const calculateWorkDetails = (dailyEvents: StoredClockEvent[]): WorkDetails => {
    const defaultPayment = { payment: { normal: 0, extra: 0, total: 0 } };
    const sortedEvents = [...dailyEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    let totalMillis = 0;
    let lastTime: number | null = null;
    let isWorking = false;

    for (const event of sortedEvents) {
        const currentTime = new Date(event.timestamp).getTime();
        if (isWorking && lastTime) {
            totalMillis += currentTime - lastTime;
        }
        switch (event.type) {
            case ClockType.Entrada:
            case ClockType.FimIntervalo:
                isWorking = true;
                break;
            case ClockType.Saida:
            case ClockType.InicioIntervalo:
                isWorking = false;
                break;
        }
        lastTime = currentTime;
    }

    const hasEntry = sortedEvents.some(e => e.type === ClockType.Entrada);
    if (!hasEntry) return { total: 0, normal: 0, extra: 0, status: 'no_entry', ...defaultPayment };
    
    const hasExit = sortedEvents.some(e => e.type === ClockType.Saida);
    if (isWorking || !hasExit) {
        return { total: 0, normal: 0, extra: 0, status: 'incomplete', ...defaultPayment };
    }

    if (totalMillis < 0) return { total: 0, normal: 0, extra: 0, status: 'error', ...defaultPayment };
    
    const normal = Math.min(totalMillis, NORMAL_WORK_MILLISECONDS);
    const extra = Math.max(0, totalMillis - NORMAL_WORK_MILLISECONDS);
    
    const normalHours = normal / (1000 * 60 * 60);
    const extraHours = extra / (1000 * 60 * 60);

    const normalPayment = normalHours * NORMAL_HOUR_RATE;
    const extraPayment = extraHours * EXTRA_HOUR_RATE;
    const totalPayment = normalPayment + extraPayment;


    return { 
        total: totalMillis, 
        normal, 
        extra, 
        payment: {
            normal: normalPayment,
            extra: extraPayment,
            total: totalPayment
        },
        status: 'complete' 
    };
};

const renderWorkDetails = (details: WorkDetails) => {
    switch (details.status) {
        case 'incomplete': return <span className="font-mono text-base text-yellow-400 bg-gray-800 px-2 py-1 rounded-md">Incompleto</span>;
        case 'error': return <span className="font-mono text-base text-red-400 bg-gray-800 px-2 py-1 rounded-md">Erro</span>;
        case 'no_entry': return <span className="font-mono text-base text-gray-500 bg-gray-800 px-2 py-1 rounded-md">-</span>;
        case 'complete':
            return (
                <div className="text-right text-sm">
                    <div className="font-mono text-base text-cyan-400 font-bold">
                        Total: {formatMilliseconds(details.total)}
                    </div>
                    <div className="text-gray-400 text-xs mt-1">
                        (Normal: {formatMilliseconds(details.normal)}
                        {details.extra > 0 && <span className="font-semibold text-green-400"> | Extra: {formatMilliseconds(details.extra)}</span>})
                    </div>
                    <div className="font-bold text-emerald-400 text-base mt-2">
                        {formatCurrency(details.payment.total)}
                    </div>
                </div>
            );
    }
};


const AdminDashboard: React.FC<AdminDashboardProps> = ({ admin, allEvents, employees, backupHistory, onAddEmployee, onDeleteEmployee, onUpdateEmployee, onImportEmployees, onLogout, onUpdateEvent, onAddManualEvent, onDeleteEvent, onRestoreFromFile, onRestoreFromHistory, onDownloadBackup }) => {
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
    
    const [newEmployee, setNewEmployee] = useState({ name: '', phone: '', pin: '' });
    const [formError, setFormError] = useState('');

    const [startDate, setStartDate] = useState<Date>(() => {
        const date = new Date();
        date.setDate(1);
        return date;
    });
    const [endDate, setEndDate] = useState<Date>(new Date());

    const [editingEvent, setEditingEvent] = useState<StoredClockEvent | null>(null);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    
    const [importMessage, setImportMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const restoreFileInputRef = useRef<HTMLInputElement>(null);
    const [restoreMessage, setRestoreMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
    const [backupToRestore, setBackupToRestore] = useState<AppState | null>(null);
    const [showAddBreakModal, setShowAddBreakModal] = useState<{employeeId: number, employeeName: string, date: Date} | null>(null);


    const formatDateForInput = (date: Date): string => {
        return date.toISOString().split('T')[0];
    }
    
    const [manualEntry, setManualEntry] = useState({
        employeeId: '',
        date: formatDateForInput(new Date()),
        time: '09:00',
        type: ClockType.Entrada,
    });
    const [manualEntryMessage, setManualEntryMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name === 'pin' && value.length > PIN_LENGTH) return;
        setNewEmployee(prev => ({ ...prev, [name]: value }));
    };

    const handleAddEmployeeSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmployee.name || !newEmployee.phone || newEmployee.pin.length !== PIN_LENGTH) {
            setFormError('Todos os campos são obrigatórios e o PIN deve ter 4 dígitos.');
            return;
        }
        if (employees.some(emp => emp.pin === newEmployee.pin) || newEmployee.pin === admin.pin) {
            setFormError('Este PIN já está em uso.');
            return;
        }
        onAddEmployee(newEmployee);
        setNewEmployee({ name: '', phone: '', pin: '' });
        setFormError('');
    };
    
    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const resetInput = () => { if (event.target) event.target.value = ''; };
        const showMessage = (text: string, type: 'success' | 'error') => {
            setImportMessage({ text, type });
            setTimeout(() => setImportMessage(null), 7000);
        };

        const text = await file.text();
        if (!text) {
            showMessage('Arquivo CSV vazio ou inválido.', 'error');
            resetInput();
            return;
        }
        
        // Handle different line endings (CRLF vs LF)
        const lines = text.trim().split(/\r?\n/);
        
        let headerLine = lines.shift()?.trim();
        if (!headerLine) {
            showMessage('Arquivo CSV não contém cabeçalho.', 'error');
            resetInput();
            return;
        }

        // Handle BOM (Byte Order Mark) sometimes added by editors like Excel
        if (headerLine.charCodeAt(0) === 0xFEFF) {
            headerLine = headerLine.substring(1);
        }

        // Detect delimiter (comma or semicolon)
        const delimiter = headerLine.includes(';') ? ';' : ',';
        
        const header = headerLine.split(delimiter).map(h => h.trim());
        const expectedHeader = ['Nome', 'telefone', 'Pin'];

        if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) {
            showMessage(`Cabeçalho inválido. Esperado: '${expectedHeader.join(',')}'. Recebido: '${header.join(',')}'`, 'error');
            resetInput();
            return;
        }

        const employeesToImport: Omit<Employee, 'id'>[] = [];
        const parseErrors: string[] = [];

        lines.forEach((line, index) => {
            if (!line.trim()) return; // Ignora linhas vazias
            const values = line.split(delimiter).map(v => v.trim());
            
            const name = values[0] || '';
            const phone = values[1] || '';
            const pin = values[2] || '';

            if (values.length > 3 || pin === '') {
                 parseErrors.push(`Linha ${index + 2}: Formato inválido ou PIN ausente. Cada linha deve ter 3 colunas e o PIN é obrigatório.`);
                return;
            }
            if (!/^\d{4}$/.test(pin)) {
                parseErrors.push(`Linha ${index + 2}: PIN '${pin}' é inválido. Deve conter exatamente 4 dígitos.`);
                return;
            }
            employeesToImport.push({ name, phone, pin });
        });

        if (parseErrors.length > 0) {
            showMessage(`Erros no arquivo: ${parseErrors.join(' ')}`, 'error');
            resetInput();
            return;
        }

        if (employeesToImport.length === 0) {
            showMessage('Nenhum funcionário válido para importar.', 'error');
            resetInput();
            return;
        }

        const result = await onImportEmployees(employeesToImport);

        if (result.errors.length > 0) {
            showMessage(`Importação falhou: ${result.errors.join(' ')}`, 'error');
        } else {
            const messageParts = [];
            if (result.added > 0) messageParts.push(`${result.added} adicionados`);
            if (result.updated > 0) messageParts.push(`${result.updated} atualizados`);
            const summary = messageParts.length > 0 ? messageParts.join(', ') : 'Nenhuma alteração';
            showMessage(`Importação concluída: ${summary}.`, 'success');
        }

        resetInput();
    };


    const handleDeleteClick = (employeeId: number) => {
        const employee = employees.find(e => e.id === employeeId);
        if (employee && window.confirm(`Tem certeza que deseja excluir o funcionário ${employee.name}? Esta ação não pode ser desfeita.`)) {
             onDeleteEmployee(employeeId);
        }
    }

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<Date>>) => {
        const dateString = e.target.value;
        if (dateString) {
            const [year, month, day] = dateString.split('-').map(Number);
            setter(new Date(year, month - 1, day));
        }
    };

    const filteredEvents = useMemo(() => {
        const startOfDay = new Date(startDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        return [...allEvents]
            .filter(event => {
                const eventDate = new Date(event.timestamp);
                const isAfterStart = eventDate >= startOfDay;
                const isBeforeEnd = eventDate <= endOfDay;
                const matchesEmployee = selectedEmployeeId === 'all' || event.employeeId === parseInt(selectedEmployeeId, 10);
                
                return isAfterStart && isBeforeEnd && matchesEmployee;
            })
            .reverse();
    }, [allEvents, selectedEmployeeId, startDate, endDate]);

    const groupedByDateAndEmployee = useMemo(() => {
        const groups: { [dateKey: string]: { date: Date, employees: { [empId: number]: StoredClockEvent[] } } } = {};
        const reversedEvents = [...filteredEvents].reverse();

        reversedEvents.forEach(event => {
            const eventDate = new Date(event.timestamp);
            const dateKey = eventDate.toLocaleDateString('pt-BR', {
                year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
            });
            if (!groups[dateKey]) {
                groups[dateKey] = { date: eventDate, employees: {} };
            }
            if (!groups[dateKey].employees[event.employeeId]) {
                groups[dateKey].employees[event.employeeId] = [];
            }
            groups[dateKey].employees[event.employeeId].push(event);
        });
        return groups;
    }, [filteredEvents]);

    const dateKeys = useMemo(() => Object.keys(groupedByDateAndEmployee).sort((a,b) => {
        const dateA = new Date(groupedByDateAndEmployee[a].date).setHours(0,0,0,0);
        const dateB = new Date(groupedByDateAndEmployee[b].date).setHours(0,0,0,0);
        return dateB - dateA;
    }), [groupedByDateAndEmployee]);
    
    const periodTotals = useMemo(() => {
        let total = 0;
        let normal = 0;
        let extra = 0;
        let payment = 0;

        dateKeys.forEach(date => {
            const employeeGroupsOnDate = groupedByDateAndEmployee[date].employees;
            Object.keys(employeeGroupsOnDate).forEach(employeeIdStr => {
                const dailyEvents = employeeGroupsOnDate[Number(employeeIdStr)];
                const details = calculateWorkDetails(dailyEvents);
                if (details.status === 'complete') {
                    total += details.total;
                    normal += details.normal;
                    extra += details.extra;
                    payment += details.payment.total;
                }
            });
        });

        return { total, normal, extra, payment };
    }, [dateKeys, groupedByDateAndEmployee]);

    const handleExportCSV = () => {
        if (filteredEvents.length === 0) return;

        const escapeCsvCell = (cell: string | number | Date): string => {
            const strCell = String(cell);
            if (strCell.includes(',') || strCell.includes('"') || strCell.includes('\n')) {
                const escapedCell = strCell.replace(/"/g, '""');
                return `"${escapedCell}"`;
            }
            return strCell;
        };
        
        const headers = ['Data', 'Dia da Semana', 'Funcionário', 'Tipo de Registro', 'Horário', 'Horas Normais do Dia', 'Horas Extras do Dia', 'Total Horas do Dia', 'Valor Normal', 'Valor Extra', 'Valor Total Dia'];
        const rows: (string | number)[][] = [headers];

        const sortedDateKeys = Object.keys(groupedByDateAndEmployee).sort((a, b) => {
            const dateA = new Date(groupedByDateAndEmployee[a].date).getTime();
            const dateB = new Date(groupedByDateAndEmployee[b].date).getTime();
            return dateA - dateB;
        });

        sortedDateKeys.forEach(date => {
            const employeeGroupsOnDate = groupedByDateAndEmployee[date].employees;
            Object.keys(employeeGroupsOnDate).forEach(employeeIdStr => {
                const employeeId = Number(employeeIdStr);
                const dailyEvents = employeeGroupsOnDate[employeeId];
                const workDetails = calculateWorkDetails(dailyEvents);
                
                dailyEvents.forEach(event => {
                    let normalHoursDisplay = '';
                    let extraHoursDisplay = '';
                    let totalHoursDisplay = '';
                    let normalPaymentDisplay = '';
                    let extraPaymentDisplay = '';
                    let totalPaymentDisplay = '';


                    if (event.type === ClockType.Saida && workDetails.status === 'complete') {
                       normalHoursDisplay = formatMilliseconds(workDetails.normal);
                       extraHoursDisplay = formatMilliseconds(workDetails.extra);
                       totalHoursDisplay = formatMilliseconds(workDetails.total);
                       normalPaymentDisplay = workDetails.payment.normal.toFixed(2).replace('.', ',');
                       extraPaymentDisplay = workDetails.payment.extra.toFixed(2).replace('.', ',');
                       totalPaymentDisplay = workDetails.payment.total.toFixed(2).replace('.', ',');
                    } else if (event.type === ClockType.Saida) {
                       totalHoursDisplay = "Incompleto";
                    }

                    const eventTimestamp = new Date(event.timestamp);
                    const row = [
                        eventTimestamp.toLocaleDateString('pt-BR'),
                        eventTimestamp.toLocaleDateString('pt-BR', { weekday: 'long' }),
                        event.employeeName,
                        event.type,
                        eventTimestamp.toLocaleTimeString('pt-BR'),
                        normalHoursDisplay,
                        extraHoursDisplay,
                        totalHoursDisplay,
                        normalPaymentDisplay,
                        extraPaymentDisplay,
                        totalPaymentDisplay
                    ];
                    rows.push(row);
                });
            });
        });

        if (rows.length > 1) {
            rows.push([]);
            rows.push(['', '', '', '', 'Resumo do Período:', 'Horas Normais', 'Horas Extras', 'Total Geral', 'Valor a Pagar']);
            rows.push([
                '', '', '', '', '',
                formatMilliseconds(periodTotals.normal),
                formatMilliseconds(periodTotals.extra),
                formatMilliseconds(periodTotals.total),
                periodTotals.payment.toFixed(2).replace('.', ',')
            ]);
        }

        if (selectedEmployeeId !== 'all') {
            const selectedEmployee = employees.find(e => e.id === parseInt(selectedEmployeeId, 10));
            if (selectedEmployee) {
                rows.push([]);
                rows.push([]);
                rows.push(["Declaro, para os devidos fins, que todas as informações constantes neste relatório correspondem fielmente aos dias, horários e atividades por mim realizadas, sem qualquer omissão."]);
                rows.push(["Reconheço que este documento reflete a totalidade das horas efetivamente trabalhadas na condição de prestador de serviços eventual, sem vínculo empregatício, e que estou ciente de que o pagamento será realizado com base nas horas aqui registradas."]);
                rows.push(["Declaro ainda que li e conferi os registros antes da assinatura, concordando integralmente com seu conteúdo, assumindo sua veracidade e exatidão."]);
                rows.push(["Por ser expressão da verdade, firmo o presente."]);
                rows.push([]);
                rows.push([`Nome do Prestador: ${selectedEmployee.name}`]);
                rows.push([]);
                rows.push(["Assinatura: __________________________________________________"]);
                rows.push(["Data: _______/_______/__________"]);
            }
        }


        const csvContent = rows.map(row => row.map(escapeCsvCell).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);

        const startDateStr = startDate.toLocaleDateString('sv-SE');
        const endDateStr = endDate.toLocaleDateString('sv-SE');
        const employeeName = selectedEmployeeId === 'all' ? 'todos' : (employees.find(e => e.id === parseInt(selectedEmployeeId, 10))?.name.replace(/\s+/g, '_') || 'desconhecido');
        
        link.setAttribute("download", `relatorio_ponto_${employeeName}_${startDateStr}_a_${endDateStr}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDeleteEventConfirmation = (eventId: number) => {
        if (window.confirm("Tem certeza que deseja excluir este registro? A ação não pode ser desfeita.")) {
            onDeleteEvent(eventId);
        }
    };
    
    const handleManualEntryChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setManualEntry(prev => ({ ...prev, [name]: value }));
    };

    const handleManualEntrySubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!manualEntry.employeeId || !manualEntry.date || !manualEntry.time || !manualEntry.type) {
            setManualEntryMessage({ text: 'Todos os campos são obrigatórios.', type: 'error' });
            return;
        }

        const [year, month, day] = manualEntry.date.split('-').map(Number);
        const [hours, minutes] = manualEntry.time.split(':').map(Number);
        
        const timestamp = new Date(year, month - 1, day, hours, minutes);

        const success = await onAddManualEvent({
            employeeId: parseInt(manualEntry.employeeId, 10),
            type: manualEntry.type as ClockType,
            timestamp,
        });

        if (success) {
            setManualEntryMessage({ text: 'Batida adicionada com sucesso!', type: 'success' });
        } else {
            setManualEntryMessage({ text: 'Falha ao adicionar. A batida pode ser duplicada.', type: 'error' });
        }

        setTimeout(() => setManualEntryMessage(null), 3000);
    };
    
    const handleRestoreFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const showMessage = (text: string, type: 'success' | 'error') => {
            setRestoreMessage({ text, type });
            setTimeout(() => setRestoreMessage(null), 7000);
        };

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') {
                    throw new Error("Falha ao ler o arquivo.");
                }
                const data = JSON.parse(text);

                if (!data || !Array.isArray(data.employees) || !Array.isArray(data.events)) {
                    throw new Error("Formato de arquivo de backup inválido.");
                }
                
                setBackupToRestore(data);
                setShowRestoreConfirm(true);

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
                showMessage(`Falha na restauração: ${errorMessage}`, 'error');
            } finally {
                 if (event.target) event.target.value = '';
            }
        };
        reader.onerror = () => {
            showMessage("Erro ao ler o arquivo de backup.", 'error');
            if (event.target) event.target.value = '';
        };
        reader.readAsText(file);
    };
    
    const handleConfirmRestore = async () => {
        if (!backupToRestore) return;

        const showMessage = (text: string, type: 'success' | 'error') => {
            setRestoreMessage({ text, type });
            setTimeout(() => setRestoreMessage(null), 7000);
        };
        
        const success = await onRestoreFromFile(backupToRestore);
        if (success) {
            showMessage("Backup restaurado com sucesso!", 'success');
        } else {
            showMessage("Ocorreu uma falha ao salvar os dados restaurados.", 'error');
        }
        
        setShowRestoreConfirm(false);
        setBackupToRestore(null);
    };
    
    const handleRestoreFromHistoryClick = async (backupEntry: BackupEntry) => {
        const confirmation = window.confirm(
            `ATENÇÃO: Você está prestes a restaurar os dados para o estado de ${new Date(backupEntry.timestamp).toLocaleString('pt-BR')}.\n\nTODOS os funcionários e registros de ponto atuais serão substituídos.\n\nEsta ação não pode ser desfeita. Deseja continuar?`
        );

        if (confirmation) {
            const showMessage = (text: string, type: 'success' | 'error') => {
                setRestoreMessage({ text, type });
                setTimeout(() => setRestoreMessage(null), 7000);
            };

            const success = await onRestoreFromHistory(backupEntry);
            if (success) {
                showMessage("Backup restaurado com sucesso!", 'success');
            } else {
                showMessage("Falha ao restaurar o backup.", 'error');
            }
        }
    };
    
    const handleConfirmLogout = () => {
        onDownloadBackup();
        onLogout();
    };


    const EditEventModal = () => {
        if (!editingEvent) return null;

        const [newTime, setNewTime] = useState(() => 
            new Date(editingEvent.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
        );

        const handleSave = () => {
            const [hours, minutes] = newTime.split(':').map(Number);
            const updatedTimestamp = new Date(editingEvent.timestamp);
            updatedTimestamp.setHours(hours, minutes, 0, 0);
            
            onUpdateEvent(editingEvent.id, updatedTimestamp);
            setEditingEvent(null);
        };

        return (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-800 rounded-xl shadow-2xl p-6 space-y-4 w-full max-w-sm animate-fade-in">
                    <h3 className="text-xl font-bold text-cyan-300">Editar Registro</h3>
                    <div className="text-gray-300 space-y-1">
                        <p><strong>Funcionário:</strong> {editingEvent.employeeName}</p>
                        <p><strong>Data:</strong> {new Date(editingEvent.timestamp).toLocaleDateString('pt-BR')}</p>
                        <p><strong>Tipo:</strong> {editingEvent.type}</p>
                    </div>
                    <div>
                        <label htmlFor="event-time" className="block text-sm font-medium text-gray-300 mb-1">Novo Horário:</label>
                        <input 
                            type="time" 
                            id="event-time"
                            value={newTime}
                            onChange={(e) => setNewTime(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500"
                        />
                    </div>
                    <div className="flex justify-end gap-4 pt-4">
                        <button onClick={() => setEditingEvent(null)} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                            Cancelar
                        </button>
                        <button onClick={handleSave} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                            Salvar
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const EditEmployeeModal = () => {
        if (!editingEmployee) return null;

        const [formData, setFormData] = useState<Employee>(editingEmployee);
        const [editError, setEditError] = useState('');

        const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const { name, value } = e.target;
             if (name === 'pin' && value.length > PIN_LENGTH) return;
            setFormData(prev => ({ ...prev, [name]: value }));
        };

        const handleSave = () => {
            if (!formData.name || !formData.phone || formData.pin.length !== PIN_LENGTH) {
                setEditError('Todos os campos são obrigatórios e o PIN deve ter 4 dígitos.');
                return;
            }
            if (employees.some(emp => emp.id !== formData.id && emp.pin === formData.pin) || (admin.id !== formData.id && admin.pin === formData.pin)) {
                setEditError('Este PIN já está em uso por outro funcionário.');
                return;
            }

            onUpdateEmployee(formData);
            setEditingEmployee(null);
        };

        return (
             <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-800 rounded-xl shadow-2xl p-6 space-y-4 w-full max-w-md animate-fade-in">
                    <h3 className="text-xl font-bold text-cyan-300">Editar Funcionário</h3>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="edit-name" className="block text-sm font-medium text-gray-300 mb-1">Nome Completo</label>
                            <input type="text" name="name" id="edit-name" value={formData.name} onChange={handleFormChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500"/>
                        </div>
                        <div>
                            <label htmlFor="edit-phone" className="block text-sm font-medium text-gray-300 mb-1">Telefone</label>
                            <input type="tel" name="phone" id="edit-phone" value={formData.phone} onChange={handleFormChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500"/>
                        </div>
                        <div>
                            <label htmlFor="edit-pin" className="block text-sm font-medium text-gray-300 mb-1">PIN</label>
                            <input type="password" name="pin" id="edit-pin" value={formData.pin} onChange={handleFormChange} maxLength={4} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500" />
                        </div>
                    </div>
                    {editError && <p className="text-red-400 text-sm text-center pt-2">{editError}</p>}
                    <div className="flex justify-end gap-4 pt-4">
                        <button onClick={() => setEditingEmployee(null)} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                            Cancelar
                        </button>
                        <button onClick={handleSave} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                            Salvar Alterações
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const AddBreakModal = () => {
        if (!showAddBreakModal) return null;

        const [startTime, setStartTime] = useState('12:00');
        const [endTime, setEndTime] = useState('13:00');
        const [error, setError] = useState('');
        const [isSaving, setIsSaving] = useState(false);

        const handleSave = async () => {
            setError('');
            setIsSaving(true);
            
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            if (startH > endH || (startH === endH && startM >= endM)) {
                setError('O horário de fim do intervalo deve ser após o início.');
                setIsSaving(false);
                return;
            }

            const startDate = new Date(showAddBreakModal.date);
            startDate.setHours(startH, startM, 0, 0);

            const endDate = new Date(showAddBreakModal.date);
            endDate.setHours(endH, endM, 0, 0);
            
            const dailyEventsForEmployee = allEvents.filter(e => 
                e.employeeId === showAddBreakModal.employeeId && 
                new Date(e.timestamp).toDateString() === showAddBreakModal.date.toDateString()
            );
            
            const entrada = dailyEventsForEmployee.find(e => e.type === ClockType.Entrada);
            const saida = dailyEventsForEmployee.find(e => e.type === ClockType.Saida);

            if (entrada && startDate.getTime() < new Date(entrada.timestamp).getTime()) {
                 setError('O início do intervalo não pode ser antes da entrada.');
                 setIsSaving(false);
                 return;
            }
            if (saida && endDate.getTime() > new Date(saida.timestamp).getTime()) {
                 setError('O fim do intervalo não pode ser depois da saída.');
                 setIsSaving(false);
                 return;
            }

            const successStart = await onAddManualEvent({
                employeeId: showAddBreakModal.employeeId,
                type: ClockType.InicioIntervalo,
                timestamp: startDate,
            });

            if (!successStart) {
                setError('Falha ao adicionar início do intervalo. Pode ser um registro duplicado.');
                setIsSaving(false);
                return;
            }

            const successEnd = await onAddManualEvent({
                employeeId: showAddBreakModal.employeeId,
                type: ClockType.FimIntervalo,
                timestamp: endDate,
            });

             if (!successEnd) {
                setError('Falha ao adicionar fim do intervalo (início foi salvo). Pode ser um registro duplicado.');
                setIsSaving(false);
                return;
            }

            setShowAddBreakModal(null);
            setIsSaving(false);
        };

        return (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-800 rounded-xl shadow-2xl p-6 space-y-4 w-full max-w-sm animate-fade-in">
                    <h3 className="text-xl font-bold text-cyan-300">Adicionar Intervalo</h3>
                    <div className="text-gray-300 space-y-1">
                        <p><strong>Funcionário:</strong> {showAddBreakModal.employeeName}</p>
                        <p><strong>Data:</strong> {new Date(showAddBreakModal.date).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="break-start-time" className="block text-sm font-medium text-gray-300 mb-1">Início do Intervalo:</label>
                            <input 
                                type="time" 
                                id="break-start-time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500"
                            />
                        </div>
                        <div>
                            <label htmlFor="break-end-time" className="block text-sm font-medium text-gray-300 mb-1">Fim do Intervalo:</label>
                            <input 
                                type="time" 
                                id="break-end-time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500"
                            />
                        </div>
                    </div>
                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                    <div className="flex justify-end gap-4 pt-4">
                        <button onClick={() => setShowAddBreakModal(null)} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors" disabled={isSaving}>
                            Cancelar
                        </button>
                        <button onClick={handleSave} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-500" disabled={isSaving}>
                            {isSaving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };
    
    const LogoutConfirmationModal = () => (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl p-6 space-y-6 w-full max-w-md animate-fade-in text-center">
                <h3 className="text-xl font-bold text-cyan-300">Backup Obrigatório para Sair</h3>
                <p className="text-gray-300">
                    Para garantir a segurança dos dados, é obrigatório salvar um backup externo antes de sair do painel.
                </p>
                <div className="flex flex-col items-center gap-4 pt-4">
                    <button
                        onClick={handleConfirmLogout}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <DownloadIcon />
                        Salvar Backup e Sair
                    </button>
                    <button
                        onClick={() => setShowLogoutConfirm(false)}
                        className="text-gray-400 hover:text-white transition-colors text-sm pt-2"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
    
    const RestoreConfirmationModal = () => (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl p-6 space-y-6 w-full max-w-md animate-fade-in text-center">
                <h3 className="text-xl font-bold text-yellow-300">Confirmar Restauração</h3>
                <p className="text-gray-300">
                    ATENÇÃO: Restaurar este backup substituirá TODOS os funcionários e registros de ponto atuais.
                    <br/><br/>
                    <strong className="text-red-400">Esta ação não pode ser desfeita.</strong> Deseja continuar?
                </p>
                <div className="flex justify-center gap-4 pt-4">
                    <button
                        onClick={() => { setShowRestoreConfirm(false); setBackupToRestore(null); }}
                        className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirmRestore}
                        className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        Confirmar Restauração
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="bg-gray-800 rounded-xl shadow-2xl p-6 sm:p-8 space-y-8 animate-fade-in w-full max-w-4xl mx-auto">
            <EditEventModal />
            <EditEmployeeModal />
            <AddBreakModal />
            {showLogoutConfirm && <LogoutConfirmationModal />}
            {showRestoreConfirm && <RestoreConfirmationModal />}
            <div className="text-center">
                <h2 className="text-3xl font-bold text-cyan-300">{admin.name}</h2>
                <p className="text-gray-400">Painel Administrativo</p>
            </div>

            <div className="bg-gray-700/50 rounded-lg p-6 space-y-6">
                <h3 className="text-xl font-semibold border-b border-gray-600 pb-2">Gerenciamento de Funcionários</h3>
                <form onSubmit={handleAddEmployeeSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className='md:col-span-2'>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Nome Completo</label>
                        <input type="text" name="name" id="name" value={newEmployee.name} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500"/>
                    </div>
                    <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-1">Telefone</label>
                        <input type="tel" name="phone" id="phone" value={newEmployee.phone} onChange={handleInputChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500"/>
                    </div>
                    <div>
                        <label htmlFor="pin" className="block text-sm font-medium text-gray-300 mb-1">PIN</label>
                        <input type="password" name="pin" id="pin" value={newEmployee.pin} onChange={handleInputChange} maxLength={4} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500" />
                    </div>
                    <button type="submit" className="md:col-span-4 w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">Cadastrar Funcionário</button>
                    {formError && <p className="text-red-400 text-sm md:col-span-4 text-center">{formError}</p>}
                </form>

                <div className="pt-4 border-t border-gray-600">
                    <h4 className="text-lg font-semibold">Importação em Massa</h4>
                    <p className="text-sm text-gray-400 mb-2">Importe funcionários de um arquivo CSV. O cabeçalho do arquivo deve ser <strong>Nome,telefone,Pin</strong> (separado por vírgula ou ponto e vírgula).</p>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept=".csv"
                        className="hidden"
                        aria-hidden="true"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                    >
                        <UploadIcon />
                        Selecionar Arquivo CSV
                    </button>
                    {importMessage && (
                        <div className={`mt-2 text-center text-sm font-semibold p-2 rounded-md ${importMessage.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                            {importMessage.text}
                        </div>
                    )}
                </div>

                <div className="space-y-2 pt-4 border-t border-gray-600">
                    <h4 className="text-lg font-semibold">Funcionários Ativos</h4>
                    <ul className="space-y-2 max-h-40 overflow-y-auto pr-2">
                        {employees.map(emp => (
                            <li key={emp.id} className="flex justify-between items-center bg-gray-700 p-2 rounded-md">
                                <div>
                                    <span className="font-medium text-gray-200">{emp.name}</span>
                                    <span className="text-xs text-gray-400 ml-2"> (PIN: {emp.pin})</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <button onClick={() => setEditingEmployee(emp)} className="text-gray-400 hover:text-cyan-300 transition-colors" aria-label="Editar funcionário">
                                    <EditIcon className="h-5 w-5" />
                                  </button>
                                  <button onClick={() => handleDeleteClick(emp.id)} className="text-gray-400 hover:text-red-400 transition-colors" aria-label="Excluir funcionário">
                                     <DeleteIcon className="h-5 w-5" />
                                  </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="bg-gray-700/50 rounded-lg p-6 space-y-6">
                <h3 className="text-xl font-semibold border-b border-gray-600 pb-2">Backup & Restauração</h3>
                 <p className="text-sm text-gray-400">Backups são criados automaticamente a cada alteração. Para segurança extra, baixe um backup manual para guardar externamente.</p>
                 
                <div className="pt-4 border-t border-gray-600">
                    <h4 className="text-lg font-semibold">Backup Manual</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                         <button
                            onClick={onDownloadBackup}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                        >
                            <DatabaseIcon />
                            Baixar Backup (.json)
                        </button>
                         <button
                            onClick={() => restoreFileInputRef.current?.click()}
                            className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                        >
                            <UploadIcon />
                            Restaurar de Arquivo
                        </button>
                     </div>
                </div>

                 <input
                    type="file"
                    ref={restoreFileInputRef}
                    onChange={handleRestoreFileSelected}
                    accept=".json"
                    className="hidden"
                    aria-hidden="true"
                />

                <div className="pt-4 border-t border-gray-600">
                    <h4 className="text-lg font-semibold">Restaurar de Backup Automático</h4>
                     {backupHistory.length > 0 ? (
                        <ul className="space-y-2 max-h-40 overflow-y-auto pr-2 mt-2">
                            {backupHistory.map((backup, index) => (
                                <li key={backup.timestamp} className="flex justify-between items-center bg-gray-700 p-2 rounded-md">
                                    <div>
                                        <span className="font-medium text-gray-200">Backup #{index + 1}</span>
                                        <span className="text-xs text-gray-400 ml-2">
                                            {new Date(backup.timestamp).toLocaleString('pt-BR')}
                                        </span>
                                    </div>
                                    <button onClick={() => handleRestoreFromHistoryClick(backup)} className="bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold py-1 px-3 rounded-lg transition-colors">
                                        Restaurar
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500 text-center py-4">Nenhum backup automático encontrado.</p>
                    )}
                </div>

                 {restoreMessage && (
                    <div className={`mt-2 text-center text-sm font-semibold p-2 rounded-md ${restoreMessage.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                        {restoreMessage.text}
                    </div>
                )}
            </div>

            <div className="bg-gray-700/50 rounded-lg p-6 space-y-6">
                <h3 className="text-xl font-semibold border-b border-gray-600 pb-2">Lançamento Manual de Batida</h3>
                <form onSubmit={handleManualEntrySubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className='md:col-span-4'>
                        <label htmlFor="manual-employeeId" className="block text-sm font-medium text-gray-300 mb-1">Funcionário</label>
                        <select name="employeeId" id="manual-employeeId" value={manualEntry.employeeId} onChange={handleManualEntryChange} required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500">
                            <option value="" disabled>Selecione...</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="manual-date" className="block text-sm font-medium text-gray-300 mb-1">Data</label>
                        <input type="date" name="date" id="manual-date" value={manualEntry.date} onChange={handleManualEntryChange} required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500"/>
                    </div>
                    <div>
                        <label htmlFor="manual-time" className="block text-sm font-medium text-gray-300 mb-1">Horário</label>
                        <input type="time" name="time" id="manual-time" value={manualEntry.time} onChange={handleManualEntryChange} required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500" />
                    </div>
                    <div className='md:col-span-2'>
                        <label htmlFor="manual-type" className="block text-sm font-medium text-gray-300 mb-1">Tipo</label>
                        <select name="type" id="manual-type" value={manualEntry.type} onChange={handleManualEntryChange} required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500">
                            {Object.values(ClockType).map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>
                    <button type="submit" className="md:col-span-4 w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 mt-2">
                        Lançar Batida
                    </button>
                    {manualEntryMessage && (
                        <div className={`md:col-span-4 text-center text-sm font-semibold p-2 rounded-md ${manualEntryMessage.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                            {manualEntryMessage.text}
                        </div>
                    )}
                </form>
            </div>


            <div className="bg-gray-700/50 rounded-lg p-6 space-y-4">
                <div>
                    <h3 className="text-xl font-semibold border-b border-gray-600 pb-2">Relatório de Pontos</h3>
                    <div className="space-y-4 mt-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="start-date" className="block text-sm font-medium text-gray-300 mb-1">De:</label>
                                <input type="date" id="start-date" value={formatDateForInput(startDate)} onChange={(e) => handleDateChange(e, setStartDate)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500"/>
                            </div>
                            <div>
                                <label htmlFor="end-date" className="block text-sm font-medium text-gray-300 mb-1">Até:</label>
                                <input type="date" id="end-date" value={formatDateForInput(endDate)} onChange={(e) => handleDateChange(e, setEndDate)} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500"/>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="employee-filter" className="block text-sm font-medium text-gray-300 mb-1">Funcionário:</label>
                            <select 
                                id="employee-filter"
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:ring-cyan-500 focus:border-cyan-500"
                            >
                                <option value="all">Todos os funcionários</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-4 mt-4">
                    <h4 className="text-lg font-semibold text-center text-cyan-300 mb-3">Resumo do Período</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
                        <div>
                            <p className="text-sm text-gray-400">Horas Normais</p>
                            <p className="text-xl font-bold text-white">{formatMilliseconds(periodTotals.normal)}</p>
                        </div>
                        <div className="md:border-x border-gray-600">
                            <p className="text-sm text-gray-400">Horas Extras</p>
                            <p className="text-xl font-bold text-green-400">{formatMilliseconds(periodTotals.extra)}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">Total de Horas</p>
                            <p className="text-xl font-bold text-cyan-300">{formatMilliseconds(periodTotals.total)}</p>
                        </div>
                    </div>
                     <div className="border-t border-gray-600 mt-4 pt-4 text-center">
                        <p className="text-sm text-gray-400">Valor a Pagar (Período)</p>
                        <p className="text-2xl font-bold text-emerald-400">{formatCurrency(periodTotals.payment)}</p>
                    </div>
                </div>

                 <button
                    onClick={handleExportCSV}
                    disabled={filteredEvents.length === 0}
                    className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <DownloadIcon />
                    Exportar para CSV
                </button>
                
                {filteredEvents.length > 0 ? (
                     <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2">
                        {dateKeys.map((date) => (
                             <div key={date}>
                                <h4 className="text-lg font-semibold text-cyan-300 my-2 sticky top-0 bg-gray-700/50 backdrop-blur-sm py-2 capitalize border-b border-gray-600">{date}</h4>
                                <div className="space-y-3 pt-2">
                                  {Object.keys(groupedByDateAndEmployee[date].employees).map((employeeId) => {
                                      const dailyEvents = groupedByDateAndEmployee[date].employees[Number(employeeId)];
                                      const employeeName = dailyEvents[0]?.employeeName || 'Desconhecido';
                                      const workDetails = calculateWorkDetails(dailyEvents);
                                      const hasEntrada = dailyEvents.some(e => e.type === ClockType.Entrada);
                                      const hasIntervalo = dailyEvents.some(e => e.type === ClockType.InicioIntervalo);

                                      return (
                                          <div key={employeeId} className="bg-gray-700 p-3 rounded-lg">
                                              <div className="flex justify-between items-start mb-2 pb-2 border-b border-gray-600">
                                                  <span className="font-bold text-white pt-1">{employeeName}</span>
                                                  {renderWorkDetails(workDetails)}
                                              </div>
                                              <ul className="space-y-1">
                                                  {dailyEvents.map((event) => (
                                                      <li key={event.id} className="flex justify-between items-center text-sm group">
                                                          <span className="text-gray-300">{event.type}</span>
                                                          <div className="flex items-center gap-2">
                                                              <span className="font-mono text-gray-400">
                                                                  {new Date(event.timestamp).toLocaleTimeString('pt-BR')}
                                                              </span>
                                                              <button onClick={() => setEditingEvent(event)} className="text-gray-500 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Editar registro">
                                                                  <EditIcon className="h-4 w-4" />
                                                              </button>
                                                              <button onClick={() => handleDeleteEventConfirmation(event.id)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Excluir registro">
                                                                  <DeleteIcon className="h-4 w-4" />
                                                              </button>
                                                          </div>
                                                      </li>
                                                  ))}
                                              </ul>
                                              {hasEntrada && !hasIntervalo && (
                                                <div className="mt-3 pt-3 border-t border-gray-600">
                                                    <button
                                                        onClick={() => setShowAddBreakModal({ employeeId: Number(employeeId), employeeName, date: groupedByDateAndEmployee[date].date })}
                                                        className="w-full text-xs bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Adicionar Intervalo Faltante
                                                    </button>
                                                </div>
                                              )}
                                          </div>
                                      );
                                  })}
                                </div>
                             </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 text-center py-4">Nenhum registro encontrado para o período e filtro selecionados.</p>
                )}
            </div>

            <button onClick={() => setShowLogoutConfirm(true)} className="w-full flex items-center justify-center gap-2 bg-gray-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200">
                <LogoutIcon />
                Sair
            </button>
        </div>
    );
};

export default AdminDashboard;
