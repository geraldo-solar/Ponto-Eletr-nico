import { kv } from '@vercel/kv';

const EVENTS_KEY = 'ponto:events';

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
      // Obter todos os eventos
      let events = await kv.get(EVENTS_KEY);
      
      if (!events) {
        events = [];
        await kv.set(EVENTS_KEY, events);
      }

      return res.status(200).json(events);
    }

    if (req.method === 'POST') {
      // Adicionar novo evento
      const newEvent = req.body;
      
      let events = await kv.get(EVENTS_KEY) || [];
      
      // Gerar ID único baseado em timestamp
      const eventWithId = {
        ...newEvent,
        id: newEvent.id || Date.now(),
        timestamp: newEvent.timestamp || new Date().toISOString()
      };
      
      // Verificar duplicatas
      const isDuplicate = events.some(event => 
        event.employeeId === eventWithId.employeeId &&
        event.type === eventWithId.type &&
        new Date(event.timestamp).getTime() === new Date(eventWithId.timestamp).getTime()
      );

      if (isDuplicate) {
        return res.status(400).json({ error: 'Evento duplicado' });
      }
      
      events.push(eventWithId);
      
      // Ordenar por timestamp
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      await kv.set(EVENTS_KEY, events);

      return res.status(201).json({ success: true, event: eventWithId });
    }

    if (req.method === 'PUT') {
      // Atualizar evento existente (editar timestamp)
      const { id, timestamp } = req.body;
      
      let events = await kv.get(EVENTS_KEY) || [];
      
      events = events.map(event => 
        event.id === id ? { ...event, timestamp } : event
      );
      
      // Reordenar após atualização
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      await kv.set(EVENTS_KEY, events);

      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      // Deletar evento
      const { id } = req.query;
      
      let events = await kv.get(EVENTS_KEY) || [];
      
      events = events.filter(event => event.id !== parseInt(id));
      
      await kv.set(EVENTS_KEY, events);

      return res.status(200).json({ success: true, deletedId: id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
