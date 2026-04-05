"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
class NotificationService {
    getTone(kind) {
        if (kind === "done")
            return "Do";
        if (kind === "needsReview")
            return "Mi";
        if (kind === "failed")
            return "Fa";
        return "So";
    }
    getSummary(projectName, threadTitle, kind) {
        if (kind === "done")
            return `${projectName}, ${threadTitle} is done`;
        if (kind === "needsReview")
            return `${projectName}, ${threadTitle} needs approval`;
        if (kind === "failed")
            return `${projectName}, ${threadTitle} failed`;
        return `${projectName}, ${threadTitle} preview is ready`;
    }
}
exports.NotificationService = NotificationService;
