/* =========================================================
   PERSONAL AI - CHAT FUNCTIONALITY
   ========================================================= */


/* =========================================================
   GET HTML ELEMENTS
   ========================================================= */

const chatForm = document.getElementById("chatForm");

const messageInput = document.getElementById("messageInput");

const sendBtn = document.getElementById("sendBtn");

const attachBtn = document.getElementById("attachBtn");

const fileInput = document.getElementById("fileInput");

const filePreview = document.getElementById("filePreview");

const chatMessages = document.getElementById("chatMessages");

const welcomeSection = document.getElementById("welcomeSection");

const typingIndicator = document.getElementById("typingIndicator");

const clearMemoryBtn = document.getElementById("clearMemoryBtn");


/* =========================================================
   STATE
   ========================================================= */

let selectedFiles = [];

let isSending = false;


/* =========================================================
   PAGE LOAD
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    loadConversation();

    autoResizeTextarea();

});


/* =========================================================
   LOAD SAVED CONVERSATION
   ========================================================= */

async function loadConversation() {

    try {

        const response = await fetch("/api/history");

        if (!response.ok) {
            throw new Error("Could not load conversation.");
        }

        const data = await response.json();

        const history = data.history || [];


        /*
         * If there is previous conversation,
         * hide the welcome screen.
         */

        if (history.length > 0) {

            welcomeSection.style.display = "none";

        }


        /*
         * Display every saved message.
         */

        history.forEach(message => {

            addMessage(
                message.role,
                message.content,
                message.attachments || []
            );

        });


        scrollToBottom();

    } catch (error) {

        console.error("History loading error:", error);

    }

}


/* =========================================================
   ADD MESSAGE TO SCREEN
   ========================================================= */

function addMessage(role, content, attachments = []) {

    /*
     * Hide welcome section once conversation starts.
     */

    welcomeSection.style.display = "none";


    /*
     * Create main message wrapper.
     */

    const message = document.createElement("div");

    message.classList.add("message");

    message.classList.add(
        role === "user" ? "user" : "assistant"
    );


    /*
     * Assistant gets an AI avatar.
     */

    if (role !== "user") {

        const avatar = document.createElement("div");

        avatar.className = "ai-avatar";

        avatar.textContent = "✦";

        message.appendChild(avatar);

    }


    /*
     * Create message content.
     */

    const messageContent = document.createElement("div");

    messageContent.className = "message-content";


    /* =====================================================
       ATTACHMENTS
       ===================================================== */

    if (attachments && attachments.length > 0) {

        attachments.forEach(file => {

            const attachment = document.createElement("div");

            attachment.className = "attachment";

            attachment.textContent =
                "📄 " + (file.name || "Attached file");

            messageContent.appendChild(attachment);

        });

    }


    /* =====================================================
       MESSAGE TEXT
       ===================================================== */

    if (content) {

        const text = document.createElement("div");

        text.innerHTML = formatMessage(content);

        messageContent.appendChild(text);

    }


    message.appendChild(messageContent);

    chatMessages.appendChild(message);


    scrollToBottom();

}


/* =========================================================
   FORMAT AI MESSAGE
   ========================================================= */

