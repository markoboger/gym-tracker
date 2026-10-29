<script setup>
import { ref, computed, onMounted } from 'vue'
import { VueScrollPicker } from 'vue-scroll-picker'
import 'vue-scroll-picker/style.css'
import equipmentData from './data/equipment.json'
import { storage, migrateFromLocalStorage } from './db/index.js'

const currentDate = ref(new Date().toISOString().split('T')[0])
const workouts = ref([])
const sessions = ref([])
const showHistory = ref(false)
const editingSession = ref(null)
const showChart = ref(false)
const selectedExerciseId = ref(null)
const selectedSeason = ref(null)
const historyView = ref('sessions') // 'sessions' or 'chart'
const showConfigurator = ref(false)
const enabledEquipment = ref(new Set())
const showPicker = ref(false)
const pickerWorkout = ref(null)
const pickerField = ref('')
const pickerValue = ref(0)
const showMachineSettings = ref(false)
const editingMachine = ref(null)
const machineSettings = ref({})

// Get machine settings with defaults
function getMachineSettings(equipmentId) {
  if (!machineSettings.value[equipmentId]) {
    return {
      targetSets: 2,
      stepSize: 5,
      startingKg: equipmentData.find(eq => eq.id === equipmentId)?.defaultKg || 0,
      countDirection: 'up'
    }
  }
  return machineSettings.value[equipmentId]
}

async function saveMachineSettings(equipmentId, settings) {
  machineSettings.value[equipmentId] = settings
  await storage.putMachineSetting(equipmentId, settings)
}

async function loadMachineSettings() {
  const settings = await storage.getMachineSettings()
  machineSettings.value = settings
}

function openMachineSettings(workout) {
  editingMachine.value = {
    ...workout,
    settings: { ...getMachineSettings(workout.equipmentId) }
  }
  showMachineSettings.value = true
}

function closeMachineSettings() {
  showMachineSettings.value = false
  editingMachine.value = null
}

function applyMachineSettings() {
  if (editingMachine.value) {
    saveMachineSettings(editingMachine.value.equipmentId, editingMachine.value.settings)
  }
  closeMachineSettings()
}

const todaySession = computed(() => {
  return sessions.value.find(s => s.date === currentDate.value)
})

const enabledEquipmentList = computed(() => {
  return equipmentData.filter(eq => enabledEquipment.value.has(eq.id))
})

const allEquipmentList = computed(() => {
  return equipmentData.map(eq => ({
    ...eq,
    enabled: enabledEquipment.value.has(eq.id)
  }))
})

function getSeasonFromDate(dateStr) {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  
  // Season runs Sep → Aug
  // Sep-Dec belongs to current year season (e.g., Sep 2025 = 2025/26)
  // Jan-Aug belongs to previous year season (e.g., Jan 2026 = 2025/26)
  if (month >= 9) {
    return `${year}/${(year + 1) % 100}`
  } else {
    return `${year - 1}/${year % 100}`
  }
}

const availableSeasons = computed(() => {
  const seasonSet = new Set()
  sessions.value.forEach(session => {
    seasonSet.add(getSeasonFromDate(session.date))
  })
  return Array.from(seasonSet).sort().reverse()
})

const currentSeason = computed(() => {
  return getSeasonFromDate(new Date().toISOString().split('T')[0])
})

const filteredSessions = computed(() => {
  let filtered = sessions.value
  
  if (selectedSeason.value) {
    filtered = filtered.filter(s => getSeasonFromDate(s.date) === selectedSeason.value)
  }
  
  return [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date))
})

const sortedSessions = computed(() => filteredSessions.value)

const availableExercises = computed(() => {
  const exerciseMap = new Map()
  
  filteredSessions.value.forEach(session => {
    session.workouts.forEach(workout => {
      // Only include enabled equipment
      if (!workout.isSauna && workout.kg > 0 && enabledEquipment.value.has(workout.equipmentId)) {
        if (!exerciseMap.has(workout.equipmentId)) {
          exerciseMap.set(workout.equipmentId, {
            id: workout.equipmentId,
            name: workout.name
          })
        }
      }
    })
  })
  
  return Array.from(exerciseMap.values()).sort((a, b) => a.name.localeCompare(b.name))
})

const chartData = computed(() => {
  if (!selectedExerciseId.value) return []
  
  const data = []
  const chronologicalSessions = [...filteredSessions.value].sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  )
  
  chronologicalSessions.forEach(session => {
    const workout = session.workouts.find(w => w.equipmentId === selectedExerciseId.value)
    if (workout && !workout.isSauna && workout.kg > 0) {
      data.push({
        date: session.date,
        kg: workout.kg,
        sets: workout.sets,
        reps: workout.reps
      })
    }
  })
  
  return data
})

