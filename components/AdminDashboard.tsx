// Arquivo temporário - será usado para substituir AdminDashboard.tsx
// Removidas todas as funcionalidades de backup/restore que não são mais necessárias com Vercel KV

import React, { useState, useMemo, useRef } from 'react';
import type { Employee, StoredClockEvent, AppState } from '../types';
import { ClockType } from '../types';
import { PIN_LENGTH } from '../constants';
import { LogoutIcon, EditIcon, DownloadIcon, DeleteIcon, UploadIcon } from './Icons';

interface AdminDashboardProps {
  admin: Employee;
  allEvents: StoredClockEvent[];
  employees: Employee[];
  onAddEmployee: (employee: Omit<Employee, 'id'>) => void;
  onDeleteEmployee: (id: number) => void;
  onUpdateEmployee: (employee: Employee) => void;
  onImportEmployees: (employees: Omit<Employee, 'id'>[]) => Promise<{ added: number, updated: number, errors: string[] }>;
  onLogout: () => void;
  onUpdateEvent: (eventId: number, newTimestamp: Date) => void;
  onAddManualEvent: (details: { employeeId: number; type: ClockType; timestamp: Date; }) => Promise<boolean>;
  onDeleteEvent: (eventId: number) => void;
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

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
    admin, 
    allEvents, 
    employees, 
    onAddEmployee, 
    onDeleteEmployee, 
    onUpdateEmployee, 
    onImportEmployees, 
    onLogout, 
    onUpdateEvent, 
    onAddManualEvent, 
    onDeleteEvent, 
    onDownloadBackup 
}) => {
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
    
    const [startDate, setStartDate] = useState<string>(() => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        return firstDay.toISOString().split('T')[0];
    });
    
    const [endDate, setEndDate] = useState<string>(() => {
        const now = new Date();
        return now.toISOString().split('T')[0];
    });

    const [newEmployee, setNewEmployee] = useState({ name: '', pin: '', phone: '' });
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [importMessage, setImportMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showAddBreakModal, setShowAddBreakModal] = useState<{employeeId: number, employeeName: string, date: Date} | null>(null);

    // Estados para lançamento manual
    const [manualEmployeeId, setManualEmployeeId] = useState<string>('');
    const [manualDate, setManualDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [manualTime, setManualTime] = useState<string>('09:00');
    const [manualType, setManualType] = useState<ClockType>(ClockType.Entrada);

    const handleAddEmployee = () => {
        if (!newEmployee.name || !newEmployee.pin || !newEmployee.phone) {
            alert('Preencha todos os campos');
            return;
        }
        if (newEmployee.pin.length !== PIN_LENGTH) {
            alert(`O PIN deve ter ${PIN_LENGTH} dígitos`);
            return;
        }
        onAddEmployee(newEmployee);
        setNewEmployee({ name: '', pin: '', phone: '' });
    };

    const handleUpdateEmployee = () => {
        if (!editingEmployee) return;
        if (!editingEmployee.name || !editingEmployee.pin || !editingEmployee.phone) {
            alert('Preencha todos os campos');
            return;
        }
        if (editingEmployee.pin.length !== PIN_LENGTH) {
            alert(`O PIN deve ter ${PIN_LENGTH} dígitos`);
            return;
        }
        onUpdateEmployee(editingEmployee);
        setEditingEmployee(null);
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const showMessage = (text: string, type: 'success' | 'error') => {
            setImportMessage({ text, type });
            setTimeout(() => setImportMessage(null), 7000);
        };

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                const lines = text.trim().split('\n');
                
                if (lines.length < 2) {
                    throw new Error("Arquivo CSV vazio ou inválido.");
                }

                const header = lines[0].toLowerCase();
                if (!header.includes('nome') || !header.includes('telefone') || !header.includes('pin')) {
                    throw new Error("Cabeçalho do CSV inválido. Esperado: Nome,telefone,Pin");
                }

                const employeesToImport: Omit<Employee, 'id'>[] = [];
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const parts = line.split(/[,;]/).map(p => p.trim());
                    if (parts.length < 3) {
                        throw new Error(`Linha ${i + 1} inválida: dados insuficientes.`);
                    }

                    const [name, phone, pin] = parts;
                    if (!name || !phone || !pin) {
                        throw new Error(`Linha ${i + 1} inválida: campos vazios.`);
                    }

                    if (pin.length !== PIN_LENGTH) {
                        throw new Error(`Linha ${i + 1}: PIN deve ter ${PIN_LENGTH} dígitos.`);
                    }

                    employeesToImport.push({ name, phone, pin });
                }

                if (employeesToImport.length === 0) {
                    throw new Error("Nenhum funcionário válido encontrado no arquivo.");
                }

                const result = await onImportEmployees(employeesToImport);
                
                if (result.errors.length > 0) {
                    showMessage(result.errors.join(' '), 'error');
                } else {
                    showMessage(
                        `Importação concluída! ${result.added} adicionado(s), ${result.updated} atualizado(s).`,
                        'success'
                    );
                }

                if (event.target) event.target.value = '';
            } catch (error: any) {
                showMessage(error.message || "Erro ao processar o arquivo CSV.", 'error');
                if (event.target) event.target.value = '';
            }
        };
        reader.onerror = () => {
            showMessage("Erro ao ler o arquivo.", 'error');
            if (event.target) event.target.value = '';
        };
        reader.readAsText(file);
    };

    const handleLaunchManualEvent = async () => {
        if (!manualEmployeeId) {
            alert('Selecione um funcionário');
            return;
        }

        const dateTime = new Date(`${manualDate}T${manualTime}`);
        const success = await onAddManualEvent({
            employeeId: parseInt(manualEmployeeId),
            type: manualType,
            timestamp: dateTime
        });

        if (success) {
            alert('Batida lançada com sucesso!');
        } else {
            alert('Erro ao lançar batida (possível duplicata)');
        }
    };

    const filteredEvents = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        return allEvents.filter(event => {
            const eventDate = new Date(event.timestamp);
            const matchesDate = eventDate >= start && eventDate <= end;
            const matchesEmployee = selectedEmployeeId === 'all' || event.employeeId === parseInt(selectedEmployeeId);
            return matchesDate && matchesEmployee;
        });
    }, [allEvents, startDate, endDate, selectedEmployeeId]);

    const periodSummary = useMemo(() => {
        const employeeGroups: Record<number, StoredClockEvent[]> = {};
        
        filteredEvents.forEach(event => {
            if (!employeeGroups[event.employeeId]) {
                employeeGroups[event.employeeId] = [];
            }
            employeeGroups[event.employeeId].push(event);
        });

        const dailyGroups: Record<string, StoredClockEvent[]> = {};
        Object.values(employeeGroups).forEach(empEvents => {
            empEvents.forEach(event => {
                const dateKey = new Date(event.timestamp).toISOString().split('T')[0];
                if (!dailyGroups[dateKey]) {
                    dailyGroups[dateKey] = [];
                }
                dailyGroups[dateKey].push(event);
            });
        });

        let totalNormal = 0;
        let totalExtra = 0;
        let totalPayment = 0;

        Object.values(dailyGroups).forEach(dayEvents => {
            const details = calculateWorkDetails(dayEvents);
            if (details.status === 'complete') {
                totalNormal += details.normal;
                totalExtra += details.extra;
                totalPayment += details.payment.total;
            }
        });

        return {
            normalHours: formatMilliseconds(totalNormal),
            extraHours: formatMilliseconds(totalExtra),
            totalHours: formatMilliseconds(totalNormal + totalExtra),
            payment: formatCurrency(totalPayment)
        };
    }, [filteredEvents]);

    const handleExportCSV = () => {
        if (filteredEvents.length === 0) {
            alert('Nenhum registro para exportar');
            return;
        }

        const csvHeader = 'Data,Horário,Funcionário,Tipo\n';
        const csvRows = filteredEvents.map(event => {
            const date = new Date(event.timestamp);
            const dateStr = date.toLocaleDateString('pt-BR');
            const timeStr = date.toLocaleTimeString('pt-BR');
            return `${dateStr},${timeStr},${event.employeeName},${event.type}`;
        }).join('\n');

        const csvContent = csvHeader + csvRows;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `relatorio_ponto_${startDate}_${endDate}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const AddBreakModal = () => {
        if (!showAddBreakModal) return null;
        
        const { employeeId, employeeName, date } = showAddBreakModal;
        const [breakStart, setBreakStart] = useState('12:00');
        const [breakEnd, setBreakEnd] = useState('13:00');

        const handleAddBreak = async () => {
            const startDateTime = new Date(`${date.toISOString().split('T')[0]}T${breakStart}`);
            const endDateTime = new Date(`${date.toISOString().split('T')[0]}T${breakEnd}`);

            const success1 = await onAddManualEvent({
                employeeId,
                type: ClockType.InicioIntervalo,
                timestamp: startDateTime
            });

            const success2 = await onAddManualEvent({
                employeeId,
                type: ClockType.FimIntervalo,
                timestamp: endDateTime
            });

            if (success1 && success2) {
                alert('Intervalo adicionado com sucesso!');
                setShowAddBreakModal(null);
            } else {
                alert('Erro ao adicionar intervalo');
            }
        };

        return (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <div className="bg-stone-800 rounded-xl shadow-2xl p-6 space-y-4 w-full max-w-md">
                    <h3 className="text-xl font-bold text-amber-400">Adicionar Intervalo</h3>
                    <p className="text-gray-300">
                        Funcionário: <strong>{employeeName}</strong><br/>
                        Data: <strong>{date.toLocaleDateString('pt-BR')}</strong>
                    </p>
                    <div className="space-y-2">
                        <label className="block text-sm">Início do Intervalo</label>
                        <input 
                            type="time" 
                            value={breakStart} 
                            onChange={(e) => setBreakStart(e.target.value)}
                            className="w-full bg-emerald-800 text-white p-2 rounded"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm">Fim do Intervalo</label>
                        <input 
                            type="time" 
                            value={breakEnd} 
                            onChange={(e) => setBreakEnd(e.target.value)}
                            className="w-full bg-emerald-800 text-white p-2 rounded"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setShowAddBreakModal(null)}
                            className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white py-2 rounded"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleAddBreak}
                            className="flex-1 bg-cyan-600 hover:bg-amber-600 text-white py-2 rounded"
                        >
                            Adicionar
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-8">
            {showAddBreakModal && <AddBreakModal />}
            
            <div className="text-center">
                <h2 className="text-3xl font-bold text-amber-400">{admin.name}</h2>
                <p className="text-gray-400">Painel Administrativo</p>
            </div>

            {/* Gerenciamento de Funcionários */}
            <div className="bg-emerald-800/50 rounded-lg p-6 space-y-6">
                <h3 className="text-xl font-semibold border-b border-gray-600 pb-2">Gerenciamento de Funcionários</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="name" className="block text-sm mb-1">Nome Completo</label>
                        <input
                            id="name"
                            type="text"
                            value={newEmployee.name}
                            onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        />
                    </div>
                    <div>
                        <label htmlFor="phone" className="block text-sm mb-1">Telefone</label>
                        <input
                            id="phone"
                            type="tel"
                            value={newEmployee.phone}
                            onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        />
                    </div>
                    <div>
                        <label htmlFor="pin" className="block text-sm mb-1">PIN</label>
                        <input
                            id="pin"
                            type="password"
                            maxLength={PIN_LENGTH}
                            value={newEmployee.pin}
                            onChange={(e) => setNewEmployee({ ...newEmployee, pin: e.target.value })}
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        />
                    </div>
                </div>

                <button
                    onClick={handleAddEmployee}
                    className="w-full bg-cyan-600 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                    Cadastrar Funcionário
                </button>

                <div className="pt-4 border-t border-gray-600">
                    <h4 className="text-lg font-semibold mb-2">Importação em Massa</h4>
                    <p className="text-sm text-gray-400 mb-2">
                        Importe funcionários de um arquivo CSV. O cabeçalho do arquivo deve ser <strong>Nome,telefone,Pin</strong> (separado por vírgula ou ponto e vírgula).
                    </p>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <UploadIcon />
                        Selecionar Arquivo CSV
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".csv"
                        className="hidden"
                    />
                    {importMessage && (
                        <div className={`mt-2 text-center text-sm font-semibold p-2 rounded-md ${importMessage.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                            {importMessage.text}
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t border-gray-600">
                    <h4 className="text-lg font-semibold mb-2">Funcionários Ativos</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {employees.map(emp => (
                            <div key={emp.id} className="flex justify-between items-center bg-stone-800 p-3 rounded">
                                <div>
                                    <p className="font-semibold">{emp.name}</p>
                                    <p className="text-sm text-gray-400">PIN: {emp.pin}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setEditingEmployee(emp)}
                                        className="bg-blue-600 hover:bg-blue-500 p-2 rounded"
                                        title="Editar funcionário"
                                    >
                                        <EditIcon />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (confirm(`Deletar ${emp.name}?`)) {
                                                onDeleteEmployee(emp.id);
                                            }
                                        }}
                                        className="bg-red-600 hover:bg-red-500 p-2 rounded"
                                        title="Excluir funcionário"
                                    >
                                        <DeleteIcon />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {editingEmployee && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                        <div className="bg-stone-800 rounded-xl shadow-2xl p-6 space-y-4 w-full max-w-md">
                            <h3 className="text-xl font-bold text-amber-400">Editar Funcionário</h3>
                            <div>
                                <label className="block text-sm mb-1">Nome</label>
                                <input
                                    type="text"
                                    value={editingEmployee.name}
                                    onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                                    className="w-full bg-emerald-800 text-white p-2 rounded"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Telefone</label>
                                <input
                                    type="tel"
                                    value={editingEmployee.phone}
                                    onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                                    className="w-full bg-emerald-800 text-white p-2 rounded"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">PIN</label>
                                <input
                                    type="password"
                                    maxLength={PIN_LENGTH}
                                    value={editingEmployee.pin}
                                    onChange={(e) => setEditingEmployee({ ...editingEmployee, pin: e.target.value })}
                                    className="w-full bg-emerald-800 text-white p-2 rounded"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setEditingEmployee(null)}
                                    className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white py-2 rounded"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleUpdateEmployee}
                                    className="flex-1 bg-cyan-600 hover:bg-amber-600 text-white py-2 rounded"
                                >
                                    Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Lançamento Manual de Batida */}
            <div className="bg-emerald-800/50 rounded-lg p-6 space-y-4">
                <h3 className="text-xl font-semibold border-b border-gray-600 pb-2">Lançamento Manual de Batida</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label htmlFor="manual-employeeId" className="block text-sm mb-1">Funcionário</label>
                        <select
                            id="manual-employeeId"
                            value={manualEmployeeId}
                            onChange={(e) => setManualEmployeeId(e.target.value)}
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        >
                            <option value="">Selecione...</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="manual-date" className="block text-sm mb-1">Data</label>
                        <input
                            id="manual-date"
                            type="date"
                            value={manualDate}
                            onChange={(e) => setManualDate(e.target.value)}
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        />
                    </div>
                    <div>
                        <label htmlFor="manual-time" className="block text-sm mb-1">Horário</label>
                        <input
                            id="manual-time"
                            type="time"
                            value={manualTime}
                            onChange={(e) => setManualTime(e.target.value)}
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        />
                    </div>
                    <div>
                        <label htmlFor="manual-type" className="block text-sm mb-1">Tipo</label>
                        <select
                            id="manual-type"
                            value={manualType}
                            onChange={(e) => setManualType(e.target.value as ClockType)}
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        >
                            <option value={ClockType.Entrada}>{ClockType.Entrada}</option>
                            <option value={ClockType.InicioIntervalo}>{ClockType.InicioIntervalo}</option>
                            <option value={ClockType.FimIntervalo}>{ClockType.FimIntervalo}</option>
                            <option value={ClockType.Saida}>{ClockType.Saida}</option>
                        </select>
                    </div>
                </div>

                <button
                    onClick={handleLaunchManualEvent}
                    className="w-full bg-cyan-600 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                    Lançar Batida
                </button>
            </div>

            {/* Relatório de Pontos */}
            <div className="bg-emerald-800/50 rounded-lg p-6 space-y-4">
                <h3 className="text-xl font-semibold border-b border-gray-600 pb-2">Relatório de Pontos</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="start-date" className="block text-sm mb-1">De:</label>
                        <input
                            id="start-date"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        />
                    </div>
                    <div>
                        <label htmlFor="end-date" className="block text-sm mb-1">Até:</label>
                        <input
                            id="end-date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        />
                    </div>
                    <div>
                        <label htmlFor="employee-filter" className="block text-sm mb-1">Funcionário:</label>
                        <select
                            id="employee-filter"
                            value={selectedEmployeeId}
                            onChange={(e) => setSelectedEmployeeId(e.target.value)}
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        >
                            <option value="all">Todos os funcionários</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="bg-stone-800 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-amber-400 mb-4">Resumo do Período</h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <p className="text-sm text-gray-400">Horas Normais</p>
                            <p className="text-xl font-bold text-white">{periodSummary.normalHours}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">Horas Extras</p>
                            <p className="text-xl font-bold text-green-400">{periodSummary.extraHours}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">Total de Horas</p>
                            <p className="text-xl font-bold text-amber-500">{periodSummary.totalHours}</p>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-700 text-center">
                        <p className="text-sm text-gray-400">Valor a Pagar (Período)</p>
                        <p className="text-2xl font-bold text-green-400">{periodSummary.payment}</p>
                    </div>
                </div>

                <button
                    onClick={handleExportCSV}
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    <DownloadIcon />
                    Exportar para CSV
                </button>

                {filteredEvents.length === 0 ? (
                    <p className="text-center text-gray-400 py-4">Nenhum registro encontrado para o período e filtro selecionados.</p>
                ) : (
                    <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-stone-800 sticky top-0">
                                <tr>
                                    <th className="p-2 text-left">Data/Hora</th>
                                    <th className="p-2 text-left">Funcionário</th>
                                    <th className="p-2 text-left">Tipo</th>
                                    <th className="p-2 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEvents.map(event => (
                                    <tr key={event.id} className="border-b border-gray-700">
                                        <td className="p-2">
                                            {new Date(event.timestamp).toLocaleString('pt-BR')}
                                        </td>
                                        <td className="p-2">{event.employeeName}</td>
                                        <td className="p-2">{event.type}</td>
                                        <td className="p-2 text-center">
                                            <button
                                                onClick={() => {
                                                    if (confirm('Deletar este registro?')) {
                                                        onDeleteEvent(event.id);
                                                    }
                                                }}
                                                className="bg-red-600 hover:bg-red-500 p-1 rounded text-xs"
                                            >
                                                <DeleteIcon />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Botão de Sair */}
            <button
                onClick={onLogout}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
                <LogoutIcon />
                Sair
            </button>
        </div>
    );
};

// Comparação customizada para evitar re-renders desnecessários
const arePropsEqual = (prevProps: AdminDashboardProps, nextProps: AdminDashboardProps) => {
  // Compara employees por referência (se for o mesmo array, não re-renderiza)
  if (prevProps.employees !== nextProps.employees) return false;
  
  // Compara allEvents pelo ID do último evento
  const prevLastId = prevProps.allEvents.length > 0 ? prevProps.allEvents[prevProps.allEvents.length - 1].id : null;
  const nextLastId = nextProps.allEvents.length > 0 ? nextProps.allEvents[nextProps.allEvents.length - 1].id : null;
  
  if (prevLastId !== nextLastId || prevProps.allEvents.length !== nextProps.allEvents.length) {
    return false; // Eventos mudaram, precisa re-renderizar
  }
  
  // Demais props são funções que não mudam
  return true; // Props iguais, não re-renderiza
};

export default React.memo(AdminDashboard, arePropsEqual);
