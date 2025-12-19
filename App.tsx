import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Employee, ClockType, StoredClockEvent } from './types';
import { ADMIN_USER } from './constants';
import LoginScreen from './components/LoginScreen';
import ClockScreen from './components/ClockScreen';
import AdminDashboard from './components/AdminDashboard';

const API_BASE_URL = import.meta.env.PROD ? '' : 'http://localhost:3000';

const App: React.FC = () => {
  const [loggedInEmployee, setLoggedInEmployee] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allEvents, setAllEvents] = useState<StoredClockEvent[]>([]);

  // Função para buscar funcionários da API
  const fetchEmployees = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/employees`);
      if (response.ok) {
        const data = await response.json();
        setEmployees(data);
      }
    } catch (error) {
      console.error("Erro ao carregar funcionários:", error);
    }
  }, []);

  // Função para buscar eventos da API
  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/events`);
      if (response.ok) {
        const data = await response.json();
        const eventsWithDates = data.map((event: any) => ({
          ...event,
          timestamp: new Date(event.timestamp)
        }));
        setAllEvents(eventsWithDates);
      }
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

  // Polling para sincronização em tempo real (a cada 2 segundos)
  useEffect(() => {
    if (isLoading) return;

    const pollingInterval = setInterval(async () => {
      // Chamar diretamente as APIs sem usar fetchEmployees/fetchEvents
      // para evitar dependências que causam re-renders
      try {
        const [employeesRes, eventsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/employees`),
          fetch(`${API_BASE_URL}/api/events`)
        ]);
        
        if (employeesRes.ok) {
          const employeesData = await employeesRes.json();
          setEmployees(employeesData);
        }
        
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          const eventsWithDates = eventsData.map((event: any) => ({
            ...event,
            timestamp: new Date(event.timestamp)
          }));
          setAllEvents(eventsWithDates);
        }
      } catch (error) {
        console.error("Erro no polling:", error);
      }
    }, 2000); // 2 segundos

    return () => clearInterval(pollingInterval);
  }, [isLoading]); // Apenas isLoading como dependência

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
      const newEvent = {
        employeeId: loggedInEmployee.id,
        employeeName: loggedInEmployee.name,
        type,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(`${API_BASE_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent),
      });

      if (response.ok) {
        await fetchEvents(); // Atualizar lista imediatamente
      }
    } catch (error) {
      console.error("Erro ao adicionar evento:", error);
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
      const newEvent = {
        employeeId: employee.id,
        employeeName: employee.name,
        type: details.type,
        timestamp: details.timestamp.toISOString(),
      };

      const response = await fetch(`${API_BASE_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent),
      });

      if (response.ok) {
        await fetchEvents();
        return true;
      } else {
        const error = await response.json();
        console.error("Erro ao adicionar evento:", error);
        return false;
      }
    } catch (error) {
      console.error("Erro ao adicionar evento manual:", error);
      return false;
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/events?id=${eventId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchEvents();
      }
    } catch (error) {
      console.error("Erro ao deletar evento:", error);
    }
  };

  const handleAddEmployee = async (newEmployee: Omit<Employee, 'id'>) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmployee),
      });

      if (response.ok) {
        await fetchEmployees();
      }
    } catch (error) {
      console.error("Erro ao adicionar funcionário:", error);
    }
  };

  const handleDeleteEmployee = async (employeeId: number) => {
    try {
      // Deletar funcionário
      const empResponse = await fetch(`${API_BASE_URL}/api/employees?id=${employeeId}`, {
        method: 'DELETE',
      });

      // Deletar eventos do funcionário
      const eventsToDelete = allEvents.filter(e => e.employeeId === employeeId);
      await Promise.all(
        eventsToDelete.map(event =>
          fetch(`${API_BASE_URL}/api/events?id=${event.id}`, { method: 'DELETE' })
        )
      );

      if (empResponse.ok) {
        await Promise.all([fetchEmployees(), fetchEvents()]);
      }
    } catch (error) {
      console.error("Erro ao deletar funcionário:", error);
    }
  };

  const handleUpdateEmployee = async (updatedEmployee: Employee) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/employees`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedEmployee),
      });

      if (response.ok) {
        await fetchEmployees();
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
      const response = await fetch(`${API_BASE_URL}/api/events`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eventId, timestamp: newTimestamp.toISOString() }),
      });

      if (response.ok) {
        await fetchEvents();
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

  const MainComponent = () => {
    if (isAdmin && loggedInEmployee) {
      return <AdminDashboard 
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
        onLogout={handleLogout} 
      />;
    }
    if (loggedInEmployee) {
      return <ClockScreen 
        employee={loggedInEmployee} 
        onLogout={handleLogout} 
        events={employeeEvents}
        onAddEvent={handleAddEvent}
      />;
    }
    return <LoginScreen onLogin={handleLogin} employees={employeesWithAdmin} />;
  }

  const LoadingComponent = () => (
    <div className="flex flex-col items-center justify-center text-center py-8 space-y-4">
      <svg className="animate-spin h-10 w-10 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <h3 className="text-xl font-semibold text-white">Carregando dados...</h3>
      <p className="text-gray-400">Aguarde um momento.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-900 text-white flex flex-col items-center justify-center p-4">
      <header className="absolute top-0 left-0 right-0 p-4 flex justify-center items-center bg-stone-900/50 backdrop-blur-sm z-10">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h1 className="text-3xl font-bold tracking-wider text-white">Ponto Eletrônico</h1>
      </header>

      <main className="w-full max-w-lg lg:max-w-4xl">
        {isLoading ? <LoadingComponent /> : <MainComponent />}
      </main>
    </div>
  );
};

export default App;
