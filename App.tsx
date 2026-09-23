import React, { useState, useEffect, useCallback } from 'react';
import type { Employee, ClockType, StoredClockEvent } from './types';
import { ADMIN_USER } from './constants';
import LoginScreen from './components/LoginScreen';
import ClockScreen from './components/ClockScreen';
import AdminDashboard from './components/AdminDashboard';
import { pedirAoPonto, batidaDaLinha, horarioDoBanco } from './lib/pontoApi';

// O aparelho não baixa mais funcionários nem batidas: o funcionário recebe
// só o próprio nome e as batidas de hoje, depois de o servidor conferir o PIN;
// o painel recebe tudo, depois de o servidor conferir a senha (VEN-10).

const App: React.FC = () => {
  const [loggedInEmployee, setLoggedInEmployee] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Só do painel do administrador
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allEvents, setAllEvents] = useState<StoredClockEvent[]>([]);

  // Só da tela do funcionário
  const [ficha, setFicha] = useState<string>('');
  const [employeeEvents, setEmployeeEvents] = useState<StoredClockEvent[]>([]);

  const carregarPainel = useCallback(async (): Promise<boolean> => {
    const r = await pedirAoPonto<{ funcionarios: Employee[]; batidas: any[] }>('dados');
    if (!r.ok) {
      if (r.status === 401) {
        alert(r.erro);
        setIsAdmin(false);
        setLoggedInEmployee(null);
      } else {
        console.error('Erro ao carregar o painel:', r.erro);
      }
      return false;
    }
    setEmployees(r.dados.funcionarios || []);
    setAllEvents((r.dados.batidas || []).map(batidaDaLinha));
    return true;
  }, []);

  // Painel aberto: atualiza ao voltar para a aba (substitui o tempo real).
  useEffect(() => {
    if (!isAdmin) return;
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregarPainel(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [isAdmin, carregarPainel]);

  const handleLogin = (employee: Employee, batidasDeHoje: StoredClockEvent[], fichaDaBatida: string) => {
    setFicha(fichaDaBatida);
    setEmployeeEvents(batidasDeHoje);
    setLoggedInEmployee(employee);
  };

  const handleAdminLogin = async () => {
    setIsLoading(true);
    const ok = await carregarPainel();
    setIsLoading(false);
    if (ok) {
      setIsAdmin(true);
      setLoggedInEmployee(ADMIN_USER);
    }
  };

  const handleLogout = () => {
    if (isAdmin) pedirAoPonto('admin-sair');
    setLoggedInEmployee(null);
    setIsAdmin(false);
    setFicha('');
    setEmployeeEvents([]);
    setEmployees([]);
    setAllEvents([]);
  };

  const handleAddEvent = async (type: ClockType) => {
    if (!loggedInEmployee) return;
    const r = await pedirAoPonto<{ batida: any }>('bater', { ficha, tipo: type });
    if (!r.ok) throw new Error(r.erro);
    const nova = batidaDaLinha(r.dados.batida);
    setEmployeeEvents(prev => prev.some(e => e.id === nova.id) ? prev : [...prev, nova]);
  };

  const handleDownloadBackup = async () => {
    try {
      const backupData = {
        employees: employees,
        events: allEvents,
        exportedAt: new Date().toISOString(),
      };
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `backup_ponto_eletronico_${timestamp}.json`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Falha ao criar o backup:", error);
      alert("Ocorreu um erro ao tentar gerar o arquivo de backup.");
    }
  };

  const handleAddManualEvent = async (details: { employeeId: number; type: ClockType; timestamp: Date; }): Promise<boolean> => {
    const r = await pedirAoPonto('batida-manual', {
      funcionarioId: details.employeeId,
      tipo: details.type,
      timestamp: horarioDoBanco(details.timestamp),
    });
    if (!r.ok) {
      console.error('[handleAddManualEvent] Erro:', r.erro);
      return false;
    }
    setTimeout(() => carregarPainel(), 300);
    return true;
  };

  const handleDeleteEvent = async (eventId: number) => {
    const r = await pedirAoPonto('batida-apagar', { id: eventId });
    if (!r.ok) alert(`Erro ao deletar: ${r.erro}`);
    else await carregarPainel();
  };

  const handleAddEmployee = async (newEmployee: Omit<Employee, 'id'>) => {
    const r = await pedirAoPonto('funcionario-novo', { funcionario: newEmployee });
    if (r.ok) await carregarPainel();
    else alert(`Erro ao adicionar funcionário: ${r.erro}`);
  };

  const handleToggleEmployeeActive = async (employeeId: number, active: boolean) => {
    const r = await pedirAoPonto('funcionario-ativo', { id: employeeId, ativo: active });
    if (r.ok) await carregarPainel();
    else alert(`Erro ao ${active ? 'reativar' : 'desativar'} funcionário: ${r.erro}`);
  };

  const handleUpdateEmployee = async (updatedEmployee: Employee) => {
    const r = await pedirAoPonto('funcionario-salvar', { funcionario: updatedEmployee });
    if (r.ok) await carregarPainel();
    else alert(`Erro ao atualizar funcionário: ${r.erro}`);
  };

  const handleImportEmployees = async (employeesToImport: Omit<Employee, 'id'>[]): Promise<{ added: number, updated: number, errors: string[] }> => {
    const errors: string[] = [];

    // Validar duplicatas no arquivo
    const pinsInFile = employeesToImport.map(e => e.pin);
    if (pinsInFile.length !== new Set(pinsInFile).size) {
      errors.push("O arquivo CSV contém PINs duplicados.");
      return { added: 0, updated: 0, errors };
    }

    let addedCount = 0;
    let updatedCount = 0;
    for (const importedEmp of employeesToImport) {
      const existingEmployee = employees.find(e => e.pin === importedEmp.pin);
      const r = existingEmployee
        ? await pedirAoPonto('funcionario-salvar', { funcionario: { ...existingEmployee, ...importedEmp } })
        : await pedirAoPonto('funcionario-novo', { funcionario: importedEmp });
      if (!r.ok) errors.push(`${importedEmp.name || importedEmp.pin}: ${r.erro}`);
      else if (existingEmployee) updatedCount++;
      else addedCount++;
    }

    await carregarPainel();
    return { added: addedCount, updated: updatedCount, errors };
  };

  const handleUpdateEvent = async (eventId: number, newTimestamp: Date) => {
    const r = await pedirAoPonto('batida-editar', { id: eventId, timestamp: horarioDoBanco(newTimestamp) });
    if (r.ok) await carregarPainel();
    else console.error("Erro ao atualizar evento:", r.erro);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 icon-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{width: '32px', height: '32px', marginRight: '12px'}}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h1 className="app-title">Ponto Eletrônico</h1>
      </header>

      <main className="w-full max-w-lg mt-20" style={{ maxWidth: isAdmin && loggedInEmployee ? '56rem' : '28rem' }}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center text-center py-8 space-y-4">
            <svg className="animate-spin text-gold" style={{width: '40px', height: '40px'}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <h3 className="text-xl font-semibold">Carregando dados...</h3>
            <p className="text-muted">Aguarde um momento.</p>
          </div>
        ) : isAdmin && loggedInEmployee ? (
          <AdminDashboard
            admin={loggedInEmployee}
            allEvents={allEvents}
            employees={employees}
            onAddEmployee={handleAddEmployee}
            onToggleActiveEmployee={handleToggleEmployeeActive}
            onUpdateEmployee={handleUpdateEmployee}
            onImportEmployees={handleImportEmployees}
            onUpdateEvent={handleUpdateEvent}
            onAddManualEvent={handleAddManualEvent}
            onDeleteEvent={handleDeleteEvent}
            onDownloadBackup={handleDownloadBackup}
            onRefresh={async () => {
              await carregarPainel();
            }}
            onLogout={handleLogout}
          />
        ) : loggedInEmployee ? (
          <ClockScreen
            employee={loggedInEmployee}
            onLogout={handleLogout}
            events={employeeEvents}
            onAddEvent={handleAddEvent}
          />
        ) : (
          <LoginScreen onLogin={handleLogin} onAdminLogin={handleAdminLogin} />
        )}
      </main>
    </div>
  );
};

export default App;
