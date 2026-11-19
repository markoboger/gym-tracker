<script setup>
import { computed } from 'vue'
import { formatKg } from '../kg-step.js'

const props = defineProps({
  workout: { type: Object, required: true },
  step: { type: Number, required: true },
  derivedStep: { type: Number, default: null },
  manual: { type: Boolean, default: false },
  targetSets: { type: Number, required: true }
})

const emit = defineEmits([
  'adjust', 'step', 'reset-step', 'target-sets', 'sets', 'reps', 'open-list', 'close'
])

const stepLabel = computed(() => formatKg(props.step))
const showSetsReps = computed(() => !props.workout.isSauna && !props.workout.isCardio)
</script>

<template>
  <div class="picker-overlay kg-popup-overlay" data-test="kg-popup" @click="emit('close')">
    <div class="picker-modal kg-popup" @click.stop>
      <div class="picker-header">
        <button type="button" class="picker-cancel" data-test="kg-popup-list" @click="emit('open-list')">Liste</button>
        <span class="picker-title kg-popup-title">{{ workout.nr ? `${workout.nr} · ` : '' }}{{ String(workout.name).trim() }}</span>
        <button type="button" class="picker-done" data-test="kg-popup-done" @click="emit('close')">Fertig</button>
      </div>

      <div class="kg-popup-main">
        <button type="button" class="kg-btn kg-btn-minus" data-test="kg-minus" @click="emit('adjust', -step)">−{{ stepLabel }}</button>
        <div class="kg-value" data-test="kg-value">{{ formatKg(workout.kg ?? 0) }}<span class="kg-unit">kg</span></div>
        <button type="button" class="kg-btn kg-btn-plus" data-test="kg-plus" @click="emit('adjust', step)">+{{ stepLabel }} kg</button>
      </div>

      <div class="kg-popup-row" data-test="kg-step">
        <span class="kg-popup-label">Schritt Δ</span>
        <button type="button" class="btn-stepper-mini" data-test="kg-step-minus" @click="emit('step', -1)">−</button>
        <span class="kg-popup-value">{{ stepLabel }} kg</span>
        <button type="button" class="btn-stepper-mini" data-test="kg-step-plus" @click="emit('step', 1)">+</button>
        <button
          v-if="manual"
          type="button"
          class="kg-step-auto"
          data-test="kg-step-auto"
          @click="emit('reset-step')"
        >Auto{{ derivedStep ? ` (${formatKg(derivedStep)})` : '' }}</button>
        <span v-else class="kg-step-hint">auto</span>
      </div>

      <template v-if="showSetsReps">
        <div class="kg-popup-row">
          <span class="kg-popup-label">Sets soll</span>
          <button type="button" class="btn-stepper-mini" :disabled="targetSets <= 2" @click="emit('target-sets', -1)">−</button>
          <span class="kg-popup-value">{{ targetSets }}</span>
          <button type="button" class="btn-stepper-mini" :disabled="targetSets >= 5" @click="emit('target-sets', 1)">+</button>
          <span class="kg-step-hint" aria-hidden="true"></span>
        </div>
        <div class="kg-popup-row">
          <span class="kg-popup-label">Sets ist</span>
          <button type="button" class="btn-stepper-mini" data-test="kg-popup-sets-minus" @click="emit('sets', -1)">−</button>
          <span class="kg-popup-value" data-test="kg-popup-sets">{{ workout.sets || 0 }}</span>
          <button type="button" class="btn-stepper-mini" data-test="kg-popup-sets-plus" @click="emit('sets', 1)">+</button>
          <span class="kg-step-hint" aria-hidden="true"></span>
        </div>
        <div class="kg-popup-row">
          <span class="kg-popup-label">Reps</span>
          <button type="button" class="btn-stepper-mini" @click="emit('reps', -1)">−</button>
          <span class="kg-popup-value">{{ workout.reps }}</span>
          <button type="button" class="btn-stepper-mini" @click="emit('reps', 1)">+</button>
          <span class="kg-step-hint" aria-hidden="true"></span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.kg-popup { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
.kg-popup-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55%; }
.kg-popup-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 18px 16px 12px;
}
.kg-value { font-size: 44px; font-weight: 700; text-align: center; flex: 1; font-variant-numeric: tabular-nums; }
.kg-unit { font-size: 16px; font-weight: 500; opacity: 0.6; margin-left: 4px; }
.kg-btn {
  border: none;
  border-radius: 14px;
  font-size: 18px;
  font-weight: 700;
  padding: 16px 12px;
  min-width: 88px;
  color: #fff;
  cursor: pointer;
}
.kg-btn-minus { background: #3a3a3c; }
.kg-btn-plus { background: #34c759; min-width: 110px; font-size: 20px; }
.kg-btn:active { transform: scale(0.96); }
.kg-popup-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.kg-popup-label { flex: 1; font-size: 15px; opacity: 0.8; }
.kg-popup-value { min-width: 56px; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
.kg-step-auto, .kg-step-hint { font-size: 12px; min-width: 64px; text-align: center; }
.kg-step-auto { background: transparent; border: 1px solid #555; color: inherit; border-radius: 8px; padding: 4px 6px; }
.kg-step-hint { opacity: 0.5; }
</style>