const chartStats = computed(() => {
  if (chartData.value.length === 0) return null
  
  const weights = chartData.value.map(d => d.kg)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const latest = weights[weights.length - 1]
  const first = weights[0]
  const change = latest - first
  
  return { min, max, latest, first, change, count: weights.length }
})

const selectedExerciseName = computed(() => {
  const exercise = availableExercises.value.find(e => e.id === selectedExerciseId.value)
  return exercise ? exercise.name : ''
})

function getMostRecentWorkoutData(equipmentId) {
  // Sort sessions chronologically, most recent first
  const sortedSessions = [...sessions.value].sort((a, b) => 
    new Date(b.date) - new Date(a.date)
  )
  
  // Find the most recent session that has this equipment
  for (const session of sortedSessions) {
    const workout = session.workouts.find(w => w.equipmentId === equipmentId)
    if (workout) {
      return workout
    }
  }
  
  return null
}

function initWorkouts(isNewDay = false) {
  const existingSession = sessions.value.find(s => s.date === currentDate.value)
  
  // Only include enabled equipment
  const enabledEquipmentData = equipmentData.filter(eq => enabledEquipment.value.has(eq.id))
  
  if (!existingSession || isNewDay) {
    // Create fresh workout list from enabled equipment
    workouts.value = enabledEquipmentData.map(eq => {
      if (isNewDay) {
        // For new training day: carry forward kg/reps from most recent, but sets = 0
        const recentWorkout = getMostRecentWorkoutData(eq.id)
        
        if (recentWorkout) {
          return {
            equipmentId: eq.id,
            name: eq.name,
            nr: eq.nr,
            kg: recentWorkout.kg,
            sets: 0,
            reps: recentWorkout.reps,
            meters: eq.isCardio ? (recentWorkout.meters || 0) : null,
            minutes: (eq.isCardio || eq.isSauna) ? (recentWorkout.minutes || 0) : null,
            isCardio: eq.isCardio,
            isSauna: eq.isSauna,
            completed: false,
            collapsed: true
          }
        }
      }
      
      // Default values for new session or no previous data
      return {
        equipmentId: eq.id,
        name: eq.name,
        nr: eq.nr,
        kg: eq.defaultKg,
        sets: isNewDay ? 0 : eq.sets,
        reps: eq.reps,
        meters: eq.isCardio ? 0 : null,
        minutes: (eq.isCardio || eq.isSauna) ? 0 : null,
        isCardio: eq.isCardio,
        isSauna: eq.isSauna,
        completed: false,
        collapsed: true
      }
    })
  } else {
    // Load existing session - expand to show all enabled equipment
    const sessionWorkoutMap = new Map(
      existingSession.workouts.map(w => [w.equipmentId, w])
    )
    
    workouts.value = enabledEquipmentData.map(eq => {
      const existing = sessionWorkoutMap.get(eq.id)
      if (existing) {
        return { 
          ...existing, 
          completed: true,
          collapsed: existing.collapsed !== undefined ? existing.collapsed : true
        }
      } else {
        return {
          equipmentId: eq.id,
          name: eq.name,
          nr: eq.nr,
          kg: eq.defaultKg,
          sets: eq.sets,
          reps: eq.reps,
          meters: eq.isCardio ? 0 : null,
          minutes: (eq.isCardio || eq.isSauna) ? 0 : null,
          isCardio: eq.isCardio,
          isSauna: eq.isSauna,
          completed: false,
          collapsed: true
        }
      }
    })
  }
}

async function loadSessions() {
  const loadedSessions = await storage.getSessions()
  sessions.value = loadedSessions
}

async function saveSessions() {
  const allSessions = sessions.value
  for (const session of allSessions) {
    await storage.putSession(session)
  }
}

async function loadEnabledEquipment() {
  const ids = await storage.getEnabledEquipment()
  if (ids.length > 0) {
    enabledEquipment.value = new Set(ids)
  } else {
    enabledEquipment.value = new Set(equipmentData.map(eq => eq.id))
  }
}

async function saveEnabledEquipment() {
  const ids = Array.from(enabledEquipment.value)
  await storage.setEnabledEquipment(ids)
}

async function saveToday() {
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
  
  await storage.putSession(session)
}

function toggleComplete(workout) {
  workout.completed = !workout.completed
  workout.collapsed = true
  saveToday()
}

function quickLog(workout) {
  workout.completed = true
  workout.collapsed = true
  saveToday()
}

