import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SyncStatus from './SyncStatus.vue'
import { syncState, __resetSyncForTests } from '../sync/index.js'

describe('SyncStatus', () => {
  beforeEach(() => __resetSyncForTests())

  it('renders nothing in local-only mode', () => {
    const wrapper = mount(SyncStatus)
    expect(wrapper.find('[data-test="sync-status"]').exists()).toBe(false)
  })

  it('offers Google sign-in when Firebase is configured but signed out', async () => {
    syncState.available = true
    syncState.status = 'signed-out'
    const wrapper = mount(SyncStatus)
    expect(wrapper.find('[data-test="sync-signin"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('nur auf diesem Gerät')
  })

  it('shows account and status when signed in', async () => {
    Object.assign(syncState, { available: true, status: 'synced', user: { uid: 'u', email: 'marko@example.com' } })
    const wrapper = mount(SyncStatus)
    expect(wrapper.text()).toContain('Synchronisiert')
    expect(wrapper.text()).toContain('marko@example.com')
    expect(wrapper.find('[data-test="sync-signout"]').exists()).toBe(true)
  })
})
