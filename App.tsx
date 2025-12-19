import React, { useState, useEffect, useCallback } from 'react';
import type { Employee, ClockType, StoredClockEvent, AppState, BackupEntry } from './types';
import { ADMIN_USER, INITIAL_EMPLOYEES } from './constants';
import LoginScreen from './components/LoginScreen';
import ClockScreen from './components/ClockScreen';
import AdminDashboard from './components/AdminDashboard';

const EVENTS_STORAGE_KEY = 'clock_events_global';
const EMPLOYEES_STORAGE_KEY = 'employees_global';
const BACKUP_HISTORY_KEY = 'backup_history_global';
const MAX_BACKUP_ENTRIES = 10;

// FIX: Correctly type `window.aistudio` by augmenting the global `AIStudio` interface
// and ensuring `window.aistudio` is typed as `AIStudio`. This resolves conflicts with
// other global type definitions and makes the required functions available.
// FIX: Added ModelQuota interface to correctly type the return value of getModelQuota.
interface ModelQuota {
    metricName: string;
    maxQuota: number;
    remainingQuota: number;
}
declare global {
    interface AIStudio {
        getGlobalState: (key: string) => Promise<string | null>;
        setGlobalState: (key: string, value: string) => Promise<void>;
        // Added to satisfy existing AIStudio interface
        // FIX: Corrected the return type of getHostUrl to match existing declarations.
        getHostUrl: () => Promise<string>;
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
        // FIX: Corrected the signature of getModelQuota to match existing declarations.
        getModelQuota: (model: string) => Promise<ModelQuota>;
    }
    interface Window {
        // FIX: Made `aistudio` optional on the `Window` interface to resolve declaration conflicts.
        aistudio?: AIStudio;
    }
}

// Polyfill for aistudio in case it's not provided by the environment.
// This uses localStorage to simulate the global state for development purposes.
if (typeof window.aistudio === 'undefined') {
  console.log("Polyfilling window.aistudio for development.");
  // FIX: Added missing properties to the polyfill to match the AIStudio interface.
  window.aistudio = {
    getGlobalState: (key: string) => Promise.resolve(localStorage.getItem(key)),
    setGlobalState: (key: string, value: string) => {
      localStorage.setItem(key, value);
      return Promise.resolve();
    },
    // FIX: Updated getHostUrl polyfill to return a Promise.
    getHostUrl: () => Promise.resolve(''),
    hasSelectedApiKey: () => Promise.resolve(true),
    openSelectKey: () => Promise.resolve(),
    // FIX: Updated getModelQuota polyfill to return a Promise<ModelQuota> and accept a model parameter.
    getModelQuota: (model: string) => Promise.resolve({
        metricName: 'default_metric',
        maxQuota: 100,
        remainingQuota: 100,
    }),
  };
} else {
    // Also check for partial implementations
    if (typeof window.aistudio.getGlobalState === 'undefined') {
        console.log("Polyfilling window.aistudio.getGlobalState for development.");
        (window.aistudio as any).getGlobalState = (key: string) => Promise.resolve(localStorage.getItem(key));
    }
    if (typeof window.aistudio.setGlobalState === 'undefined') {
        console.log("Polyfilling window.aistudio.setGlobalState for development.");
        (window.aistudio as any).setGlobalState = (key: string, value: string) => {
            localStorage.setItem(key, value);
            return Promise.resolve();
        };
    }
}