function formatMessage(text) {

    /*
     * First escape HTML so AI responses cannot
     * accidentally insert HTML into the page.
     */

    let safeText = escapeHTML(text);


    /*
     * Code blocks
     */

    safeText = safeText.replace(
        /```([\s\S]*?)```/g,
        '<pre><code>$1</code></pre>'
    );


    /*
     * Inline code
     */

    safeText = safeText.replace(
        /`([^`]+)`/g,
        "<code>$1</code>"
    );


    /*
     * Bold text
     */

    safeText = safeText.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );


    /*
     * Italic text
     */

    safeText = safeText.replace(
        /(?<!\*)\*([^*]+)\*(?!\*)/g,
        "<em>$1</em>"
    );


    /*
     * Convert line breaks into HTML.
     */

    safeText = safeText.replace(/\n/g, "<br>");


    return safeText;

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(text) {

    const div = document.createElement("div");

    div.textContent = text;

    return div.innerHTML;

}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

chatForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    await sendMessage();

});


async function sendMessage() {

    /*
     * Prevent multiple requests at the same time.
     */

    if (isSending) {
        return;
    }


    const message = messageInput.value.trim();


    /*
     * Don't send completely empty messages
     * unless there is a file attached.
     */

    if (!message && selectedFiles.length === 0) {

        messageInput.focus();

        return;

    }


    isSending = true;


    /* =====================================================
       SHOW USER MESSAGE IMMEDIATELY
       ===================================================== */

    addMessage(
        "user",
        message,
        selectedFiles.map(file => ({
            name: file.name
        }))
    );


    /*
     * Prepare data for Flask.
     */

    const formData = new FormData();

    formData.append("message", message);


    selectedFiles.forEach(file => {

        formData.append("files", file);

    });


    /*
     * Clear input immediately.
     */

    messageInput.value = "";

    selectedFiles = [];

    renderFilePreview();

    autoResizeTextarea();


    /*
     * Show typing indicator.
     */

    showTyping();


    /*
     * Disable send button.
     */

    sendBtn.disabled = true;


    try {

        const response = await fetch(
            "/api/chat",
            {
                method: "POST",
                body: formData
            }
        );


        const data = await response.json();


        /*
         * Hide typing animation.
         */

        hideTyping();


        /*
         * Handle backend error.
         */

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Something went wrong."
            );

        }


        /*
         * Display Gemini response.
         */

        addMessage(
            "assistant",
            data.reply || "I couldn't generate a response.",
            []
        );


    } catch (error) {

        hideTyping();


        console.error("Chat error:", error);


        /*
         * Display friendly error message.
         */

        addMessage(
            "assistant",
            "Sorry, something went wrong. Please try again.\n\n" +
            "Error: " +
            error.message
        );

    } finally {

        isSending = false;

        sendBtn.disabled = false;

        messageInput.focus();

    }

}


/* =========================================================
   ATTACH FILE BUTTON
   ========================================================= */

attachBtn.addEventListener("click", () => {

    fileInput.click();

});


/* =========================================================
   FILE SELECTION
   ========================================================= */

fileInput.addEventListener("change", () => {

    const newFiles = Array.from(fileInput.files);


    /*
     * Add newly selected files.
     */

    selectedFiles.push(...newFiles);


    /*
     * Remove duplicate files.
     */

    selectedFiles = selectedFiles.filter(
        (file, index, array) =>
            index === array.findIndex(
                existing =>
                    existing.name === file.name &&
                    existing.size === file.size &&
                    existing.lastModified === file.lastModified
            )
    );


    renderFilePreview();


    /*
     * Reset input so selecting the same
     * file again works later.
     */

    fileInput.value = "";

});


/* =========================================================
   SHOW SELECTED FILES
   ========================================================= */

function renderFilePreview() {

    filePreview.innerHTML = "";


    if (selectedFiles.length === 0) {

        filePreview.style.display = "none";

        return;

    }


    filePreview.style.display = "flex";


    selectedFiles.forEach((file, index) => {

        const chip = document.createElement("div");

        chip.className = "file-chip";


        const name = document.createElement("span");

        name.textContent =
            "📄 " + file.name;


        const removeButton = document.createElement("button");

        removeButton.type = "button";

        removeButton.textContent = "×";

        removeButton.style.border = "none";

        removeButton.style.background = "transparent";

        removeButton.style.color = "#8d95a8";

        removeButton.style.cursor = "pointer";

        removeButton.style.fontSize = "16px";


        removeButton.addEventListener(
            "click",
            () => {

                selectedFiles.splice(index, 1);

                renderFilePreview();

            }
        );


        chip.appendChild(name);

        chip.appendChild(removeButton);

        filePreview.appendChild(chip);

    });

}


/* =========================================================
   TYPING INDICATOR
   ========================================================= */

function showTyping() {

    typingIndicator.style.display = "flex";

    scrollToBottom();

}


function hideTyping() {

    typingIndicator.style.display = "none";

}


/* =========================================================
   CLEAR MEMORY
   ========================================================= */

clearMemoryBtn.addEventListener("click", async () => {

    /*
     * Confirm before deleting memory.
     */

    const confirmed = confirm(
        "Are you sure you want to clear your conversation memory?\n\n" +
        "This will remove the saved conversation from memory.json."
    );


    if (!confirmed) {

        return;

    }


    try {

        clearMemoryBtn.disabled = true;


        const response = await fetch(
            "/api/clear",
            {
                method: "POST"
            }
        );


        const data = await response.json();


        if (!response.ok || !data.ok) {

            throw new Error(
                data.error ||
                "Could not clear memory."
            );

        }


        /*
         * Remove all messages from screen.
         */

        chatMessages.innerHTML = "";


        /*
         * Show welcome screen again.
         */

        welcomeSection.style.display = "block";


        /*
         * Clear any selected files.
         */

        selectedFiles = [];

        renderFilePreview();


        /*
         * Focus the input.
         */

        messageInput.focus();


        /*
         * Small confirmation.
         */

        console.log("Memory cleared successfully.");

    } catch (error) {

        console.error(
            "Clear memory error:",
            error
        );


        alert(
            "Could not clear memory.\n\n" +
            error.message
        );

    } finally {

        clearMemoryBtn.disabled = false;

    }

});


/* =========================================================
   ENTER TO SEND
   ========================================================= */

messageInput.addEventListener(
    "keydown",
    event => {

        /*
         * Enter = Send
         *
         * Shift + Enter = New line
         */

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendMessage();

        }

    }
);


/* =========================================================
   AUTO RESIZE TEXTAREA
   ========================================================= */

messageInput.addEventListener(
    "input",
    autoResizeTextarea
);


function autoResizeTextarea() {

    messageInput.style.height = "auto";

    messageInput.style.height =
        Math.min(
            messageInput.scrollHeight,
            150
        ) + "px";

}


/* =========================================================
   SCROLL TO BOTTOM
   ========================================================= */

function scrollToBottom() {

    setTimeout(() => {

        chatMessages.parentElement.scrollTo({
            top: chatMessages.parentElement.scrollHeight,
            behavior: "smooth"
        });

    }, 50);

}