export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export function ChatTranscript({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return <p>Ask about the menu, or try “show me the desserts”.</p>;
  }

  return (
    <ul>
      {messages.map((message, index) => (
        <li key={index}>
          <strong>{message.role === "user" ? "You" : "Assistant"}:</strong>{" "}
          {message.text}
        </li>
      ))}
    </ul>
  );
}
