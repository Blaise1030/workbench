import type { AppNotification, AppNotificationKind } from "../../src/shared/domain.js";

type DatabaseInstance = import("better-sqlite3").Database;

const MAX_NOTIFICATIONS = 20;

type NotificationRow = {
  id: string;
  thread_id: string;
  project_id: string;
  kind: string;
  thread_title: string;
  project_name: string;
  read: number;
  created_at: string;
};

function rowToNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    threadId: row.thread_id,
    projectId: row.project_id,
    kind: row.kind as AppNotificationKind,
    threadTitle: row.thread_title,
    projectName: row.project_name,
    read: row.read === 1,
    createdAt: row.created_at,
  };
}

export class NotificationStore {
  constructor(private readonly db: DatabaseInstance) {}

  add(notification: AppNotification): void {
    this.db
      .prepare(
        `INSERT INTO notifications (id, thread_id, project_id, kind, thread_title, project_name, read, created_at)
         VALUES (@id, @threadId, @projectId, @kind, @threadTitle, @projectName, @read, @createdAt)`
      )
      .run({
        id: notification.id,
        threadId: notification.threadId,
        projectId: notification.projectId,
        kind: notification.kind,
        threadTitle: notification.threadTitle,
        projectName: notification.projectName,
        read: notification.read ? 1 : 0,
        createdAt: notification.createdAt,
      });
    this.db
      .prepare(
        `DELETE FROM notifications WHERE id NOT IN (
           SELECT id FROM notifications ORDER BY created_at DESC LIMIT ${MAX_NOTIFICATIONS}
         )`
      )
      .run();
  }

  list(): AppNotification[] {
    const rows = this.db
      .prepare(
        `SELECT id, thread_id, project_id, kind, thread_title, project_name, read, created_at
         FROM notifications
         ORDER BY created_at DESC`
      )
      .all() as NotificationRow[];
    return rows.map(rowToNotification);
  }

  markRead(id: string): void {
    this.db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(id);
  }

  markAllRead(): void {
    this.db.prepare("UPDATE notifications SET read = 1").run();
  }
}
