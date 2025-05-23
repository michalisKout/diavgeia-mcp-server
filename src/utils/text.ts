const config = [
  { find: "Ά", replace: "Α" },
  { find: "Έ", replace: "Ε" },
  { find: "Ί", replace: "Ι" },
  { find: "Ή", replace: "Η" },
  { find: "Ύ", replace: "Υ" },
  { find: "Ό", replace: "Ο" },
  { find: "Ώ", replace: "Ω" },
  { find: "A", replace: "A" },
  { find: "Y", replace: "Y" },
  { find: "ΐ", replace: "Ι" },
  { find: "ϊ", replace: "Ι" },
];

export function normalizeText(
  text: string,
  replacementMap = config,
  isExactMatch = true,
  ignoreCharacters = "",
  regExOptions = "g"
) {
  let regexString = "";
  let regex: RegExp | undefined = undefined;

  if (typeof text === "string" && text.length > 0) {
    replacementMap.forEach((replacementItem) => {
      if (isExactMatch) {
        regexString = replacementItem.find;
      } else {
        regexString = `[${replacementItem.find}]`;
      }

      if (ignoreCharacters !== "") {
        regexString = `(?![${ignoreCharacters}])${regexString}`;
      }

      regex = new RegExp(regexString, regExOptions);

      text = text.trim().replace(regex, replacementItem.replace);
    });
  }

  return text;
}

export function normalizeQuery(query: string) {
  return normalizeText(query.toUpperCase().trim()).split(" ");
}
