<script setup lang="ts">
import type { AlertDialogActionProps } from "reka-ui";
import { AlertDialogAction } from "reka-ui";

const props = defineProps<AlertDialogActionProps>();
</script>

<template>
  <AlertDialogAction data-slot="alert-dialog-action" v-bind="props">
    <slot />
  </AlertDialogAction>
</template>