function toggleCollapse(workout) {
  workout.collapsed = !workout.collapsed
}

function enterEditMode(workout) {
  workout.collapsed = false
}

function increment(workout, field) {
  if (field === 'kg') {
    const settings = getMachineSettings(workout.equipmentId)
    const step = settings.stepSize
    workout.kg = Math.round((workout.kg + step) * 10) / 10
  } else {
    workout[field]++
  }
  if (workout.completed) saveToday()
}

function decrement(workout, field) {
  if (field === 'kg') {
    const settings = getMachineSettings(workout.equipmentId)
    const step = settings.stepSize
    workout.kg = Math.max(0, Math.round((workout.kg - step) * 10) / 10)
  } else {
    workout[field] = Math.max(0, workout[field] - 1)
  }
  if (workout.completed) saveToday()
}

function viewHistory() {
  showHistory.value = true
  if (!selectedSeason.value) {
    selectedSeason.value = currentSeason.value
  }
  // Default to chart view if we have data
  if (sessions.value.length > 0) {
    historyView.value = 'chart'
    if (!selectedExerciseId.value && availableExercises.value.length > 0) {
      selectedExerciseId.value = availableExercises.value[0].id
    }
  } else {
    historyView.value = 'sessions'
  }
}

function backToToday() {
  showHistory.value = false
  editingSession.value = null
  historyView.value = 'sessions'
  currentDate.value = new Date().toISOString().split('T')[0]
  initWorkouts()
}

function showChartView() {
  historyView.value = 'chart'
  if (!selectedExerciseId.value && availableExercises.value.length > 0) {
    selectedExerciseId.value = availableExercises.value[0].id
  }
}

function showSessionsView() {
  historyView.value = 'sessions'
}

function selectExercise(exerciseId) {
  selectedExerciseId.value = exerciseId
}

function selectSeason(season) {
  selectedSeason.value = season
}

function viewSession(session) {
  showHistory.value = false
  editingSession.value = session
  currentDate.value = session.date
  initWorkouts()
}

function backToHistory() {
  showHistory.value = true
  editingSession.value = null
  currentDate.value = new Date().toISOString().split('T')[0]
}

function getX(index) {
  const chartWidth = 300
  const chartLeft = 40
  const count = chartData.value.length
  
  if (count === 1) return chartLeft + chartWidth / 2
  
  return chartLeft + (index / (count - 1)) * chartWidth
}

function getY(kg) {
  const chartHeight = 160
  const chartTop = 20
  const max = chartStats.value.max
  const min = Math.min(chartStats.value.min, 0)
  const range = max - min
  
  if (range === 0) return chartTop + chartHeight / 2
  
  const normalizedValue = (kg - min) / range
  return chartTop + chartHeight - (normalizedValue * chartHeight)
}

