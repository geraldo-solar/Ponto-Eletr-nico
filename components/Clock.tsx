
import React, { useState, useEffect } from 'react';

const Clock: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR');
  };

  return (
    <div className="text-center">
      <div className="text-5xl font-bold text-amber-400 tracking-wider">
        {formatTime(currentTime)}
      </div>
      <div className="text-lg text-gray-400 capitalize">
        {formatDate(currentTime)}
      </div>
    </div>
  );
};

export default Clock;
