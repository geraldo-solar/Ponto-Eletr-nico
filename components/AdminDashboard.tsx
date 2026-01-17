// Arquivo temporário - será usado para substituir AdminDashboard.tsx
// Removidas todas as funcionalidades de backup/restore que não são mais necessárias com Vercel KV

import React, { useState, useMemo, useRef } from 'react';
import type { Employee, StoredClockEvent, AppState } from '../types';
import { ClockType } from '../types';
import { PIN_LENGTH } from '../constants';
import { LogoutIcon, EditIcon, DownloadIcon, DeleteIcon, UploadIcon } from './Icons';
// Funções para formatar data/hora
// O banco converte timestamps com offset para UTC, então usamos getUTC* para exibir
const formatBrasiliaDateTime = (timestamp: string | Date): string => {
    const date = new Date(timestamp);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
};

const formatBrasiliaDate = (timestamp: string | Date): string => {
    const date = new Date(timestamp);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();

    return `${day}/${month}/${year}`;
};

const formatBrasiliaTime = (timestamp: string | Date): string => {
    const date = new Date(timestamp);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
};

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
    onRefresh: () => Promise<void>;
}

const API_BASE_URL = import.meta.env.PROD ? '' : 'http://localhost:3000';
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

/**
 * Agrupa eventos por turnos de trabalho.
 * Um turno começa com uma Entrada e termina com uma Saída.
 * Pode conter múltiplos intervalos e atravessar a meia-noite.
 */