function getChartPath(includeArea) {
  if (chartData.value.length === 0) return ''
  
  let path = `M ${getX(0)} ${getY(chartData.value[0].kg)}`
  
  for (let i = 1; i < chartData.value.length; i++) {
    path += ` L ${getX(i)} ${getY(chartData.value[i].kg)}`
  }
  
  if (includeArea) {
    const lastIndex = chartData.value.length - 1
    path += ` L ${getX(lastIndex)} 180`
    path += ` L ${getX(0)} 180`
    path += ' Z'
  }
  
  return path
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

async function importData() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result)
        if (Array.isArray(imported)) {
          sessions.value = imported
          await saveSessions()
          await initWorkouts()
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

async function resetData() {
  if (confirm('Alle Daten löschen? Dies kann nicht rückgängig gemacht werden.')) {
    await storage.deleteSessions()
    sessions.value = []
    await initWorkouts()
  }
}

function openConfigurator() {
  showConfigurator.value = true
}

function closeConfigurator() {
  showConfigurator.value = false
  initWorkouts() // Refresh workouts list with new enabled equipment
}

function toggleEquipment(equipmentId) {
  if (enabledEquipment.value.has(equipmentId)) {
    enabledEquipment.value.delete(equipmentId)
  } else {
    enabledEquipment.value.add(equipmentId)
  }
  saveEnabledEquipment()
}

function enableAll() {
  enabledEquipment.value = new Set(equipmentData.map(eq => eq.id))
  saveEnabledEquipment()
}

function disableAll() {
  enabledEquipment.value = new Set()
  saveEnabledEquipment()
}

function createNewDay() {
  // Set current date to today
  currentDate.value = new Date().toISOString().split('T')[0]
  
  // Check if today already has a session
  const todayHasSession = sessions.value.some(s => s.date === currentDate.value)
  
  if (todayHasSession) {
    if (!confirm('Heute existiert bereits ein Training. Neu starten?')) {
      return
    }
  }
  
  // Initialize with new day logic (carry forward kg/reps, sets = 0)
  showHistory.value = false
  editingSession.value = null
  initWorkouts(true)
}

function openPicker(workout, field) {
  pickerWorkout.value = workout
  pickerField.value = field
  pickerValue.value = workout[field]
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
  pickerWorkout.value = null
  pickerField.value = ''
}

function applyPickerValue() {
  if (pickerWorkout.value && pickerField.value) {
    pickerWorkout.value[pickerField.value] = pickerValue.value
    saveToday()
  }
  closePicker()
}

function getPickerRange(field) {
  if (field === 'kg' && pickerWorkout.value) {
    // Use machine-specific step size
    const settings = getMachineSettings(pickerWorkout.value.equipmentId)
    const step = settings.stepSize
    const values = []
    for (let i = 0; i <= 200; i += step) {
      const val = Math.round(i * 10) / 10
      values.push({ name: `${val} kg`, value: val })
    }
    // Reverse order for count-down machines (lower is better)
    if (settings.countDirection === 'down') {
      return values.reverse()
    }
    return values
  } else if (field === 'sets') {
    return Array.from({ length: 11 }, (_, i) => ({ 
      name: `${i}`, 
      value: i 
    }))
  } else if (field === 'reps') {
    return Array.from({ length: 51 }, (_, i) => ({ 
      name: `${i}`, 
      value: i 
    }))
  }
  return []
}

function handlePickerChange(newValue) {
  pickerValue.value = newValue
}

onMounted(async () => {
  await migrateFromLocalStorage()
  await loadEnabledEquipment()
  await loadMachineSettings()
  await loadSessions()
  initWorkouts()
})
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="header-left">
        <button v-if="!showHistory && !editingSession" @click="openConfigurator" class="btn-icon" title="Geräte konfigurieren">
          ⚙️
        </button>
      </div>
      <h1>💪 HappyFit</h1>
      <div class="header-actions">
        <button v-if="showHistory" @click="backToToday" class="btn-secondary">← Heute</button>
        <button v-else-if="editingSession" @click="backToHistory" class="btn-secondary">← Verlauf</button>
        <button v-else @click="viewHistory" class="btn-secondary">Verlauf</button>
      </div>
    </header>

    <main class="main">
      <div v-if="!showHistory" class="today-view">
        <div class="date-header">
          <div class="date-header-top">
            <label class="date-label">
              {{ editingSession ? 'Training bearbeiten' : 'Training' }}
            </label>
            <button v-if="!editingSession" @click="createNewDay" class="btn-new-day">
              + Neuer Tag
            </button>
          </div>
          <input type="date" v-model="currentDate" @change="initWorkouts" class="date-input" />
        </div>

        <div class="workouts-list">
          <div 
            v-for="workout in workouts" 
            :key="workout.equipmentId"
            class="workout-card"
            :class="{ completed: workout.completed, collapsed: workout.collapsed }"
            :style="workout.collapsed && workout.completed ? {
              background: `linear-gradient(to right, rgba(52, 199, 89, 0.15) ${(workout.sets / getMachineSettings(workout.equipmentId).targetSets) * 100}%, var(--bg-secondary) ${(workout.sets / getMachineSettings(workout.equipmentId).targetSets) * 100}%)`
            } : {}"
          >
            <div 
              class="workout-header"
              @click="workout.collapsed ? enterEditMode(workout) : null"
              :class="{ clickable: workout.collapsed }"
            >
              <div class="workout-title">
                <div class="title-line">
                  <span class="workout-nr" v-if="workout.nr">{{ workout.nr }}</span>
                  <span class="workout-name">{{ workout.name }}</span>
                </div>
                <span v-if="workout.collapsed" class="workout-summary">
                  {{ workout.kg > 0 ? workout.kg + 'kg' : '' }}
                  {{ workout.sets > 0 ? ' · ' + workout.sets + '×' + workout.reps : '' }}
                  {{ workout.completed ? ` · ${workout.sets}/${getMachineSettings(workout.equipmentId).targetSets}` : '' }}
                </span>
              </div>
              <div class="header-actions">
                <button 
                  @click.stop="openMachineSettings(workout)"
                  class="btn-settings"
                  v-if="!workout.collapsed"
                  title="Einstellungen"
                >
                  ⚙️
                </button>
                <button 
                  @click.stop="quickLog(workout)"
                  class="btn-quick"
                  v-if="!workout.collapsed"
                >
                  ✓
                </button>
                <button 
                  @click.stop="toggleComplete(workout)"
                  class="btn-undo"
                  v-if="workout.completed && !workout.collapsed"
                  title="Rückgängig"
                >
                  ↶
                </button>
              </div>
            </div>

            <div v-if="!workout.collapsed" class="workout-controls">
              <div class="control-group compact" v-if="!workout.isSauna">
                <label>kg</label>
                <button @click="decrement(workout, 'kg')" class="btn-stepper-mini">−</button>
                <button 
                  @click="openPicker(workout, 'kg')"
                  class="picker-trigger"
                >
                  {{ workout.kg }}
                </button>
                <button @click="increment(workout, 'kg')" class="btn-stepper-mini">+</button>
              </div>

              <div class="control-group compact">
                <label>Sets</label>
                <button @click="decrement(workout, 'sets')" class="btn-stepper-mini">−</button>
                <button 
                  @click="openPicker(workout, 'sets')"
                  class="picker-trigger"
                >
                  {{ workout.sets }}
                </button>
                <button @click="increment(workout, 'sets')" class="btn-stepper-mini">+</button>
              </div>

              <div class="control-group compact" v-if="!workout.isCardio && !workout.isSauna">
                <label>Reps</label>
                <button @click="decrement(workout, 'reps')" class="btn-stepper-mini">−</button>
                <button 
                  @click="openPicker(workout, 'reps')"
                  class="picker-trigger"
                >
                  {{ workout.reps }}
                </button>
                <button @click="increment(workout, 'reps')" class="btn-stepper-mini">+</button>
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
        
        <div class="season-selector">
          <label>Saison:</label>
          <div class="season-chips">
            <button
              v-for="season in availableSeasons"
              :key="season"
              @click="selectSeason(season)"
              class="season-chip"
              :class="{ active: selectedSeason === season }"
            >
              {{ season }}
            </button>
            <button
              v-if="availableSeasons.length === 0"
              class="season-chip active"
            >
              {{ currentSeason }}
            </button>
          </div>
        </div>

        <div class="view-tabs">
          <button 
            @click="showSessionsView" 
            class="tab-btn"
            :class="{ active: historyView === 'sessions' }"
          >
            Sessions
          </button>
          <button 
            @click="showChartView" 
            class="tab-btn"
            :class="{ active: historyView === 'chart' }"
            :disabled="availableExercises.length === 0"
          >
            Gewicht Grafik
          </button>
        </div>

        <div v-if="historyView === 'sessions'" class="sessions-content">
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
            Keine Trainings in dieser Saison.
          </div>
        </div>

        <div v-else-if="historyView === 'chart'" class="chart-content">
          <div class="exercise-selector">
            <label>Übung:</label>
            <select 
              v-model="selectedExerciseId" 
              @change="selectExercise(selectedExerciseId)"
              class="exercise-select"
            >
              <option 
                v-for="exercise in availableExercises" 
                :key="exercise.id"
                :value="exercise.id"
              >
                {{ exercise.name }}
              </option>
            </select>
          </div>

          <div v-if="chartData.length > 0" class="chart-container">
            <div class="chart-stats">
              <div class="stat">
                <span class="stat-label">Min</span>
                <span class="stat-value">{{ chartStats.min }} kg</span>
              </div>
              <div class="stat">
                <span class="stat-label">Max</span>
                <span class="stat-value">{{ chartStats.max }} kg</span>
              </div>
              <div class="stat">
                <span class="stat-label">Aktuell</span>
                <span class="stat-value">{{ chartStats.latest }} kg</span>
              </div>
              <div class="stat">
                <span class="stat-label">Änderung</span>
                <span class="stat-value" :class="{ positive: chartStats.change > 0, negative: chartStats.change < 0 }">
                  {{ chartStats.change > 0 ? '+' : '' }}{{ chartStats.change }} kg
                </span>
              </div>
            </div>

            <svg class="weight-chart" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#007aff;stop-opacity:0.3" />
                  <stop offset="100%" style="stop-color:#007aff;stop-opacity:0" />
                </linearGradient>
              </defs>

              <!-- Grid lines -->
              <line v-for="i in 5" :key="'grid-' + i" 
                :x1="40" :y1="20 + (i - 1) * 40" 
                :x2="340" :y2="20 + (i - 1) * 40" 
                stroke="#38383a" stroke-width="0.5" />

              <!-- Y-axis labels -->
              <text v-for="(tick, i) in [chartStats.max, chartStats.max * 0.75, chartStats.max * 0.5, chartStats.max * 0.25, 0]"
                :key="'y-label-' + i"
                :x="35" 
                :y="24 + i * 40"
                text-anchor="end"
                font-size="10"
                fill="#8e8e93"
              >
                {{ Math.round(tick) }}
              </text>

              <!-- Chart line and area -->
              <template v-if="chartData.length > 1">
                <path
                  :d="getChartPath(true)"
                  fill="url(#lineGradient)"
                />
                <path
                  :d="getChartPath(false)"
                  fill="none"
                  stroke="#007aff"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </template>

              <!-- Data points -->
              <circle
                v-for="(point, i) in chartData"
                :key="'point-' + i"
                :cx="getX(i)"
                :cy="getY(point.kg)"
                r="4"
                fill="#007aff"
                stroke="#000"
                stroke-width="2"
              />
            </svg>

            <div class="chart-legend">
              <div class="legend-dates">
                <span class="date-start">{{ chartData[0].date }}</span>
                <span class="date-end">{{ chartData[chartData.length - 1].date }}</span>
              </div>
              <div class="legend-info">
                {{ chartData.length }} Trainings • {{ selectedExerciseName }}
              </div>
            </div>
          </div>

          <div v-else class="empty-state">
            Keine Gewichtsdaten für diese Übung in dieser Saison.
          </div>
        </div>
      </div>
    </main>

    <!-- Configurator Modal -->
    <div v-if="showConfigurator" class="modal-overlay" @click="closeConfigurator">
      <div class="modal-content configurator" @click.stop>
        <div class="modal-header">
          <h2>Geräte konfigurieren</h2>
          <button @click="closeConfigurator" class="btn-close">✕</button>
        </div>
        
        <div class="modal-body">
          <div class="config-actions">
            <button @click="enableAll" class="btn-secondary btn-small">Alle aktivieren</button>
            <button @click="disableAll" class="btn-secondary btn-small">Alle deaktivieren</button>
          </div>

          <div class="equipment-list">
            <label 
              v-for="equipment in allEquipmentList" 
              :key="equipment.id"
              class="equipment-item"
            >
              <input 
                type="checkbox" 
                :checked="equipment.enabled"
                @change="toggleEquipment(equipment.id)"
                class="equipment-checkbox"
              />
              <span class="equipment-info">
                <span class="equipment-name">{{ equipment.name }}</span>
                <span class="equipment-nr" v-if="equipment.nr">Nr. {{ equipment.nr }}</span>
              </span>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="closeConfigurator" class="btn-primary">Fertig</button>
        </div>
      </div>
    </div>

    <!-- Number Picker Modal (vue-scroll-picker) -->
    <div v-if="showPicker" class="picker-overlay" @click="closePicker">
      <div class="picker-modal" @click.stop>
        <div class="picker-header">
          <button @click="closePicker" class="picker-cancel">Abbrechen</button>
          <span class="picker-title">{{ pickerField === 'kg' ? 'Kilogramm' : pickerField === 'sets' ? 'Sets' : 'Reps' }}</span>
          <button @click="applyPickerValue" class="picker-done">Fertig</button>
        </div>
        <div class="picker-wheel-container">
          <VueScrollPicker 
            v-model="pickerValue"
            :options="getPickerRange(pickerField)"
            @update:modelValue="handlePickerChange"
          />
        </div>
      </div>
    </div>

    <!-- Machine Settings Modal -->
    <div v-if="showMachineSettings && editingMachine" class="picker-overlay" @click="closeMachineSettings">
      <div class="settings-modal" @click.stop>
        <div class="settings-header">
          <span class="settings-title">{{ editingMachine.name }}</span>
          <button @click="closeMachineSettings" class="settings-close">×</button>
        </div>
        <div class="settings-content">
          <div class="setting-row">
            <label>Ziel-Sätze (Target Sets)</label>
            <div class="setting-control">
              <button 
                @click="editingMachine.settings.targetSets = Math.max(2, editingMachine.settings.targetSets - 1)" 
                class="btn-stepper"
                :disabled="editingMachine.settings.targetSets <= 2"
              >−</button>
              <span class="setting-value">{{ editingMachine.settings.targetSets }}</span>
              <button 
                @click="editingMachine.settings.targetSets = Math.min(5, editingMachine.settings.targetSets + 1)" 
                class="btn-stepper"
                :disabled="editingMachine.settings.targetSets >= 5"
              >+</button>
            </div>
          </div>

          <div class="setting-row">
            <label>Gewichts-Schritte (Step Size)</label>
            <div class="setting-control">
              <button 
                @click="editingMachine.settings.stepSize = Math.max(1, editingMachine.settings.stepSize - 0.5)" 
                class="btn-stepper"
              >−</button>
              <span class="setting-value">{{ editingMachine.settings.stepSize }} kg</span>
              <button 
                @click="editingMachine.settings.stepSize = Math.min(10, editingMachine.settings.stepSize + 0.5)" 
                class="btn-stepper"
              >+</button>
            </div>
          </div>

          <div class="setting-row">
            <label>Anfangswert (Starting Weight)</label>
            <div class="setting-control">
              <button 
                @click="editingMachine.settings.startingKg = Math.max(0, editingMachine.settings.startingKg - editingMachine.settings.stepSize)" 
                class="btn-stepper"
              >−</button>
              <span class="setting-value">{{ editingMachine.settings.startingKg }} kg</span>
              <button 
                @click="editingMachine.settings.startingKg += editingMachine.settings.stepSize" 
                class="btn-stepper"
              >+</button>
            </div>
          </div>

          <div class="setting-row">
            <label>Zählrichtung (Count Direction)</label>
            <div class="setting-control">
              <button 
                @click="editingMachine.settings.countDirection = 'up'"
                class="btn-toggle"
                :class="{ active: editingMachine.settings.countDirection === 'up' }"
              >
                Hoch (↑)
              </button>
              <button 
                @click="editingMachine.settings.countDirection = 'down'"
                class="btn-toggle"
                :class="{ active: editingMachine.settings.countDirection === 'down' }"
              >
                Runter (↓)
              </button>
            </div>
          </div>

          <div class="settings-help">
            <p><strong>Ziel-Sätze:</strong> Wie viele Sets du anstrebst (2-5)</p>
            <p><strong>Gewichts-Schritte:</strong> Wie viel kg sich pro +/− ändern (typisch: 5 kg)</p>
            <p><strong>Anfangswert:</strong> Standard-Gewicht für neue Tage</p>
            <p><strong>Zählrichtung:</strong> Hoch = mehr kg ist besser (normal). Runter = weniger kg ist besser (z.B. Klimmzüge mit Unterstützung)</p>
          </div>

          <button @click="applyMachineSettings" class="btn-primary settings-save">Speichern</button>
        </div>
      </div>
    </div>
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

