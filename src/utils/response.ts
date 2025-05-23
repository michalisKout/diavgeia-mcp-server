export const createResponse = (text: string, type: "text" = "text") => ({
  content: [
    {
      type,
      text,
    },
  ],
});
