<script setup>
import { computed } from 'vue'
import { syncState, signIn, signOut, syncNow } from '../sync/index.js'

const label = computed(() => {
  switch (syncState.status) {
    case 'signed-out': return 'Nicht angemeldet – Daten nur auf diesem Gerät'
    case 'connecting': return 'Verbinde…'
    case 'syncing': return `Synchronisiere… (${syncState.pending})`
    case 'synced': return 'Synchronisiert ✓'
    case 'offline': return syncState.pending > 0 ? `Offline – ${syncState.pending} Änderung(en) warten` : 'Offline'
    case 'error': return 'Sync-Fehler'
    default: return 'Nur lokal'
  }
})
</script>

<template>
  <div v-if="syncState.available" class="sync-status" data-test="sync-status">
    <div class="sync-status-text">
      <strong>Cloud-Sync:</strong> {{ label }}
      <div v-if="syncState.user" class="sync-status-user">{{ syncState.user.email || syncState.user.displayName }}</div>
      <div v-if="syncState.error" class="sync-status-error">{{ syncState.error }}</div>
    </div>
    <div class="sync-status-actions">
      <button v-if="!syncState.user" type="button" class="btn-secondary btn-small" data-test="sync-signin" @click="signIn">
        Mit Google anmelden
      </button>
      <template v-else>
        <button type="button" class="btn-secondary btn-small" @click="syncNow">Sync</button>
        <button type="button" class="btn-secondary btn-small" data-test="sync-signout" @click="signOut">Abmelden</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sync-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 12px;
  border: 1px solid #333;
  border-radius: 8px;
  font-size: 13px;
}
.sync-status-user { opacity: 0.7; font-size: 12px; }
.sync-status-error { color: #ff6b6b; font-size: 12px; word-break: break-word; }
.sync-status-actions { display: flex; gap: 6px; flex-shrink: 0; }
</style>
