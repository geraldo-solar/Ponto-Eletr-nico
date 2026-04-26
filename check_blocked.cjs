const fs = require('fs');

const employees = JSON.parse(fs.readFileSync('employees.json', 'utf8'));
const events = JSON.parse(fs.readFileSync('events.json', 'utf8'));

// Obter o "agora" no mesmo formato de UTC forçado usado no App.tsx
const now = new Date(); // The script will use current time (2026-04-10)
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const hours = String(now.getHours()).padStart(2, '0');
const minutes = String(now.getMinutes()).padStart(2, '0');
const seconds = String(now.getSeconds()).padStart(2, '0');
const forcedNowUTC = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`).getTime();

function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const d = String(date.getUTCDate()).padStart(2, '0');
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const y = date.getUTCFullYear();
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    return `${d}/${m}/${y}, ${h}:${min}:${s}`;
}

const blockedEmployees = [];

for (const employee of employees) {
    // Filtrar eventos deste funcionário
    const employeeEvents = events.filter(e => e.employeeId === employee.id);
    if (employeeEvents.length === 0) continue;

    // Ordenar por timestamp (mais recente primeiro)
    const sorted = [...employeeEvents].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const lastEvent = sorted[0];
    const lastEventTime = new Date(lastEvent.timestamp).getTime();

    const hoursSinceLastEvent = (forcedNowUTC - lastEventTime) / (1000 * 60 * 60);

    // Se a última batida foi há mais de 14 horas E não é uma saída, há pendência
    const hasPending = hoursSinceLastEvent > 14 && lastEvent.type !== 'Saída';

    if (hasPending) {
        blockedEmployees.push({
            id: employee.id,
            name: employee.name,
            lastType: lastEvent.type,
            hoursSince: hoursSinceLastEvent.toFixed(2),
            timestampFormatted: formatDateTime(lastEvent.timestamp)
        });
    }
}

console.log(`Encontrados ${blockedEmployees.length} funcionários travados pelo erro Frontend de Batida Pendente:\n`);
blockedEmployees.forEach(e => {
    console.log(`- ${e.name} (ID: ${e.id})`);
    console.log(`  Último evento: ${e.lastType} há ${e.hoursSince} horas (desde ${e.timestampFormatted})`);
    console.log(`  Mensagem de erro: ⚠️ Batida pendente desde ${e.timestampFormatted}. Dirija-se ao setor de pessoal para regularizar.\n`);
});
