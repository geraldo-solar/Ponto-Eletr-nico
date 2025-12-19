import type { Employee } from './types';

export const INITIAL_EMPLOYEES: Employee[] = [
  { id: 1, name: 'Ana Silva', pin: '1234', phone: '11987654321' },
  { id: 2, name: 'Bruno Costa', pin: '5678', phone: '21987654321' },
  { id: 3, name: 'Carla Dias', pin: '4321', phone: '31987654321' },
  { id: 4, name: 'Daniel Alves', pin: '8765', phone: '41987654321' },
];

export const PIN_LENGTH = 4;

export const ADMIN_USER: Employee = { id: 999, name: 'Administrador', pin: '7531', phone: '' };