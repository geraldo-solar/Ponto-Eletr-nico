
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
    
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;

    const handleClockEvent = async (type: ClockType) => {
        if (isSuccess) return;
        await onAddEvent(type);
        setSuccessMessage(`Registro de "${type}" realizado com sucesso!`);
        setIsSuccess(true);
        setTimeout(() => {
            onLogout();
        }, 2000);
    };

    const enabledActions = useMemo(() => {
        if (!events || events.length === 0) return [ClockType.Entrada];
        
        const todayEvents = events
            .filter(e => new Date(e.timestamp).toDateString() === new Date().toDateString())
            .sort((a,b) => a.timestamp.getTime() - b.timestamp.getTime());

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
        const base = "w-full flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 text-white font-semibold space-y-2 aspect-square text-center";
        if (!enabledActions.includes(type)) {
            return `${base} bg-emerald-800 text-gray-500 cursor-not-allowed`;
        }
        switch(type) {
            case ClockType.Entrada: return `${base} bg-green-600 hover:bg-green-500`;
            case ClockType.InicioIntervalo: return `${base} bg-yellow-600 hover:bg-yellow-500`;
            case ClockType.FimIntervalo: return `${base} bg-blue-600 hover:bg-blue-500`;
            case ClockType.Saida: return `${base} bg-red-600 hover:bg-red-500`;
        }
    }
    
    const todayEvents = useMemo(() => {
        return [...events]
            .filter(e => new Date(e.timestamp).toDateString() === new Date().toDateString())
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()); // Ordem crescente (mais antigo primeiro)
    }, [events]);

    return (
        <div className="bg-stone-800 rounded-xl shadow-2xl p-6 sm:p-8 space-y-6 animate-fade-in w-full max-w-md mx-auto">
            <div className="text-center">
                <h2 className="text-3xl font-bold text-amber-400">{employee.name}</h2>
                <p className="text-gray-400">Bem-vindo(a)!</p>
            </div>
            <Clock />
            
            {isSuccess ? (
                <div className="flex flex-col items-center justify-center text-center py-8 space-y-4 animate-fade-in">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-xl font-semibold text-white">{successMessage}</h3>
                    <p className="text-gray-400">Redirecionando...</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        <button className={getButtonClass(ClockType.Entrada)} disabled={!enabledActions.includes(ClockType.Entrada)} onClick={() => handleClockEvent(ClockType.Entrada)}>
                            <PlayIcon />
                            <span>{ClockType.Entrada}</span>
                        </button>
                        <button className={getButtonClass(ClockType.InicioIntervalo)} disabled={!enabledActions.includes(ClockType.InicioIntervalo)} onClick={() => handleClockEvent(ClockType.InicioIntervalo)}>
                            <CoffeeIcon />
                            <span>{ClockType.InicioIntervalo}</span>
                        </button>
                        <button className={getButtonClass(ClockType.FimIntervalo)} disabled={!enabledActions.includes(ClockType.FimIntervalo)} onClick={() => handleClockEvent(ClockType.FimIntervalo)}>
                            <ClockInIcon />
                            <span>{ClockType.FimIntervalo}</span>
                        </button>
                        <button className={getButtonClass(ClockType.Saida)} disabled={!enabledActions.includes(ClockType.Saida)} onClick={() => handleClockEvent(ClockType.Saida)}>
                            <StopIcon />
                            <span className="notranslate" translate="no">{ClockType.Saida}</span>
                        </button>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-xl font-semibold border-b border-gray-600 pb-2">Registros de Hoje</h3>
                        {todayEvents.length > 0 ? (
                            <ul className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                {todayEvents.map((event, index) => (
                                    <li key={index} className="flex justify-between items-center bg-emerald-800 p-2 rounded-md text-sm">
                                        <span className="font-medium text-gray-300">{event.type}</span>
                                        <span className="font-mono text-amber-400">{formatBrasiliaTime(event.timestamp)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-gray-500 text-center py-4">Nenhum registro ainda.</p>
                        )}
                    </div>

                    <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200">
                        <LogoutIcon />
                        Sair
                    </button>
                </>
            )}
        </div>
    );
};

export default React.memo(ClockScreen);
