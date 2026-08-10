// Template auto-fill utility
// Replaces {{placeholders}} in template content with actual values

export function fillTemplate(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    result = result.split(placeholder).join(value ?? "");
  }
  // Strip any unreplaced placeholders
  result = result.replace(/\{\{[^}]+\}\}/g, "");
  return result;
}
