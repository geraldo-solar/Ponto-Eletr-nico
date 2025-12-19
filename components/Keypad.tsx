import React from 'react';

interface KeypadProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}

const KeypadButton: React.FC<{ 
  onClick: () => void; 
  children: React.ReactNode; 
  className?: string 
}> = ({ onClick, children, className = '' }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-lg text-3xl font-semibold transition-colors duration-150 aspect-square flex items-center justify-center touch-manipulation select-none ${className}`}
      style={{ 
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        userSelect: 'none'
      }}
    >
      {children}
    </button>
  );
};

const Keypad: React.FC<KeypadProps> = ({ onKeyPress, onBackspace, onClear }) => {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((key) => (
        <KeypadButton key={key} onClick={() => onKeyPress(key)}>
          {key}
        </KeypadButton>
      ))}
      <KeypadButton onClick={onClear} className="text-yellow-400">C</KeypadButton>
      <KeypadButton onClick={() => onKeyPress('0')}>0</KeypadButton>
      <KeypadButton onClick={onBackspace}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 002.828 0L21 12M3 12l6.414-6.414a2 2 0 012.828 0L21 12" />
        </svg>
      </KeypadButton>
    </div>
  );
};

export default Keypad;
