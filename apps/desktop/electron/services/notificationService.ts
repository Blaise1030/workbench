import { Notification } from "electron";

type NotificationKind = "done" | "needsReview" | "failed" | "previewReady";

export class NotificationService {
  getTone(kind: NotificationKind): string {
    if (kind === "done") return "Do";
    if (kind === "needsReview") return "Mi";
    if (kind === "failed") return "Fa";
    return "So";
  }

  getSummary(projectName: string, threadTitle: string, kind: NotificationKind): string {
    if (kind === "done") return `${projectName}, ${threadTitle} is done`;
    if (kind === "needsReview") return `${projectName}, ${threadTitle} needs approval`;
    if (kind === "failed") return `${projectName}, ${threadTitle} failed`;
    return `${projectName}, ${threadTitle} preview is ready`;
  }

  trigger(kind: NotificationKind, projectName: string, threadTitle: string): void {
    if (!Notification.isSupported()) return;
    const body = this.getSummary(projectName, threadTitle, kind);
    new Notification({ title: projectName, body }).show();
  }
}
