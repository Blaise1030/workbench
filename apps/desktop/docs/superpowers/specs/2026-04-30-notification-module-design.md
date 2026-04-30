# Notification Module Design

**Date:** 2026-04-30  
**Status:** Approved

## Overview

App-level notification infrastructure. Any module can push a notification through a standard API. Notifications are stored reactively in a Pinia store, persisted to localStorage (capped at 20), and rendered as sonner toasts as a side-effect of creation.

## Data Shape

```ts
type NotificationType = 'info' | 'success' | 'warning' | 'error'
type NotificationStatus = 'unread' | 'read' | 'dismissed'

interface NotificationRecord {
  id: string               // crypto.randomUUID()
  title: string
  description: string
  type: NotificationType
  status: NotificationStatus
  createdAt: number        // Date.now()
  url?: string             // optional vue-router path; toast renders a navigate action
}
```

## Architecture

### `src/stores/notificationStore.ts`

Pinia store. Single source of truth for the notification list.

- **State**: `notifications: NotificationRecord[]` — newest-first, max 20 items
- **Hydration**: reads from localStorage key `instrument.notifications` on store init
- **Persistence**: writes back to localStorage after every mutation
- **Cap enforcement**: when a new notification would exceed 20, the oldest entry is dropped (FIFO)
- **Actions**: `add`, `patch`, `remove`, `clear`

### `src/composables/useNotifications.ts`

Public API consumed by all feature modules. No module imports the store directly.

| Export | Type | Description |
|---|---|---|
| `push(payload)` | `(p: Omit<NotificationRecord, 'id' \| 'status' \| 'createdAt'>) => string` | Creates record with status `'unread'`, fires sonner toast, returns `id` |
| `update(id, patch)` | `(id: string, patch: Partial<Pick<NotificationRecord, 'title' \| 'description' \| 'type' \| 'status' \| 'url'>>) => void` | Patches an existing record |
| `markRead(id)` | `(id: string) => void` | Shorthand — sets `status` to `'read'` |
| `remove(id)` | `(id: string) => void` | Removes from store and dismisses the sonner toast |
| `notifications` | `ComputedRef<NotificationRecord[]>` | Reactive list, newest-first |
| `unreadCount` | `ComputedRef<number>` | Count of records with `status === 'unread'` |

### Sonner Integration

`push()` calls `toast[type](title, { description, action? })` as a side-effect.  
When `url` is provided, the toast renders an `action` button labelled `"Go"` that calls `router.push(url)`.  
`remove(id)` calls `toast.dismiss(id)` in addition to removing from the store.

## Persistence

- **Key**: `instrument.notifications`
- **Format**: JSON array of `NotificationRecord[]`
- **Cap**: 20 items, newest-first. On overflow, the last item is dropped before writing.
- **Hydration**: on store `$onAction` / init, reads and validates the array; invalid/malformed entries are silently skipped.

## Convention

Feature modules must only interact via the composable:

```ts
// In any module
const { push, markRead, remove } = useNotifications()

// Create
const id = push({ title: 'Build complete', description: 'main.ts compiled', type: 'success' })

// Create with navigation
push({ title: 'Agent finished', description: 'Thread ready', type: 'info', url: '/proj/main/thread/abc' })

// Update
update(id, { description: 'Updated description' })

// Mark read
markRead(id)

// Delete
remove(id)
```

Direct imports of `notificationStore` from feature modules are not allowed.

## Files to Create

| File | Purpose |
|---|---|
| `src/stores/notificationStore.ts` | Pinia store — state, localStorage hydration/persistence, cap logic |
| `src/composables/useNotifications.ts` | Public CRUD API + sonner side-effects |

No changes to `App.vue` or `useToast.ts` are required — `<Toaster />` is already mounted.
