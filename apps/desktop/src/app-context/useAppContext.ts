import { inject, type Ref } from "vue"
import type { AppContext } from "./type"

export function useAppContext() {
    const appContext = inject<Ref<AppContext>>('appContext')
    if (!appContext) {
        throw new Error('AppContext not found')
    }
    return appContext
}