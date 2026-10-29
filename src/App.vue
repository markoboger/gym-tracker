<script setup>
import { ref, computed, onMounted } from 'vue'
import equipmentData from './data/equipment.json'

const currentDate = ref(new Date().toISOString().split('T')[0])
const workouts = ref([])
const sessions = ref([])
const showHistory = ref(false)
const editingSession = ref(null)

const todaySession = computed(() => {
  return sessions.value.find(s => s.date === currentDate.value)
})

const sortedSessions = computed(() => {
  return [...sessions.value].sort((a, b) => new Date(b.date) - new Date(a.date))
})

function initWorkouts() {
  if (!todaySession.value) {
    workouts.value = equipmentData.map(eq => ({
      equipmentId: eq.id,
      name: eq.name,
      nr: eq.nr,
      kg: eq.defaultKg,
      sets: eq.sets,
      reps: eq.reps,
      meters: eq.isCardio ? 0 : null,
      minutes: eq.isCardio || eq.isSauna ? 0 : null,
      isCardio: eq.isCardio,
      isSauna: eq.isSauna,
      completed: false
    }))
  } else {
    workouts.value = todaySession.value.workouts
  }
}

function loadSessions() {
  const stored = localStorage.getItem('happyfit-sessions')
  if (stored) {
    sessions.value = JSON.parse(stored)
  }
}

function saveSessions() {
  localStorage.setItem('happyfit-sessions', JSON.stringify(sessions.value))
}

function saveToday() {
  const existingIndex = sessions.value.findIndex(s => s.date === currentDate.value)
  const session = {
    date: currentDate.value,
    workouts: workouts.value.filter(w => w.completed)
  }
  
  if (existingIndex >= 0) {
    sessions.value[existingIndex] = session
  } else {
    sessions.value.push(session)
  }
  
  saveSessions()
}

function toggleComplete(workout) {
  workout.completed = !workout.completed
  saveToday()
}

function quickLog(workout) {
  workout.completed = true
  saveToday()
}

function increment(workout, field) {
  if (field === 'kg') {
    workout.kg = Math.round((workout.kg + 2.5) * 10) / 10
  } else {
    workout[field]++
  }
  if (workout.completed) saveToday()
}

function decrement(workout, field) {
  if (field === 'kg') {
    workout.kg = Math.max(0, Math.round((workout.kg - 2.5) * 10) / 10)
  } else {
    workout[field] = Math.max(0, workout[field] - 1)
  }
  if (workout.completed) saveToday()
}

function viewHistory() {
  showHistory.value = true
}

function backToToday() {
  showHistory.value = false
  editingSession.value = null
  currentDate.value = new Date().toISOString().split('T')[0]
  initWorkouts()
}

function viewSession(session) {
  editingSession.value = session
  currentDate.value = session.date
  workouts.value = session.workouts
}

