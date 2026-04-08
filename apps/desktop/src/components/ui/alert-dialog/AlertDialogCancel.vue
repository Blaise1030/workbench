<script setup lang="ts">
import type { AlertDialogCancelProps } from "reka-ui";
import { AlertDialogCancel } from "reka-ui";

const props = defineProps<AlertDialogCancelProps>();
</script>

<template>
  <AlertDialogCancel data-slot="alert-dialog-cancel" v-bind="props">
    <slot />
  </AlertDialogCancel>
</template>
