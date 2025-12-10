/**
 * Utility for preserving YAML anchor/alias relationships during import/export.
 * 
 * YAML anchors (&name) and aliases (*name) create references that are normally
 * resolved during parsing. This utility extracts these relationships so they
 * can be preserved when generating output YAML.
 */

export interface AnchorDefinition {
  name: string;       // The anchor name (without &)
  path: string;       // The YAML path where it's defined (e.g., "resources.llms.default_llm")
  lineNumber: number; // Line number in the original YAML
}

export interface AliasReference {
  name: string;       // The alias name (without *)
  path: string;       // The YAML path where it's used
  lineNumber: number;
}

export interface YamlReferences {
  anchors: AnchorDefinition[];
  aliases: AliasReference[];
  // Map from alias name to the paths that use it
  aliasUsage: Record<string, string[]>;
  // Map from anchor name to its definition path
  anchorPaths: Record<string, string>;
  // Map from path suffix to anchor name (for flexible matching)
  pathSuffixToAnchor: Record<string, string>;
  // Map from key path to its original anchor name (when key differs from anchor)
  // e.g., "tools.insert_coffee_order_uc_tool" -> "insert_coffee_order_tool"
  keyToAnchorName: Record<string, string>;
}

/**
 * Extract anchor and alias information from raw YAML text.
 * This should be called BEFORE yaml.load() to capture the relationships.
 */