const App: React.FC = () => {
  const [loggedInEmployee, setLoggedInEmployee] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [allEvents, setAllEvents] = useState<StoredClockEvent[]>([]);
  const [backupHistory, setBackupHistory] = useState<BackupEntry[]>([]);

  // Carrega os dados do estado global ao iniciar
  useEffect(() => {
    const loadGlobalState = async () => {
      try {
        // Carregar funcionários
        const storedEmployees = await window.aistudio!.getGlobalState(EMPLOYEES_STORAGE_KEY);
        if (storedEmployees) {
          setEmployees(JSON.parse(storedEmployees));
        } else {
          // Se não houver nada no estado global, salva os funcionários iniciais
          await window.aistudio!.setGlobalState(EMPLOYEES_STORAGE_KEY, JSON.stringify(INITIAL_EMPLOYEES));
        }
        
        // Carregar eventos
        const storedEvents = await window.aistudio!.getGlobalState(EVENTS_STORAGE_KEY);
        if (storedEvents) {
           setAllEvents(JSON.parse(storedEvents).map((event: StoredClockEvent) => ({
                ...event,
                id: event.id || Date.now(),
                timestamp: new Date(event.timestamp)
            })));
        } else {
            await window.aistudio!.setGlobalState(EVENTS_STORAGE_KEY, JSON.stringify([]));
        }

        // Carregar histórico de backup
        const storedBackupHistory = await window.aistudio!.getGlobalState(BACKUP_HISTORY_KEY);
        if (storedBackupHistory) {
            setBackupHistory(JSON.parse(storedBackupHistory));
        }
      } catch (error) {
        console.error("Falha ao carregar estado global", error);
        // Mantém o estado inicial em caso de erro
      } finally {
        setIsLoading(false);
      }
    };

    loadGlobalState();
  }, []);

  // Efeito para sincronizar o estado com o global a cada 5 segundos (polling)
  useEffect(() => {
    if (isLoading) {
      return; // Não inicia o polling enquanto os dados iniciais estão carregando
    }

    const pollingInterval = setInterval(async () => {
      try {
        // Sincroniza funcionários
        const remoteEmployeesJSON = await window.aistudio!.getGlobalState(EMPLOYEES_STORAGE_KEY);
        if (remoteEmployeesJSON) {
          setEmployees(currentLocalEmployees => {
            if (JSON.stringify(currentLocalEmployees) !== remoteEmployeesJSON) {
              console.log("Sincronizando funcionários do estado global.");
              return JSON.parse(remoteEmployeesJSON);
            }
            return currentLocalEmployees;
          });
        }

        // Sincroniza eventos
        const remoteEventsJSON = await window.aistudio!.getGlobalState(EVENTS_STORAGE_KEY);
        if (remoteEventsJSON) {
          setAllEvents(currentLocalEvents => {
            const remoteEvents = JSON.parse(remoteEventsJSON).map((event: StoredClockEvent) => ({
                ...event,
                id: event.id || Date.now(),
                timestamp: new Date(event.timestamp),
            }));
            // Stringify for a deep comparison to avoid unnecessary re-renders
            if (JSON.stringify(currentLocalEvents.map(e => ({...e, timestamp: e.timestamp.toISOString()}))) !== JSON.stringify(remoteEvents.map(e => ({...e, timestamp: e.timestamp.toISOString()})))) {
              console.log("Sincronizando eventos do estado global.");
              return remoteEvents;
            }
            return currentLocalEvents;
          });
        }
         // Sincroniza backups
        const remoteBackupsJSON = await window.aistudio!.getGlobalState(BACKUP_HISTORY_KEY);
        if (remoteBackupsJSON) {
            setBackupHistory(currentLocalBackups => {
                if (JSON.stringify(currentLocalBackups) !== remoteBackupsJSON) {
                    console.log("Sincronizando histórico de backups.");
                    return JSON.parse(remoteBackupsJSON);
                }
                return currentLocalBackups;
            });
        }
      } catch (error) {
        console.error("Erro durante a sincronização do estado global:", error);
      }
    }, 5000); // Poll a cada 5 segundos

    return () => clearInterval(pollingInterval); // Limpa o intervalo ao desmontar
  }, [isLoading]);


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
  
  const updateGlobalState = useCallback(async (
    updater: (currentState: AppState) => AppState | false
  ) => {
    try {
      // READ
      const storedEmployeesJSON = await window.aistudio!.getGlobalState(EMPLOYEES_STORAGE_KEY);
      const storedEventsJSON = await window.aistudio!.getGlobalState(EVENTS_STORAGE_KEY);
      const storedBackupHistoryJSON = await window.aistudio!.getGlobalState(BACKUP_HISTORY_KEY);

      const currentEmployees: Employee[] = storedEmployeesJSON ? JSON.parse(storedEmployeesJSON) : [];
      const currentEvents: StoredClockEvent[] = storedEventsJSON
        ? JSON.parse(storedEventsJSON).map((event: any) => ({ ...event, id: event.id || Date.now(), timestamp: new Date(event.timestamp) }))
        : [];
      const currentBackupHistory: BackupEntry[] = storedBackupHistoryJSON ? JSON.parse(storedBackupHistoryJSON) : [];
        
      // MODIFY (using the provided updater function)
      const result = updater({
        employees: currentEmployees,
        events: currentEvents
      });
      
      if (result === false) {
          return false; // Updater decided to cancel the operation
      }

      const { employees: updatedEmployees, events: updatedEvents } = result;

      // WRITE
      await window.aistudio!.setGlobalState(EMPLOYEES_STORAGE_KEY, JSON.stringify(updatedEmployees));
      await window.aistudio!.setGlobalState(EVENTS_STORAGE_KEY, JSON.stringify(updatedEvents));

      // CREATE AUTOMATIC BACKUP SNAPSHOT
      const newBackupEntry: BackupEntry = {
        timestamp: new Date().toISOString(),
        state: {
            employees: updatedEmployees,
            events: updatedEvents
        }
      };
      const updatedBackupHistory = [newBackupEntry, ...currentBackupHistory].slice(0, MAX_BACKUP_ENTRIES);
      await window.aistudio!.setGlobalState(BACKUP_HISTORY_KEY, JSON.stringify(updatedBackupHistory));

      // SYNC LOCAL STATE
      setEmployees(updatedEmployees);
      setAllEvents(updatedEvents);
      setBackupHistory(updatedBackupHistory);
      
      return true; // Indicate success
    } catch (error) {
      console.error("Falha ao atualizar o estado global", error);
      return false; // Indicate failure
    }
  }, []);

  const handleAddEvent = async (type: ClockType) => {
    if (!loggedInEmployee) return;
    await updateGlobalState(currentState => {
      const newEvent: StoredClockEvent = {
        id: Date.now(),
        employeeId: loggedInEmployee.id,
        employeeName: loggedInEmployee.name,
        type,
        timestamp: new Date(),
      };
      const updatedEvents = [...currentState.events, newEvent].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return { ...currentState, events: updatedEvents };
    });
  }
  
    const handleDownloadBackup = () => {
        try {
            const backupData = {
                employees: employees,
                events: allEvents,
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
    };

    return await updateGlobalState(currentState => {
      const isDuplicate = currentState.events.some(event => 
          event.employeeId === details.employeeId &&
          event.type === details.type &&
          new Date(event.timestamp).getTime() === details.timestamp.getTime()
      );

      if (isDuplicate) {
          console.error("Tentativa de adicionar batida duplicada.");
          return false;
      }
      
      const newEvent: StoredClockEvent = {
          id: Date.now(),
          employeeId: employee.id,
          employeeName: employee.name,
          type: details.type,
          timestamp: details.timestamp,
      };
      
      const updatedEvents = [...currentState.events, newEvent].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return { ...currentState, events: updatedEvents };
    });
  };

  const handleDeleteEvent = async (eventId: number) => {
    await updateGlobalState(currentState => {
        const updatedEvents = currentState.events.filter(event => event.id !== eventId);
        return { ...currentState, events: updatedEvents };
    });
  };

  const handleAddEmployee = async (newEmployee: Omit<Employee, 'id'>) => {
    await updateGlobalState(currentState => {
        const newId = currentState.employees.length > 0 ? Math.max(...currentState.employees.map(e => e.id)) + 1 : 1;
        const updatedEmployees = [...currentState.employees, { ...newEmployee, id: newId }];
        return { ...currentState, employees: updatedEmployees };
    });
  };

  const handleDeleteEmployee = async (employeeId: number) => {
    await updateGlobalState(currentState => {
      const updatedEmployees = currentState.employees.filter(e => e.id !== employeeId);
      const updatedEvents = currentState.events.filter(event => event.employeeId !== employeeId);
      return { employees: updatedEmployees, events: updatedEvents };
    });
  };

  const handleUpdateEmployee = async (updatedEmployee: Employee) => {
    await updateGlobalState(currentState => {
        const updatedEmployees = currentState.employees.map(emp =>
          emp.id === updatedEmployee.id ? updatedEmployee : emp
        );
        return { ...currentState, employees: updatedEmployees };
    });
  };
  
    const handleImportEmployees = async (employeesToImport: Omit<Employee, 'id'>[]): Promise<{ added: number, updated: number, errors: string[] }> => {
        const errors: string[] = [];

        // 1. Validate incoming data for duplicates within the file
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

        const success = await updateGlobalState(currentState => {
            const currentEmployees = [...currentState.employees];
            let nextId = currentEmployees.length > 0 ? Math.max(...currentEmployees.map(e => e.id)) + 1 : 1;

            employeesToImport.forEach(importedEmp => {
                const existingEmployeeIndex = currentEmployees.findIndex(e => e.pin === importedEmp.pin);

                if (existingEmployeeIndex > -1) {
                    // Update
                    currentEmployees[existingEmployeeIndex] = {
                        ...currentEmployees[existingEmployeeIndex],
                        name: importedEmp.name,
                        phone: importedEmp.phone,
                    };
                    updatedCount++;
                } else {
                    // Add
                    currentEmployees.push({ ...importedEmp, id: nextId++ });
                    addedCount++;
                }
            });

            return { ...currentState, employees: currentEmployees };
        });

        if (!success) {
        errors.push("Falha ao salvar as alterações no estado global.");
        return { added: 0, updated: 0, errors };
        }

        return { added: addedCount, updated: updatedCount, errors };
    };

  const handleUpdateEvent = async (eventId: number, newTimestamp: Date) => {
    await updateGlobalState(currentState => {
        const updatedEvents = currentState.events.map(event => 
            event.id === eventId ? { ...event, timestamp: newTimestamp } : event
        ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return { ...currentState, events: updatedEvents };
    });
  };
  
    const restoreState = async (backupData: AppState) => {
        try {
            const { employees, events } = backupData;
            const eventsWithDateObjects = events.map(e => ({...e, timestamp: new Date(e.timestamp)}));

            // This will also trigger an automatic backup of the restored state
            const success = await updateGlobalState(currentState => {
                return {
                    employees: employees,
                    events: eventsWithDateObjects
                };
            });
            
            return success;
        } catch (error) {
            console.error("Falha ao restaurar o estado", error);
            return false;
        }
    };

    const handleRestoreFromFile = async (backupData: AppState) => {
        return restoreState(backupData);
    };

    const handleRestoreFromHistory = async (backupEntry: BackupEntry) => {
        return restoreState(backupEntry.state);
    };


  const employeeEvents = allEvents.filter(
      event => loggedInEmployee && event.employeeId === loggedInEmployee.id
  );

  const MainComponent = () => {
    if (isAdmin && loggedInEmployee) {
      return <AdminDashboard 
                admin={loggedInEmployee} 
                allEvents={allEvents} 
                employees={employees}
                backupHistory={backupHistory}
                onAddEmployee={handleAddEmployee}
                onDeleteEmployee={handleDeleteEmployee}
                onUpdateEmployee={handleUpdateEmployee}
                onImportEmployees={handleImportEmployees}
                onUpdateEvent={handleUpdateEvent}
                onAddManualEvent={handleAddManualEvent}
                onDeleteEvent={handleDeleteEvent}
                onRestoreFromFile={handleRestoreFromFile}
                onRestoreFromHistory={handleRestoreFromHistory}
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
                onDownloadBackup={handleDownloadBackup}
             />;
    }
    return <LoginScreen onLogin={handleLogin} employees={employees} />;
  }

  const LoadingComponent = () => (
    <div className="flex flex-col items-center justify-center text-center py-8 space-y-4">
        <svg className="animate-spin h-10 w-10 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <h3 className="text-xl font-semibold text-white">Carregando dados...</h3>
        <p className="text-gray-400">Aguarde um momento.</p>
    </div>
  );


  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <header className="absolute top-0 left-0 right-0 p-4 flex justify-center items-center bg-gray-900/50 backdrop-blur-sm z-10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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