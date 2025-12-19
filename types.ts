export interface Employee {
  id: number;
  name: string;
  pin: string;
  phone: string;
}

export enum ClockType {
  Entrada = "Entrada",
  InicioIntervalo = "Início Intervalo",
  FimIntervalo = "Fim Intervalo",
  Saida = "Saída",
}

export interface ClockEvent {
  type: ClockType;
  timestamp: Date;
}

export interface StoredClockEvent extends ClockEvent {
    id: number;
    employeeId: number;
    employeeName: string;
}

export interface AppState {
    employees: Employee[];
    events: StoredClockEvent[];
}

export interface BackupEntry {
    timestamp: string;
    state: AppState;
}
