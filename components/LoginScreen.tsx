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
    const now = Date.now();
    const hoursSinceLastEvent = (now - lastEventTime) / (1000 * 60 * 60);

    // Se a última batida foi há mais de 12 horas E não é uma saída, há pendência
    const hasPending = hoursSinceLastEvent > 12 && lastEvent.type !== 'Saída';

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
          const lastEventDate = new Date(lastEvent!.timestamp).toLocaleString('pt-BR');
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
    <div className="bg-stone-800 rounded-xl shadow-2xl p-6 sm:p-8 space-y-6 animate-fade-in max-w-md mx-auto">
      <Clock />
      <div className="space-y-4">
        <div className="text-center text-lg text-gray-300">Digite seu PIN para continuar</div>
        <div className="flex justify-center items-center space-x-3 h-16">
          {Array.from({ length: PIN_LENGTH }).map((_, index) => (
            <div
              key={index}
              className={`w-5 h-5 rounded-full transition-all duration-200 ${
                pin.length > index ? 'bg-amber-500' : 'bg-emerald-700'
              }`}
            ></div>
          ))}
        </div>
        {error && <div className="text-center text-red-400 font-semibold min-h-6 px-4 py-2">{error}</div>}
        {!error && <div className="h-6"></div>}
      </div>
      <Keypad onKeyPress={handleKeyPress} onBackspace={handleBackspace} onClear={handleClear} />
    </div>
  );
};

export default React.memo(LoginScreen);
