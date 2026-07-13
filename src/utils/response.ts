export const createResponse = (
  text: string,
  type: "text" = "text",
  structuredContent?: Record<string, unknown>
) => ({
  content: [
    {
      type,
      text,
    },
  ],
  ...(structuredContent ? { structuredContent } : {}),
});
