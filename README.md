# EchoAI – Personal AI Chatbot

## Project Overview

EchoAI is a web-based personal AI chatbot developed using Python, Flask, HTML, CSS, and JavaScript.

The chatbot uses the Google Gemini API to understand user questions and generate responses. It also stores previous conversations so that the chatbot can use earlier messages as context during the conversation.

The main aim of this project is to create a simple personal AI assistant with conversation memory and document upload functionality.

## Objectives

- To develop a simple AI chatbot using Google Gemini.
- To create a web-based chatbot interface.
- To store and use previous conversations.
- To allow users to upload documents and ask questions about them.
- To understand how an AI API can be connected to a web application.
- To provide a simple and user-friendly interface.

## Features

### 1. AI Chat

EchoAI uses the Google Gemini API to answer questions and have a normal conversation with the user.

### 2. Conversation Memory

The chatbot saves conversations in a file called `memory.json`.

When the user asks a new question, previous conversation messages are used as context. This allows the chatbot to remember what was discussed earlier.

### 3. Document Upload

Users can upload supported documents such as:

- PDF
- DOCX
- TXT
- Markdown
- CSV
- JSON
- Other text-based files

The application extracts the text from the uploaded file and sends it to Gemini as context. This allows the chatbot to answer questions related to the uploaded document.

### 4. Clear Memory

The **Clear Memory** button removes the saved conversation from `memory.json`.

This allows the user to start a fresh conversation.

### 5. Conversation After Refresh

The chatbot can load the previously saved conversation when the webpage is refreshed.

### 6. Modern User Interface

EchoAI has a dark and modern interface with:

- Chat bubbles
- User and AI messages
- File attachment option
- Typing indicator
- Clear Memory button
- Responsive design

## Technologies Used

| Part | Technology |
|---|---|
| Programming Language | Python |
| Backend | Flask |
| AI Model | Google Gemini |
| AI Library | Google GenAI |
| Frontend | HTML, CSS, JavaScript |
| Memory Storage | JSON |
| PDF Processing | pypdf |
| Word File Processing | python-docx |
| Configuration | python-dotenv |

## How the Project Works

The basic working of EchoAI is:

1. The user enters a message in the chatbot.
2. The message is sent to the Flask backend.
3. The backend loads the previous conversation from `memory.json`.
4. The previous conversation is used as context along with the new message.
5. The request is sent to Google Gemini.
6. Gemini generates a response.
7. The response is shown on the website.
8. The new conversation is saved in `memory.json`.

In simple words:

**User → Website → Flask → Gemini → Response → Website**

## How Memory Works

EchoAI uses a simple JSON file for storing conversation memory.

For every conversation:

- User messages are stored.
- AI responses are stored.
- Previous messages can be loaded again.
- Recent conversation history is sent to Gemini as context.

This allows the chatbot to remember earlier parts of the conversation.

The project uses a simple file-based memory system instead of a separate database, which keeps the project easy to understand and suitable for a student project.

## How Document Upload Works

When a user uploads a document, the file is sent to the Flask backend.

The backend reads the text from the document.

For example:

- PDF files are processed using `pypdf`.
- DOCX files are processed using `python-docx`.
- Text-based files are read directly.

The extracted text is then given to Gemini as additional context.

For example, a user can upload a document and ask:

> "What is this document about?"

The chatbot can then use the extracted document text to answer the question.

## Error Handling

The application contains basic error handling for common problems.

For example:

- If the Gemini API request fails, an error message is returned.
- Unsupported file types are rejected.
- Problems while reading a document are handled.
- Empty messages or empty uploads are not processed.
- Problems with the saved memory file are handled by the application.

This prevents a single error from completely stopping the chatbot.

## Project Structure

```text
EchoAI/
│
├── app.py
├── requirements.txt
├── README.md
├── .gitignore
├── .env
├── memory.json
│
├── templates/
│   └── index.html
│
└── static/
    ├── style.css
    └── script.js