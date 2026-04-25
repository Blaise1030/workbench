<script setup lang="ts">
import { computed } from "vue";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-vue-next";
import type { Thread } from "@/shared/domain";
import { useQuery } from "@tanstack/vue-query";
import { useRoute } from "vue-router";
import AgentIcon from "@/components/ui/AgentIcon.vue";

const appContext = useAppContext();
const route = useRoute();
const projectId = computed(() => route.params.projectId as string);

const { data: threads } = useQuery({
  queryKey: ["threads", appContext, projectId],
  enabled: !!appContext.value.threadManagementService,
  queryFn: async () => {
    const threads = await appContext.value.threadManagementService.loadThreads(
      projectId.value,
    );
    const reduced = threads.reduce(
      (p, c) => {
        let newP = { ...p };
        if (newP[c.createdBranch ?? ""]) newP[c.createdBranch ?? ""].push(c);
        else newP = { ...newP, [c.createdBranch ?? ""]: [c] };
        return newP;
      },
      {} as Record<string, Thread[]>,
    );
    return Object.keys(reduced).map((key) => {
      return {
        label: key,
        threads: reduced[key]?.map((thread)=>({
          ...thread,
          threadPath: `/${projectId.value}/${thread.createdBranch}/thread/${thread.id}`,
        })),
      };
    });
  },
});
</script>

<template>
  <SidebarProvider>
    <Sidebar collapsible="offcanvas">      
      <SidebarHeader>
        Hello
      </SidebarHeader>
      <SidebarContent class="gap-0">
        <SidebarGroup v-for="value in threads">
          <Collapsible default-open class="group/collapsible">
            <SidebarGroupLabel as-child>
              <CollapsibleTrigger
                class="group/label w-full [&[data-state=open]>svg]:rotate-90">
                {{ value?.label }}
                <ChevronRight class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem v-for="thread in value?.threads" :key="thread?.id">
                    <SidebarMenuButton :title="thread?.title" size="sm" as-child class="whitespace-nowrap group-item" :is-active="route.path === thread.threadPath">                      
                      <RouterLink :to="thread?.threadPath">                        
                        <AgentIcon :agent="thread?.agent" />
                          <span class="truncate">
                            {{ thread?.title }}
                          </span>
                      </RouterLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>          
        </SidebarGroup>        
      </SidebarContent>      
      <SidebarFooter>
          Footer
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
    <SidebarInset>
      <RouterView />
    </SidebarInset>
  </SidebarProvider>
</template>