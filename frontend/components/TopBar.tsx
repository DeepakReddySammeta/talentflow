"use client";

import { Bell } from "lucide-react";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/lib/hooks";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function TopBar() {
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = notifications?.filter((n) => !n.read).length || 0;

  return (
    <div className="flex justify-end px-8 py-3 border-b border-border bg-card">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-1 rounded-full bg-warning text-warning-foreground text-[10px] font-medium flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-primary hover:text-primary/80"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {notifications?.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">You&apos;re all caught up.</p>
            )}
            {notifications?.map((n) => (
              <Link
                key={n.id}
                href={n.link || "#"}
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id);
                }}
                className={`block px-4 py-3 text-sm hover:bg-muted transition-colors ${
                  n.read ? "text-muted-foreground" : "text-foreground font-medium bg-primary/5"
                }`}
              >
                {n.message}
                <p className="text-xs text-muted-foreground font-normal mt-0.5">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </Link>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
