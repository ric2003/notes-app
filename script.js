function randomColor() {
  return `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(
    Math.random() * 256
  )}, ${Math.floor(Math.random() * 256)})`;
}

function turnBoxDifferentColor(boxElement) {
  boxElement.style.backgroundColor = randomColor();
}

function createBox() {
  const container = document.querySelector(".container");
  const box = document.createElement("div");
  box.classList.add("box");
  box.style.backgroundColor = randomColor();
  box.style.position = "absolute";
  box.style.cursor = "grab";
  box.style.left = "10px";
  box.style.top = "10px";
  box.innerHTML = `
    <div class="drag-handle"></div>
    <input type="text" placeholder="Type here..." />
  `;

  // Only change color when clicking on the box itself, not the input
  box.addEventListener("click", (e) => {
    if (e.target === box || e.target.classList.contains("drag-handle")) {
      turnBoxDifferentColor(box);
    }
  });

  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

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

  function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
    box.style.cursor = "grab";

    document.removeEventListener("mousemove", drag);
    document.removeEventListener("mouseup", dragEnd);
  }

  container.appendChild(box);
}
