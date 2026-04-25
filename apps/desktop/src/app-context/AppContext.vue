<template>
    <slot />
</template>

<script setup lang="ts">
import { onMounted, provide, ref } from 'vue';
import type { AppContext, AppMode } from './type';
import { IpcThreadManagementService } from '@/services/thread-management/ipcThreadManagementService';

const props = defineProps<{mode: AppMode}>()
const services = ref<AppContext>()

onMounted(() => {
    if (props.mode === 'desktop') {
        services.value = {
            mode: props.mode,
            threadManagementService: new IpcThreadManagementService()
        }
    }
})

provide('appContext', services)
</script>