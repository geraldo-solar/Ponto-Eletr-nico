const fs = require('fs');

const employees = JSON.parse(fs.readFileSync('employees.json', 'utf8'));
const events = JSON.parse(fs.readFileSync('events.json', 'utf8'));

console.log("Total employees:", employees.length);
console.log("Total events:", events.length);

const todayStr = "2026-04-10"; // It's currently April 10, 2026
const todayEvents = events.filter(e => e.timestamp.startsWith(todayStr) || e.timestamp.includes("2026-04-10"));

console.log(`\nEvents for today (${todayStr}):`, todayEvents.length);

const employeeEventDict = {};
employees.forEach(emp => {
    employeeEventDict[emp.id] = { name: emp.name, todayEvents: [] };
});

todayEvents.forEach(e => {
    if (employeeEventDict[e.employeeId]) {
        employeeEventDict[e.employeeId].todayEvents.push(e);
    }
});

console.log("\nEmployees who did NOT clock in today:");
let missed = 0;
for (const id in employeeEventDict) {
    if (employeeEventDict[id].todayEvents.length === 0) {
        console.log(`- ${employeeEventDict[id].name} (ID: ${id})`);
        missed++;
    }
}

if (missed === 0) {
    console.log("Everyone clocked in today.");
}

console.log("\nAll Employees and their today events:");
for (const id in employeeEventDict) {
    console.log(`- ${employeeEventDict[id].name}: ${employeeEventDict[id].todayEvents.length} events`);
}
