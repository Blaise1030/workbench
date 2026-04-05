"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const notificationService_1 = require("../notificationService");
(0, vitest_1.describe)("notification service", () => {
    (0, vitest_1.it)("maps states to tones", () => {
        const service = new notificationService_1.NotificationService();
        (0, vitest_1.expect)(service.getTone("done")).toBe("Do");
        (0, vitest_1.expect)(service.getTone("needsReview")).toBe("Mi");
        (0, vitest_1.expect)(service.getTone("failed")).toBe("Fa");
        (0, vitest_1.expect)(service.getTone("previewReady")).toBe("So");
    });
});
