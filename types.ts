export interface Employee {
  id: number;
  name: string;
  pin: string;
  phone: string;
  cpf?: string;
  funcao?: string;
  pix?: string;
  active?: boolean;
  /** Intervalo pré-assinalado (art. 74, §2º, da CLT). Nomes iguais aos das colunas do banco. */
  intervalo_preassinalado?: boolean;
  intervalo_inicio?: string | null;
  intervalo_fim?: string | null;
  intervalo_vigencia?: string | null;
}

export enum ClockType {
  Entrada = "Entrada",
  InicioIntervalo = "Início Intervalo",
  FimIntervalo = "Fim Intervalo",
  Saida = "Saída",
  /** Registrado pelo próprio colaborador quando não conseguiu usufruir o intervalo. */
  IntervaloNaoUsufruido = "Intervalo Não Usufruído",
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
