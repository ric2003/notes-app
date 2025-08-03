"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import Note, { NoteProps } from "@/components/Note";
import UserProfiles from "@/components/UserProfiles";
import { PlusIcon, PencilIcon } from "lucide-react";

interface NoteData {
  id: string;
  content: string;
  color: string;
  position_x: number;
  position_y: number;
}

export default function Home() {
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 20, y: 20 });
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [pendingUpdates, setPendingUpdates] = useState<
    Map<string, Partial<NoteData>>
  >(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  function randomColor() {
    const colors: NoteProps["color"][] = [
      "blue",
      "green",
      "pink",
      "purple",
      "orange",
      "yellow",
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  async function loadNotes() {
    const { data, error } = await supabase.from("notes").select("*");
    if (error) {
      console.error("Error loading notes:", error);
      return;
    }
    setNotes(data || []);
  }

  async function syncPendingUpdates() {
    if (pendingUpdates.size === 0) return;

    console.log(`Syncing ${pendingUpdates.size} pending updates...`);

    for (const [noteId, updates] of pendingUpdates.entries()) {
      try {
        await supabase.from("notes").update(updates).eq("id", noteId);
        console.log(`Synced update for note ${noteId}`);
      } catch (error) {
        console.error(`Failed to sync update for note ${noteId}:`, error);
      }
    }

    // Clear pending updates after syncing
    setPendingUpdates(new Map());
  }

  async function createBox(x: number, y: number) {
    // Try to reconnect if not connected
    if (!isConnected) {
      console.log(
        "Not connected, attempting to reconnect before creating note..."
      );
      if (subscription) {
        subscription.unsubscribe();
      }
      const newSub = setupRealtimeSubscription();
      setSubscription(newSub);

      // Poll for connection and retry when connected
      const checkConnection = setInterval(() => {
        if (isConnected) {
          clearInterval(checkConnection);
          createBox(x, y);
        }
      }, 500);

      // Cancel after 5 seconds if still not connected
      setTimeout(() => {
        clearInterval(checkConnection);
        if (!isConnected) {
          console.log("Connection timeout, note creation cancelled");
        }
      }, 5000);
      return;
    }

    const newNote = {
      content: "New Note",
      color: randomColor(),
      position_x: x,
      position_y: y,
    };

    try {
      const { data: newNoteData, error } = await supabase
        .from("notes")
        .insert(newNote)
        .select();

      if (error) {
        console.error("Failed to create note in database:", error.message);
        return;
      }

      if (newNoteData) {
        setNotes((prev) => [...prev, newNoteData[0]]);
      }
    } catch (error) {
      console.error("Error creating note:", error);
    }
  }

  async function updateNoteInDatabase(
    noteId: string,
    updates: Partial<NoteData>
  ) {
    // Check if we're connected before making changes
    if (!isConnected) {
      // Try to reconnect first
      console.log("Not connected, attempting to reconnect...");
      if (subscription) {
        subscription.unsubscribe();
      }
      const newSub = setupRealtimeSubscription();
      setSubscription(newSub);

      // Poll for connection and retry when connected
      const checkConnection = setInterval(() => {
        if (isConnected) {
          clearInterval(checkConnection);
          updateNoteInDatabase(noteId, updates);
        }
      }, 500);

      // Cancel after 5 seconds if still not connected
      setTimeout(() => {
        clearInterval(checkConnection);
        if (!isConnected) {
          console.log("Connection timeout, update cancelled");
        }
      }, 5000);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("notes")
        .update(updates)
        .eq("id", noteId)
        .select();

      if (error) {
        console.error("Error updating note:", error);
        return;
      }

      if (data) {
        setNotes((prev) =>
          prev.map((note) =>
            note.id === noteId ? { ...note, ...updates } : note
          )
        );
      }
    } catch (error) {
      console.error("Error updating note:", error);
    }
  }

  async function deleteNote(noteId: string) {
    // Try to reconnect if not connected
    if (!isConnected) {
      console.log(
        "Not connected, attempting to reconnect before deleting note..."
      );
      if (subscription) {
        subscription.unsubscribe();
      }
      const newSub = setupRealtimeSubscription();
      setSubscription(newSub);

      // Poll for connection and retry when connected
      const checkConnection = setInterval(() => {
        if (isConnected) {
          clearInterval(checkConnection);
          deleteNote(noteId);
        }
      }, 500);

      // Cancel after 5 seconds if still not connected
      setTimeout(() => {
        clearInterval(checkConnection);
        if (!isConnected) {
          console.log("Connection timeout, note deletion cancelled");
        }
      }, 5000);
      return;
    }

    try {
      const { error } = await supabase.from("notes").delete().eq("id", noteId);

      if (error) {
        console.error("Error deleting note:", error);
        return;
      }

      setNotes((prev) => prev.filter((note) => note.id !== noteId));
    } catch (error) {
      console.error("Error deleting note:", error);
    }
  }

  function handleMouseDown(e: React.MouseEvent, noteId: string) {
    const target = e.target as HTMLElement;
    if (target.closest(".note-drag-handle")) {
      setIsDragging(noteId);
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isDragging && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const newX = e.clientX - containerRect.left - dragOffset.x;
      const newY = e.clientY - containerRect.top - dragOffset.y;

      setNotes((prev) =>
        prev.map((note) =>
          note.id === isDragging
            ? { ...note, position_x: newX, position_y: newY }
            : note
        )
      );
    }
  }

  function handleMouseUp() {
    if (isDragging) {
      const note = notes.find((n) => n.id === isDragging);
      if (note) {
        const updates = {
          position_x: note.position_x,
          position_y: note.position_y,
        };

        if (isConnected) {
          // If connected, update database immediately
          updateNoteInDatabase(isDragging, updates);
        } else {
          // If offline, store update for later sync
          console.log(`Storing pending update for note ${isDragging}`);
          setPendingUpdates((prev) => new Map(prev.set(isDragging, updates)));
        }
      }
      setIsDragging(null);
    }
  }

  function handleNoteChange(noteId: string, content: string) {
    updateNoteInDatabase(noteId, { content });
  }

  function handleNoteEdit(noteId: string) {
    setEditingNote(noteId);
  }

  function handleNoteDelete(noteId: string) {
    deleteNote(noteId);
  }

  function handleColorChange(noteId: string, newColor: string) {
    updateNoteInDatabase(noteId, { color: newColor });
  }

  function handleDragStart(e: React.DragEvent, noteId: string) {
    setIsDragging(noteId);
  }

  useEffect(() => {
    loadNotes();
    const sub = setupRealtimeSubscription();
    setSubscription(sub);

    // Handle browser tab visibility to maintain connection
    const handleVisibilityChange = () => {
      if (
        !document.hidden &&
        (!subscription || subscription.state !== "SUBSCRIBED")
      ) {
        // Tab became visible and we're not connected, reconnect
        setTimeout(() => {
          if (subscription) {
            subscription.unsubscribe();
          }
          const newSub = setupRealtimeSubscription();
          setSubscription(newSub);
        }, 100);
      }
    };

    // Listen for tab visibility changes
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sub) {
        sub.unsubscribe();
      }
    };
  }, []);

  function setupRealtimeSubscription() {
    const subscription = supabase
      .channel("notes-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
        },
        (payload) => {
          // If we receive any data, we know we're connected
          setIsConnected(true);
          setLastActivity(Date.now());

          if (payload.eventType === "INSERT") {
            const note = payload.new as NoteData;
            setNotes((prev) => [...prev, note]);
          } else if (payload.eventType === "UPDATE") {
            const note = payload.new as NoteData;
            setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
          } else if (payload.eventType === "DELETE") {
            const noteId = payload.old.id;
            setNotes((prev) => prev.filter((n) => n.id !== noteId));
          }
        }
      )
      .subscribe((status) => {
        console.log("Subscription status:", status);
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
          // Reload notes from database when reconnecting to get latest state
          loadNotes();
          // Sync any pending updates that happened while offline
          syncPendingUpdates();
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setIsConnected(false);
        }
      });

    return subscription;
  }

  return (
    <div className="p-4 h-screen w-screen">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => createBox(10, 10)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-black rounded-lg cursor-pointer hover:bg-gray-100"
        >
          <PlusIcon className="w-4 h-4" />
          <PencilIcon className="w-4 h-4" />
          Create Note
        </button>
        <UserProfiles isConnected={isConnected} />
      </div>
      <div
        ref={containerRef}
        className="relative w-full h-[90vh] border border-black rounded-lg overflow-hidden bg-white"
        style={{
          backgroundImage: `
              linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)
            `,
          backgroundSize: "20px 20px",
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {notes.map((note) => (
          <div
            key={note.id}
            className="note-draggable absolute"
            style={{
              transform: `translate3d(${note.position_x}px, ${note.position_y}px, 0)`,
            }}
            onMouseDown={(e) => handleMouseDown(e, note.id)}
          >
            <Note
              id={note.id}
              title="Note"
              content={note.content}
              color={(note.color as NoteProps["color"]) || "blue"}
              isEditing={editingNote === note.id}
              onEdit={handleNoteEdit}
              onDelete={handleNoteDelete}
              onContentChange={handleNoteChange}
              onEditSave={() => setEditingNote(null)}
              onColorChange={handleColorChange}
              onDragStart={handleDragStart}
              className={isDragging === note.id ? "opacity-50" : ""}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