const groupEventsByShifts = (events: StoredClockEvent[]): StoredClockEvent[][] => {
    // Ordenar eventos por timestamp
    const sorted = [...events].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const shifts: StoredClockEvent[][] = [];
    let currentShift: StoredClockEvent[] = [];
    let shiftStarted = false;

    for (const event of sorted) {
        if (event.type === ClockType.Entrada && !shiftStarted) {
            // Início de um novo turno
            currentShift = [event];
            shiftStarted = true;
        } else if (shiftStarted) {
            // Adicionar evento ao turno atual
            currentShift.push(event);

            if (event.type === ClockType.Saida) {
                // Fim do turno
                shifts.push(currentShift);
                currentShift = [];
                shiftStarted = false;
            }
        }
    }

    // Se houver um turno incompleto (sem saída), adicionar também
    if (currentShift.length > 0) {
        shifts.push(currentShift);
    }

    return shifts;
};

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
    onDownloadBackup,
    onRefresh
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

    const [newEmployee, setNewEmployee] = useState({ name: '', pin: '', phone: '', cpf: '', funcao: '', pix: '' });
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [restoreMessage, setRestoreMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const jsonBackupInputRef = useRef<HTMLInputElement>(null);
    const [showAddBreakModal, setShowAddBreakModal] = useState<{ employeeId: number, employeeName: string, date: Date } | null>(null);
    const [editingEvent, setEditingEvent] = useState<StoredClockEvent | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string, message: string, onConfirm: () => void } | null>(null);

    const openConfirmModal = (title: string, message: string, onConfirm: () => void) => {
        setConfirmModal({ isOpen: true, title, message, onConfirm });
    };

    const closeConfirmModal = () => {
        setConfirmModal(null);
    };

    // Estados para lançamento manual com persistência em localStorage
    const [manualEmployeeId, setManualEmployeeId] = useState<string>(() => {
        return localStorage.getItem('manualEmployeeId') || '';
    });
    const [manualDate, setManualDate] = useState<string>(() => {
        return localStorage.getItem('manualDate') || new Date().toISOString().split('T')[0];
    });
    const [manualTime, setManualTime] = useState<string>(() => {
        return localStorage.getItem('manualTime') || '09:00';
    });
    const [manualType, setManualType] = useState<ClockType>(() => {
        const saved = localStorage.getItem('manualType');
        return (saved as ClockType) || ClockType.Entrada;
    });

    // Sincronizar estados com localStorage
    React.useEffect(() => {
        localStorage.setItem('manualEmployeeId', manualEmployeeId);
    }, [manualEmployeeId]);

    React.useEffect(() => {
        localStorage.setItem('manualDate', manualDate);
    }, [manualDate]);

    React.useEffect(() => {
        localStorage.setItem('manualTime', manualTime);
    }, [manualTime]);

    React.useEffect(() => {
        localStorage.setItem('manualType', manualType);
    }, [manualType]);

    // Ordenar funcionários por nome para as listas
    const sortedEmployees = useMemo(() => {
        return [...employees].sort((a, b) => a.name.localeCompare(b.name));
    }, [employees]);

    const handleAddEmployee = () => {
        if (!newEmployee.name || !newEmployee.pin) {
            alert('Preencha os campos obrigatórios: Nome e PIN');
            return;
        }
        if (newEmployee.pin.length !== PIN_LENGTH) {
            alert(`O PIN deve ter ${PIN_LENGTH} dígitos`);
            return;
        }
        onAddEmployee(newEmployee);
        setNewEmployee({ name: '', pin: '', phone: '', cpf: '', funcao: '', pix: '' });
    };

    const handleUpdateEmployee = () => {
        if (!editingEmployee) return;
        if (!editingEmployee.name || !editingEmployee.pin) {
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

    const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const showMessage = (text: string, type: 'success' | 'error') => {
            setRestoreMessage({ text, type });
            setTimeout(() => setRestoreMessage(null), 10000);
        };

        // Confirmar com o usuário usando o modal customizado
        openConfirmModal(
            '⚠️ ATENÇÃO: Substituir Dados',
            'Esta ação irá SUBSTITUIR TODOS os dados atuais (funcionários e batidas) pelos dados do backup. Deseja continuar?',
            () => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const text = e.target?.result as string;
                        const backupData = JSON.parse(text);

                        if (!backupData.employees || !backupData.events) {
                            throw new Error("Arquivo de backup inválido. Esperado: {employees: [], events: []}");
                        }

                        showMessage('🔄 Restaurando backup... Aguarde.', 'success');

                        // Chamar API para restaurar backup
                        const response = await fetch('/api/restore-backup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(backupData)
                        });

                        if (!response.ok) {
                            const error = await response.json();
                            console.error('[handleRestoreBackup] Erro da API:', error);
                            throw new Error(error.error || 'Erro ao restaurar backup');
                        }

                        const result = await response.json();

                        showMessage(
                            `✅ Backup restaurado com sucesso! ${result.employeesCount} funcionários e ${result.eventsCount} batidas importados.`,
                            'success'
                        );

                        // Atualizar dados na interface
                        await onRefresh();

                        if (event.target) event.target.value = '';
                    } catch (error: any) {
                        showMessage(error.message || "Erro ao processar o arquivo de backup.", 'error');
                        if (event.target) event.target.value = '';
                    }
                };
                reader.onerror = () => {
                    showMessage("Erro ao ler o arquivo.", 'error');
                };
                reader.readAsText(file);
            }
        );

        if (event.target) event.target.value = '';
    };
    const handleLaunchManualEvent = async () => {
        if (!manualEmployeeId) {
            alert('Selecione um funcionário');
            return;
        }

        // Criar Date em UTC e ajustar para Brasília (GMT-3)
        const [year, month, day] = manualDate.split('-');
        const [hours, minutes] = manualTime.split(':');

        // Criar data em UTC com os valores inseridos
        const dateTime = new Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1, // Mês é 0-indexed
            parseInt(day),
            parseInt(hours),
            parseInt(minutes),
            0, // segundos
            0  // milissegundos
        ));

        // Adicionar 3 horas para compensar GMT-3 → UTC
        dateTime.setUTCHours(dateTime.getUTCHours() + 3);

        const success = await onAddManualEvent({
            employeeId: parseInt(manualEmployeeId),
            type: manualType,
            timestamp: dateTime
        });

        if (success) {
            console.log('[STICKY FORM] Antes:', { manualEmployeeId, manualDate, manualTime, manualType });

            // Manter funcionário e data, apenas avançar o horário e tipo
            // IMPORTANTE: Fazer TODAS as atualizações de estado ANTES do alert
            const [hours, minutes] = manualTime.split(':');
            const newHour = parseInt(hours);
            const newMinutes = parseInt(minutes);

            // Avançar 1 hora
            const nextHour = (newHour + 1) % 24;
            const newTime = `${String(nextHour).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;

            // Determinar próximo tipo
            let newType = ClockType.Entrada;
            if (manualType === ClockType.Entrada) {
                newType = ClockType.InicioIntervalo;
            } else if (manualType === ClockType.InicioIntervalo) {
                newType = ClockType.FimIntervalo;
            } else if (manualType === ClockType.FimIntervalo) {
                newType = ClockType.Saida;
            }

            // Atualizar estados ANTES do alert
            setManualTime(newTime);
            setManualType(newType);

            console.log('[STICKY FORM] Novos valores:', { manualEmployeeId, manualDate, newTime, newType });

            // Alert por último
            alert('Batida lançada com sucesso!');
        } else {
            alert('Erro ao lançar batida (possível duplicata)');
        }
    };

    const filteredEvents = useMemo(() => {
        // Criar timestamps UTC explícitos para evitar problemas de fuso horário
        const start = new Date(`${startDate}T00:00:00.000Z`);
        const end = new Date(`${endDate}T23:59:59.999Z`);

        return allEvents.filter(event => {
            const eventDate = new Date(event.timestamp);
            const matchesDate = eventDate >= start && eventDate <= end;
            const matchesEmployee = selectedEmployeeId === 'all' || event.employeeId === parseInt(selectedEmployeeId);
            return matchesDate && matchesEmployee;
        });
    }, [allEvents, startDate, endDate, selectedEmployeeId]);

    const periodSummary = useMemo(() => {
        console.log('[DEBUG] Calculando periodSummary');
        console.log('[DEBUG] filteredEvents:', filteredEvents);
        console.log('[DEBUG] filteredEvents.length:', filteredEvents.length);

        // Agrupar por funcionário primeiro
        const employeeGroups: Record<number, StoredClockEvent[]> = {};

        filteredEvents.forEach(event => {
            if (!employeeGroups[event.employeeId]) {
                employeeGroups[event.employeeId] = [];
            }
            employeeGroups[event.employeeId].push(event);
        });

        let totalNormal = 0;
        let totalExtra = 0;
        let totalPayment = 0;

        // Para cada funcionário, agrupar por turnos e calcular
        Object.values(employeeGroups).forEach(empEvents => {
            // Agrupar eventos deste funcionário por turnos
            const shifts = groupEventsByShifts(empEvents);

            // Calcular total para cada turno deste funcionário
            shifts.forEach(shiftEvents => {
                console.log('[DEBUG] shiftEvents:', shiftEvents);
                const details = calculateWorkDetails(shiftEvents);
                console.log('[DEBUG] details:', details);
                if (details.status === 'complete') {
                    totalNormal += details.normal;
                    totalExtra += details.extra;
                    totalPayment += details.payment.total;
                }
            });
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

        // Agrupar eventos por funcionário
        const employeeGroups: Record<number, StoredClockEvent[]> = {};
        filteredEvents.forEach(event => {
            if (!employeeGroups[event.employeeId]) {
                employeeGroups[event.employeeId] = [];
            }
            employeeGroups[event.employeeId].push(event);
        });

        let csvContent = `Período:,${startDate} a ${endDate}\n\n`;

        let grandTotalNormalMs = 0;
        let grandTotalExtraMs = 0;
        let grandTotalPayment = 0;

        // Ordenar funcionários por nome
        const sortedEmployees = Object.entries(employeeGroups).sort((a, b) => {
            return a[1][0].employeeName.localeCompare(b[1][0].employeeName);
        });

        sortedEmployees.forEach(([employeeId, empEvents]) => {
            const employee = employees.find(e => e.id === parseInt(employeeId));
            const funcao = employee?.funcao || '';
            const employeeName = empEvents[0].employeeName;

            // Cabeçalho do funcionário
            csvContent += `\n=== ${employeeName} - ${funcao} ===\n`;
            csvContent += `Data,Entrada,Início Intervalo,Fim Intervalo,Saída,Horas Normais,Horas Extras,Total Horas,Valor Dia\n`;

            // Agrupar eventos por data
            const eventsByDate: Record<string, StoredClockEvent[]> = {};
            empEvents.forEach(event => {
                const eventDate = new Date(event.timestamp);
                const dateKey = `${String(eventDate.getUTCFullYear())}-${String(eventDate.getUTCMonth() + 1).padStart(2, '0')}-${String(eventDate.getUTCDate()).padStart(2, '0')}`;
                if (!eventsByDate[dateKey]) {
                    eventsByDate[dateKey] = [];
                }
                eventsByDate[dateKey].push(event);
            });

            // Ordenar datas
            const sortedDates = Object.keys(eventsByDate).sort();

            let employeeTotalNormalMs = 0;
            let employeeTotalExtraMs = 0;
            let employeeTotalPayment = 0;

            sortedDates.forEach(dateKey => {
                const dayEvents = eventsByDate[dateKey];
                const shifts = groupEventsByShifts(dayEvents);

                let dayNormalMs = 0;
                let dayExtraMs = 0;
                let dayPayment = 0;

                // Coletar horários das batidas
                let entrada = '';
                let inicioIntervalo = '';
                let fimIntervalo = '';
                let saida = '';

                dayEvents.forEach(event => {
                    const time = formatBrasiliaTime(event.timestamp);
                    if (event.type === 'Entrada') entrada = time;
                    if (event.type === 'Início Intervalo') inicioIntervalo = time;
                    if (event.type === 'Fim Intervalo') fimIntervalo = time;
                    if (event.type === 'Saída') saida = time;
                });

                shifts.forEach(shiftEvents => {
                    const details = calculateWorkDetails(shiftEvents);
                    if (details.status === 'complete') {
                        dayNormalMs += details.normal;
                        dayExtraMs += details.extra;
                        dayPayment += details.payment.total;
                    }
                });

                employeeTotalNormalMs += dayNormalMs;
                employeeTotalExtraMs += dayExtraMs;
                employeeTotalPayment += dayPayment;

                // Formatar data para exibição
                const [year, month, day] = dateKey.split('-');
                const displayDate = `${day}/${month}/${year}`;

                csvContent += `${displayDate},${entrada},${inicioIntervalo},${fimIntervalo},${saida},${formatMilliseconds(dayNormalMs)},${formatMilliseconds(dayExtraMs)},${formatMilliseconds(dayNormalMs + dayExtraMs)},"${formatCurrency(dayPayment)}"\n`;
            });

            // Subtotal do funcionário - Garantindo 5 vírgulas para alinhar na coluna F (Horas Normais)
            csvContent += `SUBTOTAL ${employeeName},,,,,${formatMilliseconds(employeeTotalNormalMs)},${formatMilliseconds(employeeTotalExtraMs)},${formatMilliseconds(employeeTotalNormalMs + employeeTotalExtraMs)},"${formatCurrency(employeeTotalPayment)}"\n\n`;

            grandTotalNormalMs += employeeTotalNormalMs;
            grandTotalExtraMs += employeeTotalExtraMs;
            grandTotalPayment += employeeTotalPayment;
        });

        // Total geral - Também com 5 vírgulas iniciais para alinhar com a tabela
        csvContent += `\n\n=== TOTAL GERAL ===\n`;
        csvContent += `,,,,,Horas Normais,Horas Extras,Total de Horas,Valor Total a Pagar\n`;
        csvContent += `,,,,,${formatMilliseconds(grandTotalNormalMs)},${formatMilliseconds(grandTotalExtraMs)},${formatMilliseconds(grandTotalNormalMs + grandTotalExtraMs)},"${formatCurrency(grandTotalPayment)}"\n`;

        // Adicionar BOM UTF-8 para garantir codificação correta no Excel/Windows/Android
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `relatorio_detalhado_${startDate}_${endDate}.csv`;
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
                        Funcionário: <strong>{employeeName}</strong><br />
                        Data: <strong>{formatBrasiliaDate(date)}</strong>
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

    const EditEventModal = () => {
        if (!editingEvent) return null;

        const eventDate = new Date(editingEvent.timestamp);
        // Usar getUTC* já que o banco armazena em UTC
        const localYear = eventDate.getUTCFullYear();
        const localMonth = String(eventDate.getUTCMonth() + 1).padStart(2, '0');
        const localDay = String(eventDate.getUTCDate()).padStart(2, '0');
        const [editDate, setEditDate] = useState(`${localYear}-${localMonth}-${localDay}`);
        const [editTime, setEditTime] = useState(`${String(eventDate.getUTCHours()).padStart(2, '0')}:${String(eventDate.getUTCMinutes()).padStart(2, '0')}`);
        const [editType, setEditType] = useState(editingEvent.type);

        const handleSaveEdit = async () => {
            const [hours, minutes] = editTime.split(':');
            const newTimestamp = `${editDate}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00.000Z`;

            try {
                const response = await fetch(`${API_BASE_URL}/api/events`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: editingEvent.id,
                        type: editType,
                        timestamp: newTimestamp
                    })
                });

                if (response.ok) {
                    alert('Evento atualizado com sucesso!');
                    setEditingEvent(null);
                    onRefresh();
                } else {
                    const errorData = await response.json();
                    console.error('Erro da API:', errorData);
                    alert(`Erro ao atualizar evento: ${errorData.error || 'Erro desconhecido'}`);
                }
            } catch (error) {
                console.error('Erro ao atualizar evento:', error);
                alert(`Erro ao atualizar evento: ${error.message}`);
            }
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                <div className="bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4">
                    <h3 className="text-xl font-bold text-amber-400 mb-4">Editar Evento</h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Funcionário</label>
                            <input
                                type="text"
                                value={editingEvent.employeeName}
                                disabled
                                className="w-full p-2 bg-gray-700 text-gray-400 rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Data</label>
                            <input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                className="w-full p-2 bg-gray-700 text-white rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Horário</label>
                            <input
                                type="time"
                                value={editTime}
                                onChange={(e) => setEditTime(e.target.value)}
                                className="w-full p-2 bg-gray-700 text-white rounded"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Tipo</label>
                            <select
                                value={editType}
                                onChange={(e) => setEditType(e.target.value as ClockType)}
                                className="w-full p-2 bg-gray-700 text-white rounded"
                            >
                                <option value={ClockType.Entrada}>Entrada</option>
                                <option value={ClockType.InicioIntervalo}>Início Intervalo</option>
                                <option value={ClockType.FimIntervalo}>Fim Intervalo</option>
                                <option value={ClockType.Saida}>Saída</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-6">
                        <button
                            onClick={handleSaveEdit}
                            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded"
                        >
                            Salvar
                        </button>
                        <button
                            onClick={() => setEditingEvent(null)}
                            className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 pb-8">
            {showAddBreakModal && <AddBreakModal />}
            {editingEvent && <EditEventModal />}

            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-amber-400">{admin.name}</h2>
                <p className="text-gray-400">Painel Administrativo</p>
                <button
                    onClick={onRefresh}
                    className="mt-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors text-sm"
                >
                    🔄 Atualizar Dados
                </button>
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
                    <div>
                        <label htmlFor="cpf" className="block text-sm mb-1">CPF</label>
                        <input
                            id="cpf"
                            type="text"
                            value={newEmployee.cpf}
                            onChange={(e) => setNewEmployee({ ...newEmployee, cpf: e.target.value })}
                            placeholder="000.000.000-00"
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        />
                    </div>
                    <div>
                        <label htmlFor="funcao" className="block text-sm mb-1">Função</label>
                        <input
                            id="funcao"
                            type="text"
                            value={newEmployee.funcao}
                            onChange={(e) => setNewEmployee({ ...newEmployee, funcao: e.target.value })}
                            placeholder="Ex: Vendedor, Gerente"
                            className="w-full bg-stone-800 text-white p-2 rounded"
                        />
                    </div>
                    <div>
                        <label htmlFor="pix" className="block text-sm mb-1">PIX</label>
                        <input
                            id="pix"
                            type="text"
                            value={newEmployee.pix}
                            onChange={(e) => setNewEmployee({ ...newEmployee, pix: e.target.value })}
                            placeholder="CPF, e-mail, telefone ou chave aleatória"
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
                    <h4 className="text-lg font-semibold mb-2">Restaurar Backup Completo</h4>
                    <p className="text-sm text-gray-400 mb-2">
                        Restaure um backup completo (funcionários + batidas) de um arquivo JSON. <strong className="text-amber-400">⚠️ Isso irá substituir todos os dados atuais!</strong>
                    </p>
                    <button
                        onClick={() => jsonBackupInputRef.current?.click()}
                        className="w-full bg-blue-700 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <UploadIcon />
                        Restaurar Backup JSON
                    </button>
                    <input
                        type="file"
                        ref={jsonBackupInputRef}
                        onChange={handleRestoreBackup}
                        accept=".json"
                        className="hidden"
                    />
                    {restoreMessage && (
                        <div className={`mt-2 text-center text-sm font-semibold p-2 rounded-md ${restoreMessage.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                            {restoreMessage.text}
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t border-gray-600">
                    <h4 className="text-lg font-semibold mb-2">Funcionários Ativos</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {sortedEmployees.map(emp => (
                            <div key={emp.id} className="flex justify-between items-center bg-stone-800 p-3 rounded">
                                <div>
                                    <p className="font-semibold">{emp.name}</p>
                                    <p className="text-sm text-gray-400">PIN: {emp.pin}</p>
                                    {emp.funcao && <p className="text-sm text-gray-400">Função: {emp.funcao}</p>}
                                    {emp.cpf && <p className="text-sm text-gray-400">CPF: {emp.cpf}</p>}
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
                                            openConfirmModal(
                                                'Excluir Funcionário',
                                                `Deseja realmente excluir o funcionário ${emp.name}? Todos os seus registros também serão apagados.`,
                                                () => onDeleteEmployee(emp.id)
                                            );
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
                            <div>
                                <label className="block text-sm mb-1">CPF</label>
                                <input
                                    type="text"
                                    value={editingEmployee.cpf || ''}
                                    onChange={(e) => setEditingEmployee({ ...editingEmployee, cpf: e.target.value })}
                                    placeholder="000.000.000-00"
                                    className="w-full bg-emerald-800 text-white p-2 rounded"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Função</label>
                                <input
                                    type="text"
                                    value={editingEmployee.funcao || ''}
                                    onChange={(e) => setEditingEmployee({ ...editingEmployee, funcao: e.target.value })}
                                    placeholder="Ex: Vendedor, Gerente"
                                    className="w-full bg-emerald-800 text-white p-2 rounded"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">PIX</label>
                                <input
                                    type="text"
                                    value={editingEmployee.pix || ''}
                                    onChange={(e) => setEditingEmployee({ ...editingEmployee, pix: e.target.value })}
                                    placeholder="CPF, e-mail, telefone ou chave aleatória"
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
                            {sortedEmployees.map(emp => (
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
                            {sortedEmployees.map(emp => (
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
                                            {formatBrasiliaDateTime(event.timestamp)}
                                        </td>
                                        <td className="p-2">{event.employeeName}</td>
                                        <td className="p-2">{event.type}</td>
                                        <td className="p-2 text-center">
                                            <div className="flex gap-2 justify-center">
                                                <button
                                                    onClick={() => setEditingEvent(event)}
                                                    className="bg-blue-600 hover:bg-blue-500 p-1 rounded text-xs"
                                                    title="Editar evento"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        openConfirmModal(
                                                            'Confirmar Exclusão',
                                                            'Deseja realmente deletar este registro de ponto? Esta ação não pode ser desfeita.',
                                                            () => onDeleteEvent(event.id)
                                                        );
                                                    }}
                                                    className="bg-red-600 hover:bg-red-500 p-1 rounded text-xs"
                                                    title="Deletar evento"
                                                >
                                                    <DeleteIcon />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Confirmação Customizado */}
            {confirmModal && confirmModal.isOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-xl max-w-sm w-full p-6 shadow-2xl space-y-6 text-center">
                        <div>
                            <div className="bg-red-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <DeleteIcon />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">{confirmModal.title}</h3>
                            <p className="text-gray-400">{confirmModal.message}</p>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={closeConfirmModal}
                                className="flex-1 bg-stone-800 hover:bg-stone-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    confirmModal.onConfirm();
                                    closeConfirmModal();
                                }}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-red-900/20"
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <AddBreakModal />
            <EditEventModal />

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
