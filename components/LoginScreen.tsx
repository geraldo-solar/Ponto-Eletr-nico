import React, { useState, useEffect, useCallback } from 'react';
import Clock from './Clock';
import Keypad from './Keypad';
import { PIN_LENGTH, ADMIN_USER } from '../constants';
import type { Employee } from '../types';

interface LoginScreenProps {
  onLogin: (employee: Employee) => void;
  employees: Employee[];
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, employees }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleLoginAttempt = useCallback(() => {
    const allUsers = [...employees, ADMIN_USER];
    const employee = allUsers.find((emp) => emp.pin === pin);
    if (employee) {
      setError('');
      onLogin(employee);
    } else {
      setError('PIN inválido. Tente novamente.');
      setTimeout(() => {
        setPin('');
        setError('');
      }, 1500);
    }
  }, [pin, onLogin, employees]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handleLoginAttempt();
    }
  }, [pin, handleLoginAttempt]);

  const handleKeyPress = (key: string) => {
    if (pin.length < PIN_LENGTH) {
      setPin(pin + key);
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  return (
    <div className="bg-gray-800 rounded-xl shadow-2xl p-6 sm:p-8 space-y-6 animate-fade-in max-w-md mx-auto">
        <Clock />
        <div className="space-y-4">
            <div className="text-center text-lg text-gray-300">Digite seu PIN para continuar</div>
            <div className="flex justify-center items-center space-x-3 h-16">
                {Array.from({ length: PIN_LENGTH }).map((_, index) => (
                    <div
                        key={index}
                        className={`w-5 h-5 rounded-full transition-all duration-200 ${
                        pin.length > index ? 'bg-cyan-400' : 'bg-gray-600'
                        }`}
                    ></div>
                ))}
            </div>
            {error && <div className="text-center text-red-400 font-semibold h-6">{error}</div>}
            {!error && <div className="h-6"></div>}
        </div>
        <Keypad onKeyPress={handleKeyPress} onBackspace={handleBackspace} onClear={handleClear} />
    </div>
  );
};

export default LoginScreen;