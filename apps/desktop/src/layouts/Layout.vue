<script setup lang="ts">
import { computed, ref } from "vue";
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
import { ChevronRight } from "lucide-vue-next";
import type { Project, Thread } from "@/shared/domain";
import { useQuery } from "@tanstack/vue-query";
import { useRoute } from "vue-router";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import { Button } from "@/components/ui/button";

const appContext = useAppContext();
const route = useRoute();
const projectId = computed(() => route.params.projectId as string);
const branchId = computed(() => route.params.branch as string);

const showMoreToggleState = ref<{ [k: string]: boolean }>({});

const { data: threadsGroup } = useQuery({
  queryKey: ["worktrees", appContext, projectId],
  enabled: !!appContext.value.gitService,
  queryFn: async () => {
    const res = (await window.workspaceApi?.getSnapshot()) as {
      projects: Project[];
    };
    const currentProject = res.projects?.find((p) => p.id === projectId.value);
    const path = currentProject?.repoPath!!;
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
      <SidebarHeader> Hello </SidebarHeader>
      <SidebarContent class="gap-0 flex flex-col">
        <SidebarGroup v-for="value in threadsGroup" class="gap-0 flex flex-col">
          <Collapsible default-open class="group/collapsible p-0">
            <SidebarGroupLabel as-child>
              <CollapsibleTrigger
                class="group/label w-full [&[data-state=open]>svg]:rotate-90"
              >
                <ChevronRight
                  class="transition-transform group-data-[state=open]/collapsible:rotate-90 mr-1"
                />
                {{ value?.branch }}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
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
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem
                    v-for="thread in showMoreToggleState[value?.branch] ? value?.threads : value?.threads?.splice(0, 10)"
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
                    size="sm"
                    variant="link"
                    class="w-fit bg-background underline"
                    @click="showMoreToggleState[value?.branch] = !Boolean(showMoreToggleState[value?.branch])"
                  >
                    Show {{ showMoreToggleState[value?.branch]? 'less': 'all' }} ({{ value?.threads?.splice(10)?.length }})
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
