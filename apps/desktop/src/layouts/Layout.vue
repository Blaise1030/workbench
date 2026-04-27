<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useAppContext } from "@/app-context/useAppContext";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ButtonGroup } from "@/components/ui/button-group";
import { ChevronRight, PlusIcon, ChevronLeft } from "lucide-vue-next";
import type { Project, Thread } from "@/shared/domain";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { useRoute, useRouter } from "vue-router";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import { Button } from "@/components/ui/button";
import Switch from "@/components/ui/Switch.vue";
import Label from "@/components/ui/label/Label.vue";
import TrackedBranchSelector from "@/components/TrackedBranchSelector.vue";
import SidebarTrigger from "@/components/ui/sidebar/SidebarTrigger.vue";

const appContext = useAppContext();
const queryClient = useQueryClient();
const route = useRoute();
const router = useRouter();
const projectId = computed(() => route.params.projectId as string);

function onNavigateBack() {  
  router.back();
}

function onNavigateForward() {  
  router.forward();
}
const branchId = computed(() => route.params.branch as string);
const showMoreToggleState = ref<{ [k: string]: boolean }>({});

const { data: projectPath } = useQuery({
  queryKey: ["projectPath", appContext],
  enabled: !!appContext.value.gitService,
  queryFn: async () => {
    const res = (await window.workspaceApi?.getSnapshot()) as {
      projects: Project[];
    };
    const currentProject = res.projects?.find((p) => p.id === projectId.value);
    return currentProject?.repoPath!! ?? "";
  },
});

const { data: threadsGroup } = useQuery({
  queryKey: ["worktrees", appContext],
  enabled: !!appContext.value.gitService,
  queryFn: async () => {
    const res = (await window.workspaceApi?.getSnapshot()) as {
      projects: Project[];
    };
    const currentProject = res.projects?.find((p) => p.id === projectId.value);
    const path = currentProject?.repoPath!! ?? "";
    const worktrees = await appContext.value.gitService.listWorktrees(path);
    const threads = await appContext.value.threadManagementService.loadThreads(
      projectId.value,
    );
    const threadsMap = threads.reduce(
      (p, c) => {
        let newP = { ...p };
        if (newP[c.createdBranch ?? ""]) newP[c.createdBranch ?? ""].push(c);
        else newP = { ...newP, [c.createdBranch ?? ""]: [c] };
        return newP;
      },
      {} as Record<string, Thread[]>,
    );

    return worktrees.map(({ path, branch }) => ({
      path,
      branch,
      threads: (threadsMap[branch] ?? [])?.map((thread) => ({
        ...thread,
        threadPath: `/${projectId.value}/${thread.createdBranch}/thread/${thread.id}`,
      })),
    }));
  },
});
</script>

<template>
  <SidebarProvider>
    <Sidebar collapsible="offcanvas">
      <SidebarHeader class="flex justify-end w-full gap-2">        
        <div class="flex items-center gap-1 justify-end">
          <SidebarTrigger class="border" />
          <ButtonGroup>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"              
              aria-label="Back"
              @click="onNavigateBack"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Forward"
              @click="onNavigateForward"
            >
              <ChevronRight />
            </Button>
          </ButtonGroup>
        </div>        
      </SidebarHeader>
      <SidebarContent class="gap-0 flex flex-col">
        <SidebarGroup
          v-for="(value, index) in threadsGroup"
          class="gap-0 flex flex-col"
          :class="index === 0 ? 'px-1' : ''"
        >
          <Collapsible default-open class="group/collapsible p-0">
            <SidebarGroupLabel as-child class="px-0">
              <div v-if="index === 0" class="flex gap-0.5">
                <CollapsibleTrigger                
                  class="group/label bg-transparent aria-expanded:bg-transparent flex [&[data-state=open]>svg]:rotate-90"
                  as-child
                >
                  <Button size="icon-sm" variant="ghost" class="bg-transparent">
                    <ChevronRight
                      class="transition-transform size-4 group-data-[state=open]/collapsible:rotate-90"
                    />                    
                  </Button>
                </CollapsibleTrigger>
                <div class="flex-1">
                  <TrackedBranchSelector
                    v-if="projectPath"
                    :cwd="projectPath"
                    @branch-changed="
                      void queryClient.invalidateQueries({ queryKey: ['worktrees'] })
                    "
                  />
                </div>
                <Button size="icon-sm" variant="ghost">
                  <PlusIcon />
                </Button>
              </div>              
              <CollapsibleTrigger
                v-else
                class="group/label w-full flex [&[data-state=open]>svg]:rotate-90"
              >               
                <ChevronRight
                  class="transition-transform group-data-[state=open]/collapsible:rotate-90 mr-1"
                />
                {{ value?.branch }}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <div class="gap-2 py-1 flex flex-col px-1.5">
                <div class="flex gap-1" v-if="index === 0">
                  <Switch />
                  <Label class="text-muted-foreground"
                    >Threads from this branch only</Label
                  >
                </div>
                <div class="pb-1 flex gap-0.5" v-if="branchId === value.branch">
                  <Button
                    size="sm"
                    variant="outline"
                    as-child
                    class="bg-background"
                  >
                    <RouterLink to="/"> Agent </RouterLink>
                  </Button>
                  <Button size="sm" variant="ghost">
                    <RouterLink to="/"> Git </RouterLink>
                  </Button>
                  <Button size="sm" variant="ghost"> Files </Button>
                  <Button size="sm" variant="ghost"> Preview </Button>
                </div>
              </div>

              <SidebarGroupContent>
                <SidebarMenu :class="index === 0 ? 'px-1' : ''">
                  <SidebarMenuItem
                    v-for="thread in showMoreToggleState[value?.branch]
                      ? value?.threads
                      : value?.threads?.splice(0, 10)"
                    :key="thread?.id"
                  >
                    <SidebarMenuButton
                      :title="thread?.title"
                      size="sm"
                      as-child
                      class="whitespace-nowrap group-item"
                      :is-active="route.path === thread.threadPath"
                    >
                      <RouterLink :to="thread?.threadPath">
                        <AgentIcon :agent="thread?.agent" />
                        <span class="truncate">
                          {{ thread?.title }}
                        </span>
                      </RouterLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <Button
                    v-if="value?.threads.length > 10"
                    size="xs"
                    variant="link"
                    class="w-fit underline"
                    @click="
                      showMoreToggleState[value?.branch] = !Boolean(
                        showMoreToggleState[value?.branch],
                      )
                    "
                  >
                    Show
                    {{ showMoreToggleState[value?.branch] ? "less" : "all" }}
                    ({{ value?.threads?.splice(10)?.length }})
                  </Button>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter> Footer </SidebarFooter>
      <SidebarRail />
    </Sidebar>
    <SidebarInset>
      <RouterView />
    </SidebarInset>
  </SidebarProvider>
</template>
