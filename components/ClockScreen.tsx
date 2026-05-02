
import React, { useMemo, useState } from 'react';
import type { Employee, StoredClockEvent } from '../types';
import { ClockType } from '../types';
import Clock from './Clock';
import { ClockInIcon, CoffeeIcon, LogoutIcon, PlayIcon, StopIcon } from './Icons';

// Função para formatar hora
// O banco converte timestamps com offset para UTC, então usamos getUTC* para exibir
const formatBrasiliaTime = (timestamp: string | Date): string => {
    const date = new Date(timestamp);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};

interface ClockScreenProps {
    employee: Employee;
    onLogout: () => void;
    events: StoredClockEvent[];
    onAddEvent: (type: ClockType) => Promise<void>;
}

const ClockScreen: React.FC<ClockScreenProps> = ({ employee, onLogout, events, onAddEvent }) => {
    const [isSuccess, setIsSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [processingType, setProcessingType] = useState<ClockType | null>(null);

    const lastEvent = events.length > 0 ? events[events.length - 1] : null;

    const handleClockEvent = async (type: ClockType) => {
        if (isSuccess || processingType) return;

        setProcessingType(type);
        try {
            await onAddEvent(type);
            setSuccessMessage(`Registro de "${type}" realizado com sucesso!`);
            setIsSuccess(true);
            setTimeout(() => {
                onLogout();
            }, 2000);
        } catch (error: any) {
            console.error("Erro ao registrar ponto:", error);
            // Se o erro vier da API como string ou objeto com mensagem
            alert(error.message || "Erro ao registrar o ponto. Tente novamente.");
            setProcessingType(null);
        }
    };

    const enabledActions = useMemo(() => {
        if (!events || events.length === 0) return [ClockType.Entrada];

        const todayEvents = events
            .filter(e => new Date(e.timestamp).toDateString() === new Date().toDateString())
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        if (todayEvents.length === 0) return [ClockType.Entrada];

        const lastTodayEvent = todayEvents[todayEvents.length - 1];

        switch (lastTodayEvent.type) {
            case ClockType.Entrada:
                return [ClockType.InicioIntervalo, ClockType.Saida];
            case ClockType.InicioIntervalo:
                return [ClockType.FimIntervalo];
            case ClockType.FimIntervalo:
                return [ClockType.InicioIntervalo, ClockType.Saida];
            case ClockType.Saida:
                return []; // No actions after clocking out for the day
            default:
                return [];
        }
    }, [events]);

    const getButtonClass = (type: ClockType) => {
        let baseClass = "action-btn";
        
        switch (type) {
            case ClockType.Entrada: baseClass += " bg-entrada"; break;
            case ClockType.InicioIntervalo: baseClass += " bg-inicio-intervalo"; break;
            case ClockType.FimIntervalo: baseClass += " bg-fim-intervalo"; break;
            case ClockType.Saida: baseClass += " bg-saida"; break;
        }

        return baseClass;
    }

    const todayEvents = useMemo(() => {
        return [...events]
            .filter(e => new Date(e.timestamp).toDateString() === new Date().toDateString())
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()); // Ordem crescente (mais antigo primeiro)
    }, [events]);

    return (
        <div className="glass-panel w-full max-w-md mx-auto animate-fade-in flex flex-col space-y-6">
            <div className="text-center mt-2">
                <h2 className="text-gold text-2xl font-bold" style={{textTransform: 'uppercase'}}>{employee.name}</h2>
                <p className="text-muted text-sm mt-1">Bem-vindo(a)!</p>
            </div>
            
            <Clock />

            {isSuccess ? (
                <div className="flex flex-col items-center justify-center text-center py-8 space-y-4 animate-fade-in">
                    <svg xmlns="http://www.w3.org/2000/svg" style={{width: '64px', height: '64px', color: 'var(--color-emerald)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-xl font-semibold">{successMessage}</h3>
                    <p className="text-muted">Redirecionando...</p>
                </div>
            ) : (
                <div className="flex flex-col space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <button className={getButtonClass(ClockType.Entrada)} disabled={!enabledActions.includes(ClockType.Entrada) || !!processingType} onClick={() => handleClockEvent(ClockType.Entrada)}>
                            {processingType === ClockType.Entrada ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 mr-2 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    <span>Aguarde...</span>
                                </>
                            ) : (
                                <>
                                    <PlayIcon />
                                    <span>{ClockType.Entrada}</span>
                                </>
                            )}
                        </button>
                        <button className={getButtonClass(ClockType.InicioIntervalo)} disabled={!enabledActions.includes(ClockType.InicioIntervalo) || !!processingType} onClick={() => handleClockEvent(ClockType.InicioIntervalo)}>
                            {processingType === ClockType.InicioIntervalo ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 mr-2 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    <span>Aguarde...</span>
                                </>
                            ) : (
                                <>
                                    <CoffeeIcon />
                                    <span>{ClockType.InicioIntervalo}</span>
                                </>
                            )}
                        </button>
                        <button className={getButtonClass(ClockType.FimIntervalo)} disabled={!enabledActions.includes(ClockType.FimIntervalo) || !!processingType} onClick={() => handleClockEvent(ClockType.FimIntervalo)}>
                            {processingType === ClockType.FimIntervalo ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 mr-2 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    <span>Aguarde...</span>
                                </>
                            ) : (
                                <>
                                    <ClockInIcon />
                                    <span>{ClockType.FimIntervalo}</span>
                                </>
                            )}
                        </button>
                        <button className={getButtonClass(ClockType.Saida)} disabled={!enabledActions.includes(ClockType.Saida) || !!processingType} onClick={() => handleClockEvent(ClockType.Saida)}>
                            {processingType === ClockType.Saida ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 mr-2 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    <span>Aguarde...</span>
                                </>
                            ) : (
                                <>
                                    <StopIcon />
                                    <span className="notranslate" translate="no">{ClockType.Saida}</span>
                                </>
                            )}
                        </button>
                    </div>

                    <div className="flex flex-col space-y-3">
                        <h3 className="text-lg font-semibold text-muted" style={{borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem'}}>Registros de Hoje</h3>
                        {todayEvents.length > 0 ? (
                            <ul className="flex flex-col space-y-2 pr-2" style={{maxHeight: '10rem', overflowY: 'auto'}}>
                                {todayEvents.map((event, index) => (
                                    <li key={index} className="list-item">
                                        <span className="font-semibold text-sm" style={{color: '#d1d5db'}}>{event.type}</span>
                                        <span className="font-mono text-gold text-sm font-bold">{formatBrasiliaTime(event.timestamp)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-muted text-center py-4 text-sm" style={{fontStyle: 'italic'}}>Nenhum registro ainda.</p>
                        )}
                    </div>

                    <button onClick={onLogout} className="btn w-full" style={{backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--color-red)'}} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-red-hover)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}>
                        <LogoutIcon />
                        Sair (Voltar)
                    </button>
                </div>
            )}
        </div>
    );
};

export default React.memo(ClockScreen);
