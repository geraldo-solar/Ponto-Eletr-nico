import React, { useState, useEffect, useRef } from 'react';
import Clock from './Clock';
import Keypad from './Keypad';
import { PIN_LENGTH } from '../constants';
import type { Employee, StoredClockEvent } from '../types';
import { pedirAoPonto, batidaDaLinha } from '../lib/pontoApi';

interface LoginScreenProps {
  onLogin: (employee: Employee, batidasDeHoje: StoredClockEvent[], ficha: string) => void;
  onAdminLogin: () => Promise<void>;
}

// O PIN é conferido no servidor (api/ponto.js): o aparelho não conhece os
// PINs nem as batidas de ninguém. O administrador entra com senha.
const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onAdminLogin }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [modoAdmin, setModoAdmin] = useState(false);
  const [senha, setSenha] = useState('');
  const [entrandoAdmin, setEntrandoAdmin] = useState(false);
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

  const recomecar = (ms: number) => {
    setTimeout(() => {
      setPin('');
      setError('');
      isProcessing.current = false;
    }, ms);
  };

  useEffect(() => {
    if (pin.length !== PIN_LENGTH || isProcessing.current) return;
    isProcessing.current = true;
    setError('Conferindo...');

    (async () => {
      const r = await pedirAoPonto<{ funcionario: Employee; batidas: any[]; ficha: string }>('entrar', { pin });
      if (r.ok) {
        setError('');
        onLogin({ ...r.dados.funcionario, pin: '', phone: '' }, (r.dados.batidas || []).map(batidaDaLinha), r.dados.ficha);
        isProcessing.current = false;
        return;
      }
      if (r.status === 423 && r.corpo?.ultimaBatida) {
        setError(`⚠️ Batida pendente desde ${formatDateTime(r.corpo.ultimaBatida)}. Dirija-se ao setor de pessoal para regularizar.`);
        recomecar(5000); // 5 segundos para ler a mensagem
        return;
      }
      setError(r.erro);
      recomecar(r.status === 401 || r.status === 400 ? 1500 : 5000);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const entrarComoAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senha || entrandoAdmin) return;
    setEntrandoAdmin(true);
    setError('');
    const r = await pedirAoPonto('admin-entrar', { senha });
    setSenha('');
    if (r.ok) {
      await onAdminLogin();
    } else {
      setError(r.erro);
    }
    setEntrandoAdmin(false);
  };

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
        <div className="text-center text-lg text-muted">{modoAdmin ? 'Senha do administrador' : 'Digite seu PIN para continuar'}</div>
        {!modoAdmin && (
          <div className="flex justify-center items-center space-x-3 py-2">
            {Array.from({ length: PIN_LENGTH }).map((_, index) => (
              <div
                key={index}
                className={`pin-dot ${pin.length > index ? 'filled' : ''}`}
              ></div>
            ))}
          </div>
        )}
        <div className="text-center font-semibold flex items-center justify-center" style={{color: 'var(--color-red)', minHeight: '2rem'}}>
          {error}
        </div>
      </div>
      {modoAdmin ? (
        <form onSubmit={entrarComoAdmin} className="flex flex-col space-y-3">
          <input
            type="password"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            placeholder="Senha do administrador"
            autoComplete="current-password"
            autoFocus
            className="w-full"
            style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: 'inherit', fontSize: '1rem' }}
          />
          <button type="submit" disabled={entrandoAdmin || !senha}
            style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', border: 'none', background: 'var(--color-gold, #D4AF37)', color: '#0F2820', fontWeight: 700, cursor: 'pointer', opacity: entrandoAdmin || !senha ? 0.5 : 1 }}>
            {entrandoAdmin ? 'Entrando...' : 'Entrar no painel'}
          </button>
          <button type="button" className="text-muted" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
            onClick={() => { setModoAdmin(false); setSenha(''); setError(''); }}>
            Voltar ao teclado
          </button>
        </form>
      ) : (
        <>
          <Keypad onKeyPress={handleKeyPress} onBackspace={handleBackspace} onClear={handleClear} />
          <button type="button" className="text-muted" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.5rem' }}
            onClick={() => { setModoAdmin(true); setPin(''); setError(''); }}>
            Administração
          </button>
        </>
      )}
    </div>
  );
};

export default React.memo(LoginScreen);
