import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Employee, ClockType, StoredClockEvent } from './types';
import { ADMIN_USER } from './constants';
import LoginScreen from './components/LoginScreen';
import ClockScreen from './components/ClockScreen';
import AdminDashboard from './components/AdminDashboard';
import { supabase } from './lib/supabase';

const App: React.FC = () => {
  const [loggedInEmployee, setLoggedInEmployee] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allEvents, setAllEvents] = useState<StoredClockEvent[]>([]);

  // Função para buscar funcionários do Supabase
  const fetchEmployees = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ponto_employees')
        .select('*')
        .order('id', { ascending: true });
        
      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error("Erro ao carregar funcionários:", error);
    }
  }, []);

  // Função para buscar eventos do Supabase
  const fetchEvents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ponto_events')
        .select('*')
        .order('timestamp', { ascending: true });
        
      if (error) throw error;
      
      const eventsWithDates = (data || []).map((event: any) => ({
        id: event.id,
        employeeId: event.employee_id,
        employeeName: event.employee_name,
        type: event.type,
        timestamp: new Date(event.timestamp)
      }));
      setAllEvents(eventsWithDates);
    } catch (error) {
      console.error("Erro ao carregar eventos:", error);
    }
  }, []);

  // Carrega os dados ao iniciar
  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchEmployees(), fetchEvents()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchEmployees, fetchEvents]);

  // Supabase Real-time para manter os dados atualizados sem o polling de 5 segundos que causava erro de cota
  useEffect(() => {
    if (isLoading) return;

    const channel = supabase.channel('ponto_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ponto_events' }, () => {
        fetchEvents();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ponto_employees' }, () => {
        fetchEmployees();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isLoading, fetchEvents, fetchEmployees]);

  const handleLogin = (employee: Employee) => {
    if (employee.id === ADMIN_USER.id) {
      setIsAdmin(true);
    }
    setLoggedInEmployee(employee);
  };

  const handleLogout = () => {
    setLoggedInEmployee(null);
    setIsAdmin(false);
  };

  const handleAddEvent = async (type: ClockType) => {
    if (!loggedInEmployee) return;

    try {
      // Usar horário local do dispositivo (código original que funcionava perfeitamente com a lógica de fuso horário local)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const localTimestamp = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;

      const { error } = await supabase.from('ponto_events').insert([{
        employee_id: loggedInEmployee.id,
        employee_name: loggedInEmployee.name,
        type,
        timestamp: localTimestamp,
      }]);

      if (error) throw error;
      // Não é mais necessário chamar fetchEvents manualmente pois o Real-time cuidará disso, mas chamamos para ser imediato
      await fetchEvents();
    } catch (error) {
      console.error("Erro ao adicionar evento:", error);
      throw error;
    }
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
    const employee = employees.find(e => e.id === details.employeeId);
    if (!employee) {
      console.error("Funcionário não encontrado para adicionar evento manual");
      return false;
    }

    try {
      // Converter horário local de Brasília para UTC mantendo os mesmos números
      const localDate = details.timestamp;
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      const hours = String(localDate.getHours()).padStart(2, '0');
      const minutes = String(localDate.getMinutes()).padStart(2, '0');
      const seconds = String(localDate.getSeconds()).padStart(2, '0');
      const utcTimestamp = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;

      const { error } = await supabase.from('ponto_events').insert([{
        employee_id: employee.id,
        employee_name: employee.name,
        type: details.type,
        timestamp: utcTimestamp,
      }]);

      if (error) {
        console.error('[handleAddManualEvent] Erro da API:', error);
        return false;
      }
      
      setTimeout(() => fetchEvents(), 500);
      return true;
    } catch (error) {
      console.error("Erro ao adicionar evento manual:", error);
      return false;
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    try {
      const { error } = await supabase.from('ponto_events').delete().eq('id', eventId);
      
      if (error) {
        alert(`Erro ao deletar: ${error.message || 'Erro desconhecido'}`);
      } else {
        await fetchEvents();
      }
    } catch (error) {
      console.error("Erro ao deletar evento:", error);
      alert("Erro de conexão ao tentar deletar o registro.");
    }
  };

  const handleAddEmployee = async (newEmployee: Omit<Employee, 'id'>) => {
    try {
      const { error } = await supabase.from('ponto_employees').insert([{
        name: newEmployee.name,
        pin: newEmployee.pin,
        phone: newEmployee.phone,
        cpf: newEmployee.cpf || null,
        funcao: newEmployee.funcao || null,
        pix: newEmployee.pix || null
      }]);

      if (!error) {
        await fetchEmployees();
      } else {
        console.error("Erro ao adicionar funcionário:", error);
      }
    } catch (error) {
      console.error("Erro ao adicionar funcionário:", error);
    }
  };

  const handleDeleteEmployee = async (employeeId: number) => {
    try {
      // Deletar funcionário (eventos são deletados via CASCADE no banco de dados)
      const { error } = await supabase.from('ponto_employees').delete().eq('id', employeeId);

      if (!error) {
        await Promise.all([fetchEmployees(), fetchEvents()]);
      } else {
        console.error("Erro ao deletar funcionário:", error);
      }
    } catch (error) {
      console.error("Erro ao deletar funcionário:", error);
    }
  };

  const handleUpdateEmployee = async (updatedEmployee: Employee) => {
    try {
      const { error } = await supabase.from('ponto_employees').update({
        name: updatedEmployee.name,
        pin: updatedEmployee.pin,
        phone: updatedEmployee.phone,
        cpf: updatedEmployee.cpf || null,
        funcao: updatedEmployee.funcao || null,
        pix: updatedEmployee.pix || null
      }).eq('id', updatedEmployee.id);

      if (!error) {
        await fetchEmployees();
      } else {
        console.error("Erro ao atualizar funcionário:", error);
      }
    } catch (error) {
      console.error("Erro ao atualizar funcionário:", error);
    }
  };

  const handleImportEmployees = async (employeesToImport: Omit<Employee, 'id'>[]): Promise<{ added: number, updated: number, errors: string[] }> => {
    const errors: string[] = [];

    // Validar duplicatas no arquivo
    const pinsInFile = employeesToImport.map(e => e.pin);
    const uniquePinsInFile = new Set(pinsInFile);
    if (pinsInFile.length !== uniquePinsInFile.size) {
      errors.push("O arquivo CSV contém PINs duplicados.");
    }
    if (employeesToImport.some(emp => emp.pin === ADMIN_USER.pin)) {
      errors.push(`O PIN ${ADMIN_USER.pin} é reservado para o administrador.`);
    }
    if (errors.length > 0) {
      return { added: 0, updated: 0, errors };
    }

    let addedCount = 0;
    let updatedCount = 0;

    try {
      for (const importedEmp of employeesToImport) {
        const existingEmployee = employees.find(e => e.pin === importedEmp.pin);

        if (existingEmployee) {
          // Atualizar
          await handleUpdateEmployee({ ...existingEmployee, ...importedEmp });
          updatedCount++;
        } else {
          // Adicionar
          await handleAddEmployee(importedEmp);
          addedCount++;
        }
      }

      await fetchEmployees();
      return { added: addedCount, updated: updatedCount, errors };
    } catch (error) {
      errors.push("Falha ao importar funcionários.");
      return { added: 0, updated: 0, errors };
    }
  };

  const handleUpdateEvent = async (eventId: number, newTimestamp: Date) => {
    try {
      // Usar horário local do dispositivo (mesmo formato usado em outras funções)
      const year = newTimestamp.getFullYear();
      const month = String(newTimestamp.getMonth() + 1).padStart(2, '0');
      const day = String(newTimestamp.getDate()).padStart(2, '0');
      const hours = String(newTimestamp.getHours()).padStart(2, '0');
      const minutes = String(newTimestamp.getMinutes()).padStart(2, '0');
      const seconds = String(newTimestamp.getSeconds()).padStart(2, '0');
      const localTimestamp = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;

      const { error } = await supabase.from('ponto_events').update({ timestamp: localTimestamp }).eq('id', eventId);

      if (!error) {
        await fetchEvents();
      } else {
        console.error("Erro ao atualizar evento:", error);
      }
    } catch (error) {
      console.error("Erro ao atualizar evento:", error);
    }
  };

  const employeeEvents = useMemo(() =>
    allEvents.filter(event => loggedInEmployee && event.employeeId === loggedInEmployee.id),
    [allEvents, loggedInEmployee]
  );

  const employeesWithAdmin = useMemo(() => [...employees, ADMIN_USER], [employees]);

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
            onDeleteEmployee={handleDeleteEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onImportEmployees={handleImportEmployees}
            onUpdateEvent={handleUpdateEvent}
            onAddManualEvent={handleAddManualEvent}
            onDeleteEvent={handleDeleteEvent}
            onDownloadBackup={handleDownloadBackup}
            onRefresh={async () => {
              await Promise.all([fetchEmployees(), fetchEvents()]);
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
          <LoginScreen onLogin={handleLogin} employees={employeesWithAdmin} events={allEvents} />
        )}
      </main>
    </div>
  );
};

export default App;