.header-left {
  display: flex;
  align-items: center;
  min-width: 44px;
}

.header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  flex: 1;
  text-align: center;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  min-width: 44px;
  justify-content: flex-end;
}

.btn-icon {
  width: 44px;
  height: 44px;
  background: var(--bg-tertiary);
  border: none;
  border-radius: 12px;
  font-size: 1.25rem;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:active {
  background: var(--border);
}

.main {
  padding: 1rem;
  max-width: 600px;
  margin: 0 auto;
}

.date-header {
  margin-bottom: 1rem;
}

.date-header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.date-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.btn-new-day {
  padding: 0.5rem 1rem;
  background: var(--success);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-new-day:active {
  transform: scale(0.95);
  opacity: 0.8;
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

.workout-card.collapsed {
  padding: 0.75rem 1rem;
}

.workout-card.collapsed:active {
  opacity: 0.95;
}

.workout-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.workout-header.clickable {
  cursor: pointer;
  user-select: none;
}

.workout-card.collapsed .workout-header {
  margin-bottom: 0;
}

.workout-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.title-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
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

.workout-summary {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  font-weight: 400;
  margin-top: 0.125rem;
}

.workout-controls {
  display: flex;
  gap: 0.375rem;
  flex-wrap: nowrap;
  justify-content: space-between;
}

.control-group {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.control-group.compact {
  flex: 1 1 0;
  min-width: 0;
  max-width: none;
  gap: 0.25rem;
}

.control-group label {
  display: block;
  font-size: 0.625rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-align: center;
  width: 100%;
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

.btn-stepper-mini {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  background: var(--bg-tertiary);
  border: none;
  border-radius: 6px;
  color: var(--accent);
  font-size: 1.125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-stepper-mini:active {
  background: var(--border);
}

.picker-trigger {
  flex: 1 1 auto;
  min-width: 44px;
  height: 44px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 1.125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.picker-trigger:active {
  background: var(--border);
  transform: scale(0.98);
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
.btn-undo,
.btn-settings {
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

.btn-settings {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 1.1rem;
}

.btn-settings:active {
  background: var(--bg-primary);
}

.btn-collapse {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-collapse:active {
  transform: scale(0.95);
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

.season-selector {
  margin-bottom: 1rem;
}

.season-selector label {
  display: block;
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.season-chips {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.season-chip {
  padding: 0.5rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 20px;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.season-chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.season-chip:active {
  transform: scale(0.95);
}

.view-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  background: var(--bg-secondary);
  padding: 0.25rem;
  border-radius: 10px;
}

.tab-btn {
  flex: 1;
  padding: 0.625rem;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.tab-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sessions-content {
  display: flex;
  flex-direction: column;
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

.chart-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.exercise-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.exercise-selector label {
  font-size: 0.875rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.exercise-select {
  width: 100%;
  padding: 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 500;
}

.chart-container {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 1rem;
}

.chart-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.stat-value.positive {
  color: var(--success);
}

.stat-value.negative {
  color: var(--danger);
}

.weight-chart {
  width: 100%;
  height: auto;
  margin: 1rem 0;
}

.chart-legend {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.legend-dates {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.legend-info {
  text-align: center;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* Number Picker */
.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 200;
  display: flex;
  align-items: flex-end;
  backdrop-filter: blur(4px);
}

.picker-modal {
  background: var(--bg-secondary);
  border-radius: 16px 16px 0 0;
  width: 100%;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
}

.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.picker-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.picker-cancel,
.picker-done {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.5rem;
}

.picker-cancel {
  color: var(--text-secondary);
}

.picker-wheel-container {
  flex: 1;
  overflow: hidden;
  padding: 0;
  height: 260px;
}

/* Override vue-scroll-picker styles for dark iOS theme */
.picker-wheel-container .vue-scroll-picker {
  height: 100%;
  background: transparent;
}

.picker-wheel-container .vue-scroll-picker-item {
  color: #8e8e93 !important;
  font-size: 1.25rem !important;
  height: 44px !important;
  line-height: 44px !important;
  opacity: 1 !important;
  z-index: 2;
}

.picker-wheel-container .vue-scroll-picker-item-selected {
  color: #ffffff !important;
  font-size: 1.5rem !important;
  font-weight: 600 !important;
  opacity: 1 !important;
}

.picker-wheel-container .vue-scroll-picker-layer {
  background: transparent !important;
  pointer-events: none;
}

.picker-wheel-container .vue-scroll-picker-layer-top,
.picker-wheel-container .vue-scroll-picker-layer-bottom {
  background: linear-gradient(to bottom, var(--bg-secondary), transparent) !important;
}

.picker-wheel-container .vue-scroll-picker-layer-bottom {
  background: linear-gradient(to top, var(--bg-secondary), transparent) !important;
}

.picker-wheel-container .vue-scroll-picker-layer-selection {
  background: var(--bg-tertiary) !important;
  border-top: 1px solid var(--border) !important;
  border-bottom: 1px solid var(--border) !important;
  z-index: 1;
}

@media (max-width: 400px) {
  .control-group:not(.compact) {
    flex: 1 1 calc(50% - 0.25rem);
    max-width: none;
  }
  
  .workout-controls {
    gap: 0.375rem;
  }
}

@media (min-width: 768px) {
  .control-group {
    min-width: 120px;
    max-width: 160px;
  }
}

/* Modal & Configurator */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--bg-secondary);
  border-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
}

.btn-close {
  width: 36px;
  height: 36px;
  background: var(--bg-tertiary);
  border: none;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 1.25rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-close:hover {
  background: var(--border);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.modal-footer {
  padding: 1rem;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

.btn-primary {
  padding: 0.75rem 2rem;
  background: var(--accent);
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:active {
  background: var(--accent-dark);
}

.btn-small {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
}

.config-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.equipment-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.equipment-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem;
  background: var(--bg-tertiary);
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.equipment-item:hover {
  background: var(--border);
}

.equipment-checkbox {
  width: 24px;
  height: 24px;
  cursor: pointer;
  accent-color: var(--accent);
}

.equipment-info {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.equipment-name {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
}

.equipment-nr {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* Machine Settings Modal */
.settings-modal {
  background: var(--bg-secondary);
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg-secondary);
  z-index: 10;
}

.settings-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-close {
  width: 36px;
  height: 36px;
  border: none;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 50%;
  font-size: 1.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding-bottom: 4px;
}

.settings-close:active {
  background: var(--border);
}

.settings-content {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.setting-row label {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 1rem;
  justify-content: space-between;
}

.setting-value {
  flex: 1;
  text-align: center;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-toggle {
  flex: 1;
  padding: 0.75rem;
  border: 2px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-toggle.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.settings-help {
  background: var(--bg-tertiary);
  border-radius: 12px;
  padding: 1rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.settings-help p {
  margin-bottom: 0.5rem;
}

.settings-help p:last-child {
  margin-bottom: 0;
}

.settings-help strong {
  color: var(--text-primary);
}

.settings-save {
  margin-top: 0.5rem;
}
</style>
