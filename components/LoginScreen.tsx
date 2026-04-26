import React, { useState, useEffect, useRef } from 'react';
import Clock from './Clock';
import Keypad from './Keypad';
import { PIN_LENGTH, ADMIN_USER } from '../constants';
import type { Employee, StoredClockEvent, ClockType } from '../types';

interface LoginScreenProps {
  onLogin: (employee: Employee) => void;
  employees: Employee[];
  events: StoredClockEvent[];
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, employees, events }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const isProcessing = useRef(false);
  const lastActionTime = useRef(0);

  // Função de formatação consistente com AdminDashboard
  const formatDateTime = (timestamp: string | Date): string => {
    const date = new Date(timestamp);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  };

  // Função para verificar se há batidas pendentes há mais de 12 horas
  const checkPendingClocks = (employeeId: number): { hasPending: boolean; lastEvent?: StoredClockEvent } => {
    // Filtrar eventos deste funcionário
    const employeeEvents = events.filter(e => e.employeeId === employeeId);
    if (employeeEvents.length === 0) return { hasPending: false };

    // Ordenar por timestamp (mais recente primeiro)
    const sorted = [...employeeEvents].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const lastEvent = sorted[0];
    const lastEventTime = new Date(lastEvent.timestamp).getTime();

    // Obter o "agora" no mesmo formato de UTC forçado que usamos no App.tsx
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const forcedNowUTC = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`).getTime();

    const hoursSinceLastEvent = (forcedNowUTC - lastEventTime) / (1000 * 60 * 60);

    // Se a última batida foi há mais de 14 horas E não é uma saída, há pendência
    // Aumentado para 14h para dar mais margem a turnos longos (ex: 12h + trocas)
    const hasPending = hoursSinceLastEvent > 14 && lastEvent.type !== 'Saída';

    return { hasPending, lastEvent };
  };

  useEffect(() => {
    if (pin.length === PIN_LENGTH && !isProcessing.current) {
      isProcessing.current = true;

      const allUsers = [...employees, ADMIN_USER];
      const employee = allUsers.find((emp) => emp.pin === pin);

      if (employee) {
        // Verificar se é admin (admin pode sempre entrar)
        if (employee.id === ADMIN_USER.id) {
          setError('');
          onLogin(employee);
          isProcessing.current = false;
          return;
        }

        // Verificar se há batidas pendentes
        const { hasPending, lastEvent } = checkPendingClocks(employee.id);

        if (hasPending) {
          const lastEventDate = formatDateTime(lastEvent!.timestamp);
          setError(`⚠️ Batida pendente desde ${lastEventDate}. Dirija-se ao setor de pessoal para regularizar.`);
          setTimeout(() => {
            setPin('');
            setError('');
            isProcessing.current = false;
          }, 5000); // 5 segundos para ler a mensagem
        } else {
          setError('');
          onLogin(employee);
          isProcessing.current = false;
        }
      } else {
        setError('PIN inválido. Tente novamente.');
        setTimeout(() => {
          setPin('');
          setError('');
          isProcessing.current = false;
        }, 1500);
      }
    }
  }, [pin, onLogin, employees, events]);

  const handleKeyPress = (key: string) => {
    // Debounce: ignorar ações muito rápidas
    const now = Date.now();
    if (now - lastActionTime.current < 150) {
      return;
    }
    lastActionTime.current = now;

    if (isProcessing.current) return;

    setPin(prev => {
      if (prev.length < PIN_LENGTH) {
        return prev + key;
      }
      return prev;
    });
  };

  const handleBackspace = () => {
    const now = Date.now();
    if (now - lastActionTime.current < 150) {
      return;
    }
    lastActionTime.current = now;

    if (isProcessing.current) return;
    setPin(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    const now = Date.now();
    if (now - lastActionTime.current < 150) {
      return;
    }
    lastActionTime.current = now;

    if (isProcessing.current) return;
    setPin('');
    setError('');
  };

  return (
    <div className="glass-panel max-w-md mx-auto animate-fade-in flex flex-col space-y-4">
      <Clock />
      <div className="flex flex-col space-y-2">
        <div className="text-center text-lg text-muted">Digite seu PIN para continuar</div>
        <div className="flex justify-center items-center space-x-3 py-2">
          {Array.from({ length: PIN_LENGTH }).map((_, index) => (
            <div
              key={index}
              className={`pin-dot ${pin.length > index ? 'filled' : ''}`}
            ></div>
          ))}
        </div>
        <div className="text-center font-semibold flex items-center justify-center" style={{color: 'var(--color-red)', minHeight: '2rem'}}>
          {error}
        </div>
      </div>
      <Keypad onKeyPress={handleKeyPress} onBackspace={handleBackspace} onClear={handleClear} />
    </div>
  );
};

export default React.memo(LoginScreen);
