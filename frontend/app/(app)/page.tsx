"use client";

import { useAuth } from "@/lib/authContext";
import { ChatWindow } from "@/components/ChatWindow";

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0">
        <ChatWindow greeting={user ? `Hi, ${user.name.split(" ")[0]}` : "Hi"} />
      </div>
    </div>
  );
}
