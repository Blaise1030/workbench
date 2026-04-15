// Phi-3.5-mini has significantly better instruction-following than Llama-3.2-1B
// at a comparable download size (~2.2 GB vs ~0.7 GB) and handles structured
// output (commit subject lines) reliably without echoing prompt labels.
export const DEFAULT_MLC_MODEL_ID = "Phi-3.5-mini-instruct-q4f16_1-MLC" as const;
export const MAX_THREAD_TITLE_CHARS = 60;
export const MAX_USER_MESSAGE_FOR_TITLE_CHARS = 8000;
export const COMMIT_CANDIDATE_COUNT = 1;