export function extractYamlReferences(yamlText: string): YamlReferences {
  const anchors: AnchorDefinition[] = [];
  const aliases: AliasReference[] = [];
  const aliasUsage: Record<string, string[]> = {};
  const anchorPaths: Record<string, string> = {};
  const pathSuffixToAnchor: Record<string, string> = {};
  const keyToAnchorName: Record<string, string> = {};
  
  const lines = yamlText.split('\n');
  const pathStack: { indent: number; key: string }[] = [];
  // Track array indices at each level
  const arrayIndices: Map<string, number> = new Map();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;
    
    // Calculate indentation
    const indent = line.search(/\S/);
    if (indent === -1) continue;
    
    // Update path stack based on indentation
    while (pathStack.length > 0 && pathStack[pathStack.length - 1].indent >= indent) {
      pathStack.pop();
    }
    
    // Check if this is an array item (starts with -)
    const isArrayItem = /^\s*-/.test(line);
    
    // Extract key from the line (handle array items too)
    const keyMatch = line.match(/^\s*-?\s*([^:\s]+)\s*:/);
    if (keyMatch) {
      const key = keyMatch[1];
      pathStack.push({ indent, key });
      // Reset array index tracking for this path
      const newPath = pathStack.map(p => p.key).join('.');
      arrayIndices.delete(newPath);
    }
    
    // Current path (without array indices)
    const currentPath = pathStack.map(p => p.key).join('.');
    
    // For array items with aliases (like "- *genie_tool"), track the index
    let aliasPath = currentPath;
    if (isArrayItem && !keyMatch) {
      // This is a pure array item (no key:value), track its index
      const currentIndex = arrayIndices.get(currentPath) || 0;
      aliasPath = `${currentPath}.${currentIndex}`;
      arrayIndices.set(currentPath, currentIndex + 1);
    }
    
    // Find anchor definitions (&name)
    const anchorMatch = line.match(/&(\w+)/);
    if (anchorMatch) {
      const anchorName = anchorMatch[1];
      anchors.push({
        name: anchorName,
        path: currentPath,
        lineNumber: lineNum,
      });
      anchorPaths[anchorName] = currentPath;
      
      // Check if the key name differs from the anchor name
      // Pattern: "key_name: &anchor_name" where key_name != anchor_name
      if (keyMatch) {
        const keyName = keyMatch[1];
        if (keyName !== anchorName) {
          // Store the mapping from path to original anchor name
          keyToAnchorName[currentPath] = anchorName;
        }
      }
    }
    
    // Find alias references (*name) - but not within quotes or preceded by __REF__
    // Also handle cases where * is at the start of a value
    const aliasMatches = line.matchAll(/(?<!["\w])\*(\w+)(?!["'])/g);
    for (const match of aliasMatches) {
      const aliasName = match[1];
      // Skip if this is an anchor definition line (has both & and *)
      if (line.includes(`&${aliasName}`)) continue;
      
      aliases.push({
        name: aliasName,
        path: aliasPath,
        lineNumber: lineNum,
      });
      
      if (!aliasUsage[aliasName]) {
        aliasUsage[aliasName] = [];
      }
      aliasUsage[aliasName].push(aliasPath);
      
      // Store a mapping from the base path + anchor type to the alias name
      // This helps with matching "agents.X.tools.N" to the correct tool reference
      // Use a more specific key format: "parentKey.childKey=aliasName"
      const pathParts = aliasPath.split('.');
      if (pathParts.length >= 2) {
        // Store with parent context to avoid collisions
        // e.g., "agents.genie.tools.0" -> store as "genie.tools.0=genie_tool"
        const contextKey = pathParts.slice(-3).join('.');
        pathSuffixToAnchor[`${contextKey}=${aliasName}`] = aliasName;
        
        // Also store simpler suffix but include the alias name to avoid collisions
        const suffix = pathParts.slice(-2).join('.');
        pathSuffixToAnchor[`${suffix}=${aliasName}`] = aliasName;
      }
    }
  }
  
  return { anchors, aliases, aliasUsage, anchorPaths, pathSuffixToAnchor, keyToAnchorName };
}

/**
 * Store for the current YAML references.
 * This is set during import and used during export.
 */
let currentReferences: YamlReferences | null = null;

export function setYamlReferences(refs: YamlReferences | null): void {
  currentReferences = refs;
}

export function getYamlReferences(): YamlReferences | null {
  return currentReferences;
}

/**
 * Clear the stored references (e.g., when resetting config).
 */
export function clearYamlReferences(): void {
  currentReferences = null;
}

/**
 * Check if a value at a given path should be a reference (alias).
 * Uses multiple strategies to match:
 * 1. Exact path match
 * 2. Path suffix match (last 2 parts)
 * 3. Key name match (last part)
 * 
 * Returns the anchor name if it should be a reference, null otherwise.
 */
export function shouldBeReference(path: string): string | null {
  if (!currentReferences) return null;
  
  const normalizedPath = path.toLowerCase().replace(/-/g, '_');
  
  // Strategy 1: Exact path match in aliasUsage
  for (const [anchorName, paths] of Object.entries(currentReferences.aliasUsage)) {
    for (const aliasPath of paths) {
      const normalizedAliasPath = aliasPath.toLowerCase().replace(/-/g, '_');
      if (normalizedPath === normalizedAliasPath) {
        return anchorName;
      }
    }
  }
  
  // Strategy 2: Path suffix match (last 2 parts)
  const pathParts = path.split('.');
  if (pathParts.length >= 2) {
    const suffix = pathParts.slice(-2).join('.').toLowerCase().replace(/-/g, '_');
    for (const [storedSuffix, anchorName] of Object.entries(currentReferences.pathSuffixToAnchor)) {
      if (suffix === storedSuffix.toLowerCase().replace(/-/g, '_')) {
        return anchorName;
      }
    }
  }
  
  // Strategy 3: Check if any alias path ends with our path or vice versa
  for (const [anchorName, paths] of Object.entries(currentReferences.aliasUsage)) {
    for (const aliasPath of paths) {
      const normalizedAliasPath = aliasPath.toLowerCase().replace(/-/g, '_');
      if (normalizedPath.endsWith(normalizedAliasPath) || normalizedAliasPath.endsWith(normalizedPath)) {
        return anchorName;
      }
    }
  }
  
  return null;
}

/**
 * Check if a path should have an anchor definition.
 * Returns the anchor name if it should have an anchor, null otherwise.
 */
export function shouldHaveAnchor(path: string): string | null {
  if (!currentReferences) return null;
  
  for (const [anchorName, anchorPath] of Object.entries(currentReferences.anchorPaths)) {
    if (anchorPath === path) {
      return anchorName;
    }
  }
  
  return null;
}

/**
 * Merge new references into the current references.
 * Used when the user adds new items that should use references.
 */
export function addReference(anchorName: string, anchorPath: string, aliasPath: string): void {
  if (!currentReferences) {
    currentReferences = {
      anchors: [],
      aliases: [],
      aliasUsage: {},
      anchorPaths: {},
      pathSuffixToAnchor: {},
      keyToAnchorName: {},
    };
  }
  
  // Add anchor if not exists
  if (!currentReferences.anchorPaths[anchorName]) {
    currentReferences.anchorPaths[anchorName] = anchorPath;
    currentReferences.anchors.push({
      name: anchorName,
      path: anchorPath,
      lineNumber: 0,
    });
  }
  
  // Add alias usage
  if (!currentReferences.aliasUsage[anchorName]) {
    currentReferences.aliasUsage[anchorName] = [];
  }
  if (!currentReferences.aliasUsage[anchorName].includes(aliasPath)) {
    currentReferences.aliasUsage[anchorName].push(aliasPath);
    currentReferences.aliases.push({
      name: anchorName,
      path: aliasPath,
      lineNumber: 0,
    });
  }
}

/**
 * Get the original anchor name for a given path.
 * When a key like "tools.my_tool" was defined with "&different_anchor",
 * this returns "different_anchor" instead of "my_tool".
 * Returns null if no custom anchor name was defined.
 */
export function getOriginalAnchorName(path: string): string | null {
  if (!currentReferences || !currentReferences.keyToAnchorName) return null;
  return currentReferences.keyToAnchorName[path] || null;
}

/**
 * Check if a value matches a known anchor by comparing object properties.
 * This is useful when path matching fails but the values are identical.
 */
export function findMatchingAnchor(value: any, anchoredValues: Record<string, any>): string | null {
  if (!value || typeof value !== 'object') return null;
  
  for (const [anchorName, anchoredValue] of Object.entries(anchoredValues)) {
    if (deepEqual(value, anchoredValue)) {
      return anchorName;
    }
  }
  
  return null;
}

/**
 * Deep equality check for objects
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  
  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    
    return true;
  }
  
  return false;
}
