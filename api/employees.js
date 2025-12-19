import { kv } from '@vercel/kv';

const EMPLOYEES_KEY = 'ponto:employees';
const ADMIN_USER = { id: 999, name: 'Administrador', pin: '7531', phone: '' };

// Inicializar funcionários padrão se não existirem
const INITIAL_EMPLOYEES = [
  { id: 1, name: 'Ana Silva', pin: '1234', phone: '11987654321' },
  { id: 2, name: 'Bruno Costa', pin: '5678', phone: '21987654321' },
  { id: 3, name: 'Carla Dias', pin: '4321', phone: '31987654321' },
  { id: 4, name: 'Daniel Alves', pin: '8765', phone: '41987654321' },
];

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Obter funcionários
      let employees = await kv.get(EMPLOYEES_KEY);
      
      // Se não existir, inicializar com dados padrão
      if (!employees) {
        employees = INITIAL_EMPLOYEES;
        await kv.set(EMPLOYEES_KEY, employees);
      }

      return res.status(200).json(employees);
    }

    if (req.method === 'POST') {
      // Adicionar novo funcionário
      const newEmployee = req.body;
      
      let employees = await kv.get(EMPLOYEES_KEY) || INITIAL_EMPLOYEES;
      
      // Gerar novo ID
      const newId = employees.length > 0 ? Math.max(...employees.map(e => e.id)) + 1 : 1;
      const employeeWithId = { ...newEmployee, id: newId };
      
      employees.push(employeeWithId);
      await kv.set(EMPLOYEES_KEY, employees);

      return res.status(201).json({ success: true, employee: employeeWithId });
    }

    if (req.method === 'PUT') {
      // Atualizar funcionário existente
      const updatedEmployee = req.body;
      
      let employees = await kv.get(EMPLOYEES_KEY) || INITIAL_EMPLOYEES;
      
      employees = employees.map(emp => 
        emp.id === updatedEmployee.id ? updatedEmployee : emp
      );
      
      await kv.set(EMPLOYEES_KEY, employees);

      return res.status(200).json({ success: true, employee: updatedEmployee });
    }

    if (req.method === 'DELETE') {
      // Deletar funcionário
      const { id } = req.query;
      
      let employees = await kv.get(EMPLOYEES_KEY) || INITIAL_EMPLOYEES;
      
      employees = employees.filter(emp => emp.id !== parseInt(id));
      
      await kv.set(EMPLOYEES_KEY, employees);

      return res.status(200).json({ success: true, deletedId: id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
