"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsList = React.forwardRef<React.ElementRef<typeof T.List>, React.ComponentPropsWithoutRef<typeof T.List>>(({ className, ...p }, ref) => (
  <T.List ref={ref} className={cn("flex w-full gap-5 overflow-x-auto border-b", className)} {...p} />
));
TabsList.displayName = "TabsList";
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof T.Trigger>, React.ComponentPropsWithoutRef<typeof T.Trigger>>(({ className, ...p }, ref) => (
  <T.Trigger
    ref={ref}
    className={cn(
      "-mb-px whitespace-nowrap border-b-2 border-transparent pb-2.5 pt-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none data-[state=active]:border-foreground data-[state=active]:font-medium data-[state=active]:text-foreground",
      className
    )}
    {...p}
  />
));
TabsTrigger.displayName = "TabsTrigger";
export const TabsContent = T.Content;
