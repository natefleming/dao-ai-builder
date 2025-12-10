import { useState, useRef, useEffect, useCallback } from 'react';
import { Copy, Check, FileCode, CheckCircle, XCircle, AlertCircle, Loader2, ChevronDown, ChevronUp, Lock, Unlock, AlertTriangle } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import { generateYAML } from '@/utils/yaml-generator';
import { useConfigValidation } from '@/hooks/useValidation';
import { extractYamlReferences, setYamlReferences } from '@/utils/yaml-references';
import { AppConfig } from '@/types/dao-ai-types';
import Button from '../ui/Button';
import yaml from 'js-yaml';

interface YamlError {
  line: number;
  message: string;
}

export default function PreviewPanel() {
  const { config, setConfig } = useConfigStore();
  const [copied, setCopied] = useState(false);
  const [showErrors, setShowErrors] = useState(true);
  const [isLocked, setIsLocked] = useState(true);
  const [editedYaml, setEditedYaml] = useState('');
  const [yamlParseError, setYamlParseError] = useState<YamlError | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  
  const { isValid, errors, schemaError, isValidating, schemaReady } = useConfigValidation(800);

  // Generate YAML from current config
  const generatedYaml = generateYAML(config);

  // Sync edited YAML with generated YAML when locked or on initial load
  useEffect(() => {
    if (isLocked) {
      setEditedYaml(generatedYaml);
      setYamlParseError(null);
      setHasUnsavedChanges(false);
    }
  }, [generatedYaml, isLocked]);

  // Initialize editedYaml on first render
  useEffect(() => {
    if (!editedYaml) {
      setEditedYaml(generatedYaml);
    }
  }, [generatedYaml, editedYaml]);

  // Sync scroll between textarea and line numbers
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(isLocked ? generatedYaml : editedYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleYamlChange = (newValue: string) => {
    setEditedYaml(newValue);
    setHasUnsavedChanges(newValue !== generatedYaml);
    
    // Try to parse YAML and validate
    try {
      yaml.load(newValue);
      setYamlParseError(null);
    } catch (e) {
      if (e instanceof yaml.YAMLException) {
        setYamlParseError({
          line: e.mark?.line ? e.mark.line + 1 : 0,
          message: e.message
        });
      }
    }
  };

  const handleApplyChanges = () => {
    if (yamlParseError) {
      return;
    }

    try {
      // Extract references before parsing
      const references = extractYamlReferences(editedYaml);
      setYamlReferences(references);
      
      // Parse and apply the YAML
      const parsed = yaml.load(editedYaml) as AppConfig;
      setConfig(parsed);
      setHasUnsavedChanges(false);
      
      // Lock the editor after applying
      setIsLocked(true);
    } catch (e) {
      console.error('Failed to apply YAML changes:', e);
    }
  };

  const handleDiscardChanges = () => {
    setEditedYaml(generatedYaml);
    setYamlParseError(null);
    setHasUnsavedChanges(false);
  };

  const handleToggleLock = () => {
    if (!isLocked && hasUnsavedChanges) {
      // Ask for confirmation before discarding changes
      if (!confirm('You have unsaved changes. Discard them?')) {
        return;
      }
      handleDiscardChanges();
    }
    setIsLocked(!isLocked);
  };

  // Get error lines for highlighting
  const getErrorLines = (): Set<number> => {
    const errorLines = new Set<number>();
    
    // Add YAML parse error line
    if (yamlParseError?.line) {
      errorLines.add(yamlParseError.line);
    }
    
    // Add validation error lines (if we can determine them)
    // Note: JSON Schema errors don't always map directly to lines
    
    return errorLines;
  };

  const errorLines = getErrorLines();

  // Render line numbers with error highlighting
  const renderLineNumbers = (content: string) => {
    const lines = content.split('\n');
    return lines.map((_, i) => {
      const lineNum = i + 1;
      const hasError = errorLines.has(lineNum);
      return (
        <div 
          key={i} 
          className={`text-right pr-3 select-none ${
            hasError 
              ? 'bg-red-500/20 text-red-400 font-bold' 
              : 'text-slate-600'
          }`}
          style={{ height: '1.5rem', lineHeight: '1.5rem' }}
        >
          {lineNum}
        </div>
      );
    });
  };

  // Simple syntax highlighting for display mode
  const highlightYAML = (content: string) => {
    return content.split('\n').map((line, i) => {
      const lineNum = i + 1;
      const hasError = errorLines.has(lineNum);
      
      let lineContent: React.ReactNode;
      
      // Comments
      if (line.trim().startsWith('#')) {
        lineContent = <span className="text-slate-500">{line}</span>;
      }
      // Keys
      else if (line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*):(.*)$/)) {
        const match = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*):(.*)$/)!;
        const [, indent, key, value] = match;
        lineContent = (
          <span>
            {indent}
            <span className="text-blue-400">{key}</span>
            <span className="text-slate-400">:</span>
            <span className="text-emerald-400">{value}</span>
          </span>
        );
      }
      // List items
      else if (line.trim().startsWith('-')) {
        lineContent = <span className="text-amber-400">{line}</span>;
      }
      else {
        lineContent = <span className="text-slate-300">{line}</span>;
      }
      
      return (
        <div 
          key={i} 
          className={`px-2 -mx-2 ${
            hasError 
              ? 'bg-red-500/20 border-l-2 border-red-500' 
              : 'hover:bg-slate-800/30'
          }`}
          style={{ height: '1.5rem', lineHeight: '1.5rem' }}
        >
          {lineContent}
        </div>
      );
    });
  };

  // Render validation status
  const renderValidationStatus = () => {
    // If there's a YAML parse error, show that first
    if (!isLocked && yamlParseError) {
      return (
        <div className="flex items-center space-x-2 text-red-400">
          <XCircle className="w-4 h-4" />
          <span className="text-xs">YAML Error (line {yamlParseError.line})</span>
        </div>
      );
    }

    if (!schemaReady) {
      return (
        <div className="flex items-center space-x-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Loading schema...</span>
        </div>
      );
    }

    if (isValidating) {
      return (
        <div className="flex items-center space-x-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Validating...</span>
        </div>
      );
    }

    if (schemaError) {
      return (
        <div className="flex items-center space-x-2 text-amber-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs" title={schemaError}>Schema error</span>
        </div>
      );
    }

    if (isValid === true) {
      return (
        <div className="flex items-center space-x-2 text-emerald-400">
          <CheckCircle className="w-4 h-4" />
          <span className="text-xs">Valid</span>
        </div>
      );
    }

    if (isValid === false) {
      return (
        <button
          onClick={() => setShowErrors(!showErrors)}
          className="flex items-center space-x-2 text-red-400 hover:text-red-300 transition-colors"
        >
          <XCircle className="w-4 h-4" />
          <span className="text-xs">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
          {showErrors ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      );
    }

    return null;
  };

  const displayContent = isLocked ? generatedYaml : editedYaml;

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <FileCode className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-300">
            YAML {isLocked ? 'Preview' : 'Editor'}
          </span>
          {!isLocked && hasUnsavedChanges && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded">
              Modified
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {renderValidationStatus()}
          
          {/* Lock/Unlock Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleLock}
            title={isLocked ? 'Unlock to edit YAML' : 'Lock to prevent edits'}
            className={!isLocked ? 'text-amber-400 hover:text-amber-300' : ''}
          >
            {isLocked ? (
              <>
                <Lock className="w-4 h-4" />
                <span className="hidden sm:inline">Locked</span>
              </>
            ) : (
              <>
                <Unlock className="w-4 h-4" />
                <span className="hidden sm:inline">Editing</span>
              </>
            )}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Edit Mode Warning */}
      {!isLocked && (
        <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-900/50">
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            <span>Edit mode: Changes here will update the UI configuration when applied</span>
          </div>
        </div>
      )}

      {/* YAML Parse Error Panel */}
      {!isLocked && yamlParseError && (
        <div className="border-b border-slate-800 bg-red-950/30 px-4 py-2">
          <div className="text-xs flex items-start space-x-2">
            <span className="text-red-400 font-mono shrink-0">Line {yamlParseError.line}:</span>
            <span className="text-red-300">{yamlParseError.message}</span>
          </div>
        </div>
      )}

      {/* Validation Errors Panel */}
      {isValid === false && showErrors && errors.length > 0 && !yamlParseError && (
        <div className="border-b border-slate-800 bg-red-950/30 max-h-48 overflow-auto">
          <div className="px-4 py-2 space-y-1">
            {errors.map((error, i) => (
              <div key={i} className="text-xs flex items-start space-x-2">
                <span className="text-red-400 font-mono shrink-0">
                  {error.path || '/'}
                </span>
                <span className="text-red-300">
                  {error.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schema Error Panel */}
      {schemaError && (
        <div className="border-b border-slate-800 bg-amber-950/30 px-4 py-2">
          <p className="text-xs text-amber-400">
            <strong>Schema Error:</strong> {schemaError}
          </p>
          <p className="text-xs text-amber-500 mt-1">
            Validation is unavailable. The YAML may still be valid.
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Line Numbers */}
        <div 
          ref={lineNumbersRef}
          className="w-12 bg-slate-900/50 border-r border-slate-800 overflow-hidden font-mono text-sm"
          style={{ lineHeight: '1.5rem' }}
        >
          <div className="py-4">
            {renderLineNumbers(displayContent)}
          </div>
        </div>
        
        {/* Code Area */}
        <div className="flex-1 overflow-auto">
          {isLocked ? (
            // Read-only highlighted view
            <pre className="code-block text-sm p-4" style={{ lineHeight: '1.5rem' }}>
              {highlightYAML(displayContent)}
            </pre>
          ) : (
            // Editable textarea
            <textarea
              ref={textareaRef}
              value={editedYaml}
              onChange={(e) => handleYamlChange(e.target.value)}
              onScroll={handleScroll}
              spellCheck={false}
              className="w-full h-full p-4 bg-transparent text-slate-300 font-mono text-sm resize-none focus:outline-none"
              style={{ 
                lineHeight: '1.5rem',
                tabSize: 2
              }}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {displayContent.split('\n').length} lines • {isLocked ? 'Auto-updates as you configure' : 'Editing manually'}
          </p>
          
          {!isLocked && hasUnsavedChanges ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDiscardChanges}
              >
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyChanges}
                disabled={!!yamlParseError}
              >
                <Check className="w-4 h-4" />
                Apply Changes
              </Button>
            </div>
          ) : (
            schemaReady && !schemaError && (
              <p className="text-xs text-slate-600">
                Validated against dao-ai schema
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
}
