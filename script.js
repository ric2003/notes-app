const supabaseUrl = "https://havgnqcvnkdgiqojmbvh.supabase.co";
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function randomColor() {
  return `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(
    Math.random() * 256
  )}, ${Math.floor(Math.random() * 256)})`;
}

function turnBoxDifferentColor(boxElement) {
  boxElement.style.backgroundColor = randomColor();
}

const container = document.querySelector(".container");

async function loadNotes() {
  const { data, error } = await supabaseClient.from("notes").select("*");
  if (error) {
    console.error("Error loading notes:", error);
    return;
  }
  data.forEach((note) => {
    createBoxElement(
      note.position_x,
      note.position_y,
      note.color,
      note.content,
      note.id
    );
  });
  return data;
}
document.addEventListener("DOMContentLoaded", () => {
  loadNotes();
  setupRealtimeSubscription();
});

function createBoxElement(x, y, color, content, noteId) {
  const box = document.createElement("div");
  box.className = "box";
  box.style.backgroundColor = color || randomColor();
  box.style.transform = `translate3d(${x}px, ${y}px, 0)`;

  const dragHandle = document.createElement("div");
  dragHandle.className = "drag-handle";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type your note here...";
  input.value = content || "";
  box.appendChild(dragHandle);
  box.appendChild(input);

  if (noteId) {
    box.dataset.noteId = noteId;
    setupBoxEventListeners(box, noteId);
  }

  container.appendChild(box);
  return box;
}

// Function to create new note (for the button click)
async function createBox(x, y, color, content) {
  const box = createBoxElement(x, y, color, content);

  try {
    const { data: newNoteData, error } = await supabaseClient
      .from("notes")
      .insert({
        content: content || "",
        color: box.style.backgroundColor,
        position_x: x,
        position_y: y,
        // user_id: userId, //TODO come back to this when i set up auth
      })
      .select();

    if (error) {
      console.error("Failed to create note in database:", error.message);
      box.remove();
      return;
    }

    const newNote = newNoteData[0];
    box.dataset.noteId = newNote.id;
    setupBoxEventListeners(box, newNote.id);
    console.log("New note created:", newNote);
  } catch (error) {
    console.error("Error creating note:", error);
    box.remove();
  }
}

async function updateNoteInDatabase(noteId, updates) {
  try {
    const { data, error } = await supabaseClient
      .from("notes")
      .update(updates)
      .eq("id", noteId)
      .select();

    if (error) {
      console.error("Error updating note:", error);
      return;
    }

    return data[0];
  } catch (error) {
    console.error("Error updating note:", error);
  }
}

function setupBoxEventListeners(box, noteId) {
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;

  // Get the current position from the transform
  const transform = box.style.transform;
  const match = transform.match(/translate3d\(([^,]+)px,\s*([^,]+)px/);
  let xOffset = match ? parseInt(match[1]) : 0;
  let yOffset = match ? parseInt(match[2]) : 0;

  box.addEventListener("mousedown", dragStart);

  function dragStart(e) {
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;

    if (e.target === box || e.target.classList.contains("drag-handle")) {
      isDragging = true;
      box.style.cursor = "grabbing";

      document.addEventListener("mousemove", drag);
      document.addEventListener("mouseup", dragEnd);
    }
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      setTranslate(currentX, currentY, box);
    }
  }

  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  }

  async function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
    box.style.cursor = "grab";

    document.removeEventListener("mousemove", drag);
    document.removeEventListener("mouseup", dragEnd);

    if (noteId) {
      await updateNoteInDatabase(noteId, {
        position_x: currentX,
        position_y: currentY,
      });
    }
  }

  const input = box.querySelector("input");
  input.addEventListener("input", async (e) => {
    if (noteId) {
      await updateNoteInDatabase(noteId, {
        content: e.target.value,
      });
    }
  });

  box.addEventListener("click", async (e) => {
    if (e.target === box || e.target.classList.contains("drag-handle")) {
      const newColor = randomColor();
      box.style.backgroundColor = newColor;
      if (noteId) {
        await updateNoteInDatabase(noteId, {
          color: newColor,
        });
      }
    }
  });
}

function setupRealtimeSubscription() {
  const subscription = supabaseClient
    .channel("notes-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notes",
      },
      (payload) => {
        console.log("Real-time update:", payload);

        if (payload.eventType === "INSERT") {
          const note = payload.new;
          createBoxElement(
            note.position_x,
            note.position_y,
            note.color,
            note.content,
            note.id
          );
        } else if (payload.eventType === "UPDATE") {
          const note = payload.new;
          const existingBox = document.querySelector(
            `[data-note-id="${note.id}"]`
          );

          if (existingBox) {
            existingBox.style.transform = `translate3d(${note.position_x}px, ${note.position_y}px, 0)`;

            existingBox.style.backgroundColor = note.color;

            const input = existingBox.querySelector("input");
            if (input && input.value !== note.content) {
              input.value = note.content;
            }
          }
        } else if (payload.eventType === "DELETE") {
          const noteId = payload.old.id;
          const existingBox = document.querySelector(
            `[data-note-id="${noteId}"]`
          );
          if (existingBox) {
            existingBox.remove();
          }
        }
      }
    )
    .subscribe();

  // Clean up subscription when page unloads
  window.addEventListener("beforeunload", () => {
    subscription.unsubscribe();
  });
}