function exportData() {
  const data = JSON.stringify(sessions.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `happyfit-export-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function importData() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = (e) => {
    const file = e.target.files[0]
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result)
        if (Array.isArray(imported)) {
          sessions.value = imported
          saveSessions()
          initWorkouts()
          alert('Import erfolgreich!')
        }
      } catch (err) {
        alert('Import fehlgeschlagen: ' + err.message)
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

function resetData() {
  if (confirm('Alle Daten löschen? Dies kann nicht rückgängig gemacht werden.')) {
    localStorage.removeItem('happyfit-sessions')
    sessions.value = []
    initWorkouts()
  }
}

onMounted(() => {
  loadSessions()
  initWorkouts()
})
</script>

<template>
  <div class="app">
    <header class="header">
      <h1>💪 HappyFit</h1>
      <div class="header-actions">
        <button v-if="!showHistory" @click="viewHistory" class="btn-secondary">Verlauf</button>
        <button v-else @click="backToToday" class="btn-secondary">Heute</button>
      </div>
    </header>

    <main class="main">
      <div v-if="!showHistory" class="today-view">
        <div class="date-header">
          <input type="date" v-model="currentDate" @change="initWorkouts" class="date-input" />
        </div>

        <div class="workouts-list">
          <div 
            v-for="workout in workouts" 
            :key="workout.equipmentId"
            class="workout-card"
            :class="{ completed: workout.completed }"
          >
            <div class="workout-header">
              <div class="workout-title">
                <span class="workout-nr" v-if="workout.nr">{{ workout.nr }}</span>
                <span class="workout-name">{{ workout.name }}</span>
              </div>
              <button 
                @click="quickLog(workout)"
                class="btn-quick"
                v-if="!workout.completed"
              >
                ✓
              </button>
              <button 
                @click="toggleComplete(workout)"
                class="btn-undo"
                v-else
              >
                ↶
              </button>
            </div>

            <div class="workout-controls">
              <div class="control-group" v-if="!workout.isSauna">
                <label>kg</label>
                <div class="stepper">
                  <button @click="decrement(workout, 'kg')" class="btn-stepper">−</button>
                  <input 
                    type="number" 
                    v-model.number="workout.kg" 
                    @change="saveToday"
                    class="input-number"
                  />
                  <button @click="increment(workout, 'kg')" class="btn-stepper">+</button>
                </div>
              </div>

              <div class="control-group">
                <label>Sets</label>
                <div class="stepper">
                  <button @click="decrement(workout, 'sets')" class="btn-stepper">−</button>
                  <input 
                    type="number" 
                    v-model.number="workout.sets" 
                    @change="saveToday"
                    class="input-number"
                  />
                  <button @click="increment(workout, 'sets')" class="btn-stepper">+</button>
                </div>
              </div>

              <div class="control-group" v-if="!workout.isCardio && !workout.isSauna">
                <label>Reps</label>
                <div class="stepper">
                  <button @click="decrement(workout, 'reps')" class="btn-stepper">−</button>
                  <input 
                    type="number" 
                    v-model.number="workout.reps" 
                    @change="saveToday"
                    class="input-number"
                  />
                  <button @click="increment(workout, 'reps')" class="btn-stepper">+</button>
                </div>
              </div>

              <div class="control-group" v-if="workout.isCardio || workout.isSauna">
                <label>Min</label>
                <div class="stepper">
                  <button @click="decrement(workout, 'minutes')" class="btn-stepper">−</button>
                  <input 
                    type="number" 
                    v-model.number="workout.minutes" 
                    @change="saveToday"
                    class="input-number"
                  />
                  <button @click="increment(workout, 'minutes')" class="btn-stepper">+</button>
                </div>
              </div>

              <div class="control-group" v-if="workout.isCardio">
                <label>Meter</label>
                <div class="stepper">
                  <button @click="workout.meters = Math.max(0, workout.meters - 50); saveToday()" class="btn-stepper">−</button>
                  <input 
                    type="number" 
                    v-model.number="workout.meters" 
                    @change="saveToday"
                    class="input-number"
                  />
                  <button @click="workout.meters += 50; saveToday()" class="btn-stepper">+</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="history-view">
        <h2>Verlauf</h2>
        
        <div class="history-actions">
          <button @click="exportData" class="btn-secondary">Export</button>
          <button @click="importData" class="btn-secondary">Import</button>
          <button @click="resetData" class="btn-danger">Reset</button>
        </div>

        <div class="sessions-list">
          <div 
            v-for="session in sortedSessions" 
            :key="session.date"
            @click="viewSession(session)"
            class="session-card"
          >
            <div class="session-date">{{ session.date }}</div>
            <div class="session-summary">
              {{ session.workouts.length }} Übungen
            </div>
          </div>
        </div>

        <div v-if="sortedSessions.length === 0" class="empty-state">
          Noch keine Trainings protokolliert.
        </div>
      </div>
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg-primary: #000;
  --bg-secondary: #1c1c1e;
  --bg-tertiary: #2c2c2e;
  --text-primary: #fff;
  --text-secondary: #8e8e93;
  --accent: #007aff;
  --accent-dark: #0051d5;
  --success: #34c759;
  --danger: #ff3b30;
  --border: #38383a;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', 'Segoe UI', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}

.app {
  min-height: 100vh;
  padding-bottom: env(safe-area-inset-bottom);
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-secondary);
  padding: 1rem;
  padding-top: calc(1rem + env(safe-area-inset-top));
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.main {
  padding: 1rem;
  max-width: 600px;
  margin: 0 auto;
}

.date-header {
  margin-bottom: 1rem;
}

.date-input {
  width: 100%;
  padding: 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 1rem;
}

.workouts-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.workout-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 1rem;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.workout-card.completed {
  border-color: var(--success);
  opacity: 0.8;
}

.workout-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.workout-title {
  flex: 1;
}

.workout-nr {
  display: inline-block;
  background: var(--bg-tertiary);
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  margin-right: 0.5rem;
  color: var(--text-secondary);
}

.workout-name {
  font-size: 1.125rem;
  font-weight: 500;
}

.workout-controls {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.control-group {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 140px;
}

.control-group label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stepper {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.btn-stepper {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  background: var(--bg-tertiary);
  border: none;
  border-radius: 8px;
  color: var(--accent);
  font-size: 1.25rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-stepper:active {
  background: var(--border);
}

.input-number {
  flex: 1 1 auto;
  min-width: 40px;
  height: 36px;
  background: var(--bg-tertiary);
  border: none;
  border-radius: 8px;
  color: var(--text-primary);
  text-align: center;
  font-size: 1rem;
  font-weight: 500;
}

.btn-quick,
.btn-undo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  transition: all 0.2s;
}

.btn-quick {
  background: var(--success);
  color: white;
}

.btn-quick:active {
  transform: scale(0.95);
}

.btn-undo {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: var(--bg-tertiary);
  border: none;
  border-radius: 8px;
  color: var(--accent);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary:active {
  background: var(--border);
}

.btn-danger {
  padding: 0.5rem 1rem;
  background: var(--danger);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}

.history-view h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
}

.history-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.session-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.session-card:active {
  background: var(--bg-tertiary);
}

.session-date {
  font-size: 1rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.session-summary {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.empty-state {
  text-align: center;
  color: var(--text-secondary);
  padding: 2rem;
}

@media (max-width: 400px) {
  .control-group {
    flex: 1 1 calc(50% - 0.25rem);
    max-width: none;
  }
  
  .workout-controls {
    gap: 0.5rem;
  }
}

@media (min-width: 768px) {
  .control-group {
    min-width: 120px;
    max-width: 160px;
  }
}
</style>
