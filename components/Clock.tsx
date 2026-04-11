
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
      <div className="text-gold font-bold tracking-wider" style={{fontSize: '3rem', lineHeight: '1', textShadow: '0 0 15px var(--accent-gold)'}}>
        {formatTime(currentTime)}
      </div>
      <div className="text-lg text-muted" style={{textTransform: 'capitalize', marginTop: '0.5rem'}}>
        {formatDate(currentTime)}
      </div>
    </div>
  );
};

export default Clock;
