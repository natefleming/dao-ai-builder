/**
 * Utility functions for normalizing reference names across the application.
 * Reference names allow uppercase letters but spaces are converted to underscores.
 */

/**
 * Normalize a reference name for final output.
 * - Allows uppercase and lowercase letters
 * - Converts spaces and hyphens to underscores
 * - Removes invalid characters (only allows alphanumeric and underscores)
 * - Removes leading/trailing underscores
 * - Collapses multiple underscores to single
 */
export function normalizeRefName(str: string): string {
  return str
    .trim()
    // Replace spaces and hyphens with underscores
    .replace(/[\s-]+/g, '_')
    // Collapse multiple underscores to single
    .replace(/_+/g, '_')
    // Remove any characters that aren't alphanumeric or underscore
    .replace(/[^a-zA-Z0-9_]/g, '')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '');
}

/**
 * Normalize a reference name while typing.
 * Preserves trailing underscore when user types a space to allow natural typing.
 * 
 * Example: "My Ref" -> "My_Ref" (trailing underscore preserved during typing)
 */
export function normalizeRefNameWhileTyping(str: string): string {
  // Check if the string ends with a space (user is about to type next word)
  const endsWithSpace = str.endsWith(' ');
  
  let result = str
    // Replace spaces and hyphens with underscores
    .replace(/[\s-]+/g, '_')
    // Remove any characters that aren't alphanumeric or underscore
    .replace(/[^a-zA-Z0-9_]/g, '')
    // Collapse multiple underscores to single
    .replace(/_+/g, '_')
    // Remove leading underscores only
    .replace(/^_+/, '');
  
  // If original ended with space and result doesn't end with underscore, add one
  // This allows the user to naturally type "my ref" -> "my_ref"
  if (endsWithSpace && !result.endsWith('_') && result.length > 0) {
    result += '_';
  }
  
  return result;
}

